import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest
from lantern import parser,gateway_service_unit

class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_worker_rpc_grb_validation_and_eof_cleanup(self):
        process=await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).with_name('adapter_fixture.py')),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        async def request(identifier,op,state=None):
            process.stdin.write((json.dumps(dict(kind='request',id=identifier,op=op,**({'state':state} if state else {})))+'\n').encode());await process.stdin.drain()
            async with asyncio.timeout(5):result=json.loads(await process.stdout.readline())
            self.assertEqual(result['id'],identifier)
            return result
        try:
            self.assertEqual((await request(1,'status'))['result'],dict(connected=True))
            self.assertTrue((await request(2,'apply',dict(on=True,brightness=35,hue=0,saturation=100)))['ok'])
            self.assertFalse((await request(3,'apply',dict(on=True,brightness=101,hue=0,saturation=100)))['ok'])
            process.stdin.close()
            async with asyncio.timeout(5):output,errors=await process.communicate()
            self.assertEqual(process.returncode,0);self.assertEqual(errors,b'');self.assertEqual(json.loads(output)['kind'],'closed')
        finally:
            if process.returncode is None:process.kill();await process.wait()

    def test_multi_device_service_uses_explicit_config_and_never_logs_pairing(self):
        with tempfile.TemporaryDirectory() as directory:
            args=parser().parse_args(['gateway-service','--config',str(Path(directory)/'bridge.json'),'--data-dir',str(Path(directory)/'private')])
            unit=gateway_service_unit(args)
            self.assertIn('"gateway" "run" "--config"',unit);self.assertIn('WantedBy=multi-user.target',unit)
            self.assertIn('"--data-dir"',unit);self.assertNotIn('pairing',unit);self.assertNotIn('show-code',unit)
