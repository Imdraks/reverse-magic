const readline = require('node:readline');

class PipeTransport {
  constructor(input = process.stdin, output = process.stdout, timeout = 6000) {
    this.output = output;
    this.timeout = timeout;
    this.pending = new Map();
    this.nextID = 1;
    this.lines = readline.createInterface({ input, terminal: false });
    this.lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.kind !== 'response') return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.ok) pending.resolve(message.result);
        else pending.reject(new Error('Bluetooth command failed'));
      } catch { /* Ignore a malformed line; existing request still has a deadline. */ }
    });
    this.lines.on('close', () => this.close());
  }

  emit(message) { this.output.write(JSON.stringify(message) + '\n'); }

  request(op, state) {
    if (this.closed) return Promise.reject(new Error('Bluetooth controller stopped'));
    const id = this.nextID++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.emit({ kind: 'cancel', id });
        reject(new Error('Bluetooth command expired'));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.emit({ kind: 'request', id, op, ...(state ? { state } : {}) });
    });
  }

  status() { return this.request('status'); }
  apply(state) { return this.request('apply', state); }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Bluetooth controller stopped')); }
    this.pending.clear();
    this.lines.close();
  }
}

module.exports = { PipeTransport };
