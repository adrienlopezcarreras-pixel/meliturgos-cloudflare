# MEL cross-domain expert — cycles 351–400

Date: 2026-09-22. Status: knowledge hypotheses pending code-linked validation under `.agents/XP_PROTOCOL.md`.

Primary sources: Cloudflare Queues delivery guarantees, batching/retries and DLQ docs (updated 2026-04-21); Cloudflare Workflows Rules (updated 2026-09-10), overview (2026-09-18), instance subscriptions (2026-09-15), events/parameters; Cloudflare R2 consistency (2026-04-30) and Local Uploads (2026-09-18); Cloudflare Durable Objects overview (2026-07-15), SQLite storage API (2026-05-27), release notes (2026-06-30).

Each cycle: problem → principle → limit/counterexample → gate → MEL implication.

351. Queue duplicate delivery → assume at-least-once → exactly-once assumptions fail → duplicate same message ID → consumer side effects remain single via idempotency key.
352. Queue identity → assign stable producer-side operation ID → random ID per retry defeats dedup → retry identical logical job → MEL preserves operation identity across retries.
353. Queue DB writes → unique/primary key can enforce dedup → uniqueness alone does not undo external side effects → duplicate insert fixture → durable state records one logical effect.
354. Queue external effects → propagate idempotency key where provider supports it → unsupported providers need local ledger/reconciliation → duplicate external-call fixture → MEL never equates queue ack with exactly-once effect.
355. Batch failure → acknowledge completed messages individually → ack-before-effect can lose work → fail item 8/10 → items 1–7 are not needlessly replayed and item 8 remains recoverable.
356. Ack ordering → observe/persist postcondition before ack → readback can itself fail → injected post-effect/readback failure → MEL reconciles before retrying non-idempotent action.
357. Retry budget → bound retries by failure class → infinite retries amplify permanent faults → deterministic validation error → message exits hot path after configured attempts.
358. DLQ requirement → configure DLQ for important consumers → no consumer/retention still loses deferred work → poison message fixture → failed work is inspectable and recoverable before expiry.
359. DLQ observability → alert/diagnose age, count and cause classes → DLQ is not success → seeded poison messages → MEL status exposes unresolved DLQ work.
360. DLQ replay → replay only after fix and with original identity → blind replay can repeat harmful effects → repaired consumer + duplicate ledger fixture → replay is bounded and deduplicated.
361. Retry classification → separate transient, throttling and permanent errors → HTTP status alone may be misleading → typed failure corpus → MEL chooses retry/backoff/stop from semantics.
362. Retry delay → use bounded delay/backoff for transient dependencies → excessive delay violates freshness → recovery-after-N-seconds fixture → MEL balances pressure and latency.
363. Queue concurrency → cap consumers when downstream capacity is lower → low cap can underutilize healthy service → saturation fixture → MEL protects dependencies without serializing everything.
364. Queue backlog → measure oldest age as well as depth → depth alone hides stalled low-volume queues → stuck-old-message fixture → MEL detects starvation.
365. Queue payload size → store large artifacts in R2 and queue references+hashes → reference can outlive/lose artifact → missing-object fixture → consumer verifies referenced artifact before processing.
366. Queue schema → version message envelopes → unversioned evolution breaks old backlog → old/new mixed backlog fixture → MEL supports migration or rejects explicitly.
367. Queue auth context → carry minimal authorization/tenant identity, revalidate at execution → stale privileges must not be blindly replayed → revoked-permission fixture → delayed jobs fail closed.
368. Queue cancellation → cancellation is state, not deleting an already-delivered message → races exist → cancel while consumer starts → MEL checks authoritative cancellation before side effect.
369. Workflow step retry → make every retryable step idempotent → durable execution does not imply side-effect uniqueness → force same step retry → one logical external effect.
370. Workflow step boundaries → isolate independently retryable effects → giant step repeats too much; tiny steps add complexity → injected mid-flow fault → MEL resumes at meaningful checkpoint.
371. Workflow immutable input → snapshot event parameters needed for deterministic execution → live mutable reads may intentionally be required → mutate source after start → MEL distinguishes snapshot from live state.
372. Workflow mutable authority → re-read security/cancellation state immediately before privileged effect → immutable input can contain stale permission → revoke mid-workflow → action is blocked.
373. Workflow pause → use durable wait/event rather than polling loops → event may never arrive → timeout fixture → MEL pauses cheaply with explicit expiry path.
374. Workflow subscriptions → subscribe to instance events instead of aggressive status polling where suitable → subscriptions need reconnect/resume handling → disconnect/reconnect fixture → UI receives retained then live events without duplicate state regression.
375. Workflow UI state → derive UI from monotonic event sequence + authoritative status → late event can regress display → reordered-event fixture → MEL ignores stale transitions.
376. Workflow timeout semantics → timeout is a state requiring reconciliation, not proof of no effect → external call may complete late → late completion fixture → MEL checks postcondition before retry.
377. Workflow compensation → define compensating action for reversible multi-step business effects → compensation itself can fail → partial-failure fixture → MEL records forward and compensation status separately.
378. Workflow irreversibility → place approval/validation before irreversible effects → approval after effect is theater → denied-approval fixture → no irreversible action occurs pre-approval.
379. Workflow instance identity → deterministic instance/logical-job IDs prevent duplicate orchestration → same user action can legitimately create multiple jobs → double-submit fixture → MEL distinguishes duplicate from intentional repeat.
380. Workflow version provenance → record code/version/SHA with instance evidence → resumed workflow may span deployments → deploy-between-steps fixture → MEL can explain which version produced each proof.
381. R2 consistency → rely on documented strong read-after-write/list/delete semantics, not artificial sleeps → IAM propagation is a documented exception → immediate object read fixture → MEL verifies object immediately after write.
382. R2 concurrent writers → last-completing writer wins absent coordination → strong consistency is not conflict prevention → two-writer race → MEL uses conditional/versioned writes where overwrite is unsafe.
383. R2 object identity → content hash plus logical metadata detects wrong payload under correct key → metadata alone is not content proof → corrupt bytes fixture → MEL rejects hash mismatch.
384. R2 write proof → PUT success plus GET/readback/hash is stronger than 2xx → readback costs resources → critical-artifact fixture → MEL uses depth proportional to risk.
385. R2 delete proof → deletion is strongly visible → retention/lock policies can intentionally prevent delete → delete fixture → cleanup verifies absence or records policy block.
386. R2 listing → strong listing can support inventory reconciliation → prefix/schema mistakes still omit intended objects → known-manifest fixture → MEL compares inventory to expected manifest.
387. R2 Local Uploads → nearby ingestion may improve cross-region upload performance while preserving immediate availability → asynchronous internal copy is not application backup → remote-read fixture → MEL does not count locality replication as independent backup.
388. Artifact reference integrity → queue/workflow reference includes bucket/key/hash/size/schema → stale mutable key can point to new bytes → overwrite fixture → MEL uses immutable/versioned object naming for evidence.
389. DO coordination → use one Durable Object as serialization authority for a coordination domain → global singleton can bottleneck → concurrent same-key fixture → MEL shards by true coordination key.
390. DO storage → SQLite-backed DO storage is strongly consistent and transactional → transaction scope is object-local → same-object race fixture → MEL uses DO for local invariants, not imaginary cross-object ACID.
391. DO transactionSync → synchronous storage operations can rollback atomically on throw → async external calls cannot live inside transactionSync → thrown callback fixture → MEL keeps external effects outside synchronous DB transaction.
392. DO transaction → transactional storage sequence commits or aborts together → external service is outside storage transaction → injected storage exception → no partial local state.
393. DO alarms → alarms are durable scheduling primitives but require idempotent handlers → alarms can repeat/re-enter after failures → duplicate alarm fixture → MEL records alarm execution identity/postcondition.
394. DO PITR → recovery capability needs tested restore procedure, not feature presence → restore point can be wrong/incomplete → sandbox restore drill → MEL proves recovered invariant set.
395. DO lifecycle config → new declarative exports/reconciliation can simplify class lifecycle → legacy migrations remain valid and mixed assumptions are dangerous → deployment-plan fixture → MEL audits actual Wrangler compatibility path.
396. Cross-store saga → D1/R2/Queue/DO changes cannot be treated as one atomic transaction → partial success is normal → fail each boundary in turn → MEL records saga state and repairs deterministically.
397. Outbox pattern → persist intent before asynchronous publish when loss between DB commit and queue send matters → polling outbox can lag/duplicate → crash-after-commit fixture → MEL eventually publishes once logically with dedup.
398. Inbox pattern → persist consumed operation IDs/postconditions before ack → inbox growth needs retention policy → duplicate delivery after restart → MEL suppresses repeated logical effects.
399. Reconciliation job → periodically compare intended state with observed external state → reconciler must not fight legitimate manual changes → drift fixture with ownership metadata → MEL repairs only owned invariants.
400. Distributed completion claim → completion requires end-to-end postconditions across durable state, artifacts and side effects → green component health is insufficient → seeded partial saga → MEL reports partial status until all required readbacks pass.

## Deduplication
These cycles specialize prior idempotency/recovery principles into current Cloudflare Queue, Workflow, R2 and Durable Object semantics. Repeated concepts were retained only where a distinct platform failure mode or falsifiable gate was added.

## Transfer ingestion
Repository search on 2026-09-22 found no `MEL_TRANSFER_*_10000.md`; none ingested. ROMAN methodological correction remains mandatory when a provenance-bearing transfer appears: medium-specific aesthetic relevance, long scene/desire/obstacle/subtext/sensory/material-social causality, concrete motifs, and anti-fragmentation rather than technical-protocol density.
