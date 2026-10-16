const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {DesktopManager}=require('../../gateway/desktop-manager');
const {TuyaDeviceFixture}=require('./helpers/tuya-device');
const {modelCatalog}=require('../../gateway/model-catalog');

for(const version of ['3.4','3.5'])test(`address recovery ${version}: authenticates a new endpoint without light writes or identity changes`,{timeout:20000},async()=>{
  const fixture=await new TuyaDeviceFixture(version,{20:true,21:'white',22:600,23:500}).start();
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-address-'));let announcements=[],searches=0,startedConfig;
  const manager=await new DesktopManager(directory,{discovery:async()=>{searches++;return {devices:announcements};},gatewayFactory:config=>({start:async()=>{startedConfig=structuredClone(config);},stop:async()=>{}})}).init();
  try{
    const saved=await manager.command('save-device',{name:'Owned light',room:'Salon',adapter:'lsc-tuya-light',options:{ip:'127.0.0.2',port:fixture.server.address().port,version,profile:'white-v2'},credentials:{deviceId:'owned-light-123',localKey:'0123456789abcdef'}});
    const before=await manager.load(),id=saved.devices[0].id;
    const profileDirectory=path.join(manager.storage(before),'devices',id);
    await new (require('../../gateway/profile-store').ProfileStore)(profileDirectory,before.config.devices[0]).save({on:false,brightness:12,colorTemperature:300},{commanded:true,mode:'white'});
    const profileBytes=await fs.readFile(path.join(profileDirectory,'profile.json'));
    announcements=[{deviceId:'another-light-123',ip:'127.0.0.1',version}];
    assert.equal((await manager.command('recover-addresses')).report.changed,0);assert.equal(fixture.sessions,0);
    announcements=[{deviceId:'owned-light-123',ip:'127.0.0.1',version}];
    const project=await manager.load();project.secrets[project.config.devices[0].options.localKeyEnv]='ffffffffffffffff';await manager.save(project);
    const rejected=await manager.command('recover-addresses');assert.equal(rejected.report.results[0].status,'verification-failed');assert.equal((await manager.load()).config.devices[0].options.ip,'127.0.0.2');
    await manager.save(before);
    await manager.command('start');assert.equal(startedConfig.devices[0].options.ip,'127.0.0.1');
    const after=await manager.load();assert.equal(after.config.id,before.config.id);assert.equal(after.config.devices[0].id,id);assert.deepEqual(after.rooms,before.rooms);assert.deepEqual(after.secrets,before.secrets);assert.deepEqual(fixture.writes,[]);
    assert.deepEqual(await fs.readFile(path.join(profileDirectory,'profile.json')),profileBytes);
    const count=searches;await assert.rejects(manager.command('recover-addresses'),/Maison est actif/);assert.equal(searches,count);assert.equal((await manager.command('model-catalog')).physicalModelsVerified,0);
    await manager.command('stop');
    announcements=[{deviceId:'owned-light-123',ip:'127.0.0.2',version}];
    assert.equal((await manager.command('recover-addresses')).report.results[0].status,'original-reachable');assert.equal((await manager.load()).config.devices[0].options.ip,'127.0.0.1');
  }finally{await manager.close();await fixture.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('recovery rejects ambiguous, public, legacy and changed-protocol announcements without probing',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-address-reject-'));let devices=[],conflicts=[];
  const manager=await new DesktopManager(directory,{discovery:async()=>({devices,conflicts}),adapterFactory:()=>{throw Error('must not probe');}}).init();
  try{
    await manager.command('save-device',{name:'Owned light',adapter:'lsc-tuya-light',options:{ip:'192.168.1.10',version:'3.5',profile:'white-v2'},credentials:{deviceId:'owned-light-123',localKey:'0123456789abcdef'}});
    const before=await fs.readFile(manager.projectFile());
    const row={deviceId:'owned-light-123',ip:'192.168.1.20',version:'3.5'};
    devices=[row,{...row,ip:'192.168.1.21'}];assert.equal((await manager.command('recover-addresses')).report.results[0].status,'ambiguous');
    devices=[row];conflicts=[row.deviceId];assert.equal((await manager.command('recover-addresses')).report.results[0].status,'ambiguous');
    conflicts=[];devices=[{...row,ip:'8.8.8.8'}];assert.equal((await manager.command('recover-addresses')).report.results[0].status,'incompatible-announcement');
    devices=[{...row,version:'3.4'}];assert.equal((await manager.command('recover-addresses')).report.results[0].status,'incompatible-announcement');
    assert.deepEqual(await fs.readFile(manager.projectFile()),before);
    const project=await manager.load();project.config.devices[0].options.version='3.3';await manager.save(project);devices=[{...row,version:'3.3'}];
    assert.equal((await manager.command('recover-addresses')).report.results[0].status,'manual-required');
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('catalog separates documented variants, protocol simulations and physical validation',()=>{
  const catalog=modelCatalog();assert.equal(catalog.physicalModelsVerified,0);assert.ok(catalog.models.every(model=>model.validation!=='physical-tested'));
  assert.match(catalog.models.find(model=>model.id==='lsc-970709').limits,/1\.1\.6/);
  assert.deepEqual(catalog.models.find(model=>model.id==='lsc-3208075').profiles,[]);
  assert.ok(catalog.profiles.every(profile=>profile.validation==='simulator-tested'&&profile.physicalModelVerified===false));
});
