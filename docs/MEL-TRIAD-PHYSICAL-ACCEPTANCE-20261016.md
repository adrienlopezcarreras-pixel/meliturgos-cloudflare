# MEL MINI / APK Android / Companion Windows — plan de recette matérielle

Statut : **PROCÉDURE PROPOSÉE — aucune recette matérielle n'a été exécutée par ce document**.

Ce plan complète les tests logiciels CI. Il ne permet pas de déclarer `DONE_VERIFIED` avant d'avoir collecté une preuve sur les appareils physiques et de l'avoir rattachée aux SHA et versions effectivement testés.

## Sécurité et prérequis

- Ne pas flasher la MINI, installer un APK, modifier les paramètres persistants, effacer des données ou effectuer un reset dans le cadre de cette recette.
- Ne pas démarrer une procédure de mise à jour/rollback pour « tester » le plan.
- Conserver l'appairage existant. N'effacer aucune clé, aucun jeton ni les données Android/Windows.
- Exécuter les essais uniquement lorsque le propriétaire est présent et a donné son accord. Ne pas enregistrer de conversations privées; utiliser les phrases de test ci-dessous.
- Si un essai échoue, conserver le résultat et arrêter la séquence dépendante au lieu de réessayer indéfiniment.
- Masquer les identifiants, QR codes d'appairage, jetons, adresses privées et contenu de notification dans toutes les captures.
- Les tests déjà verts en émulateur ou en CI sont des preuves logicielles seulement. Ils ne prouvent pas le microphone, l'audibilité, le BLE radio ou le rollback sur la carte.

## Fiche de référence à remplir avant les essais

Relever sans modifier les appareils :
- SHA source exact du firmware candidat et version affichée par la MINI;
- version APK et code de version affichés dans l'application Android;
- version Companion Windows et état signalé par l'application;
- modèle exact de la MINI, modèle/version Android, version Windows;
- SHA et URLs des runs de CI verts correspondants;
- date/heure locale de l'essai et état initial affiché par chaque composant.

Ne pas déduire la version installée de la version présente dans `main` ou d'un artefact téléchargé.

## Recette 0 — appairage BLE authentifié contre MITM

**Cette recette est obligatoire avant le parcours vocal et n'a pas encore été réalisée.**

Le firmware candidat exige LE Secure Connections avec MITM et n'annonce la session
prête que si l'état BLE indique simultanément chiffrement, authentification et bond.
Pendant un nouvel appairage, la MINI affiche un passkey aléatoire à six chiffres;
Android doit présenter sa feuille système de saisie. Le propriétaire doit vérifier
le code affiché sur la vraie MINI et saisir le même code sur Android.

**Procédure non destructive**
1. Noter les versions et vérifier l'état initial. Ne pas toucher aux données MEL, NVS,
   tokens, à la configuration Wi-Fi ni à la flash.
2. Lors d'un appairage neuf déjà autorisé, vérifier que le code temporaire apparaît
   sur l'écran MINI et dans aucune sortie de log; vérifier que l'écran Android demande
   la saisie du code. Saisir le code affiché, uniquement si les deux côtés le présentent.
3. Vérifier que le bond est établi et que Link V2 n'affiche « prêt » qu'après le lien
   chiffré/authentifié et l'ACK `SESSION_OK`.
4. Si l'ancien bond est réutilisé sans demande de passkey, si le code est absent,
   si les codes divergent, si Android n'offre pas le champ de saisie ou si le lien
   est simplement chiffré sans authentification, arrêter. Ne pas lancer une boucle de
   reconnexion, ne pas supprimer des clés ou données à l'aveugle et ne pas flasher.
5. Toute migration d'un ancien bond Just Works doit être planifiée séparément avec le
   propriétaire présent : ne supprimer que l'appairage explicitement identifié, puis
   vérifier que la MINI peut également renouveler son bond mémorisé. Si les deux côtés
   ne peuvent pas être renouvelés sans toucher aux autres données, garder la recette
   en échec et concevoir une procédure de désappairage dédiée avant d'installer ce build.

**Preuve attendue**
- vidéo courte montrant le code temporaire sur la MINI et la demande système Android,
  sans filmer les tokens, notifications, compte ou conversation;
