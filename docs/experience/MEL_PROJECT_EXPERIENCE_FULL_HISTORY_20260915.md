# MEL — Expérience projet consolidée depuis l’origine

**Schéma :** `mel.project.experience/v1`  
**Consolidation :** 2026-09-15T21:30:00+02:00  
**Branche canonique observée au départ :** `candidate/mel-clean-autonomy` @ `8dae8ebe9181f251746ba4d77d11132f607e37cc`  
**Objet :** transformer l’historique du projet MEL/MELITURGOS en expérience exploitable sans confondre archives, tentatives, erreurs, corrections et vérité actuelle.

## Règles de lecture

Cette consolidation sépare quatre niveaux :

1. **Archive historique** : ce qui a réellement été tenté, cassé, corrigé, abandonné ou supersédé.
2. **Preuve technique** : commit/PR/test/CI/preview/déploiement/état D1, chacun conservant son niveau de preuve propre.
3. **Leçon causale** : problème → cause → correction → résultat.
4. **Règle active** : prévention réutilisable par MEL dans les futurs travaux.

Une ancienne erreur reste archivée mais n’est jamais promue comme état courant. Une PR ouverte n’est pas une fonctionnalité fusionnée. Un test vert n’est pas une preuve de production. Un script d’entraînement n’est pas une preuve d’apprentissage neuronal.

## Chronologie consolidée

### 5–7 septembre — genèse opérationnelle et premières limites

MEL s’est structuré autour d’un Worker Cloudflare, d’une interface française/mobile, d’une mémoire D1, de modèles Workers AI, d’un mode Professor/Teacher et d’une ambition d’autonomie. Le checkpoint du 7 septembre montre déjà Memory 2.0, DeviceBus, Model Registry/Router, sécurité Basic Auth/CSRF/rate-limit et une interface V5, mais révèle aussi une erreur structurante : le frontend appelait `/api/chat` alors que le backend `chat` n’existait pas encore. Deux tests échouaient sur `chat is not defined`. La leçon retenue est qu’une UI visuellement fonctionnelle ne doit jamais être qualifiée de fonctionnellement complète si son action principale casse de bout en bout.

### 8 septembre — architecture Gen2, archive, modèles et RAG

Les phases Gen2 0–6 ont modularisé conversations, mémoire, modèles, orchestration, synchronisation, audit, sécurité et recherche RAG. Les checkpoints de cette période montrent une forte progression des tests, mais aussi la naissance d’un principe qui deviendra central : **preuve locale négative ≠ preuve runtime réelle**. Un chemin qui échoue proprement sans binding DB/AI est sûr, mais cela ne prouve pas le chemin live avec D1/provider.

### 9–10 septembre — conversation non bloquante et Work DAG

La conversation a été découplée de la latence modèle : saisie toujours disponible, file FIFO, Stop distinct, pièces jointes et conservation des messages en attente. Le Work DAG a ajouté un état borné et observable pour l’autonomie. Les premières promotions ont fait apparaître le besoin de distinguer strictement candidate, release et production, et de toujours relier les preuves à un SHA exact.

### 11–12 septembre — grande consolidation et vérité des capacités

La consolidation a comparé les branches au lieu de les fusionner aveuglément. Les branches divergentes ont été conservées comme références seulement ; les comportements manquants devaient être récupérés par **plus petit diff démontré**. Les thèmes/avatar, Mentor, compréhension naturelle, Dev Bridge, contrôle des devices et limites de coût ont été intégrés progressivement. Des tests fail-closed ont distingué `EXISTANT_ET_TESTE`, `PARTIEL`, `STUB`, `DEGRADED`, etc. Le mode zéro coût a imposé que l’incertitude sur un coût/provider entraîne un refus plutôt qu’une dépense implicite. Plusieurs corrections UI ont aussi démontré la nécessité de séparer mode simple et mode complet, d’éviter les contrôles dupliqués, et de préserver conversation/lecture après refresh.

### 14 septembre — XP, benchmark canonique et récupération Teacher

Le système XP a été durci : aucun XP ne peut être attribué sans gain positif vérifié **et** artefact durable. Une erreur a été découverte : un snapshot non récompensé pouvait abaisser la baseline canonique. La correction sépare `observed_xp` de l’XP réellement acquis et rend l’XP canonique monotone. Le benchmark a été ramené à une source de vérité unique et les gains de benchmark doivent désormais être accompagnés d’une comparaison canonique prouvée.

Le même jour, la boucle Teacher a reçu une récupération des états passifs : `WAITING_TEACHER` lié à un ancien SHA est archivé/requeue ; `READY_FOR_REVIEW` orphelin est requeue ; une chaîne Teacher valide reste intacte. Le SHA déployé devient une donnée explicite (`MEL_DEPLOYED_GIT_SHA`) au lieu de dépendre d’une seule lecture GitHub.

