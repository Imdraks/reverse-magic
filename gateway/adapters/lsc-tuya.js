'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const {description}=require('./lsc-codec');
let active=0;const queue=[];
const endpoints=new Map();
async function slot(){if(active>=4)await new Promise(resolve=>queue.push(resolve));else active++;return()=>{const next=queue.shift();if(next)next();else active--;};}
class LscTuya {
  constructor(options,{timeout=6000}={}){
    this.options=options;this.timeout=timeout;this.children=new Set();this.operations=new Set();this.closed=false;
    const id=process.env[options.deviceIdEnv],key=process.env[options.localKeyEnv];
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{6,64}$/.test(id)||typeof key!=='string'||key.length!==16||Buffer.byteLength(key)!==16)throw new Error('LSC : identifiant ou clé locale manquants/invalides dans les variables configurées.');
  }
  call(operation,patch){
    // Many Tuya firmwares permit only one LAN client at a time, even for different channels.
    const endpoint=`${this.options.ip}:${this.options.port||6668}`,previous=endpoints.get(endpoint)||Promise.resolve();
    const result=previous.then(()=>this.perform(operation,patch));const tail=result.catch(()=>{});
    endpoints.set(endpoint,tail);tail.then(()=>{if(endpoints.get(endpoint)===tail)endpoints.delete(endpoint);});
    this.operations.add(result);const remove=()=>this.operations.delete(result);result.then(remove,remove);return result;
  }
  async perform(operation,patch){
    const release=await slot();
    try{
      if(this.closed)throw new Error('Adaptateur arrêté.');
      return await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,[path.join(__dirname,'lsc-worker.js')],{windowsHide:true,stdio:['pipe','pipe','ignore']});
        this.children.add(child);let output='',failed=false;
        const timer=setTimeout(()=>{failed=true;child.kill();},this.timeout);
        child.stdin.on('error',()=>{failed=true;child.kill();});
        child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536){failed=true;child.kill();}});
        child.once('error',()=>{failed=true;});
        child.once('close',code=>{
          clearTimeout(timer);this.children.delete(child);
          try{if(failed||code!==0||this.closed)throw new Error();const response=JSON.parse(output);if(!response.ok)throw new Error();resolve(response.result);}
          catch{reject(new Error('LSC indisponible : vérifiez adresse, version, clé locale et profil DP.'));}
        });
        child.stdin.end(JSON.stringify({options:this.options,operation,patch})+'\n');
      });
    }finally{release();}
  }
  read(){return this.call('read');}
  apply(patch){return this.call('apply',patch);}
  probe(){return this.call('probe');}
  async close(){this.closed=true;for(const child of this.children)child.kill();await Promise.allSettled([...this.operations]);}
}
module.exports={LscTuya,description};
