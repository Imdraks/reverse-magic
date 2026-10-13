# Lantern Direct — Windows

Client natif Windows du protocole BLE Magic Lantern 6.11.10. Version Windows x64, **Windows 10 version 2004 ou ultérieure / Windows 11**, avec adaptateur Bluetooth LE fonctionnel. Exécutable autonome .NET 10 ; aucun runtime .NET séparé n’est nécessaire. Pas de serveur, compte ou connexion Internet dans l’application.

## Utiliser

1. Ouvrir `LanternDirect.exe` sur le PC Windows.
2. Alimenter les LED, activer le Bluetooth et fermer l’app Android pour libérer la connexion.
3. Cliquer sur **Rechercher**, choisir le contrôleur, souvent `MELK-…`, puis **Connecter le contrôleur sélectionné**.
4. Tester Allumer, une couleur puis la luminosité. Les boutons **Appliquer** évitent d’envoyer une rafale de commandes pendant le déplacement des curseurs.
5. Choisir un effet RGBIC et le lancer. Les 241 effets/scènes proviennent du catalogue de l’APK ; certains dépendent du modèle.
6. Le mode musical commande le **microphone du contrôleur**, s’il existe. Cette version Windows ne capte pas le microphone ou le son système du PC.

L’application vérifie le service FFF0 et la caractéristique FFF3. Elle sérialise les écritures, préfère une écriture GATT avec réponse et annule la session après une erreur ou une expiration. Aucun changement du câblage ou du nombre de LED n’est effectué. La dernière adresse est conservée uniquement dans un fichier local sous `%LOCALAPPDATA%/LanternDirect/`.

Les valeurs affichées sont les réglages demandés, pas une lecture de l’état réel. Cette app BLE ne fournit pas de compatibilité Maison/HomeKit/Matter.

## Validation et compilation

Compilation Release Windows x64 réussie depuis Linux avec le SDK officiel .NET 10.0.401, après contrôle SHA-512 du téléchargement. Les 23 vérifications du protocole passent. Les APIs Windows, l’interface et la liaison radio ne sont pas exécutables dans ce cloud Linux : un essai sur votre PC et vos LED reste nécessaire. L’exécutable n’est pas signé avec un certificat de distribution Windows.

Depuis la racine des sources avec le SDK .NET 10 :

```sh
dotnet run --project windows-tests/ProtocolChecks.csproj
dotnet publish windows/LanternDirect.csproj -c Release -r win-x64 -o output/windows
```

Le projet active le ciblage Windows pour permettre la compilation croisée. Les dépendances Microsoft Windows et WinRT sont restaurées depuis NuGet. Le format des trames et leur provenance sont décrits dans `../ios/PROTOCOL.md`.
