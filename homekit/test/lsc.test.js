const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const Client=require('hap-controller/lib/transport/ip/http-client').default;
const {TuyaDeviceFixture}=require('./helpers/tuya-device');
const {LscTuya}=require('../../gateway/adapters/lsc-tuya');
const {encodeColor,decode,encode}=require('../../gateway/adapters/lsc-codec');
const {validateConfig}=require('../../gateway/config');
const {Gateway}=require('../../gateway/runtime');
const {spawn}=require('node:child_process');
const modern={20:true,21:'white',22:505,23:500,24:'000003e803e8'};
function options(fixture,profile='rgbcct-v2'){return {ip:'127.0.0.1',port:fixture.port,deviceIdEnv:'LANTERN_TEST_LSC_ID',localKeyEnv:'LANTERN_TEST_LSC_KEY',version:fixture.version,profile};}
process.env.LANTERN_TEST_LSC_ID='test_device_123456';process.env.LANTERN_TEST_LSC_KEY='0123456789abcdef';

test('LSC profiles validate secrets by name, duplicate devices, DP boundaries and real color encodings',()=>{
  assert.equal(encodeColor(0,100,100,'hsv'),'000003e803e8');assert.equal(encodeColor(120,100,100,'hsv'),'007803e803e8');
  assert.equal(encodeColor(0,100,100,'rgbhsv'),'ff00000000ffff');assert.equal(encodeColor(120,100,100,'rgbhsv'),'00ff000078ffff');
  const opts=options({port:6668,version:'3.3'}),device={id:'lampe',name:'Lampe',adapter:'lsc-tuya-light',options:opts};
  const config={version:1,id:'maison',name:'Maison',port:51828,devices:[device]};assert.equal(validateConfig(config),config);
  for(const patch of [{localKey:'secret'},{version:'9.9'},{profile:'automatic-all-lsc'},{dps:{on:22}},{dps:{on:256}}])assert.throws(()=>validateConfig({...config,devices:[{...device,options:{...opts,...patch}}]}));
  assert.throws(()=>validateConfig({...config,devices:[device,{...device,id:'deuxieme'}]}));
  assert.throws(()=>encode(opts,{hue:120,colorTemperature:250},modern));
  assert.throws(()=>decode(opts,{...modern,24:'bad'}));
  const legacy={1:true,2:'colour',3:255,4:255,5:'00ff000078ffff'};assert.equal(decode({...opts,profile:'rgbcct-v1'},legacy).hue,120);
  assert.equal(decode({...opts,profile:'white-v1'},{1:true,2:'white',3:25,4:0}).brightness,1);
  const rgb={20:true,21:'colour',24:'007803e803e8'};
  assert.equal(decode({...opts,profile:'rgb-v2'},rgb).brightness,100);
  assert.equal(encode({...opts,profile:'rgb-v2'},{brightness:35},rgb)[24],'007803e8015e');
  assert.deepEqual(encode({...opts,profile:'dimmer-v2'},{brightness:0},{20:true,22:505}),{20:false});
  assert.deepEqual(encode({...opts,profile:'white-v2',dps:{mode:null}},{brightness:100},{20:true,22:10,23:0}),{22:1000});
});

for(const version of ['3.1','3.3','3.4','3.5'])test(`LSC actual Tuya TCP ${version}: encrypted writes, read-only probe and RGB/CCT confirmation`,{timeout:20000},async()=>{
  const fixture=await new TuyaDeviceFixture(version,{...modern,1:true,2:true}).start();
  const light=new LscTuya(options(fixture));
  try{
    assert.equal((await light.read()).on,true);assert.deepEqual(fixture.writes,[]);
    const diagnostic=await light.probe();assert.deepEqual(diagnostic.candidates,['rgbcct-v2']);assert.doesNotMatch(JSON.stringify(diagnostic),/0123456789abcdef|test_device/);
    await light.apply({hue:120,saturation:100,brightness:35});assert.equal(fixture.dps[24],'007803e8015e');
    assert.equal(fixture.dps[21],'colour');assert.equal(fixture.dps[20],true);
    await light.apply({colorTemperature:370});assert.equal(fixture.dps[21],'white');assert.ok(fixture.dps[23]<5);
    await light.apply({on:false});assert.equal(fixture.dps[20],false);
    const count=fixture.writes.length;fixture.dps[20]=false;await light.read();assert.equal(fixture.writes.length,count,'reads and reconnects never replay commands');
    fixture.rejectWrites=true;await assert.rejects(light.apply({on:true}));
    if(['3.4','3.5'].includes(version))assert.ok(fixture.sessions>=5,'session keys negotiated for each operation');
    if(version==='3.5'){
      assert.equal(fixture.reusedNonces,0,'GCM IVs must not repeat with the same key, including handshake bursts');
      process.env.LANTERN_TEST_LSC_KEY='fedcba9876543210';
      const wrong=new LscTuya(options(fixture),{timeout:600});
      try{await assert.rejects(wrong.probe(),error=>!/(fedcba9876543210|0123456789abcdef|test_device)/.test(error.message));assert.equal(wrong.children.size,0);}
      finally{await wrong.close();process.env.LANTERN_TEST_LSC_KEY='0123456789abcdef';}
    }
  }finally{await light.close();await fixture.close();}
});

