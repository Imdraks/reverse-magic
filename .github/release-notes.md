Cette mise à jour conserve le **dernier profil confirmé** et évite de changer la lumière à l’ouverture ou à l’arrêt du pont.

- **Arrêt passif** : quitter Lantern ou arrêter Maison ne commande ni extinction ni réinitialisation. Le premier contact Magic Lantern n’envoie plus de valeur par défaut et ne rejoue plus un ancien profil automatiquement.
- **Mémoire locale par éclairage** : couleur/blanc, luminosité et état allumé/éteint pour LSC/Tuya et Shelly ; couleur ou animation, luminosité et vitesse dans le module manuel Magic Lantern.
- **Écritures durables** : fichiers remplacés atomiquement et synchronisés sur disque ; une écriture déjà confirmée est mémorisée même si l’arrêt commence avant la fin de sa sauvegarde.
- **Une reconnexion ne remplace pas le profil** par les réglages de démarrage du firmware. Une IP ou clé renouvelée ne supprime pas un profil dont les fonctions restent compatibles.
- **Rétablir le profil** : rappel explicite depuis l’interface, Maison désactivé. Le verrou Maison est conservé. Le mode blanc/couleur LSC est respecté ; une scène propriétaire non restituable est signalée.
- Les profils du pont graphique sont inclus dans ses sauvegardes chiffrées. Les profils et fichiers existants illisibles sont conservés, avec un avertissement.

**Limite matérielle** : la mémoire de Lantern ne modifie pas le firmware des ampoules. Sans alimentation, leur conservation autonome de la couleur et leur éventuelle réinitialisation après des coupures rapides dépendent du modèle. Aucun DP de mémoire/reset n’est supposé, aucune séquence de coupures n’est réalisée. Si une réinitialisation efface le Wi-Fi ou la clé locale, rétablir la connexion avant de rappeler le profil. Un pont éteint ne peut pas restaurer une ampoule à distance.

Tests avec véritables échanges HomeKit et un émulateur Tuya chiffré 3.5 : arrêt de tous les processus, changement du profil du firmware simulé, reprise sans commande automatique, puis restauration de couleur/blanc. Les appareils physiques et la référence Action 3208075 restent à vérifier sur matériel. Guide : `docs/DESKTOP.md`.

Téléchargements : `LanternDirect-Setup.exe` pour Windows ; ZIP portable complet ; paquets Linux x64 et Raspberry Pi ARM64. Arrêter les ponts et quitter Lantern avant de mettre à jour. Données et appairages existants conservés.
