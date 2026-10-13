#!/usr/bin/env python3
"""Terminal client and HomeKit bridge for Linux / Raspberry Pi OS 64-bit."""
import argparse
import asyncio
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import subprocess
import sys
from bluetooth import Controller
from bridge import Bridge
import protocol

ROOT = Path(__file__).resolve().parents[1]

def address(value):
    value = value.upper()
    if not re.fullmatch(r'(?:[0-9A-F]{2}:){5}[0-9A-F]{2}', value):
        raise argparse.ArgumentTypeError('Adresse Bluetooth attendue : AA:BB:CC:DD:EE:FF.')
    return value

def state_directory(args):
    base = args.data_dir or Path(os.environ.get('XDG_STATE_HOME', str(Path.home() / '.local/state'))) / 'lantern-direct/homekit'
    directory = base.expanduser().resolve() / args.device.replace(':', '')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    return directory

def node_path():
    node = ROOT / 'runtime/bin/node'
    if not node.is_file():
        resolved = shutil.which('node')
        if not resolved: raise RuntimeError('Runtime Node absent. Utilisez le paquet Linux complet ou installez Node.js 22/24.')
        node = Path(resolved)
    version = subprocess.check_output([str(node), '--version'], text=True).strip()
    if int(version.lstrip('v').split('.')[0]) not in (22, 24): raise RuntimeError('Node.js 22 ou 24 requis.')
    return node

def quote_unit(value):
    if '\n' in str(value) or '\r' in str(value): raise ValueError('Chemin systemd invalide.')
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'

def service_unit(args):
    user = pwd.getpwuid(os.getuid()).pw_name
    if os.getuid() == 0: raise RuntimeError('Générez le service depuis votre compte utilisateur, sans sudo devant ./lantern.')
    directory = state_directory(args)
    command = ' '.join(quote_unit(value) for value in [ROOT / 'lantern', 'bridge', '--device', args.device, '--data-dir', directory.parent, *(['--adapter', args.adapter] if args.adapter else [])])
    return f'''[Unit]
Description=Lantern Direct — pont Bluetooth / Maison
Wants=network-online.target bluetooth.service
After=network-online.target bluetooth.service

[Service]
Type=simple
User={user}
SupplementaryGroups=bluetooth
WorkingDirectory={str(ROOT).replace('%', '%%')}
ExecStart={command}
Restart=on-failure
RestartSec=10
TimeoutStopSec=15
UMask=0077
NoNewPrivileges=true
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
'''

