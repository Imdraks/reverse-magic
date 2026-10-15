// Independent TCP device emulator using node:crypto, not TuyAPI's message parser.
const net=require('node:net');
const crypto=require('node:crypto');
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function ecb(data,key,decrypt=false,padding=true){const cipher=crypto[decrypt?'createDecipheriv':'createCipheriv']('aes-128-ecb',key,null);cipher.setAutoPadding(padding);return Buffer.concat([cipher.update(data),cipher.final()]);}
function hmac(data,key){return crypto.createHmac('sha256',key).update(data).digest();}
class TuyaDeviceFixture{
  constructor(version,dps,key='0123456789abcdef'){this.version=version;this.dps={...dps};this.key=Buffer.from(key);this.writes=[];this.sockets=new Set();this.silent=false;this.rejectWrites=false;this.sessions=0;this.nonces=new Set();this.reusedNonces=0;}
  async start(){
    this.server=net.createServer(socket=>{
      this.sockets.add(socket);socket.on('close',()=>this.sockets.delete(socket));socket.on('error',()=>{});
      let pending=Buffer.alloc(0),sessionKey,localNonce,remoteNonce;
      const key=()=>sessionKey||this.key;
      const reply=(command,sequence,payload)=>{
        if(!Buffer.isBuffer(payload))payload=Buffer.from(JSON.stringify(payload));
        if(command===8&&this.version!=='3.1')payload=Buffer.concat([Buffer.from(this.version),Buffer.alloc(12),payload]);
        let frame;
        if(this.version==='3.5'){
          payload=Buffer.concat([Buffer.alloc(4),payload]);
          const header=Buffer.alloc(18);header.writeUInt32BE(0x6699);header.writeUInt32BE(sequence,6);header.writeUInt32BE(command,10);header.writeUInt32BE(payload.length+28,14);
          const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-128-gcm',key(),iv);cipher.setAAD(header.subarray(4));
          frame=Buffer.concat([header,iv,cipher.update(payload),cipher.final(),cipher.getAuthTag(),Buffer.from('00009966','hex')]);
        }else{
          const ciphertext=this.version==='3.1'?payload:ecb(payload,key());payload=Buffer.concat([Buffer.alloc(4),ciphertext]);
          const header=Buffer.alloc(16),tail=this.version==='3.4'?36:8;header.writeUInt32BE(0x55aa);header.writeUInt32BE(sequence,4);header.writeUInt32BE(command,8);header.writeUInt32BE(payload.length+tail,12);
          const bytes=Buffer.concat([header,payload]);let check;
          if(this.version==='3.4')check=hmac(bytes,key());else{check=Buffer.alloc(4);check.writeUInt32BE(crc32(bytes));}
          frame=Buffer.concat([bytes,check,Buffer.from('0000aa55','hex')]);
        }
        socket.write(frame);
      };
      socket.on('data',chunk=>{
        pending=Buffer.concat([pending,chunk]);
        try{
          while(pending.length>=18){
            const modern=this.version==='3.5',length=modern?22+pending.readUInt32BE(14):16+pending.readUInt32BE(12);
            if(length>65536)throw new Error('Oversize packet');if(pending.length<length)return;
            const frame=pending.subarray(0,length);pending=pending.subarray(length);
            const command=frame.readUInt32BE(modern?10:8),sequence=frame.readUInt32BE(modern?6:4);
            let payload;
            if(modern){const nonce=key().toString('hex')+':'+frame.subarray(18,30).toString('hex');if(this.nonces.has(nonce))this.reusedNonces++;this.nonces.add(nonce);const decipher=crypto.createDecipheriv('aes-128-gcm',key(),frame.subarray(18,30));decipher.setAAD(frame.subarray(4,18));decipher.setAuthTag(frame.subarray(-20,-4));payload=Buffer.concat([decipher.update(frame.subarray(30,-20)),decipher.final()]);}
            else{
              const tail=this.version==='3.4'?36:8;
              if(tail===36){if(!hmac(frame.subarray(0,-36),key()).equals(frame.subarray(-36,-4)))throw new Error('Bad HMAC');}
              else if(crc32(frame.subarray(0,-8))!==frame.readUInt32BE(frame.length-8))throw new Error('Bad CRC');
              let encrypted=frame.subarray(16,-tail);if(this.version==='3.3'&&encrypted.subarray(0,3).toString()==='3.3')encrypted=encrypted.subarray(15);
              if(this.version==='3.1'){
                if(encrypted.subarray(0,3).toString()==='3.1'){
                  const base64=encrypted.subarray(19).toString();const signature=crypto.createHash('md5').update(`data=${base64}||lpv=3.1||${key().toString()}`).digest('hex').slice(8,24);
                  if(signature!==encrypted.subarray(3,19).toString())throw new Error('Bad signature');payload=ecb(Buffer.from(base64,'base64'),key(),true);
                }else payload=encrypted;
              }else payload=ecb(encrypted,key(),true);
            }
            if(payload.subarray(0,3).toString()===this.version)payload=payload.subarray(15);
            if(command===3){localNonce=payload;remoteNonce=crypto.randomBytes(16);reply(4,sequence+1,Buffer.concat([remoteNonce,hmac(localNonce,this.key)]));continue;}
            if(command===5){
              if(!hmac(remoteNonce,this.key).equals(payload))throw new Error('Bad session proof');
              const mixed=Buffer.from(localNonce.map((byte,index)=>byte^remoteNonce[index]));
              if(modern){const cipher=crypto.createCipheriv('aes-128-gcm',this.key,localNonce.subarray(0,12));sessionKey=Buffer.concat([cipher.update(mixed),cipher.final()]);}
              else sessionKey=ecb(mixed,this.key,false,false);
              this.sessions++;continue;
            }
            if(this.silent)continue;
            if(command===9){reply(9,sequence,Buffer.alloc(0));continue;}
            if(command===7||command===13){
              let data=JSON.parse(payload.toString());const values=(data.data||data).dps;
              this.writes.push(values);if(!this.rejectWrites)Object.assign(this.dps,values);
              if(this.silentAfterWrite)continue;
              reply(8,sequence,{dps:this.dps});
            }else if(command===10||command===16)reply(command,sequence,{dps:this.dps});
            else throw new Error('Unexpected request');
          }
        }catch{socket.destroy();}
      });
    });
    await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));this.port=this.server.address().port;return this;
  }
  async close(){for(const socket of this.sockets)socket.destroy();await new Promise(resolve=>this.server.close(resolve));}
}
module.exports={TuyaDeviceFixture};
