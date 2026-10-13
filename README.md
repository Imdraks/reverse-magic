# Lantern Direct

Contrôle Bluetooth des LED Magic Lantern sur iOS et Windows, avec un **pont Windows pour l’application Maison de l’iPhone**.

[**Télécharger la release v0.2.0 (version de test)**](https://github.com/Imdraks/reverse-magic/releases/tag/v0.2.0)

- **Maison sur iPhone** : [LanternDirect-Windows-HomeKit.zip](https://github.com/Imdraks/reverse-magic/releases/download/v0.2.0/LanternDirect-Windows-HomeKit.zip). Extraire tout le ZIP, connecter les LED, activer Maison et scanner le QR code. Voir [le guide](MAISON-WINDOWS.txt). Le PC fait le pont entre Bluetooth et HomeKit et doit rester allumé. Aucune app iOS supplémentaire nécessaire.
- **Windows, contrôle manuel** : [LanternDirect.exe](https://github.com/Imdraks/reverse-magic/releases/download/v0.2.0/LanternDirect.exe), Windows x64 avec Bluetooth LE. L’exécutable seul nécessite le ZIP complet pour activer Maison.
- **iOS, Bluetooth direct** : [LanternDirect-unsigned.ipa](https://github.com/Imdraks/reverse-magic/releases/download/v0.2.0/LanternDirect-unsigned.ipa), iOS 17 ou ultérieur. Signature nécessaire ; voir [l’installation depuis Windows](INSTALLER-SUR-IPHONE.txt). IPA 1.0.1 inchangé depuis v0.1.1.

Le pont expose allumage, couleur et luminosité. Les effets RGBIC et la musique restent dans les clients directs. Les couleurs sont envoyées en GRB pour corriger l’inversion rouge/vert du contrôleur. Les réglages Maison sont conservés localement et restaurés après reconnexion ; le protocole actuel ne fournit pas de lecture de l’état réel.

Validation : 38 vérifications Windows, tests d’appairage HomeKit chiffré et de coupure/reconnexion, compilation Windows x64. Le build iOS et ses 28 tests ont été validés pour v0.1.1. L’essai du pont sur vos appareils physiques reste nécessaire : le cloud Linux ne peut pas exécuter la radio Bluetooth Windows ni Maison.

La release contient les sources et les SHA-256. Voir [Windows](windows/README.md), [HomeKit](homekit/README.md), [iOS](ios/README.md) et [le protocole Bluetooth](ios/PROTOCOL.md).
