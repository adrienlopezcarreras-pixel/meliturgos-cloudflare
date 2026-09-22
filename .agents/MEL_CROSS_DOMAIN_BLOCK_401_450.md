# MEL cross-domain expert — cycles 401–450

Date: 2026-09-22. Status: knowledge hypotheses pending code-linked validation under `.agents/XP_PROTOCOL.md`.

Primary sources (retrieved 2026-09-22): Cloudflare Workers AI RAG tutorial (updated 2026-08-25); Cloudflare Vectorize metadata filtering/reference (current docs, metadata filtering updated 2026-04-21; preview docs 2026-08-27); Cloudflare D1 SQL statements/FTS5 and Worker Binding API (updated 2026-04-21); Cloudflare D1 limits/import-export docs (2026); Cloudflare Workers AI JSON Mode (updated 2026-09-14). Principles below deliberately distinguish documented platform facts from MEL design hypotheses.

Each cycle: problem → principle → limit/counterexample → gate → MEL implication.

401. Semantic-only retrieval misses exact identifiers → combine vector retrieval with lexical/FTS candidate generation → lexical search alone misses paraphrase → exact SHA/name + paraphrase corpus → MEL retrieves both exact and semantic evidence.
402. Retrieval scope leakage → pre-filter by authoritative tenant/user/corpus metadata before topK → post-filter can discard all useful hits after retrieval → mixed-tenant fixture → zero cross-scope evidence reaches prompt.
403. Metadata-index timing → re-upsert vectors created before a new Vectorize metadata index → creating index does not retroactively index old vector metadata → legacy-vector fixture → old and new records obey same filter.
404. Filter truncation → do not encode security identity in long string suffixes because indexed strings filter on first 64 UTF-8 bytes → prefix collisions can alias → adversarial shared-prefix fixture → MEL uses compact immutable IDs.
405. Namespace semantics → namespace is a coarse single partition; metadata carries orthogonal dimensions → one vector cannot belong to multiple namespaces → multi-project memory fixture → MEL models scope without duplicating vectors unnecessarily.
406. Candidate diversity → retrieve more candidates than final context and rerank/dedup → topK too small locks in embedding mistakes → near-duplicate distractor corpus → final evidence covers distinct relevant facts.
407. Source identity → every chunk stores source_id, artifact/file/message ID, timestamp/version and content hash → URL/title alone is mutable → edited-source fixture → MEL can trace exact evidence version.
408. Chunk identity → derive stable chunk IDs from source version + deterministic boundary → random IDs break update/delete reconciliation → re-index unchanged file → no duplicate logical chunks.
409. Chunk boundaries → preserve semantic/structural boundaries and useful overlap → fixed tiny chunks destroy context; giant chunks dilute retrieval → section-crossing question fixture → answer evidence contains needed local context.
410. Parent-child retrieval → embed focused child chunks but expand to bounded parent context for generation → parent expansion can overflow context → pinpoint question in long document → MEL retrieves precision then coherent neighborhood.
411. File bytes versus filename → indexing metadata is not indexing content → unavailable bytes cannot support content claims → attachment-without-bytes fixture → MEL reports content unavailable rather than hallucinating.
412. Extraction provenance → store extractor/version/page/offset with normalized text → parser upgrades can change text → same PDF parsed by two versions → MEL can reproduce which text was embedded.
413. Extraction failure → mark partial/failed extraction explicitly → silently empty text looks like valid no-content file → corrupt/scanned fixture → UI/status exposes extraction state.
414. Multimodal fallback → page/image inspection is a separate evidence path when parsed text is incomplete → OCR/vision can introduce errors → table/image fixture → MEL labels modality and confidence/provenance.
415. Incremental indexing → content hash decides whether embedding work is needed → mtime/name changes alone waste work → rename-only fixture → no re-embedding when bytes unchanged.
416. Deletion propagation → tombstone/remove stale vectors when authoritative source is deleted or access revoked → vector stores otherwise retain ghost memory → delete fixture → retrieval returns no revoked content.
417. Update atomicity → index new version then switch authoritative version/tombstone old with reconciliation → delete-first risks temporary loss; add-first risks duplicate versions → injected failure between steps → MEL resolves to one authoritative version.
418. D1 FTS5 role → use FTS5 for lexical recall where supported → virtual tables complicate export because D1 export does not support virtual tables → backup drill → base content exports and FTS can be rebuilt deterministically.
419. Search backupability → treat derived FTS/vector indexes as rebuildable artifacts, not sole truth → rebuilding may be expensive → restore fixture → canonical text survives independently of indexes.
420. Canonical store → keep source text/metadata in durable canonical storage and vectors as derived acceleration → vector payload is not archival truth → corrupt-index fixture → MEL can rebuild retrieval layer.
421. Query normalization → preserve original query while deriving search variants → destructive rewriting can erase exact terms → acronym/quoted-ID fixture → exact user tokens remain searchable.
422. Multi-query retrieval → generate bounded alternate queries for ambiguous/paraphrased asks → uncontrolled expansion adds noise/cost → ambiguous follow-up fixture → variants improve recall without changing user intent.
423. Ellipsis resolution → resolve follow-ups from active subject + recent authoritative turn before retrieval → old RAG memories can hijack referent → “et ça ?” after topic switch fixture → MEL searches the current referent.
424. Constraint persistence → carry explicit exclusions/constraints as structured retrieval filters/context → summarization can drop negatives → “pas Lapierre” style fixture → excluded entity never returns as recommendation without explicit override.
425. Recency is not universal truth → rank recency strongly for mutable status, weakly for stable facts → newest note can be wrong → corrected-old-vs-new-error fixture → MEL uses domain-sensitive freshness.
426. User message authority → latest explicit user correction outranks older assistant/RAG assertions about user intent → user can also be mistaken about external facts → contradiction fixture → intent updates immediately while factual claims still require evidence.
427. Runtime authority → capability/status claims come from current runtime evidence, not remembered assistant prose → runtime probe can itself fail → stale “deployed” memory fixture → MEL says unknown/failed rather than repeats old success.
428. Provenance-aware ranking → score authority/source type independently from semantic similarity → highly similar low-authority text can mislead → assistant-note vs primary-source fixture → primary/runtime evidence wins factual conflict.
429. Contradiction set → retain conflicting candidates long enough to compare provenance/time/scope → early dedup can hide disagreement → two incompatible status records → MEL surfaces/resolves contradiction explicitly.
430. Negative evidence → absence from topK is not proof of absence → retrieval has recall limits → “never mentioned” fixture → MEL only claims absence after appropriate exhaustive/index-aware check.
431. Temporal queries → filter/rank by event/source time appropriate to question → ingestion time differs from event time → late-imported old record fixture → timeline remains chronologically correct.
432. Bitemporal memory → where useful store observed_at and effective/event time → correction entered today about yesterday needs both → retroactive correction fixture → MEL reconstructs what happened and what was known when.
433. Supersession links → corrections should link superseded records rather than erase history → hard deletion loses audit trail → correction fixture → default retrieval prefers current record while audit can inspect predecessor.
434. Confidence separation → retrieval score is not factual confidence → cosine similarity does not measure truth → confidently similar false note fixture → MEL does not expose vector score as certainty.
435. Evidence budget → allocate context by marginal relevance/diversity/authority, not equal chunk count → one long source can monopolize prompt → multi-source fixture → bounded context contains best nonredundant evidence.
436. Context compression → compress only after selecting evidence and retain source anchors/critical literals → abstractive compression can alter IDs/numbers/negations → SHA/date fixture → literals survive byte-for-byte where required.
437. Compression verification → compare compressed facts against source spans for critical fields → LLM summary can invert meaning → negation fixture → gate rejects changed critical proposition.
438. Prompt role separation → retrieved content is untrusted evidence, not system instruction → stored prompt injection can command agent → malicious document fixture → MEL quotes/uses facts without obeying embedded instructions.
439. RAG injection defense → delimit sources and explicitly prohibit tool/action authority from retrieved text → delimiters alone are imperfect → adversarial source fixture → no tool call is authorized solely by RAG content.
440. Tool authorization → retrieval may inform arguments but current policy/user intent authorizes effects → relevant memory can be stale or malicious → old “send email” record fixture → MEL does not execute historical instruction as current command.
441. Structured extraction → JSON Mode/schema helps machine-readable intermediate decisions → schema-valid output can still be semantically wrong → contradiction fixture → validate fields against evidence after parsing.
442. Citation completeness → each externally checkable answer segment maps to evidence IDs → citations can be decorative/misaligned → shuffled-source fixture → verifier confirms cited span supports claim.
443. Citation granularity → cite smallest sufficient span/source set → overbroad citation hides unsupported clauses → compound claim fixture → split or qualify unsupported part.
444. Retrieval evaluation set → maintain golden questions with expected source IDs and answer constraints → exact answer text is brittle → paraphrase fixture → evaluate recall/grounding separately from wording.
445. Recall@K gate → measure whether required evidence appears in candidates before blaming generation → expected source can have multiple valid equivalents → labeled corpus → retrieval regression is observable.
446. Ranking gate → measure MRR/nDCG or task-specific ordering where graded relevance exists → metric optimization can diverge from end task → distractor corpus → MEL tracks ranking plus grounded-answer success.
447. Grounded answer gate → require answer propositions to be entailed/supported by retrieved authoritative evidence or explicitly marked inference → entailment checker can err → adversarial contradiction set → unsupported status claims fail.
448. Abstention gate → when evidence is missing/contradictory, answer unknown/clarify rather than fabricate → over-abstention harms utility → resolvable ambiguity fixture → MEL asks only targeted clarification when tools cannot resolve it.
449. Retrieval latency → instrument embed, vector/FTS, rerank, canonical fetch and generation separately → aggregate p95 hides bottleneck → injected slow stage → MEL identifies stage-specific p95/p99.
450. End-to-end memory claim → “MEL remembers file X” requires bytes/text available, indexed, retrievable under correct scope, cited, and usable in answer → stored filename or vector count is insufficient → seeded attachment question → PASS only after content-grounded answer with provenance.

## Deduplication
This block specializes prior memory/RAG concepts into falsifiable retrieval, indexing, contradiction, provenance and file-content gates. Generic idempotency lessons from 351–400 were not repeated except where indexing introduces a distinct consistency failure.

## Transfer ingestion
Repository search on 2026-09-22 found no `MEL_TRANSFER_*_10000.md`; none ingested. ROMAN methodological correction remains mandatory when a provenance-bearing transfer appears: medium-specific aesthetic relevance, long scene/desire/obstacle/subtext/sensory/material-social causality, concrete motifs, and anti-fragmentation; `Le Roman des signes` 125-micro-chapter form remains a rejected draft and V2 must restart from life/material/human signs with substantial chapters and computing only accessory.
