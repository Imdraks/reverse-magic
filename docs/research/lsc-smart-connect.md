# Étude de LSC Smart Connect — 15 octobre 2026

## Artefact et provenance

Les quatre fragments fournis `com.lscsmartconnection.smart.zip.001` à `.004` sont concaténés en un ZIP valide, vérifié par CRC. Il contient un APK de **278 269 673 octets** :

`SHA-256 7034c232c69695c6817113164c0ebf381a7d682dda0ba95ec9f9763434fdd618`

L’inspection statique REA/JADX identifie `com.lscsmartconnection.smart`, version **2.0.7**, code **30**, min SDK 24, cible 36, douze DEX et 68 649 classes. Le JAR JADX utilisé est la version 0.7.1, SHA-256 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`. L’application n’a pas été exécutée ni connectée à un compte.

Les inventaires et résultats complets restent hors du dépôt dans `/workspace/analysis/lsc/` : provenance des fragments, inspection du paquet, classes et deux méthodes décompilées. Aucun APK, code propriétaire complet, clé d’application ou secret utilisateur n’est inclus dans les sources ou paquets de Lantern Bridge.

## Observations dans l’APK

- Les classes et métadonnées de composants identifient Tuya/ThingClips, notamment `com.thingclips.sdk.device`, `com.thingclips.smart.sdk`, les modules d’éclairage, les schémas `SchemaBean`, ainsi que d’autres composants BLE/mesh/Matter/caméra.
- `com.thingclips.smart.light.scene.api.utils.LightDpUtil.a(Map, Map, boolean)` est décompilée entièrement en Java. Elle parcourt les schémas du produit, associe leur `code` à leur `id`, puis construit une table ordonnée de DP. Elle peut ordonner les fonctions de mode et d’allumage séparément.
- `LightDpUtil.b(Map, Map)` est également décompilée entièrement et sérialise la table de DP en JSON. Les méthodes sont obfusquées et comportent du bruit de protection ; le flux utile est identifiable, sans prétendre reconstruire toutes les branches du SDK.

**Déduction :** une intégration LSC doit connaître le schéma du produit ; le nom de marque ou l’APK ne fournit pas une table universelle d’ordres. La présence d’un SDK ne prouve pas que chaque référence LSC utilise ce transport. Les clés locales individuelles ne sont pas déductibles de cet APK non associé.

## Confrontation aux sources publiques

Sources consultées avant l’implémentation, puis utilisées pour les tests de protocole :

1. [TinyTuya — protocole LAN, clés locales et API des ampoules](https://github.com/jasonacox/tinytuya#readme) et [BulbDevice.py](https://github.com/jasonacox/tinytuya/blob/master/tinytuya/BulbDevice.py) : API locale de nombreux produits Tuya, version par appareil, variantes DP 1–5 et 20–24, couleurs RGB+HSV/HSV et plafonds 255/1000.
2. [TuyAPI 7.7.1](https://github.com/codetheweb/tuyapi), bibliothèque MIT épinglée par npm avec intégrité : protocoles LAN, négociation de session 3.4/3.5, chiffrement et lecture/écriture de plusieurs DP. Cette bibliothèque implémente le transport de production ; nous ne réimplémentons pas sa cryptographie.
3. [Tuya Local — profil LSC A60 RGB-CCT](https://github.com/make-all/tuya-local/blob/main/custom_components/tuya_local/devices/lscsmartconnect_rgbcct_bulb.yaml) : exemple matériel de DP 1–5, luminosité 25–255, blanc 0–255, couleur `rrggbbhhhhssvv`, plage 2700–6500 K. C’est un produit/firmware documenté, pas une preuve pour toute la gamme.
4. [LocalTuya](https://github.com/rospogrigio/localtuya) : contraintes des clés locales et connexions LAN, diversité des schémas.
5. [Documentation officielle de l’intégration Tuya Home Assistant](https://github.com/home-assistant/home-assistant.io/blob/current/source/_integrations/tuya.markdown) : l’intégration officielle utilise le cloud et les comptes Tuya Smart/Smart Life ; ce n’est pas une preuve que les comptes OEM LSC sont directement importables.

La [fiche Action de la référence 3208075](https://www.action.com/fr-fr/p/3208075/ampoules-led-connectees-lsc-smart-connect/) a été fournie par l’utilisateur. L’accès direct à ce site et au site LSC a renvoyé un refus réseau HTTP 403 depuis cet environnement. Leurs caractéristiques ne sont donc pas revendiquées comme vérifiées. La référence reste un appareil cible pour essai, pas une entrée certifiée dans le catalogue.

## Décision d’implémentation

Le périmètre demandé est exclusivement l’éclairage. Les modules expérimentaux de prises et de capteurs ont été retirés avant livraison. Le registre conserve Magic Lantern, Shelly Gen 1 pour commander un éclairage via relais, et ajoute `lsc-tuya-light` avec des profils de lampes/couleurs/blancs/dimmers configurables.

LSC utilise une lecture réelle des DP, sans extinction initiale ni restauration aveugle. Une écriture est relue avant validation. Les clés passent par variables d’environnement et un canal privé, jamais par le fichier de configuration. Un processus court par opération permet d’arrêter entièrement les reprises internes de la bibliothèque en cas de délai dépassé. Les opérations d’une même IP/port sont sérialisées et la concurrence globale est bornée.

### IV de Tuya 3.5

Le chiffrement GCM de TuyAPI 7.7.1 propose par défaut un IV dérivé de l’heure, qui peut se répéter lors de trames rapprochées. Le worker fournit un IV aléatoire de 96 bits à chaque chiffrement ordinaire, via l’option explicite déjà prise en charge par le chiffreur de cette version. Les IV explicites imposés par la dérivation de session restent inchangés. La bibliothèque est épinglée et les tests indépendants vérifient l’absence de répétition par clé ainsi que l’interopérabilité de la négociation et des commandes.

## Niveau de vérification

Les tests TCP utilisent un émulateur indépendant construit avec `node:crypto`, sans le parseur de TuyAPI : CRC, AES, HMAC, AES-GCM et négociation de session sont exercés réellement pour les versions 3.1, 3.3, 3.4 et 3.5. Les fixtures ne sont jamais envoyées aux produits réels. Un vrai client HomeKit chiffré vérifie ensuite les caractéristiques exposées, les écritures de couleur/blanc et l’isolation des pannes.

Ce travail vérifie le contrat de protocole et le pont, pas le firmware d’une référence commerciale. Restent à valider chez l’utilisateur : accès LAN du modèle, identifiant/clé locaux, version, schéma/plages de DP et rendu physique. La couverture de tous les éclairages LSC exige aussi les autres transports et les schémas qui seraient découverts lors des essais.
