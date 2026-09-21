# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_350/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — compacted blocks 001–250
Cycles 001–100 are preserved through commit `aca6fc4e42bf8720da99f9a8917566af23ba03fe`; 101–150 through `00b01ed910d2696af6bddb1e81c0b5029359bfcc`; 151–200 through blob `fc1aa12197cf7e8817086121f5db30c84310149c`; 201–250 through the earlier version of this file (blob `86bd97c80557a46a65dfaa27f0febcb5d09a3cd5`). Git history preserves the detailed record.

## Provenance — block 251–300
Primary/recent references reviewed 2026-09-21: Cloudflare R2 Workers API/S3 compatibility and Workflows documentation/changelog. These cycles cover conditional/checksummed storage, bounded failover, durable checkpoints, idempotency, retries, pause/resume/terminate observation, compensation, exact-SHA provenance and composed recovery. Detailed cycles are preserved in Git history and `.agents/MEL_CROSS_DOMAIN_BLOCK_251_300.md`.

## Provenance — block 301–350
Primary/recent references reviewed 2026-09-21:
- OpenAI Model selection: https://developers.openai.com/api/docs/guides/model-selection
- OpenAI Evals API / agent-skill eval guidance: https://developers.openai.com/api/reference/java/resources/evals/methods/create and https://developers.openai.com/zh-Hant/blog/eval-skills
- Anthropic, *Demystifying evals for AI agents* (2026-01-09): https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Cloudflare Workers limits, performance timers, CPU profiling, metrics/analytics, timing changelogs: https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/workers/runtime-apis/performance/ ; https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/ ; https://developers.cloudflare.com/workers/observability/metrics-and-analytics/ ; https://developers.cloudflare.com/changelog/post/2025-04-09-workers-timing/ ; https://developers.cloudflare.com/changelog/post/2026-02-18-cfworker-server-timing/
- W3C WCAG 2.2 and Understanding WCAG 2.2: https://www.w3.org/TR/wcag/ and https://www.w3.org/WAI/WCAG22/understanding/
Repository search again found no `MEL_TRANSFER_*_10000.md`; none ingested. These lessons remain knowledge hypotheses until code-linked proof per XP protocol.

## Cycles 301–350
Each cycle records theme → principle → limit/counterexample → falsifiable gate → MEL implication.

