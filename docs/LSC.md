# Éclairage LSC Smart Connect

Lantern Bridge se concentre sur les produits d’éclairage : ampoules, rubans, luminaires et contrôleurs/variateurs. Le module `lsc-tuya-light` pilote les appareils qui exposent l’API LAN Tuya, depuis Windows ou Linux/Raspberry Pi. Les commandes habituelles sont locales après configuration des clés. L’iPhone utilise Maison ; il n’a pas besoin de cette application Android.

L’objectif couvre la gamme d’éclairage LSC, avec des profils par famille de protocole plutôt qu’une liste fermée de références. **La compatibilité de toute la gamme n’est pas encore garantie.** Le firmware doit autoriser le contrôle Tuya local, et son schéma de fonctions doit correspondre au profil choisi. Les profils sont testés contre des appareils TCP simulés avec chiffrement et un vrai client HomeKit, pas sur chaque produit commercialisé.

## Ce que l’analyse a établi

L’APK fourni est `com.lscsmartconnection.smart`, version **2.0.7**, code 30. Il contient les SDK Tuya/ThingClips. La décompilation de `LightDpUtil.a` montre que les commandes sont construites en convertissant les codes de fonctions en identifiants de datapoints (DP) au moyen du schéma propre au produit. `LightDpUtil.b` sérialise ensuite ce mapping en JSON. Les numéros des DP et les fonctions disponibles ne sont donc pas universels pour la marque.

L’application comprend aussi des composants pour d’autres familles de produits ; ils ne sont pas intégrés ici. Le client Android n’embarque pas les clés locales de vos appareils, qui sont obtenues après association à votre compte. Nous ne copions pas de clé privée de l’application dans le pont.

Voir [l’étude et les sources](research/lsc-smart-connect.md). La référence Action **3208075** fournie par l’utilisateur reste à vérifier sur appareil : l’accès direct à sa fiche est bloqué dans l’environnement de recherche et l’APK ne fournit pas son schéma de DP. Aucun profil n’est présenté comme certifié pour cette référence.

## Préparer un appareil

Il faut connaître **son IP locale**, **son identifiant Tuya**, **sa clé locale de 16 octets**, **sa version de protocole** et **ses DP**. Réserver son IP dans le routeur évite de perdre la connexion après un changement DHCP. Protocoles acceptés : **3.1, 3.3, 3.4 et 3.5**. La version 3.2 n’est pas activée dans ce module. La version doit correspondre au firmware, elle ne se choisit pas arbitrairement. Tuya 3.1 chiffre les commandes, mais certains messages d’état sont en clair selon ce protocole ancien.

