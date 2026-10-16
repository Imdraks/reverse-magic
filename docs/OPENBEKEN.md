# Éclairages OpenBeken

L’adaptateur `openbeken-light` pilote un éclairage déjà configuré sous OpenBeken par HTTP local, depuis Windows ou Linux/Pi. Il n’utilise ni compte LSC, ni clé Tuya, ni broker MQTT. Le pont Lantern reste nécessaire pour Maison. Pour préparer un remplacement du firmware LSC avec Windows et Android, voir [le parcours de conversion](CONVERSION-LSC.md).

## Interface graphique

Maison désactivé, choisir **Ajouter un éclairage → OpenBeken — éclairage local**. Renseigner une IPv4 locale HTTP et choisir `dimmer` (luminosité) ou `cct` (luminosité et blanc réglable). Le compte web est `admin` ; son mot de passe est facultatif si le firmware n’en a pas. Lantern utilise un en-tête Basic, jamais un mot de passe dans l’URL. Le mot de passe est conservé dans le stockage privé du pont et ses sauvegardes chiffrées, sans apparaître dans l’état, les cartes ou le journal. HTTP ne chiffre pas le transport : conserver ce service sur le réseau local.

Le test lit `Status 2` et exige `StatusFWR.SDK = obk`, puis lit `Status 11`. L’API JSON compatible Tasmota doit être activée dans le firmware. Pour `cct`, les champs `POWER`, `Dimmer` et `CT` doivent être présents et valides ; pour `dimmer`, `CT` n’est pas requis. Une adresse IP et un test réussi ne valident pas les connexions physiques du pilote LED.

La carte propose marche/arrêt, luminosité et le réglage du blanc en mireds si disponible. Les commandes sont sérialisées par appareil, limitées à quatre opérations HTTP simultanées, avec un délai global de 12 secondes et de 2 secondes par requête. Une commande n’est confirmée qu’après relecture de l’état. Aucune redirection HTTP n’est suivie.

## Terminal

Ajouter cette entrée dans le tableau `devices` du fichier du pont :

```json
{
  "id": "filament-salon",
  "name": "Filament salon",
  "adapter": "openbeken-light",
  "options": {
    "host": "http://192.168.1.40",
    "profile": "cct",
    "passwordEnv": "OPENBEKEN_SALON_PASSWORD"
  }
}
```

L’IP est un exemple. Omettre `passwordEnv` si aucun mot de passe n’est configuré ; sinon définir la variable dans l’environnement privé du processus. Les URL avec identifiants, chemin ou adresse publique et les noms de domaine ne sont pas acceptés. Le port HTTP peut être explicite. Aucun mot de passe en clair n’est accepté dans `bridge.json`.

## État et conversion

L’ouverture et l’arrêt du pont sont passifs. Les profils du pont sont mémorisés après lecture initiale ou commande confirmée ; une reconnexion ne remplace pas une consigne déjà conservée. Une luminosité à zéro éteint sans effacer le niveau précédent. Avant un changement de réglage devant conserver une lampe éteinte, le pilote lit `/api/info` et refuse si le flag 23 d’OpenBeken provoquerait un rallumage. Il ne modifie aucun flag lui-même.

**Reprendre après conversion**, sur une carte LSC, permet de remplacer le protocole en conservant identifiant, nom et pièce. La lecture OpenBeken doit réussir avant l’enregistrement. L’UUID HomeKit de l’accessoire reste fondé sur les mêmes identifiants ; les caractéristiques disponibles peuvent évoluer, donc vérifier les automatismes. Les clés Tuya inutilisées sont retirées du fichier de projet courant. Une sauvegarde antérieure peut restaurer l’ancien projet, mais ne remet pas l’ancien firmware dans l’ampoule.

La mémoire autonome après coupure relève du firmware, notamment de son flag 12 dans la version examinée. Elle doit être configurée et vérifiée sur le matériel. Cet adaptateur ne flashe rien, ne configure ni broches ni pilotes, et ne prend pas en charge RGB, effets, prises ou capteurs.

## Sources et niveau de validation

Implémentation confrontée au commit OpenBeken [6a8d05f942622e030b21d3452a0524a9d6be73f9](https://github.com/openshwprojects/OpenBK7231T_App/tree/6a8d05f942622e030b21d3452a0524a9d6be73f9) : `src/httpserver/json_interface.c` pour `Status 2/11`, `src/httpserver/http_basic_auth.c` pour le compte admin et Basic, `src/cmnds/cmd_newLEDDriver.c` pour `Dimmer`, `CT` et les effets de bord, `src/new_pins.h` pour les flags 12 et 23.

Les tests utilisent de vrais échanges HTTP avec un émulateur indépendant, un client HomeKit chiffré conservant son appairage après migration, et Chromium pour le parcours graphique. Aucun firmware n’a été installé ni testé sur une ampoule physique dans l’environnement cloud. Le modèle 970709 en 1.1.6 reste une variante matérielle à confirmer.
