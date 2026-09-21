# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_200/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — blocks 001–100
Cycles 001–100 are preserved in Git history through commit `aca6fc4e42bf8720da99f9a8917566af23ba03fe`. They cover observable postconditions, deadlines/retries/idempotency, Cloudflare state/concurrency, frontend performance/accessibility, supply-chain provenance, grounded communication/RAG, ShardVault recovery, game/audio/publishing/narrative/BD/e-commerce/archival methods. This compacted checkpoint avoids repeatedly expanding old material while retaining immutable provenance in Git.

## Provenance — block 101–150
Primary/recent references reviewed for this block: Cloudflare Browser Run official docs (updated 2026-08-11), Cloudflare Playwright docs (2026-04-21) and Live View docs (2026-09-14); OWASP API Security Top 10 2023; WordPress REST API Handbook; RFC/HTTP conditional-request principles; current browser hardware API documentation. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. These are transferable principles, not implementation claims.

## Cycles 101–150
Cycles 101–150 are preserved in Git history through commit `00b01ed910d2696af6bddb1e81c0b5029359bfcc`. They cover browser task/session lifecycle, observable UI effects, upload/download integrity, API object/property/function authorization and resource budgets, optimistic concurrency, hardware capability/serial protocol/fail-safe design, mobile/touch correctness, progressive rendering/cancellation/poll coalescing/virtualization/leak gates, WordPress REST/idempotent catalogue synchronization, research evidence hierarchy/citation atomicity/freshness and recovery rehearsal.

## Provenance — block 151–200
Primary/recent references reviewed 2026-09-21: Model Context Protocol official 2026-07-28 specification/release materials (stateless core, Multi Round-Trip Requests, header routing, cacheable lists, authorization hardening, extensions); official MCP SDK conformance/tiering material; Cloudflare Queues official batching/retries and Dead Letter Queue docs (updated 2026-04-21); Cloudflare Durable Objects Alarms and Rules docs (updated 2026-04-21); Cloudflare Queues API/configuration docs. Repository search again found no `MEL_TRANSFER_*_10000.md`; none ingested. Principles below are knowledge hypotheses until applied and proven under XP protocol.

## Cycles 151–200
Each cycle records theme → principle → limit/counterexample → falsifiable gate → MEL implication.

