# Lantern Direct — Linux / Raspberry Pi, terminal et Maison

Pont HomeKit sans interface graphique pour les LED Magic Lantern : allumage, luminosité et couleur dans Maison sur iPhone. Le Raspberry Pi remplace le PC Windows et doit rester alimenté, connecté au réseau et à portée Bluetooth. Aucun écran, session graphique ou compte cloud nécessaire.

## Compatibilité

- Raspberry Pi OS **64 bits**, Bookworm ou Trixie : Pi 3, 4, 5 et Zero 2 W, avec Bluetooth LE. Le paquet ARM64 ne fonctionne pas sur un OS 32 bits ou un Pi Zero de première génération.
- Linux **x64**, Debian 12/13 ou Ubuntu 24.04 et ultérieur, avec Bluetooth LE.
- Python **3.11+**, BlueZ **5.55+**, D-Bus système et systemd pour le démarrage automatique.
- Node 24.19.0 officiel et les dépendances HomeKit sont déjà inclus. Python et BlueZ sont installés par votre distribution ; Internet est nécessaire pour la première installation des paquets Python. Le fonctionnement des LED et de Maison est ensuite local.

## Installer depuis le terminal / SSH

Télécharger `LanternDirect-Linux-arm64.tar.gz` pour le Pi ou `LanternDirect-Linux-x64.tar.gz` pour un PC Linux depuis la release. Vérifier les empreintes de `SHA256SUMS.txt`.

```bash
sudo apt update
sudo apt install -y python3 python3-venv bluez
sudo systemctl enable --now bluetooth
sudo usermod -aG bluetooth "$USER"
```

Déconnecter puis reconnecter votre session SSH pour prendre en compte le groupe Bluetooth. Si la radio est bloquée, vérifier `rfkill list` et la débloquer avec `sudo rfkill unblock bluetooth`.

Pour le Pi, dans le dossier du téléchargement :

```bash
tar -xzf LanternDirect-Linux-arm64.tar.gz
cd LanternDirect-Linux-arm64
./install.sh
./lantern scan
```

Pour x64, remplacer `arm64` par `x64`. L'installation crée seulement un environnement Python `.venv` dans le dossier extrait et installe les dépendances déclarées. Exécuter `install.sh` et `lantern` depuis votre compte habituel, sans sudo. Conserver ce dossier dans un emplacement permanent avant d'installer le service.

Arrêter le pont Windows si vous le remplacez par le Pi. Fermer Magic Lantern et les apps Bluetooth directes sur les téléphones pour libérer les LED. Relever leur adresse affichée par le scan, souvent avec un nom `MELK-…` ou `MELK_…`. `./lantern scan --all` affiche tous les appareils ; `--adapter hci1` permet de choisir une autre radio.

## Maison

Remplacer l'adresse d'exemple par celle de vos LED :

```bash
./lantern bridge --device AA:BB:CC:DD:EE:FF
```

Le terminal affiche le QR et le code numérique. Sur l'iPhone : **Maison → + → Ajouter un accessoire**. Scanner le QR dans le terminal, ou saisir le code depuis « Plus d'options ». Accepter l'accessoire non certifié si demandé. La première activation éteint les LED ; les reconnexions restaurent ensuite les dernières consignes Maison.

Pi et iPhone doivent être sur le même réseau local, sans isolation des clients Wi-Fi. Le serveur annonce lui-même son service mDNS ; Avahi n'est pas nécessaire. Si un pare-feu est actif, autoriser TCP **51827** et UDP **5353** sur le réseau local. Aucune redirection de port Internet. Ctrl+C ferme le pont et libère la connexion Bluetooth.

L'app iOS Lantern Direct n'est pas nécessaire pour Maison. Pour le contrôle distant et certaines automatisations, Apple exige un concentrateur compatible, tel que HomePod ou Apple TV. Les effets RGBIC, les segments et la musique ne sont pas exposés dans la lampe HomeKit standard.

## Démarrer automatiquement, même sans session SSH

Depuis votre compte habituel, après avoir vérifié le pont :

```bash
./lantern service --device AA:BB:CC:DD:EE:FF --install
systemctl status lantern-direct
./lantern pairing --device AA:BB:CC:DD:EE:FF
```

