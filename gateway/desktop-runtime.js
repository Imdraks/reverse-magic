'use strict';
const {fork}=require('node:child_process');
const path=require('node:path');

// HAPStorage is process-global and cannot be reinitialized. A fresh process per
// activation also makes restored pairings load from disk instead of an old cache.
class DesktopRuntime {
  constructor(config,directory,options={}){this.config=config;this.directory=directory;this.options=options;}
  start(){return new Promise((resolve,reject)=>{
    const child=fork(path.join(__dirname,'desktop-runtime.js'),[],{windowsHide:true,stdio:['pipe','ignore','ignore','ipc']});this.child=child;
    const timer=setTimeout(()=>{child.kill();reject(new Error('Bridge startup timeout'));},170000);
    this.closed=new Promise(done=>child.once('close',()=>{clearTimeout(timer);done();if(!this.stopping)this.options.onExit?.();reject(new Error('Bridge process stopped'));}));
    child.once('error',()=>{clearTimeout(timer);reject(new Error('Bridge process unavailable'));});
    child.stdin.on('error',()=>{});
    child.on('message',message=>{if(message.kind==='ready'){clearTimeout(timer);resolve(this);}else if(message.kind==='status')this.options.onStatus?.(message.devices);else if(message.kind==='error'){clearTimeout(timer);reject(new Error('Bridge startup failed'));}});
    child.send({config:this.config,directory:this.directory,bind:this.options.bind},()=>{});
  });}
  async stop(){this.stopping=true;if(!this.child)return;this.child.stdin.end();const timer=setTimeout(()=>this.child.kill(),8000);await this.closed;clearTimeout(timer);}
}
if(require.main===module){
  let gateway,startup,closing=false;
  const send=message=>{if(process.connected)process.send(message,()=>{});};
  const stop=async()=>{if(closing)return;closing=true;try{await startup;if(gateway)await gateway.stop();}catch{}finally{if(process.connected)process.disconnect();process.stdin.destroy();}};
  process.stdin.resume();process.stdin.once('end',()=>void stop());process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  process.once('message',message=>{
    startup=(async()=>{
      gateway=new(require('./runtime').Gateway)(message.config,message.directory,{bind:message.bind,onStatus:devices=>send({kind:'status',devices})});
      try{await gateway.start();send({kind:'ready'});}catch{send({kind:'error'});await gateway.stop();process.exitCode=1;}
    })();
  });
}
module.exports={DesktopRuntime};
