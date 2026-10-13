# Protocole Magic Lantern 6.11.10

**Artefact analysé :** `wl.smartled.rgb.apk`, SHA-256 `7530ae09d5b849ed4f59e19994c36ebd639fe02304b21f74482ae46b60e387c0`.

**Source des trames :** méthodes privées de `com.easylink.colorful.service.BluetoothLEService`, décompilées avec JADX. Les méthodes publiques `com.easylink.colorful.utils.BluetoothUtil` renseignent les extras transmis au service. Les tableaux `modes_group0` à `modes_group8` et leurs tableaux `_command` donnent les IDs des effets. `ModeFragment.sendCMD` utilise la commande scène pour la famille 8.

**Transport :** Bluetooth LE GATT, service `0000fff0-0000-1000-8000-00805f9b34fb`, caractéristique `0000fff3-0000-1000-8000-00805f9b34fb`. L’APK filtre les noms commençant par `MELK-`. La nouvelle app accepte aussi les annonces du service FFF0 et permet une recherche élargie explicite.

Chaque trame fait exactement neuf octets, en hexadécimal ci-dessous. Aucun checksum n’est ajouté aux commandes étudiées. `FF` représente les constantes Java signées `-1`, `EF` la constante `-17`.

| Fonction | Trame | Méthode Android |
|---|---|---|
| Allumer | `7E 04 04 01 00 01 FF 00 EF` | `lightOn` |
| Éteindre | `7E 04 04 00 00 00 FF 00 EF` | `lightOn` |
| RGB fixe | `7E 07 05 03 RR GG BB 10 EF` | `changeColor` |
| RGB musical | `7E 07 05 03 RR GG BB 20 EF` | `music_amplitude` |
| Luminosité | `7E 04 01 PP CC FF FF 00 EF` | `changeBrightness` |
| Effet | `7E 05 03 ID 06 FF FF 00 EF` | `changeMode` |
| Scène | `7E 05 31 ID 07 FF FF 01 EF` | `changeScene` |
| Vitesse | `7E 04 02 PP FF FF FF 00 EF` | `changeModeSpeed` |
| Micro contrôleur | `7E 04 07 ON FF FF FF 00 EF` | `changeExternalMicOnOff` |
| Effet musical | `7E 07 03 (80+ID) 04 FF FF 00 EF` | `changeExternalMicEqMode` |
| Sensibilité | `7E 04 06 PP FF FF FF 00 EF` | `changeExternalMicSensitive` |

`RR/GG/BB` : 0–255. `PP` : 0–100, plage confirmée par les curseurs XML de l’APK. `CC` : `00` tous, `01` RGB, `02` blanc, `03` température, `FF` valeur par défaut de l’API simple Android. La nouvelle app utilise `FF`. `ON` : 0 ou 1. IDs musicaux : 0–7. IDs d’effets/scènes : octets, choisis dans le catalogue extrait. Ce sont des IDs de commande ; leur valeur ne suit pas nécessairement l’ordre affiché.

L’APK dispose aussi de commandes de température de blanc, configuration de pixels, ordre de câblage et horaires, non exposées par cette première app RGBIC. L’existence de ces fonctions dans une application multimatériel n’établit pas qu’elles sont disponibles sur votre contrôleur.

`music_amplitude` applique un traitement Android à la couleur avant émission. L’app iOS reproduit le **format de trame**, mais utilise son propre calcul d’enveloppe sonore pour moduler la couleur choisie. Cela ne prétend pas reproduire à l’identique tous les effets audio de l’application Android.

## Adaptation au contrôleur de l’utilisateur

Depuis la release v0.1.1, les clients iOS et Windows envoient les couleurs demandées dans l’ordre **GRB** (`GG RR BB`) : l’utilisateur a constaté que rouge et vert étaient inversés avec les trames RGB de la première version. Le bleu conserve sa position. Cette adaptation concerne également les trames musicales produites par le microphone de l’iPhone. La table ci-dessus décrit toujours les trames originales de l’APK, avant cette adaptation matérielle. L’application ne modifie pas la configuration persistante du contrôleur et ne remappe pas les effets générés par son firmware.

## Validation effectuée

Les 28 tests portables comparent des trames attendues issues des affectations du service Android, vérifient les limites d’entrée et exercent les invariants de la file d’attente. Le catalogue contient 241 entrées, dont 28 scènes ; noms et commandes ont été appariés après vérification de la longueur de chaque tableau. Les ressources de ce paquet de base sont en anglais, ce qui explique les noms d’effets anglais dans l’interface française.

L’analyse est statique. Elle ne constitue pas un test radio, une identification du firmware de votre modèle, ou une certification HomeKit/Matter. Aucun appareil LED n’est accessible dans ce cloud.
