# MEL Cross-domain Expert PLUS — cycles 551–600

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_600/10000`

Provenance: additive block prepared from candidate HEAD `08357bff97023aa0538305026327e5d56c87769c`; pre-write HEAD rechecked unchanged. No production action authorized. No private autobiographical material included. Format: problem → principle/limit → pattern/anti-pattern → falsifiable gate → MEL implication.

## Primary/recent sources reviewed 2026-09-22
- Cloudflare Workers External Services, updated 2026-04-23: https://developers.cloudflare.com/workers/configuration/integrations/external-services/
- Cloudflare Workers ReadableStream, updated 2026-09-05: https://developers.cloudflare.com/workers/runtime-apis/streams/readablestream/
- Cloudflare Workers streaming JSON, updated 2026-04-23: https://developers.cloudflare.com/workers/examples/streaming-json/
- Cloudflare Workers WebSockets, updated 2026-04-23: https://developers.cloudflare.com/workers/runtime-apis/websockets/
- Cloudflare APIs/microservices guidance, updated 2026-04-24: https://developers.cloudflare.com/use-cases/apis/
- MDN AbortController / Streams API: https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort and https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams
- OWASP API Security Top 10 2023: https://api-security.owasp.org/editions/2023/en/0x11-t10/

551. API contract truth → schema is an executable boundary, not prose → undocumented coercion creates client/runtime divergence → malformed/type-boundary fixtures → MEL validates request/response shape at edges.
552. Unknown fields → reject or explicitly ignore by contract; never silently persist privileged extras → permissive mass assignment breaks property authorization → injected-admin-field fixture → MEL allowlists writable fields.
553. Object authorization → authenticate identity then authorize every user-supplied object ID → login alone is not object access → cross-user-ID fixture → MEL gates memory/files/jobs by ownership/scope.
554. Function authorization → admin/Teacher/diagnostic endpoints require function-level policy, not hidden UI → obscurity is no control → direct-call fixture → MEL enforces role/capability server-side.
555. Authentication failure semantics → expired/missing/invalid credentials fail closed and distinctly enough for recovery without leaking secrets → fallback-to-anonymous can mutate wrong scope → token matrix fixture → MEL never upgrades uncertain identity.
556. Token handling → credentials live in secrets/secure bindings and are excluded from logs/errors/client payloads → redaction after logging is too late → canary-secret fixture → MEL tests telemetry for leakage.
557. Third-party API distrust → validate external responses as untrusted input → provider reputation does not guarantee schema/safety → malformed-upstream fixture → MEL parses with bounds and explicit schema.
558. Redirect policy → external fetches must not blindly follow attacker-controlled redirects into internal/sensitive destinations → URL validation only before redirect is insufficient → redirect-to-private fixture → MEL constrains destination chain.
559. SSRF boundary → user URLs require scheme/host/IP/DNS policy appropriate to capability → naive string prefix checks are bypassable → encoded/redirect/rebinding fixtures → MEL isolates fetch capability.
560. Resource consumption → bound body size, parse work, fan-out, concurrency and expensive business flows → rate limit alone misses per-request bombs → oversized/fanout fixture → MEL budgets each endpoint.
561. Timeout contract → every external call has bounded timeout aligned with caller deadline → infinite waits pin jobs/UI → hanging-upstream fixture → MEL exposes timeout as recoverable state.
562. Cancellation propagation → Stop/route change aborts fetch/body/stream and downstream work where safe → UI cancellation without backend signal wastes resources → abort fixture → MEL propagates AbortSignal through layers.
563. Abort observation → aborted operation is not automatically rolled back → treating AbortError as no side effect causes duplicates → abort-after-commit fixture → MEL reconciles postcondition before retry.
564. Idempotency scope → idempotency key binds principal + operation + canonical request semantics → global key reuse can cross-contaminate users/actions → collision fixture → MEL namespaces keys.
565. Idempotency response → same key/same request converges to same semantic result; same key/different request conflicts → accepting mutation under reused key defeats protection → mismatch fixture → MEL stores request fingerprint.
566. Idempotency lifetime → retention window matches realistic retry horizon and side-effect risk → expiring too early permits duplicate side effects → delayed-retry fixture → MEL documents/observes expiry.
567. Unknown outcome reconciliation → timeout after mutation triggers read/status lookup before replay → transport failure is not operation failure → late-success fixture → MEL uses postcondition checks.
568. Retry classification → retry transient transport/5xx/429 only when operation semantics permit → retrying auth/schema/conflict errors adds load → status matrix fixture → MEL centralizes bounded retry policy.
569. Retry jitter → exponential backoff with jitter prevents synchronized retry storms → fixed intervals herd clients → concurrent-failure fixture → MEL randomizes bounded delays.
570. Retry budget → total attempts and wall-clock deadline are finite and observable → nested retries multiply explosively → layered-failure fixture → MEL carries one retry/deadline budget.
571. Circuit protection → repeated upstream failure should reduce futile calls while preserving probes/recovery → permanent open circuit hides recovery → outage/recovery fixture → MEL uses bounded state with health probes.
572. Pagination contract → stable cursor/order prevents duplicate/missing records under concurrent writes → offset pagination on mutable datasets drifts → insertion-between-pages fixture → MEL prefers cursor/snapshot semantics.
573. Cursor integrity → cursor is opaque/authenticated or server-resolved, not trusted client authority → editable cursors can bypass scope/order → tampered-cursor fixture → MEL validates cursor provenance.
574. Streaming threshold → large bodies should stream incrementally rather than fully buffer → streaming adds complexity for tiny payloads → size matrix fixture → MEL chooses by measured memory/latency.
575. Backpressure → producer respects consumer/writable pressure instead of unbounded queueing → fast producer can exhaust memory → slow-consumer fixture → MEL uses pipe semantics/bounded buffers.
576. Stream completion → headers/HTTP 200 before full stream does not prove successful body completion → mid-stream failure can yield truncated artifact → cut-stream fixture → MEL requires terminal integrity/length/parser evidence.
577. Stream cancellation → reader cancellation must release upstream resources and mark partial artifact incomplete → merely closing UI reader can leak backend work → cancel-midstream fixture → MEL wires cleanup.
578. Stream parser bounds → incremental JSON parsing still needs depth/token/string/record limits → streaming alone does not prevent computational bombs → adversarial JSON fixture → MEL bounds parser complexity.
579. Framing → streamed records require unambiguous framing/versioning → concatenated JSON/chunks can be misparsed → split-boundary fixture → MEL uses defined NDJSON/SSE/binary framing where appropriate.
580. UTF-8 boundaries → text decoder must handle multibyte characters split across chunks → per-chunk naive decode corrupts text → split-codepoint fixture → MEL uses streaming decoder.
581. Integrity while streaming → compute digest incrementally and compare expected terminal value when integrity matters → successful parsing is not byte identity → bit-flip fixture → MEL couples stream completion to digest.
582. Compression streaming → decompression bombs require output/ratio/time bounds → small compressed input can explode memory/CPU → bomb fixture → MEL limits expanded representation.
583. WebSocket authentication → authenticate/authorize upgrade and revalidate capability where sessions are long-lived → connection existence is not perpetual authority → revoked-session fixture → MEL closes/restricts stale sessions.
584. WebSocket coordination → shared realtime state needs explicit single coordination authority such as Durable Object where ordering matters → independent edge sockets cannot guarantee shared order → two-client race fixture → MEL centralizes mutable room/session state.
585. WebSocket backpressure → bound outbound queues and define slow-client policy → unbounded buffered messages exhaust memory → stalled-client fixture → MEL drops/coalesces/closes per contract.
586. Reconnect semantics → reconnect carries generation/sequence and reconciles missed state → treating reconnect as fresh can duplicate commands → disconnect-after-command fixture → MEL resumes from authoritative state.
587. Event ordering → sequence numbers/version checks distinguish late from current updates → wall-clock timestamps alone are ambiguous → reordered-event fixture → MEL rejects stale state transitions.
588. At-least-once delivery → consumers must be idempotent/deduplicating where queues/workflows may redeliver → assuming exactly-once creates duplicate side effects → duplicate-message fixture → MEL stores semantic receipt.
589. Poison message → deterministic failing item gets bounded retries then quarantine/dead-letter evidence → infinite retry blocks throughput → malformed-job fixture → MEL surfaces actionable failure.
590. Partial batch → batch handler records per-item outcome and retries only unresolved items when platform permits → replaying whole batch duplicates successes → one-fail-many-pass fixture → MEL scopes acknowledgements.
591. Schema versioning → messages/jobs/API payloads carry compatible version/migration path → rolling deploy can mix producers/consumers → old/new matrix fixture → MEL supports explicit compatibility window.
592. API inventory → every exposed endpoint/version/debug route is inventoried and tested → forgotten endpoints escape auth/maintenance → route enumeration fixture → MEL compares runtime routes to canonical manifest.
593. Error envelope → machine-readable code + safe human message + correlation ID; no stack/secret leakage → generic 500 impairs recovery while verbose errors leak internals → failure fixture → MEL standardizes errors.
594. Correlation provenance → trace IDs link UI request, API handler, queue/workflow and persistence without becoming authorization → trusting client trace as identity is unsafe → forged-trace fixture → MEL treats traces as observability only.
595. Observability cardinality → metrics avoid user/file/token IDs as unbounded labels → high-cardinality telemetry can itself exhaust cost/storage → load fixture → MEL aggregates safely.
596. Sensitive logging → log minimum necessary metadata and redact bodies/headers by default → debug convenience can persist private corpus → canary-PII fixture → MEL has privacy-safe structured logs.
597. Recovery boundary → retry/restart must resume from durable checkpoint, not UI optimism → frontend state is not source of truth → browser-refresh-midjob fixture → MEL reconstructs status server-side.
598. Capability truth → UI exposes action only when runtime capability probe and authorization agree, while server still validates direct calls → static button presence lies → unavailable-binding fixture → MEL reports exact capability state.
599. Contract stress → combine malformed auth, large body, slow stream, cancellation, duplicate request and reordered events under bounded load → happy-path unit tests miss interaction failures → composed fixture → MEL stress suite asserts no leak/duplicate/false PASS.
600. API/stream completion gate → PASS requires authorized contract-valid input → bounded processing/backpressure → durable/idempotent effect → authoritative readback/terminal stream integrity → coherent UI/runtime state and recoverable failure path; HTTP 200 alone never suffices → fault matrix fixture → MEL applies this chain to every audited control.

## Deduplication / transfer notes
551–573 specialize generic security/retry lessons into concrete API contract, authorization, SSRF, idempotency and pagination gates. 574–591 add stream/backpressure/WebSocket/queue semantics not covered by the preceding R2/cache block. 592–600 connect API inventory, privacy-safe observability and capability truth to MEL's required deep-control audit. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. Standing ROMAN correction remains active: technical expertise must yield to medium/intention; substantial scenes, desire, obstacle, subtext, sensory/material/social causality, concrete signs and anti-fragmentation remain mandatory when ROMAN transfer is encountered.

## Run checkpoint 2026-09-22 — cycles 551–600
- `head_initial`: `08357bff97023aa0538305026327e5d56c87769c`
- pre-write HEAD recheck: unchanged (`08357bff97023aa0538305026327e5d56c87769c`)
- cycles completed: 50; additive counter: 600/10000
- transfer packages ingested: none found
- code/process/button changes: none; expert-corpus advancement only
- stress tests: none; no runtime/code mutation
- production: untouched
- `remaining_open`: cycles 601–10000; periodic transfer ingestion; after completion full audit/repair/stress
- `next_exact_fix`: cycles 601–650 on D1/DO/Queues/Workflows transactional concurrency, migrations and recovery; then map learned gates to candidate defects without production mutation.
