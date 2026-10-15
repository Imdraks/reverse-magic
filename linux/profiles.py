"""Last confirmed manual settings per controller; loading never writes to the radio."""
import colorsys
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
from favorites import Favorites
import protocol

def atomic_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temporary=path.with_name(path.name+'.'+secrets.token_hex(8)+'.tmp')
    try:
        with temporary.open('x') as output:
            os.chmod(temporary,0o600);json.dump(value,output,ensure_ascii=False);output.flush();os.fsync(output.fileno())
        temporary.replace(path)
        descriptor=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(descriptor)
        finally:os.close(descriptor)
    finally:temporary.unlink(missing_ok=True)

class Profiles:
    def __init__(self,directory):self.directory=Path(directory);self.path=self.directory/'manual-profile.json'
    def load(self):
        try:value=json.loads(self.path.read_text())
        except FileNotFoundError:return None
        if not isinstance(value,dict) or set(value)!={'version','on','setting','savedAt'} or value['version']!=1 or type(value['on']) is not bool or not isinstance(value['savedAt'],str):raise ValueError('Profil mémorisé invalide ; fichier conservé.')
        Favorites.validate(value['setting']);return value
    def save(self,on,setting,bridge_state=True):
        self.load()  # Never replace corrupt user data automatically.
        setting=Favorites.validate(dict(setting,id='0'*32,name='Dernier profil'))
        value=dict(version=1,on=on,setting=setting,savedAt=datetime.now(timezone.utc).isoformat())
        if type(on) is not bool:raise ValueError('État invalide.')
        canonical=self.directory/'state.json'
        if bridge_state and canonical.exists():
            previous=json.loads(canonical.read_text())
            if not isinstance(previous,dict) or set(previous)!={'on','brightness','hue','saturation'} or type(previous['on']) is not bool:raise ValueError('État Maison invalide ; fichier conservé.')
            protocol.light_frames(previous)
        atomic_json(self.path,value)
        if bridge_state:
            h,s,_=colorsys.rgb_to_hsv(*(int(setting['rgb'][i:i+2],16)/255 for i in (0,2,4)))
            atomic_json(self.directory/'state.json',dict(on=on,brightness=setting['brightness'],hue=h*360,saturation=s*100))
        return value
    @staticmethod
    def frames(value):
        return Favorites.frames(value['setting']) if value['on'] else [protocol.microphone(False),protocol.power(False)]
