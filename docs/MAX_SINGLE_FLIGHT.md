# MAX : une mission courante, une file passive

Une mission conserve le slot de son premier traitement jusqu’à la livraison vérifiée. `WAITING_TEACHER`, `TEACHER_APPROVED`, `READY_FOR_REVIEW` et `COMMITTED` sont des étapes de cette mission, pas des autorisations pour avancer une autre mission en attente.

Le sélecteur `singleFlightAutonomyMission()` est commun à l’ordonnanceur, aux continuations ciblées PC/cloud, aux envois et approbations Teacher et au panneau d’activité. Le Bridge vérifie son équivalent SQL dans l’UPDATE atomique. Les réparations `error-ledger` passent par l’admission même sans `roadmap_id`.

Les missions historiques en surnombre restent conservées. Une seule avance ; la suivante devient admissible quand la précédente libère son slot. Une attente de dépendance ou un épuisement fournisseur reconnu par la politique existante peut libérer le slot sans fabriquer une réussite. Les demandes explicites owner-chat conservent leur priorité existante.

La file conserve les missions annulées dans l’historique et ne les relance pas. Toutes les lectures actives utilisées par une reprise filtrent la même époque propriétaire après « Vider la liste ». La récupération passive utilise CAS et ne déclare pas récupérée une mission annulée pendant l’opération.

Le panneau affiche une mission « en cours » pendant son cycle, même si elle attend Teacher ou CI. Son statut détaille cette attente ; le compteur ne signifie pas qu’un modèle tourne en permanence. Une ligne `QUEUED` seule ne prouve pas un démarrage. Les entrées terminales ne sont pas comptées en attente.

Les PR #2811, #2814 et #2816 sont réunies avec leurs historiques pour valider les dépendances, les annulations et les accès concurrents ensemble. Les régressions mémoire/SQLite et la suite complète précèdent toute promotion. Cette documentation ne certifie ni une exécution physique PC ni la production.
