# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_100/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — block 001–050
Primary references reviewed for this block: Cloudflare official Workers/D1/Durable Objects/Queues/Workflows documentation; GitHub official artifact-attestation documentation; W3C WCAG 2.2; OWASP GenAI Security Project; existing repository expert corpus and XP protocol. No `MEL_TRANSFER_*_10000.md` package was found in the repository search during this run; therefore none was ingested.

## Cycles 001–050

Each cycle records: precise theme → principle → limit/counterexample → falsifiable gate → concrete MEL implication.

1. Observable postconditions → success means effect observed, not handler/HTTP existence → async effects may be eventually consistent → mutate then reread authoritative state → deep capability tests prove effect and UI/runtime coherence.
2. End-to-end deadlines → propagate total deadline through subcalls → per-call timeout alone can exceed budget → inject slow dependency → MEL jobs terminate boundedly.
3. Retry taxonomy → retry transient/ambiguous failures with bounded backoff → permanent validation/auth fails fast → inject each class → explicit retry classes.
4. Idempotency → mutation retries require stable operation identity → reads need not all use keys → replay request → one durable effect.
5. Queue at-least-once semantics → consumers assume duplicates → timing is not dedupe → redeliver after partial success → persist completion before ack.
6. Dead-letter handling → poison work exits bounded retry path → DLQ does not replace root-cause fix → force permanent failure → actionable failed-job state.
7. Durable state ownership → serialize genuine coordination → avoid centralizing unrelated hot traffic → concurrent conflicting writes → scoped ownership.
8. D1 consistency awareness → distinguish authoritative write from replica read → replica may lag → intended consistency test → status avoids stale false failure.
9. Schema migrations → ordered, restartable, backward-aware → destructive changes need compatibility plan → interrupt/resume → survive partial migration.
10. Workflow resumability → checkpoint externally visible progress → excessive checkpoints add cost → crash/resume → stable long-job boundaries.
11. Abort propagation → cancelled UI intent cancels obsolete work → cannot undo committed effects → supersede request → cleanup stale calls.
12. GET deduplication → coalesce identical in-flight reads → not across auth/consistency contexts → concurrent reads → reduce polling.
13. Visibility-aware polling → hidden views reduce polling → critical monitoring can continue server-side → hide tab/measure → no invisible UI burn.
14. Cache correctness → TTL follows staleness tolerance → never mask safety-critical state → mutate/invalidate → cache static metadata more.
15. Pagination → bounded stable cursors → offsets drift under inserts → mutate between pages → bounded Activity/memory views.
16. DOM virtualization → render visible rows → small lists need not virtualize → 10k-row benchmark → long logs stay responsive.
17. content-visibility → skip off-screen rendering with semantics intact → test focus/a11y → keyboard/render benchmark → progressive optimization only.
18. Event-listener lifecycle → deterministic cleanup → singleton globals can be valid → mount/unmount leak test → long-session stability.
19. Payload budgets → return fields needed by surface → micro-trimming can complicate APIs → bytes/p95 before-after → split heavy diagnostics.
20. Lazy capability panels → load expensive detail on demand → critical status remains immediate → first-load/open-panel tests → preserve discoverability.
21. Accessibility keyboard path → every action operable without pointer → custom widgets need semantics → full traversal gate → audit all controls.
22. Visible focus → focus indication plus logical order → ring alone insufficient → automated/manual order → dense bars accessible.
23. Target sizing → usable pointer targets/context spacing → dense expert UI may use allowed alternatives → mobile tap test.
24. Accessible status → async changes perceivable without chatter → excessive live regions harm UX → screen-reader event test.
25. Error recovery UX → state cause, retained work, next action → generic retry amplifies permanent failure → inject error classes.
26. Supply-chain provenance → attest artifact to source/workflow/SHA → attestation does not prove safety → verify expected repo/SHA.
27. Attestation verification → generated provenance matters only if verified → negative wrong-source test → release gate verifies provenance.
28. Least workflow permissions → minimum token permissions/job → broad write increases blast radius → inspect workflows.
29. Immutable release identity → evidence exact commit/digest → branch moves → preview SHA equals candidate SHA.
30. Canonical branch race check → reread candidate before mutation → preparation can stale → concurrent commit simulation → abort/reconcile.
31. No force-push discipline → preserve shared history → reject non-fast-forward mutation → additive candidate updates.
32. Prompt injection boundary → retrieved/tool content is data, not authority → higher policy remains authoritative → injected document test.
33. Tool-output validation → schema plus semantic invariants → valid payload can be wrong → adversarial valid payload.
34. Least-agent authority → task-scoped tools/data → super-agent raises blast radius → capability-denial tests.
35. Grounded status claims → runtime evidence outranks prior prose → old responses stale → runtime contradiction fixture.
36. Ellipsis resolution → short follow-ups inherit active subject/constraints → ambiguity can require clarification → “c’est bon ?” fixtures.
37. Contradiction precedence → newest explicit user constraint outranks older assumption, below immutable policy → conflicting-turn fixture.
38. Memory provenance → origin/time/scope/confidence → provenance does not prove truth → conflicting-source retrieval.
39. Recent-vs-old memory → recency is signal not absolute truth → stable facts persist → volatility classification.
40. RAG abstention → insufficient evidence yields uncertainty/search → excessive abstention harms utility → answerability evals.
41. Source triangulation → consequential synthesis prefers independent authoritative sources → sometimes one authority exists → conflict test.
42. Citation entailment → source supports adjacent claim → citation presence alone insufficient → claim-source spot checks.
43. Research freshness → window depends on volatility → standards need not refresh hourly → dated fixtures.
44. File integrity → digest persistent artifacts and verify on restore → hash proves integrity not truth → corrupt byte test.
45. Backup restore proof → backup PASS only after isolated restore/validation → upload/probe insufficient → exact SHA restore.
46. Erasure reconstruction threshold → recover at threshold and 1/2/3 missing → shard existence insufficient → decrypt/gunzip/hash exact.
47. Bounded failover → deadline plus alternate target → no infinite cycling → blackhole target test.
48. Stress cleanup → bounded concurrency/teardown/isolation → stress can self-DoS → no orphan resources.
49. Performance evidence → optimize measured p95/p99/bytes/CPU/DOM → averages hide tails → baseline/same workload.
50. Anti-loop learning → after two identical failures change strategy/isolate → blind retries add noise → repeated-failure fixture.

