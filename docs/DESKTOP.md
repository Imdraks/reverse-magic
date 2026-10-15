# Gérer ses éclairages dans l’interface

Installer le paquet complet Windows, ou extraire le paquet Linux x64 / Raspberry Pi ARM64 et exécuter `./install.sh`, puis `./lantern gui`. Windows nécessite WebView2 ; le Raspberry Pi avec interface nécessite un bureau et un navigateur. L’interface Linux reste limitée à cet appareil : elle n’est pas publiée sur le réseau.

## Ajouter et utiliser les lumières

1. Dans **Le pont**, désactiver Maison si nécessaire. Attendre la fin de l’arrêt.
2. Choisir **Ajouter un éclairage**, donner un nom et une pièce.
3. Sélectionner Magic Lantern Bluetooth, LSC/Tuya LAN ou un relais Shelly Gen 1 **utilisé pour l’éclairage**. L’adresse d’une LED Bluetooth peut être recherchée dans **Appareils**, puis reprise dans l’assistant. Pour le Wi-Fi, renseigner l’IP ; il n’y a pas de balayage automatique du réseau.
4. Pour LSC : IP, version Tuya, profil, identifiant et clé locale de 16 octets. **Inspecter les DP** n’envoie pas de commande lumineuse et propose seulement des profils candidats. Le mapping DP avancé peut être ajusté en JSON. Voir [LSC.md](LSC.md) pour les clés, profils et limites matérielles. L’application ne récupère pas les clés d’un compte LSC et ne configure pas le Wi-Fi de l’ampoule.
5. **Tester la connexion** lit l’appareil, sans commande d’allumage. Enregistrer, puis réactiver Maison.
6. **Code Maison** affiche le QR du pont multi-éclairages. Un seul appairage suffit ; les prochains appareils enregistrés sont ajoutés lors de la réactivation. Ne pas réappairer le pont après chaque ajout.

Lorsque Maison est actif, **l’ajout, la modification, la suppression, le diagnostic d’un appareil, les commandes directes et de groupe, les favoris et la restauration sont bloqués**. Le contrôle est réservé à Apple Maison. Le verrou est appliqué par le gestionnaire et les hôtes Windows/Linux ; désactiver un bouton côté navigateur ne permet pas de contourner la règle. L’état et le journal de session restent visibles. Le code Maison et les réglages de démarrage restent accessibles.

Quand Maison est arrêté, choisir une pièce puis **Tout allumer / Tout éteindre**, ou utiliser les commandes d’une carte. La luminosité et la couleur sont proposées seulement si le profil les prend en charge ; le blanc réglable reste disponible dans Maison. Les nombres de luminosité du formulaire sont des **consignes**, pas une lecture physique. Une commande de groupe peut réussir sur certaines lampes et échouer sur d’autres : l’interface le signale. Les groupes sont limités à quatre opérations simultanées et cessent de lancer de nouvelles commandes après 90 secondes.

Le statut correspond à la dernière connexion vérifiée pendant cette session. Le pont actualise la disponibilité périodiquement. Le journal et les dates de dernière connexion ne sont pas un historique persistant. Les pièces servent au classement dans Lantern ; les pièces Apple Maison se configurent dans Maison. Changer un nom ou une pièce conserve l’identifiant permanent de la lumière. Supprimer un éclairage peut exiger d’adapter ses automatismes Maison.

## Démarrer automatiquement

Dans **Réglages**, activer **Démarrer Maison à l’ouverture de session**. Windows lance `LanternDirect.exe --desktop-homekit` ; fermer la fenêtre laisse le pont dans la zone de notification. Linux crée un raccourci d’autostart XDG qui lance `./lantern gui --homekit`. Cela nécessite une session graphique ; ce n’est pas un service de démarrage du Pi. Garder la machine allumée, sans veille, à portée des appareils Bluetooth.

### Raspberry Pi sans écran

Depuis **Réglages**, télécharger `lantern-bridge-desktop.service`. Il contient les chemins absolus du Node fourni, du runner et du stockage de cette installation, sans identifiant ni clé. Quitter Lantern avant de lancer ce service. Sur le Pi, sous le même utilisateur :

