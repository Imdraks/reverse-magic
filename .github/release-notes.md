Cette mise à jour ajoute la **reconnexion automatique au dernier contrôleur Bluetooth** dans l’interface Windows et Linux.

- Le dernier appareil connecté avec succès est retrouvé dès le lancement de l’application.
- Après une indisponibilité ou une perte de liaison, de nouvelles tentatives sont effectuées automatiquement.
- « Déconnecter » ou « Annuler » suspend les tentatives pour la session. Une connexion manuelle réussie les réactive ; l’appareil reste mémorisé pour le prochain lancement.
- La reconnexion en mode manuel n’envoie aucune commande de couleur ou d’allumage.
- Le pont multi-éclairages continue de reprendre tous les appareils de son fichier de configuration. Pour le démarrer avec le PC ou le Raspberry Pi, configurer le service ou la tâche de démarrage décrits dans `GUIDE-PONT.md`.

**Téléchargement** : `LanternDirect-Setup.exe` pour Windows ; `LanternDirect-Windows-HomeKit.zip` pour le paquet portable complet ; `LanternDirect-Linux-arm64.tar.gz` pour Raspberry Pi OS 64 bits ; `LanternDirect-Linux-x64.tar.gz` pour PC Linux. Quitter Lantern et arrêter son pont avant la mise à jour. Les données utilisateur et les appairages Maison existants sont conservés.

Le projet reste limité à l’éclairage : Magic Lantern, relais Shelly utilisés pour la lumière et éclairages LSC/Tuya LAN configurés. LSC nécessite l’IP, l’identifiant, la clé locale, la version et un profil DP adapté. Les transports LSC BLE/Mesh/Zigbee et les produits cloud seul ne sont pas intégrés. La compatibilité de tous les éclairages LSC reste un objectif ; la référence Action 3208075 et les appareils physiques restent à vérifier sur matériel.