301. Model routing objective → establish task-specific quality target before optimizing latency/cost → cheapest/fastest first can silently lower correctness → fixed eval set across candidate models → MEL routes only after quality floor is met.
302. Routing by task class → route on explicit capability requirements (reasoning, tools, modality, context) rather than one global default → task labels can be wrong → adversarial/mislabeled task fixture → MEL falls back safely when requirements exceed route.
303. Routing fallback → define bounded escalation when low-tier output fails a verifier → unconditional escalation wastes compute; no escalation strands hard cases → seeded easy/hard corpus → MEL escalates only on measurable uncertainty/failure.
304. Route observability → log route decision, model identity/version and reason without sensitive prompt leakage → model name alone cannot explain choice → replayable routing fixture → diagnostics can explain why a model handled a turn.
305. Model drift → rerun stable evals when model aliases/versions change → historical pass does not guarantee current behavior → version-change regression run → MEL never treats alias continuity as behavioral identity.
306. Accuracy-first optimization → establish strongest practical baseline before distillation/smaller routing → baseline can still be wrong → human/reference-labeled eval → MEL knows the target behavior before cost optimization.
307. Eval task realism → use representative multi-turn/tool/state tasks, not only isolated prompts → synthetic microtasks overestimate agent reliability → production-shaped fixture → MEL capability gates resemble real workflows.
308. Eval trajectory → grade both outcome and critical steps when path constraints matter → perfect final text can hide forbidden/wrong side effects → trace + artifact grader → MEL proves tool behavior, not prose plausibility.
309. Deterministic checks → prefer exact programmatic assertions for files/state/schema where possible → LLM judge adds needless variance to deterministic facts → deliberately malformed artifact fixture → MEL uses code checks for objective postconditions.
310. Rubric grader → use explicit rubric only for genuinely semantic quality → vague rubric creates unstable scores → inter-run judge agreement fixture → MEL semantic graders expose criteria.
311. Eval decomposition → separate capability dimensions so one aggregate score cannot hide a catastrophic regression → too many tiny metrics obscure product meaning → seeded single-dimension failures → MEL dashboard shows critical sub-gates.
312. Critical-gate weighting → safety/data-loss/recovery failures remain hard gates, not averageable points → high average can coexist with one fatal defect → one catastrophic test among many passes → launch remains blocked.
313. Eval variance → repeat stochastic tasks enough to estimate reliability rather than celebrate one pass → repetition alone cannot fix biased dataset → multi-seed run → MEL reports pass distribution for probabilistic behaviors.
314. Eval contamination → keep held-out regression cases separate from examples directly optimized against → tiny public suite can be overfit → unseen sibling cases → MEL distinguishes development and holdout evidence.
315. Regression corpus → every real defect should add the smallest reproducer when generalizable → blindly accumulating duplicates bloats suite → semantic dedup review → MEL converts incidents into durable protection.
316. Negative controls → include cases that must *not* trigger a tool/action → positive-only tests encourage over-action → ambiguous/no-action fixture → MEL proves restraint and clarification behavior.
317. Counterfactual status eval → ask status follow-ups after changing runtime state underneath → cached conversational claim may be stale → mutate state between turns → MEL rereads authoritative state.
318. Ellipsis resolution eval → test “continue”, “is it done?”, “and now?” against active subject and recent action → keyword matching can jump topics → interleaved-topic fixture → MEL preserves active referent.
319. Constraint persistence eval → carry explicit exclusions across follow-ups until superseded → permanent global persistence is also wrong → update-one-constraint fixture → MEL changes only named dimension.
320. Provenance conflict eval → inject RAG memory contradicting newest user/runtime fact → retrieved text is evidence, not authority → contradiction fixture → MEL prefers explicit current authoritative state and flags conflict.
321. Self-knowledge eval → capability claims must be grounded in available tools/runtime, not learned marketing text → static capability prompt becomes stale → remove/disable-tool fixture → MEL states only currently observable capabilities.
322. Tool-success semantics → distinguish accepted request from observed effect → HTTP 2xx alone is not completion → handler returns 200 without persistence fixture → MEL reports pending/failure until postcondition readback.
323. Partial-success semantics → represent completed/failed/skipped components explicitly → binary success hides repair work → mixed batch fixture → MEL gives exact remaining work.
324. Timeout semantics in communication → say which layer timed out and whether side effect may still complete → generic “failed” can cause duplicate retries → late-completion fixture → MEL reconciles before retrying.
325. Judge independence → do not let candidate answer supply its own reference truth → self-grading amplifies hallucination → false-confident answer fixture → MEL eval truth comes from fixtures/runtime/reference data.
326. Human calibration → periodically compare semantic graders with domain-expert judgments → judge agreement can drift → blinded sample review → MEL tracks grader validity, not just model score.
327. Eval-driven feature work → define observable success before implementation → post-hoc tests tend to mirror implementation → red test first for new capability → MEL feature completion has predeclared evidence.
328. Performance measurement layers → separate CPU, wall time, upstream/origin time and client-visible latency → one timer cannot localize bottleneck → injected CPU vs I/O delay fixtures → MEL optimizes the actual slow layer.
329. Workers timer caveat → production `performance.now()`/`Date.now()` may advance only around I/O, so do not infer CPU hotspots from naive in-request timing → local profiler and platform invocation metrics provide different evidence → CPU-burn fixture → MEL uses DevTools/platform CPU data for compute profiling.
330. CPU profiling representativeness → profile with production-like routes/data/volume → trivial local request can miss hot path → representative corpus profile → MEL optimization evidence matches workload.
331. CPU budget → configure bounded CPU ceiling as guardrail rather than raising it to mask loops → legitimate heavy work may need decomposition → injected runaway loop → MEL fails boundedly and moves long work to suitable primitives.
332. Wall-time diagnosis → high wall with low CPU suggests waiting/I/O rather than JS compute → slow remote dependency is not fixed by micro-optimizing loops → delayed-upstream fixture → MEL targets caching/concurrency/timeouts appropriately.
333. Tail latency → inspect quantiles and slow exemplars, not median alone → p50 can stay healthy while p99 freezes UI → heavy-tail fixture → MEL performance gate includes p95/p99 where available.
334. Startup cost → keep expensive initialization out of Worker global scope when possible → moving everything lazily can shift cost to every request → cold-start/profile fixture → MEL measures startup and steady-state separately.
335. Memory pressure → stream large bodies and avoid unnecessary whole-payload buffering → streaming complicates algorithms requiring random access → large-file fixture under memory bound → Collector/ShardVault choose bounded-memory paths.
336. Subrequest budget → deduplicate/cache repeated GETs and bound fan-out → aggressive cache can serve stale status → request-count fixture with state mutation → MEL caches only under explicit freshness semantics.
337. Client polling visibility → suspend or slow nonessential polling when panel/page is hidden and reconcile on visibility return → hidden pause must not hide critical server-side job execution → visibility fixture → MEL reduces UI work without removing capabilities.
338. Abort stale fetch → cancel superseded UI reads with `AbortController` and ignore late stale responses → cancellation is not transactional rollback → out-of-order response fixture → MEL UI cannot regress state from an old GET.
339. Request coalescing → share identical in-flight reads where consumers accept same freshness → personalized/authorization-sensitive reads must not be coalesced across contexts → concurrent-identical fixture → MEL cuts duplicate GETs safely.
340. Payload shaping → status/list endpoints return only fields needed for current view, with detail on demand → excessive fragmentation increases round trips → payload-size + interaction fixture → MEL balances bytes against request count.
341. Long-list rendering → virtualize or use containment/content-visibility for large Activity/Collector lists while preserving search/accessibility semantics → offscreen content must remain discoverable through data model → 10k-row scroll/search fixture → MEL keeps capability with bounded DOM cost.
342. Listener lifecycle → every dynamic event/subscription has deterministic cleanup → duplicate handlers accumulate after tab/view remount → repeated mount/unmount fixture → MEL prevents memory and duplicate-action leaks.
343. Image/media loading → lazy-load noncritical assets and size them to avoid layout instability → above-the-fold/avatar-critical media may need eager loading → cold-load visual fixture → MEL reduces transfer without degrading primary interaction.
344. Focus visibility → keyboard focus must remain visible and not be obscured by sticky overlays → custom focus styling can accidentally reduce contrast → full keyboard traversal fixture → MEL controls remain operable without pointer.
345. Target size → interactive controls should satisfy WCAG 2.2 target-size requirements or documented exceptions → compact dense diagnostics may need spacing/alternate target strategy → mobile tap audit → MEL avoids tiny inaccessible controls.
346. Drag alternatives → drag/drop features require non-drag pointer/keyboard alternatives where WCAG applies → desktop convenience is not universal operability → upload/reorder without dragging fixture → MEL preserves full file/control capability.
347. Accessible status → progress/errors/state changes need programmatic semantics, not color alone → over-announcing every poll overwhelms assistive tech → screen-reader state-change fixture → MEL announces meaningful transitions only.
348. Focus after async mutation → modal/tab/job completion must leave focus in a predictable usable location → forcibly moving focus on every refresh is disruptive → async completion keyboard fixture → MEL preserves user context.
349. Performance change proof → compare before/after under same fixture and retain raw metrics/build SHA → anecdotal “feels faster” is not evidence → paired benchmark → MEL only claims optimization when measured.
350. Performance/correctness composition → optimization passes only if latency/resource gains preserve functional, accessibility and freshness gates → fastest UI that drops controls/state is regression → combined performance + deep-action suite → MEL never removes capability merely to gain speed.