### 15 septembre — UI réelle, tests complets, autonomie continue et roadmap parallèle

Les vrais arrière-plans ont été suivis dans le dépôt et servis via Workers static assets. L’avatar a été ramené à une seule couche d’image, sans empilement de crops/transforms. Une correction importante du runner de tests a rendu la découverte récursive : elle a immédiatement exposé six fichiers de tests jusque-là invisibles. Leçon : **une CI verte basée sur une suite incomplète est un faux vert**.

Le bridge a ensuite été corrigé pour tester la vraie cible de smoke plutôt qu’un proxy de métadonnées. Pour l’autonomie, la continuité immédiate a été reliée à une preuve de completion exacte : après un job réellement vérifié COMPLETED, un seul tick borné est lancé ; sans preuve, aucun tick. Les tests WorkDag prouvent le chemin Teacher→reply→COMPLETED, mais le long fonctionnement live multi-heures reste un niveau de preuve distinct tant que la télémétrie D1 ne le démontre pas.

La roadmap a été parallélisée sur plusieurs pages avec des lots isolés : Timeline, versioning prompts/stratégies, MCP, capability watch, self-healing, agents/automations, Model Council, cold standby, SBOM/supply-chain, etc. Deux incidents de coordination sont devenus des règles permanentes : PR #34 fermée sans merge après collision MEL-EVOL-05, et PR #36 supersédée/reconstruite après dérive de la base. Une PR encore ouverte (GEN2-43 Model Watch, #28) reste explicitement **non canonique tant qu’elle n’est pas fusionnée et validée**.

## Catalogue causal complet (45 entrées)

### 01. `mel-exp-001-proof-tiers` — governance — verified_rule
**Période :** 2026-09-05..2026-09-15

**Problème.** Across MEL's early iterations, statements such as 'implemented', 'tested', 'deployed', and 'learned' were sometimes conflated even though they require different evidence.

**Cause.** Project state was distributed across chats, branches, CI, Cloudflare runtime, D1 and Drive evidence.

**Correction.** Use explicit proof tiers: intent/request < code present < local tests < exact-SHA CI < preview/smoke < production runtime < persistent D1 evidence. Never promote a claim to a stronger tier without its evidence.

**Leçon.** MEL must state the strongest proven tier and preserve uncertainty for every capability.

**Règle active.** Never claim live/deployed/persistent/learned state from code or tests alone.

**Preuves / références.** CHECKPOINT-2026-09-08-18-08.md; MEL_CONSOLIDATION_STATE.md; MEL XP 2026-09-14; MEL-EVIDENCE-20260915-UI-ASSETS-AUTONOMY-088fc735

### 02. `mel-exp-002-chat-backend-gap` — conversation — historical_error_resolved
**Période :** 2026-09-07

**Problème.** The UI called POST /api/chat while the backend chat function was missing, producing 'chat is not defined' and two failing tests.

**Cause.** Frontend completeness was treated separately from backend route completeness and the failure was deferred as non-P0.

**Correction.** Treat an interactive control as incomplete until its end-to-end backend target exists and is exercised by tests.

**Leçon.** A visually working UI is not functionally complete when a primary action returns 500.

**Règle active.** End-to-end test every primary UI action against its real backend target.

**Preuves / références.** checkpoint-pending-fixes-2026-09-07.md

### 03. `mel-exp-003-memory-archive-separation` — memory — verified_rule
**Période :** 2026-09-07..2026-09-15

**Problème.** MEL needs exhaustive history without turning every old attempt, error or stale state into current cognitive truth.

**Cause.** Project history includes superseded branches, rejected proposals, temporary states and verified facts.

**Correction.** Separate immutable/archive evidence from cognitive memory; attach provenance, confidence, temporality and contradiction status. New inferred facts must not be auto-confirmed.

**Leçon.** Raw history is evidence, not an instruction and not automatically current truth.

**Règle active.** Keep historical attempts searchable but label them; only verified lessons/rules become active project experience.

**Preuves / références.** src/memory/README.md; src/memory/memory-service.js; MEL_CONSOLIDATION_STATE.md

### 04. `mel-exp-004-gen2-modularization` — architecture — verified_lesson
**Période :** 2026-09-07..2026-09-08

**Problème.** The original Worker accumulated identity, chat, memory, orchestration and UI logic in one large runtime.

**Cause.** Fast prototyping favored inline compatibility code.

**Correction.** Gen2 introduced modular services for conversations, models, search/RAG, registry, persistence/security boundaries and sync.

**Leçon.** Keep compatibility shims bounded; new capability work should live in isolated modules with contracts and tests.

**Règle active.** Prefer small modules and ports over further growth of shared worker.js.

