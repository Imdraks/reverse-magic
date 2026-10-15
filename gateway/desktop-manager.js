'use strict';
// Shared desktop control plane. No network listener; hosts communicate over private pipes.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const lockfile=require('../homekit/node_modules/proper-lockfile');
const {validateConfig}=require('./config');
const {adapters}=require('./registry');
const {LIGHTS}=require('./adapters/lsc-profiles');
const {validateFields}=require('./observed-engine');
const {validatePatch,DEFAULT_STATE}=require('../homekit/light-engine');
const {loadLightStorage}=require('../homekit/storage');
const {ProfileStore}=require('./profile-store');
const {discoverLsc}=require('./lsc-discovery');
const scrypt=promisify(crypto.scrypt);
const MAX=2*1024*1024;
class UserError extends Error {}
function fail(message){throw new UserError(message);}
function label(value){if(typeof value!=='string'||value.trim()!==value||value.length>64||/[\x00-\x1f\x7f]/.test(value))fail('Nom ou pièce invalide.');return value;}
async function atomic(file,data){const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';try{await fs.writeFile(temp,data,{mode:0o600,flag:'wx'});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}}
function validateProject(project){
  if(!project||project.version!==1||!project.config||!project.secrets||!project.rooms)fail('Sauvegarde ou configuration invalide.');
  validateConfig(project.config);
  if(Array.isArray(project.secrets)||Array.isArray(project.rooms))fail('Configuration invalide.');
  for(const [key,value] of Object.entries(project.secrets))if(!/^LANTERN_[A-F0-9]{16}_(ID|KEY|USER|PASS)$/.test(key)||typeof value!=='string'||value.length>256)fail('Stockage des identifiants invalide.');
  for(const [key,value] of Object.entries(project.rooms))if(!project.config.devices.some(d=>d.id===key)||typeof value!=='string'||!label(value))fail('Pièce invalide.');
  return project;
}
class DesktopManager {
  constructor(directory,{gatewayFactory,adapterFactory,discovery=discoverLsc,clock=()=>new Date().toISOString()}={}){
    this.directory=path.resolve(directory);this.installation=path.join(this.directory,'installation');
    this.gatewayFactory=gatewayFactory||((config,storage,options)=>new (require('./desktop-runtime').DesktopRuntime)(config,storage,options));
    this.adapterFactory=adapterFactory||((device)=>adapters[device.adapter].create(device,{}));
    this.clock=clock;this.discovery=discovery;this.discoveryAbort=null;this.logs=[];this.health=new Map();this.running=null;this.closed=false;this.activeAdapters=new Set();
  }
  async init(){await fs.mkdir(this.directory,{recursive:true,mode:0o700});await this.locked(async()=>{
    try{await fs.access(this.installation);}catch(error){if(error.code!=='ENOENT')throw error;try{await fs.rename(path.join(this.directory,'installation.previous'),this.installation);}catch(recovery){if(recovery.code!=='ENOENT')throw recovery;}}
    await fs.mkdir(this.installation,{recursive:true,mode:0o700});
    try{await fs.access(this.projectFile());}catch(error){if(error.code!=='ENOENT')throw error;await this.save({version:1,config:{version:1,id:'interface-'+crypto.randomBytes(6).toString('hex'),name:'Lantern Bridge',port:51828,devices:[]},secrets:{},rooms:{}});}
    await this.load();});return this;}
  projectFile(){return path.join(this.installation,'project.json');}
  async load(){return validateProject(JSON.parse(await fs.readFile(this.projectFile(),'utf8')));}
  async save(project){validateProject(project);await atomic(this.projectFile(),JSON.stringify(project,null,2)+'\n');}
  storage(project){return path.join(this.installation,'gateway',project.config.id);}
  async locked(action){const unlock=await lockfile.lock(this.directory,{retries:{retries:5,minTimeout:100,maxTimeout:200}});try{return await action();}finally{await unlock();}}
  async external(project){try{return await lockfile.check(this.storage(project));}catch(error){if(error.code==='ENOENT')return false;throw error;}}
  async editable(project){if(this.running||await this.external(project))fail('Maison est actif. Désactivez Maison avant de modifier les appareils ou d’utiliser les commandes directes.');}
  event(message){this.logs.push({time:this.clock(),message});if(this.logs.length>100)this.logs.shift();}
  environment(project){for(const [key,value] of Object.entries(project.secrets))process.env[key]=value;}
  observe(rows){for(const row of rows){const previous=this.health.get(row.id)||{};this.health.set(row.id,{online:row.online,lastConnection:row.online&&!previous.online?this.clock():previous.lastConnection||null,profileWarning:Boolean(row.profileWarning)});if(row.online!==previous.online)this.event(row.online?'Éclairage connecté.':'Éclairage indisponible.');if(row.profileWarning&&!previous.profileWarning)this.event('Réglage appliqué, mais profil non enregistré. Vérifiez le stockage.');}}
  async snapshot(){const project=await this.load(),external=!this.running&&await this.external(project);return {
    available:true,active:Boolean(this.running||external),external,config:project.config,rooms:project.rooms,
    devices:await Promise.all(project.config.devices.map(async device=>({...device,room:project.rooms[device.id]||'Sans pièce',...(this.health.get(device.id)||{online:null,lastConnection:null}),fields:Object.keys(adapters[device.adapter].describe?.(device.options)?.fields||DEFAULT_STATE),...await this.profileSnapshot(project,device)}))),
    logs:this.logs,profiles:Object.keys(LIGHTS),directory:this.directory,serviceUnit:this.serviceUnit(),
  };}
  async profileSnapshot(project,device){
    try{
      const directory=path.join(this.storage(project),'devices',device.id);
      if(adapters[device.adapter].describe){const profile=await new ProfileStore(directory,device).load();return {profile:profile?{...profile,signature:undefined,restorable:profile.mode!=='unsupported'}:null};}
      const saved=await loadLightStorage(directory);if(!saved.hasSavedState)return {profile:null};
      const info=await fs.stat(path.join(directory,'state.json'));return {profile:{state:saved.state,mode:'colour',source:'command',savedAt:info.mtime.toISOString(),restorable:true}};
    }catch{return {profile:null,profileError:'Profil mémorisé illisible. Le fichier existant est conservé.'};}
  }
  build(data,project){
    const existing=project.config.devices.find(d=>d.id===data.id);
    const device={id:existing?.id||'lumiere-'+crypto.randomBytes(6).toString('hex'),name:label(data.name),adapter:data.adapter,options:structuredClone(data.options||{})};
    if(!device.name)fail('Donnez un nom à votre éclairage.');
    if(!Object.hasOwn(adapters,device.adapter))fail('Type d’éclairage inconnu.');
    if(data.credentials){
      if(device.adapter!=='lsc-tuya-light'&&device.adapter!=='shelly-gen1-relay')fail('Identifiants inattendus.');
      if(device.adapter==='lsc-tuya-light'&&(!/^[A-Za-z0-9_-]{6,64}$/.test(data.credentials.deviceId)||typeof data.credentials.localKey!=='string'||data.credentials.localKey.length!==16||Buffer.byteLength(data.credentials.localKey)!==16))fail('LSC : identifiant invalide ou clé locale différente de 16 octets.');
      const prefix='LANTERN_'+crypto.randomBytes(8).toString('hex').toUpperCase();
      const fields=device.adapter==='lsc-tuya-light'?[['deviceId','deviceIdEnv','ID'],['localKey','localKeyEnv','KEY']]:[['username','usernameEnv','USER'],['password','passwordEnv','PASS']];
      for(const [source,target,suffix] of fields){const value=data.credentials[source];if(typeof value!=='string'||!value||value.length>256)fail('Identifiants incomplets.');device.options[target]=prefix+'_'+suffix;project.secrets[prefix+'_'+suffix]=value;}
    }
    if(existing)project.config.devices=project.config.devices.filter(d=>d.id!==existing.id);
    project.config.devices.push(device);const room=label(data.room||'');if(room)project.rooms[device.id]=room;else delete project.rooms[device.id];
    validateConfig(project.config);return device;
  }
  async test(device,project,probe=false,remember=true){
    this.environment(project);let adapter;
    try{adapter=this.adapterFactory(device);this.activeAdapters.add(adapter);let result;
      if(probe&&device.adapter==='lsc-tuya-light')result=await adapter.probe();
      else if(adapter.read){result=await adapter.read();if(remember)await new ProfileStore(path.join(this.storage(project),'devices',device.id),device).save(result,{mode:adapter.profileMode});}
      else {await this.connected(adapter);result={connected:true};}
      return {ok:true,details:probe?result:undefined,message:probe?'Diagnostic terminé ; les profils proposés restent à confirmer.':'Connexion et lecture réussies. Aucune commande lumineuse envoyée.'};
    }catch(error){if(error instanceof UserError)throw error;fail('Éclairage inaccessible. Vérifiez son alimentation, son adresse, les identifiants et le profil.');}
    finally{if(adapter){await adapter.close();this.activeAdapters.delete(adapter);}}
  }
  async command(action,data={}){
    if(this.closed)fail('Gestionnaire arrêté.');
    if(action==='state')return this.snapshot();
    return this.locked(async()=>{
      const project=await this.load();
      if(action==='pairing'){
        if(!this.running)fail('Activez le pont de cette interface pour afficher son code.');
        const folder=this.storage(project),identity=JSON.parse(await fs.readFile(path.join(folder,'identity.json'),'utf8'));
        return {code:identity.pincode,image:'data:image/png;base64,'+(await fs.readFile(path.join(folder,'pairing.png'))).toString('base64')};
      }
      if(action==='stop'){
        if(!this.running&&await this.external(project))fail('Le pont est lancé par un autre processus. Arrêtez son service avant de modifier la configuration.');
        if(this.running){const gateway=this.running;await gateway.stop();this.running=null;this.event('Maison désactivé. Les modifications sont à nouveau accessibles.');}return this.snapshot();
      }
      await this.editable(project);
      if(this.closed)fail('Gestionnaire arrêté.');
      if(action==='start'){
        if(!project.config.devices.length)fail('Ajoutez au moins un éclairage.');
        this.environment(project);
        const gateway=this.gatewayFactory(project.config,this.storage(project),{onStatus:rows=>this.observe(rows),onExit:()=>{if(this.running===gateway){this.running=null;this.event('Le pont s’est arrêté. Vérifiez les connexions puis réactivez Maison.');}}});this.running=gateway;
        try{this.startup=gateway.start();await this.startup;if(this.closed)throw Error();this.event('Maison activé. Commandes directes et modifications verrouillées.');}catch{await gateway.stop();this.running=null;fail('Impossible de démarrer Maison. Vérifiez le port 51828, les identifiants et les autres ponts actifs.');}finally{this.startup=null;}
      }else if(action==='save-device'){
        this.build(data,project);this.prune(project);await this.save(project);this.event('Éclairage enregistré. Réactivez Maison pour le retrouver dans le pont.');
      }else if(action==='remove-device'){
        if(!project.config.devices.some(d=>d.id===data.id))fail('Éclairage introuvable.');
        project.config.devices=project.config.devices.filter(d=>d.id!==data.id);delete project.rooms[data.id];this.prune(project);await this.save(project);this.health.delete(data.id);this.event('Éclairage retiré du pont.');
      }else if(action==='settings'){
        project.config.name=label(data.name);if(!project.config.name)fail('Nom du pont requis.');await this.save(project);
      }else if(action==='test-device'){
        const device=data.draft?this.build(data.draft,project):project.config.devices.find(d=>d.id===data.id);if(!device)fail('Éclairage introuvable.');return this.test(device,project,Boolean(data.probe),!data.draft);
      }else if(action==='discover-lsc'){
        this.discoveryAbort=new AbortController();
        try{return await this.discovery({signal:this.discoveryAbort.signal});}
        catch{fail(this.closed?'Recherche annulée.':'Découverte indisponible. Vérifiez les autorisations réseau et les ports UDP 6666, 6667 et 7000.');}
        finally{this.discoveryAbort=null;}
      }else if(action==='refresh-devices'){
        await this.batch(project.config.devices,async device=>{try{await this.test(device,project);this.observe([{id:device.id,online:true}]);}catch{this.observe([{id:device.id,online:false}]);}});
      }else if(action==='apply-group'){
        const devices=project.config.devices.filter(d=>data.room===undefined||(project.rooms[d.id]||'')===data.room);
        if(typeof data.on!=='boolean'||!devices.length)fail('Choisissez une pièce et une commande.');
        return {results:await this.batch(devices,device=>this.apply(device,project,{on:data.on}))};
      }else if(action==='restore-profile'){
        const device=project.config.devices.find(d=>d.id===data.id);if(!device)fail('Éclairage introuvable.');
        const directory=path.join(this.storage(project),'devices',device.id);let patch;
        if(adapters[device.adapter].describe){const store=new ProfileStore(directory,device),record=await store.load();if(!record)fail('Aucun profil mémorisé pour cet éclairage.');patch=store.patch(record);}
        else{const saved=await loadLightStorage(directory);if(!saved.hasSavedState)fail('Aucun profil mémorisé pour cet éclairage.');patch=saved.state;}
        return {results:[await this.apply(device,project,patch)]};
      }else if(action==='apply'){
        const device=project.config.devices.find(d=>d.id===data.id);if(!device)fail('Éclairage introuvable.');return {results:[await this.apply(device,project,data.patch)]};
      }else if(action==='backup')return this.backup(project,data.password);
      else if(action==='restore')return this.restore(data);
      else fail('Commande de gestion inconnue.');
      return this.snapshot();
    });
  }
  prune(project){const used=new Set(project.config.devices.flatMap(d=>Object.entries(d.options).filter(([key])=>key.endsWith('Env')).map(([,value])=>value)));for(const key of Object.keys(project.secrets))if(!used.has(key))delete project.secrets[key];}
  async batch(devices,operation){let index=0;const results=new Array(devices.length),deadline=Date.now()+90000;await Promise.all(Array.from({length:Math.min(4,devices.length)},async()=>{while(index<devices.length){const current=index++,device=devices[current];results[current]=this.closed||Date.now()>deadline?{id:device.id,ok:false,message:'Délai du groupe dépassé. Aucune commande envoyée à cet éclairage.'}:await operation(device);}}));return results;}
  serviceUnit(){
    const quote=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%')+'"';
    if([this.directory,process.execPath,__dirname].some(x=>/[\r\n]/.test(x)))return '';
    return '[Unit]\nDescription=Lantern Bridge — éclairages\nAfter=network-online.target bluetooth.target\n\n[Service]\nType=simple\nExecStart='+[process.execPath,path.join(__dirname,'desktop-service.js'),this.directory].map(quote).join(' ')+'\nRestart=on-failure\nRestartSec=10\nUMask=0077\n\n[Install]\nWantedBy=default.target\n';
  }
  async connected(adapter){const deadline=Date.now()+25000;do{if(this.closed)fail('Gestionnaire arrêté.');if((await adapter.status()).connected)return;await new Promise(resolve=>setTimeout(resolve,250));}while(Date.now()<deadline);fail('Bluetooth indisponible. Vérifiez la radio et la connexion du contrôleur.');}
  async apply(device,project,patch){
    let adapter;
    try{
      const fields=adapters[device.adapter].describe?.(device.options)?.fields;
      if(fields)validateFields(fields,patch,true);else validatePatch(patch);
      if(this.closed)fail('Gestionnaire arrêté.');this.environment(project);adapter=this.adapterFactory(device);this.activeAdapters.add(adapter);
      if(fields){const confirmed=await adapter.apply(patch);await new ProfileStore(path.join(this.storage(project),'devices',device.id),device).save(confirmed,{commanded:true,mode:adapter.profileMode});}
      else{
        const stored=await loadLightStorage(path.join(this.storage(project),'devices',device.id));
        await this.connected(adapter);
        const next={...stored.state,...patch};await adapter.apply(next);await stored.save(next);
      }
      this.observe([{id:device.id,online:true}]);return {id:device.id,ok:true};
    }catch{this.observe([{id:device.id,online:false}]);return {id:device.id,ok:false,message:'Commande non confirmée. Vérifiez la connexion et le profil.'};}
    finally{if(adapter){await adapter.close();this.activeAdapters.delete(adapter);}}
  }
  async backup(project,password){
    if(typeof password!=='string'||password.length<12||password.length>256)fail('Utilisez une phrase de passe de 12 à 256 caractères.');
    const files={};let size=0;
    const walk=async(relative='')=>{for(const item of await fs.readdir(path.join(this.installation,relative),{withFileTypes:true})){
      if(item.name.endsWith('.lock')||item.name.endsWith('.tmp'))continue;
      const name=relative?relative+'/'+item.name:item.name;
      if(item.isSymbolicLink())fail('Une sauvegarde ne peut pas inclure de lien symbolique.');
      if(item.isDirectory())await walk(name);else if(item.isFile()){const bytes=await fs.readFile(path.join(this.installation,name));size+=bytes.length;if(size>MAX/2)fail('Sauvegarde trop volumineuse.');files[name]=bytes.toString('base64');}
    }};
    await walk();const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=await scrypt(password,salt,32);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(JSON.stringify({version:1,files})),cipher.final()]);
    const backup=JSON.stringify({format:'lantern-backup-1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
    if(backup.length>MAX||Object.keys(files).length>2048)fail('Sauvegarde trop volumineuse.');
    this.event('Sauvegarde chiffrée préparée.');return {filename:'Lantern-Bridge-'+this.clock().slice(0,10)+'.lantern',backup};
  }
  async restore(data){
    if(typeof data.backup!=='string'||data.backup.length>MAX||typeof data.password!=='string'||data.password.length<12||data.password.length>256)fail('Sauvegarde ou phrase de passe invalide.');
    let unpacked;
    try{
      const blob=JSON.parse(data.backup);if(blob.format!=='lantern-backup-1')throw Error();
      const salt=Buffer.from(blob.salt,'base64'),iv=Buffer.from(blob.iv,'base64'),tag=Buffer.from(blob.tag,'base64');if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error();
      const key=await scrypt(data.password,salt,32),decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
      unpacked=JSON.parse(Buffer.concat([decipher.update(Buffer.from(blob.data,'base64')),decipher.final()]).toString());
      if(unpacked.version!==1||!unpacked.files||Array.isArray(unpacked.files)||Object.keys(unpacked.files).length>2048)throw Error();
      validateProject(JSON.parse(Buffer.from(unpacked.files['project.json'],'base64').toString()));
      let total=0;for(const [name,value] of Object.entries(unpacked.files)){
        if(!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'||part.endsWith('.lock'))||typeof value!=='string'||(total+=Buffer.byteLength(value,'base64'))>MAX/2)throw Error();
      }
    }catch{fail('Sauvegarde illisible ou phrase de passe incorrecte. Aucune donnée modifiée.');}
    const stage=await fs.mkdtemp(path.join(this.directory,'restore-')),previous=path.join(this.directory,'installation.previous');
    try{
      for(const [name,value] of Object.entries(unpacked.files)){const file=path.join(stage,name);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,Buffer.from(value,'base64'),{mode:0o600,flag:'wx'});}
      await fs.rm(previous,{recursive:true,force:true});await fs.rename(this.installation,previous);
      try{await fs.rename(stage,this.installation);}catch(error){await fs.rename(previous,this.installation);throw error;}
    }finally{await fs.rm(stage,{recursive:true,force:true});}
    this.health.clear();this.event('Configuration et identité Maison restaurées. Gardez l’ancien pont éteint.');return this.snapshot();
  }
  async close(){this.closed=true;this.discoveryAbort?.abort();const runtime=this.running;await Promise.allSettled([...this.activeAdapters].map(adapter=>adapter.close()));if(runtime)await runtime.stop();if(this.running===runtime)this.running=null;}
}
module.exports={DesktopManager,UserError,MAX};
