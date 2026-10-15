"""Validated, atomically replaced favourites. Never overwrite unreadable user data."""
import fcntl
from contextlib import contextmanager
import json
import os
import re
import uuid
from pathlib import Path
import protocol

class Favorites:
    def __init__(self,path):self.path=Path(path)
    @staticmethod
    def validate(item):
        if not isinstance(item,dict) or set(item)!={'id','name','mode','rgb','brightness','effect','scene','speed'}:raise ValueError('Favori invalide.')
        if not isinstance(item['id'],str) or not re.fullmatch('[0-9a-f]{32}',item['id']):raise ValueError('Identifiant invalide.')
        name=item['name']
        if not isinstance(name,str) or not 1<=len(name.strip())<=40 or any(ord(c)<32 for c in name):raise ValueError('Le nom doit contenir entre 1 et 40 caractères.')
        if item['mode'] not in ('color','effect') or not isinstance(item['rgb'],str) or not re.fullmatch('[0-9A-F]{6}',item['rgb']):raise ValueError('Ambiance invalide.')
        protocol.integer(item['brightness'],100);protocol.integer(item['speed'],100);protocol.integer(item['effect'])
        if type(item['scene']) is not bool:raise ValueError('Animation invalide.')
        return item
    def load(self):
        try:items=json.loads(self.path.read_text())
        except FileNotFoundError:return []
        if not isinstance(items,list) or len(items)>32:raise ValueError('Fichier de favoris invalide ; il est conservé.')
        for item in items:self.validate(item)
        if len({item['id'] for item in items})!=len(items):raise ValueError('Favoris dupliqués.')
        return items
    def snapshot(self):
        try:return self.load(),None
        except (OSError,ValueError,TypeError):return [],'Vos favoris sont indisponibles. Le fichier existant est conservé.'
    def write(self,items):
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        temp=self.path.with_suffix('.tmp')
        with temp.open('w') as output:
            os.chmod(temp,0o600);json.dump(items,output,ensure_ascii=False);output.flush();os.fsync(output.fileno())
        temp.replace(self.path)
    @contextmanager
    def locked(self):
        self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with Path(str(self.path)+'.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            yield
    def save(self,name,snapshot):
        with self.locked():self._save(name,snapshot)
    def _save(self,name,snapshot):
        items=self.load()
        if not isinstance(name,str):raise ValueError('Nom invalide.')
        name=name.strip()
        existing=next((x for x in items if x['name'].casefold()==name.casefold()),None)
        item=self.validate(dict(snapshot,id=existing['id'] if existing else uuid.uuid4().hex,name=name))
        if existing:items[items.index(existing)]=item
        elif len(items)<32:items.append(item)
        else:raise ValueError('Vous pouvez conserver jusqu’à 32 favoris.')
        self.write(items)
    def delete(self,identifier):
        with self.locked():self._delete(identifier)
    def _delete(self,identifier):
        items=self.load();remaining=[x for x in items if x['id']!=identifier]
        if len(items)==len(remaining):raise ValueError('Favori introuvable.')
        self.write(remaining)
    def get(self,identifier):
        item=next((x for x in self.load() if x['id']==identifier),None)
        if not item:raise ValueError('Favori introuvable.')
        return item
    @staticmethod
    def frames(item):
        Favorites.validate(item)
        mode=[protocol.color(*(int(item['rgb'][i:i+2],16) for i in (0,2,4)))] if item['mode']=='color' else [protocol.effect(item['effect'],item['scene']),protocol.speed(item['speed'])]
        return [protocol.microphone(False),*mode,protocol.brightness(item['brightness']),protocol.power(True)]
