# Roadmap: software deliverables and prerequisite hierarchy — 29 October 2026

Audit: 176 rows, 133 historical closed rows preserved without re-certifying their old evidence, 43 open software deliverables. The active roadmap registry remains the only scheduler source. Each open row now derives its title and executable contract from one canonical code-contract catalog. No row is marked complete by this audit.

## Execution rules

- Canonical roadmap work has absolute priority over errors, watches and evolving inbox work. Inert lower-priority jobs are preserved in dependency wait; an executing Bridge or committed CI is never overwritten.
- Every open objective specifies bounded existing code paths, regression paths and an observable acceptance case. All fit the actual five-file planning window and 200,000-byte per-file Bridge ceiling. Pure declaration, changing the registry, hardware acceptance, or a provider signup is not a software deliverable.
- The hard DAG is checked for unknown nodes, self edges and cycles. No child is admitted until each prerequisite has a verified declaration or a typed acceptance receipt from the existing Council/Teacher/exact-SHA full-CI verifier. A bare COMPLETED job does not unlock anything.
- Three provider attempts precede demotion/requeue; one mission owns the active slot. Prior failures and code stay archived. A new technical-contract revision invalidates old plans and approvals once and cannot repeatedly replenish retries on every tick.
- Physical validation and model activation remain independent external acceptance requirements. Completing a protocol harness cannot claim devices were used, or that a LoRA was activated.

## Root cause reproduced

The owner supplied the generated roadmap file from mel-autonomy-mel-manifest-01-e1793214699518-14. Its sole token-level change from production was a new MEL-MANIFEST-01-P4 row with invalid scheduling priority P4. It confused a business priority index with the P0–P3 scheduling enum. The regression reproduces INVALID_PRIORITY using the exact inserted row. The new Bridge scope gate rejects any such registry-only patch before application; Manifest-01 targets its actual acceptance-calculation module and test.

Changing a goal previously persisted only in memory, not D1. The repository now writes goal/context under the existing compare-and-swap fence, verified on real SQLite. Superseded goals, files, tests and approval evidence are retained when the old declarative mission is replanned.

## All 43 open contracts

