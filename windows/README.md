# Lantern Bridge — Windows

Client natif Windows du protocole BLE Magic Lantern 6.11.10. Version Windows x64, **Windows 10 version 2004 ou ultérieure / Windows 11**, avec adaptateur Bluetooth LE fonctionnel. Exécutable autonome .NET 10 ; aucun runtime .NET séparé n’est nécessaire. Le pont Maison sert HomeKit sur votre réseau local, sans compte ni cloud.

## Utiliser

1. Ouvrir `LanternDirect.exe` sur le PC Windows.
2. Alimenter les LED, activer le Bluetooth et fermer l’app Android pour libérer la connexion.
3. Cliquer sur **Rechercher**, choisir le contrôleur, souvent `MELK-…`, puis **Connecter le contrôleur sélectionné**.
4. Tester Allumer, une couleur puis la luminosité. Les boutons **Appliquer** évitent d’envoyer une rafale de commandes pendant le déplacement des curseurs.
5. Choisir un effet RGBIC et le lancer. Les 241 effets/scènes proviennent du catalogue de l’APK ; certains dépendent du modèle.
6. Le mode musical commande le **microphone du contrôleur**, s’il existe. Cette version Windows ne capte pas le microphone ou le son système du PC.

L’application vérifie le service FFF0 et la caractéristique FFF3. Elle sérialise les écritures, préfère une écriture GATT avec réponse et annule la session après une erreur ou une expiration. Aucun changement du câblage ou du nombre de LED n’est effectué. La dernière adresse est conservée uniquement dans un fichier local sous `%LOCALAPPDATA%/LanternDirect/`.

Les valeurs affichées sont les réglages demandés, pas une lecture de l’état réel. Le pont Maison est disponible avec le paquet Windows complet ; voir [MAISON-WINDOWS.txt](../MAISON-WINDOWS.txt). Il ne fournit pas Matter.

## Validation et compilation

Compilation Release Windows x64 réussie depuis Linux avec le SDK officiel .NET 10.0.401, après contrôle SHA-512 du téléchargement. Les 43 vérifications du protocole et de conversion des couleurs passent. Les APIs Windows, l’interface et la liaison radio ne sont pas exécutables dans ce cloud Linux : un essai sur votre PC et vos LED reste nécessaire. L’exécutable n’est pas signé avec un certificat de distribution Windows.

Depuis la racine des sources avec le SDK .NET 10 :

```sh
dotnet run --project windows-tests/ProtocolChecks.csproj
dotnet publish windows/LanternDirect.csproj -c Release -r win-x64 -o output/windows
```

Le projet active le ciblage Windows pour permettre la compilation croisée. Les dépendances Microsoft Windows et WinRT sont restaurées depuis NuGet. Le format des trames et leur provenance sont décrits dans [docs/protocols/magic-lantern.md](../docs/protocols/magic-lantern.md).

## Patch v0.1.1

Le contrôleur de l’utilisateur inverse les canaux rouge et vert avec les trames RGB de la première version. Le client envoie maintenant les couleurs choisies en GRB. Le bleu reste à la même position ; aucun réglage permanent du contrôleur n’est modifié. Les effets produits dans le contrôleur ne sont pas remappés.

## Pont Maison v0.2.0

Extraire le ZIP Windows HomeKit complet, garder `node.exe` et `homekit/` à côté du programme. Connecter le contrôleur, activer Maison et scanner le QR depuis Maison sur l’iPhone. Allumage, couleur et luminosité sont exposés par HAP-NodeJS. Autoriser Node dans le pare-feu des réseaux privés (TCP 51827, mDNS UDP 5353).

Le programme reste actif près de l’horloge lorsque sa fenêtre est fermée. Le démarrage automatique utilise uniquement la clé Run de l’utilisateur courant et peut être décoché. Le PC doit rester allumé et dans une session ouverte, sans veille ; le pont n’est pas un service Windows. L’appairage et les consignes sont stockés sous `%LOCALAPPDATA%/LanternDirect/homekit/`. La première synchronisation éteint les LED ; les suivantes restaurent la dernière consigne Maison.

