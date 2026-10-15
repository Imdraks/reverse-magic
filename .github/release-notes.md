Lantern Bridge se concentre désormais sur **l’éclairage uniquement** : ampoules, rubans, luminaires et contrôleurs/dimmers.

- **Éclairages LSC Smart Connect / Tuya LAN** : nouveaux profils RGB+CCT, blancs réglables, RGB seul et dimmer. Les fonctions Maison dépendent du profil ; pas de couleur fictive sur une lampe blanche.
- **Diagnostic local en lecture seule** : `gateway probe` affiche les numéros/types de DP et des profils candidats, sans clé, identifiant ni valeurs et sans appliquer automatiquement une configuration.
- **Contrôle local** : Tuya 3.1, 3.3, 3.4 et 3.5 via TuyAPI 7.7.1 verrouillé ; clés individuelles par variables d’environnement, aucune récupération de compte LSC depuis l’APK.
- **État réel** : lecture au démarrage/reconnexion, écritures relues avant validation, sérialisation par appareil. Les workers sont arrêtés à expiration, sans commande tardive.
- Magic Lantern et les relais Shelly utilisés pour l’éclairage sont conservés, ainsi que leurs identités Maison. Aucun module de prises généralistes ou de capteurs n’est livré.

**À configurer sur votre PC/Pi** : IP, identifiant, clé locale, version et profil DP de chaque éclairage. Voir `docs/LSC.md` dans les paquets. La référence Action 3208075 fournie reste à essayer sur matériel : ni l’APK ni les tests n’établissent son schéma exact. La compatibilité de tous les éclairages LSC reste un objectif ; les transports BLE/Zigbee et produits cloud seul ne sont pas intégrés à ce driver LAN.

Analyse documentée de l’APK LSC 2.0.7 et deux méthodes DP décompilées ; aucune APK, clé ou source propriétaire complète dans les fichiers publics. Tests contre des émulateurs TCP indépendants avec chiffrement/négociation Tuya et un vrai client HomeKit ; tests GUI, paquets Linux x64/ARM64 et installateur Windows. Le rendu sur appareils physiques reste à confirmer.
