# MEL — chaîne de développement autonome (MAX)

Source de vérité de la chaîne qui va d'une mission de la feuille de route jusqu'à
la production, sans action humaine. Toute modification d'un maillon met ce
document à jour dans la même PR.

## Chaîne

| # | Maillon | Fichier | Sortie vérifiable |
|---|---|---|---|
| 1 | Superviseur : choisit la prochaine mission | `src/evolution/autonomy-supervisor.js` | `dev_jobs` (`requested_by = mel-autonomy`) |
| 2 | Planificateur : localise les fichiers liés | `src/evolution/autonomy-implementation-planner.js` (`rankGoalPaths`) | `implementation_proposal` |
| 3 | Plan validé par le professeur (ou MAX) | `src/evolution/autonomy-runtime-core.js` | `teacher_bridge.status = ANSWERED` |
| 4 | Mentor : écrit le code et son test (blocs SEARCH/REPLACE) | `src/learning/mentor-engine.js`, `src/evolution/autonomy-bridge-preparer.js` | `bridge_preparation.mentor` (modèle retenu, refus) |
| 5 | Pont cloud : applique et teste sur la candidate | `.github/workflows/gen2-42-apply-ready-bridge.yml` | `bridge-apply-result.json`, run GitHub |
| 6 | CI complète de la candidate (SHA exact) | `.github/workflows/full-candidate-ci.yml` | run `success` sur `head_sha` |
| 7 | Council puis promotion vers `main` | `.github/workflows/mel-candidate-promotion.yml`, `src/evolution/council-review.js` | `COUNCIL_REVIEW … APPROVED`, push `main` |
| 8 | Release de production (fenêtre de 1 h) | `.github/workflows/mel-autonomous-production-release.yml`, `deploy-cloudflare-release.yml` | version déployée = SHA de `main` |

## Invariants

- Le mentor n'écrit jamais dans `.github/workflows/`. Les workflows ne se modifient qu'à la main, par le propriétaire.
- Chaque changement du mentor contient un test (`MENTOR_TEST_REQUIRED`, #2510) ; un import vers un fichier absent est refusé (`MENTOR_MISSING_IMPORT`).
- Un run lancé avec `GITHUB_TOKEN` ne déclenche pas d'autre workflow : chaque maillon lance le suivant par `workflow_dispatch`.
- Un refus du Council remet le contenu de la candidate à celui de `main` (sans force push) et renvoie les jobs fautifs en `REPAIR_REQUIRED`.
- `COMPLETED` signifie « code livré » ; l'objectif n'est prouvé que lorsque la feuille de route le marque fermé.
- Un HTTP 204 de dispatch ne prouve aucun déploiement : seule la version servie fait foi.

## Observabilité

Une fois #2511, #2512 et #2513 fusionnées, `GET /api/gen2/autonomy/activity` renvoie, pour chaque job, le pipeline, la trace (pont, CI, Council avec run et SHA), le plan du chat de code, et `metrics` :
réussite du mentor par modèle, causes de refus, alertes (`JOB_STALLED` > 2 h, `MENTOR_MODEL_NEVER_SELECTED`, `REPEATED_REJECTION`).

## Workflows dormants (aucun run depuis le 1er octobre 2026)

Inventaire du 24 octobre 2026, sur 181 workflows. La plupart sont des CI de composant filtrées par chemin : elles ne sont pas mortes tant que leurs chemins existent.
Les workflows de déploiement de previews et ceux qui n'ont jamais tourné sont des candidats à l'archivage. La décision appartient au propriétaire (modification manuelle des workflows).

| Dernier run | Workflow | Déclencheurs |
|---|---|---|
| 2026-09-15 | `deploy-memory-sync-preview.yml` | push,workflow_dispatch |
| 2026-09-15 | `deploy-memory-export-preview.yml` | push,workflow_dispatch |
| 2026-09-15 | `dependency-fix.yml` | push |
| 2026-09-16 | `gen2-53-canary-rollback.yml` | workflow_dispatch |
| 2026-09-16 | `deploy-dreamina-preview.yml` | push,workflow_dispatch |
| 2026-09-18 | `lora-kaggle-free-launch.yml` | workflow_dispatch |
| 2026-09-20 | `mel-lora-data-integration.yml` | push |
| 2026-09-22 | `gen2-31-browser-live-preview.yml` | push |
| 2026-09-25 | `gen2-21-image-vision-ci.yml` | pull_request,push |
| 2026-09-25 | `gen2-40-event-bus-ci.yml` | pull_request,push |
| 2026-09-25 | `gen2-13-projects-ci.yml` | pull_request,push |
| 2026-09-25 | `gen2-12-timeline-ci.yml` | pull_request,push |
| 2026-09-25 | `mel-evol-05-skill-registry-ci.yml` | pull_request,push |
| 2026-09-25 | `gen2-41-notifications-ci.yml` | pull_request |
| 2026-09-25 | `self-healing-controlled-ci.yml` | pull_request |
| 2026-09-26 | `gen2-39-guarded-agent-work-ci.yml` | pull_request,push |
| 2026-09-26 | `mel-res-04-cold-object-adapter-ci.yml` | pull_request,push |
| 2026-09-26 | `mel-avatar-03-identity-ci.yml` | pull_request |
| 2026-09-26 | `gen2-22-audio-runtime-ci.yml` | pull_request |
| 2026-09-26 | `mel-eval-01-stable-watch-ci.yml` | pull_request,push |
| 2026-09-27 | `gen2-42-bridge-dry-run.yml` | workflow_dispatch |
| 2026-09-27 | `gen2-42-finalize-verified-completion.yml` | push,workflow_dispatch |
| 2026-09-28 | `mel-mem-05-live-proof.yml` | push |
| 2026-09-28 | `gen2-47-r2-byte-backup-ci.yml` | pull_request,push |
| 2026-09-29 | `sovereignty-stress-ci.yml` | workflow_dispatch |
| 2026-09-30 | `mel-sov-01-live-proof.yml` | workflow_dispatch |
| jamais | `lora-promote-from-huggingface.yml` | workflow_dispatch |
| jamais | `owner-max-autorelease.yml` | workflow_dispatch |
