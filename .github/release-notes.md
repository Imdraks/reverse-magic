Cette version ajoute le contrôle des LED dans l’application **Maison** de l’iPhone grâce à un pont Bluetooth/HomeKit sur votre PC Windows.

- Télécharger **LanternDirect-Windows-HomeKit.zip**, extraire tout le dossier, connecter les LED dans l’app Windows et cliquer sur **Activer Maison**, puis **Code d’appairage**.
- Scanner le QR code depuis Maison. Allumage, luminosité et couleur sont exposés comme une lampe HomeKit ; la correction rouge/vert GRB est conservée.
- Fermer la fenêtre laisse le pont actif près de l’horloge. Une option permet de le lancer à l’ouverture de session Windows. Reconnexion Bluetooth automatique et conservation de l’appairage.
- Le paquet contient l’exécutable Windows x64, Node.js et les dépendances HomeKit. Aucun runtime séparé à installer. PC et iPhone sur le même réseau local ; autoriser node.exe dans le pare-feu pour les réseaux privés.

**Le PC doit rester allumé, sans veille, à portée Bluetooth.** L’app iOS Lantern Direct n’est pas nécessaire pour Maison. Les effets RGBIC et la musique restent accessibles depuis le client Windows lorsque le pont est arrêté. La première activation éteint les LED ; ensuite les dernières consignes sont réappliquées après reconnexion. Les valeurs affichées sont les consignes, pas une lecture du contrôleur.

`LanternDirect.exe` seul reste utilisable pour le contrôle Bluetooth manuel ; Maison nécessite le ZIP complet. L’IPA iOS 1.0.1 est inchangé par rapport à v0.1.1 : contrôle Bluetooth direct, signature nécessaire avant installation. Sources et SHA-256 inclus.

Validation : 38 vérifications du protocole et de conversion des couleurs ; tests HomeKit avec appairage chiffré réel, refus d’accès sans appairage, commandes, indisponibilité Bluetooth, persistance et arrêt du serveur avec son parent. Compilation Windows x64 réussie. Les tests HomeKit utilisent un transport Bluetooth simulé : l’essai final avec Windows, vos LED et l’application Maison reste à confirmer. Accessoire HomeKit non certifié ; exécutable Windows non signé.
