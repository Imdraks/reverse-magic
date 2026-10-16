const { Accessory, Service, Characteristic, uuid, Categories, MDNSAdvertiser, HapStatusError, HAPStatus } = require('hap-nodejs');
function createAccessory(engine, { deviceId, name = 'Mes LED', username, pincode, setupID, port = 51827, bind }) {
  const accessory = new Accessory(name, uuid.generate(`LanternDirect:${deviceId}`));
  accessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, 'Lantern Direct')
    .setCharacteristic(Characteristic.Model, 'Magic Lantern Bluetooth')
    .setCharacteristic(Characteristic.SerialNumber, deviceId)
    .setCharacteristic(Characteristic.FirmwareRevision, '0.11.0');
  const detach = attachLight(engine, accessory, name);
  return { accessory, publish: () => accessory.publish({ username, pincode, setupID, port, bind, category: Categories.LIGHTBULB, advertiser: MDNSAdvertiser.CIAO }), stop: async () => { detach(); await accessory.unpublish(); } };
}
function attachLight(engine, accessory, name) {
  const light = accessory.addService(Service.Lightbulb, name);
  const mapping = { on: Characteristic.On, brightness: Characteristic.Brightness, hue: Characteristic.Hue, saturation: Characteristic.Saturation };
  for (const [key, type] of Object.entries(mapping)) {
    light.getCharacteristic(type).onGet(async () => {
      try { return await engine.read(key); } catch { throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE); }
    }).onSet(async value => {
      try { await engine.set({ [key]: value }); } catch { throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE); }
    });
  }
  const update = state => setImmediate(() => {
    if (!engine.closed) for (const [key, type] of Object.entries(mapping)) light.updateCharacteristic(type, state[key]);
  });
  engine.on('state', update);
  return () => engine.off('state', update);
}
module.exports = { createAccessory, attachLight };
