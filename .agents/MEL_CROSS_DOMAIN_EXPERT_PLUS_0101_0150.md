# MEL Cross-domain Expert PLUS — cycles 101–150

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_150/10000`

Provenance: additive block prepared from candidate HEAD `7c47479178334cd913bb45100d4178dfe50439de`. No production action is authorized by this file. No private autobiographical material is included.

## Primary sources
- Cloudflare Workers Best Practices (2026): https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- OWASP API Security Top 10 2023: https://api-security.owasp.org/editions/2023/en/0x11-t10/
- OWASP API4 Resource Consumption: https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/
- OWASP API10 Unsafe Consumption: https://api-security.owasp.org/editions/2023/fr/0xaa-unsafe-consumption-of-apis/
- GitHub Actions Secure Use: https://docs.github.com/en/actions/reference/security/secure-use

Format: problem → principle/limit → pattern/anti-pattern → gate → concrete MEL implication.

101. Large Worker bodies → stream when possible; Workers memory is finite → TransformStream / full-body buffering → oversized response fixture → Collector/import paths avoid memory spikes.
102. Bounded request input → validate size before consuming bodies; streaming does not excuse unlimited input → explicit byte cap / blind arrayBuffer → over-limit upload → MEL upload fails safely and visibly.
103. JSON payload bounds → semantic limits matter beyond Content-Length → field/array caps / arbitrary nested payload → pathological JSON fixture → APIs resist resource exhaustion.
104. Secure identifiers → security tokens require Web Crypto randomness → randomUUID/getRandomValues / Math.random → token-quality static gate → sessions/jobs avoid predictable IDs.
105. SSRF boundary → user-controlled URLs are network authority → allowlisted schemes/hosts plus address policy / raw fetch(userUrl) → private/link-local target cases → MEL web/import tools cannot become generic SSRF pivots.
106. Redirect SSRF → initial URL validation is insufficient when redirects change destination → bounded redirect validation / blind follow → redirect-to-private fixture → remote fetch validates every hop.
107. DNS/rebinding caveat → hostname allowlist alone may not prove destination stability → constrain destinations and platform egress semantics / string-prefix trust → hostile hostname fixture → external-target tooling treats destination validation as a security invariant.
108. Third-party API trust → external responses remain untrusted input → schema/size/type validation / trusted-provider bypass → malformed upstream fixture → MEL connectors fail closed on invalid structures.
109. Third-party timeout → integrated service can hang → AbortSignal deadline / unbounded fetch → blackhole fixture → ShardVault and tools fail over within budgets.
110. Third-party response size → valid endpoint can return excessive data → streaming/cap / response.text without bound → giant upstream fixture → research/import cannot exhaust Worker memory.
111. API object authorization → authentication does not prove object access → object-level authorization / ID possession equals permission → cross-object fixture → memory/files/jobs enforce ownership.
112. API property authorization → writable/readable fields require policy → explicit DTO projection / spread request into DB → forbidden-field mutation → MEL APIs block privilege/property escalation.
113. Function authorization → admin/runtime controls need server-side checks → capability/role gate / hidden button as security → direct endpoint call → MAX/diagnostic/destructive controls are protected independently of UI.
114. Authentication failure → auth errors must not degrade to anonymous privileged behavior → fail closed / fallback identity → expired token fixture → candidate controls reject ambiguous identity.
115. Sensitive flow abuse → legitimate endpoint can still be abused at scale → per-operation budgets / only global rate limit → repeated expensive job fixture → autonomy has bounded starts and costs.
116. Resource consumption → cap time, memory, upload size, records and batch operations → endpoint-specific quotas / unlimited pageSize → adversarial limit matrix → zero-spend and stability become executable gates.
117. Pagination input → client page size is a request, not authority → server maximum / trust `limit` → huge limit fixture → Activity/RAG/list endpoints stay bounded.
118. Batch input → batch count and per-item size both need caps → two-dimensional limits / only total bytes → many tiny items fixture → bulk import cannot amplify work unboundedly.
119. Concurrency admission → rate limiting alone may allow too many simultaneous expensive jobs → active-job semaphore/queue / requests-per-minute only → burst concurrency test → expensive MEL operations remain bounded.
120. Cost-bearing integrations → external calls can create monetary cost even without CPU exhaustion → explicit disabled-by-default spend paths / retry storms → simulated billing counter → zero-expense invariant is testable.
121. API inventory → unknown/deprecated endpoints expand attack surface → generated route inventory / undocumented leftovers → route diff gate → audit covers every MEL endpoint.
122. Debug endpoints → diagnostics can expose secrets or mutation powers → auth + redaction + environment guard / public debug route → unauthenticated probe → diagnostics remain useful without becoming backdoors.
123. Error leakage → stack traces and upstream secrets are not user diagnostics → typed public errors + private structured logs / raw exception body → secret-bearing failure fixture → MEL UI gets actionable but safe errors.
124. Secret logging → observability must exclude credentials/tokens → structured redaction / stringify request headers → canary-secret scan → audit logs do not leak secrets.
125. GitHub Action immutability → third-party actions should be pinned to full commit SHA → immutable SHA / mutable tag → workflow lint → candidate CI supply chain is reproducible.
126. Action provenance → full SHA still needs correct upstream provenance → verify repository/source / copy SHA from fork blindly → dependency review → CI trust is explicit.
127. Workflow permissions → token permissions should be least privilege → job-level permissions / broad write-all → workflow policy test → candidate tests cannot mutate releases unnecessarily.
128. Untrusted PR context → secrets and write tokens must not execute untrusted code → event separation / privileged pull_request_target checkout → malicious PR fixture → CI does not turn review into code execution with secrets.
129. Artifact identity → passing CI artifact must bind exact commit → embed/verify SHA / latest artifact → mismatch fixture → preview evidence corresponds to candidate HEAD.
130. TOCTOU before write → branch may move after research/preparation → reread HEAD immediately before mutation / stale write assumption → simulated concurrent commit → automation aborts/reconciles rather than overwriting.
131. No force-push → history safety is part of collaborative correctness → append/rebase/reconcile / force rewrite → branch policy/manual check → concurrent MEL work is preserved.
132. Release separation → candidate success is not production approval → explicit immutable release gate / auto-promote green CI → green-preview scenario → production remains unchanged without approval.
133. Capability truth → endpoint existence is weaker than behavioral success → round-trip effect/readback / HTTP 200 equals PASS → no-op handler fixture → MEL self-knowledge reflects proven capability.
134. UI truth → click acknowledgement is weaker than persisted effect → action→handler→effect→readback→render / toast-only PASS → reload-after-action test → controls report durable reality.
135. Cancellation truth → AbortController stops local waiting, not necessarily remote work → durable cancel state when backend continues / assume abort means stopped → abort-and-observe → Activity distinguishes request cancellation from job cancellation.
136. Retry ownership → nested layers retrying multiply load → one explicit retry owner per boundary / client+API+queue all retry → failure-count gate → outages do not create retry explosions.
137. Retry jitter → synchronized retry causes thundering herd → capped exponential backoff with jitter / fixed interval → concurrent-failure simulation → external target recovery spreads load.
138. Deadline composition → per-attempt timeout must fit global operation deadline → remaining-budget propagation / N attempts each full global timeout → slow-target matrix → ShardVault terminates predictably.
139. Circuit breaking → repeatedly failing dependency should get temporary relief; breaker must allow recovery probes → bounded open/half-open / permanent disable or hammering → outage/recovery fixture → target failover is responsive and self-healing.
140. Bulkhead isolation → one failing integration should not consume all concurrency → per-provider pools / shared unbounded pool → one-provider stall → MEL retains other capabilities during partial outage.
141. Cache authorization → cache keys must include security-relevant variance → scoped key / cache authenticated response globally → two-user fixture → cached memory/status cannot cross identities.
142. Cache freshness → TTL is domain-specific, not universal → endpoint-specific freshness + invalidation / one TTL everywhere → mutation-after-cache test → status stays responsive without lying.
143. GET coalescing → identical concurrent reads can share work only when auth/context match → keyed in-flight promise / global URL-only coalesce → two-context fixture → UI reduces duplicate calls safely.
144. Visibility polling → hidden UI should suppress nonessential polling; critical jobs still need server-side progress → Page Visibility gate / constant browser polling → background-tab test → interface becomes lighter without losing autonomous execution.
145. Poll overlap → interval can launch a new request before prior completion → single-flight + abort/staleness guard / setInterval fire-and-forget → slow-network fixture → status polling cannot pile up.
146. Stale response race → older response may arrive after newer state → generation/request token / last arrival wins → reordered responses → MEL UI cannot regress status.
147. Event listener lifecycle → repeated mounts can multiply handlers → stable registration + cleanup / anonymous repeated listeners → navigation stress → long-lived MEL UI avoids leaks and duplicate actions.
148. Lazy loading → defer heavy modules/assets until relevant; do not hide critical capability behind broken dynamic import → contextual import + fallback / eager everything or untested lazy chunk → cold-open each tab → lighter shell preserves functionality.
149. Content virtualization → large Activity/chat lists should render a bounded viewport while retaining accessible navigation/search → virtualized window + stable semantics / thousands of live nodes → 10k-row UI test → history remains usable without DOM bloat.
150. Performance proof → optimization requires before/after metrics and functional parity → p50/p95/p99 + memory + request counts + behavioral suite / subjective “faster” → representative mobile/desktop benchmark → MEL performance work never removes capability merely to improve speed.

## Deduplication and transfer status
These cycles extend prior 1–100 with API-security, Worker memory/streaming, supply-chain and concrete UI performance invariants. They do not re-count the earlier queue/R2/D1/DO lessons. Repository tree inspection at the preparation HEAD exposed no `MEL_TRANSFER_*_10000.md` package; no transfer package was ingested.

## Audit implications
Next executable focus: locate remote-fetch/import paths for SSRF/redirect/size/timeout gates; inventory API authorization and debug routes; lint Actions for immutable pins and least privilege; instrument UI request counts, overlapping polls, stale-response protection, listener cleanup and large-list rendering. Presence alone is not PASS.

## Run record
- head_initial: `7c47479178334cd913bb45100d4178dfe50439de`
- pre-write HEAD: `7c47479178334cd913bb45100d4178dfe50439de`
- cycles completed: 101–150 (50 genuine additive cycles)
- counter: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_150/10000`
- transfer packages ingested: none
- code defects patched: 0
- runtime stress tests: 0 (repository connector does not expose candidate runtime execution)
- production changed: NO
- release tag moved: NO
- production workflow triggered: NO
- remaining_open: 9850 cycles; merge this block into final thematic index/progress ledger; functional audit/repair; candidate stress; ShardVault 7/7 write+read and 4/7 reconstruction proof
- next_exact_fix: inspect candidate remote-fetch/import and UI polling code against cycles 101–150, patch the first proven behavioral defect with a targeted test, then run available candidate CI evidence before recording runtime XP.