**Preuves / références.** CHECKPOINT-2026-09-08-18-08.md; checkpoint-pending-fixes-2026-09-07.md

### 05. `mel-exp-005-rag-fallback-truth` — search — verified_lesson
**Période :** 2026-09-08

**Problème.** RAG/search capability depended on model and D1 bindings that may be absent in local or degraded runtime.

**Cause.** Provider-bound and persistence-bound paths were initially easy to overstate based on unit tests.

**Correction.** Test missing-binding boundaries explicitly and fail closed with degraded status rather than fabricating results.

**Leçon.** A safe negative-path proof is valuable but does not prove the live provider/D1 path.

**Règle active.** Report missing-binding proof separately from live execution proof.

**Preuves / références.** CHECKPOINT-2026-09-08-18-08.md; MEL_CONSOLIDATION_STATE.md

### 06. `mel-exp-006-nonblocking-chat-queue` — conversation — verified_feature_lesson
**Période :** 2026-09-09

**Problème.** Conversation generation could block the user's ability to keep typing and queue follow-up messages.

**Cause.** Single in-flight interaction model coupled composer state to response generation.

**Correction.** Keep textarea editable, use FIFO pending queue, Enter send, Shift+Enter newline, separate Stop control, preserve pending messages and attachment payloads.

**Leçon.** Conversation UX must decouple user input from model latency.

**Règle active.** Never disable composing just because one response is in flight.

**Preuves / références.** PR #1 Grande MAJ: conversation non bloquante et file de messages

### 07. `mel-exp-007-workdag-bounded-state` — autonomy — verified_feature_lesson
**Période :** 2026-09-10

**Problème.** Autonomous work needed observable completion state without unbounded or privacy-leaking execution.

**Cause.** Roadmap work and autonomous execution lacked a compact, inspectable state contract.

**Correction.** Use a bounded Work DAG state/completion helper with explicit artifacts and tests.

**Leçon.** Autonomy must expose deterministic state transitions and completion evidence.

**Règle active.** No autonomous 'done' claim without a specific job state and evidence.

**Preuves / références.** PR #3 MEL-WORK-02: bounded Work DAG state

### 08. `mel-exp-008-production-human-gate` — deployment — verified_rule
**Période :** 2026-09-09..2026-09-15

**Problème.** Candidate work, release branches and production hotfixes can diverge while multiple pages work in parallel.

**Cause.** Many concurrent branches and pinned production release branches.

**Correction.** Keep production promotion explicitly human-gated; require exact-SHA CI/smoke/preview, preserve production tip before promotion, and re-test the exact merged result.

**Leçon.** A green ancestor is not proof for a later merged SHA.

**Règle active.** Promote only the exact SHA that passed the required gates.

**Preuves / références.** MEL_CONSOLIDATION_STATE.md; PR #15 sync production tip into candidate before promotion; .github/workflows/deploy-candidate-preview.yml

### 09. `mel-exp-009-no-wholesale-divergent-merge` — git — verified_rule
**Période :** 2026-09-11..2026-09-12

**Problème.** Several historical feature/candidate branches diverged substantially and contained stale removals/reversions.

**Cause.** Parallel experimentation on long-lived branches.

**Correction.** Compare against clean candidate; recover only the smallest demonstrated missing behavior/test/file. Never cherry-pick or merge a divergent branch wholesale.

**Leçon.** Containment/compare evidence beats branch names or old status labels.

**Règle active.** Before every recovery, compare fresh HEAD and take only the minimal missing unit.

**Preuves / références.** MEL_CONSOLIDATION_STATE.md

### 10. `mel-exp-010-refetch-before-write` — collaboration — verified_rule
**Période :** 2026-09-11..2026-09-15

**Problème.** Multiple ChatGPT pages can advance the same candidate between inspection and write.

**Cause.** Concurrent autonomous/roadmap work.

**Correction.** Refetch canonical HEAD immediately before writes, reserve isolated paths, and do not overwrite an advanced head.

**Leçon.** Optimistic assumptions about branch state create silent collisions.

**Règle active.** Every parallel task must reserve files/lot and re-check HEAD/open PRs before mutation.

**Preuves / références.** MEL_CONSOLIDATION_STATE.md; PR #16 Timeline; PR #26 MCP compatibility

### 11. `mel-exp-011-collision-close-loser` — collaboration — historical_error_resolved
**Période :** 2026-09-15

**Problème.** Two pages independently opened work for MEL-EVOL-05 and overlapped on tests/gen2/skill-registry.test.mjs.

**Cause.** Task reservation happened too late relative to parallel page execution.

**Correction.** PR #34 was closed unmerged when PR #33 had already claimed the same lot.

**Leçon.** When overlap is detected, do not attempt an ambiguous merge; keep one authoritative implementation and abandon the duplicate.

