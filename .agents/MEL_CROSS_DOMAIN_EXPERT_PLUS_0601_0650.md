# MEL Cross-domain Expert PLUS — cycles 601–650

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_650/10000`

Provenance: additive block prepared from candidate HEAD `3b935bc07ab70327114902b6854960731b81937e`; pre-write HEAD rechecked unchanged. No production action authorized. No private autobiographical material included. Format: problem → principle/limit → pattern/anti-pattern → falsifiable gate → MEL implication.

## Primary/recent sources reviewed 2026-09-22
- Cloudflare D1 Retry queries, updated 2026-08-10: https://developers.cloudflare.com/d1/best-practices/retry-queries/
- Cloudflare Durable Objects SQLite storage API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Cloudflare Durable Objects Alarms, updated 2026-04-21: https://developers.cloudflare.com/durable-objects/api/alarms/
- Cloudflare Queues Delivery guarantees, updated 2026-04-21: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Cloudflare Queues batching/retries and DLQ: https://developers.cloudflare.com/queues/configuration/batching-retries/ and https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- Cloudflare Queues pull consumers: https://developers.cloudflare.com/queues/configuration/pull-consumers/
- Cloudflare Workflows overview, updated 2026-09-18: https://developers.cloudflare.com/workflows/

601. D1 retry scope → retry only classified transient failures and bound attempts → blanket retry can replay semantic conflicts → injected transient/permanent error matrix → MEL centralizes D1 retry classification.
602. D1 backoff → write retries use exponential backoff with jitter → immediate synchronized retries amplify contention → concurrent transient-failure fixture → MEL carries bounded jittered retry policy.
603. D1 read retry awareness → platform may retry read-only queries, so application retries must not multiply unknowingly → nested retries obscure latency budget → forced retryable read fixture → MEL measures total attempts/deadline.
604. D1 write idempotence → a retryable transport/storage error does not prove write absence → blind replay can duplicate effects → lost-response-after-commit fixture → MEL uses unique semantic keys/readback.
605. D1 multi-statement invariants → related mutations need an atomic strategy or compensating invariant → sequential independent writes can expose half-state → fault-between-statements fixture → MEL tests invariant after interruption.
606. D1 migration monotonicity → migrations are ordered, immutable once applied and observable → editing historical migration creates environment drift → fresh-vs-upgraded DB fixture → MEL compares schema lineage.
607. D1 expand/contract → rolling schema changes preserve compatibility across old/new code during transition → destructive rename in one step breaks mixed versions → version-skew fixture → MEL stages additive then cleanup migration.
608. D1 backfill resumability → large backfills checkpoint deterministic ranges and tolerate restart → one giant mutation is fragile → interruption/resume fixture → MEL records durable cursor and counts.
609. D1 uniqueness as concurrency guard → encode business uniqueness in database constraints where possible → check-then-insert races under concurrency → parallel duplicate fixture → MEL relies on authoritative constraint plus conflict handling.
610. D1 optimistic concurrency → version/etag predicate detects lost update → last-write-wins silently overwrites concurrent edits → two-writer fixture → MEL returns conflict/reload path.
611. D1 pagination consistency → mutable tables need stable key/cursor semantics → offset pagination drifts during writes → insert/delete-between-pages fixture → MEL paginates on deterministic key.
612. D1 tombstones → destructive deletion that participates in sync/recovery may need explicit tombstone/version → absence alone cannot distinguish deleted from unseen → offline-rejoin fixture → MEL propagates deletion state deliberately.
613. D1 retention/privacy → durability is not permission for indefinite storage → backups/backfills can defeat deletion intent → deletion-and-restore fixture → MEL defines retention and restore reconciliation.
614. DO single authority → place strongly ordered mutable state behind the object key that owns it → multiple authorities recreate races → concurrent commands to same entity fixture → MEL routes ownership consistently.
615. DO key design → object ID determines isolation and hotspot shape → global singleton simplifies order but can bottleneck unrelated work → skewed-load fixture → MEL shards by true consistency boundary.
616. DO storage atomicity → storage transaction groups invariant-preserving operations → application-level async gaps inside invariant invite interleaving → injected concurrent request fixture → MEL commits state transition atomically.
617. DO transactionSync limit → synchronous transaction callback cannot await external work → network call inside transaction is invalid architecture → external-delay fixture → MEL separates decision/commit from side effect.
618. DO external side effects → database atomicity cannot atomically include remote API → transaction success plus remote failure needs outbox/saga semantics → fail-remote-after-commit fixture → MEL records intent durably before delivery.
619. DO input gates → single-threaded coordination does not remove validation/auth requirements → serialization is not authorization → direct malicious request fixture → MEL validates before state mutation.
620. DO alarm semantics → alarms are at-least-once and retried, so handler must be idempotent → assuming once-only can duplicate work → repeated-alarm fixture → MEL uses durable due-item receipts.
621. DO single alarm → one object has one scheduled alarm, so multiple timers require durable schedule multiplexing → repeatedly setting alarms can overwrite intent → multi-timer fixture → MEL stores ordered due set and schedules earliest.
622. DO alarm delay → maintenance/failover may delay execution → exact wall-clock promise is unsafe → delayed-alarm fixture → MEL models deadline windows and overdue processing.
623. DO alarm recovery → handler recomputes authoritative due work after wake rather than trusting volatile memory → eviction loses in-memory queue → eviction-before-alarm fixture → MEL rebuilds from storage.
624. DO PITR boundary → point-in-time recovery can restore storage but external side effects may not rewind → restore is not whole-system rollback → restore-after-external-action fixture → MEL reconciles external ledger.
625. DO schema evolution → embedded SQLite state still needs explicit version/migration path → object longevity makes lazy assumptions persistent → old-object fixture → MEL upgrades deterministically and records version.
626. Queue delivery model → at-least-once means duplicate delivery is normal design input → exactly-once assumption corrupts side effects → duplicate message fixture → MEL uses semantic idempotency receipt.
627. Queue message identity → generate stable business/idempotency ID at production, not rely only on ephemeral delivery metadata → redelivery identity may differ from business operation → replay fixture → MEL deduplicates semantic command.
628. Queue ack timing → acknowledge only after required durable effect/readback → ack-before-effect loses work → crash-between-ack/effect fixture → MEL orders effect then ack.
629. Queue partial batch → explicitly ack successful items so one failure need not replay whole successful batch → all-or-nothing batch handling duplicates work → one-poison-item fixture → MEL tracks per-message outcome.
630. Queue retry classification → retry transient/resource failures, quarantine deterministic invalid input → retrying malformed payload wastes budget → schema-error fixture → MEL separates permanent/transient failure.
631. Queue DLQ → configure dead-letter handling where loss after max retries is unacceptable → default discard after retries can erase evidence → poison-message fixture → MEL surfaces DLQ backlog and replay controls.
632. Queue DLQ lifecycle → DLQ is not archival storage; it needs active handling/retention awareness → assuming indefinite retention loses forensic evidence → aged-DLQ fixture → MEL exports or resolves within policy.
633. Queue visibility lease → pull consumer must finish/ack within lease or tolerate concurrent redelivery → long processing beyond visibility can duplicate work → slow-consumer fixture → MEL sizes lease or checkpoints idempotently.
634. Queue lease ownership → late ack cannot be treated as exclusive proof if message may have been redelivered → lease timeout creates overlapping processors → delayed-ack fixture → MEL protects effect with semantic receipt.
635. Queue backpressure → concurrency/batch size should match downstream capacity → autoscaling without downstream budget causes overload → constrained-D1/upstream fixture → MEL applies bounded consumer concurrency.
636. Queue retry cost → retries consume operations and latency → aggressive retries are not free resilience → persistent-outage fixture → MEL records retry count/cost and uses circuit/backoff policy.
637. Queue ordering → do not infer global order unless architecture explicitly supplies it → concurrent consumers reorder completion → reordered pair fixture → MEL uses sequence/version where order matters.
638. Queue payload version → producer/consumer rolling deployments require compatible schema version → unversioned payload breaks old consumer → mixed-version fixture → MEL validates and migrates message envelope.
639. Queue poison observability → failed message needs safe correlation, reason and attempts without logging sensitive body → body dump leaks private corpus → canary-PII fixture → MEL logs metadata/digest and protected diagnostics.
640. Queue replay → DLQ/manual replay must preserve original semantic idempotency identity → generating new ID on replay defeats dedupe → replay fixture → MEL distinguishes delivery attempt from command identity.
641. Workflow durability → use durable steps for work that must survive request lifetime → keeping long operation in request/DO memory is fragile → worker termination fixture → MEL chooses Workflow for long multi-step jobs.
642. Workflow step identity → stable unique step names/identity are part of replay semantics → renaming/reusing step meaning can confuse resumed executions → version-skew resume fixture → MEL versions workflow definitions deliberately.
643. Workflow side effects → retries mean each side-effecting step still needs idempotency/reconciliation → durable execution is not magical exactly-once → fail-after-side-effect fixture → MEL binds external idempotency key to workflow+step.
644. Workflow checkpoint granularity → steps should isolate meaningful durable boundaries, not every trivial line nor giant opaque phase → too fine adds overhead; too coarse repeats expensive work → fault matrix fixture → MEL chooses recovery-oriented boundaries.
645. Workflow wait/approval → paused external approval must revalidate authorization and current state on resume → old approval can become stale → revoke/change-before-resume fixture → MEL checks generation/capability at continuation.
646. Workflow timeout → waits and external events need explicit expiry/compensation → indefinite waiting strands resources/state → missing-event fixture → MEL transitions to observable timed-out state.
647. Workflow cancellation → cancel must have defined semantics for completed steps and pending side effects → UI Stop cannot imply rollback → cancel-after-step fixture → MEL reports committed vs canceled remainder.
648. Workflow version migration → in-flight instances can outlive deployment, so new code must preserve/resume old execution contract or explicitly migrate → assuming all runs are new breaks recovery → deploy-mid-run fixture → MEL maintains compatibility window.
649. Cross-system outbox → D1/DO state transition plus queue/workflow launch should use durable intent/outbox when atomic cross-service commit is unavailable → fire-and-forget after DB commit can lose launch → crash-after-commit fixture → MEL drains idempotent outbox.
650. Durable pipeline completion gate → PASS requires validated command → authoritative atomic state/intention → idempotent queue/workflow processing → bounded retries/DLQ or terminal failure → durable readback/reconciliation → coherent UI status; process start or HTTP success alone is never PASS → composed crash/duplicate/reorder fixture → MEL applies this gate to Collector, autonomy jobs, memory ingestion and ShardVault orchestration.

## Deduplication / transfer notes
601–613 specialize the prior generic retry/idempotency rules for D1 concurrency and migration recovery. 614–625 add Durable Object authority, transaction, alarm and PITR boundaries. 626–640 specialize at-least-once queue behavior including leases/DLQ/replay. 641–650 add durable Workflow and cross-system outbox semantics. Repository search found no `MEL_TRANSFER_*` package on the searchable branch; none ingested. Standing ROMAN correction remains active: technical expertise must yield to medium/intention; substantial scenes, desire, obstacle, subtext, sensory/material/social causality, concrete signs and anti-fragmentation remain mandatory when ROMAN transfer is encountered; `Le Roman des signes` 125-microchapter version remains rejected and V2 restarts from zero.

## Run checkpoint 2026-09-22 — cycles 601–650
- `head_initial`: `3b935bc07ab70327114902b6854960731b81937e`
- pre-write HEAD recheck: unchanged (`3b935bc07ab70327114902b6854960731b81937e`)
- cycles completed: 50; additive counter: 650/10000
- transfer packages ingested: none found
- code/process/button changes: none; expert-corpus advancement only
- stress tests: none; no runtime/code mutation
- production: untouched
- `remaining_open`: cycles 651–10000; periodic transfer ingestion; after completion full audit/repair/stress
- `next_exact_fix`: cycles 651–700 on Git/GitHub/CI/CD, exact-SHA preview evidence, migration/deploy rollback and supply-chain integrity; then continue defect mapping without production mutation.
