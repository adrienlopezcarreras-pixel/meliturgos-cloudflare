# MEL MAX — compte rendu d'observation manuelle (23 octobre 2026)

Destinataires : Codex, Claude et agents de développement MEL. Document d'observation, **pas** une autorisation de modifier les verrous ou de déployer.

## Périmètre / provenance

Observations utilisateur effectuées sur captures successives du panneau « Activité réelle de MEL » entre ~10:28 et 10:50 (heure de Paris, 23/10/2026). Horaires affichés par l'application ; certaines captures sont postérieures de plusieurs minutes au dernier cycle. Nous n'avons pas un dump D1, des logs Worker exhaustifs, ni vingt ticks distincts authentifiés : **ne pas présenter ce relevé comme preuve de vingt cycles**.

Source de code parcourue sur la référence `cb11f5afa1ea8810effdb64e998e77853bbe4347`; les modifications concurrentes plus récentes doivent être réconciliées avant intervention.

## Chronologie factuelle visible

| Heure affichée | MEL-FOUNDER-01 | MEL-FOUNDER-02 | Signaux MAX |
| --- | --- | --- | --- |
| ~10:28–10:37 | `TEACHER_APPROVED`; blocage `CANDIDATE_HEAD_CHANGED_DURING_INSPECTION` puis `JOB_UPDATE_CONFLICT` observé | absent, puis créé à 10:38 | `NO_PROGRESS`; 0 terminé |
| 10:38 | `TEACHER_APPROVED` avec `AUTONOMY_RUNTIME_RETRY:JOB_UPDATE_CONFLICT` | créé `QUEUED` | 2 actifs, 0 terminé, 2 cycles bloqués |
| 10:43 | `TEACHER_APPROVED` | `TEACHER_APPROVED`, `JOB_UPDATE_CONFLICT` | 0 terminé, 3 cycles bloqués, `NO_PROGRESS` |
| 10:45–10:46 | pas de clôture visible | `CLAIMED`; paquet pour Bridge, candidat `candidate/mel-clean-autonomy`, interface « appliqué sur la candidate », diagnostic `READY` | `ADVANCING`, 0 terminé, 4 cycles bloqués |
| 10:48 | état inchangé sur capture | journal `CLAIMED → REPAIR_REQUIRED` | résultat de Bridge en échec ; code racine exact non démontré |
| 10:49 | `TEACHER_APPROVED` | journal `REPAIR_REQUIRED → TEACHER_APPROVED` | tentative de réparation du même ID, 0 terminé |
| 10:50 | mise à jour `result_json` / `error`; reste `TEACHER_APPROVED` | reste `TEACHER_APPROVED` | `LEASE_BUSY`; dernier progrès affiché 10:45; 4 cycles bloqués |

Sur la capture à 10:49–10:50, les deux travaux restent actifs. Aucun résultat `DONE_VERIFIED`, test CI complet vert, commit MEL autonome ou release réussie n'a été démontré par ces captures. Ne pas confondre `Plan validé`, `Code écrit`, `Paquet prêt` et `Appliqué sur candidate` avec la preuve de clôture.

## Constat dans le code

- `src/evolution/autonomy-supervisor.js` : `selectActionableAutonomyJob` classe `REPAIR_REQUIRED` puis `TEACHER_APPROVED` comme exécutables prioritaires. `ensureNextJob` laisse certains travaux « passifs » progresser via Teacher / Bridge / CI pendant que la feuille de route peut alimenter la file. La raison exacte de la création de FOUNDER-02 alors que FOUNDER-01 restait approuvé doit encore être établie.
- `src/dev/d1-dev-job-repository.js` : `update()` applique une comparaison atomique sur `updated_at`, `status`, `result_json`, `plan_json`. Le conflit `JOB_UPDATE_CONFLICT` est intentionnel et protège contre l'écrasement par une écriture périmée. **Ne pas enlever ce CAS.**
- `src/evolution/autonomy-runtime-core.js` : après `ensureNextJob`, la preuve Work DAG, la préparation de proposition, les diagnostics et le paquet Bridge peuvent chacun écrire le même `result_json`.
- `src/evolution/autonomy-implementation-planner.js` : `prepareApprovedImplementationProposal` lit un snapshot, lance des consultations asynchrones Augmentio, puis écrit avec `expected: current`. Une écriture survenue entre-temps peut déclencher `JOB_UPDATE_CONFLICT`. C'est une fenêtre de concurrence démontrable dans le code, **pas encore la preuve de l'appel précis ayant échoué en production**.
- `src/evolution/autonomy-proof.js` : la preuve Work DAG peut écrire `result_json.autonomy_proofs` sur le même job.
- `src/evolution/autonomy-runtime.js` : `recordCoreRuntimeFailure` inscrit `AUTONOMY_RUNTIME_RETRY` et peut mettre en quarantaine après épuisement ; `LEASE_BUSY` est à distinguer d'un blocage durable (un lease occupé pendant un tick peut être normal).
- `src/evolution/passive-state-recovery.js` répare certains Teacher obsolètes et `READY_FOR_REVIEW` orphelins, mais n'a pas de réparation spécifique de `JOB_UPDATE_CONFLICT` sur `TEACHER_APPROVED`.

