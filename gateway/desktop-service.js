'use strict';
// Optional headless runner for the installation created by the desktop assistant.
const {DesktopManager}=require('./desktop-manager');
async function main(){
  if(process.argv.length!==3)throw Error('directory');
  const manager=await new DesktopManager(process.argv[2]).init();
  // A dead runtime must terminate the supervisor so systemd can restart it.
  // Keeping a live manager with no HomeKit process would look healthy to systemd.
  const watchdog=setInterval(()=>{if(!closing&&!manager.running){clearInterval(watchdog);void stop().finally(()=>{process.exitCode=1;});}},10000);
  let closing=false;
  const stop=async()=>{if(closing)return;closing=true;clearInterval(watchdog);await manager.close();};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  try{await manager.command('start');}catch(error){await stop();throw error;}
  console.log('Pont d’éclairage prêt. Les commandes directes et modifications sont verrouillées.');
}
main().catch(()=>{console.error('Pont indisponible. Vérifiez la configuration, les identifiants, le stockage et le port.');process.exitCode=1;});
