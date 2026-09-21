# MEL Cross-domain Expert PLUS — cycles 501–550

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_550/10000`

Provenance: additive block prepared from candidate HEAD `e4478f55903e7e06df5286b716965f5ed9a66afb`; pre-write HEAD rechecked unchanged. No production action authorized. No private autobiographical material included. Format: problem → principle/limit → pattern/anti-pattern → falsifiable gate → MEL implication.

## Primary/recent sources reviewed 2026-09-22
- Cloudflare R2 Upload objects, updated 2026-07-29: https://developers.cloudflare.com/r2/objects/upload-objects/
- Cloudflare R2 Workers API reference: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Cloudflare R2 error codes, current 2026-09: https://developers.cloudflare.com/r2/api/error-codes/
- Cloudflare R2 lifecycle API: https://developers.cloudflare.com/api/resources/r2/
- Cloudflare Workers Cache API, updated 2026-08-14: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Cloudflare Workers cache configuration / Range behavior: https://developers.cloudflare.com/workers/cache/configuration/ and https://developers.cloudflare.com/cache/reference/range-requests/
- Cloudflare Workers Request cache controls: https://developers.cloudflare.com/workers/runtime-apis/request/
- Cloudflare Workers/Cache Rules interaction: https://developers.cloudflare.com/cache/interaction-cloudflare-products/workers-cache-rules/

501. R2 upload strategy → choose single PUT for small/medium objects and multipart when size, parallelism or resumability warrants it → multipart adds state and cleanup complexity → threshold fixture across sizes/failures → MEL selects upload mode by evidence, not habit.
502. Single PUT restart → a failed single upload must restart whole object → pretending it is resumable can mark partial work complete → injected mid-stream failure → MEL never exposes resume semantics for non-resumable PUT.
503. Multipart resumability → retry only failed/missing parts while preserving upload identity → restarting all parts wastes bandwidth and can create competing uploads → fail-one-part fixture → MEL persists uploadId and completed-part ledger.
504. Multipart size invariant → all non-final parts must be uniform and within platform bounds → arbitrary chunking can make completion fail → malformed-size fixture → MEL validates part plan before network work.
505. Multipart part ceiling → keep part count ≤10,000 and derive safe part size from total size → tiny fixed chunks can exceed ceiling → max-size planning fixture → MEL computes bounded part geometry.
506. Multipart object ceiling → reject/route objects beyond supported maximum before upload → late rejection wastes work → oversized fixture → MEL performs capability preflight.
507. Multipart ETag semantics → completed multipart ETag is not ordinary whole-object MD5 → treating it as content hash creates false integrity claims → known multipart fixture → MEL stores explicit cryptographic digest separately.
508. Part ETag ledger → completion must use exact partNumber/ETag returned by successful uploads → recomputed/guessed metadata is not authoritative → swapped-ETag fixture → MEL persists provider acknowledgements.
509. Underlying upload race → an R2MultipartUpload handle does not prove active upload still exists → parallel abort/complete can invalidate it → race fixture → MEL handles NoSuchUpload as state reconciliation, not generic retry.
510. Completion observation → successful multipart complete means resulting object becomes globally readable, but MEL still verifies expected metadata/content evidence → API success alone is insufficient for application integrity → complete/head/get fixture → MEL reads back before declaring durable backup complete.
511. Abort cleanup → explicit abort releases abandoned multipart state earlier than default lifecycle → relying only on lifecycle leaves residue for days → cancellation fixture → Stop/cleanup attempts bounded abort and records result.
512. Lifecycle fallback → configure/verify abort-multipart lifecycle as safety net → lifecycle is not immediate transactional cleanup → orphan fixture → MEL distinguishes explicit cleanup from eventual garbage collection.
513. Upload expiry → default incomplete uploads can disappear after seven days → a stale resume token is not permanent state → aged-upload fixture → MEL detects expiry and starts a new generation safely.
514. R2 transient 5xx → retry internal/service-unavailable failures with bounded backoff → deterministic request errors should not retry → injected 503 fixture → MEL classifies provider failures.
515. R2 429 same-key contention → multiple concurrent writes to one key can hit write-rate limits → adding concurrency worsens hot-key failure → same-key stress fixture → MEL serializes/coalesces hot-key writes.
516. Stable object identity → separate logical artifact identity from mutable storage key generation → overwriting one key obscures provenance → two-version fixture → MEL can retain immutable evidence and a current pointer.
517. Conditional put → use preconditions when update must not overwrite unseen concurrent state → unconditional last writer wins can destroy newer manifest → competing writer fixture → MEL uses onlyIf/CAS where correctness requires.
518. Conditional get/head → validators can avoid retransferring unchanged object but do not replace integrity verification when bytes matter → 304 only proves validator match → unchanged/changed fixture → MEL distinguishes cache validation from cryptographic proof.
519. Explicit checksum → provide/store supported cryptographic checksum for integrity-critical single-object writes → provider ETag semantics vary by upload path → bit-flip fixture → MEL verifies independent digest.
520. Metadata integrity → bind expected SHA, codec, encryption/version and source commit into authenticated manifest rather than trusting filenames → names are mutable/untrusted → tampered-metadata fixture → ShardVault reconstruction verifies manifest before use.
521. Content-addressed artifact → immutable artifacts can use digest-derived identity to prevent accidental aliasing → mutable pointers still need CAS → duplicate-content fixture → MEL deduplicates bytes without conflating mutable state.
522. Two-phase manifest publish → upload/verify all referenced shards before publishing manifest/current pointer → publishing first exposes incomplete generation → crash-before-last-shard fixture → readers see old complete or new complete set.
523. Generation fencing → every backup/reconstruction run carries generation ID → stale worker must not publish over newer run → delayed-old-worker fixture → MEL fences final pointer updates.
524. Delete caution → deletion is an irreversible side effect relative to application history → cleanup must prove object belongs to obsolete generation → adversarial prefix fixture → MEL never broad-deletes from guessed prefix.
525. Recovery inventory → reconstruction begins from independently listed/readable shards and manifest, not intended write log → planned upload is not evidence → missing-object fixture → MEL computes actual available set.
526. Range reads → use byte ranges for bounded verification/recovery only when representation semantics permit → range success cannot prove full object → corrupt-middle fixture → MEL uses full digest for final integrity.
527. Compression boundary → verify gzip/codec validity after reconstruction/decryption at the correct layer → hashing compressed bytes alone cannot prove decodability → truncated-gzip fixture → MEL checks both digest and parser/codec success.
528. Encryption boundary → authenticate ciphertext/metadata before accepting decrypted payload → successful decryption without authenticated context can be misleading depending on scheme → tamper fixture → MEL requires AEAD/MAC evidence as designed.
529. Reed-Solomon threshold → reconstruction claim requires actual 4-of-7 decoding under missing-fragment matrix → merely storing seven fragments is not redundancy proof → systematic 1/2/3 missing fixtures → ShardVault gates on decoded exact SHA.
530. Independent target proof → seven configured destinations are not seven proven writes → same backend alias can masquerade as diversity → endpoint/account identity fixture → MEL records target provenance and readback separately.
531. External readback → each ShardVault target must be read through its external path, not local staging cache → local success hides remote failure → disable-local-copy fixture → MEL evidence identifies remote source.
532. Unknown write outcome → timeout after R2/external PUT requires head/get/postcondition before retry → blind retry can race/overwrite → late-success fixture → MEL reconciles first.
533. Idempotent retry key → retries reuse semantic generation/object key where operation is meant to converge → random retry keys leak duplicate artifacts → timeout fixture → MEL separates attempt ID from artifact ID.
534. Cache API locality → Workers Cache API entries are local to the handling data center and do not replicate globally → one-region hit is not global cache proof → cross-region fixture → MEL never uses Cache API as global source of truth.
535. Cache vs Worker caching → programmatic Cache API and caching in front of Worker are distinct mechanisms → conflating them makes invalid invalidation/perf assumptions → route fixture → MEL documents which layer is measured.
536. Cache miss semantics → cache.match returns undefined on miss/expiry and does not fetch origin → assuming implicit origin fetch creates blank paths → cold-cache fixture → MEL has explicit fallback fetch.
537. Cache write evidence → cache.put resolving does not mean globally replicated durable persistence → cache is optimization, not durable state → eviction/other-region fixture → MEL never gates completion on cache presence alone.
538. Cache conditional validators → ETag/Last-Modified enable conditional match semantics → stale validator generation can still be application-wrong → version-bump fixture → MEL keys/validators include representation generation.
539. Cache Range → Cache API can satisfy Range from a cached response with Content-Length → partial response is not suitable as canonical cached full body via cache.put → 206 fixture → MEL stores full representation and lets cache slice where supported.
540. Worker Range caching → for Workers Caching, return cacheable full 200 and allow platform range slicing when applicable → self-returned 206 is not stored → cold/warm range fixture → MEL avoids custom partial caching unless required.
541. Cache key completeness → all response-varying authorization/user/query dimensions must be represented or excluded from shared caching → incomplete key leaks/cross-pollinates data → two-user fixture → MEL forbids shared cache for private state without safe keying.
542. Vary discipline → use Vary only for genuine representation dimensions; Vary:* cannot be put in Cache API → over-vary destroys hit rate, under-vary corrupts responses → negotiation fixture → MEL audits key cardinality and correctness.
543. Set-Cookie cache guard → responses carrying Set-Cookie are not normally cached by Cache API → stripping cookie merely to force caching can alter security semantics → auth fixture → MEL separates public cacheable payload from session mutation.
544. TTL by semantics → freshness-sensitive status gets short/no cache; immutable SHA-addressed artifacts can cache long → one TTL policy is wrong → mutate-status/immutable-artifact fixture → MEL assigns cache policy by truth volatility.
545. Negative caching → short bounded caching of safe misses can reduce load, but stale negative result can hide newly created state → create-after-404 fixture → MEL uses conservative TTL/invalidation for negative results.
546. Error caching → transient 5xx must not become sticky user-visible truth → cache rules can vary TTL by status → injected outage fixture → MEL explicitly prevents or minimizes transient error caching.
547. Compatibility-date semantics → Cache API/Cache Rules precedence can depend on compatibility flags/date → code reading alone may mispredict runtime → config matrix fixture → MEL includes compatibility config in cache evidence.
548. Cache purge scope → cache.delete affects only local data center; global purge needs appropriate mechanism → local delete is not global invalidation → cross-region stale fixture → MEL labels purge scope accurately.
549. Cache observability → record hit/miss/revalidation plus backend call count and latency without exposing sensitive keys → hit ratio alone can hide stale correctness → freshness fault fixture → MEL performance audit couples cache metrics with correctness gates.
550. Storage/cache completion gate → durable completion requires authoritative object generation, conditional concurrency safety where needed, cryptographic/format readback and correct cache semantics; cache hit/HTTP 200/ETag alone are insufficient → fault-injected upload/cache/recovery fixture → MEL claims backup/recovery complete only after end-to-end exact-SHA evidence.

## Deduplication / transfer notes
501–533 specialize prior generic storage/idempotency lessons into R2 single-vs-multipart mechanics, part invariants, expiry, conditional writes, checksums, generation fencing and ShardVault evidence. 534–550 specialize UI/performance caching lessons into Cloudflare Cache locality, Range/conditional behavior, cache-key/privacy correctness, compatibility semantics and purge scope. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. Standing ROMAN correction remains active: narrative/aesthetic relevance outranks technical density; substantial scenes, desire, obstacle, subtext, sensory/material/social causality and anti-fragmentation remain required when ROMAN transfer is encountered.

## Run checkpoint 2026-09-22 — cycles 501–550
- `head_initial`: `e4478f55903e7e06df5286b716965f5ed9a66afb`
- pre-write HEAD recheck: unchanged (`e4478f55903e7e06df5286b716965f5ed9a66afb`)
- cycles completed: 50; additive counter: 550/10000
- transfer packages ingested: none found
- code/process/button changes: none; expert-corpus advancement only
- stress tests: none; no runtime/code mutation
- production: untouched
- `remaining_open`: cycles 551–10000; periodic transfer ingestion; after completion full audit/repair/stress
- `next_exact_fix`: cycles 551–600 on API contracts/auth/idempotency, streaming/backpressure and security/recovery boundaries; then map learned gates to candidate defects without production mutation.