| ID | Software deliverable | Must follow | Code target(s) | Regression(s) |
|---|---|---|---|---|
| MEL-AUDIT-02 | Automatiser le rapport hebdomadaire du développement MAX | MEL-FOUNDER-02, MEL-FOUNDER-04 | src/diagnostics/development-audit.js | tests/development-audit.test.mjs |
| MEL-AUDIT-03 | Raccorder les résultats chat, veille et WORK au rapport de domaine | MEL-FOUNDER-01, MEL-FOUNDER-05 | src/diagnostics/domain-audit.js | tests/domain-audit.test.mjs |
| MEL-AUDIT-04 | Automatiser la réception et la validation du rapport architecture | MEL-FOUNDER-02 | src/diagnostics/architecture-audit-store.js | tests/architecture-audit.test.mjs |
| MEL-AUDIT-05 | Ajouter les contrôles mémoire, sessions et sauvegardes à l’audit | MEL-FOUNDER-02 | src/diagnostics/domain-audit.js | tests/domain-audit.test.mjs |
| MEL-AUDIT-06 | Coder la comparaison du catalogue de modèles et la proposition de mesure | MEL-FOUNDER-04 | scripts/workers-ai-catalog-diff.mjs | tests/development-audit.test.mjs |
| MEL-AUDIT-07 | Raccorder les constats à une réparation suivie avant et après | MEL-AUDIT-02, MEL-AUDIT-03, MEL-FOUNDER-03 | src/diagnostics/outcome-loop.js | tests/outcome-loop.test.mjs |
| MEL-FOUNDER-01 | Fiabiliser le dispatch et le rendu des lectures Gmail, Agenda et Drive | Independent root | src/api/agent-tools.js, src/api/connected-data-intent.js, src/capabilities/google-workspace-capabilities.js | tests/native-chat-connected-replay.test.mjs |
| MEL-FOUNDER-02 | Corriger la reprise durable et le verrou unique de MAX | Independent root | src/evolution/autonomy-runtime-core.js, src/evolution/autonomy-runtime-lease.js | tests/autonomy-runtime.test.mjs |
| MEL-FOUNDER-03 | Implémenter le parcours capacité absente vers développement persistant | MEL-FOUNDER-02, MEL-FOUNDER-04 | src/evolution/autonomy-supervisor.js, src/roadmap/evolution-storage.js, src/capabilities/capability-bus.js | tests/autonomy-runtime-evolution-queue-progress.test.mjs |
| MEL-FOUNDER-04 | Rendre le Council indépendant, borné et lié au SHA | Independent root | src/teachers/augmentio-council.js | tests/augmentio-council.test.mjs |
| MEL-FOUNDER-05 | Raccorder une demande WORK gratuite à un livrable consultable | MEL-FOUNDER-01, MEL-FOUNDER-02 | src/work/autonomous-work-loop.js, src/work/work-dag.js | tests/work-dag-resume.test.mjs |
| MEL-FOUNDER-06 | Construire les tests de protocole Companion, Android et MINI hors matériel | MEL-FOUNDER-02 | src/devices/mini-usb-provision.js, src/portability/companion-ci-provider-adapter.js | tests/full-interface-terminal.test.mjs |
| MEL-FOUNDER-07 | Coder une restauration isolée et sa comparaison d’intégrité | Independent root | src/backup/restore-service.js | tests/restore-service.test.mjs |
| MEL-FOUNDER-08 | Coder le garde de promotion LoRA et les reçus avant/après | MEL-CHAT-06 | src/learning/lora-plan.js, src/learning/operator-actions.js | tests/lora-runtime-pipeline.test.mjs |
| MEL-UI-AUDIT-01 | Construire un inventaire exécutable des contrôles de l’interface | Independent root | scripts/ui-production-audit.mjs | tests/ui-audit-controls.test.mjs |
| MEL-UI-AUDIT-02 | Automatiser la recette navigateur des parcours chat et média | MEL-UI-AUDIT-01, MEL-CHAT-01, MEL-CHAT-02, MEL-CHAT-03 | scripts/ui-production-audit.mjs, src/pages/mel-chat-stream.js, src/pages/chat-rich-renderer.js | tests/full-interface-client-runtime.test.mjs |
| MEL-UI-AUDIT-03 | Automatiser la recette du panneau d’activité et de ses commandes | MEL-UI-AUDIT-01, MEL-FOUNDER-02 | scripts/ui-production-audit.mjs, src/pages/objective-panel-runtime.js, src/evolution/autonomy-activity.js | tests/autonomy-activity-detail.test.mjs |
| MEL-UI-AUDIT-04 | Aligner les boutons MAX et les états UI/API durables | MEL-UI-AUDIT-01, MEL-FOUNDER-02 | src/evolution/autonomy-activity.js, src/evolution/autonomy-control.js | tests/autonomy-activity-detail.test.mjs |
| MEL-UI-AUDIT-05 | Automatiser la recette hors ligne des contrôles matériels | MEL-UI-AUDIT-01, MEL-FOUNDER-06 | scripts/ui-production-audit.mjs, src/api/native-companion-fallback.js | tests/full-interface-computer.test.mjs |
| MEL-UI-AUDIT-06 | Automatiser la recette des contrôles WORK, mémoire, Council, LoRA et connexions | MEL-UI-AUDIT-01, MEL-FOUNDER-05, MEL-COUNCIL-OPS-02, MEL-FOUNDER-08 | scripts/ui-production-audit.mjs, src/professor-live-learning-entry.js | tests/full-interface-control-surface-audit.test.mjs |
| MEL-UI-AUDIT-07 | Automatiser la régression d’accessibilité et des parcours de release | MEL-UI-AUDIT-01, MEL-UI-AUDIT-02, MEL-UI-AUDIT-03, MEL-UI-AUDIT-04, MEL-UI-AUDIT-05, MEL-UI-AUDIT-06 | scripts/ui-production-audit.mjs | tests/ui-audit-controls.test.mjs |
| MEL-MANIFEST-01 | Implémenter le registre calculé des priorités du manifeste | MEL-FOUNDER-02 | src/roadmap/manifest-01-acceptance.js | tests/autonomy-readiness.test.mjs |
| MEL-MANIFEST-02 | Ajouter la recette de reprise MAX après interruption et release | MEL-FOUNDER-02 | src/evolution/autonomy-runtime-lease.js, src/evolution/autonomy-runtime-core.js | tests/autonomy-runtime-lease.test.mjs |
| MEL-MANIFEST-03 | Raccorder la livraison d’une compétence au CapabilityBus unique | MEL-FOUNDER-03 | src/capabilities/capability-bus.js | tests/expanded-capability-bus.test.mjs |
| MEL-MANIFEST-04 | Raccorder la sauvegarde vérifiée au garde de changement risqué | MEL-FOUNDER-07 | src/backup/system-backup-runtime.js, src/backup/restore-service.js | tests/predeploy-d1-restore-proof.test.mjs |
| MEL-MANIFEST-05 | Corriger le comptage d’appels de l’audit profond | MEL-FOUNDER-01 | src/capabilities/capability-audit-capability.js | tests/self-audit-deep.test.mjs |
| MEL-MANIFEST-06 | Renforcer la recette d’époque et de non-reprise des jobs annulés | MEL-FOUNDER-02 | src/evolution/autonomy-job-epoch.js | tests/autonomy-runtime-epoch.test.mjs |
| MEL-MANIFEST-07 | Rendre l’admission des découvertes atomique et dédupliquée | MEL-FOUNDER-02, MEL-FOUNDER-03 | src/evaluation/capability-watch-runtime.js | tests/gen2/capability-watch.test.mjs |
| MEL-MANIFEST-08 | Coder le contrat des cinq lectures Gmail et de leurs erreurs | MEL-FOUNDER-01 | src/capabilities/google-workspace-capabilities.js, src/connectors/google-oauth-runtime.js | tests/native-chat-connected-replay.test.mjs |
| MEL-MANIFEST-09 | Implémenter le lien écart mesuré vers compétence versionnée | MEL-FOUNDER-03, MEL-FOUNDER-04, MEL-COUNCIL-OPS-01 | src/roadmap/evolution-storage.js | tests/autonomy-runtime-evolution-queue-progress.test.mjs |
| MEL-MANIFEST-10 | Coder l’agrégation vérifiable de l’avancement du manifeste | MEL-MANIFEST-01, MEL-MANIFEST-02, MEL-MANIFEST-03, MEL-MANIFEST-04, MEL-MANIFEST-05, MEL-MANIFEST-06, MEL-MANIFEST-07, MEL-MANIFEST-08, MEL-MANIFEST-09 | src/roadmap/manifest-01-acceptance.js | tests/autonomy-readiness.test.mjs |
| MEL-CHAT-01 | Compléter les cas contrastifs du dispatch d’intention du chat | MEL-FOUNDER-01 | src/api/chat-media-intent.js | tests/chat-media-understanding.test.mjs |
| MEL-CHAT-02 | Fiabiliser livraison, archive et relecture des médias du chat | MEL-CHAT-01 | src/api/chat-media.js, src/api/generated-media.js, src/pages/chat-rich-renderer.js | tests/chat-media-chain.test.mjs |
| MEL-CHAT-03 | Raccorder les preuves de lecture des octets multimédias au rendu | MEL-CHAT-02 | src/media/image-vision-runtime.js, src/media/video-runtime.js | tests/chat-verified-media-context.test.mjs |
| MEL-CHAT-04 | Compléter le diagnostic de code par lectures fixées au SHA | MEL-FOUNDER-01 | src/capabilities/github-code-capabilities.js | tests/chat-code-investigation.test.mjs |
| MEL-CHAT-05 | Corriger le classement et la couverture de recherche de symboles | MEL-CHAT-04 | src/capabilities/github-code-capabilities.js | tests/github-code-search-relevance.test.mjs |
| MEL-CHAT-06 | Implémenter le corpus versionné et le collecteur de recette chat | MEL-CHAT-01, MEL-CHAT-02, MEL-CHAT-03, MEL-CHAT-04, MEL-CHAT-05, MEL-CHAT-08 | src/learning/operator-actions.js | tests/operator-learning-actions.test.mjs |
| MEL-CHAT-07 | Raccorder les sous-demandes et corrections utilisateur au garde qualité | MEL-CHAT-06 | src/api/response-quality.js | tests/response-quality.test.mjs |
| MEL-CHAT-08 | Fiabiliser les contrats de dispatch et de rendu des outils du chat | MEL-FOUNDER-01 | src/capabilities/capability-bus.js, src/capabilities/google-workspace-capabilities.js, src/api/agent-tools.js | tests/expanded-capability-bus.test.mjs |
| MEL-COUNCIL-OPS-01 | Raccorder le catalogue opérationnel au contexte des avis Council | MEL-FOUNDER-04 | src/council/operational-catalog.js | tests/council-operational-catalog.test.mjs |
| MEL-COUNCIL-OPS-02 | Implémenter les demandes Council typées vers les files canoniques | MEL-COUNCIL-OPS-01, MEL-FOUNDER-03 | src/council/operational-catalog.js, src/council/model-task-learning.js | tests/council-operational-catalog.test.mjs |
| MEL-LORA-CHAT-01 | Raccorder les défauts comportementaux au corpus LoRA et à sa recette | MEL-CHAT-06, MEL-CHAT-07, MEL-FOUNDER-08, MEL-COUNCIL-OPS-02 | src/learning/lora-objective-observer.js, src/learning/lora-canonical-dataset.js, src/learning/lora-impact-benchmark.js | tests/lora-training-heartbeat.test.mjs |
| MEL-LORA-MODE-01 | Fiabiliser le routage UNCENSORED et ses preuves de modèle effectif | MEL-FOUNDER-08, MEL-CHAT-08 | src/learning/chat-lora-binding.js | tests/chat-lora-binding.test.mjs |

