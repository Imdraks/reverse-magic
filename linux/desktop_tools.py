import json
from pathlib import Path
import os
import re
import urllib.request

VERSION='0.8.2'
def check_updates():
    request=urllib.request.Request('https://api.github.com/repos/Imdraks/reverse-magic/releases?per_page=20',headers={'User-Agent':'LanternDirect/'+VERSION})
    try:
        with urllib.request.urlopen(request,timeout=8) as response:releases=json.load(response)
        versions=[tuple(map(int,x['tag_name'][1:].split('.'))) for x in releases if not x.get('draft') and re.fullmatch(r'v\d+\.\d+\.\d+',x.get('tag_name',''))]
        current=tuple(map(int,VERSION.split('.')));latest=max(versions,default=current);return dict(current=VERSION,latest='.'.join(map(str,latest)),available=latest>current)
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

def set_autostart(root,enabled):
    directory=Path(os.environ.get('XDG_CONFIG_HOME',str(Path.home()/'.config')))/'autostart'
    path=directory/'lantern-bridge.desktop'
    if enabled:
        directory.mkdir(parents=True,exist_ok=True)
        entry=desktop_entry(root).replace(' gui\n',' gui --homekit\n')
        path.write_text(entry);path.chmod(0o600)
    else:path.unlink(missing_ok=True)
    return enabled

def autostart_enabled():
    return (Path(os.environ.get('XDG_CONFIG_HOME',str(Path.home()/'.config')))/'autostart/lantern-bridge.desktop').is_file()
