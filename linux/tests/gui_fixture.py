"""Test-only simulated BLE radio behind the real authenticated desktop server."""
import asyncio
import json
from pathlib import Path
import signal
import sys
import tempfile
from types import SimpleNamespace
import threading
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from gui import Desktop,LocalServer

class FakeController:
    def __init__(self,*args):self.connected=False;self.frames=[]
    async def connect(self):self.connected=True
    async def write(self,frames):self.frames.extend(frame.hex() for frame in frames)
    def status(self):return {'connected':self.connected}
    async def close(self):self.connected=False

class Fixture(Desktop):
    async def command(self,action,data):
        if action=='scan' and not self.gateway_active() and not self.snapshot()['bridge']:
            self.devices=[dict(name='Lumière du salon',address='AA:BB:CC:DD:EE:FF',rssi=-48)]
            return {'state':self.snapshot()}
        if action=='test-frames':return self.controller.frames if self.controller else []
        return await super().command(action,data)

async def main():
    with tempfile.TemporaryDirectory() as directory:
        app=Fixture(SimpleNamespace(device=None,adapter=None,data_dir=Path(directory)),FakeController)
        await app.gateway_command('state',{})
        server=LocalServer(app,asyncio.get_running_loop())
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        print(json.dumps(dict(origin=server.origin,token=server.token)),flush=True)
        loop=asyncio.get_running_loop()
        for sig in (signal.SIGTERM,signal.SIGINT):loop.add_signal_handler(sig,app.stop.set)
        try:await app.stop.wait()
        finally:await asyncio.to_thread(server.shutdown);server.server_close();await app.close()
asyncio.run(main())
