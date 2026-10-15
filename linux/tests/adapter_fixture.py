"""Test-only radio injection into the real gateway worker. Never packaged."""
import asyncio
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import adapter_worker

class Controller:
    connected=True
    def __init__(self,*args):pass
    def status(self):return dict(connected=True)
    async def write(self,frames):
        assert [x.hex() for x in frames]==['7e040700ffffff00ef','7e07050300ff0010ef','7e040123ffffff00ef','7e0404010001ff00ef']
    async def close(self):print('{"kind":"closed"}',flush=True)

adapter_worker.Controller=Controller
with tempfile.TemporaryDirectory() as directory:
    adapter_worker.state_directory=lambda args:Path(directory)
    asyncio.run(adapter_worker.run(SimpleNamespace(device='AA:BB:CC:DD:EE:FF',adapter=None)))
