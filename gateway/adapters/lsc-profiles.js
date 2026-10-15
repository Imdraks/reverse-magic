'use strict';
const net=require('node:net');
const LIGHTS=Object.freeze({
  'rgbcct-v1':{dps:{on:1,mode:2,brightness:3,temperature:4,color:5},minimum:25,maximum:255,colorFormat:'rgbhsv',temperatureMaximum:255},
  'rgbcct-v2':{dps:{on:20,mode:21,brightness:22,temperature:23,color:24},minimum:10,maximum:1000,colorFormat:'hsv',temperatureMaximum:1000},
  'white-v1':{dps:{on:1,mode:2,brightness:3,temperature:4},minimum:25,maximum:255,temperatureMaximum:255},
  'rgb-v1':{dps:{on:1,mode:2,color:5},colorFormat:'rgbhsv'},
  'rgb-v2':{dps:{on:20,mode:21,color:24},colorFormat:'hsv'},
  'white-v2':{dps:{on:20,mode:21,brightness:22,temperature:23},minimum:10,maximum:1000,temperatureMaximum:1000},
  'dimmer-v2':{dps:{on:20,brightness:22},minimum:10,maximum:1000},
});
const COMMON=['ip','port','deviceIdEnv','localKeyEnv','version'];
function envName(value){return typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value);}
function integer(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max;}
function validateCommon(options){
  if(net.isIP(options.ip)!==4||!envName(options.deviceIdEnv)||!envName(options.localKeyEnv)||!['3.1','3.3','3.4','3.5'].includes(options.version))throw new Error('LSC : IP, variables d’identifiant/clé locale ou version Tuya invalides.');
  if(options.port!==undefined&&!integer(options.port,1,65535))throw new Error('Port Tuya invalide.');
  return `${options.ip}:${options.port||6668}`;
}
function lightProfile(options){
  const base=typeof options.profile==='string'&&Object.hasOwn(LIGHTS,options.profile)?LIGHTS[options.profile]:null;
  if(!base)throw new Error('Profil LSC inconnu. Inspectez les DP avant de choisir un profil.');
  const overrides=options.dps===undefined?{}:options.dps;
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(key=>!Object.hasOwn(base.dps,key)))throw new Error('Mapping DP LSC invalide.');
  const dps={...base.dps,...overrides};if(dps.mode===null)delete dps.mode;const values=Object.values(dps);
  if(!values.every(x=>integer(x,1,255))||new Set(values).size!==values.length)throw new Error('Les DP doivent être distincts et compris entre 1 et 255.');
  const kelvinMin=options.kelvinMin===undefined?2700:options.kelvinMin,kelvinMax=options.kelvinMax===undefined?6500:options.kelvinMax;
  if(!integer(kelvinMin,2000,9000)||!integer(kelvinMax,2000,9000)||kelvinMin>=kelvinMax)throw new Error('Plage de blanc invalide.');
  return {...base,dps,kelvinMin,kelvinMax};
}
function describeLight(options){
  const profile=lightProfile(options);
  const fields={on:{kind:'boolean',characteristic:'On'},brightness:{kind:'number',min:0,max:100,integer:true,characteristic:'Brightness'}};
  if(profile.colorFormat){fields.hue={kind:'number',min:0,max:360,characteristic:'Hue'};fields.saturation={kind:'number',min:0,max:100,characteristic:'Saturation'};}
  if(profile.dps.temperature){const min=Math.ceil(1e6/profile.kelvinMax),max=Math.floor(1e6/profile.kelvinMin);fields.colorTemperature={kind:'number',min,max,integer:true,characteristic:'ColorTemperature',props:{minValue:min,maxValue:max}};}
  return {service:'Lightbulb',fields};
}
function validateLight(options){const target=validateCommon(options);lightProfile(options);return target;}
const OPTIONS={light:[...COMMON,'profile','dps','kelvinMin','kelvinMax']};
module.exports={LIGHTS,COMMON,OPTIONS,validateCommon,validateLight,lightProfile,describeLight};
