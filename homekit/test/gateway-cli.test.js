const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const Client = require('hap-controller/lib/transport/ip/http-client').default;

test('CLI preserves encrypted pairing and accessory IDs across restart, rename and addition', {timeout:30000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-cli-'));
  const cli=path.resolve(__dirname,'../../gateway/cli.js');const file=path.join(directory,'bridge.json');
  const init=()=>spawnSync(process.execPath,[cli,'init','--config',file],{encoding:'utf8'});
  assert.equal(init().status,0);const initial=await fs.readFile(file,'utf8');assert.equal(init().status,1);assert.equal(await fs.readFile(file,'utf8'),initial);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"ison":true}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const config={version:1,id:'maison',name:'Lantern CLI',port,devices:[{id:'relais',name:'Relais',adapter:'shelly-gen1-relay',options:{host:`http://127.0.0.1:${server.address().port}`,channel:0}}]};
  await fs.writeFile(file,JSON.stringify(config));
  let child,lines,exit,client,logs='';
  async function start(){
    child=spawn(process.execPath,[cli,'run','--config',file,'--data-dir',path.join(directory,'state')],{stdio:['ignore','pipe','pipe']});
    exit=new Promise(resolve=>child.once('exit',resolve));
    child.stderr.on('data',chunk=>logs+=chunk);
    lines=readline.createInterface({input:child.stdout});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Gateway startup timed out')),10000);
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('Gateway stopped before ready'));});
      lines.on('line',line=>{logs+=line+'\n';if(line.startsWith('Pont prêt')){clearTimeout(timer);resolve();}});
    });
  }
  async function stop(){if(!child)return;child.kill('SIGTERM');assert.equal(await exit,0);lines.close();child=undefined;}
  const identity=()=>fs.readFile(path.join(directory,'state/maison/identity.json'),'utf8').then(JSON.parse);
  const find=list=>{const a=list.accessories.find(x=>x.services.some(s=>s.characteristics.some(c=>c.type.startsWith('00000030-')&&c.value==='relais')));return {aid:a.aid,iid:a.services.find(s=>s.type.startsWith('00000049-')).characteristics.find(c=>c.type.startsWith('00000025-')).iid};};
  try{
    await start();const first=await identity();client=new Client(first.username,'127.0.0.1',port);await client.pairSetup(first.pincode);
    const before=find(await client.getAccessories());const credentials=client.getLongTermData();await client.close();client=undefined;await stop();
    config.devices[0].name='Relais renomme';config.devices.push({...config.devices[0],id:'deuxieme',name:'Deuxieme',options:{...config.devices[0].options,channel:1}});await fs.writeFile(file,JSON.stringify(config));
    await start();assert.deepEqual(await identity(),first);
    client=new Client(first.username,'127.0.0.1',port,credentials);
    const after=await client.getAccessories();assert.equal(after.accessories.length,3);assert.deepEqual(find(after),before);
    assert.equal((await client.getCharacteristics([`${before.aid}.${before.iid}`])).characteristics[0].value,1);
    assert.doesNotMatch(logs,/\b\d{3}-\d{2}-\d{3}\b/,'service logs must not contain pairing codes');
    await client.close();client=undefined;await stop();
  }finally{
    if(client)await client.close();if(child){child.kill('SIGKILL');await exit;lines.close();}
    await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});
  }
});
