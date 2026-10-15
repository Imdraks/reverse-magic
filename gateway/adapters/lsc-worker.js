'use strict';
// Private single-operation process: exiting cancels library retries and pending sockets.
const readline=require('node:readline');
const crypto=require('node:crypto');
const Tuya=require('../../homekit/node_modules/tuyapi');
const {decode,encode,probe}=require('./lsc-codec');
let device,finished=false;
function finish(ok,result){if(finished)return;finished=true;device?.disconnect();process.stdout.write(JSON.stringify({ok,...(ok?{result}:{})})+'\n',()=>process.exit(ok?0:1));}
const input=readline.createInterface({input:process.stdin});
input.once('line',async line=>{
  input.close();process.stdin.pause();
  try{
    if(line.length>16384)throw new Error('Request too long');
    const {options,operation,patch}=JSON.parse(line);
    const id=process.env[options.deviceIdEnv],key=process.env[options.localKeyEnv];
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{6,64}$/.test(id)||typeof key!=='string'||Buffer.byteLength(key)!==16||key.length!==16)throw new Error('Credentials unavailable');
    device=new Tuya({id,key,ip:options.ip,port:options.port||6668,version:options.version,issueGetOnConnect:false,issueRefreshOnConnect:false,issueRefreshOnPing:false});
    if(options.version==='3.5'){
      // TuyAPI 7.7.1 defaults to a timestamp-based GCM IV, which can repeat in a burst.
      // Keep explicit protocol IVs and give every ordinary packet a fresh 96-bit nonce.
      const cipher=device.device.parser.cipher,encrypt=cipher.encrypt.bind(cipher);
      cipher.encrypt=parameters=>encrypt({...parameters,iv:parameters.iv??crypto.randomBytes(12)});
    }
    device.on('error',()=>finish(false));
    await device.connect();
    let dps=(await device.get({schema:true}))?.dps;
    if(operation==='probe'){finish(true,probe(dps));return;}
    if(operation==='apply'){
      const command=encode(options,patch,dps);
      if(!Object.keys(command).length)throw new Error('Empty command');
      await device.set({multiple:true,data:command});
      dps=(await device.get({schema:true}))?.dps;
      if(!dps||Object.entries(command).some(([dp,value])=>dps[dp]!==value))throw new Error('Write not confirmed');
    }else if(operation!=='read')throw new Error('Unknown operation');
    finish(true,decode(options,dps));
  }catch{finish(false);}
});
