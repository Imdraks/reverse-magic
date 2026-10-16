# Retrouver les éclairages et choisir un profil

## Une adresse IP a changé

Dans **Le pont**, désactiver Maison, puis choisir **Retrouver les adresses LSC**. Le pont écoute les annonces locales pendant huit secondes ; il ne balaie pas les plages IP, ne réinitialise pas les ampoules et n’envoie aucune commande lumineuse. Il ne récupère pas les clés locales et ne configure pas le Wi-Fi initial de l’ampoule.

Seuls les appareils LSC/Tuya déjà enregistrés avec leur identifiant et leur clé sont concernés. Une annonce doit correspondre à l’identifiant connu, à la version du protocole enregistrée et à une IPv4 locale. Plusieurs annonces contradictoires pour un identifiant entraînent un refus, pas le choix du dernier paquet reçu.

Avant tout changement, Lantern vérifie l’ancienne adresse : si l’éclairage y répond encore, elle est conservée. Sinon, une lecture à la nouvelle adresse doit réussir avec la clé locale et le profil existant. La correction automatique est limitée à Tuya **3.4 et 3.5**, qui vérifient une session authentifiée. Une annonce seule n’identifie pas une ampoule. Les protocoles 3.1/3.3, un changement de version, une clé incorrecte, un profil incompatible ou un conflit de cible nécessitent une intervention manuelle.

La recherche manuelle examine au maximum huit nouvelles adresses par passage, pour garder un délai borné. Relancer si le rapport indique des appareils restants. Avant chaque activation de Maison, y compris en service, une recherche automatique peut corriger **une** adresse candidate ; les autres seront examinées lors d’une prochaine activation ou d’une recherche manuelle. La correction ne tourne pas pendant que Maison est actif et ne contourne pas son verrouillage.

Seule l’IP est modifiée. Le nom, la pièce, l’identifiant d’accessoire Maison, les clés et le profil mémorisé sont conservés. La lecture de vérification ne remplace pas le profil lumineux. Si les sauvegardes automatiques sont configurées, le projet est sauvegardé avant la recherche. Une panne de découverte conserve les adresses actuelles et n’empêche pas le pont d’essayer de les utiliser. Une réservation DHCP sur le routeur reste recommandée pour éviter les changements récurrents.

Shelly et OpenBeken ne sont pas déplacés automatiquement : aucune identité matérielle stable vérifiée n’est encore utilisée pour leur redécouverte. Leur IP peut être corrigée manuellement, Maison désactivé.

## Catalogue de modèles et de profils

**Le pont → Modèles et profils** reste consultable avec Maison actif. La configuration d’un nouvel éclairage depuis ce catalogue exige de le désactiver.

Trois niveaux sont distingués :

- **Variante documentée** : une source décrit une révision et des fonctions ; cela ne valide pas tous les exemplaires vendus sous la même référence.
- **Profil testé sur simulateur** : les échanges et le comportement logiciel sont vérifiés automatiquement, sans certification du produit physique.
- **Validation physique** : nécessite un essai réel documenté du modèle et de sa révision. Le catalogue ne revendique actuellement **aucun modèle physiquement validé**.

Les références initiales sont **LSC 970709 / 3001686**, avec une variante publiée en 2.9.6 et un profil blanc candidat, et **Action 3208075**, dont le schéma DP reste inconnu. La variante 970709 en 1.1.6 n’est pas certifiée par cette source. Le catalogue ne sélectionne ni exploit ni firmware.

**Configurer cet éclairage** ouvre le formulaire avec le protocole et, s’il existe, un profil candidat. L’identifiant et la clé doivent toujours être fournis. Inspecter les DP et tester la connexion avant l’enregistrement ; une réponse réseau valide ne certifie pas la plage physique du blanc, la fidélité des couleurs ou les effets propriétaires. Aucun appareil ni réglage n’est appliqué par la seule consultation du catalogue.
