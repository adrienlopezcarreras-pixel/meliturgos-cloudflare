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
