# Lantern Direct — iOS

Application native SwiftUI pour contrôler directement en Bluetooth les LED utilisant le protocole de **Magic Lantern 6.11.10** (`wl.smartled.rgb`). Pas de compte, de serveur ni de connexion Internet dans l’application. Projet de développement indépendant, sans reprise de l’interface ou de la marque de l’application originale.

## État de la livraison

- Projet Xcode complet : `LanternDirect.xcodeproj`, schéma partagé `LanternDirect`.
- Recherche de contrôleurs MELK et vérification du service FFF0 / caractéristique FFF3 avant activation des commandes.
- Marche/arrêt, RGB, luminosité, vitesse, **241 entrées d’effets/scènes** extraites des ressources de l’APK, dans neuf familles. Le catalogue ne garantit pas que chaque modèle accepte tous les effets.
- Mode musical : commandes du microphone du contrôleur, si équipé ; ou modulation des RGB par le microphone de l’iPhone, dix fois par seconde. Le traitement audio de l’iPhone est une implémentation nouvelle, pas une copie de l’algorithme Android. Il mesure les sons ambiants, pas le flux audio système. Aucun fichier audio n’est enregistré.
- Envois séquentiels, remplacement des valeurs de curseur encore en attente, contrôle de capacité, gestion des erreurs et expiration des connexions/accusés de réception. Aucun réglage de câblage ou de nombre de pixels n’est modifié.
- **25 tests XCTest passés** sur le protocole et sa file d’attente, compilés avec Swift 6.2.1 sous Linux. Syntaxe des fichiers de l’app vérifiée. Structure du projet contrôlée.
- **App iOS complète non compilée ni exécutée ici** : ce cloud Linux ne possède pas Xcode ni les SDK iOS. Le Bluetooth physique, les permissions iOS et le microphone doivent être validés sur un iPhone. Aucun `.ipa` signé n’est fourni.

## Installer sur un iPhone avec un Mac

1. Décompresser l’archive et ouvrir `LanternDirect.xcodeproj` avec **Xcode 16 ou plus récent**.
2. Dans la cible `LanternDirect` → **Signing & Capabilities**, sélectionner votre équipe Apple. Modifier `com.example.lanterndirect` en un identifiant unique. Faire de même pour `LanternDirectTests` si vous lancez les tests Xcode.
3. Brancher un iPhone sous **iOS 17 ou plus récent**, l’autoriser et activer le mode développeur si iOS le demande. Un compte Apple personnel peut servir à installer une app de développement sur son propre appareil, selon les conditions d’Apple ; ses installations doivent être renouvelées périodiquement.
4. Choisir le schéma `LanternDirect`, l’iPhone comme destination et lancer **Run**. Autoriser le Bluetooth. Le microphone n’est demandé que lorsque vous activez le mode correspondant.
5. Alimenter les LED, fermer Magic Lantern sur l’autre téléphone pour libérer la connexion, puis choisir **Rechercher mes LED** et toucher le contrôleur, souvent nommé `MELK-…`.
6. Tester **Allumer**, une couleur et une luminosité. Tester les effets et le mode musical seulement après les commandes de base.

Le simulateur permet de contrôler l’interface et de lancer les tests, mais ne valide pas la liaison Bluetooth avec les LED. Un Mac est nécessaire pour la compilation iOS ; l’APK ne peut pas être converti en application iPhone installable directement.

## Sans Mac : compiler avec GitHub Actions

Le dossier `.github/workflows/ios-build.yml`, à la racine de la livraison, prépare une compilation sur un runner macOS de GitHub. Il exécute les tests du protocole, les tests iOS dans un simulateur, puis construit l’app pour iPhone et prépare `LanternDirect-unsigned.ipa`. Il utilise les actions officielles GitHub épinglées à leurs commits. Aucun secret Apple n’est nécessaire pour cette compilation non signée.

**Ce workflow n’a pas encore été publié ou exécuté.** Il faudra publier les dossiers `ios/` et `.github/` dans votre dépôt, puis récupérer l’artifact dans l’onglet Actions lorsque la compilation réussit. Les journaux permettront de corriger une éventuelle erreur de compilation des frameworks iOS qui ne peut pas être détectée sous Linux. Selon la visibilité du dépôt et votre offre GitHub, les runners macOS peuvent consommer des minutes facturables ; ne pas supposer qu’ils sont gratuits.

