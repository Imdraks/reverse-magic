#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { adapters } = require('./registry');
const { validateConfig } = require('./config');
function args(values) {
  const result = { command: values.shift() || 'help', config: path.resolve('bridge.json') };
  if (!['help','init','check','adapters','run','pairing'].includes(result.command)) throw new Error('Commande inconnue.');
  for (let i=0;i<values.length;i+=2) {
    if (!['--config','--data-dir'].includes(values[i]) || !values[i+1]) throw new Error('Arguments invalides.');
    result[values[i]==='--config'?'config':'dataDirectory'] = path.resolve(values[i+1]);
  }
  return result;
}
function directory(config, options) {
  const base = options.dataDirectory || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData/Local'),'LanternDirect','gateway') : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(),'.local/state'),'lantern-direct','gateway'));
  return path.join(base,config.id);
}
async function main() {
  const options = args(process.argv.slice(2));
  if (options.command==='help') {
    console.log('Lantern Bridge — pont HomeKit multi-appareils\nCommandes : init, adapters, check, run, pairing\nOptions : --config bridge.json, --data-dir DOSSIER\nGuide : docs/GATEWAY.md'); return;
  }
  if (options.command==='adapters') {
    for (const [id,adapter] of Object.entries(adapters)) console.log(`${id} — ${adapter.name} · ${adapter.transport} · ${adapter.capability}`);
    return;
  }
  if (options.command==='init') {
    await fs.writeFile(options.config, JSON.stringify({version:1,id:'maison',name:'Lantern Bridge',port:51828,devices:[]},null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('Configuration créée, sans appareil. Ajoutez vos appareils selon docs/GATEWAY.md.'); return;
  }
  const config = validateConfig(JSON.parse(await fs.readFile(options.config,'utf8')));
  if (options.command==='check') { console.log(`Configuration valide : ${config.devices.length} appareil(s). Aucune connexion effectuée.`); return; }
  const dataDirectory = directory(config,options);
  if (options.command==='pairing') {
    const identity = JSON.parse(await fs.readFile(path.join(dataDirectory,'identity.json'),'utf8'));
    console.log(await fs.readFile(path.join(dataDirectory,'pairing-terminal.txt'),'utf8'));
    console.log('Code Maison : '+identity.pincode); return;
  }
  // Library logs may contain diagnostics: keep normal service logs free of pairing codes.
  const { Gateway } = require('./runtime');
  const gateway = new Gateway(config,dataDirectory);
  let stopping = false;
  const stop = async () => { if(stopping)return;stopping=true;await gateway.stop(); };
  let startup;
  const shutdown = async () => { if(stopping)return; await startup.catch(()=>{}); await stop(); };
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  startup=gateway.start();
  await startup;
  console.log(`Pont prêt : ${config.devices.length} appareil(s). Même réseau que l’iPhone ; gardez ce PC/Pi allumé.`);
  console.log('Pour l’appairage, utilisez la commande pairing dans un autre terminal.');
}
if(require.main===module) main().catch(() => { console.error('Lantern Bridge : opération impossible. Vérifiez la configuration, les variables d’authentification, le stockage et le port du pont.');process.exitCode=1; });
module.exports = { args, directory };
