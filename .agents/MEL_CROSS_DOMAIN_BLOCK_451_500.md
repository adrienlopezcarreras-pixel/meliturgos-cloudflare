# MEL cross-domain expert block — cycles 451–500/10000

Date: 2026-09-22
Counter after block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_500/10000`

## Scope and provenance
Primary/current sources consulted 2026-09-22: MCP 2026-07-28 specification release material (authorization/list caching/stateless core/tasks); Cloudflare Workers bindings, Service Bindings/RPC, Workers limits, Durable Object alarms, Queues configuration and Workflows limits; Playwright actionability/auto-waiting documentation. Repository transfer search for `MEL_TRANSFER_` returned no package, so none was ingested.

## 50 deduplicated cycles
Each line is one cycle: precise problem → principle/limit → falsifiable MEL gate/implication.

451. Capability truth → advertise only tools actually bound in the current runtime → capability list must be generated from observed bindings/registry, not model memory.
452. Tool schema drift → cache discovery only within declared lifetime/version → invalidate on version/capability change and prove refreshed schema before call.
453. Tool authorization → possession of a tool name is not permission → gate call on authenticated principal + scoped capability and test denied scope.
454. MCP authorization mix-up → validate authorization issuer before redeeming code → negative test wrong issuer must fail closed.
455. MCP list caching → respect server TTL/cache scope rather than refetching every turn → test hit/miss/invalidation counters.
456. Stateless protocol core → conversational state must live in explicit MEL state/memory, not transport assumptions → restart transport and prove continuity from persisted state.
457. Long-running tool task → return durable task identity/status rather than holding fragile UI request → disconnect/reconnect must observe same task.
458. Tool argument validation → validate against current schema before dispatch → malformed/unknown fields rejected before side effect.
459. Tool result validation → HTTP/success envelope is insufficient → assert semantic postcondition and typed result.
460. Side-effect proof → write success requires readback/observation → create/update gate performs authoritative reread.
461. Idempotent retry → retried mutations need stable operation key → duplicate delivery yields one logical effect.
462. Ambiguous timeout → timeout after dispatch is UNKNOWN, not FAIL or SUCCESS → reconcile authoritative state before retry.
463. Bounded retry → exponential/backoff budget plus terminal state → test persistent failure stops within configured bound.
464. At-least-once alarm → Durable Object alarm handlers must tolerate repeats → replay same alarm and assert no duplicate logical effect.
465. Queue redelivery → consumer must deduplicate at business-operation boundary → replay message ID/idempotency key and compare state.
466. Dead-letter handling → poison work must become inspectable, not infinite retry → forced permanent error reaches DLQ/terminal diagnostic.
467. Workflow resumption → durable step output/state must permit restart → inject failure between steps and prove no repeated irreversible effect.
468. Worker request lifetime → do not rely on unbounded post-response work; waitUntil has bounded extension → long work routes to queue/workflow/task.
469. RPC payload size → avoid large buffered RPC values; stream/chunk large data → boundary test below/above serialized limit.
470. RPC invocation depth → service decomposition must respect per-request invocation ceiling → synthetic chain fails safely before platform limit.
471. Service compatibility → producer changes must remain backward-compatible while consumers roll → mixed-version contract test.
472. Binding security → bindings are capabilities; least privilege per service/environment → preview cannot access production-only resource.
473. Binding presence → local simulation can differ from remote → startup/diagnostic explicitly identifies simulated vs real binding.
474. Durable coordination → stateless Worker instance cannot be lock authority → concurrency-sensitive state delegated to transactional/DO mechanism.
475. Concurrent mutation → serialize or use compare/version checks → two writers test cannot silently lose update.
476. Read-after-write semantics → choose authoritative store for proof, not stale cache → gate bypasses/invalidate cache for verification.
477. Tool cancellation → UI Stop must propagate AbortSignal/cancel where supported → canceled job ceases side effects and reports terminal canceled state.
478. Orphan job → client disconnect must not silently abandon durable work → reconnect/status lookup finds job or explicit cancellation.
479. Browser actionability → click PASS requires unique, visible, stable, enabled element receiving events → overlay/disabled/duplicate locator tests fail.
480. Forced browser click → `force` can mask real UI defect → prohibited in acceptance tests except explicitly testing force behavior.
481. Browser assertions → use retrying observable assertions instead of arbitrary sleeps → delayed UI state test remains deterministic.
482. Navigation race → action and resulting navigation/state must be causally awaited → slow-navigation test cannot report premature PASS.
483. Download truth → download control PASS requires bytes, expected metadata/hash and readable artifact → empty/corrupt download fails.
484. Upload truth → file picker/drop PASS requires server/store persistence plus UI readback → unsupported/oversize/error cases visible.
485. Drag-drop truth → synthetic event alone is not proof → resulting domain state/persistence must change and survive reload.
486. Form truth → submit PASS includes validation, handler, persisted effect, reread and error path → button click alone never sufficient.
487. Shortcut truth → keyboard shortcut must act only in correct focus/context → editable-field collision negative test.
488. Menu/tab truth → selection must change accessible active state and relevant content → hidden panel or stale state fails.
489. Audio capture truth → permission, device stream, encoded bytes, processing and playback/transcript state all observable → denial/no-device tests graceful.
490. Voice interruption → stop/barge-in must cancel synthesis/listening state consistently → race test leaves no zombie audio job.
491. Computer-use coordinate fragility → prefer semantic locators; coordinates require viewport calibration → resize/zoom test catches drift.
492. Screenshot evidence → screenshot is supporting evidence, not semantic proof → pair image with DOM/runtime/store assertion.
493. Capability self-knowledge → MEL answers “can you?” from current registry + authorization + health → unavailable dependency produces qualified no/limited answer.
494. Status follow-up → “is it done?” resolves active task identity before answering → multiple-job test chooses explicit active/recent context or asks targeted clarification.
495. False completion → terminal success requires postcondition evidence timestamp/provenance → missing readback yields pending/unknown.
496. Tool provenance → every consequential result records tool/source, operation ID, time and authoritative object/version → audit can trace claim to observation.
497. Error taxonomy → distinguish validation/auth/rate-limit/transient/timeout/semantic mismatch → retry only retryable classes.
498. Rate-limit handling → honor retry hints and global budget → 429 test backs off without retry storm.
499. UI/runtime coherence → backend terminal state and visible UI state must converge → injected websocket/poll loss recovers on authoritative refresh.
500. Acceptance invariant → presence/code/HTTP 200 never equals PASS; require input→handler→processing→effect/persistence→readback→coherent UI plus error/timeout/recovery → encode as reusable deep-capability gate template.

## Cross-cutting implications
MEL should maintain a runtime capability registry containing availability, authorization scope, health, schema/version and proof timestamp; all self-knowledge answers and tool routing consume it. Mutations require operation IDs and explicit UNKNOWN reconciliation after ambiguous timeout. Browser/UI acceptance should default to semantic locators, Playwright actionability and observable postconditions, never forced clicks or sleep-based success. Long work belongs to durable tasks/queues/workflows with bounded retry, idempotency, cancellation and inspectable terminal state.

## Medium-specific correction retained
Technical expertise must not override aesthetic relevance. ROMAN remains governed by long scene, desire, obstacle, subtext, sensory embodiment, material/social causality, concrete motifs/objects/places/bodies/habits/traces, and anti-fragmentation audit. `Le Roman des signes` 125-micro-chapter version remains rejected; V2 starts from zero with substantial human/material-life chapters and computing only accessory.

## Limits / counter-examples
Not every read-only tool needs idempotency keys; not every local UI interaction has persistence; some external systems cannot expose strong read-after-write consistency. In those cases the gate must name the weaker observable contract rather than fabricate certainty. Durable mechanisms do not remove the need for business-level deduplication. Auto-waiting reduces timing flakiness but cannot prove domain correctness.