- logs expurgés prouvant `encrypted=true`, `authenticated=true`, `bonded=true`
  sans code de passkey, puis nouveau `SESSION_OK`;
- preuve négative d'un appairage refusé : aucun Link V2 « prêt », aucune session MEL,
  aucun audio ou credential envoyé avant succès.

**Statut initial : PREUVE MATÉRIELLE REQUISE — le code candidat n'est pas à installer avant cette recette.**

## Recette A — haut-parleur ES8311 réellement audible

**Procédure**
1. Alimenter normalement la MINI; ne pas démarrer de mode flash ou recovery.
2. Afficher la fonction locale de diagnostic « TEST MICRO + HP » si elle est disponible dans le firmware installé.
3. Lancer un seul test sonore selon le contrôle visible dans l'interface. Ne pas lancer de commandes de mise à jour.
4. Vérifier à l'oreille que le son vient du haut-parleur de la MINI et non du téléphone ou du PC.
5. Si aucun son ne sort, arrêter ce test et conserver le résultat négatif; ne pas faire de reset.

**Preuve attendue**
- courte vidéo non montée montrant la MINI, l'action lancée et le son clairement audible;
- version firmware visible ou notée, heure et résultat « audible / inaudible »;
- si un journal série est déjà accessible sans changement de configuration, joindre uniquement les lignes de diagnostic correspondantes, sans secrets.

**Statut initial : PREUVE MATÉRIELLE REQUISE.**

## Recette B — capture micro réelle et passage vers STT

**Procédure**
1. Dans l'APK, vérifier que la permission microphone est accordée par l'utilisateur et que l'état de capture est explicitement actif.
2. Avec une session BLE/MEL déjà établie, prononcer la phrase non sensible : « MEL, test microphone numéro un ».
3. Vérifier qu'une capture a réellement été produite et que le texte reconnu correspond à la phrase parlée.
4. Arrêter si l'application montre seulement un indicateur d'écoute sans preuve de capture ou si aucun résultat STT n'est produit.

**Preuve attendue**
- capture d'écran de l'état de capture puis du résultat STT, expurgée des informations privées;
- résultat diagnostique indiquant durée et fréquence d'entrée/STT si l'application les expose;
- une courte note indiquant si la reconnaissance correspond à la phrase prononcée. Aucun enregistrement vocal privé n'est requis.

**Statut initial : PREUVE MATÉRIELLE REQUISE.**

## Recette C — transfert BLE soutenu et contrôle de flux

**Prérequis** : les recettes A et B sont terminées sans défaut et l'APK indique une session MINI Link V2 prête, avec appairage bondé/chiffré et `SESSION_OK` confirmé.

**Procédure**
1. Depuis l'usage normal de l'APK, faire synthétiser une phrase de test non sensible vers la MINI.
2. Faire un seul transfert vocal de 30 à 60 secondes au maximum, sans lancer d'autre travail audio en parallèle.
3. Observer le résultat final, les crédits/acquittements si exposés, et les états d'erreur.
4. Appuyer sur STOP VOIX une fois pendant une autre synthèse contrôlée, puis vérifier l'arrêt. Ne pas assimiler STOP VOIX à un reset de l'appareil.
5. Arrêter si la séquence reste bloquée, si l'APK et la MINI divergent sur l'état de session, ou si les logs montrent des pertes/erreurs répétées.

**Preuve attendue**
- vidéo courte montrant le début, l'état final et un son représentatif; éviter de filmer des notifications ou informations privées;
- journal expurgé avec versions, durée, taille totale transférée, séquences/credits si journalisés, résultat final et tout code d'erreur;
- preuve distincte que STOP VOIX a arrêté l'audio avant la fin.

**Statut initial : PREUVE MATÉRIELLE REQUISE.**

## Recette D — reconnexion sans réinitialisation

**Prérequis** : une connexion Link V2 déjà prouvée par `SESSION_OK`.

