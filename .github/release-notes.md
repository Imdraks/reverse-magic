Patch v0.1.1 : correction de l’inversion rouge/vert constatée sur le contrôleur de l’utilisateur.

- Les couleurs choisies sont envoyées en **GRB** dans les clients iOS et Windows. Le bleu reste inchangé.
- Même correction pour les couleurs du mode musical utilisant le microphone de l’iPhone.
- Ajout de vérifications sur rouge, vert, bleu, blanc, noir et les trames musicales : 28 tests Swift et 28 vérifications Windows.
- Version applicative 1.0.1 ; build iOS 2. Aucun changement de la configuration persistante du contrôleur. Les effets produits par le firmware ne sont pas remappés par ce patch.

Télécharger `LanternDirect-unsigned.ipa` pour iOS 17 ou ultérieur, ou `LanternDirect.exe` pour Windows x64. L’IPA doit être signé avant installation ; voir `INSTALLER-SUR-IPHONE.txt`. Les sources et empreintes SHA-256 sont incluses.

Les essais de rendu lumineux doivent être confirmés sur les LED réelles. Les applications ne fournissent pas encore de passerelle Maison/HomeKit.