Voir également PR historique #2347, qui documente le problème inverse : un écrivain asynchrone périmé écrasant le résultat du Bridge. Une reprise doit conserver cette sécurité.

## Hypothèses à départager

1. Une proposition asynchrone écrit avec un `expected` devenu obsolète à cause d'une preuve Work DAG, d'un diagnostic, du Teacher ou du Bridge.
2. Des écrivains parallèles sur le même job se déclenchent sur un même cycle / cycles voisins.
3. Le traitement de conflit enregistre un diagnostic mais n'effectue pas de réconciliation ciblée sur l'état courant avant la prochaine tentative.
4. La logique de sélection bascule vers le chantier suivant malgré un travail approuvé en attente de reprise.
5. Les champs `error` et `progress` exposés dans l'UI peuvent refléter une erreur historique même après une étape réussie.

Aucune hypothèse ne doit être déclarée cause racine sans traçage exact.

## Vérifications demandées à Codex et Claude

1. Recueillir pour les **mêmes IDs** le journal D1 ordonné, horodaté, `updated_at` avant/après, writer/source de chaque mutation, `expected` versus état actuel, statut et événement du Bridge. Éviter données privées et secrets.
2. Reproduire en test deux écrivains simultanés : proposition Augmentio lente et mutation de preuve / Teacher / Bridge. Vérifier rejet de l'écriture périmée, préservation des données du gagnant, puis reprise du perdant sur état actualisé.
3. Tester explicitement `TEACHER_APPROVED → CLAIMED → REPAIR_REQUIRED → TEACHER_APPROVED` sur **le même ID**, sans régénération inutile ni boucle infinie.
4. Vérifier qu'un `LEASE_BUSY` transitoire n'est ni compté comme progrès ni comme échec terminal, et que le lease est relâché.
5. Auditer le sélecteur de travail : ne pas multiplier les chantiers lorsque le précédent est immédiatement reprenable; préserver la possibilité de parallélisme réellement indépendant et les travaux passifs.
6. Ne déclarer `ADVANCING` / `DONE_VERIFIED` que si les preuves requises existent ; distinguer changement de statut, code candidat, vérification CI et effet en production.

## Garde-fous

Aucune suppression de CAS, aucune écriture D1 hors mécanisme autorisé, aucun faux SUCCESS, aucune fusion sans CI verte sur SHA exact, aucun déploiement concurrent. Préserver le choix explicite du propriétaire d'activer MAX ainsi que les pauses de sécurité authentiques.

## Suite du relevé manuel

Comparer les captures suivantes aux mêmes IDs et ne compter qu'un tick distinct prouvé à chaque fois. À chaque nouvelle capture : heure du tick, heure du dernier progrès, statut des jobs, journal nouveau, raison du blocage, `created/completed/blocked`, preuve de modification réellement durable. Ce document couvre les constats disponibles jusqu'à la capture de ~10:50, pas des ticks futurs.

## Complément — export direct de l'API de production (23/10/2026 10:56:55 Europe/Paris)

L'utilisateur a fourni la réponse de `GET /api/gen2/autonomy/activity`, dont l'enveloppe indique `ok: true`, `source: production_d1`, `observed_at: 2026-10-23T08:56:55.398Z`. Il s'agit d'un **instantané fourni par le propriétaire**, et non d'un accès autonome de cet agent à D1. Les champs source pouvant contenir des données privées ne sont pas reproduits ici.