Un IPA non signé ne s’installe pas en le touchant sur l’iPhone. Depuis Windows, un outil de chargement tel que **Sideloadly** peut le signer et l’installer avec votre compte Apple, selon les conditions Apple et celles de l’outil. Saisir les identifiants uniquement dans l’outil choisi sur votre poste, jamais dans le chat ni dans le workflow. Les limitations et renouvellements dépendent de votre mode de signature. Cette chaîne d’installation n’a pas été testée dans le cloud.

Pour archiver une application distribuable, utiliser **Product → Archive** sur le Mac et configurer la signature/distribution Apple adaptée. L’archive de sources ici n’est pas un fichier d’installation iOS. Le projet ne contient pas encore d’icône App Store ou de configuration de distribution.

## Vérifications sur Mac

Depuis ce dossier :

```sh
swift test
xcodebuild -list -project LanternDirect.xcodeproj
xcodebuild -project LanternDirect.xcodeproj -scheme LanternDirect \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO build
```

Pour les tests Xcode, sélectionner un simulateur installé dans Xcode et utiliser **Product → Test**. Le schéma inclut les 25 tests. Les commandes Xcode ci-dessus sont fournies pour le Mac et n’ont pas été exécutées dans le cloud Linux.

`Package.swift` compile uniquement les fichiers portables `LanternProtocol.swift` et `WriteQueue.swift`. Un succès de `swift test` ne prouve donc pas que SwiftUI, CoreBluetooth et AVFoundation ont été compilés pour iOS.

## Utilisation et limites

- Une connexion vérifie les UUID requis et les propriétés d’écriture, sans envoyer de commande automatiquement.
- Les valeurs affichées sont les réglages demandés, pas une lecture de l’état du contrôleur. Un accusé de réception GATT confirme une écriture, pas le rendu lumineux.
- Les écritures avec réponse sont préférées lorsque disponibles ; le mode sans réponse suit la disponibilité signalée par CoreBluetooth. En cas d’expiration ou d’erreur, la connexion est arrêtée et les commandes en attente sont effacées ; elles ne sont pas rejouées après reconnexion.
- Fermer le mode musical et appliquer une couleur fixe pour sortir du streaming. Le microphone de l’iPhone s’arrête lorsque l’app n’est plus active. Il faut garder l’app ouverte pour ce mode musical. Le microphone du contrôleur, lorsqu’il existe, traite le son dans le contrôleur.
- Ne pas utiliser simultanément deux téléphones pour commander le même contrôleur. Après une déconnexion, lancer une recherche si la reconnexion du dernier appareil échoue.
- Si le contrôleur n’apparaît pas, l’option **Afficher tous les appareils Bluetooth** élargit la recherche ; l’app vérifie toujours les UUID avant d’autoriser les commandes.

## Application Maison : contrainte matérielle

Cette livraison fournit une **app iOS directe**, pas un accessoire Maison. Le protocole BLE propriétaire FFF0/FFF3 de l’APK n’établit aucune compatibilité HomeKit ou Matter. Une application iPhone ne transforme pas ce protocole en accessoire HomeKit.

Pour une connexion **directe à Maison sans passerelle**, le contrôleur lui-même doit être compatible HomeKit/Matter. Votre lien produit et la décompilation de l’application ne prouvent pas que ce contrôleur le soit. Il faut une preuve de compatibilité du modèle, ou remplacer le contrôleur par un modèle compatible adapté aux LED RGBIC. Sans cette compatibilité et sans passerelle, l’objectif Maison ne peut pas être réalisé par le seul portage de l’app.

Le projet n’ajoute pas de faux accessoire HomeKit et ne demande pas d’accès à votre domicile.

## Provenance

Voir `PROTOCOL.md`. L’APK fourni a été identifié par Androguard et analysé avec les outils REA 6.4.0 du ZIP utilisateur et le moteur JADX headless MCP 0.7.1 dont le SHA-256 a été vérifié. Les fichiers décompilés restent dans le dossier d’analyse du cloud ; l’APK n’est pas inclus dans cette livraison. Aucune connexion au serveur du fournisseur et aucune exécution de l’APK n’ont été nécessaires.
