Première version de test de Lantern Direct pour les contrôleurs LED Bluetooth utilisant le protocole Magic Lantern 6.11.10.

- **iOS :** `LanternDirect-unsigned.ipa`, pour iOS 17 ou plus récent. IPA non signé : signer et installer depuis Windows avec un outil adapté, par exemple Sideloadly. Voir `INSTALLER-SUR-IPHONE.txt`.
- **Windows :** `LanternDirect.exe`, application autonome x64 pour Windows 10 version 2004 ou ultérieure et Windows 11, avec Bluetooth LE. Aucun runtime .NET séparé nécessaire. Exécutable non signé.
- Sources iOS et Windows incluses en archives ; empreintes dans `SHA256SUMS.txt`.

Contrôle direct : marche/arrêt, couleur, luminosité, catalogue de 241 effets/scènes RGBIC et commandes musicales du contrôleur, si équipé. La version iOS propose également le microphone de l’iPhone ; Windows utilise uniquement celui du contrôleur.

**Validation :** build iPhone et tests Xcode sur simulateur réussis sur GitHub Actions ; 25 tests portables Swift et 23 vérifications du protocole Windows réussis. Le build Windows a réussi en compilation croisée. Le Bluetooth réel, le microphone sur iPhone et l’interface Windows restent à tester sur les appareils physiques.

Ces applications BLE n’ajoutent pas de compatibilité Maison/HomeKit/Matter et ne fournissent pas encore de passerelle HomeKit.

Build iOS : https://github.com/Imdraks/reverse-magic/actions/runs/38413790988 (commit c8878d26863baef268eb92f0aa7ee8504341f853).
