'use strict';
// Exercise the installed manager and both private Node process boundaries on Windows.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
async function main(){
  const {DesktopManager}=require(path.join(process.argv[2],'gateway/desktop-manager'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lantern-installed-desktop-'));let writes=0;
  const relay=http.createServer((request,response)=>{if(new URL(request.url,'http://localhost').searchParams.has('turn'))writes++;response.end('{"ison":true}');});
  await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const manager=await new DesktopManager(directory).init();
  try{
    const project=await manager.load();project.config.port=port;await manager.save(project);
    await manager.command('save-device',{name:'Installed light',room:'Test',adapter:'shelly-gen1-relay',options:{host:`http://127.0.0.1:${relay.address().port}`,channel:0}});
    await manager.command('start');
    await assert.rejects(manager.command('apply-group',{on:false}),/Maison est actif/);assert.equal(writes,0);
    const pairing=await manager.command('pairing');assert.match(pairing.image,/^data:image\/png;base64,/);
    await manager.command('stop');const backup=await manager.command('backup',{password:'installed backup test phrase'});
    await manager.command('restore',{backup:backup.backup,password:'installed backup test phrase'});
    await manager.command('start');assert.equal((await manager.command('pairing')).code,pairing.code);await manager.command('stop');
    console.log('Installed desktop bridge: activation, command lock, encrypted backup, identity restore and reactivation verified.');
  }finally{await manager.close();await new Promise(resolve=>relay.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(()=>{console.error('Installed desktop bridge smoke failed.');process.exitCode=1;});