La commande demande sudo uniquement pour installer et activer `/etc/systemd/system/lantern-direct.service`. Le pont tourne sous votre utilisateur, avec le groupe Bluetooth ; il démarre au boot et redémarre après une erreur. Le service n'affiche aucun code d'appairage dans les journaux. `pairing` affiche le QR et le code conservés, après le premier démarrage. Une seule instance peut utiliser un contrôleur ; arrêter le pont lancé manuellement avant d'activer le service.

```bash
journalctl -u lantern-direct -f
sudo systemctl stop lantern-direct
sudo systemctl start lantern-direct
sudo systemctl disable --now lantern-direct
```

Pour inspecter le fichier avant installation : `./lantern service --device AA:BB:CC:DD:EE:FF`. Si le dossier du logiciel est déplacé, réinstaller le service depuis le nouveau chemin. Pour le retirer : désactiver le service, supprimer `/etc/systemd/system/lantern-direct.service` avec sudo, puis `sudo systemctl daemon-reload`.

## Contrôle direct au terminal

Arrêter le service Maison avant ces commandes : le contrôleur accepte une liaison BLE à la fois.

```bash
./lantern on --device AA:BB:CC:DD:EE:FF
./lantern color --device AA:BB:CC:DD:EE:FF --rgb FF0000 --brightness 80
./lantern brightness --device AA:BB:CC:DD:EE:FF --value 35
./lantern effect --device AA:BB:CC:DD:EE:FF --id 212 --speed 50
./lantern effect --device AA:BB:CC:DD:EE:FF --id 1 --scene
./lantern mic --device AA:BB:CC:DD:EE:FF --on --effect 0 --sensitivity 50
./lantern mic --device AA:BB:CC:DD:EE:FF --off
./lantern off --device AA:BB:CC:DD:EE:FF
```

Le rouge/vert est corrigé en GRB comme sous Windows/iOS. Les codes d'effets et de scènes et la présence du micro dépendent du contrôleur ; le catalogue d'origine est dans `windows/effects.json` dans les sources. Le terminal ne capte pas le microphone ou le son du Pi.

## Stockage et dépannage

Les identités, clés HomeKit, QR et dernières consignes sont enregistrés dans `~/.local/state/lantern-direct/homekit/<adresse sans deux-points>/`, ou sous `$XDG_STATE_HOME`. `--data-dir /chemin/permanent` permet de changer la racine ; conserver le même chemin pour bridge, pairing et service. Ne pas partager ce dossier ni le supprimer pour une simple mise à jour.

Pour réinitialiser un appairage : retirer d'abord la lampe de Maison, arrêter le pont/service, puis supprimer uniquement le sous-dossier de ce contrôleur avant de relancer et de réappairer. Pour désinstaller le logiciel, désactiver d'abord le service, puis supprimer le dossier extrait ; garder les données si un retour est prévu.

« Aucune réponse » : vérifier radio/range/alimentation, `systemctl status bluetooth`, `bluetoothctl show`, le groupe Bluetooth, le pare-feu local et l'absence d'autre app connectée. Le pont réessaie automatiquement. L'état Maison reflète les dernières commandes appliquées ; la lecture de l'état physique du firmware n'est pas implémentée.

## Validation et développement

Tests Python des trames, sérialisation, échecs/cancellation BLE, reconnexion, canal RPC réel avec le processus HomeKit et arrêt propre. Tests Node d'appairage HomeKit chiffré avec un client indépendant. Le transport Bluetooth des tests est simulé ; un essai avec un vrai Pi, les LED et Maison reste nécessaire. Le cloud n'a pas de radio Bluetooth.

Dans les sources avec Python 3.11+ et Node 22/24 :

```bash
python3 -m venv .venv
.venv/bin/pip install -r linux/requirements.txt
npm ci --prefix homekit --ignore-scripts --no-audit --no-fund
PYTHONPATH=linux .venv/bin/python -m unittest discover -s linux/tests -v
npm test --prefix homekit
./lantern --help
```

Les archives embarquent le runtime officiel contrôlé SHA-256, les dépendances JS de production verrouillées et leurs licences. Aucun appairage ou réglage personnel n'est inclus.
