# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_250/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — blocks 001–100
Cycles 001–100 are preserved in Git history through commit `aca6fc4e42bf8720da99f9a8917566af23ba03fe`. They cover observable postconditions, deadlines/retries/idempotency, Cloudflare state/concurrency, frontend performance/accessibility, supply-chain provenance, grounded communication/RAG, ShardVault recovery, game/audio/publishing/narrative/BD/e-commerce/archival methods. This compacted checkpoint avoids repeatedly expanding old material while retaining immutable provenance in Git.

## Provenance — block 101–150
Cycles 101–150 are preserved in Git history through commit `00b01ed910d2696af6bddb1e81c0b5029359bfcc`. Primary references: Cloudflare Browser Run/Playwright/Live View docs, OWASP API Security Top 10 2023, WordPress REST API Handbook, HTTP conditional-request principles and browser hardware API documentation.

## Provenance — block 151–200
Cycles 151–200 are preserved in Git history through the immediately preceding version of this file (blob `fc1aa12197cf7e8817086121f5db30c84310149c`). Primary references reviewed 2026-09-21: MCP 2026-07-28 specification/release and SDK conformance material; Cloudflare Queues batching/retries/DLQ docs; Durable Objects Alarms/Rules docs. They specialize protocol negotiation, tool provenance/replay safety, queue redelivery/DLQ, DO alarms/state, autonomy leases/fencing/checkpoints, status/capability truth and bounded stress/recovery evidence.

## Provenance — block 201–250
Primary/recent references reviewed 2026-09-21: Cloudflare D1 Global Read Replication / Sessions API / D1Database official docs and release notes; GitHub official Artifact Attestations, build provenance, SBOM and verification documentation. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. The lessons remain knowledge hypotheses until code-linked proof per XP protocol.

## Cycles 201–250
Each cycle records theme → principle → limit/counterexample → falsifiable gate → MEL implication.

