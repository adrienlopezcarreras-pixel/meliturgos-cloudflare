# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_50/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — block 001–050
Primary references reviewed for this block: Cloudflare official Workers/D1/Durable Objects/Queues/Workflows documentation; GitHub official artifact-attestation documentation; W3C WCAG 2.2; OWASP GenAI Security Project; existing repository expert corpus and XP protocol. No `MEL_TRANSFER_*_10000.md` package was found in the repository search during this run; therefore none was ingested.

## Cycles 001–050

Each cycle records: precise theme → principle → limit/counterexample → falsifiable gate → concrete MEL implication.

1. **Observable postconditions** → success means effect observed, not handler/HTTP existence → async effects may be eventually consistent → mutate then reread authoritative state → every deep capability test must prove effect and UI/runtime coherence.
2. **End-to-end deadlines** → propagate a total deadline through subcalls → per-call timeout alone can still exceed total budget → inject slow dependency and assert bounded termination → MEL jobs must never wait forever.
3. **Retry taxonomy** → retry only transient/ambiguous failures with bounded backoff → permanent validation/auth errors must fail fast → inject each failure class → ShardVault and tools need explicit retry classes.
4. **Idempotency** → mutation retries require stable operation identity → not every read needs an idempotency key → replay identical request and assert one durable effect → autonomy jobs must tolerate duplicate delivery.
5. **Queue at-least-once semantics** → consumers assume duplicates → dedupe cannot rely on timing alone → redeliver after partial success → persist completion identity before acknowledging.
6. **Dead-letter handling** → poison work exits bounded retry path with diagnosable state → DLQ is not a substitute for fixing root cause → force permanent failure → expose actionable failed-job state.
7. **Durable state ownership** → serialize coordination where one logical owner is needed → do not centralize unrelated hot traffic → concurrent conflicting writes test → use Durable Object-style ownership only for genuine coordination domains.
8. **D1 consistency awareness** → distinguish authoritative write confirmation from replica reads → immediate replicated read may lag → write/read test with intended consistency path → MEL status must not claim failure from stale replica data.
9. **Schema migrations** → migrations are ordered, restartable and backward-aware → destructive changes require explicit compatibility plan → interrupt migration and resume → autonomy must survive partial migration.
10. **Workflow resumability** → durable workflows checkpoint externally visible progress → checkpointing every trivial computation adds cost/complexity → crash between steps and resume → long MEL jobs need stable step boundaries.
11. **Abort propagation** → cancelled UI intent cancels obsolete fetch/work → cancellation cannot roll back already committed effects → supersede request and assert cleanup → use AbortController-like cancellation for stale UI calls.
12. **GET deduplication** → coalesce identical in-flight reads → do not coalesce requests with distinct auth/consistency context → fire concurrent identical reads → reduce redundant MEL polling.
13. **Visibility-aware polling** → background/hidden views reduce or stop polling → critical safety monitoring may need server-side continuation → hide tab and measure requests → UI must not burn work invisibly.
14. **Cache correctness** → TTL derives from staleness tolerance and invalidation model → cache must not mask safety-critical state → mutate then invalidate/revalidate → cache static/capability metadata more aggressively than live job state.
15. **Pagination** → bounded pages with stable cursor semantics → offset pagination can drift under concurrent inserts → mutate dataset between pages → large Activity/memory views must not fetch everything.
16. **DOM virtualization** → render only visible large-list rows → small lists do not justify complexity → 10k-row interaction benchmark → virtualize long logs/conversations without losing data.
17. **content-visibility** → skip off-screen rendering where semantics remain intact → accessibility/focus behavior must be tested → keyboard navigation + rendering benchmark → use as progressive optimization, never as hidden-capability removal.
18. **Event-listener lifecycle** → one owner, deterministic cleanup → global listeners are acceptable when intentionally singleton → repeated mount/unmount leak test → prevent MEL interface slowdown over long sessions.
19. **Payload budgets** → return only fields needed by current surface → premature micro-trimming can complicate APIs → measure bytes/p95 before/after → split heavy diagnostics from routine status.
20. **Lazy capability panels** → load expensive data on demand while preserving discoverability → lazy loading must not delay critical status → first-load and open-panel tests → keep every MEL capability but defer heavy detail.
21. **Accessibility keyboard path** → every actionable control must be operable without pointer → custom widgets need explicit semantics/focus management → full keyboard traversal gate → audit every MEL button/menu/tab.
22. **Visible focus** → focus indication must survive custom styling → focus ring alone does not establish logical order → automated + manual focus-order test → prevent inaccessible dense control bars.
23. **Target sizing** → controls need usable pointer targets per WCAG context → dense expert UIs may use spacing/alternatives where allowed → mobile tap test → MEL mobile controls must remain reliably tappable.
24. **Accessible status** → asynchronous changes need perceivable status without disruptive announcements → excessive live-region chatter harms usability → screen-reader event test → job progress/errors require restrained semantic announcements.
25. **Error recovery UX** → errors state cause, retained work and next action → generic retry can amplify permanent failures → inject timeout/auth/validation errors → MEL must distinguish retryable from user-action-required states.
26. **Supply-chain provenance** → attest release artifacts to source/workflow/SHA → attestation does not prove code is safe → verify attestation against expected repo/SHA → candidate/release evidence should bind artifact to exact commit.
27. **Attestation verification** → provenance has value only when consumers verify it → generating attestations alone is insufficient → negative verification with wrong source → Launch Gate should verify, not merely generate, provenance when artifacts are released.
28. **Least workflow permissions** → CI tokens get minimum permissions per job → broad write permissions ease setup but increase blast radius → inspect workflow permissions → candidate tests should not gain release powers.
29. **Immutable release identity** → evidence references exact commit/artifact digest → branch names move → compare preview artifact SHA with candidate SHA → never call a branch-name deployment proof sufficient.
30. **Canonical branch race check** → reread candidate immediately before mutation → long preparation makes initial HEAD stale → simulate concurrent commit → abort/reconcile rather than overwrite.
31. **No force-push discipline** → preserve shared history and concurrent work → emergency rewrite is outside this track and requires explicit governance → reject non-fast-forward mutation → candidate updates remain additive/reconciled.
32. **Prompt injection boundary** → retrieved/tool content is data, not authority → trusted system/developer policy remains higher priority → inject instructions inside retrieved document → RAG must preserve role/provenance.
33. **Tool-output validation** → validate structure and semantic invariants before action → schema-valid output can still be unsafe/wrong → adversarial valid payload → MEL tool chaining needs semantic checks.
34. **Least-agent authority** → agents receive only tools/data needed for task → a universal super-agent increases blast radius → capability-denial tests → route specialized work with scoped authority.
35. **Grounded status claims** → operational status comes from runtime evidence, not prior assistant prose → old responses can be stale → contradict prior claim with runtime state → communication layer prioritizes current evidence.
36. **Ellipsis resolution** → short follow-ups inherit active subject and constraints unless explicitly changed → topic ambiguity may require clarification → conversation tests like “c’est bon ?” after active job → preserve active work context.
37. **Contradiction precedence** → newest explicit user constraint outranks older conversational assumption → immutable safety/system constraints still dominate → conflicting-turn fixture → MEL memory resolver records source/time/priority.
38. **Memory provenance** → memories carry origin, timestamp, scope and confidence → provenance does not make a claim true → conflicting-source retrieval test → RAG rendering must expose enough provenance for arbitration.
39. **Recent-vs-old memory** → recency is a signal, not absolute truth → durable facts may remain valid for years → stale-status vs stable-preference fixtures → classify memory by volatility.
40. **RAG abstention** → insufficient evidence yields uncertainty/search, not fabrication → excessive abstention reduces utility → answerability eval set → MEL distinguishes `knowledge_artifact` from verified knowledge.
41. **Source triangulation** → consequential factual synthesis prefers independent primary/reputable sources → some facts have only one authoritative source → conflict test → research workflow records agreement/disagreement rather than majority vote.
42. **Citation entailment** → cited source must actually support adjacent claim → citation presence alone is not grounding → claim-source entailment spot checks → knowledge artifacts keep claim-level traceability.
43. **Research freshness** → freshness window depends on volatility → timeless standards need not be re-searched hourly → dated fact fixtures → MEL chooses source age by domain risk.
44. **File integrity** → persistent artifacts record cryptographic digest and verify on read/restore → hash proves integrity, not truth → corrupt one byte → reject/quarantine corrupted knowledge artifact.
45. **Backup restore proof** → backup is PASS only after successful restore and validation → upload/probe alone is insufficient → restore into isolated target → ShardVault gate must reconstruct exact Git SHA.
46. **Erasure reconstruction threshold** → test recovery at threshold and with 1/2/3 missing fragments → synthetic shard existence is not reconstruction proof → remove fragments then rebuild/decrypt/gunzip/hash → ShardVault remains red until exact code recovery succeeds.
47. **Bounded failover** → slow/failed storage target triggers deadline + alternate target → infinite target cycling is forbidden → blackhole one target → prove bounded completion/failure.
48. **Stress cleanup** → load tests have bounded concurrency, teardown and isolated preview targets → stress without limits becomes self-DoS → assert no orphan jobs/resources → all MEL stress suites must clean up.
49. **Performance evidence** → optimize measured p95/p99, bytes, CPU/DOM work, not intuition → averages hide tails → baseline then same workload after patch → no capability removal merely to improve speed.
50. **Anti-loop learning** → after two identical failures without new evidence, change strategy/isolate component → blind retries create noise → scripted repeated-failure fixture → audit engine records attempted strategy and next distinct experiment.

## Deduplication notes
These cycles intentionally extend the existing 2000-cycle engineering corpus by emphasizing cross-domain operational implications. Where an existing principle already existed (for example postconditions, deadlines, retries), this block adds a concrete cross-domain MEL application rather than claiming a new validated XP. No entry from this block is automatically copied into `development-experience-pack.js`.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_51/10000`, widening into frontend/mobile performance, browser/computer use, hardware/protocols, game development, editorial production, narrative/BD/audio, e-commerce/SEO, archival provenance and incident recovery. Before any future write: reread candidate HEAD and reconcile if changed.