**Procédure**
1. Noter les états BLE, Android et MINI.
2. Interrompre temporairement la proximité radio en éloignant le téléphone de la MINI, sans supprimer l'appairage ni toucher aux données de l'application.
3. Revenir à proximité et observer la tentative de reconnexion.
4. Confirmer que l'application n'affiche pas « vérifié/prêt » avant une nouvelle session chiffrée et un nouvel ACK `SESSION_OK`.
5. Effectuer au maximum trois essais; arrêter dès qu'un échec reproductible survient.

**Preuve attendue**
- écran ou journal horodaté avec déconnexion, reconnexion, nouvel établissement GATT et nouvel ACK de session;
- vérification que l'état retombe à indisponible/dégradé pendant la coupure et n'est pas simplement conservé par cache;
- aucune vidéo contenant de données de compte ou de QR d'appairage.

**Statut initial : PREUVE MATÉRIELLE REQUISE.**

## Recette E — parcours vocal complet

**Prérequis** : A, B, C et D réussies.

**Procédure**
1. Démarrer depuis une session authentifiée et Link V2 confirmée.
2. Prononcer : « MEL, réponds simplement : combien font deux plus trois ? »
3. Vérifier le STT, la transmission à MEL Core, l'apparition d'une réponse cohérente, le TTS français sur Android et le son émis par le haut-parleur de la MINI.
4. Vérifier que l'interface distingue capture, traitement, réponse, transmission audio et fin réelle; une animation seule n'est pas une preuve.
5. Interrompre au besoin avec STOP VOIX et vérifier que la lecture cesse réellement.

**Preuve attendue**
- vidéo continue courte cadrant la MINI et le téléphone, avec l'audio audible; pas d'informations personnelles à l'écran;
- logs corrélés par un identifiant de session non secret et par horodatages, avec résultats STT, backend, TTS et lecture;
- checklist de chaque étape : réussi/échoué/non observable.

**Statut initial : PREUVE MATÉRIELLE REQUISE.**

## Recette F — Companion Windows et autorisation

**Procédure**
1. Ouvrir le Companion normalement et noter la version, l'état du processus, le dernier heartbeat, l'état connecté et l'état d'autorisation.
2. Exécuter uniquement un diagnostic explicitement en lecture seule déjà disponible dans l'interface (état système ou inventaire non sensible).
3. Vérifier que « connecté », « service disponible », « action exécutée » et « preuve vérifiée » ne sont pas confondus.
4. Observer l'affichage après une veille/reprise normale du PC ou une coupure réseau non destructive, si elle peut être faite sans interrompre un travail important.
5. Ne pas tester les actions d'écriture, de flash, d'installation ou d'arrêt distant pendant cette recette.

**Preuve attendue**
- capture de l'interface montrant version et états différenciés;
- journal expurgé avec l'identifiant de la tâche, nom de l'action en lecture seule, code final et source de preuve;
- si déconnexion testée, chronologie de la dégradation et du retour en ligne.

**Statut initial : PREUVE MATÉRIELLE REQUISE.**

## Recette G — mise à jour et rollback

Aucune mise à jour ni aucun rollback n'est exécuté dans ce lot.

Avant toute future opération d'écriture, suivre intégralement `docs/mini-firmware-safe-update-rollback.md`: artefact candidat exact-SHA, empreintes SHA-256, sauvegarde hors appareil des partitions/NVS nécessaires, présence physique du propriétaire et autorisation explicite. La partition `ota_0/ota_1` ne prouve pas un retour automatique. Tant qu'une validation matérielle dédiée n'est pas réalisée, le rollback automatique reste **non vérifié**.

**Statut initial : NON TESTÉ — ACTION DE MISE À JOUR INTERDITE PAR CE PLAN.**

## Règles de clôture

- Pour chaque preuve, conserver l'URL du run de CI pertinent, le SHA de chaque source, la version exacte testée et le résultat.
- Une capture d'écran seule ne prouve pas le son; un log logiciel seul ne prouve pas la capture physique; un workflow vert ne prouve pas une interaction radio.
- En cas de contradiction entre écran, log et comportement réel, considérer la recette échouée et conserver les éléments contradictoires.
- Ne déclarer le lot `DONE_VERIFIED` que lorsque toutes les preuves matérielles requises ont été examinées et acceptées. Les étapes encore non exécutées restent explicitement « preuve matérielle requise ».
