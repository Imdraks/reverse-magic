'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { Bridge, Accessory, Service, Characteristic, uuid, Categories, MDNSAdvertiser, HAPStorage } = require('../homekit/node_modules/hap-nodejs');
const lockfile = require('../homekit/node_modules/proper-lockfile');
const QRCode = require('../homekit/node_modules/qrcode');
const { validateConfig } = require('./config');
const { adapters } = require('./registry');
const { attachLight } = require('../homekit/accessory');
const { LightEngine } = require('../homekit/light-engine');
const { loadIdentity, loadLightStorage } = require('../homekit/storage');
const {ObservedEngine}=require('./observed-engine');
const {attachObserved}=require('./observed-accessory');
const {ProfileStore}=require('./profile-store');
class Gateway {
  constructor(config, directory, { adapterFactory, bind, onStatus = () => {} } = {}) {
    this.config = validateConfig(config); this.directory = path.resolve(directory); this.adapterFactory = adapterFactory;
    this.bind = bind; this.onStatus = onStatus; this.devices = []; this.closed = false;
  }
  async start() {
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      this.unlock = await lockfile.lock(this.directory, { retries: 0 });
      if(process.platform==='win32')this.releaseWindows=await require('./windows-lease').windowsLease();
      const identity = await loadIdentity(this.directory);
      HAPStorage.setCustomStoragePath(path.join(this.directory, 'pairings'));
      this.bridge = new Bridge(this.config.name, uuid.generate(`LanternBridge:bridge:${this.config.id}`));
      this.bridge.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, 'Lantern Bridge')
        .setCharacteristic(Characteristic.Model, 'HomeKit Bridge')
        .setCharacteristic(Characteristic.SerialNumber, this.config.id)
        .setCharacteristic(Characteristic.FirmwareRevision, '0.9.0');
      for (const device of this.config.devices) {
        const definition = adapters[device.adapter];
        const adapter = this.adapterFactory ? this.adapterFactory(device) : definition.create(device, {});
        const entry = { id: device.id, adapter }; this.devices.push(entry);
        const description=definition.describe?.(device.options);
        const storageDirectory=path.join(this.directory,'devices',device.id);
        const profiles=description?new ProfileStore(storageDirectory,device):undefined;
        const engine = description?new ObservedEngine(adapter,description.fields,{save:(state,context)=>profiles.save(state,{...context,mode:adapter.profileMode})}):new LightEngine(adapter, await loadLightStorage(storageDirectory));
        entry.engine = engine;
        const accessory = new Accessory(device.name, uuid.generate(`LanternBridge:device:${device.id}`));
        accessory.getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.Manufacturer, definition.manufacturer)
          .setCharacteristic(Characteristic.Model, definition.name)
          .setCharacteristic(Characteristic.SerialNumber, device.id);
        if(description)entry.detach=attachObserved(engine,accessory,device.name,description);
        else if (definition.capability === 'rgb-light') entry.detach = attachLight(engine, accessory, device.name);
        entry.accessory = accessory; this.bridge.addBridgedAccessory(accessory);
      }
      const listening = new Promise(resolve => this.bridge.once('listening', port => { this.port = port; resolve(); }));
      await this.bridge.publish({ ...identity, port: this.config.port, bind: this.bind, category: Categories.BRIDGE, advertiser: MDNSAdvertiser.CIAO });
      await listening;
      const uri = this.bridge.setupURI();
      await QRCode.toFile(path.join(this.directory,'pairing.png'), uri, { width: 320, margin: 2 });
      await fs.writeFile(path.join(this.directory,'pairing-terminal.txt'), await QRCode.toString(uri, { type: 'terminal', small: true }), { mode: 0o600 });
      this.timer = setInterval(() => { void this.refresh(); }, 5000);
      await this.refresh();
      return this;
    } catch (error) { await this.stop(); throw error; }
  }
  async refresh() {
    await Promise.allSettled(this.devices.map(device => device.engine.refresh()));
    if (!this.closed) this.onStatus(this.devices.map(device => ({ id: device.id, online: device.engine.online,profileWarning:Boolean(device.engine.persistenceError) })));
  }
  async stop() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.timer);
    for (const device of this.devices) { device.engine?.close(); device.detach?.(); }
    await Promise.allSettled(this.devices.map(device => device.adapter.close()));
    await Promise.allSettled(this.devices.map(device => device.engine?.settle()));
    try { if (this.bridge) await this.bridge.unpublish(); }
    finally {
      try { if (this.releaseWindows) await this.releaseWindows(); }
      finally { if (this.unlock) await this.unlock(); }
    }
  }
}
module.exports = { Gateway };