Les commandes manuelles sont désactivées pendant le fonctionnement du pont pour préserver la cohérence des consignes Maison. Arrêter Maison pour utiliser les effets ou un client Bluetooth direct. HomeKit utilise un processus Node possédé par l’app Windows et un canal privé stdin/stdout ; aucune API Bluetooth HTTP non authentifiée n’est publiée. La détection de disponibilité et les commandes expirent en cas de perte du contrôleur.

## Nouvelle interface v0.4.0

La fenêtre embarque la même interface que Linux : vue d’ensemble, couleurs, ambiances, Maison et appareils, avec apparence claire ou sombre. Les commandes utilisent toujours le contrôleur BLE Windows natif et le pont existant. Les fichiers HTML/CSS/JS sont intégrés dans l’EXE et extraits dans le profil utilisateur ; aucun site externe ou connexion Internet n’est nécessaire pour l’interface.

L’affichage moderne nécessite **Microsoft Edge WebView2 Runtime**, généralement déjà présent sur Windows 11. S’il manque, le programme conserve les commandes classiques et vous invite à l’installer depuis [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/). Le runtime WebView2 n’est pas inclus dans le paquet. Le pont Maison est inclus dans l’installateur ; en mode portable, conserver le ZIP Windows complet.

Le rendu partagé a été testé dans Chromium et la compilation Windows x64 est vérifiée. Le fonctionnement de la fenêtre WebView2 et du Bluetooth reste à confirmer sur votre PC Windows.

## Installation et favoris v0.5.0

`LanternDirect-Setup.exe` installe le programme, Node et le pont Maison dans `%LOCALAPPDATA%/Programs/LanternDirect`, sans droits administrateur. L’assistant crée un raccourci du menu Démarrer, propose celui du Bureau et enregistre la désinstallation dans les applications Windows. Quitter Lantern depuis la zone de notification avant installation, mise à jour ou désinstallation. Le chemin du démarrage automatique est mis à jour si cette option était déjà active. WebView2 Runtime reste un prérequis séparé.

La désinstallation retire le programme et ses raccourcis, mais conserve `%LOCALAPPDATA%/LanternDirect` : favoris, dernier contrôleur et clés Maison. Le ZIP portable reste disponible.

Les favoris mémorisent une couleur ou une animation avec luminosité et vitesse (jusqu’à 32). Enregistrer depuis la vue d’ensemble ; le même nom remplace un favori et son application allume la lumière. Les données restent dans `favorites.json` dans le profil utilisateur ; un fichier illisible n’est pas écrasé. Le mode musical ne peut pas être mémorisé.

Le GUI propose deux tentatives de connexion, annulables, pour les erreurs transitoires. Une reconnexion seule ne rejoue pas les réglages. Le diagnostic inspecte adaptateur, support BLE et radio ; une autre application connectée ne peut pas être confirmée. La vérification des versions consulte GitHub uniquement sur demande et inclut les releases de test ; le téléchargement reste manuel.

## Pont multi-appareils

Le nouveau cœur Lantern Bridge et ses modules Magic Lantern BLE / Shelly Gen 1 sont décrits dans [le guide du pont](../docs/GATEWAY.md). Configuration via terminal ; le GUI ci-dessus reste le module LED individuel. Le nouveau pont utilise un stockage séparé et nécessite un appairage Maison distinct.

### Reconnexion au lancement

L’interface se reconnecte automatiquement au dernier contrôleur Bluetooth auquel
elle s’est connectée avec succès. Elle réessaie toutes les 10 secondes après un
cycle de connexion infructueux, ainsi qu’après une perte de liaison. Aucun
réglage lumineux n’est envoyé lors de cette reconnexion en mode manuel.
« Déconnecter » ou « Annuler » suspend les tentatives pour la session en cours ;
une connexion manuelle réussie les réactive. Le dernier appareil reste mémorisé
pour le prochain lancement. Une première sélection manuelle est nécessaire.

Le pont multi-éclairages reprend tous les appareils de son fichier de
configuration à chaque lancement et surveille leur disponibilité. Pour qu’il
redémarre avec le PC ou le Raspberry Pi, configurer le démarrage automatique
comme indiqué dans le [guide du pont](../docs/GATEWAY.md).