## Provenance — block 051–100
Primary/recent references reviewed: W3C EPUB 3.3 Recommendation update (2025) and EPUB 3.4/Accessibility 1.2 Candidate Recommendation snapshot announcement (2026-07-21); Google Search Central official Product/ProductGroup, merchant-listing and Breadcrumb structured-data guidance; MDN Web Audio API/AudioWorklet documentation; Godot official documentation search for current performance guidance. Repository search again found no `MEL_TRANSFER_*_10000.md`; none ingested. Principles below remain transferable knowledge until applied and proved.

## Cycles 051–100
51. Frame-time budgets → optimize worst-frame spikes, not only average FPS → offline/noninteractive tools differ → capture frame-time distribution → game/UI agents report p95/p99.
52. Profiling before optimization → measure CPU/GPU/script/render bottleneck first → profiler overhead can distort tiny workloads → reproduce fixed scene → MEL game workflow stores baseline evidence.
53. Object pooling → reuse high-churn objects when allocation/GC is measured bottleneck → pooling can increase complexity/memory → projectile stress test → recommend only after allocation evidence.
54. Fixed-step simulation → physics/state updates use deterministic step assumptions → render interpolation remains variable → replay same input → game QA separates simulation from render cadence.
55. Deterministic replay → record seed/input/version for reproducible bugs → floating-point/platform differences can remain → replay hash checkpoints → game incidents become reproducible artifacts.
56. Asset budgets → texture/audio/model budgets are platform-specific → quality targets vary → build-size/VRAM/runtime gate → production generator records target platform.
57. Level-of-detail → reduce distant visual cost without semantic loss → stylized scenes may need custom thresholds → camera sweep benchmark → game optimization preserves art intent.
58. Occlusion/culling → avoid rendering invisible work → bad bounds can hide visible content → adversarial camera test → generated scenes validate culling correctness.
59. Audio voice limits → bound simultaneous voices and prioritize perceptually important sounds → hard cuts can sound worse → dense-scene audio test → soundtrack/SFX runtime has voice policy.
60. Audio loudness consistency → master against delivery context, not arbitrary peak normalization → platform specs differ → loudness/true-peak QC → music export stores measured metadata.
61. AudioWorklet isolation → custom low-latency processing belongs off main thread where supported → secure context required and worklet thread still has realtime constraints → underrun/load test → MEL web audio avoids main-thread DSP.
62. Realtime audio discipline → no blocking/unbounded allocation in render callback → some engines abstract this safely → synthetic CPU pressure test → audio modules expose underrun counters.
63. Sample-rate awareness → conversions can alter latency/quality → source and output rates vary → multi-rate render comparison → audio pipeline records rate explicitly.
64. Metadata provenance → title/artist/version/license/source travel with audio asset → metadata can be stale → compare manifest to source artifact → generated soundtrack stays attributable.
65. License scope → distinguish composition, master, sample and distribution rights → “royalty-free” is not universally unrestricted → rights checklist gate → MEL never infers permission from availability.
66. EPUB semantic structure → publication uses structured HTML/CSS/SVG resources, not page screenshots → fixed-layout exceptions exist → validator plus reading-system test → editorial exports preserve semantics.
67. EPUB accessibility metadata → discoverability requires truthful accessibility metadata → metadata cannot compensate inaccessible content → compare claims with content checks → publication QA rejects unsupported claims.
68. EPUB version strategy → 3.3 is Recommendation while 3.4 is candidate-stage in 2026 → newest draft is not automatically safest production target → compatibility matrix → MEL labels standards maturity.
69. Reflow-first publishing → reflow improves reader adaptation → comics/fixed art may require fixed layout → font-size/orientation tests → choose format by content semantics.
70. Typography hierarchy → hierarchy uses consistent scale/spacing/roles → decorative variation can be intentional → blind page-role comparison → magazine generator separates tokens from local exceptions.
71. Baseline-grid discipline → align recurring text rhythm where it improves coherence → images/callouts may intentionally break grid → spread overlay QA → editorial automation flags accidental drift only.
72. Widows/orphans control → avoid stranded lines when possible → aggressive prevention can create worse whitespace → pagination stress corpus → PDF QA balances defects.
73. Image effective resolution → judge placed-size resolution, not source pixel count alone → vector art differs → preflight at final geometry → export warns low effective DPI.
74. Color-space intent → print and screen outputs need explicit color management → conversion depends on printer/profile → preflight profile presence → MEL never silently assumes press profile.
75. Bleed/safe area → trim-dependent print work needs bleed and protected critical content → digital-only output does not → geometry preflight → magazine pipeline distinguishes print/digital targets.
76. Font embedding/licensing → output must embed/subset as allowed and preserve glyph coverage → licenses can forbid embedding → preflight fonts/rights → no accidental substitution.
77. PDF preflight → visual inspection alone misses boxes/fonts/transparency → standards profile depends on printer → automated checks plus rendered spot checks → publication gate has machine and human evidence.
78. Sequential-art readability → panel order must remain unambiguous across page/spread → experimental layouts can break convention intentionally → cold-reader order test → BD storyboard stores intended traversal.
79. Balloon ownership → tail/placement makes speaker identity clear → off-panel voices need explicit convention → dialogue-only page test → lettering QA detects ambiguous attribution.
80. Lettering safe zones → text survives trim and avoids focal art → deliberate overlaps can be stylistic → trim simulation → BD export validates critical text bounds.
81. Color script continuity → palette progression supports narrative/emotional beats → accessibility and print gamut constrain choices → grayscale/color-vision/print preview → color decisions have functional checks.
82. Scene objective → prose scenes earn place through character goal/conflict/change → atmospheric scenes can serve world/voice → scene-removal test → novel revision labels scene function.
83. Causal plot chain → major beats should arise from prior choices/events → coincidence can initiate but repeated rescue weakens agency → because/therefore outline audit → MEL flags “and then” chains.
84. Character knowledge state → dialogue/action only use information plausibly acquired → intentional dramatic irony differs → per-scene knowledge ledger → continuity QA catches leaks.
85. Dialogue subtext → characters need not state full intent → exposition may sometimes require clarity → read-aloud/intent comparison → revision checks voice plus information load.
86. Viewpoint contract → control what narrator can perceive/know → omniscient narration is valid if established → paragraph-level POV audit → MEL distinguishes chosen mode from accidental head-hopping.
87. Worldbuilding cost → introduce detail when it changes choice, image or understanding → encyclopedia passages can be intentional appendix material → remove-detail comprehension test → prose keeps worldbuilding functional.
88. Revision passes → separate structural, scene, line and proof passes → tiny works may combine passes → defect-category tracking → MEL avoids polishing doomed structure first.
89. Product structured data truthfulness → markup mirrors visible/current product facts → markup cannot invent availability/reviews → page-vs-JSON-LD comparison → e-commerce automation validates parity.
90. Product variants → use parent/variant relationships where variants genuinely share product identity → unrelated products must not be grouped → variant navigation/schema test → catalogue model keeps stable group IDs.
91. Merchant listing completeness → price/availability/shipping/returns improve machine understanding when accurate → eligibility does not guarantee display → rich-result validation → SEO reports eligibility not promised ranking.
92. Breadcrumb semantics → hierarchy aids users/search understanding → breadcrumb is not substitute for navigation architecture → crawl/navigation test → catalogue pages expose coherent hierarchy.
93. SEO crawlability → important pages must be accessible, indexable and internally linked → some account/private pages should remain excluded → crawler fixture → MEL distinguishes discovery from privacy.
94. Canonicalization → canonical hints consolidate true duplicates → wrong canonicals can erase intended pages → variant/parameter matrix → store canonical decisions as testable rules.
95. Conversion measurement → CRO changes require predefined metric and guardrails → short tests can be noisy → event-integrity + sample-size review → MEL reports uncertainty, not fake wins.
96. Newsletter consent provenance → recipient permission/source/time must be retained → legitimate-interest contexts vary by jurisdiction → suppression/consent audit → outreach system never equates scraped address with consent.
97. Deliverability hygiene → authenticate domain, control complaints/bounces and list quality → authentication alone does not ensure inboxing → seed/telemetry checks → prospecting tracks reputation signals.
98. Archival original preservation → keep immutable original plus derived working copies → redaction may be required for sharing → digest/provenance test → autobiography methods preserve source integrity without ingesting unnecessary private content.
99. Chronology confidence → dates carry source and certainty ranges → memory alone may be approximate → conflicting-date reconciliation → autobiography engine separates known/inferred/unknown.
100. Incident evidence bundle → preserve timeline, version, inputs, logs, impact and recovery proof → logs may contain secrets/PII and require minimization → tabletop incident reconstruction → MEL incident reports are reproducible and privacy-aware.

## Deduplication notes
Cycles 51–100 broaden the corpus into game/runtime performance, audio, publishing, narrative/BD, e-commerce/SEO, deliverability and archival method. Similar engineering principles from 1–50 are not recounted as new expertise; these entries add domain-specific limits and falsifiable gates. No item is promoted to implementation XP without code/application proof.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable in the repository at this checkpoint. Recheck periodically; ingest only generalized methods with provenance, scope and limits, never raw private autobiographical material.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_101/10000`; prioritize browser/computer use, hardware/protocols, frontend/mobile performance, research/fact-checking, WordPress/e-commerce operations, social/CRM, backup/recovery and then code-linked audits. Before every write, reread candidate HEAD and abort/reconcile if moved.