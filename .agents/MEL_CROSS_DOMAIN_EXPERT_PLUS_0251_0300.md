# MEL Cross-domain Expert +10 000 — cycles 251–300

Checkpoint: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_300/10000` (IN_PROGRESS). Additive knowledge track; not validated implementation XP.

Provenance reviewed 2026-09-21: Cloudflare official R2 Workers API reference, R2 upload/multipart documentation, R2 S3 compatibility/error documentation, Workflows overview, sleeping/retrying and observability documentation. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. Each item is theme → principle → limit/counterexample → falsifiable gate → MEL implication.

251. R2 conditional write → couple mutation to expected ETag/version → ETag is concurrency evidence, not authorization → stale-writer fixture → MEL rejects lost-update overwrite.
252. R2 failed put condition → treat null/precondition failure as conflict → blind retry can overwrite newer state → competing-writer fixture → refetch/reconcile before retry.
253. R2 HTTP ETag → use quoted `httpEtag` in HTTP headers → raw etag has different representation → conditional browser roundtrip → MEL preserves protocol form.
254. R2 version identity → record returned version for exact upload identity → key alone is mutable → replace-same-key fixture → diagnostics distinguish logical key from object generation.
255. R2 checksum upload → provide strong checksum where integrity matters → checksum does not prove provenance → bit-flip fixture → ShardVault verifies transport bytes independently of MAC.
256. R2 checksum reread → compare stored/recomputed digest after write → successful PUT is not readback proof → corrupt/mock fixture → external-target qualification requires write+read integrity.
257. R2 multipart ETag → never equate completed multipart ETag with whole-object MD5 → multipart algorithm differs → multipart fixture → ShardVault uses explicit SHA/MAC authority.
258. Multipart threshold → choose multipart for large/resumable payloads → tiny objects gain overhead → size matrix → MEL selects transfer strategy by payload/recovery need.
259. Multipart part size → respect 5 MiB minimum except last and platform limits → arbitrary chunking can fail → boundary fixture → uploader validates plan before network work.
260. Multipart replacement → reuploading same part number replaces prior part → failed replacement can lose prior part in R2 S3 behavior → retry fault fixture → MEL tracks part completion after successful response only.
261. Multipart abandonment → lifecycle cleanup is eventual/default policy, not immediate transaction rollback → leaked uploads consume resources until abort/lifecycle → injected failure → MEL explicitly aborts when practical.
262. Range read → request only required bytes for large verification/recovery → range is not integrity proof → wrong-range fixture → MEL validates offsets and final digest.
263. Unsatisfiable range → handle 416 as deterministic request error → retrying unchanged range loops → truncated-object fixture → recompute metadata before retry.
264. Conditional read → use If-None-Match/If-Match to avoid stale/unnecessary transfer → cache condition cannot replace authorization → mutation-between-reads fixture → MEL makes cache/freshness semantics explicit.
265. Presigned URL bearer semantics → short-lived least-operation URL → possession grants operation until expiry → leak fixture → MEL never logs full sensitive URL.
266. Presigned operation scope → sign exact GET/PUT/HEAD/DELETE need → generic credential is broader → misuse fixture → external handoff minimizes capability.
267. R2 metadata authority → content metadata belongs to object version → caller-supplied echoed metadata on GET can confuse provenance → mismatch fixture → MEL separates stored from presentation metadata.
268. R2 custom metadata → keep small provenance hints, not sole authoritative ledger → mutable object replacement changes metadata → replacement fixture → canonical evidence also lives in durable manifest.
269. R2 listing pagination → continuation token drives bounded traversal → first page is not complete inventory → >page fixture → backup audit proves exhaustive enumeration.
270. R2 prefix isolation → namespace candidate/test artifacts explicitly → prefix is organization, not security boundary → cross-prefix auth fixture → MEL cleanup cannot touch production namespace.
271. R2 delete verification → deletion success followed by authoritative absence check when safety requires → request success alone is not observed postcondition → reread fixture → cleanup gates effects.
272. R2 timeout budget → every external operation inherits bounded deadline → unlimited retry hides dead target → slow-target fixture → ShardVault failover advances.
273. R2 retry classification → retry transient transport/5xx selectively, not malformed digest/precondition unchanged → universal retry amplifies failure → error matrix → MEL records terminal vs transient.
274. R2 target health → qualification includes write/read/delete latency and integrity → HEAD/HTTP 200 alone is insufficient → synthetic probe → ShardVault scores real capability.
275. R2 cost awareness → batch/list/range only when semantics permit → optimization must not weaken proof → cost-vs-integrity fixture → zero-spend runs avoid unnecessary operations.
276. Workflow durable step → place replay-sensitive work inside named durable step → arbitrary code outside step lacks same persistence semantics → restart fixture → MEL checkpoints side effects intentionally.
277. Workflow completed-step permanence → assume completed step will not rerun on workflow restart → changing semantics under same logical step can complicate evolution → version fixture → MEL treats step identity as compatibility surface.
278. Workflow automatic retry → side-effecting step must be idempotent/reconcilable → retries can duplicate external effects → crash-after-effect fixture → operation key precedes effect.
279. Workflow retry backoff → configure bounded backoff for transient dependency → aggressive retry causes thundering herd → outage fixture → MEL respects dependency recovery.
280. Workflow terminal failure → surface exhausted retries as explicit failed state → silent infinite pending lies to UI → permanent-error fixture → Activity shows terminal reason.
281. Workflow sleep → durable sleep replaces hot polling → sleep is unsuitable when event can wake directly → timer fixture → autonomy avoids hidden CPU/network work.
282. Workflow event wait → use persisted event wait for external approval/signal → event name/payload still need validation → spoof fixture → MEL binds event to instance and policy.
283. Workflow long wait → persisted wait can span long periods → business SLA may be much shorter → expiry fixture → MEL exposes deadline distinct from platform maximum.
284. Workflow instance identity → persist instance ID with business operation → display name alone is ambiguous → concurrent-same-task fixture → diagnostics link exact execution.
285. Workflow status projection → UI derives status from authoritative instance plus business reconciliation → local optimistic state can drift → reload fixture → status survives browser restart.
286. Workflow pause/resume → verify actual lifecycle transition and resumed progress → button acknowledgement alone is not PASS → pause-mid-step fixture → control test observes postcondition.
287. Workflow terminate → termination needs cleanup/reconciliation policy → stopping orchestration may leave external side effects → terminate-after-upload fixture → MEL reports residuals.
288. Workflow compensation → compensation is a new fallible action, not magical rollback → rollback can fail → injected compensation failure → diagnostics distinguish forward and rollback failure.
289. Workflow rollback metrics → observe rollback attempt/success/failure separately → aggregate error rate hides compensation health → fault fixture → MEL incident view identifies recovery failure.
290. Workflow observability → correlate workflow, step, attempt, operation key and SHA → logs without IDs cannot prove sequence → concurrent fixture → evidence chain is reconstructable.
291. Workflow metrics retention → export durable incident evidence if needed beyond platform analytics retention → dashboard history is finite → aged-run fixture → launch evidence is archived with SHA.
292. Workflow version evolution → preserve compatibility for in-flight instances → new code assumptions can invalidate old payload/state → deploy-during-sleep fixture → MEL uses schema/version adapters.
293. Workflow payload schema → validate input at boundary and version it → durable execution preserves bad input too → malformed fixture → fail early before side effects.
294. Workflow step output size → persist references for large blobs rather than bloating orchestration state → external reference can disappear → deletion fixture → MEL binds reference digest/existence.
295. Workflow external API → record request idempotency key and response identity → durable step retry does not make remote API idempotent → timeout-after-remote-success fixture → reconcile before duplicate.
296. Workflow concurrency → define per-resource serialization/lease where effects conflict → durable execution alone does not eliminate concurrent instances → two-instance fixture → MEL fences shared mutation.
297. Workflow cancellation race → cancellation and completion can cross → UI must not infer final state from click order → race fixture → reread authoritative instance/effect.
298. Workflow stress → use bounded isolated candidate fixtures with cleanup → production-scale load is not required to find retry/state bugs → seeded faults → MEL tests restart, timeout and concurrency deterministically.
299. Cross-layer backup → workflow checkpoint plus R2 object plus D1 manifest need referential consistency → each subsystem green alone can still disagree → orphan/missing-reference fixture → MEL recovery audit traverses graph.
300. ShardVault external proof → target PASS requires bounded write → read → byte digest/MAC → delete/retention policy evidence under exact candidate SHA → probe-only success is insufficient → seven-target fixture with injected slow/dead targets → MEL reports 7/7 only from observed end-to-end postconditions.

## Deduplication
251–275 specialize existing generic storage/integrity rules into R2-specific conditional, checksum, multipart, range and bearer-token failure modes. 276–300 specialize existing autonomy/idempotency rules into Cloudflare Workflows durable-step, retry, lifecycle, compensation and observability semantics. No item is promoted to validated XP until applied to code with test/runtime proof under `.agents/XP_PROTOCOL.md`.

## Next
Continue at cycle 301. Prioritize model routing/evals/grounding/self-knowledge, then frontend performance measurements and code-linked open defects. Before any write, reread candidate HEAD and reconcile if moved.