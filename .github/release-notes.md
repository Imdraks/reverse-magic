Une nouvelle interface commune à **Windows et Linux/Raspberry Pi**, inspirée des applications Apple : fond doux, cartes arrondies, palette pastel, hiérarchie simple et modes clair/sombre.

- Tableau de bord avec lumière principale, bouton d’allumage, luminosité et palette de couleurs.
- Ambiances de couleurs prêtes à appliquer ; animations et musique du contrôleur dans leur propre section.
- Espace Maison pour activer/arrêter le pont, afficher le QR et le code d’appairage.
- Recherche et connexion des appareils Bluetooth, avec état et messages de connexion.
- Le mode musical et son indicateur sont arrêtés lors du passage à Maison.
- Commandes directes désactivées quand Maison pilote les LED ; retour au contrôle manuel après arrêt du pont.

**Windows** : ouvrir `LanternDirect.exe`, ou le programme dans `LanternDirect-Windows-HomeKit.zip` pour Maison. La nouvelle fenêtre utilise Microsoft Edge WebView2 Runtime, généralement installé sur Windows 11. Si ce runtime manque, les commandes classiques restent accessibles. Le runtime est disponible chez Microsoft ; il n’est pas inclus dans le paquet.

**Linux / Raspberry Pi OS 64 bits** : télécharger l’archive ARM64 ou x64, installer comme indiqué dans [le guide](https://github.com/Imdraks/reverse-magic/blob/main/linux/README.md), puis lancer **`./lantern gui`**. L’interface s’ouvre dans le navigateur de l’appareil, avec accès uniquement local et commandes authentifiées. Un bureau/navigateur est nécessaire pour le GUI ; le terminal, le pont sans écran et le service systemd restent disponibles. Arrêter le service avant de connecter ses LED dans le GUI.

Le pont Maison, les identités d’appairage et la correction rouge/vert GRB sont conservés. Le PC/Pi doit rester allumé et à portée Bluetooth. L’IPA iOS 1.0.1 est inchangé et reste non signé.

Aperçus clair et sombre joints à la release, avec un contrôleur simulé. Tests Chromium : connexion, commandes jusqu’aux trames GRB, luminosité, Maison, QR, retour au contrôle manuel, écran étroit et accès HTTP refusé sans session/depuis une autre origine. Tests Linux et HomeKit chiffré, validation native ARM64/x64 et compilation Windows. Le rendu WebView2 Windows et l’essai radio réel avec vos appareils restent à confirmer.
