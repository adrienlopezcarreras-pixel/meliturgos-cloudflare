# MEL — Cross-domain Expert +10 000

**MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_150/10000 — IN_PROGRESS**  
Started: 2026-09-20. Additive to the two completed 1000-cycle AI-engineering tracks. This corpus is knowledge, not model-weight training and not validated implementation XP. A lesson becomes validated XP only after real application, tests and runtime proof per `.agents/XP_PROTOCOL.md`.

## Provenance — blocks 001–100
Cycles 001–100 are preserved in Git history through commit `aca6fc4e42bf8720da99f9a8917566af23ba03fe`. They cover observable postconditions, deadlines/retries/idempotency, Cloudflare state/concurrency, frontend performance/accessibility, supply-chain provenance, grounded communication/RAG, ShardVault recovery, game/audio/publishing/narrative/BD/e-commerce/archival methods. This compacted checkpoint avoids repeatedly expanding old material while retaining immutable provenance in Git.

## Provenance — block 101–150
Primary/recent references reviewed for this block: Cloudflare Browser Run official docs (updated 2026-08-11), Cloudflare Playwright docs (2026-04-21) and Live View docs (2026-09-14); OWASP API Security Top 10 2023; WordPress REST API Handbook; RFC/HTTP conditional-request principles; current browser hardware API documentation. Repository search found no `MEL_TRANSFER_*_10000.md`; none ingested. These are transferable principles, not implementation claims.

## Cycles 101–150
Each cycle records precise theme → principle → limit/counterexample → falsifiable gate → concrete MEL implication.

