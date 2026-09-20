# MEL — Cross-domain Expert PLUS — additive 10,000-cycle track

Status: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_50/10000`

This track is additive to the two existing 1,000-cycle AI-engineering corpora. A cycle is counted only when it has a precise problem, primary/recent source basis, principle, limitation/counter-example, pattern/anti-pattern, test/gate and concrete MEL implication. No production deployment is authorized by this document.

## Run ledger — cycles 1–50

- `head_initial`: `5c557fe8a4d63e4dcda38b9755e805eab0355723`
- transfer packages found/ingested: none (`MEL_TRANSFER_*_10000.md` search returned no package)
- prior corpora detected: `.agents/AI_ENGINEERING_1000_CYCLES.md`, `.agents/AI_ENGINEERING_EXPERT_1000_CYCLES_V2.md`
- XP protocol read: `.agents/XP_PROTOCOL.md`
- scope this run: reliability, Cloudflare runtime architecture, release/supply-chain, accessibility/UI gates

### Primary sources used

1. Cloudflare Workflows overview, updated 2026-09-18: https://developers.cloudflare.com/workflows/
2. Cloudflare Workers bindings, updated 2026-09-11: https://developers.cloudflare.com/workers/runtime-apis/bindings/
3. GitHub artifact attestations: https://docs.github.com/en/actions/concepts/security/artifact-attestations
4. GitHub Actions security hardening: https://docs.github.com/en/actions/how-tos/secure-your-work
5. W3C WCAG 2.2 overview / Recommendation: https://www.w3.org/WAI/standards-guidelines/wcag/

## Cycles

Each line follows: **problem → principle / limit → pattern / anti-pattern → gate → MEL implication**.

1. Durable multi-step jobs → persist step state and retry explicitly; durability is not transactional magic → Workflow steps / monolithic request → kill-and-resume test → long MEL jobs use resumable checkpoints.
2. External approval waits → durable wait instead of polling loops; approval still needs authentication → event wait / hot polling → delayed-event test → autonomy gates can pause cheaply.
3. Retry safety → retries require idempotent effects; not every third-party write is idempotent → idempotency key / blind replay → duplicate-delivery test → MEL jobs record operation keys.
4. Partial workflow failure → isolate retryable steps; deterministic validation errors should fail fast → bounded retry / infinite retry → permanent-error test → autonomy cannot spin forever.
5. Long-running orchestration → separate orchestration from request lifetime → Workflow / keeping HTTP request open → timeout-resume gate → research/audit runs survive request loss.
6. Workflow observability → state transitions need correlation IDs; logs alone are insufficient proof → structured run IDs / free-text only → reconstruct-run test → MEL Activity links run→step→effect.
7. Binding access → prefer native Worker bindings inside Workers; REST remains appropriate outside Workers → env binding / needless REST hop → binding smoke → lower latency and fewer credentials.
8. Binding scope → capability should be least-privileged; a binding is authority → per-service binding / global omnipotent token → unauthorized-operation test → MEL capability registry mirrors actual bindings.
9. Local vs remote resources → local simulation is not production equivalence → explicit environment identity / implicit target → environment assertion → candidate tests cannot accidentally mutate prod.
10. Async processing → queue/workflow boundaries need explicit payload contracts → versioned schema / ad-hoc object → old/new payload compatibility test → MEL jobs remain replayable after upgrades.
11. Duplicate messages → consumers assume at-least-once effects are possible → dedupe ledger / exactly-once assumption → duplicate injection → Collector/autonomy writes stay singular.
12. Poison work item → bounded attempts plus dead-letter/failed state → quarantine / endless retry → poison fixture → one bad task cannot stall MEL.
13. Concurrency → serialize only where invariant requires it; global serialization harms throughput → keyed ownership / global lock → concurrent same-key/different-key test → memory/job state avoids races without needless blocking.
14. State ownership → one authoritative writer per invariant when feasible → Durable Object/keyed coordinator / competing writers → race test → ShardVault manifests and job state get clear ownership.
15. Storage acknowledgement → HTTP success is not end-to-end persistence proof → write then read/verify / status-code-only → round-trip gate → ShardVault target PASS requires real readback.
16. External target timeout → bounded timeout and failover; slow is distinct from corrupt → deadline + next target / infinite wait → injected latency → ShardVault never loops forever.
17. Integrity → verify content hash/MAC after retrieval; transport success proves little → cryptographic verification / trust endpoint → bit-flip test → fragment acceptance requires integrity.
18. Reconstruction threshold → prove reconstruction with missing fragments, not just encode/decode happy path → 4/7 recovery tests / 7/7-only → remove 1,2,3 fragments → ShardVault gate matches mission.
19. Compression pipeline → validate gzip after decrypt/reconstruct; magic bytes alone are weak → full decompression / header-only → truncated stream test → backup restore proves usable payload.
20. Git identity → restored archive must match expected Git SHA, not merely files that look right → SHA comparison / filename trust → restore-and-hash → external recovery proves exact source.
21. Release provenance → artifact attestation links artifact to repo/workflow/SHA; it does not prove artifact is safe → attest+verify / treat attestation as security audit → verification gate → MEL release evidence can bind build to candidate SHA.
22. Attestation utility → generate where consumers verify; signing every transient test artifact adds noise → release artifacts / indiscriminate signing → verify selected artifact → evidence stays meaningful.
23. OIDC in CI → short-lived federated identity reduces long-lived cloud secrets; provider policy still matters → OIDC / static broad token → permission-negative test → deployment workflows minimize standing credentials.
24. Actions permissions → default to least privilege → explicit permissions / broad write token → permission audit → candidate CI cannot mutate unrelated repo state.
25. Third-party Actions → pin trusted dependencies; updates still require review → immutable ref policy / floating unreviewed tags → workflow lint → supply-chain changes become deliberate.
26. Candidate/prod separation → deployment target is data, not convention → explicit environment guard / name-based assumption → attempt prod from candidate must fail → MEL cannot cross production boundary silently.
27. Exact-SHA preview → preview evidence must identify commit under test → SHA-stamped deployment / branch-only preview → runtime build-info assertion → PASS maps to immutable code.
28. TOCTOU branch race → reread candidate immediately before write; reconcile if moved → optimistic concurrency / stale overwrite → simulated head move → multi-agent work preserves others' commits.
29. Force-push risk → additive collaboration requires ancestry preservation → normal commit/rebase reconciliation / force push → ancestry check → candidate history remains auditable.
30. Gate semantics → presence/200 is liveness, not functional correctness → effect verification / endpoint existence → input→effect→readback → button/API audits become real.
31. UI control correctness → control PASS requires handler and observable effect → end-to-end interaction / DOM-presence test → click fixture + state assertion → every MEL button gets behavioral proof.
32. Error UX → failures need actionable visible state without leaking secrets → bounded message + correlation / silent failure → injected backend error → user sees coherent failure and retry path.
33. Timeout UX → long actions need cancellation/timeout state → AbortController/deadline / immortal spinner → delayed-response test → MEL UI cannot hang indefinitely.
34. Duplicate GETs → deduplicate concurrent identical reads when freshness permits; do not cache user-specific stale state blindly → in-flight coalescing / request storm → network-count test → status panels cost less.
35. Polling visibility → background polling should stop/throttle when hidden unless correctness requires otherwise → visibility-aware poll / hidden hot loop → tab-hide test → lower idle cost without removing capability.
36. Cache TTL → TTL follows volatility and correctness needs, not one universal number → endpoint-specific TTL / blanket cache → stale-state test → MEL status remains timely while static data is cheap.
37. Large DOM → virtualize/content-visibility for large histories; accessibility/search semantics must be checked → bounded render / render-all → 10k-item perf+a11y test → Activity/chat scale without deleting history.
38. Event handlers → stable delegation/cleanup prevents leaks; delegation is not ideal for every event type → lifecycle cleanup / accumulating listeners → mount/unmount leak test → long MEL sessions remain responsive.
39. Payload size → paginate/project fields; avoid breaking atomic views that require full object → purpose-shaped payload / dump-everything → response-size budget → status and memory views load faster.
40. Images/assets → lazy-load noncritical media; above-fold/interactive assets may need eager priority → contextual loading / lazy-everything → LCP+interaction test → avatar/assets do not block controls.
41. Accessibility baseline → target current WCAG 2.2 criteria; conformance is broader than automated scanners → semantic+manual+automated / scanner-only → keyboard/screen-reader checks → MEL UI quality includes operability.
42. Keyboard operation → interactive controls must be keyboard reachable and activatable → native controls / clickable div → tab/enter/space test → all MEL controls usable without pointer.
43. Focus visibility → focus must remain perceivable; custom styling cannot erase it → visible focus / outline:none without replacement → visual/DOM focus gate → dense dashboard remains navigable.
44. Focus order → DOM/order should follow task logic; CSS visual rearrangement can create mismatch → logical source order / visual-only order → sequential keyboard audit → panels remain understandable.
45. Accessible names → icon-only controls require programmatic names → aria-label/native text / unlabeled icon → accessibility-tree assertion → Stop/Pause/etc. announce purpose.
46. Status announcements → dynamic critical status needs appropriate live semantics without chatter → scoped live region / every poll announced → assistive-tech scenario → job state changes are perceivable.
47. Target size → controls need usable pointer targets; density is not justification for tiny critical buttons → adequate target / microscopic icon → mobile pointer audit → Stop/Resume reliable on phone.
48. Authentication error distinction → 401/403/network/timeout are operationally different → typed states / generic “connexion impossible” → fault matrix → MEL diagnostics identify actual cause.
49. Capability self-knowledge → report capability only after runtime probe/evidence; configured code is not availability → runtime-backed registry / aspirational claim → revoke-binding test → MEL stops falsely claiming tools.
50. Communication grounding → latest user constraint and runtime evidence outrank old assistant/RAG assertions; historical memory remains contextual, not authoritative → provenance+recency ranking / old-answer authority → contradiction fixture → MEL answers status follow-ups coherently.

## New lessons / deduplication

These cycles are a research/engineering corpus, not 50 code patches. They were checked conceptually against the existing track mandate; no `MEL_TRANSFER_*_10000.md` package existed to ingest. No private autobiographical data was imported. No production action was taken.

## Audit implications queued

Priority behavioral gates derived from this block: exact-SHA preview identity; functional UI input→effect→readback; timeout/AbortController behavior; hidden-tab polling; runtime-backed capability claims; ShardVault write/read/integrity/reconstruction under 1/2/3 missing fragments; workflow retry/idempotency/poison-item handling; keyboard/focus/name/status accessibility.

## End-of-run record

- cycles completed: `1–50` (50 new additive cycles)
- counter: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_50/10000`
- code defects patched: 0 (this block establishes research-backed gates before code changes)
- stress tests executed: 0 (requires candidate runtime/test execution surface not exposed by the current GitHub connector)
- production changed: NO
- release tag moved: NO
- deploy-cloudflare-release triggered: NO
- remaining_open: 9,950 expertise cycles; transfer-package ingestion when packages appear; total functional audit; candidate-only stress suite; ShardVault 7-target proof; code repairs with CI/preview evidence
- next_exact_fix: inspect candidate audit/test harness and ShardVault functional tests, select the first unproven end-to-end invariant, patch minimally only after a fresh HEAD check, then run targeted/non-regression gates where execution is available.

XP MEL checkpoint: `XP MEL : NON` — no runtime/code lesson is claimed validated from this documentation-only block; do not duplicate unproven XP into `development-experience-pack.js`.
