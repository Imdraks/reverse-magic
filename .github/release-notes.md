Lantern Bridge dispose maintenant d’un **gestionnaire graphique multi-éclairages Windows et Linux / Raspberry Pi**.

- **Assistant d’ajout** pour Magic Lantern Bluetooth, éclairages LSC / Tuya LAN et relais Shelly Gen 1 utilisés pour la lumière. Noms, pièces, test de connexion et inspection DP LSC en lecture seule ; pas de récupération automatique des clés ou de balayage Wi-Fi.
- **Tableau de bord par pièce** : disponibilité, dernière connexion de la session, commandes individuelles et de groupe, fonctions adaptées aux profils.
- **Règle Maison conservée** : les commandes directes, ajouts, modifications, suppressions, diagnostics matériels et restaurations sont bloqués pendant le mode Maison, dans l’interface et côté programme. Pour ajouter une lampe : désactiver Maison, ajouter puis réactiver. Le même pont conserve son appairage.
- **Réactivation fiable** : processus HomeKit neuf à chaque activation ; configuration et appairages relus depuis le stockage.
- **Sauvegardes chiffrées** AES-256-GCM / scrypt : configuration, identifiants locaux et identité Maison ; restauration validée avec conservation de l’installation précédente. Phrase de passe de 12 caractères minimum.
- **Démarrage automatique** du projet de l’interface à l’ouverture de session Windows/Linux. Export d’un service utilisateur pour un Pi sans écran ; installation et maintien du service au boot décrits dans `docs/DESKTOP.md`.
- Journal de session et parcours de mise à jour guidé. L’installateur conserve les données utilisateur et le choix du pont à démarrer.

**Télécharger** `LanternDirect-Setup.exe` sous Windows, ou le ZIP portable complet ; `LanternDirect-Linux-arm64.tar.gz` pour Raspberry Pi OS 64 bits, `LanternDirect-Linux-x64.tar.gz` pour PC Linux. Quitter Lantern et arrêter ses services avant la mise à jour. Guide : `docs/DESKTOP.md` dans les paquets.

Le module Magic Lantern et son ancien pont individuel restent disponibles avec leurs données. Le nouveau gestionnaire a une identité et un stockage distincts : il n’importe pas automatiquement un `bridge.json` du terminal ni l’appairage individuel d’une LED. Les pièces Lantern ne synchronisent pas les pièces Apple Maison. Le journal est limité à la session. Les clés locales sont stockées dans le profil utilisateur ; elles sont chiffrées dans les sauvegardes exportées.

Le projet reste consacré à l’éclairage. LSC nécessite une IP, une version Tuya, un profil DP et des identifiants valides ; BLE/Mesh/Zigbee et produits cloud seul ne sont pas intégrés au driver LAN. La référence Action 3208075 et les appareils physiques restent à valider sur matériel. Les tests utilisent de vrais échanges HomeKit, des appareils HTTP/Tuya simulés et le parcours graphique complet ; ils ne certifient pas toute une gamme commerciale.
