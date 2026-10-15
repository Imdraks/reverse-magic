'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
async function windowsLease(root = path.resolve(__dirname,'..')) {
  const child=spawn(path.join(root,'LanternDirect.exe'),['--gateway-lease'],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  const closed=new Promise(resolve=>child.once('close',resolve));
  child.stdin.on('error',()=>{});
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Windows lease timeout')),5000);
      child.once('error',()=>{clearTimeout(timer);reject(new Error('Windows launcher unavailable'));});
      child.once('close',()=>{clearTimeout(timer);reject(new Error('Windows launcher stopped'));});
      child.stdout.once('data',chunk=>{clearTimeout(timer);if(chunk.toString().trim()==='ready')resolve();else reject(new Error('Invalid Windows launcher response'));});
    });
  }catch(error){child.kill();await closed;throw error;}
  return async()=>{child.stdin.end();const timer=setTimeout(()=>child.kill(),3000);await closed;clearTimeout(timer);};
}
module.exports={windowsLease};
