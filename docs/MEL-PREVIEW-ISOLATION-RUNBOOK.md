# MEL preview — isolation D1/R2 and fail-closed recovery (2026-10-11)

## Verified incident

The preview workflow on deployed candidate SHA `6c2912c1371f84d2d070691a0fc7928b70b09d0d` failed at `Initialize isolated preview D1`.
The sanitized Wrangler artifact `preview-d1-migration-diagnostic` reported:

- `Authentication error [code: 10000]` while accessing `meliturgos-preview-db`.
- The **Worker upload had already succeeded** before the D1 migration failed. This is the unsafe order corrected in the canonical candidate.
- The repository's preview Wrangler D1/R2 bindings had only `binding` and no explicit preview database ID / bucket name. Do not assume production IDs or resources are automatically safe to inherit.

## Guarded remediation — no automatic resource creation

When explicit preview identity variables are missing, the preflight first reads
the existing `meliturgos-preview` Worker settings through one bounded Cloudflare
GET request. It accepts only unique DB/D1 and MEDIA_BUCKET/R2 bindings, with
valid identifiers distinct from every production binding. It does not create
resources, expose settings/secrets, or change account permissions. Missing or
shared bindings and denied API access still stop before any mutation. Explicit
variables remain the operator override; configure them as below if discovery fails.

API reference: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/

1. In Cloudflare, identify an **existing, separate preview D1 database** and record its UUID. The account owner must verify that this UUID is different from the top-level production D1 UUID in `wrangler.jsonc`.
2. Identify an **existing, separate preview R2 bucket** (not the production `meliturgos-private-media` bucket). Its name must be different from the production binding.
3. Set GitHub Actions repository/environment variables (or secrets) `MEL_PREVIEW_D1_DATABASE_ID` and `MEL_PREVIEW_R2_BUCKET`. Never copy the production ID or production bucket.
4. Give the CI Cloudflare token the minimum required account-scoped D1 edit permission covering this isolated preview database. Cloudflare's D1 migration API may reject a Workers-only token even when `wrangler deploy --env preview` succeeds. Token change requires the owner; do not print or commit it.
5. The preview workflow validates the distinct UUID and bucket before the D1 migration, before R2 upload, and before any Worker deployment. It injects only the **preview** bindings into the ephemeral CI copy of `wrangler.jsonc`.
6. Re-run the preview through the approved canonical candidate; verify the D1 migration succeeded, preview HTTP smoke passed, and production Worker and resources were not mutated.

## Proof requirements

- Branch: `candidate/mel-clean-autonomy` only, exact SHA recorded.
- Guards `PREVIEW_D1_ISOLATED_UUID_REQUIRED` and `PREVIEW_R2_ISOLATED_BUCKET_REQUIRED` fail closed before any preview mutation.
- Do not mask HTTP 401/403 / Cloudflare 10000 as a healthy preview.
- Never run D1 migrations against the top-level production binding from this workflow.
- The D1 migration precedes R2 and Worker preview updates.
- `tests/preview-resource-isolation.test.mjs` verifies the contract.
- MAX stays disabled. No hardware flash or production release is authorized by a preview success.

References: [Cloudflare D1 environments](https://developers.cloudflare.com/d1/configuration/environments/), [D1 Wrangler migrations](https://developers.cloudflare.com/d1/wrangler-commands/), [Cloudflare API tokens](https://developers.cloudflare.com/d1/tutorials/import-to-d1-with-rest-api/).

## Expected blocked-state reporting

If `MEL_PREVIEW_D1_DATABASE_ID` or `MEL_PREVIEW_R2_BUCKET` is absent,
`Require isolated preview resource identities before any mutation` must fail.
This is an **operator configuration blocker**, not a broken SQL migration,
SharePoint bug, or failure of the already-green full candidate CI.

Diagnostic artifact uploads and preview-autonomy pause must only run when their
respective producing steps actually started. Skipped stages must not invent
missing D1/HTTP diagnostics or produce a secondary red job that obscures the
primary resource-identity error. Once those stages do execute, missing required
diagnostics remain errors.

No fallback to production resource identities is permitted. Do not mark the PR
release-ready until an authenticated isolated preview run completes on the exact SHA.

## Diagnostic confidentiality

The raw D1 migration output is retained only as a temporary runner-local log.
It is sanitized before any job-summary excerpt or uploaded diagnostic. The
preview HTTP artifact records only curl exit status, HTTP status and HTML byte
presence/length, never response headers, cookies or HTML body excerpts.
Missing expected diagnostics still fail when the producing stage actually ran.
