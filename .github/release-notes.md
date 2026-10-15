Lantern Direct devient **Lantern Bridge**, une base de passerelle locale pour PC Windows ou Linux/Raspberry Pi, destinée à réunir plusieurs produits dans Apple Maison.

- **Pont multi-appareils** : un appairage chiffré pour plusieurs accessoires, identités stables, stockage privé verrouillé, pannes isolées.
- **Adaptateurs séparés** : Magic Lantern Bluetooth FFF0/FFF3 et Shelly Gen 1 Relay HTTP local. Un nouveau protocole demande son module ; il ne s’agit pas encore d’une compatibilité automatique avec tous les produits.
- **Terminal et service** : `./lantern gateway init/check/run/pairing`, registre `adapters`, service Linux/Pi `gateway-service`. Windows utilise le Node fourni avec `gateway/cli.js`.
- **GUI conservé** : nouvelle présentation Lantern Bridge, commandes et favoris dans le module Magic Lantern. La configuration du pont multi-appareils reste par fichier/terminal.
- **Nettoyage** : retrait du client mobile, de sa chaîne de compilation et de ses artefacts ; documentation du protocole déplacée dans `docs/protocols/`.

**Migration** : les anciens favoris et appairages sont conservés. Le nouveau pont a une identité distincte et nécessite un nouvel appairage. Arrêter l’ancien pont avant de lui transférer les mêmes LED. Voir `GUIDE-PONT.md`, inclus ci-dessous.

Les noms de fichiers LanternDirect sont conservés pour les mises à jour. Le PC/Pi doit rester allumé, sur le réseau de l’iPhone et à portée des appareils. Les capacités actuelles sont lampes RGB et interrupteurs ; Shelly Gen 2/3, volets, thermostats et autres protocoles restent à développer.

Validation : véritable client HomeKit chiffré face à plusieurs accessoires, relais HTTP de test, isolation hors ligne et absence de commande au démarrage/reconnexion du relais ; worker BLE Linux par stdio, trames GRB et annulation ; paquets natifs x64/ARM64, parcours Chromium, installation/lancement/désinstallation Windows et conservation des données. Les appareils radio et relais physiques restent à confirmer.
