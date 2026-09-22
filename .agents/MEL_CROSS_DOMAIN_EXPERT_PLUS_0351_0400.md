# MEL Cross-domain Expert +10 000 — cycles 351–400

Checkpoint: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_400/10000` (IN_PROGRESS detailed source-grounded track). Additive knowledge; not validated implementation XP and not production approval.

Provenance reviewed 2026-09-22: Cloudflare official Workers Observability, Workers Logs, Traces, Real-time Logs, Tail Workers, Workers Best Practices, Durable Objects overview and Alarms documentation. Current docs explicitly distinguish persisted logs from real-time logs, describe head sampling and truncation, automatic tracing of fetch/binding/RPC/handlers, and DO alarm at-least-once retries. Each cycle is problem → principle → limit/counterexample → falsifiable gate → MEL implication.

351. Observability-before-incident → enable logs/traces before failures → retroactive telemetry cannot recover unrecorded evidence → cold-start incident fixture → MEL preview gate verifies observability enabled.
352. Structured logging → emit searchable structured fields/correlation IDs → free text is harder to join and can leak data → query-by-request fixture → MEL logs stable event schema.
353. Severity semantics → errors/warnings/info must reflect operational meaning → everything-as-error destroys signal → seeded mixed outcomes → MEL dashboards preserve severity.
354. Log sampling truth → head sampling reduces volume but means absence is not proof → rare failures may be missed → injected rare-error fixture → MEL never infers zero errors solely from sampled logs.
355. Trace sampling truth → sampled traces describe a subset → p99 diagnosis may require targeted/full sampling in preview → tail-latency fixture → MEL labels sample rate with evidence.
356. Logs-vs-traces → logs explain events; traces explain causal timing across calls → either alone can miss context → slow-R2 fixture → MEL correlates both for deep capability gates.
357. Automatic instrumentation boundary → platform spans cover fetch/bindings/RPC/handlers → application decisions still need custom spans/logs → planner-delay fixture → MEL instruments domain phases explicitly.
358. Custom span scope → span only meaningful operations → span-per-token/loop explodes telemetry → bounded-cardinality fixture → MEL traces stage boundaries not every iteration.
359. Correlation propagation → request/job ID follows handler, queue, workflow, DO and provider calls → new IDs per hop break reconstruction → multi-hop fixture → MEL carries causal ID end-to-end.
360. Secret redaction → observability must exclude credentials/private payloads by default → debug usefulness never justifies token leakage → seeded-secret scan → MEL CI rejects sensitive telemetry.
361. PII minimization → log identifiers only when operationally necessary → raw user content creates privacy surface → privacy fixture → MEL prefers hashes/scoped IDs.
362. Log truncation awareness → oversized logs can be truncated → one giant diagnostic blob is not reliable evidence → >256KB fixture → MEL chunks/summarizes bounded diagnostics.
363. Retention awareness → platform retention is finite → launch evidence needing durability must be exported/artifacted → old-incident fixture → MEL stores canonical proofs separately.
364. Real-time-log ephemerality → live tail is debugging, not durable audit record → disconnect loses evidence → replay-after-session fixture → MEL does not certify gates from terminal tail alone.
365. Real-time sampling under load → live stream can drop events at high volume → apparent clean tail is weak evidence → bounded burst fixture → MEL uses persisted metrics/logs for stress conclusions.
366. Tail Worker timing → tail processing occurs after producer execution → tail cannot be part of synchronous correctness → disable-tail fixture → MEL product behavior never depends on telemetry consumer.
367. Tail Worker cost boundary → custom tail processing consumes resources/paid-plan capability → zero-spend policy may forbid it → no-tail environment fixture → MEL uses built-in free observability where sufficient.
368. OTEL export choice → prefer standard export when external observability is needed → custom tail code adds failure surface → exporter-unavailable fixture → MEL keeps observability adapter replaceable.
369. Metrics/log complement → aggregate rates reveal trends while logs explain instances → logs-only can miss population shift → error-rate fixture → MEL gate records both aggregate and exemplars.
370. Percentile latency → p95/p99 matter for interactive truth → mean hides long tails → synthetic bimodal fixture → MEL UI/API perf gate reports tail percentiles.
371. Dependency span attribution → measure R2/D1/DO/fetch latency separately → total request time cannot identify bottleneck → injected slow dependency → MEL optimization follows measured span.
372. Preview-production separation → telemetry must identify environment and exact SHA → mixed streams can certify wrong build → concurrent preview/prod fixture → MEL attaches deployment identity.
373. Exact-SHA trace evidence → runtime evidence must bind to candidate commit → latest branch name is mutable → branch-moves fixture → MEL records immutable SHA in diagnostics.
374. Invocation outcome truth → HTTP response alone misses uncaught/runtime outcomes → handler fixture with internal exception → MEL joins response with invocation outcome.
375. Error taxonomy → classify timeout, quota, auth, semantic provider error, code exception separately → generic FAIL prevents correct repair → seeded failure matrix → MEL diagnostics expose root class.
376. Bounded diagnostic payload → diagnostics endpoint must not dump all logs/state → huge payload harms UI and privacy → large-state fixture → MEL paginates and summarizes.
377. Query cardinality → high-cardinality fields need deliberate analytics design → arbitrary prompt text as dimension is unusable/risky → cardinality fixture → MEL indexes stable IDs/categories.
378. Observability availability is not capability proof → telemetry can show calls but not user-visible correctness → handler-called fixture with broken UI state → MEL still requires effect+re-read.
379. Trace completeness caveat → automatic traces cover supported operations, not every semantic step → missing span is not necessarily missing work → controlled uninstrumented step → MEL distinguishes telemetry gap from runtime failure.
380. Instrumentation overhead budget → tracing/logging must stay bounded → full verbose telemetry can distort stress results → A/B overhead fixture → MEL measures with representative settings.
381. DO coordination fit → use Durable Objects when single logical coordinator/state owner is required → unnecessary DO adds hop/complexity → stateless fixture → MEL selects DO only for coordination semantics.
382. DO identity design → object key defines coordination boundary → wrong key creates split-brain or hotspot → same-job/different-key fixture → MEL documents canonical ownership key.
383. DO storage atomicity assumptions → keep invariants inside appropriate storage/transaction boundary → cross-object invariants are not magically atomic → concurrent update fixture → MEL avoids distributed pseudo-transactions.
384. SQLite-backed DO choice → new stateful classes should follow current SQLite guidance → legacy storage assumptions may miss newer capabilities → migration fixture → MEL version-controls storage model.
385. DO hot-object pressure → single coordinator can serialize too much work → correctness does not imply throughput → concurrent clients fixture → MEL shards only where invariant permits.
386. Alarm single-slot semantics → each DO has one scheduled alarm at a time → treating alarms as an arbitrary timer queue loses jobs → two-deadline fixture → MEL persists its own schedule set and programs next wakeup.
387. Alarm at-least-once → alarm handler may execute more than once → side effects must be idempotent → duplicate alarm fixture → MEL uses operation IDs/checkpoints.
388. Alarm retry semantics → thrown alarm retries with platform backoff and bounded attempts → swallowing errors suppresses retry → injected transient failure → MEL throws only retryable failures and records terminal state.
389. Alarm retry budget ownership → application retries inside an alarm can multiply platform retries → nested loops amplify work → attempt-count fixture → MEL has one bounded retry policy per layer.
390. Alarm checkpoint-before-effect → persist intent/idempotency state before irreversible external side effect → crash after effect can duplicate action → crash-window fixture → MEL reconciles on resume.
391. Alarm effect-before-checkpoint recovery → if external effect succeeds but persistence fails, query/reconcile external state → blind retry duplicates → simulated lost acknowledgement → MEL uses idempotency keys/readback.
392. Alarm no-user-notification default → background maintenance should not notify unless requested → execution success is not communication intent → maintenance fixture → MEL separates work events from notifications.
393. DO restart tolerance → in-memory state is cache, durable state is authority → eviction/restart can erase RAM → restart fixture → MEL rebuilds coordinator state from storage.
394. DO schema migration → durable persisted state needs forward-compatible migrations → code deploy can meet old objects → old-schema fixture → MEL gates migration before behavior.
395. DO observability → alarms/RPC/storage paths need correlation and outcomes → hidden state machine failures look like hangs → failed-alarm fixture → MEL diagnostics expose last transition/checkpoint.
396. DO authorization boundary → object reachability does not imply caller authority → guessed object ID must not grant control → unauthorized RPC fixture → MEL validates auth before mutation.
397. Queue/DO handoff idempotence → delivery plus coordinator call can duplicate → exactly-once assumptions are unsafe → redelivery fixture → MEL dedupes at durable owner.
398. Scheduled-work freshness → delayed alarm must revalidate whether action is still wanted → old plan may be superseded → cancel-before-fire fixture → MEL checks current canonical intent.
399. Stress cleanup → bounded load tests must delete synthetic state and stop timers → leftover alarms/jobs pollute later gates → post-test inventory fixture → MEL stress harness proves cleanup.
400. Sensor/product proof chain → logs, traces and DO state are sensors; PASS still requires real input→handler→effect→persistence→re-read→UI/runtime coherence → green-telemetry/broken-effect fixture → MEL launch gates never collapse observability into product truth.

## Deduplicated implications

New reusable emphasis versus cycles 1–350: sampled telemetry absence is non-proof; exact-SHA/environment identity must travel with runtime evidence; real-time logs are ephemeral; automatic traces need semantic instrumentation; DO alarms are a one-slot, at-least-once wakeup primitive requiring durable schedule state and idempotent reconciliation. These refine existing sensor-vs-product and retry lessons rather than replacing them.

Transfer scan: no `MEL_TRANSFER_*_10000.md` package was found in the repository search during this run. No private data was ingested.
