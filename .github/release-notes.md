Cette version améliore le fonctionnement quotidien du pont d’éclairage Windows, Linux et Raspberry Pi, et protège les opérations de maintenance.

- Ajout guidé : informations propres au protocole, inspection LSC et connexion revérifiée avant enregistrement dans l’interface.
- Diagnostic privé téléchargeable même avec Maison actif : états, dernières vérifications et conseils, sans noms, adresses, identifiants ni clés. Les états d’un service externe restent explicitement indisponibles dans la fenêtre.
- Surveillance avec quatre lectures simultanées maximum et délai progressif de 5 à 60 secondes pour les appareils indisponibles. Reprise du processus HomeKit après incident ; les modifications restent verrouillées jusqu’à désactivation de Maison.
- Service Linux/Pi utilisateur installable avec `./lantern desktop-service --install`, sans sudo. Le démarrage sans session nécessite la configuration de linger par un administrateur. Windows conserve le mode près de l’horloge et l’autostart de session.
- Sauvegardes automatiques avant modification, activation et mise à jour ; rotation sur sept fichiers. Seule une clé publique RSA reste sur le pont. La clé privée de récupération est téléchargée chiffrée par une phrase de passe ; la conserver séparément avec les sauvegardes. Restauration intégrée et maintien de l’identité Maison.
- Téléchargement des paquets officiels adapté à la plateforme, contrôle des redirections HTTPS, taille, SHA-256 et digest GitHub lorsqu’il existe. Maison arrêté et sauvegarde requise. Installation manuelle après fermeture du pont ; conserver l’ancien paquet pour revenir en arrière. Les préversions nécessitent un choix explicite.
- Adresses Wi-Fi limitées aux IPv4 locales, pas de domaines ni d’adresses publiques pour les pilotes. Protection de la page locale renforcée ; retrait des anciennes clés de l’environnement et écritures de configuration synchronisées.
- Conversion LSC : comparaison des déclarations avec le profil documenté, écarts visibles, sources et rapport exportable. Aucun exploit ou flash automatique ; la 970709 en 1.1.6 reste non validée sur matériel.

Les sauvegardes automatiques ne sont pas périodiques pendant le fonctionnement de Maison. Les clés opérationnelles du projet restent protégées par le compte local, sans coffre système. HTTP Shelly/OpenBeken ne chiffre pas le réseau. Les contrôles de téléchargement ne remplacent pas une signature indépendante. Aucun essai sur une ampoule physique n’a été effectué dans le cloud.

Guide détaillé : `docs/FIABILITE-SECURITE.md`. Arrêter Maison, sauvegarder puis quitter Lantern avant de mettre à jour. Conserver la clé de récupération hors du PC et copier aussi les sauvegardes sur un autre support.