```sh
mkdir -p "$HOME/.config/systemd/user"
# Copier le fichier téléchargé dans ce dossier, puis :
systemctl --user daemon-reload
systemctl --user enable --now lantern-bridge-desktop.service
```

Pour un démarrage sans ouverture de session, activer le maintien du gestionnaire utilisateur avec `sudo loginctl enable-linger "$USER"`. Cela demande une configuration système explicite ; l’interface ne la modifie pas. Le compte doit avoir accès à BlueZ et au Bluetooth selon le [guide Linux](../linux/README.md).

Pour ajouter un appareil ensuite : `systemctl --user stop lantern-bridge-desktop.service`, ouvrir Lantern, modifier les appareils avec Maison désactivé, quitter Lantern puis relancer le service. Si un service possède le pont, l’interface affiche **service externe** et refuse ses modifications ; elle ne termine pas automatiquement un autre processus. Ne pas activer à la fois l’autostart graphique et le service pour cette installation.

## Stockage et sauvegardes

Windows : `%LOCALAPPDATA%/LanternDirect/desktop/installation`. Linux : `~/.local/state/lantern-direct/homekit/desktop-bridge/installation` (ou la racine choisie par `XDG_STATE_HOME` / `gui --data-dir`). `project.json` contient la configuration et les identifiants locaux ; les clés HAP restent dans le sous-dossier `gateway`. Les fichiers privés sont créés en 0600 et les répertoires en 0700 sous Linux ; Windows utilise les protections du profil utilisateur. Les identifiants stockés localement ne sont pas chiffrés par le coffre du système : protéger ce compte et ce disque. Ne pas partager ce dossier ni le placer dans Git.

Dans **Réglages**, Maison arrêté :

- **Créer une sauvegarde** : phrase de passe de 12 à 256 caractères, puis téléchargement d’un fichier `.lantern` chiffré par AES-256-GCM ; clé dérivée avec scrypt et sel aléatoire. La configuration, les identifiants et les fichiers d’appairage du pont de cette interface sont inclus. Aucun secret n’est affiché dans le tableau de bord ou le journal.
- **Restaurer** : choisir le fichier, saisir la phrase et confirmer le remplacement. Un mot de passe incorrect ou un fichier invalide ne modifie pas les données. Le remplacement se prépare dans un dossier temporaire ; l’installation précédente est gardée dans `installation.previous`. Une coupure entre les renommages est récupérée au prochain lancement. Une sauvegarde ne doit pas dépasser 2 Mo.

Conserver la phrase séparément : aucune récupération n’est possible. Après transfert vers un autre PC/Pi, garder l’ancien pont éteint pour éviter deux machines avec la même identité Maison. La restauration préserve les identifiants d’accessoires et les appairages ; le routage réseau et les transports matériels doivent être reconfigurés sur la machine cible si nécessaire.

L’interface ne reprend pas automatiquement un `bridge.json` créé au terminal. Son projet, ses identifiants et son stockage sont distincts. Les commandes CLI existantes restent disponibles pour les installations gérées par fichier.

## Installation historique et mises à jour

Le module Magic Lantern, ses favoris, son ancien pont individuel sur 51827 et ses appairages sont conservés. Le pont de l’assistant utilise 51828 par défaut et une **nouvelle identité**. Pour déplacer une lampe, arrêter son ancien pont, retirer son ancien accessoire dans Maison, puis l’ajouter au nouveau pont. Ses références dans les automatisations doivent être adaptées. Ne pas copier directement le stockage d’une lampe individuelle dans celui du pont.

Avant une mise à jour : arrêter Maison, créer une sauvegarde, quitter Lantern puis installer le nouveau paquet. L’installateur Windows préserve les dossiers utilisateur et le choix du mode de démarrage. La réinstallation d’une version précédente doit utiliser une version compatible avec le format de projet ; les versions 0.7.x n’ont pas le gestionnaire graphique de cette installation. Conserver le paquet et la sauvegarde avant toute migration de format. Il n’y a pas de remplacement automatique des exécutables pendant leur fonctionnement.

Les essais automatisés utilisent de vrais échanges HomeKit et des appareils HTTP/Tuya simulés, plus des tests d’installation Windows. Les radios et éclairages physiques, dont la référence LSC Action 3208075, restent à valider sur matériel.
