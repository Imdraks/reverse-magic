'use strict';
// Explicit trusted registry: a configuration cannot load executable plugin paths.
const { MagicLantern } = require('./adapters/magic-lantern');
const { ShellyGen1 } = require('./adapters/shelly-gen1');
const {LscTuya,description}=require('./adapters/lsc-tuya');
const lsc=require('./adapters/lsc-profiles');
const adapters = Object.freeze({
  'magic-lantern-ble': {
    name: 'Magic Lantern FFF0 / FFF3', transport: 'Bluetooth LE', capability: 'rgb-light', manufacturer: 'Magic Lantern',
    options: ['address','adapter'],
    validate(options) {
      if (typeof options.address !== 'string' || !/^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(options.address)) throw new Error('Adresse Bluetooth invalide.');
      if (options.adapter !== undefined && (typeof options.adapter !== 'string' || !/^hci\d+$/.test(options.adapter))) throw new Error('Adaptateur BlueZ invalide.');
      return options.address.toUpperCase();
    },
    create: (device, context) => new MagicLantern(device.options, context),
  },
  'shelly-gen1-relay': {
    name: 'Shelly Gen 1 — relais d’éclairage HTTP', transport: 'Wi-Fi / Ethernet', capability: 'lighting-relay', manufacturer: 'Shelly',
    options: ['host','channel','usernameEnv','passwordEnv'],
    validate(options) {
      let url;
      try { url = new URL(options.host); } catch { throw new Error('Adresse Shelly attendue : http://192.168.1.20'); }
      if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Adresse HTTP locale sans chemin ni identifiants attendue.');
      if (!Number.isInteger(options.channel) || options.channel < 0 || options.channel > 3) throw new Error('Canal de relais invalide.');
      const auth = [options.usernameEnv, options.passwordEnv];
      if (auth.some(x => x !== undefined) && !auth.every(x => typeof x === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(x))) throw new Error('Définissez les deux noms de variables d’authentification.');
      return `${url.origin}/${options.channel}`;
    },
    describe:()=>({service:'Switch',fields:{on:{kind:'boolean',characteristic:'On'}}}),
    create: device => new ShellyGen1(device.options),
  },
  'lsc-tuya-light': {
    name:'LSC / Tuya — éclairage Wi-Fi local',transport:'Wi-Fi / Tuya LAN chiffré',capability:'light',manufacturer:'LSC Smart Connect',namespace:'lsc-tuya',
    options:lsc.OPTIONS.light,
    validate(options){return lsc.validateLight(options)+'/dp/'+lsc.lightProfile(options).dps.on;},
    describe:options=>description(options),
    create:device=>new LscTuya(device.options),
  },
});
module.exports = { adapters };
