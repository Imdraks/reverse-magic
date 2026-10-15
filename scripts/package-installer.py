"""Compile the per-user NSIS installer from the complete Windows bundle."""
import argparse
from pathlib import Path,PurePosixPath
import shutil
import subprocess
import tempfile
import zipfile
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--bundle',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--makensis',default='makensis');args=parser.parse_args()
    args.output=args.output.resolve();args.output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(args.bundle) as archive:
            assert archive.testzip() is None
            for item in archive.infolist():
                assert not PurePosixPath(item.filename).is_absolute() and '..' not in PurePosixPath(item.filename).parts
            for name in ['LanternDirect.exe','node.exe','homekit/server.js']:assert name in archive.namelist()
            archive.extractall(directory)
        subprocess.run([args.makensis,'-V2',f'-DBUNDLE_DIR={directory}',f'-DOUTPUT_FILE={args.output}',str(ROOT/'installer/lantern.nsi')],check=True)
        assert args.output.read_bytes()[:2]==b'MZ'
        print('Windows per-user installer created:',args.output.name)
if __name__=='__main__':main()
