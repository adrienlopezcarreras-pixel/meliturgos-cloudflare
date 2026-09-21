# MEL Cross-domain Expert PLUS — cycles 451–500

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_500/10000`

Provenance: additive block prepared from candidate HEAD `85f404dd6f85034b7ab2f4ba2e3e6972875852ac`. No production action authorized. No private autobiographical material included. Format: problem → principle/limit → pattern/anti-pattern → falsifiable gate → MEL implication.

## Primary/recent sources reviewed 2026-09-22
- Cloudflare D1 Global Read Replication / Sessions API, updated 2026-08-10: https://developers.cloudflare.com/d1/best-practices/read-replication/
- Cloudflare D1 Database Sessions API: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare Durable Objects overview, updated 2026-07-15: https://developers.cloudflare.com/durable-objects/
- Cloudflare SQLite-backed Durable Object Storage, updated 2026-05-27: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Cloudflare Durable Objects Alarms, updated 2026-04-21: https://developers.cloudflare.com/durable-objects/api/alarms/
- Cloudflare Queues delivery guarantees / batching-retries / DLQ, updated 2026-04-21: https://developers.cloudflare.com/queues/reference/delivery-guarantees/ ; https://developers.cloudflare.com/queues/configuration/batching-retries/ ; https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- Cloudflare Workflows sleeping/retrying and changelog, updated 2026-07-09: https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/ ; https://developers.cloudflare.com/changelog/product/workflows/

451. Read-after-write state → a successful write is not enough if the observing read can be stale → replica latency can contradict UI completion → write then immediate read fixture → MEL carries consistency context into verification.
452. D1 session scope → related queries belong to one logical session when sequential consistency matters → global sessions over-serialize unrelated users → two-user interleaving fixture → MEL scopes D1 session/bookmark to causal interaction.
453. D1 bookmark propagation → preserve the latest bookmark across requests that must see prior state → dropping it permits older replica state → write/request-boundary/read fixture → MEL returns and consumes causal bookmark where required.
454. D1 first-primary choice → start at primary when freshness is mandatory → always-primary sacrifices latency/read scaling → stale-sensitive vs stale-tolerant fixture → MEL chooses session constraint by endpoint semantics.
455. D1 unconstrained read → low-latency reads may start from any replica only when stale first read is acceptable → using it for status truth is unsafe → status endpoint fixture → MEL never uses unconstrained first read for completion proof.
456. Monotonic status → user-visible job status must not regress from completed to running due to replica choice → distributed reads can reorder apparent state → repeated cross-region read fixture → MEL enforces causal session or monotonic version.
457. Versioned rows → mutable state benefits from generation/version columns → last-write-wins can hide stale actor overwrite → competing-update fixture → MEL rejects stale expected-version writes.
458. Compare-and-set → state transitions should assert expected prior state → unconditional UPDATE allows illegal transition → pause/complete race fixture → MEL encodes transition preconditions.
459. Transaction boundary → multi-row invariants change atomically when supported → transaction cannot include arbitrary external effects atomically → injected crash fixture → MEL separates DB transaction from effect reconciliation.
460. External-effect outbox → persist intent/event with state change before asynchronous external processing → direct DB+external dual write has split-brain window → crash between writes fixture → MEL uses durable outbox/inbox pattern for cross-system effects.
461. Inbox dedup → queue consumers record stable message/operation identity before applying non-idempotent effect → dedup after effect is too late → duplicate-delivery fixture → MEL converges repeated delivery.
462. Queue at-least-once → duplicates are expected behavior, not exceptional corruption → assuming once-only creates latent side effects → forced redelivery fixture → every MEL queue mutation has idempotency strategy.
463. Batch acknowledgement → acknowledge successful messages individually when later batch items may fail → whole-batch retry duplicates prior work → fail item N fixture → MEL ack policy matches effect idempotence.
464. Retry semantics → retry only failures likely to change with time → deterministic validation errors waste retries → mixed transient/permanent fixture → MEL classifies retryability explicitly.
465. Retry delay → honor provider Retry-After/dynamic delay where available → fixed aggressive retry amplifies rate limits → synthetic 429 fixture → MEL derives bounded delay from failure class.
466. Retry ceiling → finite attempts end in diagnosable terminal state → endless retry hides outage and burns operations → persistent fault fixture → MEL exposes exhausted retry budget.
467. DLQ preservation → poison messages go to a configured DLQ when diagnosis/replay matters → no DLQ can delete failed work at retry limit → poison fixture → critical MEL queues have observable dead-letter path.
468. DLQ consumer → a DLQ without monitoring/consumer is only delayed loss → retention is finite → seeded DLQ fixture → MEL surfaces age/count and bounded replay procedure.
469. Replay identity → replayed DLQ work keeps original operation identity → generating new ID defeats dedup → replay fixture → MEL preserves causality and increments attempt/replay metadata separately.
470. Queue backpressure → producer rate must respect downstream capacity → queues absorb bursts but do not make consumers infinite → burst fixture → MEL measures backlog age, not only queue length.
471. Durable Object ownership → use one object as serialization authority for a coordination key → one global object becomes bottleneck → independent-key concurrency fixture → MEL shards coordination by true conflict domain.
472. DO strong state → object-local storage can guard state machine invariants → it cannot magically make external systems transactional → external timeout fixture → MEL still reconciles downstream effects.
473. DO SQLite atomicity → storage operations are atomic/isolated, useful for local invariant changes → oversized transactions increase contention/latency → contention fixture → MEL keeps critical sections minimal.
474. DO PITR → point-in-time recovery is a recovery tool, not ordinary undo → restoring can discard legitimate later writes → recovery drill fixture → MEL records recovery point and affected scope before restore.
475. Alarm at-least-once → alarm handlers must be idempotent → alarm retry can repeat effect → injected alarm throw fixture → MEL alarm effects carry stable scheduled-operation identity.
476. Single alarm slot → one DO has one scheduled alarm at a time → treating setAlarm as multi-timer loses schedules → multi-deadline fixture → MEL stores multiple deadlines and schedules nearest wakeup.
477. Alarm delay tolerance → scheduled time is not exact execution time → maintenance/failover can delay wakeup → lateness fixture → MEL logic uses due-at comparisons, not exact clock equality.
478. Alarm retry exhaustion → automatic retries are bounded → assuming eventual infinite retry hides terminal failure → persistent alarm failure fixture → MEL has secondary reconciliation/watchdog path.
479. Workflow step boundary → each durable step should represent a semantic unit with replay-safe inputs/outputs → giant steps repeat too much; tiny steps add overhead → crash-point matrix → MEL chooses checkpoints around confirmed effects.
480. Workflow retry config → retry policy belongs to each dependency/failure class → one global retry policy is wrong → rate-limit vs validation fixture → MEL configures per-step bounded policy.
481. Workflow sleep → durable sleep replaces active polling for long waits → sleeping cannot observe condition until wake/event → long-wait fixture → MEL uses sleep/event instead of burning Worker invocations.
482. Workflow resume priority → resumed sleepers can be prioritized over new queued instances → starvation assumptions must be tested under load → mixed old/new workload fixture → MEL observes age distribution and completion fairness.
483. Workflow idempotent naming → stable semantic step names aid durable replay/diagnosis → embedding random values in identity breaks correspondence → replay fixture → MEL separates stable step identity from attempt metadata.
484. Unknown outcome → timeout of workflow/external step is not proof of no effect → immediate retry risks duplicate → delayed response fixture → MEL queries postcondition before mutation retry.
485. Compensation ledger → record which irreversible/compensable effects actually occurred → planned steps are not evidence → partial workflow fixture → MEL compensation is driven by observed effect ledger.
486. State-machine legality → enumerate allowed transitions for job/run lifecycle → ad hoc booleans permit impossible combinations → property test transitions → MEL centralizes transition rules.
487. Pause semantics → pause means no new work after a defined boundary, not retroactive cancellation of in-flight effects → UI can falsely promise instant halt → pause-during-effect fixture → MEL reports pausing vs paused distinctly.
488. Resume semantics → resume continues from durable confirmed checkpoint → restarting from plan start duplicates effects → crash/pause/resume fixture → MEL rehydrates effect ledger and checkpoint.
489. Stop semantics → stop must define cooperative cancellation and residue → killing orchestration cannot undo committed external effects → stop-after-effect fixture → MEL exposes stopped-with-residue when applicable.
490. Cancellation token propagation → long operations periodically honor cancellation where safe → checking only at entry makes Stop unresponsive → delayed-stage fixture → MEL propagates abort intent through cancellable layers.
491. UI optimistic state → optimistic feedback is acceptable only if visibly provisional and reconciled → rendering success before persistence lies → forced backend failure fixture → MEL rolls back/proclaims failure on readback mismatch.
492. UI authoritative state → completion badges derive from current authoritative state/evidence → chat text is not state → stale-chat fixture → MEL status widgets query runtime source.
493. Poll visibility → poll aggressively only while relevant/visible and back off otherwise → hidden-tab polling wastes CPU/network → visibility fixture → MEL suspends/reduces nonessential polling.
494. Poll deduplication → identical concurrent GETs share one in-flight request/cache window → independent widgets multiply load → multi-widget fixture → MEL coalesces safe reads.
495. Abort stale fetch → superseded UI requests are cancelled/ignored → slow old response can overwrite fresh state → reordered-response fixture → MEL uses AbortController/generation guard.
496. Payload minimization → status endpoints return only fields needed for current view → giant diagnostic payloads raise parse/transfer cost → byte/parse benchmark → MEL separates summary and deep diagnostics.
497. Pagination boundary → histories/logs/jobs are bounded and cursor-paginated → unbounded lists degrade DOM/API → 10k-record fixture → MEL preserves stable cursor/order under concurrent inserts.
498. DOM virtualization → large activity streams render visible window rather than every row → virtualization can harm find/accessibility if careless → keyboard/screen-reader + 10k rows fixture → MEL combines virtual rendering with accessible semantics.
499. Performance evidence → optimize against p50/p95/p99 and resource metrics, not subjective feel → one local fast run hides tails → repeatable cold/warm benchmark → MEL records before/after distributions.
500. Cross-layer completion gate → UI completion requires legal durable state, causal fresh read, idempotent effect evidence and coherent UI rendering → HTTP 200 alone proves almost nothing → fault-injected end-to-end fixture → MEL only claims done after cross-layer readback.

## Deduplication / transfer notes
This block specializes prior generic idempotency/concurrency lessons into D1 causal bookmarks, Queue at-least-once/ack/DLQ, Durable Object storage/alarms, Workflows retry/sleep semantics, lifecycle pause-resume-stop and measurable UI state/performance gates. No private transfer content was ingested. Standing ROMAN correction remains active: narrative/aesthetic relevance outranks technical density; substantial scenes, desire, obstacle, subtext, sensory/material/social causality and anti-fragmentation remain required when ROMAN transfer is encountered.

## Run checkpoint 2026-09-22 — cycles 451–500
- `head_initial`: `85f404dd6f85034b7ab2f4ba2e3e6972875852ac`
- pre-write HEAD recheck: unchanged (`85f404dd6f85034b7ab2f4ba2e3e6972875852ac`)
- cycles completed: 50; additive counter: 500/10000
- transfer packages ingested: none in this block
- code/process/button changes: none; expert-corpus advancement only
- stress tests: none; no runtime/code mutation
- production: untouched
- `remaining_open`: cycles 501–10000; periodic transfer ingestion; after completion full audit/repair/stress
- `next_exact_fix`: cycles 501–550 on R2 integrity/conditional writes/multipart recovery, API/cache semantics and concrete UI performance instrumentation; then map learned gates to candidate defects without production mutation.