**Règle active.** Collision detected => stop, compare, close/supersede duplicate, then move to a distinct lot.

**Preuves / références.** PR #34 closed unmerged due anti-collision

### 12. `mel-exp-012-stale-branch-rebuild` — collaboration — historical_error_resolved
**Période :** 2026-09-15

**Problème.** A regression-gate branch became ambiguous after concurrent candidate advances.

**Cause.** The base changed while the page was working.

**Correction.** PR #36 was closed unmerged and superseded by a clean branch rebuilt from the newer candidate head.

**Leçon.** Rebase/rebuild from current canonical head when provenance becomes ambiguous.

**Règle active.** Never promote a stale ambiguous branch just because its local tests passed.

**Preuves / références.** PR #36 MEL-EVAL-03 closed unmerged

### 13. `mel-exp-013-zero-cost-failclosed` — cost_safety — verified_rule
**Période :** 2026-09-11..2026-09-15

**Problème.** Provider-sensitive, D1-backed or metered capabilities may incur unknown cost or external effects.

**Cause.** Availability metadata does not prove zero added cost for execution.

**Correction.** Unknown added cost fails closed; deep execution is restricted to exact capabilities with explicit zero-added-cost proof. Paid mentor bridge was disabled in zero-euro mode and fail-soft behavior preserves MEL responsiveness.

**Leçon.** Provider availability is not permission to spend.

**Règle active.** Default to zero-cost/read-only; require explicit proof/approval before metered or external actions.

**Preuves / références.** MEL_CONSOLIDATION_STATE.md; config: disable paid OpenAI mentor bridge for zero-euro loop; fix: make zero-euro mentor room fail soft and keep MEL responsive

### 14. `mel-exp-014-capability-truth-status` — evaluation — verified_rule
**Période :** 2026-09-11..2026-09-15

**Problème.** A capability can exist in code yet be untested, degraded, stubbed or blocked at runtime.

**Cause.** Binary done/not-done labels hide important evidence gaps.

**Correction.** Maintain explicit statuses such as EXISTANT_ET_TESTE, EXISTANT_NON_TESTE, PARTIEL, STUB, NOT_IMPLEMENTED and runtime/degraded states.

**Leçon.** Capability truth must encode evidence quality, not just code presence.

**Règle active.** Do not collapse implementation, availability and verified runtime into one status.

**Preuves / références.** MEL_CONSOLIDATION_STATE.md

### 15. `mel-exp-015-natural-intent-failclosed` — intent — verified_lesson
**Période :** 2026-09-11..2026-09-12

**Problème.** Contextual French commands such as 'fais-le', 'continue' or 'corrige tout' can be ambiguous.

**Cause.** Regex-only intent routing cannot reliably resolve ellipsis/context.

**Correction.** Use semantic/context fallback with conversation/request keys, confidence threshold and fail-closed behavior on unrelated chat, low confidence, malformed output or provider errors.

**Leçon.** Natural development commands need contextual resolution but must never fabricate intent.

**Règle active.** Low-confidence semantic development intent => no autonomous development action.

**Preuves / références.** MEL_CONSOLIDATION_STATE.md

### 16. `mel-exp-016-ui-mode-separation` — ui — verified_rule
**Période :** 2026-09-11..2026-09-15

**Problème.** Technical status controls and duplicate widgets leaked between simple and full modes during UI iterations.

**Cause.** Shared wrappers and incremental UI patches blurred role boundaries.

**Correction.** Keep simple mode conversational; keep verified MEL status/technical controls in full mode unless intentionally designed. Remove duplicate controls.

**Leçon.** One control must have one role and one home.

**Règle active.** Mode-specific controls require regression tests preventing leakage/duplication.

**Preuves / références.** fix(ui): keep MEL status control in full mode only; test(ui): status control belongs to full mode only; MEL_CONSOLIDATION_STATE.md

### 17. `mel-exp-017-chat-refresh-persistence` — conversation — verified_lesson
**Période :** 2026-09-12

**Problème.** Multi-chat state, latest answer and reading position could be lost or inconsistent after refresh.

**Cause.** Reader/UI state was not fully persisted/restored.

**Correction.** Restore multi-chat/latest answer and reader position; enlarge resizable reply window.

**Leçon.** Conversation continuity is part of functional correctness, not cosmetic polish.

**Règle active.** Refresh must preserve the canonical latest conversation/reading state.

**Preuves / références.** fix(control-room): restore multi chat and latest answer after refresh; feat(control-room): enlarge resizable reply window and restore reading position

### 18. `mel-exp-018-teacher-stale-state-recovery` — teacher_autonomy — verified_feature_lesson
**Période :** 2026-09-14