201. D1 session boundary → group causally related reads/writes in a Sessions API session → unrelated traffic need not share one → write/read fixture → MEL preserves logical operation boundaries.
202. D1 sequential consistency → session reads never regress behind an earlier session observation → this is not arbitrary global linearizability → concurrent-writer fixture → MEL states consistency guarantees precisely.
203. D1 read-your-writes → keep dependent post-write reads in session/bookmark lineage → fresh unconstrained session may see older replica → immediate reread fixture → MEL verifies persisted effects causally.
204. D1 monotonic reads → propagate bookmark across a user workflow → dropping bookmark can weaken continuity → replica-lag fixture → status refresh cannot move backward silently.
205. D1 bookmark handoff → persist/return bookmark when later request depends on prior state → bookmark is not business authorization → cross-request fixture → MEL transports causality separately from identity.
206. D1 first-primary → request primary-current start only when freshness requires it → always-primary sacrifices replica latency benefit → stale-sensitive/non-sensitive matrix → MEL chooses freshness intentionally.
207. D1 first-unconstrained → use for latency-tolerant initial reads → unsuitable for immediately dependent state → fresh-write fixture → catalogue/static views may differ from job status.
208. D1 replica transparency → application correctness cannot depend on replica geography → routing can change → region matrix → MEL tests semantics, not assumed topology.
209. D1 bookmark opacity → treat bookmarks as opaque tokens → parsing/comparing internal form is unsupported → format-change fixture → MEL stores without interpretation.
210. D1 missing bookmark → define explicit fallback semantics → silently treating missing as current can lie → header-loss fixture → MEL marks freshness boundary.
211. D1 status projection → status endpoint uses causal bookmark after mutation → independent stale GET can show false rollback → mutation/status test → Activity follows authoritative progression.
212. D1 API pagination state → cursor/bookmark purposes stay distinct → pagination cursor is not consistency token → multi-page mutation fixture → MEL labels tokens by semantics.
213. D1 transaction scope → keep atomic invariants within supported DB transaction/batch semantics → external API side effects are not made atomic → fail-between-systems fixture → MEL reconciles cross-system effects.
214. D1 optimistic versioning → business rows carry version where lost updates matter → session consistency alone does not prevent semantic overwrite → two-editor fixture → MEL rejects stale update.
215. D1 idempotency record → operation key and result stored durably with effect → key without atomic coupling can duplicate → crash-window fixture → autonomy retries return prior authoritative result.
216. D1 migration expand/contract → deploy additive schema before consumers depend on it → destructive one-step migration breaks mixed versions → old/new worker fixture → candidate gate rehearses compatibility.
217. D1 migration observability → record schema/version evidence → successful deploy does not prove migration → cold-instance query fixture → Launch Gate checks actual schema.
218. D1 query budget → bound rows/columns and paginate large reads → replicas do not remove CPU/result costs → oversized dataset fixture → MEL avoids hidden unbounded status/history reads.
219. D1 prepared parameters → bind untrusted values rather than concatenate SQL → binding does not validate business authorization → injection+auth fixture → MEL keeps both controls.
220. D1 replica failure → retry/fallback bounded by request deadline → endless freshness wait is not resilience → impaired-replica fixture → MEL surfaces timeout/unknown.
221. Build provenance → release artifact binds to source repo/workflow/commit identity → provenance does not prove secure code → verify+vulnerability fixture → MEL distinguishes origin from quality.
222. Attestation verification → verification is required for security value → merely generating attestation is inert → tampered artifact fixture → release gate verifies candidate artifact.
223. SHA binding → deployment evidence names exact commit SHA → branch name can move → head-move fixture → preview proof remains immutable.
224. Artifact subject digest → attest exact distributed artifact → attesting neighboring manifest alone may miss replacement → byte-tamper fixture → MEL release proof binds payload digest.
225. Least workflow permissions → grant only contents/id-token/attestation scopes needed → broad token expands compromise blast radius → permission-denial fixture → MEL CI scopes each job.
226. OIDC provenance → ephemeral identity ties build to workflow claims → OIDC identity does not validate runtime behavior → claim-policy fixture → provenance complements tests.
227. SBOM attestation → bind dependency inventory to artifact → SBOM can be incomplete/inaccurate → known-dependency fixture → MEL verifies generation coverage.
228. Dependency pinning → critical Actions/dependencies use immutable revision where practical → tags can move → tag-retarget threat model → MEL supply-chain audit flags mutable trust anchors.
229. Third-party Action isolation → minimize secrets/permissions exposed to external Actions → popular action is not automatically trustworthy → malicious-step fixture → MEL separates privileged jobs.
230. Build/release separation → test build and releasable artifact have explicit promotion identity → rebuilding later can change bytes → rebuild-difference fixture → MEL promotes verified artifact, not assumption.
231. Attestation policy → define accepted repository/workflow/ref/environment claims → cryptographic validity alone accepts wrong producer → wrong-workflow fixture → MEL gate checks expected identity.
232. Private/public attestation context → verification model depends on repository/plan infrastructure → do not assume public transparency semantics everywhere → environment fixture → MEL records attestation backend.
233. Attestation retention → provenance availability must match artifact lifecycle → deleted evidence can make later verification impossible → retention fixture → MEL backup plan includes verification metadata.
234. Release artifact immutability → once approved, bytes are content-addressed/frozen → mutable upload invalidates prior proof → replacement fixture → MEL refuses silent artifact mutation.
235. CI event trust → fork/untrusted events receive reduced privileges → same workflow text under different trigger has different risk → PR-from-fork fixture → MEL audits trigger+permissions together.
236. Secretless validation → most candidate tests should run without deployment secrets → requiring prod credentials widens risk → revoked-secret fixture → MEL preview gate degrades safely.
237. Reusable workflow trust → caller pins trusted reusable workflow revision → central workflow update can otherwise alter build semantics → revision-change fixture → MEL provenance records reusable workflow ref.
238. Generated-code provenance → generated bundles retain source/tool/version relation → generated output alone obscures inputs → regenerate fixture → MEL can reproduce candidate assets.
239. Lockfile authority → deterministic dependency resolution uses committed lockfile → lockfile does not prevent compromised registry artifact → clean-install fixture → MEL combines lock + integrity/provenance.
240. Cache poisoning → caches are optimization, never unverified authority → cross-branch cache can inject stale/wrong outputs → poisoned-cache fixture → MEL validates restored cache artifacts.
241. CI concurrency → superseded candidate runs cancel where safe → cancellation after external effect needs reconciliation → rapid-push fixture → MEL avoids reporting cancelled run as latest PASS.
242. Gate freshness → green checks belong to current exact SHA → prior SHA success cannot transfer automatically → one-line-change fixture → MEL recomputes required gates.
243. Partial gate semantics → skipped/not-run is distinct from PASS → conditional workflow can create false green → skipped-job fixture → Launch Gate requires explicit evidence set.
244. Flake handling → retry may diagnose transient infrastructure but cannot erase deterministic failure → repeated rerun until green biases evidence → seeded-failure fixture → MEL records attempts and cause.
245. Test artifact provenance → logs/reports identify SHA, environment and test version → detached screenshot is weak evidence → mismatched-report fixture → MEL evidence chain is machine-correlatable.
246. Preview identity → UI exposes exact candidate SHA/runtime build id → hostname alone may point to newer deployment → redeploy fixture → MEL status can prove what code is exercised.
247. Rollback identity → rollback selects previously verified immutable artifact → branch rewind/rebuild is not equivalent → rollback drill → MEL recovery records selected digest/SHA.
248. Supply-chain incident → invalidate compromised producer/dependency and rebuild from trusted boundary → restoring old artifact may retain compromise → compromised-action fixture → MEL incident runbook includes provenance review.
249. Provenance UX → operator sees source SHA, verification status and observation time → raw attestation JSON is insufficient operationally → stale/mismatch UI fixture → Diagnostics summarizes truth without hiding detail.
250. Cross-layer release proof → launch requires code tests + artifact provenance + exact preview runtime evidence → no single layer proves readiness → intentionally wrong-artifact fixture → MEL Launch Gate composes independent evidence.

## Deduplication notes
201–220 specialize prior consistency/idempotency lessons into D1 Sessions/bookmark semantics. 221–250 specialize prior generic supply-chain provenance into verifiable GitHub build-artifact identity and exact-SHA release gates. Repeated principles are retained only where a distinct platform failure mode or falsifiable gate is added.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable at this checkpoint. Continue periodic search and ingest only generalized, provenance-bearing methods; never raw private autobiographical material.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_251/10000`. Prioritize R2 conditional operations/checksums/range semantics, Workflows durability/versioning/retries, then model routing/evals/grounding and code-linked open defects. Before every write reread candidate HEAD and abort/reconcile if moved.
