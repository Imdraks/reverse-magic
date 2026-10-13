import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from bridge import Bridge
from lantern import ROOT, node_path, parser, service_unit

class Transport:
    def __init__(self): self.frames=[];self.closed=False;self.connected=True
    def status(self): return {'connected':self.connected}
    async def write(self,frames): self.frames.extend(frames)
    async def close(self): self.closed=True

class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_homekit_process_with_linux_rpc_and_sigterm_cleanup(self):
        controller=Transport()
        with tempfile.TemporaryDirectory() as directory:
            bridge=Bridge(controller,node_path(),ROOT/'homekit/server.js',Path(directory),'ABCDEF987654')
            task=asyncio.create_task(bridge.run())
            try:
                async with asyncio.timeout(10):
                    while not controller.frames: await asyncio.sleep(0.05)
                self.assertEqual(controller.frames[0].hex(),'7e0404000000ff00ef')
                self.assertTrue((Path(directory)/'pairing-terminal.txt').exists())
                script = r"""
                const fs = require('fs');
                const Client = require('hap-controller/lib/transport/ip/http-client').default;
                const identity = JSON.parse(fs.readFileSync(process.argv[1] + '/identity.json'));
                (async () => {
                  const client = new Client(identity.username, '127.0.0.1', 51827);
                  try {
                    await client.pairSetup(identity.pincode);
                    const accessories = await client.getAccessories();
                    const service = accessories.accessories[0].services.find(s => s.type.startsWith('00000043-'));
                    const key = type => '1.' + service.characteristics.find(c => c.type.startsWith(type.padStart(8,'0')+'-')).iid;
                    await client.setCharacteristics({[key('25')]:true,[key('13')]:120,[key('2F')]:100,[key('8')]:35});
                  } finally { await client.close(); }
                })().catch(() => { console.error('Linux/HomeKit integration failed'); process.exit(1); });
                """
                client = await asyncio.create_subprocess_exec(str(node_path()), '-e', script, directory, cwd=ROOT/'homekit', stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                async with asyncio.timeout(10): await client.communicate()
                self.assertEqual(client.returncode,0)
                self.assertEqual(controller.frames[-3].hex(),'7e070503ff000010ef')
                self.assertEqual(controller.frames[-2].hex(),'7e040123ffffff00ef')
                self.assertEqual(controller.frames[-1].hex(),'7e0404010001ff00ef')

                identity=json.loads((Path(directory)/'identity.json').read_text())
                self.assertRegex(identity['pincode'],r'^\d{3}-\d{2}-\d{3}$')
            finally:
                task.cancel()
                with self.assertRaises(asyncio.CancelledError): await task
            self.assertTrue(controller.closed)
            self.assertEqual(bridge.process.returncode,0)
            self.assertEqual(bridge.requests,{})

    def test_service_runs_without_session_and_without_logging_pairing_code(self):
        with tempfile.TemporaryDirectory() as directory:
            args=parser().parse_args(['service','--device','aa:bb:cc:dd:ee:ff','--data-dir',directory,'--adapter','hci1'])
            unit=service_unit(args)
            self.assertIn('WantedBy=multi-user.target',unit)
            self.assertIn('SupplementaryGroups=bluetooth',unit)
            self.assertIn('Restart=on-failure',unit)
            self.assertIn('AA:BB:CC:DD:EE:FF',unit)
            self.assertNotIn('--show-code',unit)
