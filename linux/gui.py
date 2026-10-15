"""Local desktop UI. Loopback only; every command requires a per-process bearer key."""
import asyncio
import base64
import colorsys
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import signal
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from bluetooth import Controller
from bridge import Bridge
import protocol
from favorites import Favorites
from diagnostics import issue, diagnose

ROOT = Path(__file__).resolve().parents[1]

class Desktop:
    def __init__(self, args, controller_factory=Controller):
        self.args = args
        self.base = (args.data_dir or Path(os.environ.get('XDG_STATE_HOME',str(Path.home()/'.local/state'))) / 'lantern-direct/homekit').expanduser().resolve()
        self.base.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.preferences = self.base/'gui-device.json'
        self.device = args.device
        self.device_name = ''
        if not self.device:
            try:
                saved = json.loads(self.preferences.read_text())
                if re.fullmatch(r'(?:[0-9A-F]{2}:){5}[0-9A-F]{2}',saved['address']):
                    self.device,self.device_name = saved['address'],saved.get('name','Contrôleur LED')
            except (OSError,ValueError,KeyError,TypeError): pass
        self.factory = controller_factory
        self.controller = None
        self.lock_file = None
        self.devices = []
        self.bridge = None
        self.bridge_task = None
        self.pairing_ready = False
        self.status = 'Connectez vos LED pour composer votre ambiance.'
        self.on,self.brightness,self.rgb,self.mic = False,100,'FFB340',False
        self.mode,self.effect,self.scene,self.speed,self.known='color',0,False,50,False
        self.favorites=Favorites(self.base/'favorites.json')
        self.connection_issue=None;self.connect_task=None;self.attempt=0
        self.commands = asyncio.Lock()
        self.stop = asyncio.Event()
        self.effects = json.loads((ROOT/'windows/effects.json').read_text()) if (ROOT/'windows/effects.json').exists() else json.loads((ROOT/'linux/effects.json').read_text())

    def snapshot(self):
        favorites,error=self.favorites.snapshot()
        if self.controller and not self.controller.connected and not self.connect_task and not self.bridge_task and self.connection_issue is None:
            self.connection_issue=issue(ConnectionError('Connexion perdue.'));self.status='Connexion interrompue.'
        return dict(version='0.6.0',favorites=favorites,favoritesError=error,canSaveFavorite=self.known and not self.mic and not error,connectionIssue=self.connection_issue,connecting=self.connect_task is not None,connectionAttempt=self.attempt,platform='linux',connected=bool(self.controller and self.controller.connected),device=self.device,deviceName=self.device_name,
                    on=self.on,brightness=self.brightness,rgb=self.rgb,mic=self.mic,bridge=self.bridge_task is not None and not self.bridge_task.done(),
                    pairingReady=self.pairing_ready,devices=self.devices,effects=self.effects,status=self.status)

    def directory(self):
        if not self.device: raise ValueError('Connectez un contrôleur pour commencer.')
        return self.base/self.device.replace(':','')

    async def disconnect(self):
        if self.controller: await self.controller.close()
        self.controller = None
        if self.lock_file: self.lock_file.close(); self.lock_file=None

    async def connect(self,data):
        address=data.get('address',self.device)
        if not isinstance(address,str) or not re.fullmatch(r'(?:[0-9A-F]{2}:){5}[0-9A-F]{2}',address): raise ValueError('Adresse Bluetooth invalide.')
        await self.disconnect()
        self.device=address
        self.device_name=str(data.get('name') or next((x['name'] for x in self.devices if x['address']==address),'Contrôleur LED'))[:120]
        directory=self.directory();directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.lock_file=(directory/'controller.lock').open('a')
        try: fcntl.flock(self.lock_file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock_file.close();self.lock_file=None
            raise ValueError('Ce contrôleur est déjà utilisé. Arrêtez le service Lantern ou l’autre pont avant de le connecter ici.') from None
        self.controller=self.factory(address,self.args.adapter)
        try: await self.controller.connect()
        except BaseException: await self.disconnect();raise
        try:self.preferences.write_text(json.dumps({'address':address,'name':self.device_name}))
        except OSError:pass
        self.known=False;self.connection_issue=None
        self.status='Votre lumière est connectée.'

    async def connect_with_retry(self,data):
        self.connect_task=asyncio.current_task()
        try:
            for attempt in (1,2):
                self.attempt=attempt;self.connection_issue=None
                self.status=f'Connexion aux LED · tentative {attempt} sur 2…'
                try:await self.connect(data);return
                except asyncio.CancelledError:raise
                except Exception as error:
                    self.connection_issue=issue(error)
                    if not self.connection_issue['retryable'] or attempt==2:
                        self.status=self.connection_issue['title'];raise ValueError(self.connection_issue['message']) from None
                    await asyncio.sleep(2)
        except asyncio.CancelledError:
            self.connection_issue=None;self.status='Connexion annulée.'
            raise ValueError(self.status) from None
        finally:self.connect_task=None;self.attempt=0

    def favorite_snapshot(self):
        return dict(mode=self.mode,rgb=self.rgb,brightness=self.brightness,effect=self.effect,scene=self.scene,speed=self.speed)

    def notification(self,event):
        if event.get('kind')=='pairing': self.pairing_ready=True
        elif event.get('kind')=='status': self.status='Maison est connecté à vos LED.' if event['connected'] else 'Connexion interrompue. Le pont réessaie automatiquement.'
        elif event.get('kind')=='light':
            state=event['state'];self.on=state['on'];self.brightness=state['brightness'];self.mic=False;self.mode='color';self.known=True
            self.rgb=''.join(f'{round(x*255):02X}' for x in colorsys.hsv_to_rgb(state['hue']/360,state['saturation']/100,1))
        elif event.get('kind')=='warning': self.status=event['message']

    async def stop_bridge(self):
        task,self.bridge_task=self.bridge_task,None
        if task and not task.done():
            task.cancel();await asyncio.gather(task,return_exceptions=True)
        self.bridge=None;self.pairing_ready=False

    async def command(self,action,data):
        if action=='state': return self.snapshot()
        if action=='cancel-connect':
            if self.connect_task:self.connect_task.cancel()
            return {}
        if action=='quit': asyncio.get_running_loop().call_later(.3,self.stop.set);return {}
        async with self.commands:
            if self.snapshot()['bridge'] and action not in ('bridge-stop','pairing','favorite-delete','diagnose','check-updates','open-downloads'):
                raise ValueError('Maison pilote vos LED. Arrêtez le pont pour utiliser les commandes directes.')
            if action=='scan':
                from bleak import BleakScanner
                self.status='Recherche des LED à proximité…'
                options={'bluez':{'adapter':self.args.adapter}} if self.args.adapter else {}
                found=await BleakScanner.discover(timeout=10,return_adv=True,**options)
                self.devices=[]
                for device,advertisement in found.values():
                    name=advertisement.local_name or device.name or 'Appareil sans nom'
                    if data.get('all') or name.startswith(('MELK-','MELK_')) or protocol.SERVICE in advertisement.service_uuids:
                        self.devices.append(dict(address=device.address,name=name,rssi=advertisement.rssi))
                self.status='Choisissez votre contrôleur.' if self.devices else 'Aucune LED trouvée. Vérifiez leur alimentation et fermez les autres apps Bluetooth.'
            elif action=='connect': await self.connect_with_retry(data)
            elif action=='disconnect': await self.disconnect();self.connection_issue=None;self.status='Connexion fermée.'
            elif action=='bridge-start':
                if not self.controller or not self.controller.connected: await self.connect(dict(address=self.device,name=self.device_name))
                if self.mic:
                    await self.controller.write([protocol.microphone(False)])
                    self.mic=False
                from lantern import node_path
                self.bridge=Bridge(self.controller,node_path(),ROOT/'homekit/server.js',self.directory(),self.device.replace(':',''),on_event=self.notification,close_controller=False)
                self.bridge_task=asyncio.create_task(self.bridge.run())
                self.bridge_task.add_done_callback(self.bridge_done)
                self.status='Maison se prépare…'
            elif action=='bridge-stop': await self.stop_bridge();self.status='Pont Maison arrêté.'
            elif action=='favorite-save':
                if not self.known or self.mic:raise ValueError('Choisissez une couleur ou une animation avant de l’enregistrer.')
                self.favorites.save(data['name'],self.favorite_snapshot())
            elif action=='favorite-delete':self.favorites.delete(data['id'])
            elif action=='favorite-apply':
                if not self.controller or not self.controller.connected:raise ValueError('Connectez vos LED dans Appareils.')
                favorite=self.favorites.get(data['id'])
                await self.controller.write(Favorites.frames(favorite))
                for key in ('mode','rgb','brightness','effect','scene','speed'):setattr(self,key,favorite[key])
                self.on=True;self.mic=False;self.known=True;self.status='Votre favori est appliqué.'
            elif action=='diagnose':return {'checks':await diagnose(self.args.adapter)}
            elif action=='check-updates':
                from desktop_tools import check_updates
                return await asyncio.to_thread(check_updates)
            elif action=='open-downloads':
                await asyncio.to_thread(webbrowser.open,'https://github.com/Imdraks/reverse-magic/releases')
                return {}
            elif action=='pairing':
                if not self.pairing_ready: raise ValueError('Le code est en cours de préparation.')
                directory=self.directory();identity=json.loads((directory/'identity.json').read_text())
                return dict(code=identity['pincode'],image='data:image/png;base64,'+base64.b64encode((directory/'pairing.png').read_bytes()).decode())
            else:
                if not self.controller or not self.controller.connected: raise ValueError('Connectez vos LED dans Appareils.')
                if action=='power':
                    frames=[protocol.microphone(False),protocol.power(data['on'])] if not data['on'] else [protocol.power(True)]
                elif action=='color':
                    rgb=data['rgb']
                    if not isinstance(rgb,str) or not re.fullmatch('[0-9A-Fa-f]{6}',rgb): raise ValueError('Couleur invalide.')
                    frames=[protocol.microphone(False),protocol.color(*(int(rgb[x:x+2],16) for x in (0,2,4))),protocol.brightness(self.brightness),protocol.power(True)]
                elif action=='brightness': frames=[protocol.brightness(data['value'])]
                elif action=='effect': frames=[protocol.microphone(False),protocol.effect(data['id'],bool(data.get('scene'))),protocol.speed(data['speed']),protocol.power(True)]
                elif action=='speed': frames=[protocol.speed(data['value'])]
                elif action=='sensitivity': frames=[protocol.sensitivity(data['value'])]
                elif action=='mic': frames=[protocol.microphone(data['on'])]+([protocol.mic_effect(data['effect']),protocol.sensitivity(data['sensitivity']),protocol.power(True)] if data['on'] else [])
                else: raise ValueError('Commande inconnue.')
                await self.controller.write(frames)
                if action=='power': self.on=data['on'];self.mic=self.mic if self.on else False
                if action=='color': self.rgb=data['rgb'].upper();self.on=True;self.mic=False;self.mode='color';self.known=True
                if action=='brightness': self.brightness=data['value']
                if action=='effect': self.on=True;self.mic=False;self.mode='effect';self.effect=data['id'];self.scene=bool(data.get('scene'));self.speed=data['speed'];self.known=True
                if action=='speed':self.speed=data['value']
                if action=='mic': self.mic=data['on'];self.on=self.on or self.mic
                self.status='Votre réglage a été appliqué.'
            return {'state':self.snapshot()}

    def bridge_done(self,task):
        if not task.cancelled():
            try: task.result()
            except Exception: self.status='Le pont s’est arrêté. Vérifiez la connexion et réactivez Maison.'
        if task is self.bridge_task: self.pairing_ready=False

    async def close(self):
        if self.connect_task and self.connect_task is not asyncio.current_task():
            self.connect_task.cancel();await asyncio.gather(self.connect_task,return_exceptions=True)
        await self.stop_bridge();await self.disconnect()

class LocalServer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,desktop,loop):
        self.desktop,self.loop,self.token=desktop,loop,secrets.token_urlsafe(32)
        super().__init__(('127.0.0.1',0),Handler)
        self.origin=f'http://127.0.0.1:{self.server_port}'

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def respond(self,status,content,kind='application/json'):
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(content)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer');self.end_headers()
        try:self.wfile.write(content)
        except (BrokenPipeError,ConnectionResetError):pass
    def host_ok(self): return self.headers.get('Host')==f'127.0.0.1:{self.server.server_port}'
    def do_GET(self):
        if not self.host_ok():self.respond(403,b'{}');return
        name=urlsplit(self.path).path
        files={'/':('index.html','text/html; charset=utf-8'),'/index.html':('index.html','text/html; charset=utf-8'),'/style.css':('style.css','text/css'),'/app.js':('app.js','text/javascript'),'/icon.svg':('icon.svg','image/svg+xml')}
        if name not in files:self.respond(404,b'{}');return
        name,kind=files[name];self.respond(200,(ROOT/'ui'/name).read_bytes(),kind)
    def do_POST(self):
        if not self.host_ok() or not secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token) or self.headers.get('Origin',self.server.origin)!=self.server.origin:
            self.respond(403,b'{"ok":false,"error":"Session non autorisee."}');return
        path=urlsplit(self.path).path
        if not path.startswith('/api/') or not path[5:] or self.headers.get('Content-Type')!='application/json':self.respond(400,b'{"ok":false}');return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=8192: raise ValueError('Requête invalide.')
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict): raise ValueError('Requête invalide.')
            future=asyncio.run_coroutine_threadsafe(self.server.desktop.command(path[5:],data),self.server.loop)
            try:result=future.result(timeout=60 if path[5:]=='connect' else 36)
            except TimeoutError:future.cancel();raise ValueError('Le contrôleur ne répond pas. Réessayez après reconnexion.')
            self.respond(200,json.dumps({'ok':True,'result':result}).encode())
        except Exception as error:self.respond(400,json.dumps({'ok':False,'error':str(error)}).encode())

async def run_gui(args):
    desktop=Desktop(args)
    loop=asyncio.get_running_loop()
    server=LocalServer(desktop,loop)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    for sig in (signal.SIGTERM,signal.SIGINT):loop.add_signal_handler(sig,desktop.stop.set)
    try:
        url=server.origin+'/#key='+server.token
        if not webbrowser.open(url):print('Ouvrez Lantern dans le navigateur de cet appareil :',url,flush=True)
        print('Lantern est ouvert. Ctrl+C pour quitter et libérer les LED.',flush=True)
        await desktop.stop.wait()
    finally:
        await asyncio.to_thread(server.shutdown);server.server_close();await desktop.close()
        for sig in (signal.SIGTERM,signal.SIGINT):loop.remove_signal_handler(sig)
