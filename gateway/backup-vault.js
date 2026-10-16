'use strict';
// Only a public encryption key stays on the bridge. Recovery requires the
// separately downloaded, password-encrypted private key.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const keyPair=promisify(crypto.generateKeyPair),scrypt=promisify(crypto.scrypt);
const LIMIT=2*1024*1024;
async function write(file,data){const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);if(process.platform!=='win32'){const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}}}finally{await fs.rm(temp,{force:true});}}
function password(value){if(typeof value!=='string'||value.length<12||value.length>256)throw Error('Phrase de passe : 12 à 256 caractères.');}
function encrypt(bytes,key){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(bytes),cipher.final()]).toString('base64');return {iv:iv.toString('base64'),data,tag:cipher.getAuthTag().toString('base64')};}
function decrypt(blob,key){const iv=Buffer.from(blob.iv,'base64'),tag=Buffer.from(blob.tag,'base64');if(iv.length!==12||tag.length!==16||typeof blob.data!=='string'||blob.data.length>LIMIT)throw Error('Invalid envelope');const cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(Buffer.from(blob.data,'base64')),cipher.final()]);}
class BackupVault{
  constructor(directory){this.directory=path.join(directory,'backups');this.keyFile=path.join(this.directory,'public-key.json');}
  async configuration(){try{const bytes=await fs.readFile(this.keyFile);if(bytes.length>8192)throw Error();const config=JSON.parse(bytes);const key=crypto.createPublicKey(config.publicKey);if(config.version!==1||key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<3072)throw Error();return config;}catch(error){if(error.code==='ENOENT')return null;throw Error('Configuration des sauvegardes illisible.');}}
  async prepare(secret){password(secret);const {publicKey,privateKey}=await keyPair('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
    const salt=crypto.randomBytes(16),key=await scrypt(secret,salt,32);
    try{return {configuration:{version:1,publicKey},recovery:JSON.stringify({format:'lantern-recovery-1',salt:salt.toString('base64'),...encrypt(Buffer.from(privateKey),key)})};}finally{key.fill(0);}
  }
  async enable(configuration){await fs.mkdir(this.directory,{recursive:true,mode:0o700});await write(this.keyFile,JSON.stringify(configuration));}
  async snapshot(){const config=await this.configuration();if(!config)return {enabled:false,count:0};const names=(await fs.readdir(this.directory)).filter(name=>/^auto-[0-9]+-[a-f0-9]+\.lantern$/.test(name)).sort();return {enabled:true,count:names.length,latest:names.at(-1)||null,retention:7};}
  async create(payload){const config=await this.configuration();if(!config)return null;
    const key=crypto.randomBytes(32);
    try{const blob=JSON.stringify({format:'lantern-auto-backup-1',wrappedKey:crypto.publicEncrypt({key:config.publicKey,oaepHash:'sha256'},key).toString('base64'),...encrypt(Buffer.from(JSON.stringify(payload)),key)});if(blob.length>LIMIT)throw Error('Sauvegarde trop volumineuse.');
      const filename='auto-'+Date.now()+'-'+crypto.randomBytes(6).toString('hex')+'.lantern';await write(path.join(this.directory,filename),blob);
      const names=(await fs.readdir(this.directory)).filter(name=>/^auto-[0-9]+-[a-f0-9]+\.lantern$/.test(name)).sort();for(const name of names.slice(0,-7))await fs.rm(path.join(this.directory,name));return filename;
    }finally{key.fill(0);}
  }
  async recover(backup,recovery,secret){password(secret);if(typeof backup!=='string'||typeof recovery!=='string'||backup.length>LIMIT||recovery.length>16384)throw Error('Invalid recovery');
    const kit=JSON.parse(recovery),blob=JSON.parse(backup);if(kit.format!=='lantern-recovery-1'||blob.format!=='lantern-auto-backup-1')throw Error('Invalid format');const salt=Buffer.from(kit.salt,'base64');if(salt.length!==16)throw Error('Invalid salt');
    const wrapping=await scrypt(secret,salt,32);let key,privateBytes;
    try{privateBytes=decrypt(kit,wrapping);key=crypto.privateDecrypt({key:privateBytes,oaepHash:'sha256'},Buffer.from(blob.wrappedKey,'base64'));return JSON.parse(decrypt(blob,key).toString());}
    finally{wrapping.fill(0);key?.fill(0);privateBytes?.fill(0);}
  }
}
module.exports={BackupVault,write};
