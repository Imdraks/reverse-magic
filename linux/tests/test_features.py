import asyncio
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from favorites import Favorites
from diagnostics import issue
from desktop_tools import desktop_entry,install_shortcut
from gui import Desktop

class FavoriteTests(unittest.TestCase):
    def test_persistence_replace_delete_and_grb(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Favorites(Path(directory)/'favorites.json')
            snapshot=dict(mode='color',rgb='FF0000',brightness=42,effect=0,scene=False,speed=50)
            store.save('Soir',snapshot);item=Favorites(store.path).load()[0]
            self.assertEqual(Favorites.frames(item)[1].hex(),'7e07050300ff0010ef')
            self.assertEqual(Favorites.frames(item)[2].hex(),'7e04012affffff00ef')
            store.save('SOIR',dict(snapshot,brightness=12));self.assertEqual(store.load()[0]['id'],item['id']);self.assertEqual(len(store.load()),1)
            store.delete(item['id']);self.assertEqual(store.load(),[])
            store.path.write_text('broken');before=store.path.read_bytes()
            with self.assertRaises(ValueError):store.save('Other',snapshot)
            self.assertEqual(store.path.read_bytes(),before)
            self.assertIsNotNone(store.snapshot()[1])

    def test_validation_effects_and_shortcut(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Favorites(Path(directory)/'favorites.json')
            snapshot=dict(mode='effect',rgb='FFFFFF',brightness=35,effect=212,scene=False,speed=50)
            for name in ['', 'x'*41, 'a\nb']:
                with self.assertRaises(ValueError):store.save(name,snapshot)
            store.save('Animation',snapshot);frames=Favorites.frames(store.load()[0]);self.assertEqual(frames[1].hex(),'7e0503d406ffff00ef')
            with patch.dict('os.environ',{'XDG_DATA_HOME':directory}):
                path=install_shortcut(Path(directory)/'with spaces')
            text=path.read_text();self.assertGreater(len(text.splitlines()),5)
            import configparser
            parsed=configparser.ConfigParser(interpolation=None);parsed.read_string(text)
            self.assertEqual(parsed['Desktop Entry']['Type'],'Application')
            self.assertIn('" gui\n',text);self.assertIn('Terminal=false',text);self.assertIn('with spaces/lantern"',text)

class FakeController:
    attempts=0
    def __init__(self,*args):self.connected=False
    async def connect(self):
        type(self).attempts+=1
        await asyncio.Event().wait()
    async def close(self):self.connected=False

class ConnectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancellation_does_not_retry_or_keep_a_controller(self):
        FakeController.attempts=0
        with tempfile.TemporaryDirectory() as directory:
            app=Desktop(SimpleNamespace(device=None,adapter=None,data_dir=Path(directory)),FakeController)
            task=asyncio.create_task(app.command('connect',dict(address='AA:BB:CC:DD:EE:FF')))
            while app.connect_task is None:await asyncio.sleep(0)
            await app.command('cancel-connect',{})
            with self.assertRaisesRegex(ValueError,'annulée'):await task
            self.assertFalse(app.snapshot()['connecting']);self.assertIsNone(app.controller);self.assertLessEqual(FakeController.attempts,1)
            await app.close()

    async def test_permission_failure_is_not_retried(self):
        class Denied(FakeController):
            async def connect(self):
                type(self).attempts+=1
                raise PermissionError('not authorized')
        Denied.attempts=0
        with tempfile.TemporaryDirectory() as directory:
            app=Desktop(SimpleNamespace(device=None,adapter=None,data_dir=Path(directory)),Denied)
            with self.assertRaisesRegex(ValueError,'autorisations'):await app.command('connect',dict(address='AA:BB:CC:DD:EE:FF'))
            self.assertEqual(Denied.attempts,1);self.assertEqual(app.snapshot()['connectionIssue']['code'],'permission')
            await app.close()
        self.assertTrue(issue(TimeoutError())['retryable'])
        self.assertFalse(issue(FileNotFoundError())['retryable'])
