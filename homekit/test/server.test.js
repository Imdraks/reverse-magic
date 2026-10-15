const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
test('packaged server startup, QR generation and shutdown with its Windows parent', { timeout: 20000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lantern-server-'));
  const child = spawn(process.execPath, [path.resolve(__dirname, '../server.js'), '--data-dir', directory, '--device-id', 'ABCDEF789012'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let exited = false;
  const exit = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
  child.stderr.resume();
  const lines = readline.createInterface({ input: child.stdout });
  let pairing;
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited before ready')));
    lines.on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.kind === 'pairing') pairing = event;
        if (event.kind === 'ready') resolve();
        // A final status request can arrive after the parent deliberately closes stdin.
        if (event.kind === 'request' && !child.stdin.writableEnded) child.stdin.write(JSON.stringify({ kind: 'response', id: event.id, ok: true, result: event.op === 'status' ? { connected: true } : {} }) + '\n');
      } catch (error) { reject(error); }
    });
  });
  try {
    await ready; assert.match(pairing.code, /^\d{3}-\d{2}-\d{3}$/);
    const png = await fs.readFile(pairing.qrPath); assert.equal(png.subarray(1,4).toString(), 'PNG');
    child.stdin.end(); assert.equal(await exit, 0);
  } finally { lines.close(); if (!exited) { child.kill(); await exit; } await fs.rm(directory, { recursive: true, force: true }); }
});