151. MCP version negotiation → bind behavior to negotiated protocol version/capabilities → newest local SDK does not imply peer support → mixed-version fixture → MEL tool client gates optional features.
152. MCP stateless core → keep request semantics independently reconstructible where protocol permits → application workflows may still require durable state → restart-between-calls test → MEL stores workflow state explicitly, not in transport accidents.
153. MCP capability negotiation → advertise only implemented capabilities → aspirational flags create false affordances → capability-to-handler matrix test → MEL self-knowledge derives from runtime registry.
154. MCP tool schema precision → narrow typed inputs reduce ambiguous tool calls → schemas cannot encode every semantic invariant → invalid/boundary corpus → MEL validates both schema and domain rules.
155. MCP structured output → prefer machine-checkable result fields plus human text when useful → structured success can still contain stale facts → schema+postcondition test → MEL separates transport validity from factual validity.
156. MCP cancellation → propagate cancellation to cancellable downstream work → irreversible writes need reconciliation rather than pretend cancellation → cancel-before/after-commit fixture → MEL reports final authoritative state.
157. MCP progress → progress tokens report bounded meaningful units → heartbeat spam is not progress → stalled-job fixture → Activity distinguishes alive, advancing and blocked.
158. MCP pagination → traverse cursors until objective met, with caps → exhaustive traversal may be wasteful → multi-page fixture → MEL tools expose completeness/truncation.
159. MCP cacheable lists → cache discovery only with valid freshness/invalidation semantics → dynamic permissions can stale cached tools/resources → permission-change fixture → capability cache has version/TTL boundary.
160. MCP header routing → routing metadata is explicit and validated → client headers are not authorization proof → forged-route fixture → MEL separates routing from identity/permission.
161. MCP authorization scope → request least privilege per server/tool → broad token simplifies setup but enlarges blast radius → denied-scope fixture → MEL capability UI exposes missing grant precisely.
162. MCP elicitation boundary → user-supplied elicited data remains untrusted input → interactive confirmation is not validation → malformed response fixture → MEL validates elicited fields server-side.
163. MCP multi-round-trip → model/tool dialogue needs bounded rounds and terminal criteria → recursive tool negotiation can loop → adversarial server fixture → MEL enforces round/deadline budgets.
164. MCP extension isolation → unknown/unsupported extensions degrade safely → extension presence must not mutate core semantics silently → unsupported-extension fixture → MEL records negotiated extension set.
165. MCP conformance → SDK conformance is baseline interoperability, not app correctness → business invariants remain outside protocol suite → conformance+domain tests → MEL launch gate keeps both layers.
166. Tool provenance → every externally obtained result retains provider/tool/time identity → provenance does not make result true → conflicting-tool fixture → RAG messages carry role/source metadata.
167. Tool side-effect declaration → classify read, reversible write, irreversible/high-impact action → labels can drift from implementation → endpoint-effect audit → MEL confirmation/risk policy binds to observed class.
168. Tool replay safety → retry only when idempotency semantics are known → network timeout may hide successful commit → lost-response fixture → MEL queries authoritative state before replay.
169. Tool timeout hierarchy → child deadline fits within parent workflow deadline → equal nested deadlines leave no cleanup budget → slow-child fixture → MEL reserves reconciliation time.
170. Tool error taxonomy → distinguish validation, auth, transient dependency, conflict, quota and invariant failure → generic 500 destroys recovery strategy → fault-injection matrix → MEL chooses retry/clarify/abort by class.
171. Queue at-least-once reality → consumers tolerate redelivery → exactly-once business effect requires application design → duplicate-message fixture → MEL jobs use operation keys/checkpoints.
172. Queue batch acknowledgement → acknowledge successful items independently when supported → whole-batch retry amplifies duplicates → one-poison-item fixture → MEL consumers isolate failures.
173. Queue retry budget → retries are finite and observable → infinite application retry hides poison messages → persistent-failure fixture → MEL escalates to DLQ/operator evidence.
174. Queue DLQ → configure DLQ for work that must not silently disappear → DLQ without consumer/inspection is delayed loss → poison fixture → launch gate checks DLQ path and drain procedure.
175. Queue retry delay → backoff matches dependency recovery characteristics → fixed long delay harms transient latency → outage-duration matrix → MEL retry policy is dependency-specific.
176. Queue concurrency → cap consumers where downstream capacity/state demands → maximum autoscale is not always safe → constrained-dependency load test → MEL protects D1/external APIs from fan-out.
177. Queue payload bound → messages carry references when blobs are large → indirection adds consistency/lifecycle issues → oversized fixture → MEL stores large artifacts in R2 with verified references.
178. Queue observability → job state records enqueue, attempts, terminal outcome → queue depth alone cannot explain individual work → trace-one-job test → Activity can reconcile UI status to worker execution.
179. Queue poison isolation → deterministic bad input stops consuming retry budget after classification → transient-looking errors can be misclassified → known-bad corpus → MEL validates before expensive processing.
180. Queue replay tooling → DLQ replay is explicit, bounded and idempotent → blind bulk replay can recreate incident → repaired-consumer fixture → MEL supports sampled then staged replay.
181. DO single-location serialization → use object identity for coordination requiring per-key serialization → global unrelated work should not funnel through one object → hot-key load test → MEL shards coordination by stable entity key.
182. DO alarm at-least-once → alarm handler is idempotent → successful side effect followed by throw can repeat → injected post-effect exception → MEL scheduled jobs checkpoint effects.
183. DO one-alarm constraint → maintain internal schedule for multiple events → repeated setAlarm can overwrite intent → two-event fixture → MEL scheduler persists ordered due work.
184. DO alarm retry limit → finite platform retries require explicit durable recovery policy → self-reschedule forever can mask permanent bug → downstream outage fixture → MEL transitions to blocked/dead state with evidence.
185. DO alarm demand scheduling → schedule only when work exists → periodic wakeups waste cost/resources → idle-object trace → MEL avoids hidden idle churn.
186. DO initialization barrier → protect state-dependent startup before concurrent requests → overusing blocking initialization increases latency → concurrent cold-start fixture → MEL initializes only authoritative invariants under barrier.
187. DO hibernation state → persist connection metadata needed after hibernation → in-memory-only session context disappears → hibernate/reconnect fixture → Live state restores explicit attachment/context.
188. DO storage authority → authoritative state lives in durable storage, memory is cache → memory can be stale after restart → eviction fixture → status reread verifies persistence.
189. DO hot-key backpressure → serialize does not mean unlimited throughput → one entity can still overload CPU/storage → burst fixture → MEL queues/coalesces per-entity work.
190. DO migration discipline → class/storage migrations require deploy-compatible sequencing → code-first destructive assumptions break old instances → mixed-version fixture → candidate gate rehearses migration/rollback.
191. Autonomy lease → one active executor per logical job via durable lease/fencing token → wall-clock lease alone is unsafe under pauses → stale-worker fixture → MEL rejects effects from superseded executor.
192. Fencing token → monotonically newer owner token accompanies protected writes → token only works if sink validates it → stale-write fixture → MEL critical state checks generation/version.
193. Job checkpoint → checkpoint after authoritative postcondition, not before effect → premature checkpoint loses work → crash-window matrix → MEL restart resumes from proven boundary.
194. Job compensation → define reconciliation for partial multi-system writes → not every external action is reversible → fail-between-steps fixture → MEL records manual-remediation state when needed.
195. Status truth → UI status is projection of authoritative runtime evidence → optimistic label can outlive failed backend → backend-failure fixture → MEL never reports DONE from click/HTTP alone.
196. Status freshness → display observation time/version → green stale state is misleading → stop backend then retain UI fixture → MEL marks stale/unknown explicitly.
197. Capability truth → distinguish code-present, configured, authorized, reachable and proven → endpoint existence conflates stages → capability matrix fixture → MEL self-description uses strongest proven level only.
198. Bounded stress → define load envelope, abort thresholds and cleanup before run → stress without bounds risks accidental DoS → threshold-trigger fixture → candidate-only stress terminates safely.
199. Failure injection → test timeout, duplicate, stale version, partial dependency and restart → happy-path load misses resilience defects → deterministic fault suite → MEL gates core workflows on recovery behavior.
200. Recovery evidence chain → restore/reconstruct PASS requires hash/version plus functional smoke → byte recovery alone may restore unusable state → isolated restore+boot+read fixture → ShardVault/recovery gate binds artifact integrity to runtime usability.

## Deduplication notes
151–200 specialize prior generic timeout/idempotency/concurrency lessons into current MCP 2026-07-28 semantics and Cloudflare Queues/Durable Objects failure behavior. Reused concepts are retained only where the platform/protocol adds a distinct failure mode or falsifiable gate. No implementation is claimed from study alone.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable at this checkpoint. Continue periodic search and ingest only generalized, provenance-bearing methods; never raw private autobiographical material.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_201/10000`. Prioritize D1 sessions/bookmarks/transactions, R2 conditional writes/checksums/range semantics, Workflows durability/versioning, GitHub Actions/release supply-chain provenance, model routing/evals/grounding and code-linked open defects. Before every write reread candidate HEAD and abort/reconcile if moved.