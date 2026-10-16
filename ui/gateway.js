'use strict';
let editingDevice=null,selectedRoom='*',gatewaySignature='',backupMode='backup';
let lscImports=[],lscSetupGeneration=0;
let currentConversion=null,conversionGeneration=0;
let recoveryPrepared=false;
const textElement=(tag,text,className)=>Object.assign(document.createElement(tag),{textContent:text,...(className?{className}:{})});
const gatewayLocked=()=>Boolean(state.bridge||state.gateway?.active);
async function gatewayAction(action,data={}){const response=await act('gateway-'+action,data);return response?.gatewayResult;}
function downloadFile(filename,content,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderGateway(){
  const gateway=state.gateway||{},locked=gatewayLocked(),devices=gateway.devices||[];
  $('gateway-status').textContent=gateway.active?(gateway.external?'Maison actif · service externe':'Maison activé · commandes verrouillées'):'Maison désactivé';
  $('gateway-status').classList.toggle('on',Boolean(gateway.active));
  $('gateway-summary').textContent=gateway.available?`${devices.length} éclairage${devices.length>1?'s':''} · ${new Set(devices.map(d=>d.room)).size} pièce(s) · ${devices.filter(d=>d.online===true).length} connexion(s) vérifiée(s)`:'Le gestionnaire nécessite le paquet complet Lantern Bridge.';
  $('gateway-health-summary').textContent=gateway.external?'Service externe actif ; consultez ses journaux pour les connexions.':`${devices.filter(d=>d.online===true).length} disponible(s), ${devices.filter(d=>d.online===false).length} indisponible(s), ${devices.filter(d=>d.online==null).length} à vérifier. ${gateway.active?'Reconnexion progressive automatique jusqu’à 60 s entre tentatives.':'Activez Maison pour la surveillance continue.'}`;
  for(const id of ['gateway-health-report','gateway-update-check','gateway-update-preview'])$(id).disabled=pending||!gateway.available;
  $('gateway-catalog').disabled=pending||!gateway.available;
  $('gateway-recover-addresses').disabled=pending||locked||!gateway.available||!devices.some(device=>device.adapter==='lsc-tuya-light');
  $('gateway-recovery-result').textContent=gateway.addressRecovery?.message||'';
  for(const button of $('catalog-models').querySelectorAll('button'))button.disabled=pending||locked;
  for(const id of ['gateway-auto-backup','gateway-auto-backup-enable','gateway-auto-backup-now','gateway-update-download'])$(id).disabled=pending||locked||!gateway.available;
  $('gateway-auto-backup').hidden=Boolean(gateway.backup?.enabled);
  $('gateway-auto-backup-enable').hidden=!recoveryPrepared||Boolean(gateway.backup?.enabled);
  $('gateway-auto-backup-now').disabled=pending||locked||!gateway.backup?.enabled;
  $('gateway-auto-backup-status').textContent=gateway.backup?.error|| (gateway.backup?.enabled?`Sauvegardes automatiques actives · ${gateway.backup.count} fichier(s), 7 maximum.`:'Sauvegardes automatiques non configurées.');
  $('gateway-lock').hidden=!locked;
  $('gateway-error').hidden=!gateway.error&&!gateway.external;
  $('gateway-error').textContent=gateway.external?'Ce pont fonctionne dans un service ou une autre instance. Arrêtez ce service avant de modifier les appareils ; le pont reste accessible dans Maison.':gateway.error||'';
  $('gateway-toggle').textContent=gateway.active?'Désactiver Maison':'Activer Maison';
  $('gateway-toggle').disabled=pending||!gateway.available||Boolean(state.bridge)||gateway.external||(!devices.length&&!gateway.active);
  $('gateway-pairing').disabled=pending||!gateway.active||gateway.external;
  for(const id of ['gateway-add','gateway-conversion','gateway-refresh','gateway-save-name','gateway-name','gateway-backup','gateway-restore','group-on','group-off'])$(id).disabled=pending||locked||!gateway.available;
  for(const id of ['conversion-prepare','conversion-reference','conversion-firmware','conversion-module'])$(id).disabled=pending||locked;
  for(const id of ['conversion-guide','conversion-preflight','conversion-report'])$(id).disabled=pending||locked||!currentConversion;
  if(!devices.length){$('group-on').disabled=true;$('group-off').disabled=true;}
  $('gateway-autostart').disabled=pending||!gateway.available||Boolean(state.bridge);
  $('gateway-autostart').checked=Boolean(state.autostart);
  $('managed-service').hidden=state.platform==='windows';
  $('gateway-autostart-help').textContent=state.platform==='windows'?'Le pont continue près de l’horloge si vous fermez la fenêtre.':'À l’ouverture de la session graphique. Pour un Pi sans écran, utilisez le service ci-dessous.';
  $('gateway-service-download').disabled=pending||!gateway.serviceUnit;
  $('gateway-version').textContent='Version installée : '+(state.version||'…')+'. Les téléchargements sont vérifiés uniquement à votre demande.';
  if(document.activeElement!==$('gateway-name'))$('gateway-name').value=gateway.config?.name||'Lantern Bridge';
  if(locked&&$('device-dialog').open){$('device-dialog').close();clearCredentials();toast('Maison est actif. Désactivez-le avant de modifier les appareils.');}
  if(locked&&$('backup-dialog').open){$('backup-dialog').close();$('backup-form').reset();}
  if(locked&&$('conversion-dialog').open)$('conversion-dialog').close();
  for(const id of ['lsc-discover','lsc-import-file','lsc-import-device'])$(id).disabled=pending||locked;
  for(const button of $('lsc-discovery-results').querySelectorAll('button'))button.disabled=pending||locked;
  const signature=JSON.stringify([devices,locked,pending,selectedRoom,gateway.logs]);
  if(signature===gatewaySignature)return;gatewaySignature=signature;
  const rooms=[...new Set(devices.map(d=>d.room==='Sans pièce'?'':d.room))].sort((a,b)=>a.localeCompare(b));
  $('room-filter').replaceChildren(Object.assign(document.createElement('option'),{value:'*',textContent:'Toutes les pièces'}));
  $('known-rooms').replaceChildren();
  for(const room of rooms){$('room-filter').append(Object.assign(document.createElement('option'),{value:room,textContent:room||'Sans pièce'}));if(room)$('known-rooms').append(Object.assign(document.createElement('option'),{value:room}));}
  if(selectedRoom!=='*'&&!rooms.includes(selectedRoom))selectedRoom='*';$('room-filter').value=selectedRoom;
  $('gateway-devices').replaceChildren();
  if(!devices.length){const empty=textElement('article','', 'card empty-state');empty.append(textElement('h3','Une première lumière ?'),textElement('p','Ajoutez un éclairage compatible, testez sa connexion puis activez Maison.'));$('gateway-devices').append(empty);}
  for(const device of devices.filter(d=>selectedRoom==='*'||(d.room==='Sans pièce'?'':d.room)===selectedRoom)){
    const card=textElement('article','','card light-card'),header=textElement('div','','card-heading'),tile=textElement('span','','icon-tile '+(device.adapter==='magic-lantern-ble'?'blue':device.adapter==='lsc-tuya-light'?'violet':'amber'));
    tile.innerHTML=icon(device.adapter==='magic-lantern-ble'?'bluetooth':'sun');const title=textElement('div','');title.append(textElement('h3',device.name),textElement('p',device.room));header.append(tile,title);card.append(header);
    card.append(textElement('p',device.online===true?(gateway.active?'Disponible':'Connexion vérifiée'):device.online===false?'Indisponible':'Connexion à vérifier','device-health '+(device.online?'online':'')));
    card.append(textElement('small',device.lastConnection?'Dernière connexion : '+new Date(device.lastConnection).toLocaleString('fr-FR'):'Aucune connexion confirmée pendant cette session.'));
    if(device.online===false)card.append(textElement('p',(device.adapter==='magic-lantern-ble'?'Vérifiez Bluetooth, la portée et les autres applications connectées.':'Vérifiez l’alimentation et le réseau local. Réservez une adresse DHCP pour éviter les changements d’IP.')+(device.nextRetry?' Prochaine vérification : '+new Date(device.nextRetry).toLocaleTimeString('fr-FR')+'.':''),'profile-note'));
    card.append(textElement('p',device.adapter==='lsc-tuya-light'?'LSC / Tuya · Wi-Fi local':device.adapter==='openbeken-light'?'OpenBeken · éclairage local':device.adapter==='magic-lantern-ble'?'Magic Lantern · Bluetooth':'Shelly Gen 1 · éclairage','footnote'));
    if(device.profileError||device.profileWarning)card.append(textElement('p',device.profileError||'Le dernier profil n’a pas pu être enregistré. Vérifiez le stockage.','profile-note'));
    if(device.profile){const memory=device.profile,kind=memory.mode==='colour'?'couleur':memory.mode==='white'?'blanc réglable':memory.mode==='relay'?'éclairage':'mode non restituable';card.append(textElement('p',`Profil mémorisé · ${kind}${memory.state.brightness!==undefined?' · '+memory.state.brightness+' %':''} · ${memory.state.on?'allumé':'éteint'}`,'profile-note'));}
    const restore=textElement('button','Rétablir le profil','text-button');restore.disabled=pending||locked||!device.profile?.restorable;restore.onclick=async()=>{if(confirm('Rétablir la dernière consigne mémorisée de « '+device.name+' », y compris son état allumé ou éteint ?')){const result=await gatewayAction('restore-profile',{id:device.id});if(result)toast(result.results.every(x=>x.ok)?'Profil mémorisé rétabli.':'Le profil n’a pas pu être rétabli. Vérifiez la connexion.');}};card.append(restore);
    const actions=textElement('div','','device-actions');
    for(const [name,on] of [['Allumer',true],['Éteindre',false]]){const button=textElement('button',name,'secondary');button.disabled=pending||locked;button.onclick=()=>applyDevice(device.id,{on});actions.append(button);}
    card.append(actions);
    if(device.fields.includes('brightness')){
      const row=textElement('div','','form-row'),label=textElement('label','Luminosité (%)','field'),input=Object.assign(document.createElement('input'),{type:'number',min:'1',max:'100',value:'50'});input.setAttribute('aria-label','Luminosité de '+device.name);input.disabled=pending||locked;label.append(input);const button=textElement('button','Régler','secondary');button.disabled=pending||locked;button.onclick=()=>applyDevice(device.id,{brightness:Number(input.value)});row.append(label,button);card.append(row);
    }
    if(device.fields.includes('hue')){const label=textElement('label','Choisir une couleur','setting-line'),input=Object.assign(document.createElement('input'),{type:'color',value:'#ffb340'});input.setAttribute('aria-label','Couleur de '+device.name);input.disabled=pending||locked;input.onchange=()=>applyDevice(device.id,{...rgbToHsv(input.value),on:true});label.append(input);card.append(label);}
    if(device.fields.includes('colorTemperature')&&device.temperatureRange){
      const range=device.temperatureRange,row=textElement('div','','form-row'),label=textElement('label','Blanc (mireds)','field'),input=Object.assign(document.createElement('input'),{type:'number',min:String(range.min),max:String(range.max),step:'1',value:String(Math.round((range.min+range.max)/2))});input.setAttribute('aria-label','Blanc de '+device.name);input.disabled=pending||locked;label.append(input);
      const button=textElement('button','Régler le blanc','secondary');button.disabled=pending||locked;button.onclick=()=>applyDevice(device.id,{colorTemperature:Number(input.value)});row.append(label,button);card.append(row);
    }
    const manage=textElement('div','','device-actions');
    if(device.adapter==='lsc-tuya-light'){const button=textElement('button','Reprendre après conversion','text-button');button.disabled=pending||locked;button.onclick=()=>{if(confirm('Votre ampoule est-elle déjà convertie et configurée sous OpenBeken ? Lantern vérifiera la lecture avant de remplacer le protocole, en conservant son identifiant.'))openDevice(device,true);};manage.append(button);}
    for(const [name,handler] of [['Modifier',()=>openDevice(device)],['Tester',async()=>{const result=await gatewayAction('test-device',{id:device.id});if(result)toast(result.message);}],['Retirer',async()=>{if(confirm('Retirer « '+device.name+' » du pont ? Ses automatismes Maison pourront nécessiter une adaptation.'))await gatewayAction('remove-device',{id:device.id});}]]){const button=textElement('button',name,'text-button');button.disabled=pending||locked;button.onclick=handler;manage.append(button);}card.append(manage);$('gateway-devices').append(card);
  }
  $('gateway-logs').replaceChildren();
  for(const log of [...(gateway.logs||[])].reverse())$('gateway-logs').append(textElement('p',new Date(log.time).toLocaleTimeString('fr-FR')+' · '+log.message));
  if(!gateway.logs?.length)$('gateway-logs').append(textElement('p','Les prochains événements apparaîtront ici.'));
}
function rgbToHsv(hex){const [r,g,b]=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let hue=0;if(d)hue=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return {hue:(hue*60+360)%360,saturation:max?d/max*100:0};}
async function applyDevice(id,patch){const result=await gatewayAction('apply',{id,patch});if(result)toast(result.results.every(x=>x.ok)?'Commande confirmée.':'Commande non confirmée. Vérifiez la connexion.');}
function clearCredentials(){for(const id of ['new-device-id','new-local-key','new-username','new-password','new-obk-password','lsc-import-file'])$(id).value='';lscImports=[];lscSetupGeneration++;$('lsc-import-device').replaceChildren();$('lsc-import-row').hidden=true;$('lsc-import-status').textContent='';$('lsc-discovery-results').replaceChildren();$('lsc-discovery-status').textContent='';for(const details of $('new-lsc-fields').querySelectorAll('details'))details.open=false;}
function adapterFields(){const adapter=$('new-adapter').value;$('new-ble-fields').hidden=adapter!=='magic-lantern-ble';$('new-lsc-fields').hidden=adapter!=='lsc-tuya-light';$('new-shelly-fields').hidden=adapter!=='shelly-gen1-relay';$('new-openbeken-fields').hidden=adapter!=='openbeken-light';$('new-profile-help').textContent=adapter==='lsc-tuya-light'?'LSC : recherchez sur le réseau ou importez devices.json, puis inspectez les DP. Les profils décrivent des fonctions, pas une compatibilité certifiée de tous les modèles.':adapter==='openbeken-light'?'OpenBeken : l’appareil doit déjà être converti. Choisissez uniquement les fonctions configurées dans son firmware.':adapter==='magic-lantern-ble'?'Magic Lantern : choisissez un contrôleur Bluetooth FFF0 / FFF3. Le test vérifie la connexion sans envoyer de couleur.':'Shelly Gen 1 : indiquez le relais utilisé pour un éclairage, sur son adresse HTTP locale.';}
function openDevice(device=null,converted=false){
  if(gatewayLocked())return toast('Désactivez Maison avant d’ajouter ou modifier un éclairage.');
  editingDevice=device;$('gateway-device-form').reset();clearCredentials();$('new-test-result').textContent='';$('new-probe-result').hidden=true;
  $('device-dialog-title').textContent=device?'Un éclairage à votre façon.':'Faisons connaissance.';
  $('new-name').value=device?.name||'';$('new-room').value=device?.room==='Sans pièce'?'':device?.room||'';
  $('new-adapter').value=converted?'openbeken-light':device?.adapter||'magic-lantern-ble';$('new-adapter').disabled=Boolean(device);
  const options=converted?{}:device?.options||{};
  $('new-address').value=options.address||'';$('new-ip').value=options.ip||'';$('new-version').value=options.version||'3.3';$('new-profile').value=options.profile||'rgbcct-v2';$('new-dps').value=options.dps?JSON.stringify(options.dps):'';
  $('new-host').value=options.host||'';$('new-channel').value=options.channel??0;
  $('new-obk-host').value=converted&&device?.options.ip?'http://'+device.options.ip:options.host||'';$('new-obk-profile').value=options.profile==='dimmer'?'dimmer':'cct';
  adapterFields();$('device-dialog').showModal();$('new-name').focus();
}
function draftDevice(){
  const adapter=$('new-adapter').value,same=editingDevice?.adapter===adapter,options=same?{...editingDevice.options}:{},draft={name:$('new-name').value.trim(),room:$('new-room').value.trim(),adapter,options};
  if(editingDevice)draft.id=editingDevice.id;
  if(adapter==='magic-lantern-ble')options.address=$('new-address').value.trim().toUpperCase();
  if(adapter==='lsc-tuya-light'){
    Object.assign(options,{ip:$('new-ip').value.trim(),version:$('new-version').value,profile:$('new-profile').value});
    if($('new-dps').value.trim())options.dps=JSON.parse($('new-dps').value);else delete options.dps;
    const deviceId=$('new-device-id').value.trim(),localKey=$('new-local-key').value;
    if(deviceId||localKey)draft.credentials={deviceId,localKey};
    if(!draft.credentials&&!options.deviceIdEnv)throw Error('Saisissez l’identifiant et la clé locale de votre éclairage.');
  }
  if(adapter==='shelly-gen1-relay'){
    Object.assign(options,{host:$('new-host').value.trim(),channel:Number($('new-channel').value)});
    const username=$('new-username').value,password=$('new-password').value;if(username||password)draft.credentials={username,password};
  }
  if(adapter==='openbeken-light'){
    Object.assign(options,{host:$('new-obk-host').value.trim(),profile:$('new-obk-profile').value});
    const password=$('new-obk-password').value;if(password)draft.credentials={password};
  }
  return draft;
}
$('lsc-discover').onclick=async()=>{
  if(gatewayLocked()||pending)return;
  const generation=lscSetupGeneration;$('lsc-discovery-results').replaceChildren();$('lsc-discovery-status').textContent='Recherche sur le réseau pendant 8 secondes…';
  const result=await gatewayAction('discover-lsc');
  if(generation!==lscSetupGeneration||!$('device-dialog').open||gatewayLocked())return;
  $('lsc-discovery-status').textContent=result?result.message+(result.partial?' Certains ports ne sont pas accessibles ; la recherche est partielle.':''):'Recherche impossible. Vérifiez le réseau et les autorisations du pare-feu.';
  for(const device of result?.devices||[]){
    const row=textElement('div','','device-actions'),label=textElement('span',`${device.ip} · Tuya ${device.version} · ${device.deviceId}`),button=textElement('button','Utiliser pour mon éclairage','secondary');button.type='button';
    button.onclick=()=>{
      if(gatewayLocked()||pending)return;
      // Do not reuse the previous device's key when changing the selected identity.
      if($('new-device-id').value!==device.deviceId)$('new-local-key').value='';
      $('new-ip').value=device.ip;$('new-version').value=device.version;$('new-device-id').value=device.deviceId;
      $('lsc-discovery-status').textContent='Adresse, identifiant et version renseignés. Importez ou saisissez la clé locale, puis inspectez les DP avant de choisir un profil.';
      $('new-local-key').focus();
    };
    row.append(label,button);$('lsc-discovery-results').append(row);
  }
};
$('lsc-import-file').onchange=async()=>{
  if(gatewayLocked()||pending)return;
  const generation=lscSetupGeneration,file=$('lsc-import-file').files[0];lscImports=[];$('lsc-import-device').replaceChildren();$('lsc-import-row').hidden=true;
  if(!file)return;
  try{
    if(file.size>1024*1024)throw Error();
    const data=JSON.parse(await file.text()),rows=Array.isArray(data)?data:data?.devices;
    if(generation!==lscSetupGeneration||gatewayLocked()||!$('device-dialog').open)return;
    if(!Array.isArray(rows)||!rows.length||rows.length>256)throw Error();
    const ids=new Set();
    for(const row of rows){
      if(!row||typeof row!=='object')continue;
      const deviceId=row.id??row.dev_id,localKey=row.key??row.local_key;
      if(typeof deviceId!=='string'||!/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)||typeof localKey!=='string'||!/^[\x20-\x7e]{16}$/.test(localKey))continue;
      if(ids.has(deviceId))throw Error();ids.add(deviceId);
      const name=typeof row.name==='string'?row.name.replace(/[\x00-\x1f\x7f]/g,'').slice(0,64):'';
      const ip=typeof row.ip==='string'&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(row.ip)&&row.ip.split('.').every(n=>Number(n)<=255)?row.ip:null;
      const version=['3.1','3.3','3.4','3.5'].includes(String(row.version))?String(row.version):null;
      lscImports.push({deviceId,localKey,name,ip,version});
    }
    if(!lscImports.length)throw Error();
    $('lsc-import-device').append(Object.assign(document.createElement('option'),{value:'',textContent:'Choisissez votre éclairage…'}));
    lscImports.forEach((row,index)=>$('lsc-import-device').append(Object.assign(document.createElement('option'),{value:String(index),textContent:(row.name||'Appareil')+' · '+row.deviceId})));
    $('lsc-import-row').hidden=false;$('lsc-import-status').textContent=`${lscImports.length} identifiant(s) disponible(s). Sélectionnez uniquement une ampoule, un ruban ou un luminaire ; aucun appareil n’est ajouté automatiquement.`;
  }catch{
    if(generation!==lscSetupGeneration)return;
    lscImports=[];$('lsc-import-device').replaceChildren();$('lsc-import-row').hidden=true;$('lsc-import-status').textContent='Fichier invalide ou sans clé locale utilisable. Format attendu : devices.json TinyTuya, 1 Mo et 256 appareils maximum, sans identifiant en double.';
  }finally{if(generation===lscSetupGeneration)$('lsc-import-file').value='';}
};
$('lsc-import-device').onchange=()=>{
  if(gatewayLocked()||pending||$('lsc-import-device').value==='')return;
  const row=lscImports[Number($('lsc-import-device').value)];if(!row)return;
  const same=$('new-device-id').value===row.deviceId;
  if(!same)$('new-ip').value='';
  $('new-device-id').value=row.deviceId;$('new-local-key').value=row.localKey;
  if(row.ip)$('new-ip').value=row.ip;if(row.version)$('new-version').value=row.version;
  if(!$('new-name').value&&row.name)$('new-name').value=row.name;
  $('lsc-import-status').textContent='Identifiants renseignés. '+(!row.ip&&!same?'Renseignez ou détectez l’adresse IP. ':'')+(!row.version?'Vérifiez la version du protocole. ':'')+'Inspectez les DP avant de choisir un profil.';
};
$('gateway-add').onclick=()=>openDevice();$('close-device').onclick=()=>{$('device-dialog').close();clearCredentials();};
$('device-dialog').addEventListener('close',clearCredentials);$('new-adapter').onchange=()=>{clearCredentials();adapterFields();};
$('use-current-device').onclick=()=>{if(!state.device)return toast('Sélectionnez d’abord votre contrôleur dans Appareils.');$('new-address').value=state.device;if(!$('new-name').value)$('new-name').value=state.deviceName||'Mon éclairage';};
$('gateway-device-form').onsubmit=async event=>{event.preventDefault();try{const result=await gatewayAction('save-device',{...draftDevice(),requireTest:true});if(result){$('device-dialog').close();clearCredentials();toast('Connexion vérifiée et éclairage enregistré. Vous pouvez réactiver Maison.');}}catch(error){toast(error.message);}};
async function testDraft(probe){try{const result=await gatewayAction('test-device',{draft:draftDevice(),probe});if(result){$('new-test-result').textContent=result.message;if(probe){$('new-probe-result').hidden=false;$('new-probe-result').textContent=JSON.stringify(result.details,null,2);}}}catch(error){toast(error.message);}}
$('new-test').onclick=()=>testDraft(false);$('new-probe').onclick=()=>testDraft(true);
$('room-filter').onchange=()=>{selectedRoom=$('room-filter').value;renderGateway();};
for(const [id,on] of [['group-on',true],['group-off',false]])$(id).onclick=async()=>{const result=await gatewayAction('apply-group',{on,...(selectedRoom==='*'?{}:{room:selectedRoom})});if(result){const failed=result.results.filter(x=>!x.ok).length;toast(failed?`${failed} éclairage(s) sans confirmation. Les autres commandes ont été appliquées.`:'Commandes confirmées.');}};
$('gateway-toggle').onclick=()=>gatewayAction(state.gateway?.active?'stop':'start');
$('gateway-refresh').onclick=()=>gatewayAction('refresh-devices');
$('gateway-pairing').onclick=async()=>{const result=await gatewayAction('pairing');if(result){$('pairing-image').src=result.image;$('pairing-code').textContent=result.code;$('pairing-dialog').showModal();}};
$('gateway-settings').onsubmit=event=>{event.preventDefault();gatewayAction('settings',{name:$('gateway-name').value.trim()});};
$('gateway-autostart').onchange=()=>act('gateway-autostart',{enabled:$('gateway-autostart').checked});
$('gateway-service-download').onclick=()=>downloadFile('lantern-bridge-desktop.service',state.gateway.serviceUnit,'text/plain');
function openBackup(mode){if(gatewayLocked())return toast('Désactivez Maison avant cette opération.');backupMode=mode;$('backup-form').reset();$('restore-file-row').hidden=mode!=='restore';$('restore-key-row').hidden=mode!=='restore';$('restore-file').required=mode==='restore';$('backup-title').textContent=mode==='restore'?'Retrouver votre installation.':mode==='auto'?'Votre clé de récupération.':'Gardez votre maison.';$('backup-submit').textContent=mode==='restore'?'Restaurer cette installation':mode==='auto'?'Télécharger ma clé de récupération':'Télécharger la sauvegarde';$('backup-dialog').showModal();}
$('gateway-auto-backup').onclick=()=>openBackup('auto');
$('gateway-auto-backup-enable').onclick=async()=>{if(confirm('Avez-vous conservé le fichier de récupération et sa phrase de passe ailleurs que sur ce PC ? Sans eux, les sauvegardes automatiques seront irrécupérables.')){const result=await gatewayAction('auto-backup-enable',{savedRecovery:true});if(result){recoveryPrepared=false;renderGateway();toast('Sauvegardes automatiques activées.');}}};
$('gateway-auto-backup-now').onclick=()=>gatewayAction('auto-backup-now');
$('gateway-health-report').onclick=async()=>{const result=await gatewayAction('health-report');if(result)downloadFile('Lantern-diagnostic.json',JSON.stringify(result,null,2));};
$('gateway-recover-addresses').onclick=async()=>{const result=await gatewayAction('recover-addresses');if(result)toast(result.report.message);};
$('close-catalog').onclick=()=>$('catalog-dialog').close();
$('gateway-catalog').onclick=async()=>{
  const catalog=await gatewayAction('model-catalog');if(!catalog)return;
  $('catalog-note').textContent=catalog.note;$('catalog-models').replaceChildren();
  const labels={'documented-variant':'Variante documentée · matériel non validé',unverified:'Modèle à vérifier'};
  for(const model of catalog.models){
    const card=textElement('section','','card');card.append(textElement('h3',model.name),textElement('p',labels[model.validation]),textElement('p',model.limits));
    const source=textElement('a','Source du modèle');source.href=model.source;source.target='_blank';source.rel='noopener noreferrer';const actions=textElement('div','','device-actions');actions.append(source);
    const button=textElement('button','Configurer cet éclairage','secondary');button.disabled=pending||gatewayLocked();
    button.onclick=()=>{if(gatewayLocked())return;$('catalog-dialog').close();openDevice();$('new-name').value=model.name;$('new-adapter').value=model.adapter;adapterFields();if(model.profiles.length)$('new-profile').value=model.profiles[0];$('new-test-result').textContent='Profil candidat uniquement. Inspectez les DP avant de tester et enregistrer.';};
    actions.append(button);card.append(actions);$('catalog-models').append(card);
  }
  const functions={on:'marche/arrêt',brightness:'luminosité',hue:'teinte',saturation:'saturation',colorTemperature:'blanc réglable'};
  $('catalog-profiles').replaceChildren(...catalog.profiles.map(profile=>textElement('p',profile.id+' — '+profile.functions.map(field=>functions[field]).join(', ')+' · simulateur, sans validation physique')));
  $('catalog-dialog').showModal();
};
$('gateway-update-check').onclick=async()=>{const result=await gatewayAction('update-check',{includePrerelease:$('gateway-update-preview').checked});if(result)$('gateway-update-result').textContent=result.available?`Version ${result.latest} disponible.`:'Aucune version plus récente sur ce canal.';};
$('gateway-update-download').onclick=async()=>{const result=await gatewayAction('update-download',{includePrerelease:$('gateway-update-preview').checked});if(result)$('gateway-update-result').textContent=`Paquet vérifié : ${result.path}\nSHA-256 : ${result.sha256}\nQuittez Lantern avant installation. ${result.rollback}`;};
$('gateway-backup').onclick=()=>openBackup('backup');$('gateway-restore').onclick=()=>openBackup('restore');$('close-backup').onclick=()=>{$('backup-dialog').close();$('backup-form').reset();};
$('backup-dialog').addEventListener('close',()=>$('backup-form').reset());
$('backup-form').onsubmit=async event=>{
  event.preventDefault();try{
    const data={password:$('backup-password').value};
    if(backupMode==='restore'){
      const file=$('restore-file').files[0];if(!file||file.size>2*1024*1024)throw Error('Choisissez une sauvegarde Lantern de moins de 2 Mo.');
      if(!confirm('Remplacer la configuration et l’identité Maison du nouveau pont ? Gardez l’ancien pont éteint.'))return;data.backup=await file.text();
      const recovery=$('restore-key-file').files[0];if(recovery){if(recovery.size>16384)throw Error('Clé de récupération trop volumineuse.');data.recoveryKey=await recovery.text();}
    }
    const result=await gatewayAction(backupMode==='auto'?'auto-backup-prepare':backupMode,data);
    if(result){if(backupMode==='backup')downloadFile(result.filename,result.backup);if(backupMode==='auto'){downloadFile(result.filename,result.recovery);recoveryPrepared=true;renderGateway();}$('backup-form').reset();$('backup-dialog').close();toast(backupMode==='backup'?'Sauvegarde chiffrée téléchargée.':backupMode==='auto'?'Conservez le fichier et sa phrase de passe, puis confirmez l’activation.':'Installation restaurée. Vous pouvez réactiver Maison.');}
  }catch(error){toast(error.message);}
};
function resetConversion(){currentConversion=null;conversionGeneration++;$('conversion-result').hidden=true;}
$('gateway-conversion').onclick=()=>{if(gatewayLocked()||pending)return;resetConversion();$('conversion-dialog').showModal();};
$('close-conversion').onclick=()=>$('conversion-dialog').close();
$('conversion-dialog').addEventListener('close',resetConversion);
for(const id of ['conversion-reference','conversion-firmware','conversion-module'])$(id).oninput=resetConversion;
$('conversion-form').onsubmit=async event=>{
  event.preventDefault();if(gatewayLocked()||pending)return;
  resetConversion();const generation=conversionGeneration;
  const result=await gatewayAction('conversion-plan',{reference:$('conversion-reference').value.trim(),firmware:$('conversion-firmware').value.trim(),module:$('conversion-module').value.trim()});
  if(!result||generation!==conversionGeneration||!$('conversion-dialog').open||gatewayLocked())return;
  currentConversion=result;$('conversion-title').textContent=result.title;$('conversion-status').textContent=result.message;
  const assessment=result.assessment,labels={match:'Correspondance déclarée',mismatch:'Écart avec le catalogue',unknown:'Information manquante',incomplete:'Informations incomplètes',candidate:'Profil candidat, matériel à vérifier'};
  $('conversion-assessment').textContent='Comparaison locale uniquement · puce non détectée · aucun exploit exécuté.';
  $('conversion-candidates').replaceChildren(...assessment.candidates.map(candidate=>{
    const card=document.createElement('section');card.append(textElement('h4',labels[candidate.status]));
    card.append(textElement('p',`${candidate.module} / ${candidate.chip} · firmware ${candidate.firmware} dans le catalogue`));
    const checks=document.createElement('ul');checks.append(...candidate.checks.map(check=>textElement('li',`${check.name} — ${labels[check.status]} : ${check.detail}`)));card.append(checks);
    const source=textElement('a','Consulter la fiche Cloudcutter');source.href=candidate.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);return card;
  }));
  $('conversion-blockers').replaceChildren(...assessment.blockers.map(reason=>textElement('li',reason)));
  $('conversion-testimony').replaceChildren();
  if(assessment.testimony){$('conversion-testimony').append(document.createTextNode(assessment.testimony.note+' '));const source=textElement('a','Lire le témoignage');source.href=assessment.testimony.source;source.target='_blank';source.rel='noopener noreferrer';$('conversion-testimony').append(source);}
  $('conversion-steps').replaceChildren(...result.steps.map(step=>textElement('li',step)));$('conversion-hash').textContent='SHA-256 du diagnostic : '+result.preflightSHA256;
  $('conversion-result').hidden=false;renderGateway();
};
$('conversion-guide').onclick=()=>{if(currentConversion&&!gatewayLocked()&&!pending)downloadFile('Preparation-LSC-'+currentConversion.reference+'.md',currentConversion.guide,'text/markdown');};
$('conversion-preflight').onclick=()=>{if(currentConversion&&!gatewayLocked()&&!pending)downloadFile('verifier-conversion.py',currentConversion.preflight,'text/x-python');};
$('conversion-report').onclick=()=>{if(currentConversion&&!gatewayLocked()&&!pending)downloadFile('Compatibilite-LSC-'+currentConversion.reference+'.json',JSON.stringify(currentConversion.assessment,null,2),'application/json');};
renderGateway();
