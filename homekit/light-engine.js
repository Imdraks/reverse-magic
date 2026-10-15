const { EventEmitter } = require('node:events');

const DEFAULT_STATE = Object.freeze({ on: false, brightness: 100, hue: 0, saturation: 0 });

class BridgeUnavailable extends Error {}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid light state');
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'on') {
      if (typeof value !== 'boolean') throw new TypeError('on must be boolean');
    } else if (['brightness', 'hue', 'saturation'].includes(key)) {
      const max = key === 'hue' ? 360 : 100;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max ||
          (key === 'brightness' && !Number.isInteger(value))) throw new RangeError(`Invalid ${key}`);
    } else throw new TypeError('Unknown light property');
  }
  return patch;
}

class LightEngine extends EventEmitter {
  constructor(transport, { state = DEFAULT_STATE, hasSavedState = state !== DEFAULT_STATE, save = async () => {}, delay = 25 } = {}) {
    super();
    validatePatch(state);
    this.state = { ...DEFAULT_STATE, ...state };
    this.transport = transport;
    this.save = save;
    this.hasSavedState = hasSavedState;
    this.connectedBefore = false;
    this.delay = delay;
    this.online = false;
    this.pending = [];
    this.pendingPatch = {};
    this.tail = Promise.resolve();
    this.closed = false;
  }

  serial(operation) {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  availability(online) {
    if (this.online !== online) { this.online = online; this.emit('availability', online); }
  }

  async refresh() {
    if (this.closed) return;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.serial(async () => {
      try {
        const status = await this.transport.status();
        if (!status.connected) { this.availability(false); return; }
        if (!this.online) {
          // Opening a bridge observes connectivity without changing a controller
          // that may still be running its last colour or animation autonomously.
          const replay=this.hasSavedState&&this.connectedBefore;
          if(replay)await this.transport.apply({ ...this.state });
          if (this.closed) return;
          this.connectedBefore=true;
          this.availability(true);
          if(replay)this.emit('state', { ...this.state });
        }
      } catch { this.availability(false); }
    }).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  async read(key) {
    await this.refresh();
    if (!this.online || this.closed) throw new BridgeUnavailable('LED controller offline');
    return this.state[key];
  }

  set(patch) {
    try { validatePatch(patch); } catch (error) { return Promise.reject(error); }
    if (this.closed || this.pending.length >= 256) return Promise.reject(new BridgeUnavailable('Bridge unavailable'));
    return new Promise((resolve, reject) => {
      Object.assign(this.pendingPatch, patch);
      this.pending.push({ resolve, reject });
      this.schedule();
    });
  }

  schedule() {
    if (this.closed || this.flushing || this.timer || !this.pending.length) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.delay);
  }

  async flush() {
    this.flushing = true;
    const waiters = this.pending.splice(0);
    const patch = this.pendingPatch;
    this.pendingPatch = {};
    try {
      await this.serial(async () => {
        if (this.closed) throw new BridgeUnavailable('Bridge stopped');
        const status = await this.transport.status();
        if (!status.connected) throw new BridgeUnavailable('LED controller offline');
        const next = { ...this.state, ...patch };
        if (next.hue === 360) next.hue = 0;
        await this.transport.apply(next);
        this.state = next;
        this.hasSavedState = true;
        try { await this.save({ ...next });this.persistenceError=false; } catch { this.persistenceError=true;this.emit('persistence-warning'); }
        if (this.closed) throw new BridgeUnavailable('Bridge stopped');
        this.availability(true);
        this.emit('state', { ...next });
      });
      for (const waiter of waiters) waiter.resolve();
    } catch (error) {
      this.availability(false);
      for (const waiter of waiters) waiter.reject(error);
    } finally { this.flushing = false; this.schedule(); }
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const waiter of this.pending.splice(0)) waiter.reject(new BridgeUnavailable('Bridge stopped'));
    this.pendingPatch = {};
    this.availability(false);
  }
  settle() { return this.tail; }
}

module.exports = { LightEngine, BridgeUnavailable, DEFAULT_STATE, validatePatch };
