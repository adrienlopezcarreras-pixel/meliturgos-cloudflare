# MEL Cross-domain Expert PLUS — cycles 351–400

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_400/10000`

Provenance: additive block prepared from candidate HEAD `db34afc1590c96dd4e74cbc7d9e366029db37cfa`. No production action is authorized. No private autobiographical material is included. These are knowledge hypotheses until applied and proved under `.agents/XP_PROTOCOL.md`.

## Primary/recent sources reviewed 2026-09-21
- Cloudflare Agents MCP docs — McpAgent deprecation / createMcpHandler migration: https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/
- Cloudflare Agents SDK v0.20.0 / MCP 2026-07-28 support: https://developers.cloudflare.com/changelog/post/2026-07-27-agents-sdk-v0.20.0-mcp-sdk-v2/
- Cloudflare MCP transport: https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/
- Cloudflare MCP tools: https://developers.cloudflare.com/agents/model-context-protocol/protocol/tools/
- Cloudflare MCP elicitation changelog: https://developers.cloudflare.com/changelog/post/2026-07-13-mcp-client-elicitation/
- Cloudflare AI Search metadata filtering: https://developers.cloudflare.com/ai-search/configuration/retrieval/filtering/
- Cloudflare Vectorize introduction/changelog: https://developers.cloudflare.com/vectorize/get-started/intro/ and https://developers.cloudflare.com/changelog/product/vectorize/

Format: problem → principle/limit → pattern/anti-pattern → falsifiable gate → concrete MEL implication.

351. Retrieval scope → constrain candidate corpus before semantic ranking when authoritative metadata exists → over-filtering can erase relevant evidence → known cross-scope query fixture → MEL filters only on explicit provenance/scope constraints.
352. Metadata filter semantics → filters are retrieval constraints, not post-hoc decoration → metadata strings may have platform-specific indexed-prefix limits → boundary-length fixture → MEL validates filterability rather than assuming full-string equality.
353. Metadata schema planning → decide filterable fields before bulk ingestion where index requires predeclared metadata indexes → schema cannot anticipate every future facet → migration fixture → MEL versions retrieval metadata deliberately.
354. Retrieval freshness → newly written vectors may not be instantly queryable → write success is not search visibility → write-then-poll bounded fixture → MEL reports indexing pending until retrieval readback succeeds.
355. Eventual-consistency UX → expose ingestion/indexing state separately from durable source persistence → collapsing states produces false “memory lost” reports → delayed-index fixture → MEL can distinguish stored, indexed and retrievable.
356. Source-of-truth split → preserve canonical document/object independently of vector index → vector store is an access structure, not archival truth → rebuild-index-from-source fixture → MEL can recover retrieval without losing knowledge.
357. Retrieval identifier stability → use stable source/chunk identifiers so reindexing can replace rather than duplicate → content hashes alone may change on harmless formatting → repeat-ingest fixture → MEL deduplicates logical records and versions content.
358. Chunk provenance → every retrieved chunk carries source id, version/hash, location and ingestion timestamp where available → metadata itself can be stale → mutate-source fixture → MEL can detect superseded chunks.
359. Query-time authority → retrieval score does not establish factual authority → semantically close obsolete notes can outrank current runtime → conflict fixture → MEL ranks authority/freshness separately from similarity.
360. Retrieval abstention → low-quality/no-match retrieval should produce no evidence rather than forced nearest neighbors → fixed score thresholds are corpus-dependent → irrelevant-query corpus → MEL may answer from other authority or clarify instead of citing junk.
361. Top-k calibration → tune candidate count against recall and downstream context cost → larger k can add distraction and latency → labeled retrieval benchmark across k → MEL chooses k empirically per corpus/task.
362. Metadata leakage → do not inject private/internal metadata into model context merely because retrieval needs it → provenance fields can contain sensitive paths/users → redaction fixture → MEL separates retrieval-control metadata from model-visible evidence.
363. Context packing → pack evidence by marginal utility, not raw retrieval order → redundant chunks consume context → duplicate-neighbor fixture → MEL diversity-deduplicates before prompt assembly.
364. Parent-child retrieval → retrieve granular chunks but optionally expand bounded parent context when interpretation needs it → full-document expansion can swamp context → local-reference fixture → MEL expands only around evidence requiring context.
365. Quote boundary → preserve exact source span separately from generated summary → summaries can blur what source actually said → citation-span verifier → MEL can support claims with traceable excerpts.
366. Contradiction set → retrieve credible competing evidence when conflict is plausible instead of selecting one silently → indiscriminate diversity can manufacture false conflict → seeded contradictory versions → MEL identifies version/authority and explains unresolved conflict.
367. Temporal retrieval → time-sensitive questions require date-aware filtering/ranking → newest is not always legally/semantically controlling → historical-vs-current fixture → MEL interprets requested temporal frame explicitly.
368. Memory tiering → recent conversational state and long-term semantic memory have different authority/decay rules → recency alone can privilege casual error → correction fixture → MEL stores correction/supersession links, not just timestamps.
369. Memory mutation → corrections should supersede prior claims while preserving audit history where appropriate → destructive overwrite loses provenance → corrected-fact retrieval fixture → MEL returns active fact and can trace superseded record.
370. Memory deletion → deletion must remove canonical record and derived retrieval artifacts or tombstone them consistently → deleting only vector/source creates ghost memory → delete-then-search fixture → MEL proves non-retrievability after deletion.
371. Reindex idempotence → replaying an ingestion job should converge to one logical corpus state → append-only retries create duplicates → same-job replay fixture → MEL ingestion uses stable idempotency keys.
372. Embedding migration → changing embedding model/dimension requires explicit parallel/rebuild strategy → mixing incompatible vectors corrupts retrieval → dual-index migration fixture → MEL records embedding version and cutover state.
373. Retrieval benchmark → measure recall/precision on answer-bearing chunks independently from generation quality → good final answer can mask retrieval failure via model prior → hidden-fact fixture → MEL diagnoses retrieval separately.
374. End-to-end RAG eval → also test final grounded answer because perfect retrieval can still be misused → retrieval metric alone is insufficient → adversarial distractor fixture → MEL grades claim support and citation alignment.
375. No-answer corpus → include questions absent from corpus → positive-only benchmarks reward hallucinated retrieval confidence → held-out absent facts → MEL demonstrates abstention/alternate-source behavior.
376. MCP generation compatibility → protocol generation is a runtime contract, not merely package version → old and new clients can coexist during migration → dual-client fixture → MEL probes/negotiates rather than assumes one MCP era.
377. McpAgent migration → deprecated stateful McpAgent should not be chosen for new stateless servers → existing session/replay dependencies may require staged coexistence → legacy-session fixture → MEL uses createMcpHandler for new stateless tools and migration lanes for old stateful flows.
378. Streamable HTTP → use current remote MCP transport for new connections rather than designing around deprecated SSE transport → legacy aliases can hide forced-SSE clients → transport-negotiation fixture → MEL diagnostics expose negotiated transport.
379. Internal RPC boundary → direct Cloudflare RPC can reduce network overhead for internal MCP paths → RPC transport lacks external-auth semantics → external-call fixture → MEL never treats internal RPC as authenticated public transport.
380. Tool schema truth → generated tool arguments must be validated against the currently discovered schema → remembered schemas drift → mutate-schema fixture → MEL refreshes discovery and surfaces validation failure.
381. Tool discovery readiness → model call must not race MCP connection/tool discovery → asynchronous startup can yield empty toolsets → cold-start fixture → MEL waits for connection readiness where required.
382. Capability advertisement → advertise only elicitation modes actually implemented → claiming unsupported interaction creates dead-end calls → missing-handler fixture → MEL capability claims are handler-backed.
383. Elicitation sensitivity → structured elicitation is for appropriate user input; secrets/payment/auth may require controlled URL/out-of-band flows → generic forms can solicit unsafe sensitive data → sensitive-field fixture → MEL routes consent/auth through supported secure flow.
384. Elicitation consent → opening an external authorization/payment URL requires explicit user action → auto-navigation converts model/tool intent into side effect → declined-consent fixture → MEL remains inert on decline/cancel.
385. Multi-round-trip state → modern MCP may return input-required state that must be echoed on resumed request → treating it as terminal failure breaks valid tools → two-round fixture → MEL preserves opaque request state without interpreting it.
386. Multi-round-trip bounds → cap repeated input-required loops → malformed server can loop forever → never-satisfying server fixture → MEL terminates with diagnostic after bounded rounds.
387. Resume idempotence → resumed tool requests must not replay already committed side effects unless protocol/tool contract guarantees safety → multi-round interaction can duplicate pre-elicitation work → side-effect counter fixture → MEL tools defer irreversible effects or use idempotency keys.
388. Tool result semantics → tool transport success and domain operation success are separate → valid JSON-RPC result may describe failure → domain-error fixture → MEL maps structured outcome before claiming completion.
389. Tool timeout ambiguity → after transport timeout, reconcile observable state before retrying mutating calls → retry-first can duplicate action → late-success fixture → MEL readbacks before mutation retry.
390. Tool provenance → log server identity, tool name/schema version, request correlation and bounded result metadata → full arguments/results can leak secrets → audit-redaction fixture → MEL keeps useful trace without sensitive payload replication.
391. Tool authorization → discovered capability does not imply user authorization for every invocation → model availability and permission are distinct → unauthorized-tool fixture → MEL checks/propagates auth failure without workaround claims.
392. Tool least privilege → expose narrow task-specific tools instead of broad arbitrary execution when possible → narrow tools may be insufficient for legitimate expert workflows → capability-gap fixture → MEL escalates explicitly rather than silently broadening privilege.
393. Tool negative control → ambiguous conversational intent must not trigger mutating tools → high recall tool use can become over-action → “what would happen if” fixture → MEL distinguishes planning from execution.
394. Tool postcondition → completion requires observable effect/persistence readback where feasible → some external systems expose eventual consistency only → bounded reconciliation fixture → MEL reports accepted/pending until evidence matures.
395. Tool compensation → multi-step workflows define recovery for committed earlier steps when later step fails → compensation is not always possible or lossless → injected mid-workflow failure → MEL records irreversible boundary and exact residual state.
396. Tool concurrency → parallelize independent reads, serialize conflicting mutations → maximal parallelism can reorder dependent state → dependency-graph fixture → MEL scheduler encodes resource/write conflicts.
397. Tool cancellation → client cancellation should stop unnecessary downstream work where supported, but must not be represented as rollback → already committed side effects remain → cancel-after-commit fixture → MEL reconciles and reports partial completion.
398. MCP observability → protocol traces should expose discovery/connect/call/input-required/resume/result stages → one generic “tool failed” event blocks diagnosis → fault injected at each stage → MEL diagnostics identify failing layer.
399. Cross-layer RAG/tool gate → when retrieved instructions request a tool action, treat retrieved content as data unless trusted policy explicitly authorizes execution → prompt injection can arrive through indexed documents → malicious-document fixture → MEL never promotes retrieved text to executable authority.
400. Communication composition → final answer must reconcile retrieval evidence, runtime/tool result, current user constraints and uncertainty in that authority order → fluent synthesis can conceal stale memory or pending side effect → mixed-conflict scenario → MEL performs a pre-send consistency check and states only observed completion.

## Deduplication / transfer notes
Cycles 351–375 specialize prior RAG/memory principles into index lifecycle, eventual consistency, deletion/reindex/migration, retrieval-only and end-to-end eval gates. Cycles 376–400 specialize tool/MCP robustness using the current Cloudflare MCP 2026-07-28 migration semantics, multi-round-trip behavior and explicit postcondition/authorization boundaries. Repository search at the start of this run returned no discoverable `MEL_TRANSFER_*_10000.md`; none were ingested. The ROMAN methodological correction from the mission remains a standing transfer rule for future ROMAN packages and is not counted as a fabricated repository transfer.

## Run checkpoint 2026-09-21 — cycles 351–400
- `head_initial`: `db34afc1590c96dd4e74cbc7d9e366029db37cfa`
- pre-write HEAD recheck: unchanged (`db34afc1590c96dd4e74cbc7d9e366029db37cfa`)
- cycles completed this run: 50; additive counter: 400/10000
- transfer packages ingested: none
- code/process/button changes: none; expert-corpus advancement only
- stress tests: none; no runtime/code mutation
- production: untouched
- `remaining_open`: cycles 401–10000; update compact index/checkpoint; periodic transfer ingestion; after completion resume full audit/repair/stress
- `next_exact_fix`: continue 401–450 on security boundaries for agentic tool execution, prompt-injection containment, provenance/privacy and autonomous-job idempotence; then map gates to candidate defects without production mutation.
