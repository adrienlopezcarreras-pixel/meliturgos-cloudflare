# MEL ↔ Professeur — Teacher Bridge

Canal de coordination gratuit entre MELITURGOS et ChatGPT via GitHub.

## Principe
- MEL écrit une demande structurée dans `teacher-bridge/requests.jsonl`.
- ChatGPT lit les nouvelles demandes et écrit les réponses dans `teacher-bridge/replies.jsonl`.
- MEL récupère la réponse portant le même `request_id` puis reprend son travail.

## Format d'une demande MEL
```json
{"type":"MEL_REQUEST","request_id":"uuid","created_at":"ISO8601","area":"chat|memory|models|capabilities|agents|modules|connectors|automation|other","priority":"high|medium|low","status":"WAITING_TEACHER","goal":"objectif concret","current_state":"ce qui fonctionne réellement","evidence":"tests/fichiers/erreurs/résultats observables","blocker_or_question":"question précise","proposed_next_step":"prochaine étape proposée","safety":{"no_production_deploy":true,"no_dns_change":true,"no_secret_exposure":true,"no_destructive_d1":true,"candidate_branch_only":true}}
```

## Format d'une réponse professeur
```json
{"type":"TEACHER_REPLY","request_id":"même id","created_at":"ISO8601","status":"ANSWERED","diagnosis":"analyse","instruction":"prochaine action concrète","acceptance_tests":"tests attendus","do_not":"limites","next_report":"ce que MEL doit rapporter ensuite"}
```

## Règles
- Aucun mot de passe, clé API, token, OTP ou secret dans ces fichiers.
- Aucun déploiement production automatique.
- Aucun changement DNS.
- Aucune migration D1 destructive.
- Modifications de code : candidate branch → tests → diff → review.
- Une fonction n'est terminée que si elle est branchée, testée et observable.
- L'interface graphique est traitée en dernier.

## Priorité actuelle
Finir le raccordement de `/api/chat` aux capacités réelles de MEL : état dynamique/health-aware, vrais appels `code.search`/`code.read`, tool loop, réinjection des résultats, provenance, archivage sans doublon, comportement correct bridge ONLINE/OFFLINE.
