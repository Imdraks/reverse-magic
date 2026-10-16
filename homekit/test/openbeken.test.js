const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const net=require('node:net');
const {OpenBekenLight,validate,description}=require('../../gateway/adapters/openbeken-light');
const {OpenBekenFixture}=require('./helpers/openbeken-device');
const {DesktopManager}=require('../../gateway/desktop-manager');
const {conversionPlan}=require('../../gateway/conversion');
const lockfile=require('../node_modules/proper-lockfile');
const Client=require('hap-controller/lib/transport/ip/http-client').default;
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('OpenBeken reads are passive, white commands are confirmed and off profiles never pulse on',{timeout:10000},async()=>{
  const fixture=await new OpenBekenFixture().start(),adapter=new OpenBekenLight({host:fixture.host,profile:'cct'});
  try{
    assert.deepEqual(await adapter.read(),{on:true,brightness:60,colorTemperature:300});assert.deepEqual(fixture.writes,[]);
    assert.deepEqual(await adapter.apply({on:false,brightness:35,colorTemperature:400}),{on:false,brightness:35,colorTemperature:400});
    assert.deepEqual(fixture.writes,['Power OFF','CT 400','Dimmer 35']);
    fixture.flags|=1<<23;fixture.writes=[];
    await assert.rejects(adapter.apply({brightness:20}),/flag OpenBeken 23/);assert.deepEqual(fixture.writes,[]);assert.equal(fixture.on,false);
    await adapter.apply({on:true,brightness:20});assert.equal(fixture.on,true);
    fixture.writes=[];await adapter.apply({brightness:0});assert.deepEqual(fixture.writes,['Power OFF']);assert.equal(fixture.brightness,20);
    fixture.rejectWrites=true;await assert.rejects(adapter.apply({on:true}),/non confirmée/);
    fixture.sdk='tasmota';fixture.writes=[];await assert.rejects(adapter.apply({on:true}),/pas identifié/);assert.deepEqual(fixture.writes,[]);
    fixture.sdk='obk';await assert.rejects(adapter.apply({hue:120}),/indisponible/);
  }finally{const before=[...fixture.writes];await adapter.close();assert.deepEqual(fixture.writes,before);await fixture.close();}
});

test('OpenBeken requires private IPv4, optional admin authentication and bounded cancellation',{timeout:5000},async()=>{
  for(const host of ['http://example.com','https://192.168.1.1','http://8.8.8.8','http://user:pass@192.168.1.1','http://192.168.1.1/api/ota'])assert.throws(()=>validate({host,profile:'cct'}));
  assert.ok(!description({profile:'dimmer'}).fields.colorTemperature);
  const fixture=await new OpenBekenFixture().start();fixture.password='a private password';process.env.OBK_TEST_PASSWORD=fixture.password;
  const adapter=new OpenBekenLight({host:fixture.host,profile:'cct',passwordEnv:'OBK_TEST_PASSWORD'},{timeout:100,deadline:200});
  try{
    assert.equal((await adapter.read()).brightness,60);
    const unauthenticated=new OpenBekenLight({host:fixture.host,profile:'cct'});try{await assert.rejects(unauthenticated.read(),/accès refusé/);}finally{await unauthenticated.close();}
    fixture.silent=true;await assert.rejects(adapter.read(),/indisponible|interrompue/);
    const pending=adapter.read(),rejected=assert.rejects(pending,/arrêt|indisponible|interrompue/);
    while(!adapter.requests.size)await new Promise(resolve=>setImmediate(resolve));
    await adapter.close();await rejected;
  }finally{await adapter.close();delete process.env.OBK_TEST_PASSWORD;await fixture.close();}
});

test('two OpenBeken clients serialize partial updates to the same endpoint',{timeout:5000},async()=>{
  const fixture=await new OpenBekenFixture().start(),first=new OpenBekenLight({host:fixture.host,profile:'cct'}),second=new OpenBekenLight({host:fixture.host,profile:'cct'});
  try{
    const results=await Promise.all([first.apply({brightness:40}),second.apply({colorTemperature:250}),first.apply({on:false})]);
    assert.deepEqual(results.at(-1),{on:false,brightness:40,colorTemperature:250});assert.deepEqual(fixture.writes,['Dimmer 40','CT 250','Power OFF']);
  }finally{await first.close();await second.close();await fixture.close();}
});

