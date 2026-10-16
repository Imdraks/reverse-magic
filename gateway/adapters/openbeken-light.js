'use strict';
const http=require('node:http');
const net=require('node:net');
const {validateFields}=require('../observed-engine');
const endpoints=new Map();let active=0;const queue=[];
async function slot(){if(active>=4)await new Promise(resolve=>queue.push(resolve));else active++;return()=>{const next=queue.shift();if(next)next();else active--;};}
function validate(options){
  let url;try{url=new URL(options.host);}catch{throw Error('Adresse OpenBeken attendue : http://192.168.1.20');}
  const ip=url.hostname,parts=ip.split('.').map(Number);
  const local=net.isIP(ip)===4&&(parts[0]===10||parts[0]===127||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===169&&parts[1]===254));
  if(url.protocol!=='http:'||!local||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Utilisez une adresse IPv4 locale HTTP, sans chemin ni identifiants.');
  if(!['dimmer','cct'].includes(options.profile))throw Error('Profil OpenBeken attendu : dimmer ou cct.');
  if(options.passwordEnv!==undefined&&(typeof options.passwordEnv!=='string'||! /^[A-Z][A-Z0-9_]{0,79}$/.test(options.passwordEnv)))throw Error('Nom de variable de mot de passe invalide.');
  return url.origin;
}
function description(options){return {service:'Lightbulb',fields:{on:{kind:'boolean',characteristic:'On'},brightness:{kind:'number',min:0,max:100,integer:true,characteristic:'Brightness'},...(options.profile==='cct'?{colorTemperature:{kind:'number',min:153,max:500,integer:true,characteristic:'ColorTemperature',props:{minValue:153,maxValue:500,minStep:1}}}:{})}};}
function decode(options,payload){
  const data=payload?.StatusSTS;
  if(!data||!['ON','OFF'].includes(data.POWER))throw Error('Éclairage OpenBeken non reconnu.');
  const state={on:data.POWER==='ON',brightness:data.Dimmer,...(options.profile==='cct'?{colorTemperature:data.CT}:{})};
  validateFields(description(options).fields,state);return state;
}
class OpenBekenLight{
  constructor(options,{timeout=2000,deadline=12000}={}){
    this.origin=validate(options);this.options=options;this.timeout=timeout;this.deadline=deadline;this.requests=new Set();this.operations=new Set();this.closed=false;
    if(options.passwordEnv&&(typeof process.env[options.passwordEnv]!=='string'||!process.env[options.passwordEnv]||Buffer.byteLength(process.env[options.passwordEnv])>32))throw Error('Mot de passe OpenBeken manquant ou trop long.');
    this.profileMode='white';
  }
  request(command,path='/cm'){
    if(this.closed)return Promise.reject(Error('Adaptateur arrêté.'));
    const url=new URL(path,this.origin);if(path==='/cm')url.searchParams.set('cmnd',command);
    const headers={};if(this.options.passwordEnv)headers.Authorization='Basic '+Buffer.from('admin:'+process.env[this.options.passwordEnv]).toString('base64');
    return new Promise((resolve,reject)=>{
      const request=http.get(url,{headers},response=>{
        let body='',size=0;response.setEncoding('utf8');
        response.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>16384)request.destroy();else body+=chunk;});
        response.on('error',()=>reject(Error('Réponse OpenBeken interrompue.')));
        response.on('end',()=>{try{if(response.statusCode!==200)throw Error();resolve(JSON.parse(body));}catch{reject(Error('Réponse OpenBeken invalide ou accès refusé.'));}});
      });
      this.requests.add(request);const timer=setTimeout(()=>request.destroy(),this.timeout);
      request.once('close',()=>{clearTimeout(timer);this.requests.delete(request);});
      request.on('error',()=>reject(Error('Connexion OpenBeken indisponible.')));
    });
  }
  call(operation){
    const previous=endpoints.get(this.origin)||Promise.resolve();
    const result=previous.then(async()=>{
      const release=await slot();let timer;
      try{
        if(this.closed)throw Error('Adaptateur arrêté.');
        let expired=false;timer=setTimeout(()=>{expired=true;for(const request of this.requests)request.destroy();},this.deadline);
        const request=async(command,path)=>{if(expired||this.closed)throw Error('Opération OpenBeken arrêtée.');return this.request(command,path);};
        return await operation(request);
      }finally{clearTimeout(timer);release();}
    });
    const tail=result.catch(()=>{});endpoints.set(this.origin,tail);tail.then(()=>{if(endpoints.get(this.origin)===tail)endpoints.delete(this.origin);});
    this.operations.add(result);const remove=()=>this.operations.delete(result);result.then(remove,remove);return result;
  }
  async identity(request){const identity=await request('Status 2');if(identity?.StatusFWR?.SDK!=='obk')throw Error('Ce service n’est pas identifié comme OpenBeken.');}
  read(){return this.call(async request=>{await this.identity(request);return decode(this.options,await request('Status 11'));});}
  apply(patch){
    try{validateFields(description(this.options).fields,patch,true);}catch(error){return Promise.reject(error);}
    return this.call(async request=>{
      await this.identity(request);const before=decode(this.options,await request('Status 11'));
      const expected={...before,...patch};if(patch.brightness===0){expected.on=false;expected.brightness=before.brightness;}
      const settings=[];
      if(patch.colorTemperature!==undefined&&patch.colorTemperature!==before.colorTemperature)settings.push('CT '+patch.colorTemperature);
      if(patch.brightness>0&&patch.brightness!==before.brightness)settings.push('Dimmer '+patch.brightness);
      if(settings.length&&!expected.on){
        // Flag 23 causes setting commands to enable LEDs, even while off. Never
        // compensate with an off/on pulse or silently change firmware settings.
        const info=await this.info(request);
        if(info.autoEnable)throw Error('Désactivez le flag OpenBeken 23 avant de modifier un profil éteint.');
      }
      if(!expected.on&&before.on)await request('Power OFF');
      for(const command of settings)await request(command);
      if(expected.on&&!before.on)await request('Power ON');
      const confirmed=decode(this.options,await request('Status 11'));
      if(Object.keys(expected).some(key=>expected[key]!==confirmed[key]))throw Error('Consigne OpenBeken non confirmée.');
      return confirmed;
    });
  }
  async info(request){
    // Read-only endpoint, limited to the same origin and no redirect handling.
    const data=await request(null,'/api/info');
    if(typeof data.flags!=='string'||! /^-?\d{1,11}$/.test(data.flags))throw Error('Flags OpenBeken absents.');
    const flags=Number(data.flags);if(!Number.isSafeInteger(flags)||flags<-2147483648||flags>4294967295)throw Error('Flags invalides.');
    return {autoEnable:Boolean((flags>>>0)&(1<<23)),remembersState:Boolean((flags>>>0)&(1<<12))};
  }
  async close(){this.closed=true;for(const request of this.requests)request.destroy();await Promise.allSettled([...this.operations]);}
}
module.exports={OpenBekenLight,validate,description,decode};
