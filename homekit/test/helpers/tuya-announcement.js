// Independent Tuya UDP wire fixtures for protocol and browser integration tests.
const crypto=require('node:crypto');
const key=crypto.createHash('md5').update('yGAdlopoPVldABfn').digest();
function frame(payload,{encrypted=false,modern=false,command=19}={}){
  let bytes=Buffer.from(JSON.stringify(payload));
  if(modern){
    bytes=Buffer.concat([Buffer.alloc(4),bytes]);const header=Buffer.alloc(18);
    header.writeUInt32BE(0x6699);header.writeUInt32BE(command,10);header.writeUInt32BE(bytes.length+28,14);
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-128-gcm',key,iv);cipher.setAAD(header.subarray(4));
    return Buffer.concat([header,iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag(),Buffer.from('00009966','hex')]);
  }
  if(encrypted){const cipher=crypto.createCipheriv('aes-128-ecb',key,null);bytes=Buffer.concat([cipher.update(bytes),cipher.final()]);}
  const header=Buffer.alloc(20);header.writeUInt32BE(0x55aa);header.writeUInt32BE(command,8);header.writeUInt32BE(bytes.length+12,12);
  const body=Buffer.concat([header,bytes]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const tail=Buffer.alloc(8);tail.writeUInt32BE((crc^0xffffffff)>>>0);tail.writeUInt32BE(0xaa55,4);return Buffer.concat([body,tail]);
}
module.exports={frame};