**Problème.** MEL could remain indefinitely in WAITING_TEACHER or orphan READY_FOR_REVIEW.

**Cause.** Teacher requests tied to obsolete candidate SHAs and incomplete review chains were not automatically recovered.

**Correction.** Run recovery sweep each non-paused cycle; archive stale Teacher request and requeue against canonical SHA; requeue orphan review state; preserve valid review chain.

**Leçon.** Passive states need explicit stale/orphan recovery.

**Règle active.** A passive state without current-SHA/full-chain proof must be re-evaluated, not left forever.

**Preuves / références.** MEL checkpoint 2026-09-14 Teacher recovery — 2ebba4309ff5

### 19. `mel-exp-019-canonical-deployed-sha` — teacher_autonomy — verified_rule
**Période :** 2026-09-14

**Problème.** Relying only on an unauthenticated GitHub lookup for current candidate identity can stale or fail.

**Cause.** External lookup is not a reliable single source for deployed runtime identity.

**Correction.** Use MEL_DEPLOYED_GIT_SHA supplied by deployment as canonical runtime SHA, while keeping GitHub evidence supplementary.

**Leçon.** Runtime must know exactly which code it is executing.

**Règle active.** Tie Teacher/review/autonomy evidence to the deployed exact SHA.

**Preuves / références.** MEL checkpoint 2026-09-14 Teacher recovery — 2ebba4309ff5

### 20. `mel-exp-020-xp-evidence-gate` — learning — verified_rule
**Période :** 2026-09-14

**Problème.** XP could be computed from observations without a durable proof gate.

**Cause.** The initial XP view lacked a single canonical writer enforcing evidence and monotonicity.

**Correction.** recordLearningXpCheckpoint derives from buildLearningProgress and awards delta only for strict positive verified gain plus durable artifact.

**Leçon.** XP is an evidence ledger, not a decorative progress number.

**Règle active.** No durable artifact + no proven gain => no XP award.

**Preuves / références.** MEL XP 2026-09-14

### 21. `mel-exp-021-xp-monotonicity-bug` — learning — historical_error_resolved
**Période :** 2026-09-14

**Problème.** A non-rewarded XP snapshot could persist xp_after=observed progress and lower the canonical baseline.

**Cause.** Observed score and acquired canonical XP were stored in the same field.

**Correction.** Keep xp_after monotonic at previousXp when no gain is proven; store raw observed score separately as observed_xp.

**Leçon.** Measurement may regress; acquired XP must not.

**Règle active.** Separate observed performance from monotonic earned progress.

**Preuves / références.** MEL XP 2026-09-14

### 22. `mel-exp-022-single-benchmark-source` — learning — verified_rule
**Période :** 2026-09-14

**Problème.** Benchmark cases had more than one source of truth.

**Cause.** Compatibility facade duplicated canonical benchmark metadata.

**Correction.** Derive facade fields directly from CANONICAL_LEARNING_BENCHMARK_SUITE and test structural equality.

**Leçon.** Learning evaluation must have one canonical benchmark definition.

**Règle active.** No duplicated benchmark cases/weights/objectives.

**Preuves / références.** MEL XP 2026-09-14

### 23. `mel-exp-023-benchmark-proof-for-xp` — learning — verified_rule
**Période :** 2026-09-14

**Problème.** Baseline/latest numbers alone could be mistaken for sufficient proof of improvement.

**Cause.** Numerical deltas were not always bound to canonical comparison artifacts.

**Correction.** Require eligible canonical baseline→candidate comparison evidence before benchmark-derived XP.

**Leçon.** A number without provenance is not learning proof.

**Règle active.** Benchmark improvement claims require canonical comparison evidence tied to exact run/SHA.

**Preuves / références.** MEL XP 2026-09-14

### 24. `mel-exp-024-no-fake-neural-learning` — learning — verified_rule
**Période :** 2026-09-14..2026-09-15

**Problème.** Prepared training infrastructure can be misdescribed as actual model learning.

**Cause.** LoRA plan/scripts exist before a trained compatible artifact and comparable benchmark exist.

**Correction.** Use explicit statuses such as NOT_TRAINED and TRAINED_UNBENCHMARKED; never claim weights changed without artifact+benchmark proof.

**Leçon.** Code that can train is not training; a trained artifact is not validated improvement.

**Règle active.** Neural-learning success requires real artifact, compatibility proof and measured canonical benchmark gain.

**Preuves / références.** MEL XP 2026-09-14; MEL-EVIDENCE-20260915-aa336cc695e5-lora-drive-guard

### 25. `mel-exp-025-recursive-test-discovery` — testing — historical_error_resolved
**Période :** 2026-09-15

**Problème.** The old npm test runner did not recurse through tests/, so several Gen2/integration/UI tests were silently omitted and CI could appear greener than reality.

