// Reserve stdout for the private Bluetooth RPC channel, including library diagnostics.
console.log = console.error.bind(console);
const path = require('node:path');
const { HAPStorage } = require('hap-nodejs');
const QRCode = require('qrcode');
const { loadStorage } = require('./storage');
const { PipeTransport } = require('./pipe-transport');
const { LightEngine } = require('./light-engine');
const { createAccessory } = require('./accessory');
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--data-dir', '--device-id'].includes(args[i]) || !args[i + 1]) throw new Error('Invalid arguments');
    options[args[i]] = args[i + 1];
  }
  if (!options['--data-dir'] || !/^[A-F0-9]{12}$/.test(options['--device-id'])) throw new Error('Missing bridge configuration');
  const directory = path.resolve(options['--data-dir']);
  const stored = await loadStorage(directory);
  HAPStorage.setCustomStoragePath(path.join(directory, 'pairings'));
  const transport = new PipeTransport();
  const engine = new LightEngine(transport, stored);
  const bridge = createAccessory(engine, { deviceId: options['--device-id'], ...stored.identity });
  let stopping = false;
  let heartbeat;
  const shutdown = async () => {
    if (stopping) return; stopping = true;
    clearInterval(heartbeat); engine.close(); transport.close();
    await bridge.stop(); process.exit(0);
  };
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  engine.on('state', state => transport.emit({ kind: 'light', state }));
  engine.on('availability', connected => transport.emit({ kind: 'status', connected }));
  engine.on('persistence-warning', () => transport.emit({ kind: 'warning', message: 'État appliqué, mais impossible de l’enregistrer.' }));
  await bridge.publish();
  const qrPath = path.join(directory, 'pairing.png');
  await QRCode.toFile(qrPath, bridge.accessory.setupURI(), { width: 320, margin: 2 });
  const qrText = await QRCode.toString(bridge.accessory.setupURI(), { type: 'terminal', small: true });
  await require('node:fs/promises').writeFile(path.join(directory, 'pairing-terminal.txt'), qrText, { mode: 0o600 });
  transport.emit({ kind: 'pairing', code: stored.identity.pincode, qrPath, qrText });
  transport.emit({ kind: 'ready' });
  heartbeat = setInterval(() => { void engine.refresh(); }, 5000);
  await engine.refresh();
  transport.emit({ kind: 'status', connected: engine.online });
}
main().catch(() => { process.stderr.write('HomeKit: démarrage impossible. Vérifiez le dossier local et le port 51827.\n'); process.exit(1); });