test('LSC timeout and close terminate child retries before returning',{timeout:10000},async()=>{
  const fixture=await new TuyaDeviceFixture('3.3',modern).start();fixture.silentAfterWrite=true;
  const adapter=new LscTuya(options(fixture),{timeout:1500});
  try{
    await assert.rejects(adapter.apply({on:false}));assert.equal(adapter.children.size,0);const writes=fixture.writes.length;assert.equal(writes,1);
    fixture.silentAfterWrite=false;await new Promise(resolve=>setTimeout(resolve,220));assert.equal(fixture.writes.length,writes);
    fixture.silent=true;const operation=adapter.read();
    while(!adapter.children.size)await new Promise(resolve=>setImmediate(resolve));
    await adapter.close();await assert.rejects(operation);assert.equal(adapter.children.size,0);
  }finally{await adapter.close();await fixture.close();}
});

test('standalone CLI probe needs no guessed light profile and never reveals credentials or writes',{timeout:10000},async()=>{
  const fixture=await new TuyaDeviceFixture('3.5',modern).start();
  const child=spawn(process.execPath,[path.resolve(__dirname,'../../gateway/cli.js'),'probe','--ip','127.0.0.1','--port',String(fixture.port),'--device-id-env','LANTERN_TEST_LSC_ID','--local-key-env','LANTERN_TEST_LSC_KEY','--version','3.5'],{stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
  try{const code=await new Promise(resolve=>child.once('close',resolve));assert.equal(code,0,errors);assert.deepEqual(JSON.parse(output).candidates,['rgbcct-v2']);assert.doesNotMatch(output,/0123456789abcdef|test_device_123456/);assert.deepEqual(fixture.writes,[]);}
  finally{child.kill();await fixture.close();}
});

test('legacy RGB, cold/warm limits and multiple lights sharing an endpoint use one LAN session at a time',{timeout:10000},async()=>{
  const fixture=await new TuyaDeviceFixture('3.3',{1:true,2:'colour',3:255,4:255,5:'ff00000000ffff'}).start();
  const first=new LscTuya(options(fixture,'rgbcct-v1')),second=new LscTuya(options(fixture,'rgbcct-v1'));
  let maximum=0;const sample=setInterval(()=>maximum=Math.max(maximum,fixture.sockets.size),1);
  try{
    await Promise.all([first.read(),second.read(),first.read()]);assert.ok(maximum<=1);
    await first.apply({hue:120,saturation:100,brightness:100});assert.equal(fixture.dps[5],'00ff000078ffff');
    await first.apply({colorTemperature:154});assert.ok(fixture.dps[4]>=254);
    await first.apply({colorTemperature:370});assert.ok(fixture.dps[4]<=1);
  }finally{clearInterval(sample);await first.close();await second.close();await fixture.close();}
});

test('encrypted HomeKit bridge publishes only lighting functions appropriate to RGB/CCT, white-only and dimmer profiles',{timeout:30000},async()=>{
  const fixture=await new TuyaDeviceFixture('3.3',{...modern,120:true,121:'white',122:505,123:500,220:true,222:505}).start();
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-lsc-'));
  const config={version:1,id:'lsc',name:'LSC Test',port,devices:[
    {id:'rgb',name:'Ampoule RGB',adapter:'lsc-tuya-light',options:options(fixture)},
    {id:'white',name:'Blanc reglable',adapter:'lsc-tuya-light',options:{...options(fixture,'white-v2'),dps:{on:120,mode:121,brightness:122,temperature:123}}},
    {id:'dimmer',name:'Variateur',adapter:'lsc-tuya-light',options:{...options(fixture,'dimmer-v2'),dps:{on:220,brightness:222}}},
  ]};
  const gateway=new Gateway(config,directory,{bind:'127.0.0.1'});let client;
  try{
    await gateway.start();assert.deepEqual(fixture.writes,[]);
    const identity=JSON.parse(await fs.readFile(path.join(directory,'identity.json'),'utf8'));client=new Client(identity.username,'127.0.0.1',port);await client.pairSetup(identity.pincode);
    const list=(await client.getAccessories()).accessories;assert.equal(list.length,4);
    const find=id=>list.find(a=>a.services.some(s=>s.characteristics.some(c=>c.type.startsWith('00000030-')&&c.value===id)));
    const key=(id,type)=>{const a=find(id);const characteristic=a.services.flatMap(s=>s.characteristics).find(c=>c.type.startsWith(type));return `${a.aid}.${characteristic.iid}`;};
    const hue=key('rgb','00000013-'),sat=key('rgb','0000002F-'),brightness=key('rgb','00000008-'),ct=key('rgb','000000CE-');
    await client.setCharacteristics({[hue]:120,[sat]:100,[brightness]:35});assert.equal(fixture.dps[24],'007803e8015e');
    await client.setCharacteristics({[ct]:250});assert.equal(fixture.dps[21],'white');
    const white=find('white').services.flatMap(service=>service.characteristics);
    assert.ok(white.some(c=>c.type.startsWith('000000CE-')));assert.ok(!white.some(c=>c.type.startsWith('00000013-')),'white-only profile must not advertise color');
    const dimmer=find('dimmer').services.flatMap(service=>service.characteristics);assert.ok(!dimmer.some(c=>c.type.startsWith('000000CE-')));
    fixture.dps[24]='bad';const offline=await client.getCharacteristics([hue]);assert.equal(offline.characteristics[0].status,-70402);
    await client.setCharacteristics({[key('white','00000008-')]:70});assert.equal(fixture.dps[122],700);assert.equal(fixture.dps[120],true);
    await client.close();client=undefined;
  }finally{if(client)await client.close();await gateway.stop();await fixture.close();await fs.rm(directory,{recursive:true,force:true});}
});
