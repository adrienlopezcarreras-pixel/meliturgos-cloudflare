# MEL Cross-domain Expert +10 000 — cycles 301–350

Checkpoint: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_350/10000` (IN_PROGRESS). Additive knowledge track; not validated implementation XP.

Provenance reviewed 2026-09-22: Cloudflare official AI Gateway Dynamic Routing, Fallbacks, Caching, Request Handling, REST API, troubleshooting and Unified Billing documentation (including updates through 2026-09-17); OpenAI official model-selection documentation. Each item is problem → principle → limit/counterexample → falsifiable gate → MEL implication.

301. Model routing by task → choose model class from measured task needs, not one universal default → benchmark averages hide task tails → per-capability eval set → MEL routes by capability profile.
302. Strong-model escalation → escalate only when lower tier fails confidence/eval criteria → always-strong wastes latency/cost → paired quality/latency fixture → MEL reserves strongest model for hard work.
303. Cheap-model eligibility → simple deterministic transformations may use lighter model → apparent simplicity can hide safety/context needs → adversarial-simple fixture → router includes risk and context complexity.
304. Route versioning → routing policy is versioned and rollbackable → changing route without code still changes behavior → before/after replay set → MEL records route version in diagnostics.
305. Conditional routing → branch on explicit trusted metadata/task features → user-controlled metadata can game routing → spoofed metadata fixture → MEL separates trusted server features from prompt content.
306. Percentage rollout → probabilistic split supports A/B/canary → unsuitable for one user's causally linked workflow without sticky assignment → repeated-session fixture → MEL keeps experiment identity stable.
307. Fallback semantics → fallback handles defined failure/timeout classes → fallback is not proof of equivalent quality/capability → forced-primary-fail eval → MEL reports provider/model actually used.
308. Fallback provenance → capture successful fallback step/model → hiding fallback causes false self-knowledge → induced fallback fixture → MEL capability/status reflects runtime provider.
309. Timeout routing → upstream timeout bounded below user deadline → too-short timeout can route away from a slow but necessary expert model → latency-distribution fixture → MEL tunes per task.
310. Retry vs fallback → retry transient same-provider faults only when budget permits; otherwise fallback → stacking retries across layers multiplies latency → injected 5xx fixture → one owner controls retry budget.
311. Retry amplification → gateway+client+workflow retries compose multiplicatively → independent defaults can create request storms → count-attempt fixture → MEL records total attempt ceiling.
312. Rate-limit routing → quota exhaustion can route to alternate model only if semantics remain acceptable → lower-capability fallback may violate task requirement → quota fixture → MEL fails clearly when minimum capability unavailable.
313. Budget-limit routing → enforce zero/explicit spend policy before provider selection → route fallback must not silently activate billable provider → no-credential/budget fixture → MEL treats cost policy as hard constraint.
314. BYOK-only boundary → require explicit provider credentials when wholesale/unified fallback is forbidden → convenience fallback can create unintended spend → missing-key fixture → MEL zero-spend mode hard-fails rather than bills.
315. REST endpoint selection → choose endpoint by modality/protocol need → deprecated/special endpoints should not be new default → compatibility fixture → MEL centralizes provider adapter.
316. Deprecated universal endpoint → migrate new fallback/routing logic to supported dynamic-routing path → existing endpoint may still work but accumulates migration debt → deprecation lint → MEL avoids new dependency on deprecated path.
317. Cache eligibility → cache only requests whose answer equivalence survives reuse → personalized/fresh/status queries are unsafe → user-A/user-B fixture → MEL defaults dynamic memory/status calls to no-cache.
318. Exact-request cache → identical body/model/provider can reuse response → tiny context changes intentionally miss → mutation fixture → MEL does not expect semantic cache behavior.
319. Custom cache key → key only requests guaranteed response-equivalent → coarse key can leak stale/wrong personalized content → differing-user fixture → MEL includes all semantic dimensions or skips cache.
320. Cache TTL → TTL follows freshness tolerance → long TTL on status/capability lies → post-mutation fixture → MEL sets short/zero TTL for runtime truth.
321. Cache observability → capture HIT/MISS evidence → latency alone cannot prove cache path → repeated request fixture → diagnostics expose cache status.
322. Cache volatility → cache is optimization, never durable memory → simultaneous identical requests can both reach provider → concurrency fixture → MEL correctness cannot depend on cache population.
323. Streaming cache caveat → streaming may not cache by default → assuming cached stream can misstate cost/perf → stream/nonstream fixture → MEL measures actual mode.
324. Auth-sensitive cache key → default key includes provider auth context → custom keys can erase isolation if careless → credential-variant fixture → MEL never coalesces across security domains.
325. Grounded self-knowledge → answer capability questions from live registry/runtime evidence → model prior knowledge can be stale → disable-tool fixture → MEL says unavailable when runtime says unavailable.
326. Capability timestamp → capability statement carries observation time/version → yesterday's PASS is not current truth → revoke-capability fixture → MEL avoids timeless claims.
327. Capability depth → distinguish declared, reachable, exercised, and proven → HTTP 200 only proves reachability → broken-side-effect fixture → MEL status labels evidence tier.
328. Tool affordance grounding → expose only callable tools in active environment → documenting nonexistent tool causes hallucinated action → tool-removal fixture → MEL planner sees runtime tool schema.
329. Tool result authority → tool output outranks model guess for current state → tool can itself be stale/fail → contradiction fixture → MEL cites observation and uncertainty.
330. User-message priority → latest user correction outranks older RAG/assistant text → retrieval can resurrect obsolete plan → contradiction corpus fixture → MEL applies recency/source hierarchy.
331. RAG role provenance → retrieved user, assistant, system, document text retain source role → flattening all text makes old assistant claims look factual → seeded false-assistant fixture → MEL weights evidence by provenance.
332. RAG temporal scope → retrieve recent state plus older relevant history separately → pure similarity can favor obsolete detail → changed-decision fixture → MEL resolves supersession explicitly.
333. RAG contradiction detector → surface conflicting claims before synthesis → silent averaging invents compromise → two-source fixture → MEL asks/uses higher-authority evidence.
334. Ellipsis resolution → short follow-ups bind to active subject and unresolved action → global similarity may jump topics → `go/ça donne quoi?` fixture → MEL conversation state tracks active work item.
335. Status follow-up → status answer derives from current execution evidence, not prior promise → prior assistant text is not execution proof → promised-but-not-run fixture → MEL reports actual state.
336. Clarification threshold → ask only when ambiguity materially changes safe/correct action and cannot be resolved from connected state → over-clarifying stalls autonomy → resolvable-context fixture → MEL searches state before asking.
337. Router confidence → routing confidence is calibrated against observed task outcomes → self-reported model confidence is insufficient → reliability curve → MEL escalates on measured uncertainty signals.
338. Eval stratification → evaluate by task family/risk/length/tool need → aggregate score can hide catastrophic subgroup → slice dashboard → MEL blocks route changes with critical-slice regression.
339. Golden-set freshness → refresh evals when products/prompts/tools change → static set overfits → unseen holdout fixture → MEL keeps rolling holdout.
340. Regression replay → replay real anonymized failure shapes after fixes → raw private content need not be retained → synthetic/minimized reproducer → MEL converts incidents into privacy-preserving tests.
341. Judge independence → model-as-judge should not be sole authority for objective postconditions → correlated bias can mark plausible failure PASS → executable oracle fixture → MEL prefers deterministic checks where possible.
342. Pairwise model eval → compare candidate vs baseline blind where subjective quality matters → position/style bias remains → swap-order fixture → MEL randomizes order and tracks disagreement.
343. Tool-use eval → score correct selection, arguments, effect and observation → syntactically valid call can be operationally wrong → side-effect fixture → MEL evaluates full action chain.
344. Grounding eval → require claims to map to retrieved/runtime evidence → citation presence alone can be irrelevant → unsupported-claim fixture → MEL checks entailment, not decoration.
345. Refusal precision → sensitive topic handling should preserve maximal legitimate content while limiting dangerous actionable detail → blanket refusal destroys utility → benign-lab fixture → MEL evaluates both safety and helpfulness.
346. Latency SLO by route → measure p50/p95/p99 and timeout/fallback rates per route → average latency hides tails → load fixture → MEL optimizes tail experience.
347. Cost accounting → record tokens/provider/model/cache/fallback route → nominal model price does not equal actual request cost → fallback/retry fixture → MEL attributes cost to execution path.
348. Route rollback → retain last known-good route version and eval evidence → instant rollback without evidence can restore already-bad policy → canary failure drill → MEL rollback selects verified version.
349. Routing observability → request trace joins route version, selected model, attempts, cache, latency and outcome → disconnected logs block diagnosis → trace-correlation fixture → MEL diagnostics explains why a model answered.
350. Communication pre-send gate → before sending, verify active subject, latest constraints, provenance, capability truth and requested output → technically correct but off-topic answer still fails → adversarial follow-up suite → MEL adds lightweight coherence gate.

## Deduplication
These cycles specialize earlier generic routing/grounding lessons into current AI Gateway route-version, fallback-step, cache-key/TTL, retry amplification and zero-spend controls, plus MEL-specific self-knowledge and communication gates. Repeated ideas are retained only with a distinct failure mode or executable gate.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package is claimed ingested in this block. Continue provenance-scoped discovery; do not ingest unnecessary private raw data.

## Concrete implications queued for MEL
- Audit all model calls for one bounded retry owner, exact route/model provenance, zero-spend enforcement and fallback visibility.
- Disable/bypass cache for memory-sensitive, capability/status and other freshness-critical calls unless equivalence is proven.
- Add communication regression cases for `go`, `continue`, `ça donne quoi ?`, latest-user correction vs stale RAG, and promised-vs-actually-executed status.
- Capability UI/API should distinguish declared/reachable/exercised/proven with exact SHA/time.

## Next exact block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_351/10000`. Prioritize eval harness implementation patterns, MCP/tool contracts, frontend performance evidence, then code-linked open defects. Before every write reread candidate HEAD and reconcile if moved.