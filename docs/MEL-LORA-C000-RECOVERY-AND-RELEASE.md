# MEL LoRA — release 403 and verified c000 recovery (2026-10-12)

## Observed production-independent facts

- Kaggle run [38285093113](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38285093113) completed 32 real training steps and downloaded a training bundle. The exact-provenance verification passed.
- Its GitHub Release step returned HTTP 403 `Resource not accessible by integration`, although the job's `GITHUB_TOKEN Permissions` listed `Contents: write`. The overall run correctly recorded `FAILED`.
- Source SHA `635c4786b39b9c3a5458126d64ec7bb726a282e7` modifies seven `.github/workflows/` paths. This is important because GitHub requires **Workflows: write** on the release-authorizing token when the selected target differs from default-branch workflow content. GitHub Actions' built-in `GITHUB_TOKEN` does **not** support Workflows:write.
- The documented GitHub rule provides a likely root cause, not a successful re-test of the rejected write.
- Existing checkpoint **successfully recovered** using read-only Kaggle job [38302570850](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38302570850). Immutable GitHub Actions artifact ID `11771007059`, name `mel-lora-c000-existing-verified-checkpoint`, retains the verified 12.6 MB compressed bundle and proof for 30 days.
- Adapter SHA-256 `9c9957a6ab31b7c43f4ee0a3699b9d9292cbdd3fd3fd7368ace74657fb83f6aa`; bundle SHA-256 `1e15f90e19ab03c5067a543ec78b8bee9f3e29c25f23697fff3a98fad0c801b0`. Adapter weights are 13,648,432 bytes.
- `benchmark_verified:false`, `activated:false`, `local_uncensored_gate:false`. No production/model promotion is approved.

## One-time owner-controlled authorization (no secrets in chat, issues or files)

1. Provision a **narrowly scoped** GitHub fine-grained personal access token or authorized GitHub App token, restricted to `adrienlopezcarreras-pixel/meliturgos-cloudflare`, with repository **Contents: read/write** and **Workflows: read/write**, short expiry, no organization-wide or unrelated repository access.
2. Store it in GitHub Actions **repository secret** `MEL_LORA_RELEASE_TOKEN`; do not commit, print, send, or paste the token here. Review any organization/repository permissions and tag policies with the owner. Verify the owner can revoke it when the draft is published.
3. Revalidate PR #1253 on its final SHA. Before merging any code into `main`, ensure the `mel-autonomous-production-release` on-main push trigger cannot cause an unexpected production deploy. **Do not merge as a workaround for the release 403.**
4. The recovery release workflow `.github/workflows/archive-existing-lora-draft.yml` is **manual-only**, requires `confirm_draft_release:true`, uses the built-in `GITHUB_TOKEN` only to download existing artifacts, and requires the dedicated `MEL_LORA_RELEASE_TOKEN` for the historical-SHA release API write. No fallback to the built-in token.
5. When owner-authorized to run, it rechecks the fixed SHA-256s and prior proof, refuses any already-existing tag, and creates **only a draft release**. Never change `--target` to a main commit to evade workflow permissions: that would misrepresent provenance.
6. Confirm its end-to-end result through a real Actions run before calling publication successful. Publication in a draft does **not** imply benchmark success, promotion or LoRA activation. Do not start a new GPU run for this operation.

Note: manual `workflow_dispatch` in GitHub UI generally requires the workflow to exist on the default branch. If it is still only in PR #1253, don't claim that it is executable from the Actions UI; resolve the main-branch deployment guard separately or use an owner-approved external CLI workflow with the same immutable checks.

Official reference: https://docs.github.com/en/rest/releases/releases#create-a-release

## Strict scope

Keep MEL MAX disabled and production unchanged. This concerns the backend LoRA pipeline only, not MINI/APK. Cloudflare D1 preview rights and real SharePoint/capability proofs are separate outstanding blockers.