101. Browser task modality → use stateless quick actions for one-shot extraction and sessions for interactive state → sessions add lifecycle cost → same task via both modes → MEL routes to cheapest adequate primitive.
102. Browser session reuse → reconnect to an acquired session when continuity matters → stale sessions must not become hidden global state → disconnect/reconnect fixture → browser jobs persist explicit session IDs.
103. Browser lifecycle ownership → distinguish disconnect from terminating remote session → library semantics differ → session-count before/after close → no leaked Browser Run sessions.
104. Browser bot identity → automation remains identifiable as bot even with custom UA → UA spoofing is not anti-bot bypass → protected-site fixture → MEL reports access limitation rather than evasion.
105. Browser navigation deadline → navigation/action assertions share a bounded task deadline → page-level defaults can accumulate → blackhole page test → Collector/browser jobs terminate predictably.
106. Browser selector resilience → prefer semantic roles/labels/test IDs over brittle DOM depth → third-party pages may lack semantics → controlled DOM mutation → MEL UI tests survive cosmetic changes.
107. Browser action postcondition → click PASS requires observed state/effect → click dispatch alone is insufficient → no-op handler fixture → deep UI audit validates effect.
108. Browser download integrity → await completed download, size/type/hash where expected → filename alone is weak → truncated download fixture → export/download controls prove artifact integrity.
109. Browser upload integrity → verify server/UI acknowledgement and reread metadata → setting input files is not completion → rejected-file fixture → uploads prove persistence.
110. Human-in-loop boundary → expose live session for genuinely ambiguous/manual steps → manual takeover must not silently corrupt automation state → takeover/resume test → MEL records ownership transitions.
111. Screenshot evidence → screenshots support visual state but not hidden persistence → pixels cannot prove backend mutation → visual/backend disagreement fixture → audit bundles pair screenshot with authoritative reread.
112. Browser context isolation → separate cookies/storage by task/security principal → shared contexts can leak identity → two-user fixture → MEL scopes contexts explicitly.
113. SSRF boundary → server-side URL fetching validates destination and redirects → public URL syntax does not guarantee safe resolved target → redirect-to-private fixture → research/import endpoints enforce egress policy.
114. Third-party API distrust → validate external responses as hostile input → provider reputation is not validation → malformed oversized payload → MEL tools enforce schema/size/deadline.
115. API object authorization → authorize each referenced object, not merely endpoint access → authenticated user may still target another object → cross-user ID test → D1/R2 object routes bind ownership.
116. API property authorization → whitelist mutable/visible fields by role → valid object access does not imply every property → mass-assignment fixture → PATCH handlers reject protected fields.
117. Function authorization → admin/operator actions need explicit server-side checks → hidden UI buttons are not controls → direct endpoint test → MAX/Teacher/hardware operations enforce role.
118. Resource consumption → bound body size, pagination, concurrency and expensive operations → rate limit alone misses single huge request → adversarial-size test → diagnostics/import/search have budgets.
119. Sensitive-flow abuse → protect high-impact workflows from automation misuse even when requests are valid → not every repetitive action is malicious → burst business-flow fixture → costly/autonomous actions get quotas/guardrails.
120. API inventory → deployed endpoints/versions/debug surfaces are enumerated → source routes alone may differ from deployed config → preview crawl + route manifest → launch gate detects accidental debug endpoints.
121. HTTP conditional update → use validators/version preconditions to prevent lost update → ETag is useful only if tied to authoritative representation → concurrent writers fixture → settings/config writes fail safely on stale version.
122. Optimistic concurrency UX → conflict response preserves user work and offers reconcile → blind last-write-wins hides loss → simultaneous edit fixture → MEL surfaces candidate HEAD/state races explicitly.
123. Hardware capability discovery → enumerate support before action → browser/device APIs vary by platform/permission → unsupported-device fixture → hardware UI reports capability, not generic failure.
124. Hardware permission gesture → permission prompts often require explicit user activation → background autonomy cannot assume grant → no-gesture fixture → MEL separates setup from autonomous reuse.
125. Device identity stability → transient device handles are not universal durable IDs → reconnects/OS changes occur → unplug/replug fixture → hardware registry stores robust descriptors plus rebind path.
126. Serial framing → protocol needs explicit message boundaries/checks → raw byte chunks need not equal messages → fragmented/coalesced chunk fixture → MEL parser is streaming and bounded.
127. Serial backpressure → writers respect stream readiness/queue pressure → uncontrolled writes can exhaust buffers → slow-device fixture → commands are queued with deadline.
128. Hardware checksum → detect transport corruption where protocol supports it → checksum is not authentication → bit-flip fixture → MEL distinguishes integrity from trust.
129. Hardware command idempotency → retries must not duplicate unsafe physical effects → some commands are inherently non-idempotent → lost-ack fixture → command protocol uses operation IDs/status query where possible.
130. Hardware fail-safe state → disconnect/timeout yields defined safe behavior → software cannot guarantee safety absent device support → cable-pull test → MEL documents device-side safe state.
131. Mobile viewport correctness → test dynamic viewport, zoom and keyboard occlusion → desktop responsive emulation misses real input behavior → small-device keyboard fixture → chat controls remain reachable.
132. Touch semantics → pointer/touch actions avoid hover-only affordances → desktop can retain hover enhancement → touch-only traversal → all MEL functions remain discoverable.
133. Input latency budget → heavy handlers move work off immediate interaction path → async deferral cannot delay critical feedback indefinitely → long-task instrumentation → UI acknowledges action quickly then reports progress.
134. Progressive rendering → critical shell/status first, heavy diagnostics on demand → lazy loading must not hide errors → cold-load/open-panel fixture → MEL keeps capability while reducing startup work.
135. Request cancellation → superseded searches/polls abort obsolete fetches → committed mutation cannot be uncommitted by AbortController → rapid-query fixture → Collector/search avoid stale response overwrite.
136. Poll coalescing → multiple panels share equivalent status reads → security/scope differences prevent unsafe coalescing → multi-panel network trace → MEL reduces duplicate GETs.
137. Visibility polling → hidden document throttles noncritical polling → server-side safety monitoring remains independent → background-tab trace → UI stops hidden churn without disabling autonomy.
138. Large-log virtualization → retain data while rendering bounded visible window → browser find/accessibility need deliberate support → 50k-event fixture → Activity remains responsive with search/export separate.
139. Memory leak gate → repeated mount/action/unmount reaches stable retained-memory envelope → caches may intentionally warm → long-session heap checkpoints → MEL catches listener/object URL/session leaks.
140. WordPress REST fit → use REST when structured external/client integration benefits; do not force it for every theme/plugin task → simpler native server rendering can be preferable → compare implementation path → MEL chooses integration by need.
141. WordPress capability checks → REST mutations require nonce/auth plus server-side capability authorization → authenticated request is not sufficient → low-role mutation fixture → VI Édition automation respects WP roles.
142. WordPress pagination discipline → bounded page sizes and explicit traversal → requesting giant collections harms latency → large-catalog fixture → catalogue sync checkpoints cursors/pages.
143. WordPress idempotent product sync → stable external key prevents duplicate products on retry → titles/SKUs can change → replay sync fixture → automation reconciles instead of blindly creating.
144. Media derivative awareness → WordPress may create multiple image sizes → original-only assumptions inflate pages or break references → upload + responsive-render test → editorial assets use generated sizes deliberately.
145. Research source hierarchy → primary/current sources lead technical claims → community sources can reveal failure modes but not override authoritative specs → conflicting-source fixture → MEL labels evidence role.
146. Fact/interpretation separation → distinguish sourced fact, inference and recommendation → even primary sources can omit context → claim ledger review → research outputs expose uncertainty.
147. Citation atomicity → citation should entail the smallest meaningful claim cluster → one citation after a dense paragraph can overclaim → sentence-level audit sample → MEL research QA checks entailment.
148. Freshness policy → volatility determines refresh interval → immutable RFC/history does not need news cadence → mixed-source corpus → research router assigns freshness class.
149. Evidence minimization → collect only evidence needed for proof, redact secrets/PII → exhaustive logs can create privacy/security risk → incident bundle review → MEL diagnostics default to minimized artifacts.
150. Recovery rehearsal → recovery procedure is validated by isolated restore and functional checks → documentation/backups alone are not readiness → timed restore drill → MEL launch evidence requires recoverability, not backup presence.

## Deduplication notes
Cycles 101–150 add browser automation/session semantics, API authorization/abuse controls, hardware protocol robustness, mobile/frontend runtime performance, WordPress operational patterns and research evidence discipline. General timeout/idempotency/observable-effect concepts from 001–100 are reused only where a domain-specific failure mode or gate is added.

## Transfer ingestion
No `MEL_TRANSFER_*_10000.md` package was discoverable at this checkpoint. Continue periodic search and ingest only generalized, provenance-bearing methods; never raw private autobiographical material.

## Next block
Continue at `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_151/10000`. Prioritize MCP/tool schemas, model routing/evals, Cloudflare D1/R2/Queues/DO/Workflows failure semantics, security/release supply chain, then inspect code-linked open defects. Before every write reread candidate HEAD and abort/reconcile if moved.