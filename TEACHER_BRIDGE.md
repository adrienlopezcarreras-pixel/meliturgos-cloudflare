# MEL ↔ Professeur — Teacher Bridge

Canal de coordination gratuit entre MELITURGOS et ChatGPT via GitHub + un flux public strictement en lecture seule.

## Objectif P0
Fermer une boucle réellement reprenable :

`MEL -> Work/D1 job -> Council multi-IA -> inspection code -> demande Professeur -> ChatGPT -> changement candidate -> CI -> completion record -> MEL -> prochain travail`

Sans API OpenAI payante, MEL ne parle pas directement et en continu à une instance ChatGPT. Le canal gratuit actuel est le Teacher Bridge + l'automatisation ChatGPT `MEL Autonomie Continue`. Entre deux passages du Professeur, MEL continue avec ses propres modèles/outils, checkpointant chaque étape et ne s'arrêtant que sur un vrai blocage.

## Composants candidate
- `src/evolution/autonomy-runtime.js` : heartbeat cloud ; réconcilie les réponses Teacher et les fins de travail validées par CI avant de sélectionner le prochain objectif. Il récupère aussi les états historiques `READY_FOR_REVIEW` et les transforme en demande Teacher au lieu de laisser le job bloqué.
- `src/evolution/autonomy-supervisor.js` : choisit le prochain manque P0 et ne garde pas un job terminé comme job actif.
- `src/work/work-dag.js` : DAG de travail persistant, dépendances, checkpoints signés, reprise idempotente et fail-closed pour les effets non idempotents.
- `src/work/autonomous-work-loop.js` : publie les demandes Teacher, cherche une réponse correspondante puis reprend le DAG.
- `src/teachers/public-teacher-api.js` : flux public read-only minimisé (`/api/teacher/pending`, `/api/teacher/status`, `/api/teacher/work`, `/api/teacher/bridge.txt`) sans secrets, contenu Council complet, code source ou objectifs privés.
- `src/teachers/github-request-mirror.js` : miroir optionnel et idempotent des demandes internes `mel-autonomy` vers `teacher-bridge/runtime-requests/<request_id>.json` lorsque le token GitHub est déjà configuré ; D1 reste la source de vérité et `owner-chat` n'est jamais reflété.
- `src/teachers/runtime-teacher-bridge.js` : demande/revue runtime stockée dans `dev_jobs` avec correspondance stricte du `request_id`.
- `src/teachers/github-reply-reconciler.js` : lit les réponses GitHub et applique uniquement celles correspondant à une demande en attente.
- `src/teachers/github-completion-reconciler.js` : accepte uniquement une fin de travail liée à une réponse Teacher approuvée et vérifie sur GitHub que `full-candidate-ci` a réellement réussi sur le même SHA et la même branche candidate.
- `scripts/jsonl-teacher-channel.mjs` : canal JSONL durable pour les exercices/local bridge, dédupliqué et nettoyé des champs ressemblant à des secrets.
- `.augmentio` : fan-out/routage multi-modèles avec politique coût ajouté nul fail-closed.
- `src/dev/*` : jobs, bridge de développement local, lecture/recherche de code, candidate isolée, tests et rapports.

## Découverte des demandes runtime
Après déploiement d'une release contenant le Teacher Bridge, ChatGPT/Professeur peut utiliser plusieurs chemins indépendants :

- `GET /api/teacher/status` : compteurs techniques minimisés (attente Teacher, Teacher approuvé, terminé, job autonomie courant), sans objectif textuel.
- `GET /api/teacher/pending` : demandes Teacher minimisées nécessaires à la revue ; aucune mutation n'est possible sur cette route.
- `GET /api/teacher/work` : au plus un paquet d'implémentation interne déjà approuvé, jamais un travail `owner-chat`.
- `GET /api/teacher/bridge.txt` : instantané texte des vues publiques précédentes pour les navigateurs/extracteurs qui préservent mal les corps `application/json`.
- `teacher-bridge/runtime-requests/<request_id>.json` : miroir GitHub facultatif d'une demande issue exclusivement de la feuille de route interne, si MEL dispose déjà d'un token GitHub autorisé.

