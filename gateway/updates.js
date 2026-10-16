'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const REPOSITORY='https://github.com/Imdraks/reverse-magic';
const API='https://api.github.com/repos/Imdraks/reverse-magic/releases?per_page=20';
const CURRENT='0.11.0';
const versions=value=>/^v?\d+\.\d+\.\d+$/.test(value)?value.replace(/^v/,'').split('.').map(Number):null;
function newer(a,b){for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function assetName(platform,arch){if(platform==='win32'&&arch==='x64')return 'LanternDirect-Setup.exe';if(platform==='linux'&&['x64','arm64'].includes(arch))return `LanternDirect-Linux-${arch}.tar.gz`;throw Error('Plateforme non prise en charge.');}
async function bounded(url,limit,{fetcher=fetch,signal}={}){
  const response=await fetcher(url,{redirect:'error',signal:signal||AbortSignal.timeout(10000),headers:{'User-Agent':'LanternDirect/'+CURRENT,'Accept':'application/vnd.github+json'}});
  if(!response.ok)throw Error('Téléchargement indisponible.');let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Réponse trop volumineuse.');chunks.push(chunk);}return Buffer.concat(chunks);
}
class Updates{
  constructor(directory,{fetcher=fetch,platform=process.platform,arch=process.arch}={}){this.directory=path.join(directory,'updates');this.fetcher=fetcher;this.platform=platform;this.arch=arch;}
  async check({includePrerelease=false}={}){
    const releases=JSON.parse(await bounded(API,2*1024*1024,{fetcher:this.fetcher}));if(!Array.isArray(releases))throw Error('Catalogue invalide.');
    const release=releases.filter(item=>!item.draft&&(includePrerelease||!item.prerelease)&&/^v\d+\.\d+\.\d+$/.test(item.tag_name)).sort((a,b)=>{const av=versions(a.tag_name),bv=versions(b.tag_name);return newer(av,bv)?-1:newer(bv,av)?1:0;})[0];
    if(!release)return {current:CURRENT,latest:CURRENT,available:false,includePrerelease};
    return {current:CURRENT,latest:release.tag_name.slice(1),available:newer(versions(release.tag_name),versions(CURRENT)),tag:release.tag_name,includePrerelease};
  }
  async stage({includePrerelease=false}={}){
    const bytes=await bounded(API,2*1024*1024,{fetcher:this.fetcher}),releases=JSON.parse(bytes);
    if(!Array.isArray(releases))throw Error('Catalogue invalide.');
    const release=releases.filter(item=>!item.draft&&(includePrerelease||!item.prerelease)&&/^v\d+\.\d+\.\d+$/.test(item.tag_name)).sort((a,b)=>newer(versions(a.tag_name),versions(b.tag_name))?-1:newer(versions(b.tag_name),versions(a.tag_name))?1:0)[0];
    if(!release||!newer(versions(release.tag_name),versions(CURRENT)))throw Error('Aucune mise à jour plus récente sur ce canal.');
    const name=assetName(this.platform,this.arch),asset=release.assets?.find(row=>row.name===name),manifest=release.assets?.find(row=>row.name==='SHA256SUMS.txt');
    const prefix=REPOSITORY+'/releases/download/'+release.tag_name+'/';
    if(!asset||!manifest||asset.browser_download_url!==prefix+name||manifest.browser_download_url!==prefix+'SHA256SUMS.txt'||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>512*1024*1024)throw Error('Fichiers de publication invalides.');
    const signal=AbortSignal.timeout(120000);
    const download=async url=>{
      for(let redirects=0;redirects<4;redirects++){
        const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!['github.com','release-assets.githubusercontent.com'].includes(parsed.hostname))throw Error('Destination de téléchargement refusée.');
        const response=await this.fetcher(url,{redirect:'manual',signal,headers:{'User-Agent':'LanternDirect/'+CURRENT}});
        if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=new URL(response.headers.get('location'),url).href;continue;}
        if(!response.ok)throw Error('Téléchargement indisponible.');return response;
      }throw Error('Trop de redirections.');
    };
    const sumsResponse=await download(manifest.browser_download_url);let sums='',sumSize=0;
    for await(const chunk of sumsResponse.body){sumSize+=chunk.length;if(sumSize>65536)throw Error('Manifeste trop volumineux.');sums+=Buffer.from(chunk).toString('utf8');}
    const matches=sums.split(/\r?\n/).map(line=>/^([a-fA-F0-9]{64}) [ *](\S+)$/.exec(line)).filter(row=>row&&row[2]===name);
    if(matches.length!==1)throw Error('Empreinte absente ou ambiguë.');const expected=matches[0][1].toLowerCase();
    if(asset.digest&&asset.digest!=='sha256:'+expected)throw Error('Empreintes GitHub et manifeste différentes.');
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});const temporary=path.join(this.directory,crypto.randomBytes(12).toString('hex')+'.part'),destination=path.join(this.directory,release.tag_name+'-'+name);let file;
    try{
      file=await fs.open(temporary,'wx',0o600);const response=await download(asset.browser_download_url),hash=crypto.createHash('sha256');let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>asset.size)throw Error('Taille incorrecte.');hash.update(chunk);await file.writeFile(chunk);}
      if(size!==asset.size||hash.digest('hex')!==expected)throw Error('Intégrité du téléchargement non confirmée.');await file.sync();await file.close();file=null;await fs.rename(temporary,destination);
      return {version:release.tag_name.slice(1),filename:path.basename(destination),path:destination,sha256:expected,size,verified:true,installed:false,rollback:'Conservez le paquet précédent et votre sauvegarde chiffrée avant installation.'};
    }finally{if(file)await file.close();await fs.rm(temporary,{force:true});}
  }
}
module.exports={Updates,assetName};
