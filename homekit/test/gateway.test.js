const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const Client = require('hap-controller/lib/transport/ip/http-client').default;
const { Gateway } = require('../../gateway/runtime');
const { validateConfig } = require('../../gateway/config');
const { adapters } = require('../../gateway/registry');
const { MagicLantern } = require('../../gateway/adapters/magic-lantern');

test('configuration rejects duplicate identities/targets, executable plugins and embedded credentials', () => {
  const light={id:'salon',name:'Salon',adapter:'magic-lantern-ble',options:{address:'AA:BB:CC:DD:EE:FF'}};
  const base={version:1,id:'maison',name:'Maison',port:51828,devices:[light]};
  assert.equal(validateConfig(base),base);
  for(const devices of [[light,light],[light,{...light,id:'autre'}],[{...light,adapter:'../plugin.js'}],[{...light,adapter:'__proto__'}],[{...light,options:{...light.options,password:'secret'}}],[{id:'prise',name:'Prise',adapter:'shelly-gen1-relay',options:{host:'http://user:secret@localhost',channel:0}}]])assert.throws(()=>validateConfig({...base,devices}));
  assert.throws(()=>validateConfig({...base,id:123}));
});

test('one encrypted bridge routes multiple devices, real HTTP relay, isolation, identity and exclusive storage', {timeout:30000}, async () => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-gateway-'));
  let relayOn=true,relayOnline=true;const writes=[];
  const server=http.createServer((req,res)=>{
    if(!relayOnline){res.writeHead(503);res.end();return;}
    const url=new URL(req.url,'http://localhost');assert.equal(url.pathname,'/relay/0');
    if(url.searchParams.has('turn')){relayOn=url.searchParams.get('turn')==='on';writes.push(relayOn);}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ison:relayOn}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const config={version:1,id:'maison',name:'Lantern Test',port,devices:[
    {id:'salon',name:'Salon',adapter:'magic-lantern-ble',options:{address:'AA:BB:CC:DD:EE:01'}},
    {id:'bureau',name:'Bureau',adapter:'magic-lantern-ble',options:{address:'AA:BB:CC:DD:EE:02'}},
    {id:'relais',name:'Relais',adapter:'shelly-gen1-relay',options:{host:`http://127.0.0.1:${server.address().port}`,channel:0}},
  ]};
  const applied={salon:[],bureau:[]},online={salon:true,bureau:true};let closed=0;
  const gateway=new Gateway(config,directory,{bind:'127.0.0.1',adapterFactory:device=>device.id==='relais'?adapters[device.adapter].create(device):{status:async()=>({connected:online[device.id]}),apply:async state=>applied[device.id].push(state),close:async()=>closed++}});
  let client;
  try{
    await gateway.start();
    assert.deepEqual(writes,[],'startup must read a physical relay without turning it off');
    const identity=JSON.parse(await fs.readFile(path.join(directory,'identity.json'),'utf8'));
    await assert.rejects(new Gateway(config,directory).start(),/lock/i);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'identity.json'),'utf8')),identity);
    assert.equal((await fetch(`http://127.0.0.1:${port}/accessories`)).status,470);
    client=new Client(identity.username,'127.0.0.1',port);await client.pairSetup(identity.pincode);
    const list=(await client.getAccessories()).accessories;assert.equal(list.length,4,'bridge plus three real accessory instances');
    const item=id=>list.find(a=>a.services.some(s=>s.characteristics.some(c=>c.type.startsWith('00000030-')&&c.value===id)));
    const key=(id,service,type)=>{const a=item(id);return `${a.aid}.`+a.services.find(s=>s.type.startsWith(service)).characteristics.find(c=>c.type.startsWith(type)).iid;};
    const on=key('relais','00000049-','00000025-');
    assert.equal((await client.getCharacteristics([on])).characteristics[0].value,1);
    await client.setCharacteristics({[on]:false});assert.deepEqual(writes,[false]);
    const hue=key('salon','00000043-','00000013-');await client.setCharacteristics({[hue]:120});
    assert.equal(applied.salon.at(-1).hue,120);assert.deepEqual(applied.bureau,[],"other lamps must receive no fabricated initial state");
    online.salon=false;relayOnline=false;
    const offline=await client.getCharacteristics([hue,on]);assert.ok(offline.characteristics.every(c=>c.status===-70402));
    const other=key('bureau','00000043-','00000008-');await client.setCharacteristics({[other]:35});assert.equal(applied.bureau.at(-1).brightness,35);
    relayOnline=true;relayOn=true;await gateway.refresh();assert.deepEqual(writes,[false],'reconnect must observe external relay changes without replaying commands');
    assert.equal((await client.getCharacteristics([on])).characteristics[0].value,1);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory,'devices/salon/state.json'),'utf8')).hue,120);
    await client.close();client=undefined;
  }finally{
    if(client)await client.close();await gateway.stop();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});
  }
  assert.equal(closed,2);
});

test('missing platform worker is offline and shuts down without hanging', {timeout:5000},async()=>{
  const adapter=new MagicLantern({address:'AA:BB:CC:DD:EE:FF'},{root:path.join(os.tmpdir(),'lantern-missing-worker')});
  const status=adapter.status();await adapter.close();assert.equal((await status).connected,false);
});
