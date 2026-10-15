# Lantern Bridge

**Un pont local sur PC ou Raspberry Pi pour retrouver ses appareils dans Apple Maison.**

Le projet évolue vers une passerelle multi-appareils et multi-protocoles. Le PC Windows ou le Pi/Linux reste allumé chez vous, communique avec les produits et les expose à Maison/Siri via HomeKit IP. Un seul appairage pour les accessoires du nouveau pont. Aucune application mobile supplémentaire nécessaire.

## Installer

[**Télécharger v0.6.0 — base multi-appareils, version de test**](https://github.com/Imdraks/reverse-magic/releases/tag/v0.6.0)

- **Windows** : [installateur](https://github.com/Imdraks/reverse-magic/releases/download/v0.6.0/LanternDirect-Setup.exe) ou [paquet portable complet](https://github.com/Imdraks/reverse-magic/releases/download/v0.6.0/LanternDirect-Windows-HomeKit.zip).
- **Raspberry Pi OS 64 bits** : [ARM64](https://github.com/Imdraks/reverse-magic/releases/download/v0.6.0/LanternDirect-Linux-arm64.tar.gz), installation terminal et service sans écran.
- **PC Linux** : [x64](https://github.com/Imdraks/reverse-magic/releases/download/v0.6.0/LanternDirect-Linux-x64.tar.gz), terminal, service et interface locale.

Les noms techniques `LanternDirect` et les dossiers de données sont conservés pour faciliter les mises à jour. L’installateur contient Node et le pont ; le runtime .NET est inclus. Sous Linux, installer Python/BlueZ selon [le guide](linux/README.md). WebView2 est nécessaire pour le GUI Windows moderne.

## Commencer avec le nouveau pont

[**Guide complet : configuration, appairage, service et migration**](docs/GATEWAY.md)

```sh
# Linux / Raspberry Pi, après ./install.sh
./lantern gateway init --config "$HOME/bridge.json"
./lantern gateway adapters
# Ajouter vos appareils dans bridge.json.
./lantern gateway check --config "$HOME/bridge.json"
./lantern gateway run --config "$HOME/bridge.json"
```

Sous Windows, depuis le dossier installé : `node.exe gateway/cli.js init`, puis `check`, `run` et `pairing`, avec `--config CHEMIN`. Le guide détaille les commandes PowerShell. La configuration multi-appareils se fait actuellement par fichier/terminal ; le GUI au style Apple conserve le module Magic Lantern, ses commandes manuelles et ses favoris.

## Compatibilité actuelle

| Module | Produits/protocole | Fonctions dans Maison |
|---|---|---|
| Magic Lantern BLE | Contrôleurs FFF0/FFF3 compatibles avec [le protocole analysé](docs/protocols/magic-lantern.md) | Allumage, luminosité, couleur ; correction GRB |
| Shelly Gen 1 Relay | Relais avec API HTTP locale `/relay/<canal>` | Marche/arrêt, lecture de l’état physique |

Chaque marque/protocole demande un adaptateur ; Zigbee nécessite par exemple une radio ou passerelle adaptée. Les capteurs, volets, thermostats, MQTT et d’autres générations Shelly ne sont pas encore implémentés. Les effets RGBIC et la musique restent propres au module LED.

## Données et migration

Les favoris et appairages existants restent conservés. Le nouveau pont a une identité distincte : déplacer les LED exige d’arrêter l’ancien pont, retirer leur ancien accessoire de Maison puis appairer le nouveau pont. Le [guide de migration](docs/GATEWAY.md#migration-depuis-le-pont-led) explique l’impact sur les automatisations. Ne pas copier les clés d’une lampe dans le stockage du pont.

Les appareils doivent être joignables par la passerelle, et l’iPhone sur le même réseau pour l’appairage. L’accès distant/les automatisations Apple peuvent nécessiter un HomePod ou Apple TV. Les commandes ordinaires restent locales, sans compte Lantern.

## Développer

[Architecture et contrat des adaptateurs](docs/ARCHITECTURE.md) · [Windows](windows/README.md) · [Linux/Pi](linux/README.md) · [moteur HomeKit](homekit/README.md)

Les tests couvrent l’appairage HomeKit chiffré réel, le routage de plusieurs accessoires, l’isolation des pannes, l’API de relais HTTP, les trames Bluetooth GRB, la persistance, le GUI et l’installation Windows. Les radios/relais physiques restent à valider sur le matériel cible. La passerelle n’est pas certifiée Apple.
