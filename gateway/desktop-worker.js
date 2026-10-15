'use strict';
const readline=require('node:readline');
const {DesktopManager,UserError,MAX}=require('./desktop-manager');
const directory=process.argv[2];
if(!directory){process.exitCode=1;}else{
  // HAP and dependencies log to stdout. Reserve stdout exclusively for private RPC.
  const output=process.stdout.write.bind(process.stdout);
  console.log=()=>{};console.warn=()=>{};console.error=()=>{};
  const emit=value=>output(JSON.stringify(value)+'\n');
  const manager=new DesktopManager(directory);let tail=manager.init(),closing=false;
  const lines=readline.createInterface({input:process.stdin,terminal:false});
  const publish=async()=>{try{emit({kind:'state',state:await manager.snapshot()});}catch{emit({kind:'state',state:{available:false,error:'Gestion du pont indisponible. Vérifiez le stockage local.'}});}};
  const timer=setInterval(()=>{if(!closing)void tail.then(publish).catch(()=>{});},2000);
  lines.on('line',line=>{
    if(closing||line.length>MAX+4096)return;
    let request;try{request=JSON.parse(line);if(!Number.isInteger(request.id)||typeof request.action!=='string')return;}catch{return;}
    tail=tail.then(async()=>{try{const result=await manager.command(request.action,request.data||{});emit({kind:'response',id:request.id,ok:true,result});}catch(error){emit({kind:'response',id:request.id,ok:false,error:error instanceof UserError?error.message:'Opération impossible. Vérifiez la configuration, les identifiants et le stockage du pont.'});}await publish();});
    tail=tail.catch(()=>{emit({kind:'response',id:request.id,ok:false,error:'Gestion du pont indisponible. Les données existantes ont été conservées.'});});
  });
  const stop=()=>{if(closing)return;closing=true;clearInterval(timer);void Promise.allSettled([tail,manager.close()]).then(()=>{lines.close();process.stdin.destroy();process.exitCode=0;});};
  lines.once('close',stop);process.once('SIGINT',stop);process.once('SIGTERM',stop);
  tail.then(publish).catch(()=>{emit({kind:'state',state:{available:false,error:'Configuration illisible. Les données existantes ont été conservées.'}});});
}