- Contrôle: `paused=false`, `max_autonomy=true`, `status=MAX_AUTONOMY`, SHA autorisé `cb11f5afa1ea8810effdb64e998e77853bbe4347`.
- Watchdog: `LEASE_BUSY`, `tripped=false`, `consecutive_stalls=0`, dernier tick `08:56:27Z`, dernière progression `08:52:09Z`, `last_block_reason=AUTONOMY_RUNTIME_LEASE_BUSY`, travail ciblé FOUNDER-02 en `REPAIR_REQUIRED`.
- Compteurs depuis l'époque courante de la liste: `ticks=32`, `advanced_ticks=5`, `jobs_created=1`, `jobs_completed=0`, `blocked_ticks=6`, `lease_busy_skips=16`. Les catégories peuvent se recouper ; ne pas additionner comme des partitions.
- Trois travaux supervisés actifs (`FOUNDER-01`, `FOUNDER-02`, `FOUNDER-03`), tous `TEACHER_APPROVED`. Pour chacun : étapes code, paquet, candidat, CI, achèvement `done=false` dans cet instantané. FOUNDER-01 conserve `AUTONOMY_RUNTIME_RETRY:JOB_UPDATE_CONFLICT`, alors que FOUNDER-02 et FOUNDER-03 affichent `error=null`. L'écart `jobs_created=1` vs trois créations visibles dans le ledger nécessite une explication sur la portée temporelle/les resets et définitions des compteurs.
- Le ledger atteste maintenant la création de FOUNDER-03, puis `QUEUED → COUNCIL_COMPLETE → WAITING_TEACHER → TEACHER_APPROVED`, pendant que les deux chantiers antérieurs ne sont pas terminés.
- FOUNDER-02 : deux événements distincts `CLAIMED → REPAIR_REQUIRED`, un premier autour de 10:48 et un autre autour de 10:55 (horaires Paris convertis des millisecondes API). On observe donc une **répétition de l'échec de Bridge/exécuteur**, mais le code d'erreur profond manque dans cet export compact.
- Le panneau `workflow_dispatches` présente deux entrées `DISPATCHED` de `gen2-42-apply-ready-bridge.yml` pointant vers le **même `run_id=39924542106`**. Cela demande vérification des corrélations relay/workflow : deux relais ne prouvent pas deux exécutions distinctes.
- `work_cycles=[]` : cet instantané ne fournit aucune preuve de cycle Work achevé.

**Questions de suivi prioritaires :** Pourquoi `lease_busy_skips=16/32` ? Quelle durée et quel détenteur du bail, quel déclencheur concurrent ? Pourquoi une deuxième transition FOUNDER-02 `CLAIMED → REPAIR_REQUIRED` et quelle erreur d'exécution ? Pourquoi la création de FOUNDER-03 sans clôture des deux premiers ? Les writes de preuve/diagnostic font-ils échouer la proposition sur CAS ? Les compteurs `jobs_created` et ledger ont-ils des fenêtres différentes ? Quelles preuves externes correspondent au run GitHub 39924542106 ?

**Politique d'interprétation :** `advanced_ticks=5` atteste des événements classés comme progrès par le moteur, pas une preuve de cinq résultats fonctionnels. `tripped=false` ne signifie pas que les travaux avancent. Aucun `DONE_VERIFIED` prouvé.

## Complément d'analyse — GitHub relay et sémantique du bail

Vérification GitHub du workflow run [39924542106](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/39924542106) : le job `relay` (`120317610076`) était `in_progress` lors de la lecture, l'étape `Heartbeat, claim and dispatch queued GitHub actions` toujours en cours. Le job `contract` était `skipped`. Cela ne prouve ni échec ni blocage permanent. Capturer plus tard sa conclusion et les éventuels workflows enfants, en protégeant les données sensibles des logs.

Le code `src/evolution/autonomy-runtime.js` confirme que `runAutonomyRuntimeTick` obtient un bail exclusif. Si l'acquisition échoue, le moteur répond `SKIPPED_LEASE_BUSY` et `advanced=false`, puis libère son propre bail dans un `finally` lorsqu'il l'a acquis. Les 16 `lease_busy_skips` de l'export ne sont donc **pas** automatiquement 16 défaillances : ils peuvent indiquer des collisions entre déclencheurs pendant des cycles légitimement longs. Il faut corréler propriétaire/expiration/durée du bail, cadence cron, exécution manuelle et GitHub relay avant de conclure.

Hypothèse nouvelle à tester : chevauchement de triggers autonomes, relay GitHub et long fan-out AI causant de nombreux `LEASE_BUSY` tandis que les écritures asynchrones restent sujettes aux conflits CAS. Ne pas déduire la causalité du seul chevauchement temporel. Ajouter un test de déclencheurs simultanés et comptage distinct tentative de tick / cycle ayant obtenu le bail / progression métier durable.

