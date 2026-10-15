"""Portable Linux/ARM64 bridge, with verified official Node runtime and locked JS deps."""
import argparse
import hashlib
import shutil
import struct
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODE_VERSION = '24.19.0'
RUNTIMES = {
    'arm64': ('d28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f', 183),
    'x64': ('f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4', 62),
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--arch', choices=RUNTIMES, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary)
        runtime = work / 'node.tar.gz'
        filename = f'node-v{NODE_VERSION}-linux-{args.arch}'
        with urllib.request.urlopen(f'https://nodejs.org/dist/v{NODE_VERSION}/{filename}.tar.gz', timeout=120) as response, runtime.open('wb') as target:
            shutil.copyfileobj(response, target)
        assert hashlib.sha256(runtime.read_bytes()).hexdigest() == RUNTIMES[args.arch][0], 'Node checksum mismatch'
        bundle = work / f'LanternDirect-Linux-{args.arch}'
        (bundle / 'runtime/bin').mkdir(parents=True)
        with tarfile.open(runtime) as archive:
            for source, destination in [('bin/node', 'bin/node'), ('LICENSE', 'LICENSE')]:
                stream = archive.extractfile(f'{filename}/{source}')
                assert stream is not None
                (bundle / 'runtime' / destination).write_bytes(stream.read())
        binary = (bundle / 'runtime/bin/node').read_bytes()
        assert binary[:4] == b'\x7fELF' and binary[4:6] == bytes([2, 1])
        assert struct.unpack('<H', binary[18:20])[0] == RUNTIMES[args.arch][1]
        (bundle / 'runtime/bin/node').chmod(0o755)
        shutil.copy2(ROOT / 'lantern', bundle / 'lantern')
        shutil.copy2(ROOT / 'linux/install.sh', bundle / 'install.sh')
        (bundle / 'install.sh').chmod(0o755)
        (bundle / 'lantern').chmod(0o755)
        (bundle / 'linux').mkdir()
        for source in (ROOT / 'linux').glob('*.py'): shutil.copy2(source, bundle / 'linux' / source.name)
        for name in ['requirements.txt','README.md']: shutil.copy2(ROOT / 'linux' / name, bundle / 'linux' / name)
        shutil.copy2(ROOT / 'linux/README.md', bundle / 'LIRE-MOI.md')
        shutil.copy2(ROOT / 'windows/effects.json', bundle / 'linux/effects.json')
        shutil.copytree(ROOT / 'ui', bundle / 'ui', ignore=shutil.ignore_patterns('node_modules','test','package*.json','.gitignore'))
        (bundle / 'homekit').mkdir()
        for source in (ROOT / 'homekit').glob('*.js'): shutil.copy2(source, bundle / 'homekit' / source.name)
        for name in ['package.json', 'package-lock.json']: shutil.copy2(ROOT / 'homekit' / name, bundle / 'homekit' / name)
        subprocess.run(['npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', str(ROOT.parent / '.npm-cache')], cwd=bundle / 'homekit', check=True)
        assert not (bundle / 'homekit/node_modules/hap-controller').exists()
        shutil.copytree(ROOT / 'gateway', bundle / 'gateway', ignore=shutil.ignore_patterns('node_modules','test'))
        shutil.copytree(ROOT / 'docs', bundle / 'docs')
        with tarfile.open(args.output, 'w:gz') as archive: archive.add(bundle, arcname=bundle.name)
        print(f'Linux {args.arch} bundle created: {args.output.name}')

if __name__ == '__main__': main()