**Cause.** Incomplete test discovery.

**Correction.** Make scripts/run-tests.mjs recursively discover *.test.mjs; the corrected runner immediately exposed six failing test files.

**Leçon.** A green CI is meaningless if the runner does not enumerate the full intended suite.

**Règle active.** Test discovery completeness is itself a tested release gate; never weaken tests to get green.

**Preuves / références.** MEL-EVIDENCE-20260915-aa336cc695e5-lora-drive-guard; MEL_CONSOLIDATION_STATE.md

### 26. `mel-exp-026-real-target-bridge-test` — testing — historical_error_resolved
**Période :** 2026-09-15

**Problème.** A bridge regression fixture targeted package metadata instead of the runtime smoke target.

**Cause.** Proxy assertion did not exercise the actual failure surface.

**Correction.** Repair fixture so it fails and recovers the actual smoke-test target; keep deployment blocked until full CI is green.

**Leçon.** Regression tests must reproduce the real failure path.

**Règle active.** Never accept a proxy test that can pass while the user-visible/runtime target is still broken.

**Preuves / références.** MEL-EVIDENCE-20260915-bfb8af5-bridge-repair

### 27. `mel-exp-027-autonomy-immediate-bounded-continuation` — autonomy — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** A completed work item could leave MEL idle instead of immediately continuing the autonomous loop.

**Cause.** Completion reconciliation and next autonomy tick were disconnected.

**Correction.** After exact job completion is verified by GitHub/CI reconciliation, trigger exactly one bounded runAutonomyRuntimeTick. No proof => no tick. Tick failure remains visible without falsifying completion.

**Leçon.** Autonomy continuation must be event-driven, bounded and evidence-gated.

**Règle active.** Exactly one next tick per newly verified completion, with idempotency and visible failure.

**Preuves / références.** MEL-EVIDENCE-20260915-AUTONOMY-CONTINUATION-3f557e4d

### 28. `mel-exp-028-code-proof-vs-live-autonomy` — autonomy — current_unproven_guard
**Période :** 2026-09-15

**Problème.** WorkDag tests proved Teacher request→reply→COMPLETED, but that did not prove a multi-hour live D1 chain of autonomous roadmap jobs.

**Cause.** Unit/integration path proof was stronger than available live telemetry.

**Correction.** Keep live-long-run claim explicitly unproven until runtime D1 telemetry demonstrates repeated cycles.

**Leçon.** Do not upgrade deterministic test proof into a live endurance claim.

**Règle active.** Long-run autonomy status must cite live runtime evidence, not only tests.

**Preuves / références.** MEL-EVIDENCE-20260915-UI-ASSETS-AUTONOMY-088fc735

### 29. `mel-exp-029-real-assets-static-serving` — ui — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Theme visuals referenced generated/old scenes and static assets were not consistently served as tracked Worker assets.

**Cause.** UI theme mapping and Workers asset serving evolved separately.

**Correction.** Track user-approved WebP backgrounds under dist/assets/backgrounds, serve dist via Workers static assets, and map themes to tracked assets.

**Leçon.** Visual state must be reproducible from repository-tracked assets.

**Règle active.** No production theme should depend on an untracked/local/generated-only asset reference.

**Preuves / références.** MEL-EVIDENCE-20260915-UI-ASSETS-AUTONOMY-088fc735

### 30. `mel-exp-030-avatar-single-layer` — ui — historical_error_resolved
**Période :** 2026-09-15

**Problème.** Avatar rendering accumulated duplicate underlying img layers and crop/transform stacking.

**Cause.** Multiple visual patches overlaid independent avatar techniques.

**Correction.** Use a single contained image layer with no transform/crop stacking and apply background-aware contrast.

**Leçon.** One visual subject should have one canonical rendering layer.

**Règle active.** Regression-test DOM for duplicate avatar layers and theme contrast.

**Preuves / références.** MEL-EVIDENCE-20260915-UI-ASSETS-AUTONOMY-088fc735

### 31. `mel-exp-031-lora-activation-gate` — learning — verified_rule
**Période :** 2026-09-15

**Problème.** An adapter could be activated before compatibility/integrity/performance were proven.

**Cause.** Training and activation are separate lifecycle stages.

**Correction.** Require compatible Cloudflare base/runtime pair, SHA-256, <=100 MB, rank <=32, base/runtime match, measured gain and canonical benchmark proof before activation.

**Leçon.** TRAINED_UNBENCHMARKED is not deployable learning.

**Règle active.** Fail closed on LoRA activation until every compatibility and benchmark gate passes.

**Preuves / références.** MEL-EVIDENCE-20260915-aa336cc695e5-lora-drive-guard

### 32. `mel-exp-032-timeline-append-only` — memory — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Project/memory chronology needs deterministic append-only event semantics and safe query filters.

