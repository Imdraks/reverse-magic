# Lantern Bridge — installer le pont chez soi

Lantern Bridge regroupe plusieurs appareils dans Apple Maison, avec un seul appairage. Le PC Windows ou Raspberry Pi/Linux reste allumé, sur le réseau de l’iPhone et à portée des appareils Bluetooth. Aucun logiciel supplémentaire sur l’iPhone : utilisez Maison. Pour l’accès depuis l’extérieur et certaines automatisations, Apple exige aussi un concentrateur HomePod ou Apple TV.

Cette version établit le cœur multi-appareils. Sa configuration passe par un fichier et le terminal. Le GUI conserve les commandes et favoris du module Magic Lantern ; son ancien bouton Maison publie encore une lampe individuelle. Ce bouton et le nouveau pont ne doivent pas posséder les mêmes LED simultanément.

## Appareils pris en charge

| Adaptateur | Connexion | Fonctions Maison | Limites |
|---|---|---|---|
| `magic-lantern-ble` | Bluetooth LE FFF0/FFF3 | Allumage, luminosité, couleur | Contrôleurs compatibles avec le protocole documenté, pas tous les rubans Bluetooth ; correction GRB conservée |
| `shelly-gen1-relay` | API HTTP locale Shelly Gen 1 | Interrupteur marche/arrêt par canal | Mode relais uniquement ; pas Gen 2/3, volet ou variateur |

Chaque nouveau protocole demande un adaptateur et des essais. Zigbee exige une radio/passerelle adaptée ; un appareil limité au cloud peut nécessiter une API et des identifiants. Le pont ne peut pas rendre automatiquement compatible un produit dont le protocole est inaccessible. Il n’est pas certifié Apple.

## Installation

