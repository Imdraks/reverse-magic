'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PipeTransport } = require('../../homekit/pipe-transport');
class MagicLantern {
  constructor(options, { root = path.resolve(__dirname, '../..'), platform = process.platform } = {}) {
    this.options = options; this.root = root; this.platform = platform; this.retryAfter = 0; this.closed = false;
  }
  start() {
    if (this.child || this.closed || Date.now() < this.retryAfter) return;
    const windows = this.platform === 'win32';
    if (windows && this.options.adapter) throw new Error('Le choix hci est réservé à Linux.');
    const command = path.join(this.root, windows ? 'LanternDirect.exe' : '.venv/bin/python');
    const args = windows ? ['--adapter-worker'] : [path.join(this.root,'linux/adapter_worker.py')];
    args.push('--device', this.options.address.toUpperCase());
    if (this.options.adapter) args.push('--adapter', this.options.adapter);
    const child = spawn(command, args, { cwd: this.root, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    this.child = child; this.pipe = new PipeTransport(child.stdout, child.stdin);
    const pipe = this.pipe;
    child.stderr.resume(); // Worker diagnostics must never disclose credentials or pollute the bridge protocol.
    child.stdin.on('error', () => pipe.close());
    const stopped = () => {
      if (this.child !== child) return;
      this.pipe.close(); this.pipe = undefined; this.child = undefined; this.retryAfter = Date.now() + 10000;
    };
    child.once('error', stopped); child.once('close', stopped);
  }
  async status() {
    try { this.start(); return this.pipe ? await this.pipe.status() : { connected: false }; }
    catch { return { connected: false }; }
  }
  apply(state) { if (!this.pipe) return Promise.reject(new Error('Contrôleur indisponible.')); return this.pipe.apply(state); }
  async close() {
    this.closed = true;
    const child = this.child;
    if (!child) return;
    this.pipe.close();
    const exit = new Promise(resolve => child.once('close', resolve));
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 4000);
    await exit; clearTimeout(timer);
  }
}
module.exports = { MagicLantern };
