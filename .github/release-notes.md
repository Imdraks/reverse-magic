Cette version ajoute un **pont Maison pour Linux et Raspberry Pi**, utilisable entièrement depuis le terminal ou SSH, avec démarrage automatique au boot.

- **Raspberry Pi OS 64 bits** (Pi 3/4/5 et Zero 2 W) : télécharger `LanternDirect-Linux-arm64.tar.gz`.
- **PC Linux x64** (Debian 12/13, Ubuntu 24.04+) : télécharger `LanternDirect-Linux-x64.tar.gz`.
- Extraire l’archive, installer Python 3.11+/venv et BlueZ, puis lancer `./install.sh`, `./lantern scan` et `./lantern bridge --device ADRESSE_DES_LED`.
- Le terminal affiche le QR et le code Maison. `./lantern service --device ADRESSE_DES_LED --install` active le service systemd sous votre compte, sans session SSH ouverte. Les codes d’appairage restent hors des journaux ; les revoir avec `./lantern pairing --device ADRESSE_DES_LED`.
- Commandes directes : on/off, couleur, luminosité, effets et micro du contrôleur. La correction rouge/vert GRB est conservée.

Le runtime Node.js officiel et les dépendances HomeKit sont fournis ; Internet est nécessaire pour installer les dépendances Python la première fois. Le fonctionnement est ensuite local. Un OS **64 bits** est nécessaire pour les archives fournies ; le Pi Zero de première génération n’est pas pris en charge.

**Le Pi doit rester alimenté, sur le même réseau local que l’iPhone et à portée Bluetooth.** Maison expose allumage, couleur et luminosité sans nécessiter l’app iOS Lantern Direct. Les effets et la musique restent dans le client terminal. La première synchronisation éteint les LED ; les suivantes restaurent la dernière consigne. Arrêter le pont avant le contrôle Bluetooth direct.

Guide : [Linux / Raspberry Pi](https://github.com/Imdraks/reverse-magic/blob/main/linux/README.md). La release contient aussi les clients Windows, le ZIP Windows HomeKit complet et l’IPA iOS 1.0.1 inchangé, non signé et nécessitant une signature locale. Sources et SHA-256 inclus.

Validation : tests Linux des trames, écritures sérialisées, annulation, reconnexion, service et processus HomeKit réel avec un client chiffré indépendant ; tests HomeKit existants et 38 vérifications Windows. Les paquets sont installés et vérifiés sur les runners Linux natifs x64 et ARM64. Le transport BLE des tests est simulé ; l’essai final avec le Raspberry Pi, vos LED et Maison reste nécessaire. Accessoire HomeKit non certifié.
