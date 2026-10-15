'use strict';
const { EventEmitter } = require('node:events');
class ObservedEngine extends EventEmitter {
  constructor(adapter, fields, {save=async()=>{}}={}) {
    super(); this.adapter=adapter;this.fields=fields;this.state={};this.online=false;this.closed=false;
    this.tail=Promise.resolve();this.pending=[];this.patch={};
    this.save=save;
  }
  validate(state,patch=false){return validateFields(this.fields,state,patch);}
  serial(operation){const result=this.tail.then(operation);this.tail=result.catch(()=>{});return result;}
  async update(state,commanded=false){state=this.validate(state);try{await this.save({...state},{commanded});this.persistenceError=false;}catch{this.persistenceError=true;this.emit('persistence-warning');}if(this.closed)throw new Error('Pont arrêté.');this.state=state;this.online=true;this.emit('state',{...state});}
  refresh(){
    if(this.closed)return Promise.resolve();if(this.refreshing)return this.refreshing;
    this.refreshing=this.serial(async()=>{try{await this.update(await this.adapter.read());}catch{this.online=false;}}).finally(()=>{this.refreshing=undefined;});return this.refreshing;
  }
  async read(key){if(!Object.hasOwn(this.fields,key))throw new Error('Fonction indisponible.');await this.refresh();if(!this.online||this.closed)throw new Error('Appareil indisponible.');return this.state[key];}
  set(patch){
    try{this.validate(patch,true);}catch(error){return Promise.reject(error);}
    if(this.closed||this.pending.length>=256)return Promise.reject(new Error('Pont indisponible.'));
    return new Promise((resolve,reject)=>{Object.assign(this.patch,patch);this.pending.push({resolve,reject});this.schedule();});
  }
  schedule(){if(!this.closed&&!this.timer&&!this.flushing&&this.pending.length)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},25);}
  async flush(){
    this.flushing=true;const waiters=this.pending.splice(0),patch=this.patch;this.patch={};
    try{await this.serial(async()=>{if(this.closed)throw new Error('Pont arrêté.');await this.update(await this.adapter.apply(patch),true);});for(const waiter of waiters)waiter.resolve();}
    catch(error){this.online=false;for(const waiter of waiters)waiter.reject(error);}
    finally{this.flushing=false;this.schedule();}
  }
  close(){this.closed=true;this.online=false;clearTimeout(this.timer);for(const waiter of this.pending.splice(0))waiter.reject(new Error('Pont arrêté.'));this.patch={};}
  settle(){return this.tail;}
}
function validateFields(fields,state,patch=false){
    if(!state||typeof state!=='object'||Array.isArray(state)||!Object.keys(state).length)throw new Error('État invalide.');
    if(!patch&&Object.keys(fields).some(key=>!Object.hasOwn(state,key)))throw new Error('État incomplet.');
    for(const [key,value] of Object.entries(state)) {
      const rule=Object.hasOwn(fields,key)?fields[key]:undefined;
      if(!rule||(patch&&rule.writable===false))throw new Error('Fonction indisponible.');
      if(rule.kind==='boolean'?typeof value!=='boolean':typeof value!=='number'||!Number.isFinite(value)||value<rule.min||value>rule.max||(rule.integer&&!Number.isInteger(value)))throw new Error('Valeur hors limites.');
    }
    return state;
}
module.exports={ObservedEngine,validateFields};
