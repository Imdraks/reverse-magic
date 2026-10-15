# Moteur HomeKit et compatibilité du pont LED

Le cœur multi-appareils est désormais dans [gateway/](../gateway) : [guide](../docs/GATEWAY.md), [architecture](../docs/ARCHITECTURE.md). Ce dossier fournit les moteurs, le stockage privé et les services HAP réutilisés.

# Pont HomeKit

Serveur HAP-NodeJS pour une lampe Magic Lantern reliée par Bluetooth aux clients Windows ou Linux. Installation : [guide Windows](../MAISON-WINDOWS.txt) ou [guide Linux/Raspberry Pi](../linux/README.md).

`server.js` publie un accessoire Lightbulb HomeKit-IP avec appairage chiffré, QR code et découverte mDNS via ciao. Le parent Windows ou Python/Linux possède la liaison BLE ; les échanges passent uniquement par stdin/stdout JSON. Le serveur n’est pas utilisable seul pour commander la radio. Aucune requête réseau sans appairage n’accède aux caractéristiques.

Le moteur regroupe les changements simultanés de teinte/saturation/luminosité, sérialise les consignes et ne valide une écriture qu’après réussite Bluetooth. Une erreur conserve la consigne précédente et renvoie une erreur HomeKit. La reconnexion restaure cette consigne. Les getters indiquent l’indisponibilité du contrôleur ; ce ne sont pas des lectures physiques de son firmware.

L’identité et le code sont générés aléatoirement pour chaque contrôleur. Le stockage des clés HomeKit et des dernières consignes reste dans le profil utilisateur du système. Ne pas copier ce dossier dans une release ou des logs. Node 24.19.0 est fourni avec son fichier de licence ; HAP-NodeJS et qrcode et leurs dépendances conservent leurs licences dans le paquet. `hap-controller` sert seulement aux tests et est exclu du paquet utilisateur.

Validation depuis la racine :

```sh
npm ci --prefix homekit --ignore-scripts --no-audit --no-fund
npm test --prefix homekit
dotnet run --project windows-tests/ProtocolChecks.csproj
```

Les tests Linux exercent aussi le canal RPC, les commandes chiffrées jusqu’aux trames GRB et la fermeture du processus ; voir `linux/tests/`. Les tests Node vérifient un véritable échange HomeKit chiffré avec un client indépendant, l’accès interdit sans appairage, le code incorrect, les couleurs, l’état hors ligne, la persistance, le QR et la fermeture du serveur quand son parent ferme stdin. Seul le transport BLE est simulé. Le paquet Windows est construit avec `scripts/package-homekit.py`, qui vérifie le SHA-256 du runtime officiel et installe les dépendances de production avec le verrou npm.