**Cause.** Ad-hoc history structures are hard to validate and deduplicate.

**Correction.** GEN2-12 Timeline validates events/queries, clones defensively, orders deterministically and fails closed on duplicate/not-found.

**Leçon.** Chronology is a first-class data contract.

**Règle active.** Use validated append-only events for timeline history; do not mutate past event truth silently.

**Preuves / références.** PR #16 GEN2-12 Timeline domain service

### 33. `mel-exp-033-prompt-strategy-versioning` — evolution — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Prompts/strategies need rollback and provenance as MEL evolves.

**Cause.** Mutable prompt state without versioning makes regression recovery ambiguous.

**Correction.** GEN2-52 adds version registry, active version selection, rollback and portable snapshot import/export.

**Leçon.** Behavioral configuration should be versioned like code.

**Règle active.** Never overwrite a prompt/strategy without retaining a rollback target.

**Preuves / références.** PR #17; PR #25 Release GEN2-52 minimal

### 34. `mel-exp-034-mcp-capability-authority` — connectors — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** MCP protocol compatibility could bypass MEL's internal authorization/validation if treated as a separate execution authority.

**Cause.** External protocol adapters can accidentally duplicate policy logic.

**Correction.** GEN2-50 MCP adapter maps modern/legacy protocol to CapabilityBus while keeping CapabilityBus authoritative for validation, authorization and audit.

**Leçon.** Protocol adapters translate; they do not own security policy.

**Règle active.** All connector/MCP execution must terminate in the canonical capability authorization path.

**Preuves / références.** PR #26 GEN2-50 MCP ecosystem compatibility

### 35. `mel-exp-035-agents-permission-tiers` — automations — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Agents/automations can perform actions with different risk and replay semantics.

**Cause.** Automation identity alone is insufficient authorization.

**Correction.** GEN2-39 binds automation_id+agent_id, requires capabilities, uses monotone READ<SAFE_WRITE<SENSITIVE<DESTRUCTIVE tiers, explicit destructive approval, fail-closed disabled state and idempotent run claims.

**Leçon.** Automation permission is explicit, scoped and replay-safe.

**Règle active.** Destructive/sensitive automation actions require exact permission/approval and idempotency.

**Preuves / références.** PR #37 GEN2-39 permissioned agents / automations policy

### 36. `mel-exp-036-self-healing-controlled` — resilience — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Self-healing can become unsafe if detection directly triggers mutation.

**Cause.** Diagnosis, repair and rollback have different evidence/approval requirements.

**Correction.** GEN2-18 requires evidence before mutation, tested/reversible repairs, exact approval for production repair/rollback and owner halt precedence.

**Leçon.** Repair is a governed transaction, not a reflex.

**Règle active.** No self-heal mutation without diagnosis evidence, reversibility and required approval.

**Preuves / références.** PR #35 GEN2-18 controlled self-healing policy

### 37. `mel-exp-037-cold-standby-not-active` — resilience — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** A prepared standby could be mistaken for automatic failover authorization.

**Cause.** Readiness and activation were not explicitly separated.

**Correction.** MEL-RES-04 separates READY from activation; verifies recovery bundle hash/restore/integrity, requires authorized encrypted destination and exact manual activation approval; auto activation prohibited.

**Leçon.** Disaster-recovery readiness is not permission to switch production.

**Règle active.** Cold standby activation is always explicit and owner-halt aware.

**Preuves / références.** PR #46 MEL-RES-04 authorized cold standby contract

### 38. `mel-exp-038-model-task-learning-verified` — models — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Model routing learning can overfit noisy/unverified observations or hidden cost.

**Cause.** Task/model outcomes vary in quality, latency, reliability and price.

**Correction.** MEL-COUNCIL-04 learns only from verified idempotent results, ranks explainably, tracks confidence/sample count and defaults maxCostEur to zero.

**Leçon.** Adaptive routing must learn only from trusted evidence and explicit cost policy.

**Règle active.** Unverified model results do not update routing preference.

**Preuves / références.** PR #45 MEL-COUNCIL-04 verified model-task learning

### 39. `mel-exp-039-supply-chain-sbom` — security — verified_feature_lesson
**Période :** 2026-09-15

**Problème.** Runtime dependency/supply-chain state needed an explicit gate.

**Cause.** Package-level security is separate from application tests.

**Correction.** MEL-SEC-03 adds runtime SBOM/supply-chain gate with isolated tests and exact candidate CI/Teacher/preview validation before release.

**Leçon.** Green functional tests do not replace supply-chain evidence.

**Règle active.** Release security gate includes dependency/SBOM verification.

**Preuves / références.** PR #51 Release MEL-SEC-03 minimal

