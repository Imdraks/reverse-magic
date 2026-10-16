# Préparer une conversion LSC avec Windows et Android

Lantern sait contrôler un éclairage **déjà converti et configuré sous OpenBeken**. Ce guide ne réalise pas le flash et ne certifie pas votre exemplaire. Android non rooté peut servir de navigateur pour OpenBeken après conversion ; il ne remplace pas l’environnement Linux nécessaire à Cloudcutter.

## 1. Conserver l’installation

Désactiver Maison, créer une sauvegarde Lantern chiffrée et conserver sa phrase de passe séparément. Noter référence et version de l’ampoule, sans publier les clés. Ne pas lancer de mise à jour LSC pour préparer cette conversion. Le remplacement du firmware peut effacer l’association et les réglages ; revenir au logiciel constructeur n’est pas garanti sans une sauvegarde adéquate. Cloudcutter n’est pas un outil universel d’extraction complète.

## 2. Préparer le PC Windows

Créer une clé USB de démarrage à partir de l’image officielle [Ubuntu Desktop](https://ubuntu.com/download/desktop), en vérifiant [son intégrité](https://ubuntu.com/tutorials/how-to-verify-ubuntu). La création efface la clé sélectionnée : vérifier le disque cible. Démarrer le PC sur cette clé et choisir **Essayer Ubuntu**, sans installer Linux sur le disque Windows. Une session live perd normalement ses modifications au redémarrage : préparer un emplacement de sauvegarde persistant.

Cloudcutter requiert un adaptateur Wi-Fi dédié avec mode point d’accès, Docker et `iw`, ainsi que des droits élevés pour son exécution. Le projet consulté déplace entièrement cet adaptateur dans le conteneur pendant l’opération. Préférer Ethernet ou un second adaptateur pour Internet. Un Wi-Fi fonctionnel sous Windows ne prouve pas sa compatibilité sous Linux. WSL, Docker Desktop et Termux sur Android non rooté ne sont pas des substituts garantis au contrôle radio requis.

L’assistant Lantern permet de télécharger `verifier-conversion.py`. Copier ce fichier sur un support conservé pendant le démarrage Linux et exécuter :

```sh
python3 verifier-conversion.py
```

Ce script vérifie uniquement les outils et la présence annoncée du mode AP. Il n’installe rien, n’utilise pas sudo, ne modifie pas le Wi-Fi et ne contacte pas l’ampoule. Un diagnostic positif **n’autorise pas le flash et ne valide pas le profil**.

## 3. Identifier la variante avant toute écriture

Dans **Le pont → Préparer une conversion**, saisir la référence et la version affichée dans LSC. Renseigner le module seulement s’il est déjà connu par une source fiable ; laisser vide sinon, sans ouvrir l’ampoule. L’assistant compare ces déclarations à son catalogue local, sans connexion Internet nécessaire. Il distingue les écarts, les informations manquantes et les profils candidats. Une correspondance complète reste une déclaration, pas une identification physique.

Le bouton **Télécharger le rapport de compatibilité** exporte ces informations, les liens vers les sources et les points à confirmer en JSON. Le rapport n’inclut ni clé locale ni mot de passe. `detectedChip` reste `null`, `attempts` reste vide et `canFlash` reste faux : aucun exploit n’est exécuté. Un exploit qui échoue ne permet pas d’identifier une puce. Le catalogue embarqué couvre actuellement une seule variante documentée de la référence 970709 / 3001686 ; il ne recherche pas automatiquement tous les profils disponibles sur Internet.

Pour **970709 / 3001686**, le [catalogue Cloudcutter](https://github.com/tuya-cloudcutter/tuya-cloudcutter.github.io/blob/master/devices/lsc-3001686-970709-warm-white-smart-filament-e27-806lumen.json) décrit un module WBLC5, une puce BK7231T et un profil **2.9.6**. Un [témoignage](https://github.com/tuya-cloudcutter/tuya-cloudcutter/issues/213) mentionne aussi 1.1.6, sans constituer une validation de votre appareil. Ni le nom A60 Gold, ni la référence, ni l’OUI MAC ne suffisent à établir la variante exacte. `Jsonver` est une version de configuration, pas une preuve de version du firmware.

**Le flash reste bloqué dans Lantern**, y compris pour 1.1.6 : aucun profil ni brochage n’est sélectionné automatiquement. Il faut confirmer puce, révision, pilote LED et profil vulnérable avec des éléments matériels/protocolaires fiables avant de choisir un fichier. Ne pas essayer le profil 2.9.6 sur la seule base de la référence. Une intervention sur le secteur ou un démontage n’est pas proposé par ce parcours.

Le code Cloudcutter examiné est [b5712802c4cc0668a8db8434b7fef94bda8d40e5](https://github.com/tuya-cloudcutter/tuya-cloudcutter/tree/b5712802c4cc0668a8db8434b7fef94bda8d40e5). Lire ses [instructions](https://github.com/tuya-cloudcutter/tuya-cloudcutter/blob/b5712802c4cc0668a8db8434b7fef94bda8d40e5/INSTRUCTIONS.md) et les contraintes de la version réellement utilisée. La préparation n’exécute aucun exploit, ne désassocie pas l’ampoule et ne lance aucun cycle marche/arrêt. Ces étapes doivent être examinées puis déclenchées explicitement une fois le profil confirmé.

Choisir ensuite un fichier uniquement depuis les [versions officielles OpenBeken](https://github.com/openshwprojects/OpenBK7231T_App/releases), pour la puce et le mode d’installation confirmés. Les formats série, OTA et image complète ne sont pas interchangeables. Vérifier l’intégrité selon les informations publiées en amont. Aucun binaire arbitraire ou fichier générique BK7231 n’est distribué comme compatible par Lantern.

## 4. Après une conversion réussie

Depuis Android, rejoindre le point d’accès indiqué par le firmware et ouvrir l’adresse donnée dans sa documentation. Configurer le Wi-Fi domestique, un mot de passe web et **le pilote LED/brochage vérifié pour cet exemplaire**. Aucun root Android n’est nécessaire pour utiliser ce navigateur. Ne pas recopier le brochage d’une autre révision. Une connexion HTTP locale et son authentification Basic ne chiffrent pas le réseau : réserver cet accès au réseau domestique, sans redirection de port Internet.

Dans OpenBeken, le **flag 12** correspond à la mémorisation de l’état LED après redémarrage dans la version de référence examinée. Vérifier ce réglage sur le firmware installé, puis tester une coupure simple une fois la configuration sauvegardée. Le **flag 23** rallume la lumière sur toute modification de luminosité ou blanc : Lantern refuse ces modifications quand elles devraient conserver un état éteint et que ce flag est actif. Ces réglages ne sont pas changés automatiquement. La mémoire du firmware et la mémoire du pont sont distinctes ; aucune garantie matérielle n’est revendiquée avant cet essai.

## 5. Revenir dans Lantern et Maison

Redémarrer Windows. Dans Lantern, Maison désactivé, choisir **OpenBeken — éclairage local**, saisir l’IP locale et, si configuré, le mot de passe web du compte `admin`. Choisir **Blanc variable** ou **Blanc réglable**, selon les fonctions réellement configurées. L’API JSON compatible Tasmota doit être activée dans OpenBeken. Lantern vérifie `Status 2` (`SDK: obk`), puis lit `Status 11`. Le test ne modifie pas la lumière.

Les profils initiaux prennent en charge marche/arrêt, luminosité et, pour le profil CCT, blanc logique 153–500 mireds. Cela ne certifie pas la plage physique de l’ampoule. RGB, effets et autres familles de produits ne sont pas couverts par cet adaptateur.

Si l’ampoule existe déjà dans le pont LSC, utiliser **Reprendre après conversion** sur sa carte. Le test OpenBeken doit réussir avant enregistrement. Son identifiant Lantern et sa pièce sont conservés, les clés Tuya inutilisées sont retirées du projet courant ; les sauvegardes déjà créées restent intactes. Les caractéristiques disponibles peuvent changer : vérifier les automatismes Maison ensuite. Si c’est un nouvel appareil, l’ajouter normalement. Réactiver Maison avec le pont existant, sans supprimer son appairage.

L’ampoule utilise désormais son firmware libre. Le PC Windows doit rester allumé pour le pont Maison ; Android peut ouvrir séparément l’interface web locale d’OpenBeken. L’intégration ne transforme pas le firmware en accessoire HomeKit natif.