Utilisez les paquets complets de la [release](https://github.com/Imdraks/reverse-magic/releases/tag/v0.6.0). Les noms de fichiers `LanternDirect` sont conservés pour faciliter la mise à jour et protéger les données existantes.

Sur Linux/Pi 64 bits : extraire le paquet ARM64 (Pi) ou x64 (PC), installer `python3-venv` et BlueZ, puis lancer `./install.sh`. Les détails radio restent dans [le guide Linux](../linux/README.md). Le pont HTTP seul n’utilise pas la radio Bluetooth.

```sh
./lantern gateway init --config "$HOME/bridge.json"
./lantern gateway adapters
# Modifier bridge.json avec vos vrais appareils, selon l’exemple ci-dessous.
./lantern gateway check --config "$HOME/bridge.json"
./lantern gateway run --config "$HOME/bridge.json"
```

Sur Windows : installer `LanternDirect-Setup.exe`, puis ouvrir PowerShell dans `%LOCALAPPDATA%\Programs\LanternDirect` (ou le dossier du ZIP complet). Utiliser le Node fourni :

```powershell
.\node.exe .\gateway\cli.js init --config "$env:USERPROFILE\bridge.json"
.\node.exe .\gateway\cli.js adapters
# Modifier le fichier avec vos appareils.
.\node.exe .\gateway\cli.js check --config "$env:USERPROFILE\bridge.json"
.\node.exe .\gateway\cli.js run --config "$env:USERPROFILE\bridge.json"
```

Le raccourci `LanternDirect.exe --gateway run --config CHEMIN` est aussi disponible pour les lanceurs. Sous PowerShell, préférer `node.exe` pour garder le terminal attaché. L’option de démarrage automatique du GUI concerne encore le pont LED individuel ; pour le pont multi-appareils Windows, créer une tâche de session qui lance `node.exe` avec le chemin absolu de `gateway\cli.js`, `run` et `--config` et le dossier du programme comme répertoire de travail.

## Configuration

`init` crée un fichier vide et refuse d’écraser un fichier existant. Cet exemple contient des adresses fictives à remplacer :

```json
{
  "version": 1,
  "id": "maison",
  "name": "Lantern Bridge",
  "port": 51828,
  "devices": [
    {
      "id": "led-salon",
      "name": "Lumiere salon",
      "adapter": "magic-lantern-ble",
      "options": { "address": "AA:BB:CC:DD:EE:FF" }
    },
    {
      "id": "relais-bureau",
      "name": "Relais bureau",
      "adapter": "shelly-gen1-relay",
      "options": { "host": "http://192.168.1.20", "channel": 0 }
    }
  ]
}
```

Les identifiants `id` sont permanents : les changer crée un nouvel accessoire. Renommer `name` conserve son identité. Un même appareil/canal ne peut pas apparaître deux fois. Jusqu’à 100 appareils par pont ; le nombre réel de connexions BLE simultanées dépend de la radio. Sous Linux uniquement, `options.adapter: "hci1"` choisit une autre radio. Le catalogue des modules se trouve dans `gateway/registry.js`.

Pour un Shelly protégé, ajouter `usernameEnv: "SHELLY_USER"` et `passwordEnv: "SHELLY_PASSWORD"` dans ses options, puis définir ces variables dans l’environnement du processus ou du service. Les valeurs ne sont jamais enregistrées dans la configuration ni affichées. L’API Gen 1 utilise HTTP et Basic Auth : la réserver à votre réseau local de confiance, sans exposition Internet.

Arrêter le pont avec Ctrl+C avant de modifier le fichier, puis relancer. Les appareils ajoutés apparaîtront dans le pont déjà appairé ; supprimer une entrée la retire de Maison. Les erreurs de configuration arrêtent le démarrage sans remplacement du stockage. Un appareil hors ligne n’empêche pas les autres de fonctionner.

## Ajouter le pont dans Maison

Le code n’est pas imprimé dans les journaux de service. Pendant que `run` est actif, ouvrir un autre terminal :

```sh
./lantern gateway pairing --config "$HOME/bridge.json"
```

Sous Windows : `node.exe gateway/cli.js pairing --config CHEMIN`. Dans Maison : **+ → Ajouter un accessoire**, scanner le QR ou saisir le code. Le dossier privé contient aussi `pairing.png`. Autoriser le port TCP choisi (51828 par défaut) et la découverte mDNS UDP 5353 sur le réseau privé. Ne pas exposer ces ports sur Internet.

Les identités et clés sont dans `~/.local/state/lantern-direct/gateway/<id>` sous Linux (`XDG_STATE_HOME` respecté), et `%LOCALAPPDATA%/LanternDirect/gateway/<id>` sous Windows. `--data-dir DOSSIER` change la racine ; utiliser la même option pour `run` et `pairing`. Ne pas partager ce stockage. Une seule instance peut l’utiliser ; après un arrêt brutal, attendre une dizaine de secondes pour que le verrou expire.

Le relais Shelly est lu au démarrage et après reconnexion : le pont ne l’éteint pas et ne rejoue pas une ancienne consigne. Magic Lantern ne fournit pas de lecture physique : sa première synchronisation reste éteinte, puis restaure les dernières consignes de ce pont.

## Service Raspberry Pi / Linux

```sh
./lantern gateway-service --config "$HOME/bridge.json"
./lantern gateway-service --config "$HOME/bridge.json" --install
```

La première commande affiche le service pour inspection, la seconde installe `lantern-bridge.service` et l’active via sudo. Le processus tourne ensuite sous votre compte. Désactiver l’ancien service `lantern-direct` s’il possède les mêmes LED : `sudo systemctl disable --now lantern-direct`. Le service multi-appareils n’affiche pas de code. Garder le dossier du programme et celui de la configuration à leur emplacement.

## Migration depuis le pont LED

Le stockage historique, ses favoris et ses appairages restent inchangés. Le nouveau pont a sa propre identité. Pour déplacer une lampe : arrêter son ancien pont/service, retirer cette ancienne lampe de Maison, ajouter son entrée dans `bridge.json`, démarrer le nouveau pont et l’appairer une fois. Les scènes/automatisations qui pointaient sur l’ancien accessoire doivent être adaptées. Ne pas copier des clés d’appairage d’une lampe vers un pont.

## Développement

Voir [l’architecture](ARCHITECTURE.md). `npm test --prefix homekit` vérifie notamment un vrai appairage HomeKit chiffré avec plusieurs accessoires, le routage indépendant de deux lampes, une API de relais HTTP de test, la lecture sans écriture au démarrage/reconnexion et l’isolation des appareils hors ligne. Les radios et relais physiques restent à essayer sur le matériel cible.
