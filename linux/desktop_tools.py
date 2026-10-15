import json
from pathlib import Path
import os
import re
import urllib.request

VERSION='0.7.1'
def check_updates():
    request=urllib.request.Request('https://api.github.com/repos/Imdraks/reverse-magic/releases?per_page=20',headers={'User-Agent':'LanternDirect/'+VERSION})
    try:
        with urllib.request.urlopen(request,timeout=8) as response:releases=json.load(response)
        versions=[tuple(map(int,x['tag_name'][1:].split('.'))) for x in releases if not x.get('draft') and re.fullmatch(r'v\d+\.\d+\.\d+',x.get('tag_name',''))]
        latest=max(versions,default=(0,7,0));return dict(current=VERSION,latest='.'.join(map(str,latest)),available=latest>(0,7,0))
    except Exception:raise ValueError('Impossible de vérifier les versions. Vos commandes locales restent disponibles ; réessayez avec Internet.') from None

def desktop_entry(root):
    root=Path(root).resolve()
    if any(c in str(root) for c in '\n\r'):raise ValueError('Chemin de raccourci invalide.')
    def quote(value):return '"'+str(value).replace('\\','\\\\\\\\').replace('"','\\\\\\"').replace('`','\\\\`').replace('$','\\\\$').replace('%','%%')+'"'
    return f'[Desktop Entry]\nType=Application\nName=Lantern Bridge\nComment=Votre pont local vers Maison\nExec={quote(root/"lantern")} gui\nIcon={root/"ui/icon.svg"}\nTerminal=false\nCategories=Utility;\nStartupNotify=false\n'

def install_shortcut(root):
    directory=Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))/'applications'
    directory.mkdir(parents=True,exist_ok=True)
    path=directory/'lantern-direct.desktop';path.write_text(desktop_entry(root));path.chmod(0o644)
    return path
