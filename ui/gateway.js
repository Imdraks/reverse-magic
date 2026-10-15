'use strict';
let editingDevice=null,selectedRoom='*',gatewaySignature='',backupMode='backup';
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
  $('gateway-lock').hidden=!locked;
  $('gateway-error').hidden=!gateway.error&&!gateway.external;
  $('gateway-error').textContent=gateway.external?'Ce pont fonctionne dans un service ou une autre instance. Arrêtez ce service avant de modifier les appareils ; le pont reste accessible dans Maison.':gateway.error||'';
  $('gateway-toggle').textContent=gateway.active?'Désactiver Maison':'Activer Maison';
  $('gateway-toggle').disabled=pending||!gateway.available||Boolean(state.bridge)||gateway.external||(!devices.length&&!gateway.active);
  $('gateway-pairing').disabled=pending||!gateway.active||gateway.external;
  for(const id of ['gateway-add','gateway-refresh','gateway-save-name','gateway-name','gateway-backup','gateway-restore','group-on','group-off'])$(id).disabled=pending||locked||!gateway.available;
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
    card.append(textElement('p',device.adapter==='lsc-tuya-light'?'LSC / Tuya · Wi-Fi local':device.adapter==='magic-lantern-ble'?'Magic Lantern · Bluetooth':'Shelly Gen 1 · éclairage','footnote'));
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
    const manage=textElement('div','','device-actions');
    for(const [name,handler] of [['Modifier',()=>openDevice(device)],['Tester',async()=>{const result=await gatewayAction('test-device',{id:device.id});if(result)toast(result.message);}],['Retirer',async()=>{if(confirm('Retirer « '+device.name+' » du pont ? Ses automatismes Maison pourront nécessiter une adaptation.'))await gatewayAction('remove-device',{id:device.id});}]]){const button=textElement('button',name,'text-button');button.disabled=pending||locked;button.onclick=handler;manage.append(button);}card.append(manage);$('gateway-devices').append(card);
  }
  $('gateway-logs').replaceChildren();
  for(const log of [...(gateway.logs||[])].reverse())$('gateway-logs').append(textElement('p',new Date(log.time).toLocaleTimeString('fr-FR')+' · '+log.message));
  if(!gateway.logs?.length)$('gateway-logs').append(textElement('p','Les prochains événements apparaîtront ici.'));
}
function rgbToHsv(hex){const [r,g,b]=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let hue=0;if(d)hue=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return {hue:(hue*60+360)%360,saturation:max?d/max*100:0};}
async function applyDevice(id,patch){const result=await gatewayAction('apply',{id,patch});if(result)toast(result.results.every(x=>x.ok)?'Commande confirmée.':'Commande non confirmée. Vérifiez la connexion.');}
function clearCredentials(){for(const id of ['new-device-id','new-local-key','new-username','new-password'])$(id).value='';}
function adapterFields(){const adapter=$('new-adapter').value;$('new-ble-fields').hidden=adapter!=='magic-lantern-ble';$('new-lsc-fields').hidden=adapter!=='lsc-tuya-light';$('new-shelly-fields').hidden=adapter!=='shelly-gen1-relay';}
function openDevice(device=null){
  if(gatewayLocked())return toast('Désactivez Maison avant d’ajouter ou modifier un éclairage.');
  editingDevice=device;$('gateway-device-form').reset();clearCredentials();$('new-test-result').textContent='';$('new-probe-result').hidden=true;
  $('device-dialog-title').textContent=device?'Un éclairage à votre façon.':'Faisons connaissance.';
  $('new-name').value=device?.name||'';$('new-room').value=device?.room==='Sans pièce'?'':device?.room||'';
  $('new-adapter').value=device?.adapter||'magic-lantern-ble';$('new-adapter').disabled=Boolean(device);
  const options=device?.options||{};
  $('new-address').value=options.address||'';$('new-ip').value=options.ip||'';$('new-version').value=options.version||'3.3';$('new-profile').value=options.profile||'rgbcct-v2';$('new-dps').value=options.dps?JSON.stringify(options.dps):'';
  $('new-host').value=options.host||'';$('new-channel').value=options.channel??0;adapterFields();$('device-dialog').showModal();$('new-name').focus();
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
  return draft;
}
$('gateway-add').onclick=()=>openDevice();$('close-device').onclick=()=>{$('device-dialog').close();clearCredentials();};
$('device-dialog').addEventListener('close',clearCredentials);$('new-adapter').onchange=()=>{clearCredentials();adapterFields();};
$('use-current-device').onclick=()=>{if(!state.device)return toast('Sélectionnez d’abord votre contrôleur dans Appareils.');$('new-address').value=state.device;if(!$('new-name').value)$('new-name').value=state.deviceName||'Mon éclairage';};
$('gateway-device-form').onsubmit=async event=>{event.preventDefault();try{const result=await gatewayAction('save-device',draftDevice());if(result){$('device-dialog').close();clearCredentials();toast('Éclairage enregistré. Vous pouvez réactiver Maison.');}}catch(error){toast(error.message);}};
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
function openBackup(mode){if(gatewayLocked())return toast('Désactivez Maison avant cette opération.');backupMode=mode;$('backup-form').reset();$('restore-file-row').hidden=mode!=='restore';$('restore-file').required=mode==='restore';$('backup-title').textContent=mode==='restore'?'Retrouver votre installation.':'Gardez votre maison.';$('backup-submit').textContent=mode==='restore'?'Restaurer cette installation':'Télécharger la sauvegarde';$('backup-dialog').showModal();}
$('gateway-backup').onclick=()=>openBackup('backup');$('gateway-restore').onclick=()=>openBackup('restore');$('close-backup').onclick=()=>{$('backup-dialog').close();$('backup-form').reset();};
$('backup-dialog').addEventListener('close',()=>$('backup-form').reset());
$('backup-form').onsubmit=async event=>{
  event.preventDefault();try{
    const data={password:$('backup-password').value};
    if(backupMode==='restore'){
      const file=$('restore-file').files[0];if(!file||file.size>2*1024*1024)throw Error('Choisissez une sauvegarde Lantern de moins de 2 Mo.');
      if(!confirm('Remplacer la configuration et l’identité Maison du nouveau pont ? Gardez l’ancien pont éteint.'))return;data.backup=await file.text();
    }
    const result=await gatewayAction(backupMode,data);
    if(result){if(backupMode==='backup')downloadFile(result.filename,result.backup);$('backup-dialog').close();toast(backupMode==='backup'?'Sauvegarde chiffrée téléchargée.':'Installation restaurée. Vous pouvez réactiver Maison.');}
  }catch(error){toast(error.message);}
};
renderGateway();
