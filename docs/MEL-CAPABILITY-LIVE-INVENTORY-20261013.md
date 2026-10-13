# MEL — production capability inventory and bounded execution, 2026-10-13

## Real deployed SHA and evidence

Deployed release SHA: `4f8b47542424a3f8942d21112c3fc891c4f37e64`, checked against production `/api/gen2/code/self-check`. No `main` merge, deployment, Cloudflare secret change, MAX activation, Kaggle GPU or persistent global stress was performed.

1. **Authenticated GET-only inventory:** [GitHub Actions #38363925576](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38363925576), succeeded (7 offline security tests pass, 0 fail), showing 165 registered and enabled runtime capabilities. Health labels: **109 HEALTHY, 48 DEGRADED, 8 UNAVAILABLE**. Risk: 103 LOW and 62 MEDIUM/HIGH. This is registry status; it is **not execution proof**. Neither `refresh=1` nor any explicit capability `execute` route was called by the inventory job. However, the exact-SHA `code/self-check` endpoint internally runs `code.read` through the capability bus, so the normal audit sink can persist an execution receipt to D1. GET-only means no requested business mutation, **not** guaranteed zero writes.
2. **Bounded semantic execution:** [#38364373413](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38364373413) succeeded (12 offline security tests pass, 0 fail), proving `echo`, `project.list`, `skill.list`, `timeline.list` on the same exact deployed SHA. The pipeline checks each record is LOW risk and enabled before running it, validates the echo result and the three list schemas, logs **no list contents**, and retains only capability identifiers. These operations are semantic reads/echo, but the **normal capability audit sink can write execution receipts to D1**; they are not a guarantee of zero database writes.
3. **Registry classification:** [#38364694840](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38364694840) succeeded and captured sanitized DEGRADED/UNAVAILABLE capability IDs, not private account or file content.

## Eight unavailable capabilities — all media

- `media.image.analyze`, `media.image.process`, `media.image.generate`
- `media.audio.transcribe`, `media.audio.synthesize`
- `media.video.analyze`, `media.video.process`, `media.video.generate`

They are `enabled:true` in the registry but their **initial health** is UNAVAILABLE. `src/capabilities/creative-media-capabilities.js` returns that status when no direct adapter, media Companion, or explicitly configured generation provider is available. `src/capabilities/default-bus.js` only injects zero-cost Workers AI adapters when their binding and proof are ready; missing a proven adapter must remain unavailable, not be relabeled as working. Procedural audio/music capabilities are separate.

## 48 degraded registry entries

The registry IDs are captured in the sanitized inventory artifact. Major categories include Google Workspace, GitHub/Cloudflare tooling, files, code, Council, browser/computer, and site access. `DEGRADED` does **not** prove a failed runtime call: for example, the authenticated `code/self-check` path executed successfully although the registered `code.read` initial health was DEGRADED. Each remaining issue needs a targeted execution proof with its own consent/safety constraints; the registry inventory alone cannot certify the service either way.

## Removed unsafe live stress mechanism

The pending candidate `.github/workflows/persistent-capability-stress-live-proof.yml` previously used `wrangler secret put` and `wrangler secret delete` for a temporary **production** `MEL_LAUNCH_BOOTSTRAP_TOKEN`. These mutations are unsafe and unrelated to the read-only evidence task. The production job is now deliberately **FAIL-CLOSED** with `PERSISTENT_STRESS_LIVE_PROOF_DISABLED_UNSAFE_PRODUCTION_SECRET_MUTATION`, until a separately authorized safe production stress runner is established. The pull-request contract-only checks remain available; they must never be mistaken for full 165-capability execution.

The four approved bounded capability executions **are not** the persistent full stress. Full stress remains NOT VERIFIED and must not be recorded as SUCCESS or DONE_VERIFIED based on this partial set.

## Follow-up priorities

1. For eight media entries, prove which direct adapter or free Workers AI model bindings are configured and authorized, or the media Companion binding. Do not invent an available provider or incur GPU/paid inference without permission.
2. For 48 DEGRADED entries, prioritize safe read-only targeted probes and explain authentication/provider readiness separately from a true runtime error; protect write and paid capabilities.
3. For SharePoint, Pipedream linked-account status is confirmed but Graph site search is **not yet proven** by production. Candidate strict proof guard is ready.
4. Preview D1 remains blocked on the configured Cloudflare account's read/write permission. No production D1/R2 fallback is permitted.
5. Enable a persistent full stress mechanism only after it no longer mutates Cloudflare production secrets and its exact authorization / cost / risk scope has independently passed security tests.
