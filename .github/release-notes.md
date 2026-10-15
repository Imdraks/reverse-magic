Cette version améliore les favoris, les connexions et l’installation sur Windows et Linux/Raspberry Pi.

- **Favoris personnels** : mémoriser une couleur ou une animation avec luminosité et vitesse, puis l’appliquer en un clic. Jusqu’à 32 favoris ; mise à jour par le même nom et suppression. Stockage local et conservation lors des mises à jour.
- **Connexions plus claires** : deux tentatives limitées pour les erreurs transitoires, bouton Annuler, messages adaptés et diagnostic de la radio/adaptateur. Une autre application connectée reste une possibilité, sans détection certaine. Aucun réglage n’est rejoué après une simple reconnexion manuelle.
- **Windows : `LanternDirect-Setup.exe`** installe le programme et le pont Maison pour votre compte, sans droits administrateur, avec raccourcis et désinstallation. Quitter Lantern avant installation ou mise à jour. La désinstallation conserve favoris, réglages et appairages Maison. Le ZIP portable est toujours proposé. WebView2 Runtime reste nécessaire pour l’interface moderne.
- **Linux/Raspberry Pi : `./install.sh --desktop`** ajoute le raccourci au menu des applications ; `./lantern desktop-install` l’ajoute à une installation existante. Le terminal et le service sans écran restent disponibles.
- **Versions** : vérification sur GitHub uniquement à votre demande, versions de test incluses ; aucun remplacement automatique des fichiers.

Le design clair/sombre, la correction rouge/vert GRB et le pont Maison sont conservés. Le PC/Pi doit rester allumé à portée Bluetooth. L’IPA iOS est inchangé.

Validation : tests de persistance/intégrité des favoris, trames GRB et animations, annulation de connexion et refus sans répétition en cas de permissions manquantes ; parcours GUI Chromium et HomeKit chiffré ; paquets Linux testés sur ARM64/x64. L’installation, le lancement du programme et la désinstallation sont testés sur un runner Windows, avec vérification des raccourcis, de la migration du démarrage automatique et de la conservation des données utilisateur. La radio réelle reste à confirmer sur vos appareils.
