'use strict';
const { EventEmitter } = require('node:events');
class SwitchEngine extends EventEmitter {
  constructor(adapter) { super(); this.adapter = adapter; this.state = { on: false }; this.online = false; this.closed = false; this.tail = Promise.resolve(); }
  serial(operation) { const next = this.tail.then(operation); this.tail = next.catch(() => {}); return next; }
  update(state) {
    if (this.closed || typeof state?.on !== 'boolean') throw new Error('État indisponible.');
    this.state = { on: state.on }; this.online = true; this.emit('state', this.state);
  }
  refresh() {
    if (this.closed) return Promise.resolve();
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.serial(async () => {
      try { this.update(await this.adapter.read()); }
      catch { this.online = false; }
    }).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  async read(key) { await this.refresh(); if (key !== 'on' || !this.online || this.closed) throw new Error('Appareil indisponible.'); return this.state.on; }
  set(patch) {
    if (!patch || Object.keys(patch).length !== 1 || typeof patch.on !== 'boolean') return Promise.reject(new Error('Consigne invalide.'));
    return this.serial(async () => {
      if (this.closed) throw new Error('Pont arrêté.');
      try { this.update(await this.adapter.apply(patch)); }
      catch { this.online = false; throw new Error('Commande non confirmée.'); }
    });
  }
  close() { this.closed = true; this.online = false; }
}
module.exports = { SwitchEngine };
