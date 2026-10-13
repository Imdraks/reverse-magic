import asyncio
from types import SimpleNamespace
import unittest
from bluetooth import Controller
from protocol import color, brightness

class Client:
    def __init__(self, device, **options):
        self.is_connected=False
        self.writes=[]
        self.fail=False
        self.hold=False
        self.started=asyncio.Event()
        self.services=SimpleNamespace(get_service=lambda uuid: SimpleNamespace(get_characteristic=lambda uuid: SimpleNamespace(properties=['write','write-without-response'])))
    async def connect(self): self.is_connected=True
    async def disconnect(self): self.is_connected=False
    async def write_gatt_char(self, characteristic, data, response):
        self.started.set()
        if self.hold: await asyncio.Event().wait()
        if self.fail: raise RuntimeError('radio failure')
        self.writes.append((data,response))

class Scanner:
    @staticmethod
    async def find_device_by_address(address, **options): return SimpleNamespace(address=address)

class BluetoothTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self): self.controller=Controller('AA:BB:CC:DD:EE:FF',client_factory=Client,scanner=Scanner)
    async def asyncTearDown(self): await self.controller.close()

    async def test_blueZ_service_validation_and_serialised_writes(self):
        await self.controller.connect()
        client=self.controller.client
        await asyncio.gather(self.controller.write([color(255,0,0),brightness(35)]),self.controller.write([color(0,255,0)]))
        self.assertEqual([data for data,response in client.writes],[color(255,0,0),brightness(35),color(0,255,0)])
        self.assertTrue(all(response for data,response in client.writes))

    async def test_failures_and_cancel_do_not_send_later_frames(self):
        await self.controller.connect(); client=self.controller.client
        client.fail=True
        with self.assertRaises(RuntimeError): await self.controller.write([color(255,0,0),brightness(35)])
        self.assertFalse(self.controller.connected); self.assertEqual(client.writes,[])
        await self.controller.connect(); client=self.controller.client; client.hold=True
        task=asyncio.create_task(self.controller.write([color(255,0,0),brightness(35)]))
        await client.started.wait(); task.cancel()
        with self.assertRaises(asyncio.CancelledError): await task
        self.assertFalse(client.is_connected); self.assertEqual(client.writes,[])

    async def test_offline_status_reconnects_without_blocking_homekit(self):
        self.assertEqual(self.controller.status(),{'connected':False})
        await self.controller.reconnect_task
        self.assertTrue(self.controller.status()['connected'])
        await self.controller.close()
        self.assertFalse(self.controller.status()['connected'])
