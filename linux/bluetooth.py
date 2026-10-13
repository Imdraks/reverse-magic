"""BlueZ BLE connection, one writer, cancellable commands and reconnection."""
import asyncio
import time
from protocol import SERVICE, CHARACTERISTIC

class Controller:
    def __init__(self, address, adapter=None, client_factory=None, scanner=None):
        from bleak import BleakClient, BleakScanner
        self.address, self.adapter = address, adapter
        self.client_factory = client_factory or BleakClient
        self.scanner = scanner or BleakScanner
        self.client = None
        self.characteristic = None
        self.lock = asyncio.Lock()
        self.reconnect_task = None
        self.retry_after = 0
        self.closed = False

    @property
    def connected(self):
        return self.client is not None and self.client.is_connected and self.characteristic is not None

    async def connect(self):
        async with self.lock:
            if self.closed:
                raise RuntimeError('Contrôleur arrêté.')
            if self.connected:
                return
            await self._disconnect()
            options = {'bluez': {'adapter': self.adapter}} if self.adapter else {}
            device = await self.scanner.find_device_by_address(self.address, timeout=8, **options)
            if device is None:
                raise RuntimeError('LED introuvables. Vérifiez leur alimentation et libérez leur connexion Bluetooth.')
            client = self.client_factory(device, timeout=12, **options)
            try:
                async with asyncio.timeout(15):
                    await client.connect()
                    service = client.services.get_service(SERVICE)
                    characteristic = service.get_characteristic(CHARACTERISTIC) if service else None
                    if characteristic is None or not {'write', 'write-without-response'}.intersection(characteristic.properties):
                        raise RuntimeError('Service FFF0 / caractéristique FFF3 indisponible.')
                    if self.closed:
                        raise RuntimeError('Contrôleur arrêté.')
                    self.client, self.characteristic = client, characteristic
            except BaseException:
                try:
                    async with asyncio.timeout(3): await client.disconnect()
                except Exception: pass
                raise

    async def _disconnect(self):
        client, self.client, self.characteristic = self.client, None, None
        if client:
            try:
                async with asyncio.timeout(3): await client.disconnect()
            except Exception: pass

    def status(self):
        if not self.connected and not self.closed and time.monotonic() >= self.retry_after and (self.reconnect_task is None or self.reconnect_task.done()):
            self.reconnect_task = asyncio.create_task(self._reconnect())
        return {'connected': self.connected}

    async def _reconnect(self):
        try: await self.connect()
        except Exception: self.retry_after = time.monotonic() + 10

    async def write(self, frames):
        async with self.lock:
            if not self.connected or self.closed:
                raise RuntimeError('Connexion LED indisponible.')
            try:
                async with asyncio.timeout(4.5):
                    for frame in frames:
                        if len(frame) != 9 or frame[0] != 0x7e or frame[-1] != 0xef:
                            raise ValueError('Trame LED invalide.')
                        await self.client.write_gatt_char(self.characteristic, frame, response='write' in self.characteristic.properties)
                        await asyncio.sleep(0.06)
            except BaseException:
                # Cancellation must never leave later frames running after a failed HomeKit write.
                await self._disconnect()
                raise

    async def close(self):
        self.closed = True
        if self.reconnect_task and not self.reconnect_task.done():
            self.reconnect_task.cancel()
            await asyncio.gather(self.reconnect_task, return_exceptions=True)
        async with self.lock: await self._disconnect()
