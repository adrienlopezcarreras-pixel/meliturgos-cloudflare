# MEL Cross-domain Expert — cycles 251–300

Prepared 2026-09-21 from candidate HEAD `d2b841afe2ceba0b07fa5dadd9d26cf6805f2715`. Knowledge hypotheses only; not validated implementation XP. Primary sources: Cloudflare R2 Workers API reference/usage/multipart docs (reviewed 2026-09-21; docs updated 2026-07-31), Cloudflare Workflows overview/get-started/observability and 2026-06-05 saga rollback changelog. No `MEL_TRANSFER_*_10000.md` package was discoverable in repository search. Each item is theme → principle → limit/counterexample → falsifiable gate → MEL implication.

251. R2 conditional write → use `onlyIf`/ETag preconditions for compare-and-set object replacement → ETag is object-version evidence, not business authorization → stale writer fixture → MEL prevents silent lost object updates.
252. R2 failed PUT precondition → treat null result as rejected mutation, not success → HTTP wrapper must map outcome explicitly → stale ETag PUT → MEL status reflects no effect.
253. R2 conditional GET → distinguish missing object from failed precondition/body omission → both can look bodyless if flattened → If-None-Match fixture → MEL preserves protocol semantics.
254. R2 HTTP ETag → emit `httpEtag` for conforming quoted header form → raw etag is not necessarily header-ready → round-trip conditional request → MEL caches safely.
255. R2 checksum on PUT → provide SHA-256 when integrity matters → checksum validates transport/content, not provenance → corrupt-body fixture → ShardVault records integrity independently of origin.
256. R2 checksum algorithm → only one hashing algorithm is supplied per PUT → stacking fields is unsupported → invalid multi-hash fixture → MEL selects canonical integrity field.
257. R2 stored checksum → reread checksum metadata after write where evidence matters → successful PUT alone is weaker proof → write/read/compare fixture → ShardVault write proof includes observation.
258. R2 ranged read → validate returned range and byte count → request may exceed object and return fewer bytes → tail-range fixture → MEL reconstruction never assumes requested length equals received.
259. R2 suffix range → use suffix semantics intentionally for tails → offset/length and suffix are different contracts → boundary fixture → MEL log-tail reads avoid full object transfer.
260. R2 range integrity → partial-range checksum cannot be inferred from whole-object digest → whole-object checksum proves different bytes → bit-flip range fixture → MEL labels digest scope.
261. R2 streaming → stream large bodies instead of cloning/buffering repeatedly → Workers memory is finite → large-object fixture → MEL file paths avoid hidden memory spikes.
262. Request body single-consumption → clone only when truly needed and budget memory → body can be consumed once → parser+upload fixture → MEL upload handler has one ownership path.
263. R2 list pagination → continue only while truncated/cursor present → first page is not complete inventory → >page-size fixture → backup audit cannot claim completeness early.
264. R2 list cursor → cursor is enumeration continuation, not snapshot/version token → concurrent mutation can alter listing semantics → mutate-during-list fixture → MEL avoids false snapshot claims.
265. R2 metadata → separate HTTP metadata from custom business metadata → conflation complicates caching/content semantics → metadata round-trip fixture → MEL stores provenance fields explicitly.
266. R2 object version → retain version when exact uploaded instance matters → key alone is mutable identity → overwrite fixture → MEL evidence names key+version/digest.
267. R2 multipart state → persist uploadId, part number and part ETags → client memory alone is crash-fragile → restart-before-complete fixture → MEL resumable uploads survive interruption.
268. Multipart completion → complete only with observed uploaded-part ETags → guessed/stale part list is unsafe → swapped-part fixture → MEL verifies assembled object.
269. Multipart abort → abandoned uploads require bounded cleanup policy → failed client can leak unfinished state → forced interruption fixture → MEL cleanup is observable.
270. Multipart auth → upload API needs authentication/validation beyond storage mechanics → working upload route is not safe by itself → unauthorized part fixture → MEL separates capability from authorization.
271. R2 API surface choice → Workers API for in-Worker access; S3-compatible API for SDK interoperability; REST for management → no surface is universally best → workload matrix → MEL chooses surface by boundary.
272. R2 high-throughput path → avoid management REST for object hot path → REST rate limits differ → load fixture → MEL storage traffic uses intended data plane.
273. Cache API scope → cache behavior depends on supported route/custom-domain context → preview/workers.dev may not exercise cache → environment fixture → MEL never transfers cache PASS across environments.
274. Cache authority → cache is optimization, R2/durable state remains authority → stale cache can contradict write → mutate-then-read fixture → MEL invalidates/bypasses for freshness-critical status.
275. Object deletion proof → DELETE request success is not enough when recovery semantics matter → eventual wrapper/state bugs can lie → delete+reread fixture → MEL verifies absence where required.
276. Shard write evidence → target PASS requires write + reread + digest/MAC verification → probe/connectivity alone proves only reachability → corrupt-on-write fixture → ShardVault 7/7 gate is end-to-end.
277. Shard target independence → evidence records target identity separately → seven logical aliases can collapse onto one failure domain → target-outage matrix → MEL counts independent destinations, not labels.
278. Shard failover deadline → retry bounded by operation deadline and target budget → slow target cannot monopolize reconstruction → injected latency fixture → MEL advances to alternate fragment.
279. Shard partial read → short/partial object read is failure unless protocol expects range → nonempty bytes are not sufficient → truncation fixture → MEL checks expected length/digest.
280. Shard overwrite race → conditional object mutation prevents stale repair overwriting newer shard → repair is concurrent writer too → two-repair fixture → MEL uses compare-and-set semantics.
281. Workflow durable step → place expensive/external operation in `step.do` checkpoint → code outside durable step may repeat → forced restart fixture → MEL avoids duplicate LLM/tool work.
282. Workflow step granularity → split where rerun boundary matters → too-fine steps add overhead, too-coarse repeat work → fail-late fixture → MEL chooses semantic checkpoints.
283. Workflow retry → configure bounded retry/backoff by failure class → automatic retry is not permission for infinite repetition → permanent-error fixture → MEL terminates with explicit cause.
284. Workflow timeout → each external step gets finite timeout below end-to-end deadline → durable does not mean unbounded → hung dependency fixture → MEL remains recoverable.
285. Workflow sleep → use durable sleep for long waits rather than holding compute → not suitable for immediate interactive latency → long-delay fixture → MEL background jobs consume no hidden busy loop.
286. Workflow event wait → persist explicit correlation/event contract → arbitrary external event must not resume wrong instance → wrong-correlation fixture → MEL approval/Teacher handoff is instance-bound.
287. Workflow pause/resume → UI state must derive from runtime instance state → button click alone is not effect proof → pause+reread fixture → MEL controls show authoritative state.
288. Workflow terminate → termination has distinct semantics from pause → resume-after-terminate should fail predictably → lifecycle matrix → Stop and Pause are not aliases.
289. Workflow status → expose step/progress/error plus observation time → generic RUNNING hides stalls → stuck-step fixture → Activity explains actual phase.
290. Workflow idempotent side effect → durable checkpoint does not make external API intrinsically idempotent → crash window can still matter at remote boundary → injected ambiguous timeout → MEL uses remote idempotency key/reconciliation.
291. Workflow LLM checkpoint → persist model response before downstream tools → restart should not repay/recompute completed call → crash-after-LLM fixture → MEL controls cost and consistency.
292. Workflow tool checkpoint → checkpoint each side-effectful tool independently → bundling several tools can duplicate earlier side effects on later failure → second-tool failure fixture → MEL isolates effects.
293. Workflow saga rollback → attach compensating action near forward step for reversible cross-system effects → compensation is not true transaction and may fail → downstream-failure fixture → MEL records forward and rollback outcomes.
294. Rollback order → compensate reverse step-start order as platform semantics specify → business dependencies still require design → three-step fixture → MEL tests actual reversal invariants.
295. Rollback retry → rollback has its own bounded retry/timeout policy → failed compensation must not be hidden → injected cleanup failure → MEL surfaces degraded/manual-repair state.
296. Workflow observability → metrics/logs correlate workflow, instance, step and exact candidate SHA → aggregate success rate cannot prove one run → trace fixture → MEL evidence is instance-addressable.
297. Workflow progress → non-durable progress/broadcast may repeat → clients must tolerate duplicate/out-of-order updates → restart fixture → MEL UI progress is monotonic projection of authoritative state.
298. Workflow state sync → durable state update belongs in durable step/API when replay safety matters → WebSocket broadcast alone is ephemeral → disconnect/restart fixture → MEL recovers UI from persisted truth.
299. Agent/workflow boundary → real-time agent handles interaction; workflow handles long-running durable execution → forcing all work into one abstraction worsens guarantees → interactive+long-job fixture → MEL routes by execution semantics.
300. Cross-layer job PASS → require accepted input, durable checkpointed processing, persisted effect, reread, UI/runtime coherence, bounded retry/recovery → HTTP 200 or completed step alone is insufficient → injected failure at every boundary → MEL audit uses end-to-end observable postconditions.

## Deduplication
251–280 specialize prior generic storage/idempotency/recovery lessons into R2-specific conditional, checksum, range, multipart and ShardVault evidence semantics. 281–300 specialize prior autonomy/retry lessons into Cloudflare Workflows durable-step, lifecycle, replay and saga behavior. A repeated principle is retained only where a platform-specific failure mode or gate is added.

## Transfer ingestion
Repository search returned no `MEL_TRANSFER_*_10000.md`; none ingested. No autobiographical/private material was imported.

## Merge instruction
If candidate HEAD remains compatible, merge this block into `.agents/MEL_CROSS_DOMAIN_EXPERT_10000.md`, advance canonical counter from 250 to 300, preserve provenance, then delete this staging file only in the same reconciled change. Before merge reread branch HEAD and canonical file; if either moved, deduplicate/rebase semantically rather than overwrite.