## Deuxième export de production — 23/10/2026 11:04:03 Europe/Paris

Un nouvel instantané fourni par le propriétaire indique `observed_at=2026-10-23T09:04:03.288Z` et `source=production_d1`. Comparaison avec l'export `08:56:55Z` : `ticks 32→37` (+5), `advanced_ticks 5→6` (+1), `blocked_ticks 6→6`, `lease_busy_skips 16→18` (+2), `jobs_completed=0` inchangé, `active=3` inchangé. Ces compteurs ne sont pas des catégories exhaustives ou nécessairement mutuellement exclusives.

Le watchdog est passé de `LEASE_BUSY` à `WAITING_EXTERNAL`, avec `last_block_reason=FULL_CANDIDATE_CI_LOOKUP_FAILED`, `waiting_external=true`, `tripped=false` et `last_advanced_at=2026-10-23T09:00:46.691Z`. **Distinguer impossibilité de lire les preuves CI et CI effectivement échouée : aucune CI rouge n'est démontrée par cet export.**

FOUNDER-02 est repassé à `CLAIMED` avec étapes `code=true`, `package=true`, `candidate=false`, `ci=false`, `done=false` ; candidate `candidate/mel-clean-autonomy`, base `cb11f5afa1ea8810effdb64e998e77853bbe4347`, `error=null`. FOUNDER-01 reste `TEACHER_APPROVED` avec `AUTONOMY_RUNTIME_RETRY:JOB_UPDATE_CONFLICT`, et FOUNDER-03 reste `TEACHER_APPROVED` en attente de code.

Le journal a un nouvel événement pour FOUNDER-01 : mise à jour de `result_json` à `1792746182500` (l'erreur de conflit persiste). FOUNDER-02 a de nouvelles mises à jour de `files_json,patch_json,result_json,tests_json` à `1792746027729` et une autre mise à jour de `result_json` à `1792745948117`; l'état `CLAIMED` est visible dans le snapshot même si la liste bornée des événements ne détaille pas la transition correspondante.

Le nombre de `workflow_dispatches` visibles passe de 2 à 3 pour le même `run_id=39924542106`; les IDs de relais sont distincts. Le job GitHub `relay` était toujours `in_progress` lors de la consultation suivante, `contract` était `skipped`. **Priorité** : auditer la correspondance entre ces relay IDs et les exécutions réelles ; vérifier origine précise de `FULL_CANDIDATE_CI_LOOKUP_FAILED`, statut du run et éligibilité de candidate à l'application, sans déclarer une CI verte ni réinitialiser les tâches.

Le nouveau résultat confirme une progression intermédiaire (FOUNDER-02 réclamé, paquet prêt) et un changement de blocage (lookup CI), **mais toujours aucune clôture**.

## Contrôle CI / branche candidate lié à FOUNDER-02 (23/10)

- GitHub Actions [run 39924542106](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/39924542106) : job `relay` id `120317610076` toujours `in_progress` à la consultation; job `contract` id `120317611261` `skipped`. Aucun artifact listé. La lecture des logs du job relay n'a pas été possible (erreur HTTP 404 BlobNotFound côté téléchargement), donc ne pas inventer la sortie des tests.
- Comparaison GitHub `cb11f5afa1ea8810effdb64e998e77853bbe4347...candidate/mel-clean-autonomy`: `identical`, `ahead_by=0`, `behind_by=0`, `files=[]`. **Aucun commit candidat issu de FOUNDER-02 n'était visible sur cette branche à la consultation.**
- Statuts combinés GitHub du SHA de base : `statuses=[]`. Recherche de runs via la commande GitHub connectée pour ce commit (filtrée aux événements pull request par le connecteur) : `workflow_runs=[]`. Ce résultat **n'est pas** une preuve globale d'absence de toute CI GitHub, seulement d'absence de ces catégories dans les contrôles effectués.
- La mention `FULL_CANDIDATE_CI_LOOKUP_FAILED` signifie que le runtime n'a pas établi la preuve de la CI complète; elle ne démontre pas que des tests ont exécuté puis échoué.

**Action Codex / Claude** : corréler `cloud_bridge_dispatches` avec le véritable job GitHub qui applique le correctif, prouver son SHA de sortie et la suite CI associée; vérifier pourquoi la branche candidate est strictement identique à la base malgré les passages `CLAIMED` / paquet `READY`. Ne pas forcer `DONE_VERIFIED` ni faire de faux SUCCESS.
