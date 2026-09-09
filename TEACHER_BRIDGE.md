# MEL ↔ Professeur — Teacher Bridge

Canal de coordination gratuit entre MELITURGOS et ChatGPT via GitHub.

## Principe
- MEL écrit une demande structurée dans `teacher-bridge/requests.jsonl`.
- ChatGPT lit les nouvelles demandes et écrit les réponses dans `teacher-bridge/replies.jsonl`.
- MEL récupère la réponse portant le même `request_id` puis reprend son travail.
- Les déploiements production utilisent le même canal mais un type distinct `DEPLOYMENT_REQUEST` et une revue `DEPLOYMENT_REVIEW`.

## Format d'une demande MEL
```json
{"type":"MEL_REQUEST","request_id":"uuid","created_at":"ISO8601","area":"chat|memory|models|capabilities|agents|modules|connectors|automation|other","priority":"high|medium|low","status":"WAITING_TEACHER","goal":"objectif concret","current_state":"ce qui fonctionne réellement","evidence":"tests/fichiers/erreurs/résultats observables","blocker_or_question":"question précise","proposed_next_step":"prochaine étape proposée","safety":{"no_production_deploy":true,"no_dns_change":true,"no_secret_exposure":true,"no_destructive_d1":true,"candidate_branch_only":true}}
```

## Format d'une réponse professeur
```json
{"type":"TEACHER_REPLY","request_id":"même id","created_at":"ISO8601","status":"ANSWERED","diagnosis":"analyse","instruction":"prochaine action concrète","acceptance_tests":"tests attendus","do_not":"limites","next_report":"ce que MEL doit rapporter ensuite"}
```

## Demande de déploiement supervisé
MEL ne peut demander une revue production qu'à partir d'une branche `candidate/*`. Une demande doit contenir au minimum : branche et commit exacts, résumé du changement, fichiers/composants touchés, impact visible, tests/CI, benchmarks/régressions, impacts sécurité/confidentialité, secrets/permissions, données/schéma/migrations, risques de compatibilité, dépendances/licences si pertinent, plan de rollout, health checks, rollback et inconnues/blocages.

```json
{"type":"DEPLOYMENT_REQUEST","request_id":"uuid","status":"WAITING_DEPLOY_REVIEW","candidate_branch":"candidate/...","candidate_commit":"sha exact","change_summary":"...","files_components_affected":"...","user_visible_impact":"...","tests_ci_results":"...","benchmark_regression_results":"...","security_privacy_impact":"...","secrets_permissions_impact":"...","data_schema_migration_impact":"...","compatibility_risks":"...","dependency_licensing_impact":"...","rollout_plan":"...","health_checks":"...","rollback_plan":"...","known_unknowns_blockers":"..."}
```

Après inspection indépendante du code/diff et des preuves, le professeur écrit une revue :
```json
{"type":"DEPLOYMENT_REVIEW","request_id":"même id","decision":"DEPLOY_APPROVED|DEPLOY_REJECTED|DEPLOY_NEEDS_CHANGES","candidate_branch":"branche examinée","candidate_commit":"commit exact examiné","reasons":"..."}
```

`DEPLOY_APPROVED` n'autorise que ce couple branche+commit exact. Tout commit ultérieur exige une nouvelle revue. `DEPLOY_REJECTED` et `DEPLOY_NEEDS_CHANGES` n'autorisent jamais une promotion. L'approbation ne couvre jamais de nouvelles informations d'identification, facturation, permissions élevées, DNS/authentification, opérations de données destructives ou migrations irréversibles.

## Règles
- Aucun mot de passe, clé API, token, OTP ou secret dans ces fichiers.
- Aucun déploiement production automatique sans revue `DEPLOYMENT_REVIEW` exacte et `DEPLOY_APPROVED`.
- Aucun changement DNS implicite.
- Aucune migration D1 destructive implicite.
- Modifications de code : candidate branch → tests → diff → review.
- Une fonction n'est terminée que si elle est branchée, testée et observable.
- L'interface graphique est traitée en dernier.

## Priorité actuelle
Finir le raccordement de `/api/chat` aux capacités réelles de MEL : état dynamique/health-aware, vrais appels `code.search`/`code.read`, tool loop, réinjection des résultats, provenance, archivage sans doublon, comportement correct bridge ONLINE/OFFLINE.
