'use strict';
const http = require('node:http');
class ShellyGen1 {
  constructor(options) {
    this.options = options; this.pending = new Set(); this.closed = false;
    if (options.usernameEnv && (!process.env[options.usernameEnv] || !process.env[options.passwordEnv])) throw new Error('Variables d’authentification Shelly manquantes.');
  }
  request(on) {
    if (this.closed) return Promise.reject(new Error('Adaptateur arrêté.'));
    const url = new URL(`/relay/${this.options.channel}`, this.options.host);
    if (on !== undefined) url.searchParams.set('turn', on ? 'on' : 'off');
    const headers = {};
    if (this.options.usernameEnv) headers.Authorization = 'Basic ' + Buffer.from(`${process.env[this.options.usernameEnv]}:${process.env[this.options.passwordEnv]}`).toString('base64');
    return new Promise((resolve, reject) => {
      const request = http.get(url, { headers }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; if (body.length > 16384) request.destroy(new Error('Réponse trop volumineuse.')); });
        response.on('error', reject);
        response.on('end', () => {
          try {
            if (response.statusCode !== 200) throw new Error('Relais Shelly indisponible.');
            const state = JSON.parse(body);
            if (typeof state.ison !== 'boolean' || (on !== undefined && state.ison !== on)) throw new Error('État du relais non confirmé.');
            resolve({ on: state.ison });
          } catch { reject(new Error('Réponse du relais invalide ou commande refusée.')); }
        });
      });
      this.pending.add(request);
      const timer = setTimeout(() => request.destroy(new Error('Délai Shelly dépassé.')), 3000);
      request.once('close', () => { clearTimeout(timer); this.pending.delete(request); });
      request.on('error', () => reject(new Error('Connexion Shelly indisponible.')));
    });
  }
  read() { return this.request(); }
  apply(state) { if (!state || typeof state.on !== 'boolean') return Promise.reject(new Error('Consigne invalide.')); return this.request(state.on); }
  async close() { this.closed = true; for (const request of this.pending) request.destroy(); }
}
module.exports = { ShellyGen1 };