test('conversion preparation never authorizes flashing, is locked by Home and has reproducible diagnostic bytes',async()=>{
  const plan=await conversionPlan({reference:'970709',firmware:'1.1.6'});assert.equal(plan.canFlash,false);assert.equal(plan.status,'variant-unverified');assert.match(plan.guide,/2\.9\.6/);assert.match(plan.guide,/Android/);
  assert.equal(crypto.createHash('sha256').update(plan.preflight).digest('hex'),plan.preflightSHA256);
  assert.equal((await conversionPlan({reference:'3001686',firmware:'2.9.6'})).canFlash,false);
  assert.equal((await conversionPlan({reference:'999999',firmware:'1.0.0'})).status,'unknown-model');
  await assert.rejects(conversionPlan({reference:'../path',firmware:'1.1.6'}));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-conversion-')),manager=await new DesktopManager(directory).init();
  try{
    const before=await fs.readFile(manager.projectFile());assert.equal((await manager.command('conversion-plan')).canFlash,false);assert.deepEqual(await fs.readFile(manager.projectFile()),before);
    manager.running={stop:async()=>{}};await assert.rejects(manager.command('conversion-plan'),/Maison est actif/);manager.running=null;
    const project=await manager.load(),storage=manager.storage(project);await fs.mkdir(storage,{recursive:true});const unlock=await lockfile.lock(storage);
    try{await assert.rejects(manager.command('conversion-plan'),/Maison est actif/);}finally{await unlock();}
    await assert.rejects(manager.command('flash-device'),/inconnue/);
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('conversion distinguishes catalogue evidence, user declarations and unknown hardware',async()=>{
  const evaluate=async data=>(await conversionPlan(data)).assessment;
  const stock=await evaluate({reference:'970709',firmware:'1.1.6'});
  assert.equal(stock.candidates[0].status,'mismatch');
  assert.equal(stock.candidates[0].checks[1].status,'mismatch');
  assert.equal(stock.candidates[0].checks[2].status,'unknown');
  assert.equal(stock.testimony.verified,false);assert.equal(stock.detectedChip,null);
  const incomplete=await evaluate({reference:'3001686',firmware:'2.9.6'});
  assert.equal(incomplete.candidates[0].status,'incomplete');
  const declared=await evaluate({reference:'970709',firmware:'2.9.6',module:'WBLC5'});
  assert.equal(declared.candidates[0].status,'candidate');assert.equal(declared.inputs.origin,'user-declared');
  const differentModule=await evaluate({reference:'970709',firmware:'2.9.6',module:'ESP8266'});
  assert.equal(differentModule.candidates[0].status,'mismatch');assert.equal(differentModule.candidates[0].checks[2].status,'mismatch');
  const unknown=await evaluate({reference:'999999',firmware:'2.9.6',module:'WBLC5'});
  assert.deepEqual(unknown.candidates,[]);assert.equal(unknown.testimony,null);
  for(const report of [stock,incomplete,declared,differentModule,unknown]){
    assert.equal(report.canFlash,false);assert.equal(report.detectedChip,null);assert.deepEqual(report.attempts,[]);assert.ok(report.blockers.length>=2);
  }
  for(const module of ['../WBLC5','$(id)','WBLC5\n','A'.repeat(33),{},null])await assert.rejects(conversionPlan({module}));
});

test('migration to OpenBeken verifies the real device before save and preserves HomeKit identity, room and backup',{timeout:20000},async()=>{
  const {TuyaDeviceFixture}=require('./helpers/tuya-device');
  const tuya=await new TuyaDeviceFixture('3.5',{20:true,21:'white',22:600,23:500}).start();
  const obk=await new OpenBekenFixture().start(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-migrate-'));
  const manager=await new DesktopManager(directory).init();let client;
  try{
    const project=await manager.load();project.config.port=await port();await manager.save(project);
    const saved=await manager.command('save-device',{name:'Filament',room:'Salon',adapter:'lsc-tuya-light',options:{ip:'127.0.0.1',port:tuya.server.address().port,version:'3.5',profile:'white-v2'},credentials:{deviceId:'test-owned-light',localKey:'0123456789abcdef'}}),id=saved.devices[0].id;
    await manager.command('start');const pairing=await manager.command('pairing');
    const firstIdentity=JSON.parse(await fs.readFile(path.join(manager.storage(await manager.load()),'identity.json'),'utf8'));
    client=new Client(firstIdentity.username,'127.0.0.1',project.config.port);await client.pairSetup(pairing.code);
    const findAccessory=accessories=>accessories.accessories.find(a=>a.services.some(s=>s.characteristics.some(c=>c.type.startsWith('00000030-')&&c.value===id)));
    const beforeAccessory=findAccessory(await client.getAccessories()),credentials=client.getLongTermData();
    await client.close();client=undefined;await manager.command('stop');
    const identity=await fs.readFile(path.join(manager.storage(await manager.load()),'identity.json'));
    const backup=await manager.command('backup',{password:'a long protected migration backup'});
    const draft={id,name:'Filament',room:'Salon',adapter:'openbeken-light',options:{host:obk.host,profile:'cct'}};
    obk.sdk='other';await assert.rejects(manager.command('save-device',draft),/inaccessible/);assert.equal((await manager.snapshot()).devices[0].adapter,'lsc-tuya-light');
    obk.sdk='obk';const migrated=await manager.command('save-device',draft);assert.equal(migrated.devices[0].id,id);assert.equal(migrated.devices[0].room,'Salon');assert.deepEqual((await manager.load()).secrets,{});assert.deepEqual(obk.writes,[]);
    assert.deepEqual(await fs.readFile(path.join(manager.storage(await manager.load()),'identity.json')),identity);
    await manager.command('start');assert.equal((await manager.command('pairing')).code,pairing.code);
    client=new Client(firstIdentity.username,'127.0.0.1',project.config.port,credentials);
    const afterAccessory=findAccessory(await client.getAccessories());assert.equal(afterAccessory.aid,beforeAccessory.aid);
    const chars=afterAccessory.services.flatMap(s=>s.characteristics),ct=chars.find(c=>c.type.startsWith('000000CE-'));
    assert.ok(!chars.some(c=>c.type.startsWith('00000013-')),'a white filament must not advertise RGB');
    await client.setCharacteristics({[`${afterAccessory.aid}.${ct.iid}`]:400});assert.equal(obk.ct,400);
    await assert.rejects(manager.command('conversion-plan'),/Maison est actif/);await client.close();client=undefined;await manager.command('stop');
    assert.ok((await manager.command('apply',{id,patch:{colorTemperature:350}})).results[0].ok);assert.equal(obk.ct,350);
    await manager.command('restore',{backup:backup.backup,password:'a long protected migration backup'});assert.equal((await manager.snapshot()).devices[0].adapter,'lsc-tuya-light');assert.equal(Object.keys((await manager.load()).secrets).length,2);
  }finally{if(client)await client.close();await manager.close();await tuya.close();await obk.close();await fs.rm(directory,{recursive:true,force:true});}
});
