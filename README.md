# Lantern Direct

Applications iOS et Windows de contrôle Bluetooth direct pour les LED utilisant le protocole Magic Lantern 6.11.10.

[**Télécharger la release v0.1.0 (version de test)**](https://github.com/Imdraks/reverse-magic/releases/tag/v0.1.0)

- [iOS — LanternDirect-unsigned.ipa](https://github.com/Imdraks/reverse-magic/releases/download/v0.1.0/LanternDirect-unsigned.ipa) : iOS 17 ou ultérieur ; signature nécessaire avant installation. Voir [le guide depuis Windows](INSTALLER-SUR-IPHONE.txt).
- [Windows — LanternDirect.exe](https://github.com/Imdraks/reverse-magic/releases/download/v0.1.0/LanternDirect.exe) : Windows x64 avec Bluetooth LE ; exécutable autonome.

La release inclut également les sources et les empreintes SHA-256. Voir [les instructions iOS](ios/README.md), [les instructions Windows](windows/README.md) et [le protocole](ios/PROTOCOL.md).

Build iPhone et tests simulateur réussis ; compilation Windows et tests du protocole réussis. Le contrôle des LED réelles et l’interface Windows restent à essayer sur les appareils physiques. Ces apps BLE n’ajoutent pas de compatibilité Maison/HomeKit/Matter et ne fournissent pas encore de passerelle HomeKit.
