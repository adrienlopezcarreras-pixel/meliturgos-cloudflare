# Release ShardVault : contrat de durée du client HTTP

## Incident observé

Run 40112125333, SHA4a5c8006 : sauvegarde adaptative, déploiement exact et vérification immédiate réussis, puis échec de release-autonomy-deep-proof.sh ligne84 (`test "$SHARD_READY" = "1"`). Les lignes fournies par le propriétaire montrent des appels sans réponse HTTP000 autour de90s et des réponses200 indiquant toujours4/7. La cause de rejet de chaque fournisseur n’est pas connue ; aucun cinquième endpoint n’est déclaré actif.

Contradiction démontrée dans le code : le client de recherche abandonnait à90s, tandis que `representativeDeadlineMs` autorise120s par défaut et jusqu’à150s pour une vraie qualification, avant certaines promotions. Le client pouvait donc couper une validation encore autorisée par son serveur. Cela explique une possibilité de faux timeout ; cela ne prouve pas que tous les HTTP000 ont cette cause ni qu’un cinquième fournisseur fonctionnera.

## Correction du contrat existant

La même requête, avec probe_limit=1 et découverte documentaire bornée, conserve les mêmes autorisations, validations cryptographiques et contrôles de durabilité. Le client peut maintenant attendre240s. La somme des attentes reste bornée par le budget historique17×90s=1530s ; aucune nouvelle mutation n’est commencée s’il ne reste pas son allocation complète. Au plus17 tentatives, rotation conservée. Le délai global de l’étape n’est pas augmenté. Pas de boucle de reprise parallèle ni de retry supplémentaire ajouté à la boucle existante.

Le quorum reste5/7. Quatre endpoints, même avec un transport parfaitement disponible, doivent toujours échouer. Les erreurs HTTP et l’épuisement du temps ne constituent pas une preuve d’activation. Aucun changement de Council, MAX, D1, verrou, fournisseur, sauvegarde ni facturation.

## Régression exécutable

`tests/shardvault-release-request-budget.test.mjs` exécute la vraie phase shell avec transport et horloge contrôlés : qualification150s reçue ; quatre endpoints refusés ; réponses absentes incapables de prolonger le budget total ou de déclencher une mutation avec une allocation incomplète ; cinquième reçu accepté seulement après sa réception effective. Aucun appel réseau, temps d’attente réel ni provider de production simulé comme prouvé.

Ces tests échouent trois fois sur quatre sur le parent5759d851, puis passent tous avec le correctif. Les contrôles de non-quorum restent rouges dans le scénario applicatif attendu. Le workflow CI release-observability-smoke existant inclut désormais ce script et son test dans ses chemins et sa suite ; aucun nouveau workflow.

## Validation encore nécessaire

CI du HEAD exact, intégration dans la candidate canonique, puis une seule release autorisée avec sauvegarde, preuve live du cinquième endpoint et contrôle du SHA réellement publié. Vérifier ensuite l’état D1/MAX par la lecture autorisée ; ne pas relancer manuellement ni ignorer une pause propriétaire/sécurité. Si la production reste4/7, le blocage externe demeure et le correctif de délai ne doit pas être présenté comme une restauration de MAX.

XP MEL : NON — le contrat de délai englobant une opération et les règles de preuve existent déjà ; pas de leçon dupliquée.
