"""Own the HAP process and its private RPC channel; no network Bluetooth API."""
import asyncio
import json
import os
import sys
from protocol import light_frames

class Bridge:
    def __init__(self, controller, node, server, data_dir, device_id, show_code=False, on_event=None, close_controller=True):
        self.controller, self.node, self.server = controller, node, server
        self.data_dir, self.device_id, self.show_code = data_dir, device_id, show_code
        self.on_event, self.close_controller = on_event, close_controller
        self.requests = {}
        self.output_lock = asyncio.Lock()
        self.process = None
        self.stopping = False

    async def respond(self, message):
        request_id = message['id']
        try:
            async with asyncio.timeout(5):
                if message['op'] == 'status': result = self.controller.status()
                elif message['op'] == 'apply':
                    await self.controller.write(light_frames(message['state']))
                    result = {}
                else: raise ValueError('Opération inconnue.')
            response = {'kind': 'response', 'id': request_id, 'ok': True, 'result': result}
        except (Exception, asyncio.CancelledError):
            response = {'kind': 'response', 'id': request_id, 'ok': False}
        finally: self.requests.pop(request_id, None)
        if not self.stopping:
            async with self.output_lock:
                try:
                    self.process.stdin.write((json.dumps(response) + '\n').encode())
                    await self.process.stdin.drain()
                except (BrokenPipeError, ConnectionResetError): pass

    async def run(self):
        self.process = await asyncio.create_subprocess_exec(str(self.node), str(self.server), '--data-dir', str(self.data_dir), '--device-id', self.device_id,
                                                            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, limit=65536)
        diagnostics = asyncio.create_task(self.diagnostics())
        try:
            while line := await self.process.stdout.readline():
                message = json.loads(line)
                kind = message.get('kind')
                if self.on_event: self.on_event(message)
                if kind == 'request':
                    if len(self.requests) >= 32 or message['id'] in self.requests:
                        raise RuntimeError('Trop de requêtes Bluetooth en attente.')
                    task = asyncio.create_task(self.respond(message))
                    self.requests[message['id']] = task
                    task.add_done_callback(lambda done, request_id=message['id']: self.requests.pop(request_id, None))
                elif kind == 'cancel':
                    if task := self.requests.get(message['id']): task.cancel()
                elif kind == 'pairing' and self.show_code:
                    print(message.get('qrText', ''), flush=True)
                    print(f"Code Maison : {message['code']}", flush=True)
                elif kind == 'ready': print('Maison prêt. Ctrl+C pour arrêter. Le Raspberry Pi doit rester allumé.', flush=True)
                elif kind == 'status': print('LED connectées.' if message['connected'] else 'LED indisponibles ; reconnexion automatique…', flush=True)
                elif kind == 'warning': print(message['message'], file=sys.stderr, flush=True)
            code = await self.process.wait()
            if code: raise RuntimeError(f'Le serveur HomeKit est arrêté (code {code}). Vérifiez le port 51827 et le stockage local.')
        finally:
            self.stopping = True
            for task in list(self.requests.values()): task.cancel()
            await asyncio.gather(*list(self.requests.values()), return_exceptions=True)
            if self.process.returncode is None:
                self.process.stdin.close()
                try:
                    async with asyncio.timeout(4): await self.process.wait()
                except TimeoutError:
                    self.process.kill(); await self.process.wait()
            await diagnostics
            if self.close_controller: await self.controller.close()

    async def diagnostics(self):
        # Node sends only diagnostics to stderr. Pairing credentials stay on stdout.
        while line := await self.process.stderr.readline():
            sys.stderr.write(line.decode(errors='replace')); sys.stderr.flush()
