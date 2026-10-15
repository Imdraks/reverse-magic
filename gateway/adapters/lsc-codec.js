'use strict';
const {lightProfile,describeLight}=require('./lsc-profiles');
const {validateFields}=require('../observed-engine');
function number(value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('DP numérique invalide.');return value;}
function hex(value,length){return Math.round(value).toString(16).padStart(length,'0');}
function decodeColor(value,format){
  const length=format==='hsv'?12:14;
  if(typeof value!=='string'||!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value))throw new Error('DP couleur invalide.');
  const offset=format==='hsv'?0:6,unit=format==='hsv'?1000:255,width=format==='hsv'?4:2;
  const hue=number(parseInt(value.slice(offset,offset+4),16),0,360)%360;
  const saturation=number(parseInt(value.slice(offset+4,offset+4+width),16),0,unit)*100/unit;
  const brightness=number(parseInt(value.slice(offset+4+width),16),0,unit)*100/unit;
  return {hue,saturation,brightness:Math.round(brightness)};
}
function encodeColor(hue,saturation,brightness,format){
  hue=number(hue,0,360)%360;number(saturation,0,100);number(brightness,0,100);
  if(format==='hsv')return hex(hue,4)+hex(saturation*10,4)+hex(brightness*10,4);
  const h=hue/60,s=saturation/100,v=brightness/100,c=v*s,x=c*(1-Math.abs(h%2-1)),m=v-c;
  const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
  return rgb.map(channel=>hex((channel+m)*255,2)).join('')+hex(hue,4)+hex(s*255,2)+hex(v*255,2);
}
function description(options){return describeLight(options);}
function validateState(options,state,patch=false){return validateFields(description(options).fields,state,patch);}
function decode(options,dps){
  if(!dps||typeof dps!=='object'||Array.isArray(dps))throw new Error('DP absents.');
  let state;
    const profile=lightProfile(options),map=profile.dps;
    if(map.mode&&typeof dps[map.mode]!=='string')throw new Error('DP de mode absent.');
    state={on:dps[map.on],brightness:map.brightness?Math.round(1+99*(number(dps[map.brightness],profile.minimum,profile.maximum)-profile.minimum)/(profile.maximum-profile.minimum)):0};
    if(profile.colorFormat){const color=decodeColor(dps[map.color],profile.colorFormat);state.hue=color.hue;state.saturation=color.saturation;if(!map.brightness||dps[map.mode]==='colour')state.brightness=color.brightness;}
    if(map.temperature){const t=number(dps[map.temperature],0,profile.temperatureMaximum)/profile.temperatureMaximum;const bounds=describeLight(options).fields.colorTemperature;state.colorTemperature=Math.max(bounds.min,Math.min(bounds.max,Math.round(1e6/(profile.kelvinMin+t*(profile.kelvinMax-profile.kelvinMin)))));}
  validateState(options,state);return state;
}
function encode(options,patch,current){
  validateState(options,patch,true);const state=decode(options,current);
  const profile=lightProfile(options),map=profile.dps,result={};
  const color=Object.hasOwn(patch,'hue')||Object.hasOwn(patch,'saturation'),temperature=Object.hasOwn(patch,'colorTemperature');
  if(color&&temperature)throw new Error('Choisissez une couleur ou une température de blanc.');
  if(Object.hasOwn(patch,'on'))result[map.on]=patch.on;
  if(patch.brightness===0){result[map.on]=false;}
  const colorMode=profile.colorFormat&&(!map.brightness||color||(!temperature&&current[map.mode]==='colour'));
  if(colorMode&&(color||patch.brightness>0)){
    if(map.mode)result[map.mode]='colour';result[map.color]=encodeColor(patch.hue??state.hue,patch.saturation??state.saturation,patch.brightness??state.brightness,profile.colorFormat);
  }else if(temperature||patch.brightness>0){
    if(map.mode)result[map.mode]='white';
    if(patch.brightness>0)result[map.brightness]=Math.round(profile.minimum+(patch.brightness-1)*(profile.maximum-profile.minimum)/99);
    if(temperature){const kelvin=Math.max(profile.kelvinMin,Math.min(profile.kelvinMax,1e6/patch.colorTemperature));result[map.temperature]=Math.round((kelvin-profile.kelvinMin)*profile.temperatureMaximum/(profile.kelvinMax-profile.kelvinMin));}
  }
  return result;
}
function probe(dps){
  if(!dps||typeof dps!=='object'||Array.isArray(dps))throw new Error('DP absents.');
  const datapoints=Object.entries(dps).filter(([key])=>/^[0-9]{1,3}$/.test(key)).map(([dp,value])=>({dp:Number(dp),type:typeof value,...(typeof value==='string'?{length:value.length}:{})})).sort((a,b)=>a.dp-b.dp);
  const candidates=[];
  if(typeof dps[1]==='boolean'){if(typeof dps[5]==='string'&&dps[5].length===14)candidates.push(typeof dps[3]==='number'&&typeof dps[4]==='number'?'rgbcct-v1':'rgb-v1');else if(typeof dps[3]==='number'&&typeof dps[4]==='number')candidates.push('white-v1');}
  if(typeof dps[20]==='boolean'){if(typeof dps[24]==='string'&&dps[24].length===12)candidates.push(typeof dps[22]==='number'&&typeof dps[23]==='number'?'rgbcct-v2':'rgb-v2');else if(typeof dps[22]==='number')candidates.push(typeof dps[23]==='number'?'white-v2':'dimmer-v2');}
  return {datapoints,candidates,note:'Profils candidats, pas une validation du modèle. Aucune commande envoyée.'};
}
module.exports={decode,encode,decodeColor,encodeColor,probe,description};