Le contenu Council complet, les données utilisateur, les états privés de job et les secrets ne sont jamais exposés par ce flux public. Le miroir GitHub est un transport secondaire : son absence ou son échec ne bloque jamais le job D1.

## Réponses Professeur
ChatGPT écrit une réponse structurée dans `teacher-bridge/replies.jsonl`. MEL ne consomme qu'une réponse portant exactement le même `request_id` qu'une demande runtime en attente.

Format minimal :
```json
{"kind":"TEACHER_REPLY","request_id":"même id","created_at":"ISO8601","verdict":"APPROVE_PLAN|NEEDS_CHANGES|REJECT","feedback":"diagnostic et action suivante","evidence":[]}
```

`APPROVE_PLAN` autorise uniquement le développement candidate prévu. Il n'autorise jamais un déploiement production.

## Fin de travail vérifiable
Après l'implémentation candidate, le Professeur ne déclare pas le job terminé tant que le SHA exact n'a pas un workflow GitHub `full-candidate-ci` avec :
- `status = completed`
- `conclusion = success`
- `head_sha = candidate_sha`
- `head_branch = candidate/augmentio-core` (ou branche candidate explicitement configurée)

Une fois ces preuves réelles disponibles, un record est ajouté dans `teacher-bridge/completions.jsonl` :

```json
{"kind":"MEL_WORK_COMPLETION","status":"COMPLETED","job_id":"id D1 exact","request_id":"request_id Teacher exact","candidate_sha":"40 hex","candidate_branch":"candidate/augmentio-core","ci_run_id":123456789,"tests":[{"name":"full-candidate-ci","passed":true}],"summary":"travail vérifié","created_at":"ISO8601"}
```

MEL vérifie elle-même ce record auprès de l'API GitHub avant de marquer le job `COMPLETED`. Un record inventé, une mauvaise branche, un autre SHA, une CI encore en cours ou une CI échouée sont refusés fail-closed.

## Continuité non-idle
Dans un même heartbeat cloud, l'ordre est :
1. récupérer/appliquer les nouvelles réponses Teacher corrélées ;
2. récupérer les completion records ;
3. vérifier la CI GitHub de chaque completion ;
4. fermer les jobs réellement terminés ;
5. sélectionner immédiatement le prochain objectif P0 ;
6. lancer son Council zéro-coût et l'inspection candidate ;
7. produire la prochaine demande Teacher ;
8. rendre cette demande récupérable par le flux public et, si disponible, par son miroir GitHub idempotent.

Ainsi un travail validé ne laisse pas MEL bloquée sur un job déjà terminé et une panne d'un transport de lecture ne supprime pas l'état persistant du travail.

## Règles de sécurité et vérité
- Aucun mot de passe, clé API, token, cookie, OTP ou secret dans les fichiers du bridge.
- Aucun coût ajouté sans autorisation explicite ; coût inconnu = refus.
- Aucun DNS, facturation, administrateur, authentification ou migration D1 destructive.
- Développement autonome sur candidate ; production reste distincte du cycle de développement.
- Un redémarrage ne doit jamais rejouer une étape déjà `COMPLETED`.
- Un nœud interrompu idempotent peut être rejoué ; un nœud non idempotent interrompu bloque fail-closed.
- Une réponse libre non corrélée ne débloque rien.
- Une capacité n'est déclarée autonome que si elle est branchée, testée et observable.
- MEL ne prétend jamais parler directement à ChatGPT : le relais gratuit actuel est explicite et vérifiable.

## Priorité immédiate
1. Garder les tests E2E du runtime, du Work DAG et du Teacher Bridge verts.
2. Déployer une release contenant la récupération `READY_FOR_REVIEW`, les flux publics Teacher et le reconciler de completions.
3. Capturer le premier vrai round-trip production : demande runtime MEL -> lecture par ChatGPT -> `TEACHER_REPLY` -> changement candidate -> CI réelle -> `MEL_WORK_COMPLETION` -> job suivant créé automatiquement.
4. Une fois cette preuve acquise, poursuivre la feuille de route par petits lots autonomes, en privilégiant code tools, Module Lab, tests/critique, mémoire, connecteurs puis multimodal/appareils.
