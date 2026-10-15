const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const {once}=require('node:events');
const {DesktopManager}=require('../../gateway/desktop-manager');
const lockfile=require('../node_modules/proper-lockfile');

test('desktop bridge: real HTTP light, server-side Home lock, rooms, partial groups, encrypted identity backup and restore', {timeout:30000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-desktop-'));let on=true;const writes=[];
  const server=http.createServer((request,response)=>{const url=new URL(request.url,'http://localhost');if(url.searchParams.has('turn')){on=url.searchParams.get('turn')==='on';writes.push(on);}response.end(JSON.stringify({ison:on}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const manager=await new DesktopManager(directory,{gatewayFactory:(config,storage,options)=>new(require('../../gateway/desktop-runtime').DesktopRuntime)(config,storage,{...options,bind:'127.0.0.1'})}).init();
  try{
    const project=await manager.load();project.config.port=port;await manager.save(project);
    const draft={name:'Lampe salon',room:'Salon',adapter:'shelly-gen1-relay',options:{host:`http://127.0.0.1:${server.address().port}`,channel:0}};
    assert.equal((await manager.command('test-device',{draft})).ok,true);assert.deepEqual(writes,[]);
    const saved=await manager.command('save-device',draft),id=saved.devices[0].id;
    await manager.command('start');assert.deepEqual(writes,[],'starting Home must not command a Shelly');
    const identity=await fs.readFile(path.join(manager.storage(await manager.load()),'identity.json'));
    for(const action of ['save-device','remove-device','settings','test-device','refresh-devices','apply','apply-group','backup','restore'])await assert.rejects(manager.command(action,{...draft,id,on:false,patch:{on:false},password:'a long phrase to protect'}),/Maison est actif/);
    assert.deepEqual(writes,[],'API calls bypassing disabled controls must still be blocked');
    const external=await new DesktopManager(directory).init();assert.equal((await external.snapshot()).external,true);
    await assert.rejects(external.command('save-device',draft),/Maison est actif/);await assert.rejects(external.command('stop'),/autre processus/);
    assert.match((await manager.command('pairing')).image,/^data:image\/png;base64,/);
    await manager.command('stop');
    const edited=await manager.command('save-device',{...draft,id,name:'Lecture',room:'Bureau'});assert.equal(edited.devices[0].id,id);assert.equal(edited.devices[0].room,'Bureau');
    assert.ok((await manager.command('apply-group',{room:'Bureau',on:false})).results[0].ok);assert.deepEqual(writes,[false]);
    await manager.command('save-device',{name:'Hors ligne',room:'Bureau',adapter:'shelly-gen1-relay',options:{host:'http://127.0.0.1:1',channel:0}});
    const partial=await manager.command('apply-group',{room:'Bureau',on:true});assert.equal(partial.results.filter(x=>x.ok).length,1);assert.equal(partial.results.filter(x=>!x.ok).length,1);
    await manager.command('remove-device',{id:(await manager.snapshot()).devices.find(x=>x.id!==id).id});
    const password='a sufficiently long passphrase',backup=await manager.command('backup',{password});assert.equal(JSON.parse(backup.backup).format,'lantern-backup-1');assert.ok(!backup.backup.includes('Lecture'));assert.ok(!backup.backup.includes(JSON.parse(identity).pincode));
    await manager.command('remove-device',{id});
    await assert.rejects(manager.command('restore',{backup:backup.backup,password:'the wrong passphrase'}),/Aucune donnée modifiée/);assert.equal((await manager.snapshot()).devices.length,0);
    const restored=await manager.command('restore',{backup:backup.backup,password});assert.equal(restored.devices[0].id,id);assert.equal(restored.devices[0].name,'Lecture');assert.deepEqual(await fs.readFile(path.join(manager.storage(await manager.load()),'identity.json')),identity);
    const release=await lockfile.lock(manager.storage(await manager.load()));try{await assert.rejects(manager.command('restore',{backup:backup.backup,password}),/Maison est actif/);}finally{await release();}
    await manager.command('start');assert.deepEqual(await fs.readFile(path.join(manager.storage(await manager.load()),'identity.json')),identity);await manager.command('stop');
    assert.match((await manager.snapshot()).serviceUnit,/UMask=0077/);
    if(process.platform!=='win32')assert.equal((await fs.stat(manager.projectFile())).mode&0o777,0o600);
  }finally{await manager.close();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});

test('desktop credentials stay private, profile is validated, edits preserve device ID and secrets are pruned',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-credentials-'));
  const manager=await new DesktopManager(directory,{adapterFactory:()=>({read:async()=>({on:true}),probe:async()=>({dps:[{id:20,type:'boolean'}]}),close:async()=>{}})}).init();
  try{
    const draft={name:'LSC',room:'Chambre',adapter:'lsc-tuya-light',options:{ip:'192.168.1.30',version:'3.5',profile:'white-v2'},credentials:{deviceId:'private-device-123',localKey:'private-key-1234'}};
    await assert.rejects(manager.command('save-device',{...draft,credentials:{...draft.credentials,localKey:'short'}}),/16 octets/);
    const state=await manager.command('save-device',draft),device=state.devices[0];
    assert.ok(!JSON.stringify(state).includes(draft.credentials.deviceId));assert.ok(!JSON.stringify(state).includes(draft.credentials.localKey));
    assert.deepEqual(device.fields,['on','brightness','colorTemperature']);
    await manager.command('save-device',{...device,name:'Nouveau nom',room:'Bureau'});assert.equal(Object.keys((await manager.load()).secrets).length,2);
    const probe=await manager.command('test-device',{id:device.id,probe:true});assert.equal(probe.details.dps[0].id,20);
    const encrypted=await manager.command('backup',{password:'protect this local credential'});
    assert.ok(!encrypted.backup.includes(draft.credentials.localKey));
    await manager.command('remove-device',{id:device.id});assert.deepEqual((await manager.load()).secrets,{});
    await manager.command('restore',{backup:encrypted.backup,password:'protect this local credential'});
    assert.ok(Object.values((await manager.load()).secrets).includes(draft.credentials.localKey));
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('desktop private RPC starts, persists settings, reports errors and exits at stdin EOF', {timeout:10000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-desktop-rpc-'));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../../gateway/desktop-worker.js'),directory],{stdio:['pipe','pipe','pipe']});const exited=once(child,'exit');const lines=readline.createInterface({input:child.stdout});
  const replies=new Map();let pendingResolve;const wait=async id=>{if(replies.has(id))return replies.get(id);return new Promise(resolve=>pendingResolve={id,resolve});};
  lines.on('line',line=>{const reply=JSON.parse(line);if(reply.kind==='response'){replies.set(reply.id,reply);if(pendingResolve?.id===reply.id)pendingResolve.resolve(reply);}});
  try{
    child.stdin.write(JSON.stringify({id:1,action:'settings',data:{name:'Mon pont'}})+'\n');assert.equal((await wait(1)).ok,true);
    child.stdin.write(JSON.stringify({id:2,action:'start',data:{}})+'\n');assert.equal((await wait(2)).ok,false);
    child.stdin.end();assert.equal((await exited)[0],0);
    const next=await new DesktopManager(directory).init();assert.equal((await next.snapshot()).config.name,'Mon pont');await next.close();
  }finally{child.kill();lines.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('quitting during bridge startup cancels an outstanding physical read and closes the child', {timeout:10000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-start-cancel-'));let reading;const requested=new Promise(resolve=>reading=resolve);
  const relay=http.createServer(()=>reading());await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const manager=await new DesktopManager(directory).init();
  try{
    const project=await manager.load();project.config.port=port;await manager.save(project);
    await manager.command('save-device',{name:'Waiting light',adapter:'shelly-gen1-relay',options:{host:`http://127.0.0.1:${relay.address().port}`,channel:0}});
    const starting=manager.command('start'),rejected=assert.rejects(starting,/Impossible de démarrer/);
    await requested;const before=Date.now();await manager.close();await rejected;assert.ok(Date.now()-before<2500,'shutdown should cancel the read rather than wait for its deadline');
    assert.equal(await manager.external(await manager.load()),false);
  }finally{await manager.close();await new Promise(resolve=>relay.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
});