### 40. `mel-exp-040-current-model-watch-open` — models — current_open_not_merged
**Période :** 2026-09-15

**Problème.** GEN2-43 Model Watch is currently an open parallel PR and must not be treated as canonical merged state.

**Cause.** Parallel roadmap work is still ongoing.

**Correction.** Reserve its files and keep its status OPEN until merge/validation evidence exists.

**Leçon.** Open PRs are proposals, not project truth.

**Règle active.** Do not claim GEN2-43 Model Watch as merged/production until the PR actually merges and gates pass.

**Preuves / références.** Open PR #28 feat(eval): implement GEN2-43 Model Watch

### 41. `mel-exp-041-noop-marker-noise` — git — historical_error_resolved
**Période :** 2026-09-11..2026-09-12

**Problème.** Temporary/noop/marker commits and accidental placeholder files created history noise.

**Cause.** Using repository commits as ad-hoc trigger/marker mechanism.

**Correction.** Remove accidental placeholders/temporary release markers and rely on explicit workflows/status evidence.

**Leçon.** Commit history should represent durable project state, not transient signaling.

**Règle active.** Avoid noop/placeholder commits when a workflow dispatch/status artifact can express the event.

**Preuves / références.** noop/placeholder/temporary marker commits later removed

### 42. `mel-exp-042-drive-evidence` — evidence — verified_rule
**Période :** 2026-09-14..2026-09-15

**Problème.** Git commits/CI do not always preserve the causal narrative of a failure, diagnosis and correction.

**Cause.** Technical diffs omit user-visible context and cross-page reasoning.

**Correction.** Persist sanitized Drive evidence/checkpoints tied to run, SHA, tests, date and status; fail explicitly if evidence write cannot occur.

**Leçon.** Durable external evidence complements Git without becoming a second source of runtime truth.

**Règle active.** Every important correction should have reproducible code/CI evidence plus a durable causal checkpoint.

**Preuves / références.** MEL XP 2026-09-14; MEL-EVIDENCE-20260915-aa336cc695e5-lora-drive-guard

### 43. `mel-exp-043-production-data-no-secret` — security — verified_rule
**Période :** 2026-09-07..2026-09-15

**Problème.** Experience/memory ingestion could accidentally persist secrets or unsafe external instructions.

**Cause.** Project evidence comes from chats, files, web and connectors.

**Correction.** Reject secrets from memories/knowledge imports, treat external content as untrusted data, sanitize diagnostics and keep provenance.

**Leçon.** Experience is data, never system authority.

**Règle active.** Never store credentials/tokens/passwords in MEL experience; redact/sanitize before durable evidence.

**Preuves / références.** worker memory/knowledge guards; .github/workflows/deploy-candidate-preview.yml

### 44. `mel-exp-044-ui-asset-proof-vs-prod` — ui — verified_rule
**Période :** 2026-09-15

**Problème.** A candidate UI checkpoint can be fully green without being authorized or actually deployed to production.

**Cause.** Candidate preview/CI and production release are separate gates.

**Correction.** Evidence docs explicitly marked production NOT TOUCHED even after CI green.

**Leçon.** Do not infer production state from candidate success.

**Règle active.** Always report candidate/preview/production separately.

**Preuves / références.** MEL-EVIDENCE-20260915-UI-ASSETS-AUTONOMY-088fc735

### 45. `mel-exp-045-exact-job-claim-preflight` — autonomy — current_verified_fix
**Période :** 2026-09-15

**Problème.** Already-claimed bridge work could remain eligible in preflight and be selected again.

**Cause.** Claim state was not excluded early enough from preflight filtering.

**Correction.** Current candidate HEAD 8dae8ebe fixes preflight so claimed bridge work stays out.

**Leçon.** Claiming must atomically remove work from future eligibility.

**Règle active.** Preflight must exclude claimed/in-progress work to prevent duplicate execution.

**Preuves / références.** candidate/mel-clean-autonomy HEAD 8dae8ebe: fix: keep claimed bridge work out of preflight

## Politique d’ingestion dans MEL

Les entrées ci-dessus sont importées dans la mémoire D1 comme `kind=lesson`, source `project_experience_consolidation_v1`, avec un fingerprint SHA-256 du contenu normalisé. L’opération est idempotente : réexécuter l’import ne crée pas de doublons.

Les contenus historiques mentionnent explicitement leur temporalité (`historical_error_resolved`, `current_open_not_merged`, etc.). Ils restent disponibles comme expérience sans être confondus avec l’état courant. Les secrets/identifiants ne sont pas inclus.

## Principe général appris

**MEL doit apprendre de ce qui a été prouvé, et apprendre aussi des erreurs — mais jamais transformer une tentative, un faux vert, une branche abandonnée ou un état ancien en vérité actuelle.**
