'use strict';
const {LIGHTS}=require('./adapters/lsc-profiles');
function modelCatalog(){return {
  version:1,physicalModelsVerified:0,
  note:'Les protocoles sont testés avec des simulateurs. Aucun modèle physique n’a encore été validé par ce projet. Les références commerciales ne suffisent pas à choisir un profil.',
  models:[
    {id:'lsc-970709',name:'LSC A60 Gold — 970709 / 3001686',adapter:'lsc-tuya-light',validation:'documented-variant',profiles:['white-v2'],functions:['on','brightness','colorTemperature'],source:'https://github.com/tuya-cloudcutter/tuya-cloudcutter.github.io/blob/master/devices/lsc-3001686-970709-warm-white-smart-filament-e27-806lumen.json',limits:'Variante documentée en 2.9.6 ; votre 1.1.6 et ses DP restent à vérifier. Le profil proposé est un candidat, sans plage physique de blanc certifiée.'},
    {id:'lsc-3208075',name:'LSC — référence Action 3208075',adapter:'lsc-tuya-light',validation:'unverified',profiles:[],functions:[],source:'https://www.action.com/fr-fr/p/3208075/ampoules-led-connectees-lsc-smart-connect/',limits:'Schéma DP et variante matérielle non validés. Inspecter les DP sans changer la lumière avant de choisir un profil.'},
  ],
  profiles:Object.keys(LIGHTS).map(id=>({id,adapter:'lsc-tuya-light',validation:'simulator-tested',physicalModelVerified:false,functions:['on','brightness',...(LIGHTS[id].colorFormat?['hue','saturation']:[]),...(LIGHTS[id].dps.temperature?['colorTemperature']:[])]})),
};}
module.exports={modelCatalog};
