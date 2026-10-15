'use strict';
// Passive LAN discovery only: no pairing, cloud login, TCP probe or light command.
const dgram=require('node:dgram');
const net=require('node:net');
const {MessageParser}=require('../homekit/node_modules/tuyapi/lib/message-parser');
const {UDP_KEY}=require('../homekit/node_modules/tuyapi/lib/config');
const PORTS=[6666,6667,7000];
const VERSIONS=['3.1','3.3','3.4','3.5'];
function announcement(message,remote){
  try{
    if(!Buffer.isBuffer(message)||message.length<24||message.length>16384||net.isIP(remote?.address)!==4)return null;
    const prefix=message.readUInt32BE(0),modern=prefix===0x6699;
    if(!modern&&prefix!==0x55aa)return null;
    if(message.readUInt32BE(message.length-4)!==(modern?0x9966:0xaa55))return null;
    // A single, exact frame prevents trailing data and recursive packet parsing.
    const length=message.readUInt32BE(modern?14:12);
    if(message.length!==length+(modern?22:16))return null;
    const command=message.readUInt32BE(modern?10:8);
    if(![0,19,35].includes(command))return null;
    const payload=new MessageParser({key:UDP_KEY,version:'3.3'}).parse(message)[0]?.payload;
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
    const id=payload.gwId,ip=payload.ip,version=String(payload.version);
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{6,64}$/.test(id)||net.isIP(ip)!==4||ip!==remote.address||!VERSIONS.includes(version))return null;
    // Never return arbitrary broadcast fields, raw DP data or claimed brand/category.
    return {deviceId:id,ip,version};
  }catch{return null;}
}
async function discoverLsc({duration=8000,signal,ports=PORTS,host='0.0.0.0',onListening,socketFactory=options=>dgram.createSocket(options)}={}){
  const found=new Map(),sockets=[],unavailable=[];
  if(signal?.aborted)throw new Error('Recherche annulée.');
  if(!Number.isInteger(duration)||duration<10||duration>10000)throw new Error('Durée de recherche invalide.');
  let finish;
  const done=new Promise(resolve=>finish=resolve),abort=()=>finish();
  const timer=setTimeout(finish,duration);signal?.addEventListener('abort',abort,{once:true});
  try{
    await Promise.all(ports.map(port=>new Promise(resolve=>{
      const socket=socketFactory({type:'udp4',reuseAddr:true});sockets.push(socket);
      socket.on('message',(bytes,remote)=>{if(signal?.aborted)return;const device=announcement(bytes,remote);if(device&&(found.size<128||found.has(device.deviceId)))found.set(device.deviceId,device);});
      socket.on('error',()=>{if(!unavailable.includes(port))unavailable.push(port);resolve();if(unavailable.length===ports.length)finish();});
      socket.once('listening',()=>{onListening?.(socket.address());resolve();});
      try{socket.bind(port,host);}catch{unavailable.push(port);resolve();if(unavailable.length===ports.length)finish();}
    })));
    await done;
    if(signal?.aborted)throw new Error('Recherche annulée.');
    if(unavailable.length===ports.length)throw new Error('Découverte indisponible. Vérifiez les autorisations réseau et les ports UDP 6666, 6667 et 7000.');
    return {devices:[...found.values()].sort((a,b)=>a.ip.localeCompare(b.ip)),partial:unavailable.length>0,message:found.size?'Appareils Tuya détectés. Choisissez uniquement votre éclairage LSC ; la marque et le type ne sont pas vérifiés.':'Aucune annonce reçue. Vérifiez le réseau local et le pare-feu. Une ampoule non associée au Wi-Fi ne peut pas être détectée ainsi.'};
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort);
    await Promise.all(sockets.map(socket=>new Promise(resolve=>{try{socket.close(resolve);}catch{resolve();}})));
  }
}
module.exports={announcement,discoverLsc};
