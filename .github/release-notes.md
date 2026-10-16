Cette version facilite le retour des ampoules LSC/Tuya dont l’adresse IP a changé et ajoute un catalogue de modèles et de profils dans l’interface Windows/Linux.

- **Retrouver les adresses LSC**, Maison arrêté : écoute des annonces locales, rapprochement avec les identifiants enregistrés, vérification de l’ancienne adresse puis lecture authentifiée à la nouvelle adresse. Les annonces seules ne suffisent jamais. Correction automatique limitée à Tuya 3.4/3.5 ; aucune commande lumineuse.
- Avant chaque activation du pont, y compris en service, une recherche peut corriger une adresse candidate. La recherche manuelle examine au maximum huit candidats par passage. Aucun changement d’adresse pendant le fonctionnement de Maison. Les autres protocoles et pilotes nécessitent une correction manuelle.
- Les annonces contradictoires, versions différentes, clés invalides, IP publiques et conflits de cible sont refusés. Les noms, pièces, profils, clés et identités Maison restent inchangés. Une sauvegarde préalable est créée si les sauvegardes automatiques sont configurées.
- **Modèles et profils**, consultable avec Maison actif : sources et limites pour les références LSC 970709/3001686 et Action 3208075, et profils Tuya testés sur simulateur. La configuration exige Maison arrêté et ouvre un formulaire à compléter ; aucun appareil n’est ajouté automatiquement.

**Aucun modèle physique n’est revendiqué comme validé.** La variante 970709 en 1.1.6 reste à confirmer ; la fiche publiée en 2.9.6 ne certifie pas cet exemplaire. Les DP de la 3208075 restent inconnus. Aucun exploit ou flash n’est exécuté.

Les fonctions de la version précédente restent disponibles : sauvegardes automatiques chiffrées, diagnostic privé, reprise du pont, service utilisateur Linux/Pi et téléchargement des mises à jour avec vérification d’intégrité.

Validation : échanges TCP Tuya 3.4/3.5 avec simulateurs indépendants, refus de mauvaises clés et d’annonces ambiguës, absence de commandes lumineuses et maintien du profil mémorisé. Parcours Chromium du catalogue et des verrous Maison. Guides : `docs/MODELES-ET-ADRESSES.md` et `docs/FIABILITE-SECURITE.md`.

Arrêter Maison, sauvegarder et quitter Lantern avant installation.
