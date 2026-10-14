# Etats de connexion communs MEL

Ce contrat est descriptif et ne déclenche aucune commande.

| Appareil | Connecté | Vérifié | Dégradé |
| --- | --- | --- | --- |
| MINI | BLE GATT établi | SESSION_OK reçu et vérifié après session chiffrée | Liaison interrompue ou session expirée |
| Android | application lancée | session MEL authentifiée et permission micro valide | permission retirée ou réseau absent |
| Companion Windows | processus joignable | appareil autorisé et canal local approuvé | HALT actif ou canal interrompu |

Une réponse de transport ne démontre pas l'exécution d'une action. Les trois interfaces doivent distinguer « reçu », « en cours », « terminé », « refusé » et « échoué ».

Le réveil vocal écran verrouillé reste un objectif distinct, non prouvé par les tests en émulateur. Aucun lancement silencieux ou accès microphone sans consentement n'est présumé.

La synchronisation de ces états dans les trois exécutables doit être réalisée par les équipes responsables des branches Android, MINI et Windows avant recette physique.
