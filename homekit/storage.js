const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePatch, DEFAULT_STATE } = require('./light-engine');
async function writeJSON(file, value) {
  const temporary = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle=await fs.open(temporary,'wx',0o600);
    await handle.writeFile(JSON.stringify(value));await handle.sync();await handle.close();handle=undefined;
    await fs.rename(temporary,file);
    if(process.platform!=='win32'){
      const directory=await fs.open(path.dirname(file),'r');
      try{await directory.sync();}finally{await directory.close();}
    }
  } finally {if(handle)await handle.close();await fs.rm(temporary,{force:true});}
}
async function loadJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback(); throw error; }
}
async function loadIdentity(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'identity.json');
  const identity = await loadJSON(file, async () => {
    const bytes = crypto.randomBytes(6); bytes[0] = (bytes[0] | 2) & 254;
    let pin;
    do { pin = String(crypto.randomInt(0, 100000000)).padStart(8, '0'); } while (/^(\d)\1{7}$/.test(pin) || ['12345678', '87654321'].includes(pin));
    const result = { username: [...bytes].map(x => x.toString(16).padStart(2, '0')).join(':').toUpperCase(), pincode: `${pin.slice(0,3)}-${pin.slice(3,5)}-${pin.slice(5)}`, setupID: crypto.randomBytes(3).toString('hex').slice(0,4).toUpperCase() };
    await writeJSON(file, result); return result;
  });
  if (!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(identity.username) || !/^\d{3}-\d{2}-\d{3}$/.test(identity.pincode) || !/^[A-Z0-9]{4}$/.test(identity.setupID)) throw new Error('Invalid saved HomeKit identity');
  return identity;
}
async function loadLightStorage(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let hasSavedState=true;
  const state = await loadJSON(path.join(directory, 'state.json'), () => {hasSavedState=false;return { ...DEFAULT_STATE };});
  validatePatch(state);
  if (Object.keys(state).length !== 4) throw new Error('Invalid saved light state');
  return { state, hasSavedState, save: value => writeJSON(path.join(directory, 'state.json'), value) };
}
async function loadStorage(directory) {
  return { identity: await loadIdentity(directory), ...await loadLightStorage(directory) };
}
module.exports = { loadStorage, loadIdentity, loadLightStorage, writeJSON };
