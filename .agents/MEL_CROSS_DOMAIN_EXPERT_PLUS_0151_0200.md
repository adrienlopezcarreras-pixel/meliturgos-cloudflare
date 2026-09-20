# MEL Cross-domain Expert PLUS — cycles 151–200

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_200/10000`

Provenance: additive block prepared from candidate HEAD `709bf39c3e28887232f7cd4e0af84e6ca6fbe939`. No production action is authorized. No private autobiographical material is included.

## Primary sources
- Cloudflare Workers Best Practices, updated 2026-08-20: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers CPU profiling, updated 2026-09-05: https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/
- Cloudflare Workers cache configuration: https://developers.cloudflare.com/workers/cache/configuration/
- Cloudflare Workers metrics and analytics, updated 2026-07-01: https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- MDN Page Visibility API: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- MDN IntersectionObserver: https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver
- MDN PerformanceObserver / Performance API: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver and https://developer.mozilla.org/en-US/docs/Web/API/Performance_API

Format: problem → principle/limit → pattern/anti-pattern → gate → concrete MEL implication.

151. Worker global initialization → startup has a hard platform budget; move expensive derivation to build-time or demand path → thin global scope / eager corpus parsing → startup profile → MEL shell/API starts predictably.
152. Bundle startup cost → bundle bytes and top-level execution are distinct costs → measure both / optimize bytes blindly → `wrangler check startup` plus bundle report → performance repair targets the real bottleneck.
153. CPU versus wall time → Workers CPU excludes I/O wait; wall latency can still be high → CPU profile + end-to-end timing / infer CPU from duration → slow-upstream fixture → MEL diagnoses compute versus dependency delay correctly.
154. Representative profiling → local CPU profile is useful only with production-like routes/data → replay representative workload / microbenchmark toy handler → profile corpus/import/status paths → optimization evidence matches MEL usage.
155. Large response forwarding → streaming lowers peak memory and TTFB → pipe body / buffer then clone → large-object memory test → file/download routes avoid avoidable crashes.
156. Upload buffering → consumed uploads need explicit maximum before full read → size gate / unlimited arrayBuffer → over-limit upload fixture → MEL drag-drop keeps bounded memory.
157. Response-dependent work → work required for correctness must finish before success → await required persistence / `waitUntil` critical state → crash-after-response fixture → UI success means durable effect.
158. Post-response work → analytics/cache/logging can use `waitUntil` within its lifetime → explicit background work / floating promise → termination fixture → noncritical telemetry completes more reliably.
159. Floating promises → every promise needs ownership → await/return/waitUntil / fire-and-forget → lint gate → MEL avoids silent dropped writes.
160. Service access → native bindings remove network/auth overhead for D1/R2/Queues/Workflows → binding / own REST roundtrip → route latency comparison → MEL uses platform-local paths where applicable.
161. Compatibility-date changes → runtime behavior can change with compatibility date → deliberate tested upgrades / automatic date bump in production → candidate regression suite → MEL gets fixes without accidental semantic drift.
162. Cache freshness budget → max-age and stale windows are endpoint-specific → explicit freshness contract / generic cache-all → mutation/read test → status/memory/catalog endpoints balance truth and speed.
163. Stale-while-revalidate cost → background revalidation still executes work and low traffic can preserve stale data → use only with acceptable staleness / treat SWR as free freshness → request-count gate → MEL does not trade correctness for hidden Worker work.
164. Stale-if-error → stale data can preserve availability only where old data is safer than failure → endpoint allowlist / stale sensitive state universally → induced 5xx fixture → static/reference UI degrades gracefully without lying about live state.
165. Cache invalidation → mutation must invalidate or version relevant cached reads → dependency-aware invalidation / TTL-only hope → write→immediate read → MEL controls reflect new state promptly.
166. Cache key cardinality → over-specific keys destroy hit rate; under-specific keys leak context → minimum security+semantic variance / full random query or URL-only auth cache → key audit → cache is efficient and isolated.
167. Duplicate GET fan-out → components requesting same state concurrently should share an in-flight read when context matches → single-flight map / independent fetch storm → request-count test → MEL UI reduces redundant network work.
168. Single-flight lifetime → in-flight entries must clear on resolve/reject/abort → `finally` cleanup / permanent rejected promise cache → failure then recovery test → transient outage cannot poison MEL UI forever.
169. Polling visibility → hidden tabs should suspend nonessential browser polling → Page Visibility / background constant interval → hidden-tab request counter → interface consumes less CPU/network without stopping server jobs.
170. Polling resume → becoming visible needs fresh state rather than replaying every missed tick → immediate coalesced refresh / catch-up burst → hide/show stress → MEL recovers current truth cheaply.
171. Polling overlap → slow requests must not accumulate → completion-driven scheduling or single-flight / raw setInterval async → throttled-network test → status loops remain bounded.
172. Poll cancellation → obsolete tab/component fetches should be aborted locally → AbortController + generation guard / orphan requests → rapid navigation test → MEL avoids wasted rendering/network work.
173. Abort semantics → browser abort is local unless backend cancellation is explicit → UI label distinguishes request from job cancellation / claim job stopped → backend observation → communication stays truthful.
174. Stale response ordering → response age is not arrival order → generation/version compare / last arrival wins → delayed old response → MEL cannot regress displayed status.
175. DOM scale → chat/activity histories should not keep every expensive subtree rendered → windowing/content-visibility strategy / 10k full nodes → long-history scroll benchmark → capability preserved with bounded render cost.
176. Virtualization accessibility → optimization must preserve keyboard/search/semantics or offer accessible fallback → stable logical order / recycled nodes that destroy focus → keyboard+screen-reader gate → long MEL histories remain operable.
177. Content visibility → off-screen rendering can be deferred where layout semantics tolerate it → targeted use / blanket application to focus-sensitive controls → focus/navigation test → panels get cheaper without hidden interaction bugs.
178. Intersection observation → use one observer for many elements when thresholds/root match → shared observer / scroll handler per card → long-list CPU trace → MEL avoids high-frequency layout work.
179. Experimental visibility tracking → `trackVisibility` is not broadly baseline and costs computation → progressive enhancement / mandatory dependency → compatibility gate → MEL does not regress browsers for marginal optimization.
180. Listener multiplicity → repeated mounts must not accumulate document/window handlers → stable registration + cleanup / anonymous rebind → 100 navigation cycles → no duplicate button actions or memory growth.
181. Observer lifecycle → disconnect/unobserve when scope ends → explicit cleanup / retained DOM references → heap/navigation test → long sessions avoid leaks.
182. Timer lifecycle → clear intervals/timeouts on component teardown and state replacement → owned timer registry / immortal timers → tab-switch stress → MEL avoids hidden background work.
183. Media lifecycle → audio/avatar streams need pause/stop/release rules when unused while preserving explicit active playback → resource state machine / always-on decode/render → hide/tab test → voice/avatar stop consuming resources unnecessarily.
184. Asset lazy load → heavy avatar/audio/editor assets load on demand with tested fallback → contextual import / eager shell or broken lazy chunk → cold-open each feature → first interaction stays fast and capabilities remain intact.
185. Code splitting granularity → chunks should align with real feature boundaries; excessive splitting adds waterfall overhead → measured feature chunks / one chunk per tiny module → cold/warm waterfall trace → MEL chooses useful, not ideological, splitting.
186. Prefetch strategy → prefetch only likely next capabilities under resource budget → intent/idle hints / prefetch everything → low-bandwidth test → speedup does not recreate eager-loading cost.
187. Image sizing → reserve intrinsic dimensions and serve appropriately sized assets → width/height/srcset / oversized image + layout shift → LCP/CLS gate → avatar/project imagery does not destabilize UI.
188. Decode cost → compressed bytes are not the whole image cost → measure decoded/rendered dimensions / optimize transfer only → memory trace → MEL avoids giant decoded textures on mobile.
189. Payload projection → APIs should return fields needed by current view → explicit projection / giant universal status blob → payload-size contract → MEL status refresh stays light.
190. Pagination → large histories use bounded pages/cursors and stable ordering → cursor pagination / full dump or unstable offset under writes → concurrent insert pagination test → Activity/chat scale without gaps/duplication.
191. Incremental sync → after baseline, request changes since a version/cursor where semantics support it → versioned delta / refetch entire corpus → mutation-volume benchmark → MEL reduces repetitive status/history transfer.
192. Compression threshold → compress text when savings exceed CPU/latency overhead; tiny payloads may not benefit → measured threshold / compress universally → size/CPU matrix → Worker CPU is spent where useful.
193. PerformanceObserver → collect supported performance entries asynchronously → observer with supported-entry check / synchronous instrumentation everywhere → browser compatibility gate → MEL measures interactions without excessive instrumentation overhead.
194. User timing → mark meaningful MEL operations, not every function → task-level marks / instrumentation flood → trace readability gate → diagnostics tie latency to chat/tab/upload actions.
195. Tail latency → p50 alone hides stalls → track p95/p99 alongside errors and request counts / average-only → representative benchmark → UI optimization targets freezes users actually feel.
196. Interaction latency → expensive handlers need event-to-render measurement → interaction timing + task attribution / click handler duration guess → slow-control fixture → button responsiveness is measurable.
197. Memory trend → one snapshot misses leaks → repeated operation/GC-aware trend / single heap sample → 100-cycle navigation/chat test → MEL detects retained listeners/nodes/streams.
198. Observability overhead → telemetry must be sampled/bounded and redact sensitive data → structured sampled metrics / verbose payload logging → load+secret-canary test → measurement does not become a performance/privacy defect.
199. Performance budget → establish route/tab budgets for bytes, requests, DOM nodes, CPU and tail latency, calibrated to capability → explicit budget / vague “fast” → CI benchmark threshold → regressions become actionable.
200. Optimization acceptance → no optimization is PASS until functional parity plus measured gain and no new accessibility/correctness regression → before/after behavioral+performance suite / remove capability to hit metric → candidate gate → MEL becomes lighter without losing functions.

## Deduplication and transfer status
This block deepens cycles 144–150 rather than recounting them: it adds Worker startup/CPU distinctions, streaming/background-work ownership, cache cost semantics, polling lifecycle details, media/assets, observer/timer cleanup, payload/delta strategies, measurement and acceptance budgets. Tree inspection at HEAD `709bf39c...` showed no visible `MEL_TRANSFER_*_10000.md` package in the retrieved repository tree; none was ingested.

## Audit implications
Next executable focus: inspect MEL shell and feature tabs for top-level heavy initialization, duplicate GETs, polling overlap/visibility behavior, listener/timer/observer/media cleanup, oversized status payloads and full-history rendering. Measure before patching. A capability may be deferred, cached or virtualized, never deleted merely for speed.

## Run record
- head_initial: `709bf39c3e28887232f7cd4e0af84e6ca6fbe939`
- pre-write HEAD: `709bf39c3e28887232f7cd4e0af84e6ca6fbe939`
- cycles completed: 151–200 (50 genuine additive cycles)
- counter: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_200/10000`
- transfer packages ingested: none
- code defects patched: 0
- runtime stress tests: 0 (repository connector does not expose candidate runtime execution)
- production changed: NO
- release tag moved: NO
- production workflow triggered: NO
- remaining_open: 9800 cycles; reconcile progress ledger; inspect and repair first proven UI/performance defect; functional audit; candidate stress; ShardVault full external recovery proof
- next_exact_fix: inspect candidate frontend initialization, polling and long-list rendering on fresh HEAD; select one measured defect; patch minimally with behavioral parity test plus request/DOM/latency evidence before recording validated XP.

XP MEL checkpoint: `XP MEL : NON` — research-backed performance rules were documented but no runtime-validated code repair was completed in this block, so no lesson is duplicated into the development XP pack.
