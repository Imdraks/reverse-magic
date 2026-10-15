'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {adapters}=require('./registry');
const {validateFields}=require('./observed-engine');
const {writeJSON}=require('../homekit/storage');
function canonical(value){return value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
class ProfileStore {
  constructor(directory,device){
    this.device=device;this.directory=directory;this.file=path.join(directory,'profile.json');
    this.fields=adapters[device.adapter].describe?.(device.options)?.fields;
    // A DHCP change or renewed local key must not erase a lamp's logical profile.
    // Incompatible capability/range changes still require a new confirmed state.
    this.signature=crypto.createHash('sha256').update(JSON.stringify([device.adapter,canonical(this.fields)])).digest('hex');
  }
  async load(){
    let record;try{record=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw new Error('Profil mémorisé illisible ; fichier conservé.');}
    if(!record||Object.keys(record).length!==6||record.version!==1||typeof record.signature!=='string'||!/^[0-9a-f]{64}$/.test(record.signature)||!record.state||typeof record.state!=='object'||Array.isArray(record.state)||!['white','colour','relay','unsupported'].includes(record.mode)||!['command','observation'].includes(record.source)||typeof record.savedAt!=='string'||!Number.isFinite(Date.parse(record.savedAt)))throw new Error('Profil mémorisé invalide ; fichier conservé.');
    if(record.signature!==this.signature)return null;
    validateFields(this.fields,record.state);return record;
  }
  mode(value){
    if(this.device.adapter==='shelly-gen1-relay')return 'relay';
    if(value==='colour')return this.fields.hue?'colour':'unsupported';
    if(value==='white')return this.fields.hue&&!this.fields.colorTemperature?'unsupported':'white';
    if(value)return 'unsupported';
    if(!this.fields.hue)return 'white';
    return this.fields.colorTemperature?'unsupported':'colour';
  }
  async save(state,{commanded=false,mode}={}){
    validateFields(this.fields,state);const previous=await this.load();
    // Preserve the last confirmed Lantern choice across a bulb's factory-default
    // startup state. Read-only reconnects must neither replay nor overwrite it.
    if(previous&&!commanded)return previous;
    const record={version:1,signature:this.signature,source:commanded?'command':'observation',mode:this.mode(mode),state:{...state},savedAt:new Date().toISOString()};
    if(previous&&previous.mode===record.mode&&JSON.stringify(previous.state)===JSON.stringify(record.state)&&previous.source===record.source)return previous;
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});await writeJSON(this.file,record);return record;
  }
  patch(record){
    if(!record||record.mode==='unsupported')throw new Error('Le mode de ce profil ne peut pas être rétabli par cet adaptateur.');
    validateFields(this.fields,record.state);const state=record.state,patch={on:state.on};
    if(this.fields.brightness)patch.brightness=state.brightness;
    if(record.mode==='colour'){patch.hue=state.hue;patch.saturation=state.saturation;}
    if(record.mode==='white'&&this.fields.colorTemperature)patch.colorTemperature=state.colorTemperature;
    return patch;
  }
}
module.exports={ProfileStore};
