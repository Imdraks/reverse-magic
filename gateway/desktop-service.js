'use strict';
// Optional headless runner for the installation created by the desktop assistant.
const {DesktopManager}=require('./desktop-manager');
async function main(){
  if(process.argv.length!==3)throw Error('directory');
  const manager=await new DesktopManager(process.argv[2]).init();
  let closing=false;
  const stop=async()=>{if(closing)return;closing=true;await manager.close();};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  await manager.command('start');
  console.log('Pont d’éclairage prêt. Les commandes directes et modifications sont verrouillées.');
}
main().catch(()=>{console.error('Pont indisponible. Vérifiez la configuration, les identifiants, le stockage et le port.');process.exitCode=1;});