## Executable topological scheduling trace (tests only)

MEL-FOUNDER-01 → MEL-FOUNDER-02 → MEL-FOUNDER-04 → MEL-FOUNDER-03 → MEL-FOUNDER-05 → MEL-FOUNDER-06 → MEL-FOUNDER-07 → MEL-MANIFEST-01 → MEL-MANIFEST-02 → MEL-MANIFEST-03 → MEL-MANIFEST-04 → MEL-MANIFEST-05 → MEL-MANIFEST-06 → MEL-MANIFEST-07 → MEL-MANIFEST-08 → MEL-AUDIT-02 → MEL-AUDIT-03 → MEL-COUNCIL-OPS-01 → MEL-MANIFEST-09 → MEL-MANIFEST-10 → MEL-UI-AUDIT-01 → MEL-UI-AUDIT-03 → MEL-UI-AUDIT-04 → MEL-AUDIT-04 → MEL-AUDIT-05 → MEL-AUDIT-06 → MEL-AUDIT-07 → MEL-CHAT-01 → MEL-CHAT-02 → MEL-CHAT-03 → MEL-UI-AUDIT-02 → MEL-CHAT-04 → MEL-CHAT-05 → MEL-CHAT-08 → MEL-CHAT-06 → MEL-FOUNDER-08 → MEL-CHAT-07 → MEL-COUNCIL-OPS-02 → MEL-UI-AUDIT-06 → MEL-UI-AUDIT-05 → MEL-LORA-CHAT-01 → MEL-LORA-MODE-01 → MEL-UI-AUDIT-07

## Validation and limitations

Targeted graph, scope, memory/D1 scheduling, replan preservation, CI receipt and existing completion tests pass. Production release and a real mission completion are still required; mocked test receipts are never production evidence. No production D1 mutation or LoRA activation has been performed by this audit.

LoRA: the separately requested free Kaggle c009 training completed in run 40786825749, 750 examples and 32 optimizer steps. The artifact remains TRAINED_UNBENCHMARKED with canonical benchmark pending; this audit does not promote it.

XP MEL : NON — reuse existing roadmap/provenance/exact-SHA/CAS lessons without duplicating them.
