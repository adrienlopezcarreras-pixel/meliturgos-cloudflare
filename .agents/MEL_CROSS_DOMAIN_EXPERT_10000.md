# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_300/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — compacted blocks 001–250
Cycles 001–100 are preserved through commit `aca6fc4e42bf8720da99f9a8917566af23ba03fe`; 101–150 through `00b01ed910d2696af6bddb1e81c0b5029359bfcc`; 151–200 through blob `fc1aa12197cf7e8817086121f5db30c84310149c`; 201–250 through the immediately preceding version of this file (blob `86bd97c80557a46a65dfaa27f0febcb5d09a3cd5`). Those blocks cover observable postconditions, deadlines/retries/idempotency, Cloudflare state/concurrency, frontend performance/accessibility, supply-chain provenance, grounded communication/RAG, ShardVault recovery, game/audio/publishing/narrative/BD/e-commerce/archival methods, MCP, Queues, Durable Objects, D1 Sessions/bookmarks and GitHub artifact provenance. Git history is the immutable detailed record.

## Provenance — block 251–300
Primary/recent references reviewed 2026-09-21: Cloudflare R2 Workers API reference and S3 compatibility documentation; Cloudflare Workflows overview, Rules of Workflows, Sleeping and retrying, durable-agent guide, Agents/Workflows durability guidance, metrics/analytics and 2026 changelog. Repository search again found no `MEL_TRANSFER_*_10000.md`; none ingested. These lessons remain knowledge hypotheses until code-linked proof per XP protocol.

## Cycles 251–300
Each cycle records theme → principle → limit/counterexample → falsifiable gate → MEL implication.

