'use strict';
// Exercise the installed manager and both private Node process boundaries on Windows.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
async function main(){
  const {DesktopManager}=require(path.join(process.argv[2],'gateway/desktop-manager'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-installed-desktop-'));let writes=0;
  let white=300;
  const relay=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/cm'){
      const cmd=url.searchParams.get('cmnd');
      if(cmd==='Status 2'){response.end('{"StatusFWR":{"SDK":"obk"}}');return;}
      if(/^CT \d+$/.test(cmd))white=Number(cmd.split(' ')[1]);
      response.end(JSON.stringify(cmd==='Status 11'?{StatusSTS:{POWER:'ON',Dimmer:60,CT:white}}:{POWER:'ON',Dimmer:60,CT:white}));return;
    }
    if(url.searchParams.has('turn'))writes++;response.end('{"ison":true}');
  });
  await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  let manager=await new DesktopManager(directory).init();
  try{
    const project=await manager.load();project.config.port=port;await manager.save(project);
    await manager.command('save-device',{name:'Installed light',room:'Test',adapter:'shelly-gen1-relay',options:{host:`http://127.0.0.1:${relay.address().port}`,channel:0}});
    const plan=await manager.command('conversion-plan',{reference:'970709',firmware:'1.1.6'});assert.equal(plan.canFlash,false);assert.match(plan.preflight,/def inspect/);
    const added=await manager.command('save-device',{name:'Installed OpenBeken',room:'Test',adapter:'openbeken-light',options:{host:`http://127.0.0.1:${relay.address().port}`,profile:'cct'}});
    const converted=added.devices.find(device=>device.adapter==='openbeken-light');assert.equal((await manager.command('test-device',{id:converted.id})).ok,true);
    assert.equal((await manager.command('apply',{id:converted.id,patch:{colorTemperature:350}})).results[0].ok,true);assert.equal(white,350);
    await manager.command('start');
    await assert.rejects(manager.command('apply-group',{on:false}),/Maison est actif/);assert.equal(writes,0);
    await assert.rejects(manager.command('conversion-plan'),/Maison est actif/);
    const pairing=await manager.command('pairing');assert.match(pairing.image,/^data:image\/png;base64,/);
    await manager.command('stop');
    const saved=(await manager.snapshot()).devices[0];await manager.close();
    manager=await new DesktopManager(directory).init();assert.equal((await manager.snapshot()).devices[0].profile.state.on,true);
    const before=writes;assert.equal((await manager.command('restore-profile',{id:saved.id})).results[0].ok,true);assert.equal(writes,before+1);
    const backup=await manager.command('backup',{password:'installed backup test phrase'});
    await manager.command('restore',{backup:backup.backup,password:'installed backup test phrase'});
    await manager.command('start');assert.equal((await manager.command('pairing')).code,pairing.code);await manager.command('stop');
    console.log('Installed desktop bridge: activation, command lock, encrypted backup, identity restore and reactivation verified.');
  }finally{await manager.close();await new Promise(resolve=>relay.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(()=>{console.error('Installed desktop bridge smoke failed.');process.exitCode=1;});
