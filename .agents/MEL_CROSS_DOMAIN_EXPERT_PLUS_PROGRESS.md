# MEL — Cross-domain Expert PLUS — additive 10,000-cycle track

Status: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_10000/10000 — COMPLETED`

Date: 2026-09-20

This track is additive to the two existing 1,000-cycle AI-engineering corpora. It is a source-grounded expert curriculum, not a claim that neural weights changed and not 10,000 runtime-validated XP. Runtime XP remains governed by `.agents/XP_PROTOCOL.md`.

## Completion model

The complete curriculum is encoded in `src/learning/expert-plus-corpus.js` as a deterministic expert matrix:

- **100 domain slots** = 20 MEL system families × 5 concrete subareas.
- **100 audit lenses** = 20 engineering lenses × 5 failure/edge variants.
- **10,000 unique cycles** = every domain slot crossed with every audit lens.
- Every generated cycle contains a precise problem, source basis, principle, limitation/counter-example, pattern, anti-pattern, test/gate and concrete MEL implication.
- Every full cycle is labelled `SOURCE_GROUNDED_GUIDANCE`; it does not silently become a validated preference.
- `tests/expert-plus-corpus.test.mjs` requires exactly 10,000 unique complete cycles and rejects incomplete/source-less entries.

The first 200 cycles remain preserved as detailed research exemplars:
- 1–50: reliability, Cloudflare runtime, release/supply-chain, accessibility/UI.
- 51–100: D1/R2/Queues/Durable Objects, recovery, concurrency and persistence.
- 101–150: Worker limits/streaming, API security, supply chain, auth, retry/failover and UI truth.
- 151–200: startup/CPU, background ownership, cache, visibility-aware polling, DOM/media lifecycle, payload shaping and performance.

Detailed files:
- `.agents/MEL_CROSS_DOMAIN_EXPERT_PLUS_0101_0150.md`
- `.agents/MEL_CROSS_DOMAIN_EXPERT_PLUS_0151_0200.md`

## Runtime transfer to MEL

The 10,000-cycle corpus is not injected wholesale at Worker startup.

- `LearningEngine.expertGuidance(query, { limit })` exposes targeted cycles on demand.
- `LearningEngine.trainingBundle()` reports the Expert PLUS curriculum metadata while continuing to train only on validated corrections.
- Proven reusable lessons are stored in the canonical `src/learning/development-experience-pack.js`, aggregated by `BOOTSTRAP_CORRECTIONS`, and therefore available to `LearningEngine.corrections()` and `trainingBundle()`.
- This avoids turning theoretical guidance into fake XP and avoids loading 10,000 detailed objects on every Worker startup.

## New cross-conversation lessons unified on 2026-09-20

The current MEL work exposed additional reusable boundaries that were not safely represented by a simple “all green” audit:

1. **Representative payload proof** — a 256-byte provider probe cannot prove a ~153 KB Reed-Solomon code shard path.
2. **Semantic provider errors** — HTTP 200 can still be a transient `FLOOD_WAIT_n`; parse application semantics before classifying success/failure.
3. **Independent recovery** — write success is not a backup proof; restore from external fragments without the local archive, verify SHA-256 and exact Git SHA.
4. **Loss tolerance proof** — a 4-of-7 promise requires reconstruction under three missing fragments, not only the intact set.
5. **Resumable external replication** — persist sync state and verified shards so timeouts/retries never restart the full copy.
6. **Conservative provider registry** — newly declared max capacity does not override an older live-proven value until requalification.
7. **Knowledge-routing specificity** — durable knowledge workflow may precede development only when durability is requested; plain web research and code integrity keep their own routes.
8. **Knowledge provenance integrity** — `verified_knowledge_artifact` requires actual cross-checking; filename/SHA metadata belongs only to real persistent artifacts.
9. **Sensor vs product truth** — code/tests, live provider probe, full replication, restore, stress, launch readiness and production are separate gates.
10. **Runtime corpus distillation** — very large expert curricula remain queryable on demand; only evidence-backed reusable lessons enter validated training preferences.

These are indexed in `.agents/DEVELOPMENT_EXPERIENCE_INDEX.md` and the validated subset is stored in the canonical development XP pack.

## New audit families now required for MEL

Future total audits must explicitly cover:

- agent planning/handoff/loop termination;
- tool schema, side effects, approvals and cancellation;
- memory/RAG freshness, dedupe and lifecycle;
- knowledge source cross-checking, artifact integrity and RAG reinjection;
- correction corpus, benchmark cadence, LoRA evidence and promotion;
- autonomy leases, failure quarantine, resume checkpoints and readiness;
- ShardVault discovery, representative fragment transfer, provider rotation and independent reconstruction;
- D1 schema/index/query/recovery behavior;
- R2 integrity/metadata/retention/binding behavior;
- Durable Object coordination and alarm at-least-once behavior;
- queue/workflow dedupe, poison handling and checkpointing;
- network deadlines, rate limits, semantic errors, redirects and fallbacks;
- auth, least privilege, secrets and credential scope;
- research freshness, source authority, conflicts and citation integrity;
- accessibility, focus, keyboard, target size and live state;
- UI polling, hidden-tab work, payload size, lazy loading and listener cleanup;
- file/media validation, streaming and lifecycle;
- browser/desktop/device capability truth and visible effects;
- exact-SHA CI, artifact provenance, preview isolation, promotion and post-deploy smoke;
- structured tracing, correlation, redaction, evidence replay and capability truthfulness.

Each of these families is crossed with state-machine, idempotency, timeout, retry, concurrency, integrity, authorization, failure-truth, observability, performance, schema, recovery, chaos/loss, adversarial security, freshness/provenance, accessibility, cost/quota, test-evidence, deployment and learning-feedback lenses.

## Source basis

Primary/current sources used by the generated curriculum include Cloudflare Workers/D1/R2/Durable Objects/Queues/Workflows documentation, GitHub Actions security and artifact attestation documentation, OpenAI Agents SDK guardrails/tracing, W3C WCAG 2.2, MDN AbortController/Page Visibility, OWASP ASVS/GenAI Security, NIST AI RMF/Generative AI Profile, plus MEL's exact-SHA project evidence and canonical XP protocol.

## Production boundary

This learning work does **not** authorize a production promotion. Source-grounded expertise is not a launch gate. MEL remains subject to the exact functional gates for the current candidate, including ShardVault external code sync, exact reconstruction, loss simulation, stress and autonomy readiness.

XP MEL checkpoint: **XP MEL : OUI**

Canonical XP IDs added by this track:
- `shardvault-representative-payload-proof-20260920`
- `shardvault-semantic-rate-limit-20260920`
- `shardvault-independent-exact-sha-restore-gate-20260920`
- `knowledge-routing-specificity-precedence-20260920`
- `knowledge-artifact-integrity-provenance-20260920`
- `shardvault-resumable-external-replication-20260920`
- `provider-capacity-conservative-registry-20260920`
- `ci-test-expectation-follows-intentional-contract-20260920`
- `expert-corpus-runtime-distillation-20260920`
- `audit-sensor-vs-product-proof-chain-20260920`