## Deduplication notes
301–327 specialize prior grounding/communication/model-routing ideas into falsifiable eval design, route provenance, holdouts, negative controls and semantic-grader calibration. 328–350 specialize prior frontend/runtime performance principles with current Workers timing constraints, tail-latency evidence, bounded resource behavior and WCAG 2.2 interaction gates. Repeated ideas were retained only where a distinct failure mode, platform semantic or test gate was added.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable at this checkpoint. Continue periodic search and ingest only generalized, provenance-bearing methods; never raw private autobiographical material.

## Run checkpoint 2026-09-21 — cycles 301–350
- `head_initial`: `5a24bde0bd5290f275fab34f9a47d32482437c6e`
- pre-write HEAD recheck: unchanged (`5a24bde0bd5290f275fab34f9a47d32482437c6e`)
- cycles completed this run: 50; additive counter: 350/10000
- transfer packages ingested: none (repository search returned none)
- code/process/button changes: none; this run intentionally advanced the expert corpus only
- stress tests: none; no code/runtime mutation in this checkpoint
- defects before/after: no new code defect claimed or patched
- XP MEL: NON — knowledge corpus only; no code-linked implementation proof, therefore no validated XP entry
- production: untouched; no release/deploy/Resume/MAX action
- `remaining_open`: cycles 351–10000, transfer ingestion when packages appear, then full audit/repair/stress program
- `next_exact_fix`: continue cycles 351–400 with RAG/memory retrieval quality, MCP/tool-contract robustness, context compression and contradiction handling; then map newly learned gates to open candidate defects without production mutation.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_351/10000`. Before every write reread candidate HEAD and abort/reconcile if moved.