async def run(args):
    if args.command == 'scan':
        from bleak import BleakScanner
        options = {'bluez': {'adapter': args.adapter}} if args.adapter else {}
        results = await BleakScanner.discover(timeout=args.seconds, return_adv=True, **options)
        for device, advertisement in results.values():
            name = advertisement.local_name or device.name or '(sans nom)'
            if args.all or name.startswith(('MELK-', 'MELK_')) or protocol.SERVICE in advertisement.service_uuids:
                print(f'{device.address}  {advertisement.rssi:4} dBm  {name}')
        return
    if args.command == 'pairing':
        directory = state_directory(args)
        identity = json.loads((directory / 'identity.json').read_text())
        qr = directory / 'pairing-terminal.txt'
        if qr.is_file(): print(qr.read_text())
        print('Code Maison :', identity['pincode'])
        print('Maison → + → Ajouter un accessoire → Plus d’options, ou scanner le QR.')
        return
    if args.command == 'service':
        unit = service_unit(args)
        if not args.install: print(unit, end=''); return
        node_path()
        subprocess.run(['sudo', 'tee', '/etc/systemd/system/lantern-direct.service'], input=unit, text=True, stdout=subprocess.DEVNULL, check=True)
        subprocess.run(['sudo', 'systemctl', 'daemon-reload'], check=True)
        subprocess.run(['sudo', 'systemctl', 'enable', '--now', 'lantern-direct.service'], check=True)
        print('Service installé. État : systemctl status lantern-direct. Code : ./lantern pairing --device', args.device)
        return
    directory = state_directory(args)
    with (directory / 'controller.lock').open('a') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise RuntimeError('Un autre pont ou client Lantern utilise déjà ce contrôleur. Arrêtez le service pour le contrôle manuel.') from None
        controller = Controller(args.device, args.adapter)
        if args.command == 'bridge':
            bridge = Bridge(controller, node_path(), ROOT / 'homekit/server.js', directory, args.device.replace(':', ''), args.show_code or sys.stdout.isatty())
            task = asyncio.current_task()
            loop = asyncio.get_running_loop()
            for sig in (signal.SIGINT, signal.SIGTERM): loop.add_signal_handler(sig, task.cancel)
            try: await bridge.run()
            except asyncio.CancelledError: pass
            finally:
                for sig in (signal.SIGINT, signal.SIGTERM): loop.remove_signal_handler(sig)
            return
        try:
            await controller.connect()
            if args.command in ('on', 'off'): frames = [protocol.power(args.command == 'on')]
            elif args.command == 'color':
                if not re.fullmatch(r'[0-9A-Fa-f]{6}', args.rgb): raise ValueError('Couleur attendue : FF0000, sans #.')
                channels = [int(args.rgb[i:i+2], 16) for i in (0, 2, 4)]
                frames = [protocol.microphone(False), protocol.color(*channels), protocol.brightness(args.brightness), protocol.power(True)]
            elif args.command == 'brightness': frames = [protocol.brightness(args.value)]
            elif args.command == 'effect': frames = [protocol.microphone(False), protocol.effect(args.id, args.scene), protocol.speed(args.speed), protocol.power(True)]
            elif args.command == 'mic': frames = [protocol.microphone(args.on)] + ([protocol.mic_effect(args.effect), protocol.sensitivity(args.sensitivity), protocol.power(True)] if args.on else [])
            await controller.write(frames)
            print('Commande Bluetooth envoyée.')
        finally: await controller.close()

def parser():
    result = argparse.ArgumentParser(description='Lantern Direct — Linux et Raspberry Pi, terminal / Maison')
    commands = result.add_subparsers(dest='command', required=True)
    for name in ['scan', 'bridge', 'pairing', 'service', 'on', 'off', 'color', 'brightness', 'effect', 'mic']:
        cmd = commands.add_parser(name)
        cmd.add_argument('--adapter', help='Adaptateur BlueZ, par exemple hci0')
        if name != 'scan':
            cmd.add_argument('--device', type=address, required=True)
            cmd.add_argument('--data-dir', type=Path, help='Racine du stockage persistant (identité et appairages)')
        if name == 'scan':
            cmd.add_argument('--seconds', type=float, default=12); cmd.add_argument('--all', action='store_true')
        elif name == 'bridge': cmd.add_argument('--show-code', action='store_true', help='Afficher le code même si stdout est redirigé ; ne pas utiliser dans les journaux du service')
        elif name == 'service': cmd.add_argument('--install', action='store_true', help='Installer et activer le service via sudo ; sans option, afficher son contenu')
        elif name == 'color':
            cmd.add_argument('--rgb', required=True); cmd.add_argument('--brightness', type=int, default=100)
        elif name == 'brightness': cmd.add_argument('--value', type=int, required=True)
        elif name == 'effect':
            cmd.add_argument('--id', type=int, required=True); cmd.add_argument('--scene', action='store_true'); cmd.add_argument('--speed', type=int, default=50)
        elif name == 'mic':
            group = cmd.add_mutually_exclusive_group(required=True); group.add_argument('--on', action='store_true'); group.add_argument('--off', action='store_true')
            cmd.add_argument('--effect', type=int, default=0); cmd.add_argument('--sensitivity', type=int, default=50)
    return result

if __name__ == '__main__':
    os.umask(0o077)
    args = parser().parse_args()
    try: asyncio.run(run(args))
    except KeyboardInterrupt: pass
    except Exception as error:
        print(f'Erreur : {error}', file=sys.stderr)
        sys.exit(1)
