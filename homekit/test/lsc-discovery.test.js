const {test}=require('node:test');
const assert=require('node:assert/strict');
const dgram=require('node:dgram');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {announcement,discoverLsc}=require('../../gateway/lsc-discovery');
const {DesktopManager}=require('../../gateway/desktop-manager');
const device={gwId:'owned-light-123',ip:'127.0.0.1',version:'3.5',localKey:'must-not-be-exposed',dps:{20:true}};
// Build wire fixtures independently from the production TuyAPI parser.
const {frame}=require('./helpers/tuya-announcement');
test('Tuya discovery decodes plaintext, ECB and authenticated GCM without exposing broadcast fields',()=>{
  for(const options of [{},{encrypted:true},{modern:true,command:35}]){
    assert.deepEqual(announcement(frame(device,options),{address:'127.0.0.1'}),{deviceId:device.gwId,ip:device.ip,version:'3.5'});
  }
  assert.equal(announcement(frame(device),{address:'192.168.1.5'}),null,'ignore an advertised address different from its sender');
  assert.equal(announcement(frame({...device,version:'3.2'}),{address:device.ip}),null);
  assert.equal(announcement(frame({...device,gwId:'<script>'}),{address:device.ip}),null);
  assert.equal(announcement(frame(device,{command:7}),{address:device.ip}),null);
  const corrupted=frame(device,{modern:true});corrupted[35]^=1;
  assert.equal(announcement(corrupted,{address:device.ip}),null);
  const badCrc=frame(device);badCrc[badCrc.length-8]^=1;assert.equal(announcement(badCrc,{address:device.ip}),null);
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(20000),Buffer.concat([frame(device),frame(device)]),Buffer.from('{"gwId":"forged"}')])assert.equal(announcement(bytes,{address:device.ip}),null);
});
test('passive discovery receives real UDP, deduplicates, survives junk and releases its port', {timeout:5000},async()=>{
  const sender=dgram.createSocket('udp4');let packetsReceived=0,port;
  sender.on('message',()=>packetsReceived++);
  try{
    const result=await discoverLsc({ports:[0],host:'127.0.0.1',duration:150,onListening:address=>{
      port=address.port;for(const packet of [Buffer.alloc(5),frame(device),frame(device,{encrypted:true})])sender.send(packet,port,'127.0.0.1');
    }});
    assert.deepEqual(result.devices,[{deviceId:device.gwId,ip:device.ip,version:'3.5'}]);assert.equal(result.partial,false);assert.equal(packetsReceived,0,'discovery must send no replies or commands');
    const next=dgram.createSocket('udp4');try{await new Promise((resolve,reject)=>{next.once('error',reject);next.bind(port,'127.0.0.1',resolve);});}finally{next.close();}
  }finally{try{sender.close();}catch{}}
});
test('discovery cancellation closes sockets promptly and empty networks are reported honestly', {timeout:3000},async()=>{
  const abort=new AbortController();
  await assert.rejects(discoverLsc({ports:[0],host:'127.0.0.1',signal:abort.signal,onListening:()=>abort.abort()}),/annulée/);
  const result=await discoverLsc({ports:[0],host:'127.0.0.1',duration:15});assert.deepEqual(result.devices,[]);assert.match(result.message,/non associée/);
});
test('discovery excludes conflicting addresses for one ID instead of trusting the last packet',async()=>{
  const sender=dgram.createSocket('udp4');
  try{
    const result=await discoverLsc({ports:[0],host:'127.0.0.1',duration:100,onListening:address=>{
      sender.send(frame(device),address.port,'127.0.0.1');sender.send(frame({...device,version:'3.4'}),address.port,'127.0.0.1');
    }});assert.deepEqual(result.devices,[]);assert.deepEqual(result.conflicts,[device.gwId]);
  }finally{sender.close();}
});
test('discovery reports socket errors, supports a partial search and does not hang', {timeout:3000},async()=>{
  // An unassigned TEST-NET address fails asynchronously on Windows and Linux.
  await assert.rejects(discoverLsc({ports:[0],host:'192.0.2.201',duration:100}),/autorisations réseau/);
  // Inject a bind failure alongside a real live listener; port reuse differs by OS.
  let sockets=0;
  const result=await discoverLsc({ports:[6666,0],host:'127.0.0.1',duration:20,socketFactory:options=>{
    const socket=dgram.createSocket(options);if(!sockets++)socket.bind=()=>{throw Error('bind unavailable');};return socket;
  }});assert.equal(result.partial,true);assert.deepEqual(result.devices,[]);
});
test('desktop discovery is not persisted, is blocked in Home mode, and shutdown cancels it',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-discovery-'));let calls=0,started;
  const entered=new Promise(resolve=>started=resolve);
  const manager=await new DesktopManager(directory,{discovery:async({signal})=>{calls++;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}}).init();
  try{
    manager.running={stop:async()=>{}};
    await assert.rejects(manager.command('discover-lsc'),/Maison est actif/);assert.equal(calls,0);manager.running=null;
    const before=await fs.readFile(manager.projectFile());const search=manager.command('discover-lsc');const rejected=assert.rejects(search,/annulée/);
    await entered;await manager.close();await rejected;assert.deepEqual(await fs.readFile(manager.projectFile()),before);
  }finally{await manager.close();await fs.rm(directory,{recursive:true,force:true});}
});
