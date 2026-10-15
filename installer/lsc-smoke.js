'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {TuyaDeviceFixture}=require('../homekit/test/helpers/tuya-device');
const {LscTuya}=require(path.join(process.argv[2],'gateway/adapters/lsc-tuya'));
async function main(){
  process.env.LSC_INSTALLER_ID='installer_device_1234';process.env.LSC_INSTALLER_KEY='0123456789abcdef';
  const fixture=await new TuyaDeviceFixture('3.5',{20:true,21:'white',22:505,23:500,24:'000003e803e8'}).start();
  const options={ip:'127.0.0.1',port:fixture.port,version:'3.5',deviceIdEnv:'LSC_INSTALLER_ID',localKeyEnv:'LSC_INSTALLER_KEY',profile:'rgbcct-v2'};
  const adapter=new LscTuya(options);
  try{
    await adapter.read();await adapter.probe();assert.equal(fixture.writes.length,0);
    await adapter.apply({hue:120,saturation:100,brightness:35});assert.equal(fixture.dps[24],'007803e8015e');
    await adapter.apply({colorTemperature:250});assert.equal(fixture.dps[21],'white');
    fixture.silentAfterWrite=true;const bounded=new LscTuya(options,{timeout:2000});
    try{await assert.rejects(bounded.apply({on:false}));assert.equal(bounded.children.size,0);}finally{await bounded.close();}
  }finally{await adapter.close();await fixture.close();}
  console.log('Installed Windows Tuya 3.5 worker, authenticated local commands, read-only probe and timeout cleanup verified.');
}
main().catch(()=>{console.error('Installed LSC runtime test failed; private protocol data withheld.');process.exitCode=1;});
