'use strict';
const { adapters } = require('./registry');
const ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error(`${label} : champs invalides.`);
}
function name(value) {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 64 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Nom attendu : 1 à 64 caractères.');
}
function validateConfig(value) {
  object(value, ['version','id','name','port','devices'], 'Pont');
  if (value.version !== 1 || typeof value.id !== 'string' || !ID.test(value.id)) throw new Error('Version ou identifiant de pont invalide.');
  name(value.name);
  if (!Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) throw new Error('Port attendu : 1024 à 65535.');
  if (!Array.isArray(value.devices) || value.devices.length > 100) throw new Error('Jusqu’à 100 appareils par pont.');
  const ids = new Set(), targets = new Set();
  for (const device of value.devices) {
    object(device, ['id','name','adapter','options'], 'Appareil');
    if (typeof device.id !== 'string' || !ID.test(device.id) || ids.has(device.id)) throw new Error('Identifiant d’appareil invalide ou dupliqué.');
    name(device.name); ids.add(device.id);
    const adapter = typeof device.adapter === 'string' && Object.hasOwn(adapters,device.adapter) ? adapters[device.adapter] : undefined;
    if (!adapter) throw new Error('Adaptateur inconnu. Utilisez la commande adapters.');
    object(device.options, adapter.options, 'Options');
    const target = `${device.adapter}:${adapter.validate(device.options)}`;
    if (targets.has(target)) throw new Error('Un même appareil est configuré plusieurs fois.');
    targets.add(target);
  }
  return value;
}
module.exports = { validateConfig };
