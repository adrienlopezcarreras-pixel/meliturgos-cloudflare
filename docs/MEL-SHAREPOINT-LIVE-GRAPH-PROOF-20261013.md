# MEL SharePoint — live Graph proof and truth correction (2026-10-13)

## Exact production read proof, not an inferred link state

Owner-only same-repository diagnostic workflow was invoked with the existing
exact-SHA parallel-proof protocol (`MEL_BACKUP_ENCRYPTION_KEY_B64`), derived
for the current `release/mel-hardware-v0.1.0` SHA. The production
`/api/gen2/code/self-check` returned HTTP 200, confirming authentication.

- First real run: [38356522098](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38356522098).
- Follow-up read-only status audit: [38356634878](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38356634878).
- Native Microsoft SharePoint `POST /api/gen2/connections/microsoft/test` with `connector_id=microsoft-sharepoint`: **HTTP 409**, `CONNECTION_TOKEN_NOT_AVAILABLE`.
- Pipedream account inventory: **HTTP 200**, linked `sharepoint` account **true**.
- Pipedream test `POST /api/gen2/connections/pipedream/test` with `probe=sharepoint_sites_read`: **HTTP 200**, `ok:true`, but `graph_site_read_proven` was NOT true, `read_only` was NOT true and `private_content_returned` was NOT false. The response thus appears to be a generic connection test rather than the explicit Graph site search supported by candidate code.
- **NO** authentic Microsoft Graph site-read proof was obtained from either connection path. No site IDs, tenant names, OAuth credentials, returned files or Graph content were logged.

## Corrected false-positive in pending production proof

PR #1228 workflow `.github/workflows/live-connections-production-proof.yml` previously considered **any HTTP 200 with `ok:true`** sufficient for `microsoft_sharepoint_pipedream_graph`. The actual production test demonstrates this is an unsafe success rule.

The fixed probe now requires:
- **Native:** `ok:true`, exact `connector_id=microsoft-sharepoint` and `live_probe:true`.
- **Pipedream:** `ok:true`, `graph_site_read_proven:true`, `read_only:true` and `private_content_returned:false`.
- HTTP 200 alone, a healthy linked account, project discovery, or credentials health does **not** count.
- The workflow marks the required proof **incomplete** and increases `failure_count` when SharePoint Graph reading has not been verified, even if the account remains linked.
- `tests/sharepoint-live-proof-gate.test.mjs` actually executes the proof validator against generic-200 and explicit-success fixtures. [Contract run #38356975202](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38356975202): 21 passed, 0 failed, production-proof skipped on the PR as intended.

## Remaining real blockers

1. Current production still does not provide the exact explicit Pipedream Graph proof introduced in the unmerged candidate PR. Neither a contract CI green nor a linked account provides this.
2. Preview candidate deployment is blocked on **Cloudflare D1 account authorization**, independently confirmed by read-only PR #1256: token active but D1 list and isolated database GET denied. The owner must scope the existing CI token to the correct Cloudflare account, with D1 Read for the preflight and D1 Write for preview migrations. Do **not** substitute production D1/R2.
3. After isolated preview migration and exact-SHA smoke succeed, test the same real Graph GET against the candidate implementation, review work/school Microsoft account and `Sites.Read.All` if Graph 403 occurs, then separately authorize rollout. Until then `sharepoint_graph_read_proven=false`.
4. The one-off proof workflow was intentionally retired after collecting evidence, avoiding repeated probes on every PR update.

MAX remains off. No GPU, production deployment, SharePoint file edit or public LoRA promotion was carried out by this investigation.
