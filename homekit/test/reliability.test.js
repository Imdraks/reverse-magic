const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {BackupVault}=require('../../gateway/backup-vault');
const {DesktopManager}=require('../../gateway/desktop-manager');
const {Updates}=require('../../gateway/updates');
const {Gateway}=require('../../gateway/runtime');
const {adapters}=require('../../gateway/registry');

test('automatic backups keep only a public key, rotate, reject tampering and restore the same project',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-vault-')),manager=await new DesktopManager(directory).init();
  try{
    const secret='a recovery password kept separately';
    const prepared=await manager.command('auto-backup-prepare',{password:secret});
    assert.equal((await manager.snapshot()).backup.enabled,false);
    await assert.rejects(manager.command('auto-backup-enable'),/conservez/);
    await manager.command('auto-backup-enable',{savedRecovery:true});
    const before=await manager.load();
    for(let i=0;i<8;i++)await manager.command('settings',{name:'Bridge '+i});
    const status=(await manager.snapshot()).backup;assert.equal(status.count,7);
    const publicBytes=await fs.readFile(manager.vault.keyFile,'utf8');assert.ok(!publicBytes.includes('PRIVATE KEY'));assert.ok(!publicBytes.includes(secret));
    const saved=await fs.readFile(path.join(manager.vault.directory,status.latest),'utf8');
    assert.ok(!saved.includes('Bridge 7'));assert.ok(!saved.includes('project.json'));
    await assert.rejects(manager.command('restore',{backup:saved,recoveryKey:prepared.recovery,password:'incorrect recovery password'}),/Aucune donnée modifiée/);
    const damaged=JSON.parse(saved);damaged.tag=Buffer.alloc(16).toString('base64');
    await assert.rejects(manager.command('restore',{backup:JSON.stringify(damaged),recoveryKey:prepared.recovery,password:secret}),/Aucune donnée modifiée/);
    await manager.command('restore',{backup:saved,recoveryKey:prepared.recovery,password:secret});
    assert.equal((await manager.load()).config.id,before.config.id);assert.equal((await manager.load()).config.name,'Bridge 6');
    const otherVault=new BackupVault(directory);assert.equal((await otherVault.snapshot()).enabled,true,'encryption survives process restart without the password');
    manager.running={stop:async()=>{}};
    for(const action of ['auto-backup-prepare','auto-backup-enable','auto-backup-now','restore','update-download'])await assert.rejects(manager.command(action),/Maison est actif/);
    manager.running=null;
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('bridge crash schedules a restart, keeps Home locked and a deliberate stop cancels recovery',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-restart-'));let callbacks;
  const manager=await new DesktopManager(directory,{gatewayFactory:(config,storage,options)=>{callbacks=options;return {start:async()=>{},stop:async()=>{}};}}).init();
  try{
    await manager.command('save-device',{name:'Local light',adapter:'shelly-gen1-relay',options:{host:'http://127.0.0.1',channel:0}});
    await manager.command('start');callbacks.onExit();
    assert.equal((await manager.snapshot()).restarting,true);assert.equal((await manager.snapshot()).active,true);
    await assert.rejects(manager.command('settings',{name:'Changed while restarting'}),/Maison est actif/);
    const report=await manager.command('health-report');assert.ok(!JSON.stringify(report).includes('127.0.0.1'));assert.ok(!JSON.stringify(report).includes('Local light'));
    await manager.command('stop');assert.equal((await manager.snapshot()).active,false);assert.equal(manager.restartTimer,null);
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('background reads coalesce, limit concurrency and back off failed devices without sending commands',async()=>{
  let active=0,peak=0,reads=0;const state={closed:false,devices:Array.from({length:10},(_,i)=>({id:String(i),engine:{online:false,refresh:async()=>{active++;peak=Math.max(peak,active);reads++;await new Promise(setImmediate);active--;}}})),onStatus:()=>{}};
  await Promise.all([Gateway.prototype.refresh.call(state),Gateway.prototype.refresh.call(state)]);
  assert.equal(reads,10);assert.equal(peak,4);assert.ok(state.devices.every(d=>d.failures===1&&d.nextProbe>Date.now()));
  await Gateway.prototype.refresh.call(state);assert.equal(reads,10,'no retry before its deadline');
  for(const device of state.devices)device.nextProbe=0;
  await Gateway.prototype.refresh.call(state);assert.equal(reads,20);assert.ok(state.devices.every(d=>d.failures===2));
});

test('update staging verifies size, SHA-256, repository and redirect hosts before making a package available',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-update-'));
  const name='LanternDirect-Linux-arm64.tar.gz',payload=Buffer.from('a fake package for integrity checks'),hash=crypto.createHash('sha256').update(payload).digest('hex');
  const prefix='https://github.com/Imdraks/reverse-magic/releases/download/v9.0.0/';
  let tamper=false,redirect=false,preview=false;
  const fetcher=async url=>{
    if(url.startsWith('https://api.github.com/'))return new Response(JSON.stringify([{tag_name:'v9.0.0',prerelease:preview,draft:false,assets:[{name,size:payload.length,digest:'sha256:'+hash,browser_download_url:prefix+name},{name:'SHA256SUMS.txt',browser_download_url:prefix+'SHA256SUMS.txt'}]}]));
    if(url===prefix+'SHA256SUMS.txt')return new Response(hash+'  '+name+'\n');
    assert.equal(url,prefix+name);
    if(redirect)return new Response(null,{status:302,headers:{Location:'https://untrusted.example/payload'}});
    return new Response(tamper?Buffer.alloc(payload.length):payload);
  };
  const updates=new Updates(directory,{fetcher,platform:'linux',arch:'arm64'});
  try{
    const staged=await updates.stage();assert.equal(staged.installed,false);assert.equal(staged.sha256,hash);assert.deepEqual(await fs.readFile(staged.path),payload);
    tamper=true;await assert.rejects(updates.stage(),/Intégrité/);assert.deepEqual(await fs.readFile(staged.path),payload);
    tamper=false;redirect=true;await assert.rejects(updates.stage(),/Destination/);assert.ok(!(await fs.readdir(updates.directory)).some(name=>name.endsWith('.part')));
    preview=true;assert.equal((await updates.check()).available,false);assert.equal((await updates.check({includePrerelease:true})).available,true);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('update staging requires a backup and health remains readable while Home controls the bridge',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-update-lock-'));let downloads=0;
  const manager=await new DesktopManager(directory,{updates:{check:async()=>({available:false}),stage:async()=>{downloads++;return {verified:true,installed:false};}}}).init();
  try{
    await assert.rejects(manager.command('update-download'),/sauvegarde/);assert.equal(downloads,0);
    await manager.command('backup',{password:'a sufficiently long password'});await manager.command('update-download');assert.equal(downloads,1);
    await manager.command('settings',{name:'A different configuration'});await assert.rejects(manager.command('update-download'),/sauvegarde/);
    manager.running={stop:async()=>{}};assert.equal((await manager.command('health-report')).bridge,'running');assert.equal((await manager.command('update-check')).available,false);
    await assert.rejects(manager.command('update-download'),/Maison est actif/);manager.running=null;
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('lighting endpoints reject public IPs, metadata addresses and hostnames before using credentials',()=>{
  for(const host of ['http://8.8.8.8','http://example.com','http://169.254.169.254','http://127.0.0.1/path']){
    assert.throws(()=>adapters['shelly-gen1-relay'].validate({host,channel:0}));assert.throws(()=>adapters['openbeken-light'].validate({host,profile:'cct'}));
  }
  assert.throws(()=>adapters['lsc-tuya-light'].validate({ip:'8.8.8.8',deviceIdEnv:'DEVICE_ID',localKeyEnv:'LOCAL_KEY',version:'3.3',profile:'white-v2'}));
});

test('systemd paths preserve literal dollar and percent characters without variable expansion',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-unit-')),directory=path.join(parent,'$LANTERN%scope');
  const manager=await new DesktopManager(directory).init();
  try{const unit=(await manager.snapshot()).serviceUnit;assert.ok(unit.includes('$$LANTERN%%scope'));assert.ok(unit.includes('NoNewPrivileges=true'));assert.ok(unit.includes('StartLimitBurst=6'));}
  finally{await manager.close();await fs.rm(parent,{recursive:true,force:true});}
});
