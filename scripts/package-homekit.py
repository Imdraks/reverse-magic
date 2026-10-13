"""Build a portable Windows HomeKit bundle from an already published .NET app."""
import argparse
import hashlib
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

NODE_VERSION = '24.19.0'
NODE_SHA256 = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--exe', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    assert args.exe.read_bytes()[:2] == b'MZ', 'Expected Windows executable'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary)
        runtime = work / 'node.zip'
        with urllib.request.urlopen(f'https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-win-x64.zip', timeout=120) as response:
            with runtime.open('wb') as target:
                shutil.copyfileobj(response, target)
        assert hashlib.sha256(runtime.read_bytes()).hexdigest() == NODE_SHA256, 'Node runtime checksum mismatch'
        bundle = work / 'bundle'
        bundle.mkdir()
        with zipfile.ZipFile(runtime) as archive:
            prefix = f'node-v{NODE_VERSION}-win-x64/'
            for source, destination in [('node.exe', 'node.exe'), ('LICENSE', 'NODE-LICENSE.txt')]:
                (bundle / destination).write_bytes(archive.read(prefix + source))
        shutil.copy2(args.exe, bundle / 'LanternDirect.exe')
        shutil.copy2(ROOT / 'MAISON-WINDOWS.txt', bundle / 'LIRE-MOI.txt')
        homekit = bundle / 'homekit'
        homekit.mkdir()
        for source in (ROOT / 'homekit').glob('*.js'):
            shutil.copy2(source, homekit / source.name)
        for name in ['package.json', 'package-lock.json']:
            shutil.copy2(ROOT / 'homekit' / name, homekit / name)
        subprocess.run(['npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', str(ROOT.parent / '.npm-cache')], cwd=homekit, check=True)
        assert (homekit / 'node_modules/hap-nodejs/dist/index.js').is_file()
        assert not (homekit / 'node_modules/hap-controller').exists(), 'Test-only dependency included'
        with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for file in sorted(bundle.rglob('*')):
                if file.is_file(): archive.write(file, file.relative_to(bundle))
        with zipfile.ZipFile(args.output) as archive:
            assert archive.testzip() is None
        print(f'HomeKit Windows bundle created: {args.output.name}')

if __name__ == '__main__':
    main()
