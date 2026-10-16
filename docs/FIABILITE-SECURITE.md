# Fiabilité et protection du pont

## Installation et profils

L’assistant présente les étapes de configuration, test et enregistrement. L’enregistrement depuis l’interface refait un test sans commande lumineuse ; un appareil inaccessible n’est pas enregistré. Les API locales existantes permettent toujours de préparer une configuration hors ligne. Les profils LSC décrivent des DP et des fonctions, pas une certification de tous les modèles de la marque. L’inspection des DP reste nécessaire. Seuls les éclairages sont pris en charge.

Les transports Wi-Fi demandent une IPv4 privée, de boucle locale ou de liaison locale, sans domaine ni adresse publique. L’adresse de métadonnées 169.254.169.254 est exclue. Pour éviter un changement d’adresse après redémarrage, créer une réservation DHCP dans le routeur ; Lantern ne modifie pas le routeur et n’invente pas une identité à partir d’une adresse IP.

## Surveillance et reprise

Le pont surveille les éclairages sans envoyer de commande de couleur ou d’alimentation. Au maximum quatre lectures de fond s’exécutent simultanément. Les cycles qui se chevauchent sont regroupés. Un éclairage indisponible est vérifié après 5, 10, 20, 40 puis 60 secondes ; le délai reste plafonné à 60 secondes. Une lecture demandée depuis Maison peut provoquer une vérification immédiate. La reprise ne remet pas les lampes à une couleur par défaut.

Si le processus HomeKit s’arrête de façon inattendue, le gestionnaire programme sa reprise ; les modifications restent verrouillées pendant l’attente. **Désactiver Maison** annule cette reprise. Sous Linux, le service termine également en erreur si son processus HomeKit disparaît pour que systemd puisse le relancer. Les redémarrages sont limités par systemd pour éviter une boucle permanente.

Windows conserve le fonctionnement près de l’horloge et le démarrage à l’ouverture de session. Ce n’est pas un service Windows actif avant connexion. Sur Linux/Pi : quitter Lantern puis lancer `./lantern desktop-service --install`. Cette commande installe un service **utilisateur**, sans sudo. Pour qu’il démarre sans session ouverte, un administrateur doit configurer `loginctl enable-linger` pour ce compte. Ne pas cumuler ce service et le démarrage graphique.

## Diagnostic

**Le pont → Télécharger le diagnostic privé** reste disponible avec Maison actif. Le fichier donne les états, horaires, tentatives et conseils par numéro d’appareil. Il exclut les noms, pièces, IP, adresses Bluetooth, identifiants Tuya, clés et codes Maison. Les états sont ceux de la session courante. Une fenêtre observant un service externe indique explicitement qu’elle n’a pas accès à ses états détaillés ; consulter alors `journalctl --user -u lantern-bridge-desktop`.

## Sauvegardes automatiques

Dans **Réglages**, Maison arrêté, choisir **Configurer les sauvegardes automatiques** et une phrase de passe de 12 à 256 caractères. Télécharger la clé de récupération, la conserver sur un autre support et confirmer l’activation. Cette clé contient une clé RSA privée chiffrée par AES-256-GCM, avec clé dérivée par scrypt et sel aléatoire. Elle n’est pas stockée par le pont. Celui-ci conserve uniquement la clé publique RSA 3072 bits.

Chaque sauvegarde utilise une nouvelle clé AES-256-GCM, enveloppée avec RSA-OAEP/SHA-256. Le pont peut donc sauvegarder après redémarrage sans conserver le mot de passe ni la clé de déchiffrement. Les sauvegardes sont faites avant les modifications de configuration, restauration, activation de Maison et téléchargement d’une mise à jour. Les sept dernières restent dans `backups`, à côté du dossier `installation`. Une sauvegarde initiale est créée lors de l’activation ; **Sauvegarder maintenant** reste disponible Maison arrêté. Ce n’est pas une sauvegarde périodique pendant que Maison modifie ses fichiers.

Une erreur de sauvegarde empêche la modification prévue. Les fichiers sont écrits par remplacement atomique et synchronisés sur disque. Le contenu comprend le projet, ses identifiants, les profils et l’identité Maison du pont graphique. Le module historique conserve son stockage distinct. Une sauvegarde dépasse au maximum 2 Mo. Les liens symboliques ne sont pas inclus.

Pour restaurer une sauvegarde automatique, sélectionner le `.lantern`, le fichier de récupération et sa phrase de passe dans **Restaurer une sauvegarde**. Pour une sauvegarde manuelle, laisser le fichier de récupération vide. Une clé, phrase ou sauvegarde incorrecte ne remplace pas le projet. L’ancienne installation reste dans `installation.previous`.

**La clé de récupération n’est pas une sauvegarde de l’installation.** Copier aussi les fichiers `.lantern` sur un autre support : une panne du disque peut supprimer les sauvegardes locales. Sans la clé et sa phrase de passe, aucune récupération n’est possible. Garder l’ancien pont éteint lors d’un transfert d’identité.

## Mises à jour

La vérification se fait uniquement à la demande. Le canal normal exclut les préversions ; activer explicitement leur case pour les versions de test. Les fichiers sont limités aux publications `Imdraks/reverse-magic`, à la plateforme et à l’architecture courantes. HTTPS, destination des redirections, taille et SHA-256 sont vérifiés. Le digest des métadonnées GitHub, lorsqu’il existe, doit également correspondre au manifeste. Les fichiers partiels ou invalides ne sont pas proposés et un paquet vérifié antérieur est conservé si un nouveau téléchargement échoue.

Le téléchargement exige Maison arrêté et une sauvegarde automatique fonctionnelle ou une sauvegarde manuelle de la configuration courante réalisée pendant cette session. Le paquet est placé dans `updates`, à côté de `installation`. **Aucun exécutable n’est lancé automatiquement.** Quitter Lantern, puis utiliser l’installateur Windows ou extraire le paquet Linux dans un nouveau dossier et suivre son installation. Conserver le paquet précédent et la sauvegarde pour revenir en arrière. Un retour peut demander une restauration si le format de données change dans une future version.

SHA-256 protège l’intégrité du fichier obtenu et HTTPS authentifie le serveur de publication ; ce n’est pas une signature indépendante de l’éditeur. Une compromission du compte GitHub ou du compte utilisateur local reste une menace.

## Limites de protection

Le contrôle graphique Windows utilise les messages privés WebView2 ; sous Linux, le serveur écoute uniquement sur 127.0.0.1 avec une clé de session, vérification Host/Origin et protection contre l’intégration dans une autre page. Les contenus et scripts externes sont bloqués par CSP. Les sauvegardes, modifications, commandes directes et téléchargements de paquets sont bloqués côté gestionnaire lorsque Maison est actif ; le diagnostic et la consultation des versions restent disponibles.

Les clés nécessaires au fonctionnement restent dans le projet local en clair, protégé par le compte utilisateur (0600/0700 sous Linux, profil utilisateur sous Windows). Les clés devenues inutiles sont retirées de l’environnement du gestionnaire. LSC/Tuya LAN et HomeKit disposent de leur chiffrement protocolaire ; HTTP Shelly/OpenBeken et son authentification Basic ne chiffrent pas les communications. Utiliser un réseau domestique maîtrisé, sans redirection Internet, et protéger le compte et le disque du pont. Ces mesures ne constituent pas un audit de sécurité indépendant ni une garantie de compatibilité matérielle.
