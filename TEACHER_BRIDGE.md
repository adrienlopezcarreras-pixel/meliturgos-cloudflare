# MEL ↔ Professeur — Teacher Bridge

Canal de coordination gratuit entre MELITURGOS et ChatGPT via GitHub.

## Objectif P0
Fermer une boucle réellement reprenable :

`MEL -> Work DAG -> demande Professeur -> Teacher Bridge -> réponse ChatGPT -> reprise automatique -> prochain travail`

Sans API OpenAI payante, MEL ne parle pas directement et en continu à une instance ChatGPT. Le canal gratuit actuel est GitHub + l'automatisation ChatGPT horaire `MEL Autonomie Continue`. Entre deux passages du Professeur, MEL doit continuer avec ses propres modèles/outils, checkpointant chaque étape et ne s'arrêtant que sur un vrai blocage.

## Composants déjà présents sur candidate/augmentio-core
- `src/work/work-dag.js` : DAG de travail persistant, dépendances, checkpoints signés, reprise idempotente et fail-closed pour les effets non idempotents.
- `src/work/autonomous-work-loop.js` : superviseur borné qui publie les demandes Teacher, cherche une réponse correspondante puis reprend automatiquement le DAG.
- `scripts/jsonl-teacher-channel.mjs` : canal durable JSONL local/GitHub, dédupliqué et nettoyé des champs ressemblant à des secrets.
- `src/teachers/teacher-request.js` : contrat structuré de demande/revue Professeur avec correspondance stricte de `request_id`.
- `.augmentio` : fan-out/routage multi-modèles avec politique coût ajouté nul fail-closed.
- `src/dev/*` : jobs, bridge de développement local, lecture/recherche de code, candidate isolée, tests et rapports.

## Canal GitHub
- MEL publie une demande structurée dans `teacher-bridge/requests.jsonl`.
- ChatGPT/Professeur lit les demandes sans réponse correspondante et écrit dans `teacher-bridge/replies.jsonl`.
- MEL récupère uniquement la réponse portant le même `request_id`.
- La reprise doit passer par le contrat Teacher et le Work DAG ; une réponse libre non corrélée ne doit jamais débloquer du développement.

## Format minimal d'une demande MEL
```json
{"kind":"MEL_REQUEST","request_id":"uuid","created_at":"ISO8601","status":"WAITING_TEACHER","goal":"objectif concret","evidence":"tests/fichiers/résultats observables","blocker_or_question":"question précise","proposed_next_step":"prochaine étape proposée","safety":{"no_secret_exposure":true,"no_destructive_d1":true,"candidate_branch_only":true}}
```

## Format minimal d'une réponse Professeur
```json
{"kind":"TEACHER_REPLY","request_id":"même id","created_at":"ISO8601","verdict":"APPROVE_PLAN|NEEDS_CHANGES|REJECT","feedback":"diagnostic et action suivante","evidence":[]}
```

## Règles de continuité
- Une étape finie déclenche immédiatement la recherche du prochain petit objectif vérifiable.
- Un redémarrage ne doit jamais rejouer une étape déjà `COMPLETED`.
- Un nœud interrompu déclaré idempotent peut être rejoué ; un nœud non idempotent interrompu bloque fail-closed.
- Les demandes Teacher sont publiées de façon idempotente ; les réponses sont appliquées uniquement si le `request_id` correspond exactement.
- Aucun mot de passe, clé API, token, cookie, OTP ou secret dans les fichiers du bridge.
- Aucun coût ajouté sans autorisation explicite ; coût inconnu = refus.
- Aucun DNS, facturation, administrateur, authentification ou migration D1 destructive.
- Développement autonome sur candidate ; production reste distincte du cycle de développement.
- Une capacité n'est déclarée autonome que si elle est branchée, testée et observable.

## Priorité immédiate
1. Faire passer les tests E2E du Work DAG + AutonomousWorkLoop + JSONL Teacher Channel.
2. Brancher le superviseur autonome sur le flux réel de jobs de développement, pas seulement sur les tests.
3. Faire générer par MEL une vraie demande runtime, la publier dans le Teacher Bridge, faire répondre ChatGPT avec le même `request_id`, puis prouver la reprise automatique du même job sans refaire les étapes validées.
4. Une fois cette boucle prouvée, laisser le superviseur choisir en continu le prochain manque P0 : code tools, plan/patch borné, tests, critique, checkpoint, reprise.
5. L'interface, l'avatar et la cosmétique restent secondaires tant que cette boucle n'est pas fonctionnelle de bout en bout.
