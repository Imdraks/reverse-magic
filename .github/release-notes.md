Cette version simplifie l’ajout d’un éclairage LSC/Tuya **déjà associé au Wi-Fi** depuis l’interface Windows ou Linux.

- **Rechercher sur le réseau** : écoute passive pendant huit secondes des annonces UDP Tuya (6666, 6667, 7000). Renseigne l’adresse, l’identifiant et la version annoncée après sélection. Aucun balayage des IP ni commande lumineuse.
- **Importer mes identifiants locaux** : lecture d’un fichier TinyTuya `devices.json` dans la fenêtre pour éviter de recopier les clés. Sélection explicite de l’éclairage, aucune création automatique. Identifiants importés effacés de la fenêtre quand le formulaire est fermé ; le fichier d’origine reste sous votre responsabilité.
- Les annonces reçues ne certifient ni la marque LSC ni la catégorie éclairage. La clé et les fonctions doivent être vérifiées par inspection des DP et test avant enregistrement.
- Recherche, ajout et modifications restent verrouillés quand Maison est activé. Les profils mémorisés, appairages et comportements passifs au démarrage/à l’arrêt sont conservés.

**Activation initiale non disponible** : cette version ne connecte pas une ampoule neuve au Wi-Fi, ne se connecte pas au compte LSC et ne récupère pas automatiquement ses clés. Un fichier TinyTuya doit déjà exister pour utiliser l’import. Le parcours officiel Tuya nécessite notamment un jeton lié au foyer ; les prérequis sont documentés dans `docs/research/lsc-smart-connect.md`. Aucune modification de firmware ni réinitialisation n’est effectuée.

Validation : vrais échanges UDP en clair, AES-ECB et AES-GCM, doublons, paquets invalides, erreurs réseau et résultats partiels, annulation, verrou Maison ; parcours Chromium avec import local et découverte UDP via le gestionnaire réel. Les ampoules physiques et la référence Action 3208075 restent à tester sur matériel. Voir `docs/LSC.md`.

Téléchargements : `LanternDirect-Setup.exe` pour Windows ; ZIP portable complet ; Linux x64 et Raspberry Pi ARM64. Arrêter les ponts et quitter Lantern avant la mise à jour. Données et appairages existants conservés.
