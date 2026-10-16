'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
// Curated evidence, not a remote executable catalogue. Declared module names are
// clues supplied by the user, never hardware attestation or permission to flash.
const catalogProfile={
  id:'oem-bk7231s-light-ty-2.9.6-sdk-1.0.2-40.00',
  references:['970709','3001686'],firmware:'2.9.6',module:'WBLC5',chip:'BK7231T',
  source:'https://github.com/tuya-cloudcutter/tuya-cloudcutter.github.io/blob/master/devices/lsc-3001686-970709-warm-white-smart-filament-e27-806lumen.json',
};
function assessCompatibility({reference,firmware,module}){
  const candidates=catalogProfile.references.includes(reference)?[{
    ...catalogProfile,
    checks:[
      {name:'Référence commerciale',status:'match',detail:reference},
      {name:'Firmware du catalogue',status:firmware===catalogProfile.firmware?'match':'mismatch',detail:`Déclaré : ${firmware} ; catalogue : ${catalogProfile.firmware}.`},
      {name:'Module déclaré',status:!module?'unknown':module===catalogProfile.module?'match':'mismatch',detail:module||'Non renseigné ; aucune puce détectée.'},
    ],
  }]:[];
  for(const candidate of candidates)candidate.status=candidate.checks.some(check=>check.status==='mismatch')?'mismatch':candidate.checks.some(check=>check.status==='unknown')?'incomplete':'candidate';
  const blockers=[];
  if(!candidates.length)blockers.push('Aucun profil documenté pour cette référence dans le catalogue local.');
  else for(const check of candidates[0].checks)if(check.status!=='match')blockers.push(`${check.name} : ${check.detail}`);
  blockers.push('Puce et pilote LED de cet exemplaire non vérifiés. Une déclaration ou un échec d’exploit ne les identifie pas.');
  blockers.push('Aucune méthode de flash validée sur cet exemplaire ; aucun essai automatique ni firmware sélectionné.');
  return {
    schemaVersion:1,mode:'catalog-comparison',catalogRevision:1,
    inputs:{reference,firmware,module:module||null,origin:'user-declared'},
    detectedChip:null,canFlash:false,attempts:[],candidates,blockers,
    testimony:reference==='970709'||reference==='3001686'?{
      version:'1.1.6',verified:false,
      note:'Un témoignage mentionne 1.1.6 sur cette référence, sans validation reproductible pour cet exemplaire.',
      source:'https://github.com/tuya-cloudcutter/tuya-cloudcutter/issues/213',
    }:null,
  };
}
async function conversionPlan({reference='970709',firmware='1.1.6',module=''}={}){
  if(typeof reference!=='string'||!/^\d{6,8}$/.test(reference)||typeof firmware!=='string'||!/^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(firmware))throw Error('Référence numérique et version de firmware attendues.');
  if(typeof module!=='string'||module.length>32||/[^A-Z0-9_-]/.test(module))throw Error('Nom de module invalide.');
  const assessment=assessCompatibility({reference,firmware,module});
  const known=reference==='970709'||reference==='3001686';
  const guide=await fs.readFile(path.join(__dirname,'../docs/CONVERSION-LSC.md'),'utf8');
  const preflight=await fs.readFile(path.join(__dirname,'conversion-preflight.py'),'utf8');
  return {
    reference,firmware,host:process.platform,canFlash:false,assessment,
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
    guide:'# Dossier Lantern — '+reference+' / firmware '+firmware+'\n\nStatut : préparation uniquement, conversion non autorisée automatiquement.\n\n## Évaluation locale\n\n'+assessment.blockers.map(reason=>'- '+reason).join('\n')+'\n\n'+guide,
    preflight,preflightSHA256:crypto.createHash('sha256').update(preflight).digest('hex'),
  };
}
module.exports={conversionPlan};
