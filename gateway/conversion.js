'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
async function conversionPlan({reference='970709',firmware='1.1.6'}={}){
  if(typeof reference!=='string'||!/^\d{6,8}$/.test(reference)||typeof firmware!=='string'||!/^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(firmware))throw Error('Référence numérique et version de firmware attendues.');
  const known=reference==='970709'||reference==='3001686';
  const guide=await fs.readFile(path.join(__dirname,'../docs/CONVERSION-LSC.md'),'utf8');
  const preflight=await fs.readFile(path.join(__dirname,'conversion-preflight.py'),'utf8');
  return {
    reference,firmware,host:process.platform,canFlash:false,
    status:known?'variant-unverified':'unknown-model',
    title:known?'LSC 3001686 / 970709 · variante à confirmer':'Modèle non identifié',
    message:known?'Le catalogue décrit une variante WBLC5 / BK7231T en 2.9.6. La puce, le pilote LED et le profil de votre exemplaire doivent être confirmés ; le numéro 1.1.6 ne suffit pas.':'Aucun profil matériel validé dans Lantern pour cette référence.',
    steps:[
      'Windows : désactiver Maison et sauvegarder l’installation avant la conversion.',
      'Préparer une clé USB Linux, puis utiliser le mode Essayer, sans installer Linux sur le disque Windows.',
      'Sous Linux : vérifier Docker, iw et un adaptateur Wi-Fi dédié capable de fonctionner en point d’accès. Préférer Ethernet pour Internet.',
      'Confirmer la variante et le profil Cloudcutter exact avant toute réinitialisation ou écriture. Étape actuellement non validée pour cet exemplaire.',
      'Après une conversion réussie : configurer le Wi-Fi, le pilote LED et la mémoire depuis OpenBeken avec le navigateur Android, sans root.',
      'Revenir sous Windows : tester OpenBeken dans Lantern, reprendre l’éclairage existant ou l’ajouter, puis réactiver Maison.',
    ],
    guide:'# Dossier Lantern — '+reference+' / firmware '+firmware+'\n\nStatut : préparation uniquement, conversion non autorisée automatiquement.\n\n'+guide,
    preflight,preflightSHA256:crypto.createHash('sha256').update(preflight).digest('hex'),
  };
}
module.exports={conversionPlan};
