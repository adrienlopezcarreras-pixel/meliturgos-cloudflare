# MEL Cross-domain Expert — cycles 201–250

Checkpoint: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_250/10000`.

Provenance reviewed 2026-09-21: Cloudflare D1 official docs (Query a database, D1 Database/Sessions API; updated 2026-04-21/2026-06-22), Cloudflare R2 Workers API reference, Cloudflare Workflows Workers API, GitHub official Artifact Attestations docs. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. These are transferable knowledge hypotheses until applied and proven per `.agents/XP_PROTOCOL.md`.

Each cycle: theme → principle → limit/counterexample → falsifiable gate → MEL implication.

201. D1 prepared statements → bind dynamic values → binding does not validate business semantics → injection/boundary fixture → MEL separates SQL safety from domain validation.
202. D1 batch atomicity → group dependent statements when all-or-nothing is required → large batches increase contention/failure scope → injected middle failure → MEL verifies rollback and post-state.
203. D1 batch ordering → statements execute sequentially/non-concurrently → order alone does not prevent stale external assumptions → dependent-write fixture → MEL keeps database invariants inside the batch.
204. D1 exec boundary → reserve raw exec for controlled maintenance/one-shot work → dynamic input makes it unsafe → untrusted-input fixture → MEL runtime paths prefer prepared statements.
205. D1 session consistency → use a session for sequentially consistent read chains → session does not make external systems atomic → read-after-write fixture → MEL status reads can carry consistency context.
206. D1 first-primary → start on primary when freshness is mandatory → primary routing can cost latency → stale-replica fixture → MEL chooses freshness explicitly for authoritative status.
207. D1 first-unconstrained → permit lower-latency initial replica read when stale data is acceptable → unsuitable for confirmation after writes → freshness-class fixture → MEL labels weakly fresh observations.
208. D1 bookmarks → propagate bookmark to guarantee a later session starts at least that point → bookmark is not an application revision number → cross-session fixture → MEL carries consistency token separately from entity version.
209. D1 read replication → sessions are required to benefit from replicas → ordinary binding calls remain primary-only → replica-observation fixture → MEL does not claim replication benefit without session use.
210. D1 foreign keys → encode relational invariants in storage → constraints do not encode all business rules → invalid-reference fixture → MEL launch tests storage constraints.
211. D1 query cost → inspect rows read/written and indexes → an index can hurt write-heavy paths → before/after query fixture → MEL performance work is measured, not assumed.
212. D1 pagination → page large result sets with deterministic ordering → offset pagination can drift under writes → concurrent-insert fixture → MEL prefers stable cursors/keys where correctness matters.
213. D1 retry classification → retry only documented/transient failures → constraint errors are deterministic → fault taxonomy fixture → MEL avoids blind database retries.
214. D1 migration forward compatibility → additive/schema-compatible steps before destructive cleanup → old code may coexist during rollout → mixed-version fixture → candidate preview rehearses migration sequence.
215. D1 backup restore → backup existence is not recovery proof → restored schema may be incompatible with current code → isolated restore smoke → MEL recovery gate includes functional read/write.
216. R2 conditional write → use preconditions for compare-before-replace semantics → client-side HEAD then PUT races → competing-writer fixture → MEL object updates bind to observed version/etag.
217. R2 conditional read → avoid transferring unchanged objects when validators match → validator mismatch still requires full correctness check → unchanged/changed fixture → MEL cache refresh is conditional and observable.
218. R2 checksums → persist/verify supported checksum metadata for integrity → checksum does not prove provenance or authorization → corruption fixture → ShardVault separates integrity from source trust.
219. R2 range reads → fetch only needed byte ranges for large artifacts → partial bytes cannot establish whole-object integrity alone → truncated-range fixture → MEL uses ranges for access, full digest for recovery proof.
220. R2 metadata → store content/provenance metadata deliberately → metadata can drift from object body → mismatch fixture → MEL verifies body-derived facts independently.
221. R2 object keys → stable names need version strategy → overwrite-in-place obscures rollback/history → concurrent-version fixture → MEL backups use immutable/versioned identity where practical.
222. R2 write postcondition → successful API response is not final proof for critical flows → wrong key/body can still be accepted → immediate authoritative read/hash → MEL marks backup PASS only after re-observation.
223. R2 multipart lifecycle → abort incomplete multipart uploads → abandoned parts create hidden storage/cost → interrupted-upload fixture → MEL cleanup is part of failure handling.
224. R2 large-object streaming → stream rather than buffer whole artifacts → streaming complicates retries/checksum finalization → midstream-failure fixture → MEL records incomplete state and restarts safely.
225. R2 content type → preserve explicit media type → extension alone is unreliable → wrong-extension fixture → MEL download/render paths use trusted metadata plus sniff-safe policy.
226. R2 authorization → least-privilege bindings/tokens by operation → broad bucket access enlarges blast radius → denied-operation fixture → MEL capability truth reports actual grant.
227. R2 delete safety → destructive delete requires version/key certainty → stale UI selection can delete newer object → stale-selection fixture → MEL revalidates target before irreversible deletion.
228. R2 listing pagination → consume continuation until objective/cap reached → first page is not complete inventory → multi-page fixture → MEL reports truncated listings explicitly.
229. R2 backup retention → retention policy is distinct from successful backup → unlimited retention is not free/safe → expiry fixture → MEL exposes recoverable horizon.
230. R2 restore identity → restored bytes must map to intended Git SHA/config generation → same filename is insufficient → wrong-version fixture → ShardVault restore binds digest and source revision.
231. Workflow instance identity → assign stable business operation IDs → random retries can spawn duplicate workflows → duplicate-start fixture → MEL start path deduplicates logical jobs.
232. Workflow durable steps → isolate retriable side effects in explicit steps → arbitrary code between checkpoints may replay → crash-window fixture → MEL documents replay boundary.
233. Workflow step idempotence → step retry must tolerate prior success with lost acknowledgement → retry count is not uniqueness → lost-response fixture → MEL uses operation keys/postcondition reads.
234. Workflow timeout → bound external waits and preserve cleanup budget → platform durability does not make dependencies responsive → hanging dependency fixture → MEL transitions to blocked with evidence.
235. Workflow pause/restart semantics → expose authoritative workflow state → UI toggle alone is not pause proof → pause-mid-step fixture → MEL status follows runtime state machine.
236. Workflow version compatibility → in-flight instances may outlive code revision → assuming only latest code breaks resume → old-instance/new-code fixture → MEL keeps compatible handlers or migration plan.
237. Workflow compensation → partial multi-system effects need reconciliation → not every effect is reversible → fail-after-external-write fixture → MEL records manual remediation when compensation impossible.
238. Workflow observability → correlate instance, step, attempt and source SHA → aggregate logs hide one stuck job → trace-one-instance gate → Activity links status to evidence.
239. Workflow cancellation → cancellation is a requested transition, not proof all effects stopped → committed side effects remain → cancel-after-commit fixture → MEL reports residual effects.
240. Workflow terminal state → success requires business postcondition, not engine completion alone → workflow can complete with semantically wrong output → output-validation fixture → MEL launch gate checks result.
241. GitHub artifact attestation → signed provenance links artifact to repo/workflow/SHA/event → attestation does not prove artifact is safe → verify + independent tests → MEL release evidence separates provenance and quality.
242. Attestation verification → verification is where provenance gains operational value → generating unattested policy checks is theater → tampered artifact fixture → MEL gate verifies consumed release artifact.
243. Attestation subject digest → bind attestation to exact artifact digest → mutable tags/names are insufficient → same-name/different-bytes fixture → MEL release records digest.
244. Attestation permissions → grant only required id-token/contents/attestations permissions → broad workflow token expands supply-chain risk → permission audit → MEL CI defaults least privilege.
245. SBOM attestation → bind dependency inventory to artifact → SBOM can be incomplete/stale if generator scope is wrong → known-dependency fixture → MEL treats SBOM as evidence, not guarantee.
246. Build provenance policy → require expected repository/workflow/SHA for release consumption → valid signature from wrong workflow is not acceptable → wrong-workflow fixture → MEL release verifier checks identity claims.
247. Action pinning → immutable revisions reduce tag-retarget risk → pinned code can still contain vulnerabilities → dependency-review fixture → MEL separates immutability from trustworthiness.
248. CI artifact handoff → deploy exactly the tested artifact/SHA → rebuilding later can change dependencies/environment → rebuild-drift fixture → MEL preview/release proof carries artifact digest.
249. Candidate concurrency → reread branch HEAD before mutation and reconcile movement → stale prepared patch can overwrite peer work → simulated moved-head fixture → MEL automation aborts/rebases rather than force-pushes.
250. Production immutability gate → candidate success never implies permission to move release/deploy production → technical green and human authorization are separate conditions → green-without-approval fixture → MEL keeps production unchanged until explicit approval.

## Deduplication
Cycles 201–250 specialize earlier generic consistency/idempotency/recovery lessons into D1 Sessions/bookmarks, R2 object semantics, Workflows replay/version boundaries, and GitHub artifact provenance. Repeated generic rules were omitted unless a platform-specific failure mode or gate was added.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable in repository code search at this checkpoint. No private autobiographical material was imported.

## Next
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_251/10000`; prioritize model routing/evals/grounding/self-knowledge, RAG retrieval evaluation, tool-use evals, communication coherence and then code-linked open defects. Before any write, reread candidate HEAD and abort/reconcile if it moved.