251. R2 conditional write → use ETag preconditions for compare-and-swap style replacement → ETag is object-version evidence, not business authorization → two-writer fixture → MEL prevents silent overwrite.
252. R2 failed precondition → treat null/412 as conflict requiring refetch/reconcile → blind retry repeats stale intent → competing-update fixture → MEL reports conflict rather than false success.
253. R2 HTTP ETag → return `httpEtag` in HTTP headers because it is correctly quoted → raw `etag` is not header-ready → conditional browser fixture → MEL preserves protocol syntax.
254. R2 object version → record version/ETag after write when later proof depends on exact bytes → key name alone is mutable → replace-same-key fixture → diagnostics identify exact stored generation.
255. R2 checksums → provide/verify strong checksum for integrity-critical payloads → ETag semantics alone are not a universal content hash → corrupted-upload fixture → ShardVault verifies payload integrity independently.
256. R2 checksum mismatch → fail closed on BadDigest/invalid checksum → retrying unchanged corrupt bytes is useless → deliberate bit-flip fixture → MEL distinguishes transport corruption from transient failure.
257. R2 ranged read → validate returned range and expected length → partial response is not full-object proof → truncated-range fixture → reconstruction reads prove exact fragment boundaries.
258. R2 invalid range → 416 is deterministic input/state error unless object changed → generic retry loop wastes deadline → beyond-EOF fixture → MEL refetches metadata or fails explicitly.
259. R2 conditional read → If-Match binds read to expected object generation → unconditional read can race replacement → concurrent-replace fixture → ShardVault recovery consumes intended fragment.
260. R2 If-None-Match → exploit conditional retrieval/cache validation where freshness permits → 304-style semantics do not prove body availability → cache-loss fixture → UI cache separates validation from payload possession.
261. R2 metadata/body coupling → verify metadata and body refer to same returned object → separate HEAD then GET can race mutation → replace-between fixture → MEL prefers atomic returned-object evidence.
262. R2 custom metadata → metadata may carry provenance hints but not replace cryptographic verification → metadata is mutable with object → forged-metadata fixture → MEL treats claims as hints until verified.
263. R2 listing pagination → consume continuation state until completion → first page is not inventory → >page-size fixture → backup/audit counts cannot silently truncate.
264. R2 prefix isolation → namespace candidate/test artifacts explicitly → shared prefix risks cleanup collisions → concurrent-run fixture → MEL stress cleanup cannot delete unrelated evidence.
265. R2 delete verification → deletion success requires subsequent absence observation when cleanup matters → accepted request alone is weak proof → cleanup fixture → tests leave bounded residue.
266. R2 multipart overwrite → same part number replaces prior part and failed replacement can lose it → retry assumptions differ from immutable part append → injected-failure fixture → MEL multipart recovery tracks completed parts explicitly.
267. R2 multipart completion → completion manifest must bind intended part numbers/ETags → upload existence alone does not prove assembled object → swapped-part fixture → large backup proof includes final digest.
268. R2 storage class → choose class by access pattern, not as correctness mechanism → storage class does not change integrity contract → restore-latency fixture → MEL recovery SLO measured separately.
269. R2 bounded retries → classify 412/416/checksum errors apart from transient 5xx/network failures → retry-all creates loops → fault matrix → ShardVault retry policy is error-aware.
270. R2 deadline budget → each target attempt consumes bounded share of operation deadline → sequential slow targets can exhaust caller → latency-injection fixture → 7-target failover remains finite.
271. Workflow durable boundary → isolate operations that should not repeat into separate `step.do` checkpoints → code outside durable steps may repeat → crash-after-side-effect fixture → MEL autonomy checkpoints side effects.
272. Workflow idempotent step → design retryable external effects with idempotency keys/state checks → durable orchestration does not make arbitrary API calls idempotent → duplicate-delivery fixture → MEL tools survive retries.
273. Workflow checkpoint granularity → split where later failure must not replay earlier expensive/side-effecting work → excessive tiny steps add complexity → fault-at-each-boundary fixture → MEL balances durability and overhead.
274. Workflow serializable output → persist only supported/intentional step results → hidden process-local state vanishes on resume → isolate-recycle fixture → MEL resumes from explicit data.
275. Workflow retry limit → every retry policy has finite limit → infinite retry hides terminal faults → permanent-error fixture → Activity reaches actionable failed state.
276. Workflow backoff → use constant/linear/exponential or dynamic delay according to failure class → one policy does not fit rate limits and network blips → mixed-error fixture → MEL honors bounded provider-aware pacing.
277. Workflow Retry-After → dynamic delay may incorporate downstream guidance → untrusted/extreme delay must still respect policy bounds → absurd-header fixture → MEL clamps retry timing.
278. Workflow sleep → use durable sleep rather than holding request/isolate → sleep is not polling → long-wait fixture → MEL removes hidden busy waiting.
279. Workflow waitForEvent → external approval/input has named event and timeout → waiting forever creates zombie instances → missing-event fixture → MEL exposes waiting reason/deadline.
280. Workflow event identity → correlate event to exact instance/action → generic approval can hit wrong job → concurrent-approval fixture → Professor/Teacher handoff is instance-scoped.
281. Workflow progress → non-durable progress broadcasts may repeat and are observational → never infer side-effect uniqueness from UI progress → replay fixture → MEL Activity deduplicates display without lying about durable state.
282. Workflow completion → durable completion/error reporting is authoritative over transient broadcasts → socket disconnect does not mean job failed → disconnect fixture → UI reconciles against durable status.
283. Workflow pause/resume → verify state transition and resumed continuation, not button HTTP 200 → control endpoint acceptance is insufficient → pause-mid-step fixture → MEL deep capability gate observes effect.
284. Workflow terminate → termination requires terminal instance observation and no later side effects → request success alone can race work → terminate-under-load fixture → Stop semantics are proven end-to-end.
285. Workflow restart → define whether restart means new instance or replay semantics and expose lineage → ambiguous restart can duplicate effects → restart-after-side-effect fixture → MEL shows parent/restart identity.
286. Workflow version evolution → long-lived instances may outlive code deployment, so compatibility/version assumptions must be explicit → latest source is not automatically safe for old checkpoints → deploy-during-sleep fixture → MEL migrations test resumed old instances.
287. Dynamic workflow source persistence → runtime-loaded workflow must retain source identity across sleep/recycle → mutable external source can change semantics mid-instance → source-change fixture → MEL binds automation to source digest/version.
288. Workflow LLM checkpoint → persist model response before tool execution when replay cost/variation matters → checkpoint does not make response factually correct → crash-between-LLM-tool fixture → MEL avoids needless regenerated plans.
289. Workflow tool checkpoint → persist successful tool result before subsequent tools → earlier side effect should not rerun after later failure → fail-second-tool fixture → MEL resumes at precise boundary.
290. Workflow max-turn bound → agentic loops require explicit turn/step ceiling → durable execution can otherwise preserve an unproductive loop for a long time → adversarial-loop fixture → MEL exits with bounded status.
291. Workflow compensation → cross-system operations need explicit compensating/reconciliation path → compensation is not true transaction rollback → fail-after-external-write fixture → MEL records partial state and repair action.
292. Compensation failure → observe rollback failure separately from forward failure → hiding it under original error loses recovery truth → injected-compensation-fault fixture → diagnostics distinguish both.
293. Workflow metrics → track execution/error/step/duration trends → aggregate metrics do not replace per-instance proof → known-failing-instance fixture → MEL uses telemetry for detection, instance evidence for gates.
294. Workflow observability retention → retained analytics window is finite → historical launch proof needs separately retained artifacts → older-than-window fixture → MEL archives critical evidence.
295. Workflow priority after sleep → resumed sleepers may be prioritized over newly queued instances → fairness assumptions must match platform behavior → backlog fixture → MEL capacity tests include resumed jobs.
296. Workflow status freshness → status UI rereads durable instance state after control mutation → optimistic button state can lie → delayed-transition fixture → controls show pending until observed.
297. Workflow timeout semantics → distinguish step retry exhaustion, wait timeout, caller timeout and whole-job state → generic timeout obscures repair path → timeout matrix → MEL communicates exact layer.
298. Workflow cleanup → test instances/artifacts have deterministic cleanup and ownership tags → broad cleanup risks active jobs → overlapping-run fixture → stress tests remain isolated.
299. Workflow exact-SHA proof → preview tests bind workflow definition/runtime to candidate SHA/build identity → branch label can move during long execution → head-move fixture → Launch Gate preserves immutable provenance.
300. R2+Workflow recovery composition → durable orchestration plus conditional/checksummed storage still requires end-to-end readback/reconstruction proof → individually green components do not prove recovery → corrupt-one-fragment/retry/resume fixture → ShardVault gate validates composed system.

## Deduplication notes
251–270 specialize existing storage/integrity/retry principles into R2-specific ETag, checksum, range, multipart and error semantics. 271–300 specialize existing autonomy/idempotency principles into Cloudflare Workflows checkpoint, retry, control, observability, evolution and compensation semantics. Repeated ideas are retained only where a distinct platform behavior or falsifiable gate is added.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable at this checkpoint. Continue periodic search and ingest only generalized, provenance-bearing methods; never raw private autobiographical material.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_301/10000`. Prioritize model routing/evals/grounding/self-knowledge and frontend performance measurement, then use those lessons to inspect open code-linked defects. Before every write reread candidate HEAD and abort/reconcile if moved.
