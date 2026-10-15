'use strict';
const {Service,Characteristic,HapStatusError,HAPStatus}=require('../homekit/node_modules/hap-nodejs');
function attachObserved(engine,accessory,name,description){
  const service=accessory.addService(Service[description.service],name);
  for(const [key,rule] of Object.entries(description.fields)){
    const characteristic=service.getCharacteristic(Characteristic[rule.characteristic]);
    if(rule.props){characteristic.value=rule.props.minValue;characteristic.setProps(rule.props);}
    characteristic.onGet(async()=>{try{return await engine.read(key);}catch{throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);}});
    if(rule.writable!==false)characteristic.onSet(async value=>{try{await engine.set({[key]:value});}catch{throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);}});
  }
  const update=state=>{if(!engine.closed)for(const [key,rule] of Object.entries(description.fields))service.updateCharacteristic(Characteristic[rule.characteristic],state[key]);};
  engine.on('state',update);return()=>engine.off('state',update);
}
module.exports={attachObserved};
