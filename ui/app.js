'use strict';
const $ = id => document.getElementById(id);
const icons={grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',spark:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/>',home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',bluetooth:'<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',exit:'<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h13"/>',moon:'<path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/>',chevron:'<path d="m9 6 6 6-6 6"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',palette:'<circle cx="8" cy="9" r=".5"/><circle cx="13" cy="7" r=".5"/><circle cx="17" cy="11" r=".5"/><path d="M12 3a9 9 0 0 0 0 18c5 0 1-4 4-5h2c5 0 4-13-6-13Z"/>',plus:'<path d="M12 5v14M5 12h14"/>',play:'<path d="m8 4 12 8-12 8Z"/>',music:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.spark}</svg>`;}
function hydrate(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
hydrate();
const webview=window.chrome?.webview;
const requests=new Map();let sequence=0;
if(webview) webview.addEventListener('message',event=>{
  const data=event.data;
  if(data.kind==='state'){render(data.state);return;}
  const pending=requests.get(data.id);if(!pending)return;requests.delete(data.id);clearTimeout(pending.timer);
  if(data.ok)pending.resolve(data.result);else pending.reject(new Error(data.error||'Opération impossible.'));
});
const emptyDeviceList=$('device-list').firstElementChild.cloneNode(true);
let token='';
if(!webview){
  const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('key')||sessionStorage.getItem('lantern-session')||'';
  if(token){sessionStorage.setItem('lantern-session',token);history.replaceState(null,'',location.pathname);}
}
async function rpc(action,data={}){
  const timeout=action==='connect'?65000:40000;
  if(webview)return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{requests.delete(id);reject(new Error('Le contrôleur ne répond pas. Réessayez après reconnexion.'));},timeout);
    requests.set(id,{resolve,reject,timer});webview.postMessage({id,action,data});
  });
  const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Opération impossible.');return result.result;
}
let state={connected:false,bridge:false,on:false,brightness:100,rgb:'FFB340',mic:false,devices:[],effects:[],platform:'linux'},pending=false,busyAction='',toastTimer,activePage='gateway',effectSignature='';
const titles={gateway:['Le pont','Votre maison, réunie.','Un pont local. Des appareils qui se retrouvent dans Maison.'],overview:['Vue d’ensemble','La lumière, simplement.','Un peu de couleur. Une autre atmosphère.'],ambience:['Ambiances','À chaque instant, sa couleur.','Choisissez une teinte. Laissez le reste s’effacer.'],home:['Maison','Tout naturellement, ensemble.','Votre lumière trouve sa place dans Maison.'],devices:['Appareils','Le début d’une belle connexion.','Retrouvez vos LED et rapprochez les choses.']};
function openPage(page){
  activePage=page;document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
  document.querySelectorAll('.nav-item').forEach(el=>{el.classList.toggle('active',el.dataset.page===page);el.setAttribute('aria-current',el.dataset.page===page?'page':'false');});
  $('breadcrumb').textContent=titles[page][0];$('page-title').textContent=titles[page][1];$('page-subtitle').textContent=titles[page][2];window.scrollTo({top:0});
}
document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>openPage(el.dataset.page));
document.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>openPage(el.dataset.open));
$('connection-pill').onclick=()=>openPage('devices');
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
async function act(action,data={},success){
  if(pending)return;pending=true;busyAction=action;document.body.classList.add('pending');render(state);
  try{const result=await rpc(action,data);if(result?.state)render(result.state);else await refresh();if(success)toast(success);return result;}
  catch(error){toast(error.message);return null;}
  finally{pending=false;busyAction='';document.body.classList.remove('pending');render(state);}
}
function range(id,value){const el=$(id);if(!el.matches(':active')&&!pending)el.value=value;el.style.setProperty('--fill',el.value+'%');}
function render(next){
  state={...state,...next};
  $('gateway-command').textContent=state.platform==='windows'?'node.exe gateway/cli.js init --config bridge.json':'./lantern gateway init --config bridge.json';
  $('connection-text').textContent=state.connected?(state.deviceName||'LED connectées'):'Non connecté';
  $('connection-pill').classList.toggle('online',state.connected);
  $('light-name').textContent=state.deviceName||'Lumière principale';
  $('light-description').textContent=state.connected?'Votre espace, sous une autre lumière.':'Connectez votre ruban et composez votre ambiance.';
  $('power').setAttribute('aria-checked',String(state.on));$('power').setAttribute('aria-label',state.on?'Éteindre la lumière':'Allumer la lumière');
  $('mic').setAttribute('aria-checked',String(state.mic));
  $('power-label').textContent=state.on?'Allumée':'Éteinte';$('brightness-summary').textContent=state.on?`À ${state.brightness} % de luminosité`:'Prête à s’illuminer';
  document.querySelector('.hero').classList.toggle('lit',state.on&&state.connected);
  document.documentElement.style.setProperty('--lamp-color','#'+state.rgb);
  range('brightness',state.brightness);$('brightness-value').replaceChildren(document.createTextNode(String(state.brightness)),Object.assign(document.createElement('span'),{textContent:'%'}));
  document.querySelectorAll('.manual').forEach(el=>el.disabled=!state.connected||state.bridge||pending);
  document.querySelectorAll('.swatch').forEach(el=>el.classList.toggle('selected',el.dataset.rgb===state.rgb));
  if(document.activeElement!==$('custom-color'))$('custom-color').value='#'+state.rgb;
  const swatch=swatches.find(item=>item[0]===state.rgb);$('color-caption').textContent=swatch?swatch[1]:'Votre couleur personnelle';
  $('mode-notice').hidden=!state.bridge;$('home-dot').classList.toggle('on',state.bridge);
  $('home-status').textContent=state.bridge?(state.connected?'Pont actif · LED connectées':'Pont actif · Reconnexion…'):'Pont désactivé';$('home-status').classList.toggle('on',state.bridge&&state.connected);
  $('bridge-toggle').textContent=state.bridge?'Arrêter le pont':'Activer le pont';$('bridge-toggle').disabled=pending||(!state.device&&!state.bridge);
  $('pairing').disabled=pending||!state.pairingReady;$('scan').disabled=pending||state.bridge;$('scan').classList.toggle('busy-spin',pending&&busyAction==='scan');
  $('reconnect').disabled=pending||state.bridge||!state.device;$('disconnect').disabled=pending||state.bridge||!state.connected;
  $('autostart-row').hidden=state.platform!=='windows';$('linux-service').hidden=state.platform==='windows';$('autostart').checked=Boolean(state.autostart);$('autostart').disabled=pending;
  $('home-explanation').textContent=state.platform==='windows'?'Fermer la fenêtre laisse le pont actif près de l’horloge. Gardez votre PC allumé, sans veille.':'Gardez ce Raspberry Pi ou PC Linux allumé et à portée des LED. Le mode service fonctionne aussi sans interface graphique.';
  $('service-command').textContent=`./lantern service --device ${state.device||'ADRESSE_LED'} --install`;
  $('device-detail').textContent=state.device?`${state.deviceName||'Contrôleur LED'} · ${state.device}`:'Aucun contrôleur sélectionné.';
  $('status-text').textContent=state.status||'Un éclairage personnel. Sans compte, sans cloud.';
  renderFavorites();
  $('connection-progress').hidden=!state.connecting;$('connection-attempt').textContent=`Tentative ${state.connectionAttempt||1} sur 2. Aucun réglage lumineux n’est réappliqué.`;
  $('connection-issue').hidden=!state.connectionIssue;
  if(state.connectionIssue){$('issue-title').textContent=state.connectionIssue.title;$('issue-message').textContent=state.connectionIssue.message;}
  $('favorite-save').disabled=pending||!state.connected||state.bridge||!state.canSaveFavorite;
  $('diagnose').disabled=pending;$('check-updates').disabled=pending;
  const signature=JSON.stringify([state.devices,state.connected,state.device,pending,state.bridge]);
  if($('device-list').dataset.signature!==signature){$('device-list').dataset.signature=signature;renderDevices();}
  const effects=state.effects||[];
  const sig=effects.map(e=>e.code+':'+e.isScene).join(',');
  if(sig!==effectSignature){effectSignature=sig;$('effect').replaceChildren();const groups=new Map();for(const effect of effects){if(!groups.has(effect.group)){const group=document.createElement('optgroup');group.label=effect.group;groups.set(effect.group,group);$('effect').append(group);}const option=document.createElement('option');option.value=JSON.stringify({id:effect.code,scene:effect.isScene});option.textContent=effect.name;groups.get(effect.group).append(option);}}
}
function renderDevices(){
  const devices=state.devices||[];if(!devices.length){$('device-list').replaceChildren(emptyDeviceList.cloneNode(true));return;}
  $('device-list').replaceChildren();for(const device of devices){const row=document.createElement('div');row.className='device-row';const tile=document.createElement('span');tile.className='icon-tile blue';tile.innerHTML=icon('bluetooth');const text=document.createElement('div');const name=document.createElement('strong');name.textContent=device.name;const detail=document.createElement('small');detail.textContent=device.address+(device.rssi?' · '+device.rssi+' dBm':'');text.append(name,detail);const button=document.createElement('button');button.className='secondary';button.textContent=state.connected&&state.device===device.address?'Connecté':'Connecter';button.disabled=pending||state.bridge||(state.connected&&state.device===device.address);button.onclick=()=>act('connect',{address:device.address,name:device.name},'Votre lumière est connectée.');row.append(tile,text,button);$('device-list').append(row);}
}
let favoriteSignature='';
function renderFavorites(){
  const signature=JSON.stringify([state.favorites,state.connected,state.bridge,pending,state.favoritesError]);
  if(signature===favoriteSignature)return;favoriteSignature=signature;
  $('favorites-list').replaceChildren();
  $('favorites-note').textContent=state.favoritesError||((state.favorites||[]).length?'Un clic pour retrouver votre ambiance.':'Choisissez une couleur ou une animation pour créer votre premier favori.');
  for(const favorite of state.favorites||[]){
    const row=document.createElement('div');row.className='favorite-card';
    const apply=document.createElement('button');apply.className='favorite-apply';apply.setAttribute('aria-label','Appliquer '+favorite.name);apply.disabled=pending||!state.connected||state.bridge;
    const dot=document.createElement('span');dot.className='favorite-dot';dot.style.backgroundColor='#'+favorite.rgb;
    const text=document.createElement('span');const title=document.createElement('strong');title.textContent=favorite.name;const caption=document.createElement('small');caption.textContent=(favorite.mode==='effect'?'Animation':'Couleur')+' · '+favorite.brightness+' %';text.append(title,caption);apply.append(dot,text);apply.onclick=()=>act('favorite-apply',{id:favorite.id},favorite.name+' — votre ambiance est prête.');
    const remove=document.createElement('button');remove.className='icon-button';remove.setAttribute('aria-label','Supprimer '+favorite.name);remove.innerHTML=icon('close');remove.disabled=pending;remove.onclick=()=>{if(confirm('Supprimer le favori « '+favorite.name+' » ?'))act('favorite-delete',{id:favorite.id});};
    row.append(apply,remove);$('favorites-list').append(row);
  }
}
$('favorite-save').onclick=()=>{$('favorite-name').value='';$('favorite-dialog').showModal();$('favorite-name').focus();};
$('close-favorite').onclick=()=>$('favorite-dialog').close();
$('favorite-form').onsubmit=async event=>{event.preventDefault();$('confirm-favorite').disabled=true;const result=await act('favorite-save',{name:$('favorite-name').value});$('confirm-favorite').disabled=false;if(result){$('favorite-dialog').close();toast('Favori enregistré.');}};
$('cancel-connect').onclick=async()=>{try{await rpc('cancel-connect');}catch(error){toast(error.message);}};
$('diagnose').onclick=async()=>{const result=await act('diagnose');if(!result)return;$('diagnostics-list').replaceChildren();for(const check of result.checks){const row=document.createElement('p');const label=document.createElement('strong');label.textContent=(check.ok===true?'✓ ':check.ok===false?'! ':'• ')+check.label;const message=document.createElement('span');message.textContent=check.message;row.append(label,message);$('diagnostics-list').append(row);}};
$('check-updates').onclick=async()=>{const result=await act('check-updates');if(result)$('update-status').textContent=result.available?`La version ${result.latest} est disponible. Votre version : ${result.current}.`:`Vous utilisez la version ${result.current}. Aucune version plus récente publiée.`;};
$('open-downloads').onclick=()=>act('open-downloads');
const swatches=[['FFB340','Ambre doux'],['FF765E','Corail'],['F4A7BE','Rose poudré'],['C6A3EF','Lavande'],['7FAEF5','Bleu ciel'],['7DC8AC','Sauge'],['F3DCA5','Blanc chaud'],['FFFFFF','Blanc pur']];
for(const [rgb,name] of swatches){const button=document.createElement('button');button.className='swatch manual';button.style.backgroundColor='#'+rgb;button.dataset.rgb=rgb;button.setAttribute('aria-label',name);button.title=name;button.onclick=()=>act('color',{rgb});$('swatches').append(button);}
const ambiences=[{name:'Heure dorée',sub:'La douceur de la fin du jour',rgb:'FFB340',class:'sunset',icon:'sun'},{name:'Grand bleu',sub:'Un souffle de calme',rgb:'7FAEF5',class:'ocean',icon:'moon'},{name:'Un peu de rose',sub:'Une note délicate',rgb:'F4A7BE',class:'rose',icon:'spark'},{name:'Parenthèse verte',sub:'La nature s’invite',rgb:'7DC8AC',class:'forest',icon:'palette'},{name:'Matin tranquille',sub:'Un blanc doux et chaleureux',rgb:'F3DCA5',class:'daylight',icon:'sun'},{name:'Après la pluie',sub:'Une touche de lavande',rgb:'C6A3EF',class:'lavender',icon:'moon'}];
for(const [id,list] of [['quick-ambiences',ambiences.slice(0,4)],['all-ambiences',ambiences]])for(const scene of list){const button=document.createElement('button');button.className='ambient-card manual '+scene.class;button.innerHTML=`<span class="ambient-icon">${icon(scene.icon)}</span><strong>${scene.name}</strong><small>${scene.sub}</small>`;button.onclick=()=>act('color',{rgb:scene.rgb},scene.name+' — votre ambiance est prête.');$(id).append(button);}
$('power').onclick=()=>act('power',{on:!state.on});
$('mic').onclick=()=>act('mic',{on:!state.mic,effect:Number($('mic-effect').value),sensitivity:Number($('sensitivity').value)});
$('brightness').oninput=()=>{$('brightness-value').firstChild.textContent=$('brightness').value;$('brightness').style.setProperty('--fill',$('brightness').value+'%');};
$('brightness').onchange=()=>act('brightness',{value:Number($('brightness').value)});
$('custom-color').onchange=()=>act('color',{rgb:$('custom-color').value.slice(1).toUpperCase()});
for(const id of ['speed','sensitivity']){$(id).oninput=()=>{$(id+'-value').textContent=$(id).value+' %';$(id).style.setProperty('--fill',$(id).value+'%');};$(id).onchange=()=>act(id,{value:Number($(id).value)});}
$('mic-effect').onchange=()=>{if(state.mic)act('mic',{on:true,effect:Number($('mic-effect').value),sensitivity:Number($('sensitivity').value)});};
$('play-effect').onclick=()=>{if($('effect').value)act('effect',{...JSON.parse($('effect').value),speed:Number($('speed').value)});};
$('scan').onclick=()=>act('scan',{all:$('show-all').checked});
$('disconnect').onclick=()=>act('disconnect');$('reconnect').onclick=()=>act('connect',{address:state.device,name:state.deviceName});
$('bridge-toggle').onclick=()=>act(state.bridge?'bridge-stop':'bridge-start');
$('autostart').onchange=()=>act('autostart',{enabled:$('autostart').checked});
$('pairing').onclick=async()=>{const result=await act('pairing');if(result){$('pairing-image').src=result.image;$('pairing-code').textContent=result.code;$('pairing-dialog').showModal();}};
$('close-pairing').onclick=()=>$('pairing-dialog').close();$('pairing-dialog').onclick=event=>{if(event.target===$('pairing-dialog'))$('pairing-dialog').close();};
$('theme').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('lantern-theme',next);};
const savedTheme=localStorage.getItem('lantern-theme');if(savedTheme)document.documentElement.dataset.theme=savedTheme;
const quit=async()=>{if(confirm('Quitter Lantern et arrêter le pont Maison de cette application ?')){await rpc('quit');toast('Lantern est arrêté. Vous pouvez fermer cette fenêtre.');}};
$('quit').onclick=quit;$('quit-top').onclick=quit;
async function refresh(){try{render(await rpc('state'));}catch(error){$('status-text').textContent=error.message;}}
openPage('gateway');render(state);refresh();setInterval(()=>{if(!document.hidden)refresh();},1800);