La procédure publique [TinyTuya — récupération de ses clés](https://github.com/jasonacox/tinytuya#setup-wizard---getting-local-keys) explique la liaison d’un projet Tuya et d’un compte propriétaire. L’application OEM LSC peut ne pas permettre cette liaison directement. Une réassociation à Smart Life/Tuya Smart n’est envisageable que si le modèle l’accepte ; elle peut changer la clé et les scènes existantes. Il n’y a pas de récupération automatique de compte LSC dans Lantern. Ne partagez jamais vos clés ou identifiants de compte dans le chat.

Définir l’identifiant de l’appareil et sa clé dans les variables **`LSC_SALON_ID`** et **`LSC_SALON_KEY`** de l’environnement du processus qui lance le pont. Les valeurs restent hors de `bridge.json`. Pour systemd, utiliser un fichier d’environnement privé via un override `EnvironmentFile=` ; pour Windows, les variables doivent être accessibles au compte de la tâche de session. Redémarrer le processus après un changement de variable. Ne pas enregistrer de clé dans un dépôt ou une capture d’écran.

## Inspecter les DP sans modifier la lumière

Cette commande ne nécessite pas de profil supposé à l’avance :

```sh
./lantern gateway probe --ip 192.168.1.30 --device-id-env LSC_SALON_ID --local-key-env LSC_SALON_KEY --version 3.3
```

Sous Windows, remplacer `./lantern gateway` par `node.exe gateway/cli.js`. Le port Tuya par défaut est TCP 6668 ; `--port` permet un autre port explicite. La commande affiche uniquement les numéros/types de DP et les longueurs des chaînes, sans identifiant, clé ou valeur des DP. Elle propose éventuellement des profils candidats. Ces suggestions ne prouvent ni les plages du firmware, ni les possibilités du modèle ; rien n’est appliqué automatiquement.

Pour un appareil déjà configuré : `./lantern gateway probe --config bridge.json --device lsc-salon`. Arrêter le pont et fermer les applications locales qui possèdent déjà la connexion avant le diagnostic : de nombreux firmwares Tuya n’acceptent qu’un client LAN.

## Choisir un profil d’éclairage

| Profil | DP par défaut | Fonctions dans Maison |
|---|---|---|
| `rgbcct-v1` | 1 On, 2 mode, 3 luminosité 25–255, 4 blanc 0–255, 5 RGB+HSV | Marche/arrêt, luminosité, couleur, blanc réglable |
| `rgbcct-v2` | 20 On, 21 mode, 22 luminosité 10–1000, 23 blanc 0–1000, 24 HSV | Marche/arrêt, luminosité, couleur, blanc réglable |
| `white-v1` | 1, 2, 3, 4 | Marche/arrêt, luminosité, blanc réglable |
| `white-v2` | 20, 21, 22, 23 | Marche/arrêt, luminosité, blanc réglable |
| `rgb-v1` | 1 On, 2 mode, 5 RGB+HSV | Marche/arrêt, luminosité dans la couleur, teinte/saturation |
| `rgb-v2` | 20 On, 21 mode, 24 HSV | Marche/arrêt, luminosité dans la couleur, teinte/saturation |
| `dimmer-v2` | 20 On, 22 luminosité 10–1000 | Marche/arrêt et luminosité |

Le profil est à choisir d’après le schéma de l’appareil. `rgbcct-v1` correspond notamment au format documenté pour une LSC A60 RGB-CCT par Tuya Local ; cela ne signifie pas que toutes les A60 ou la référence 3208075 ont ce firmware. Les plages de luminosité font partie du profil : changer seulement les numéros de DP ne change pas leur échelle.

Les blancs utilisent par défaut **2700–6500 K**. Renseigner `kelvinMin` et `kelvinMax` avec les bornes réelles du produit si elles diffèrent. Le pont les convertit vers les mireds HomeKit. Les profils blancs n’exposent pas de teinte/saturation, les RGB sans blanc réglable n’exposent pas de température, et un dimmer n’expose que la luminosité. Il n’y a pas de correction GRB sur LSC : celle-ci reste propre au contrôleur Magic Lantern historique.

## Ajouter l’éclairage au pont

Après avoir confirmé le profil, ajouter une entrée à `devices` dans `bridge.json` :

```json
{
  "id": "lsc-salon",
  "name": "Lumiere salon",
  "adapter": "lsc-tuya-light",
  "options": {
    "ip": "192.168.1.30",
    "deviceIdEnv": "LSC_SALON_ID",
    "localKeyEnv": "LSC_SALON_KEY",
    "version": "3.3",
    "profile": "rgbcct-v2",
    "kelvinMin": 2700,
    "kelvinMax": 6500
  }
}
```

Cet exemple contient une IP et un profil indicatifs, à remplacer après inspection. Pour un schéma qui conserve les mêmes formats mais d’autres numéros, ajouter par exemple `"dps": { "on": 1, "brightness": 2 }` à un profil `dimmer-v2`. Les DP doivent être distincts. `"mode": null` peut supprimer le DP de mode d’un profil si le produit n’en possède pas. Les autres fonctions absentes se gèrent en choisissant le profil adapté.

Vérifier la syntaxe puis démarrer comme dans [le guide du pont](GATEWAY.md). `check` ne contacte aucun appareil et ne valide pas les clés ; `probe` lit les DP ; `run` expose les caractéristiques dans Maison. Plusieurs lampes LSC peuvent rejoindre un pont déjà appairé, aux côtés de Magic Lantern et de relais Shelly utilisés pour l’éclairage.

## Comportement et limites

- Le pont lit l’état sans modifier la lumière au démarrage et après reconnexion. Il ne rejoue pas une ancienne consigne LSC.
- Les changements simultanés de couleur/luminosité sont regroupés. Une modification de blanc sélectionne le mode blanc, une modification de couleur sélectionne le mode couleur ; les simples commandes On/Off conservent le mode.
- La luminosité zéro éteint la lumière. Une écriture n’est validée qu’après relecture des DP commandés. Une erreur conserve l’état indisponible dans Maison.
- Les connexions à un même appareil sont sérialisées. Au maximum quatre workers LSC fonctionnent simultanément ; ils sont arrêtés à la fin de l’opération ou à son expiration, pour éviter les reprises tardives de commandes.
- Le changement d’une clé ou de firmware peut rendre le profil invalide : refaire le diagnostic. Un appareil indisponible ne bloque pas les autres éclairages.
- Les scènes, animations RGBIC par segment et synchronisations musicales ne sont pas des caractéristiques de la lampe HomeKit standard ; elles restent dans l’application ou le firmware du fabricant.
- Un éclairage Tuya BLE, Zigbee ou limité au cloud n’est pas pris en charge par ce driver LAN direct. Il faut une intégration du transport/passerelle approprié ; la présence de ces SDK dans l’APK ne suffit pas à promettre leur compatibilité.

Les caméras, alarmes, capteurs, prises généralistes, moteurs et thermostats sont hors périmètre du projet d’éclairage.
