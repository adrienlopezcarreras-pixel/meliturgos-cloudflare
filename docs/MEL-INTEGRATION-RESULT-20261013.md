# MEL candidate/main isolated integration result — 2026-10-13

## Evidence
- Isolated provisional merge workflow: https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38451196187
- Working branch: `integration/mel-main-candidate-20261013`
- Git created local experimental merge commit `93104401...` in ephemeral Actions runner, **not pushed**.
- Four actual file conflicts / six conflict markers identified by read-only merge diagnosis: https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38450980830.
- Merge strategy in experimental runner: `git merge --no-commit --no-ff -X ours origin/main`, preserving candidate lines only where divergent hunks conflict, while auto-merging other changes. This strategy requires behavioral review for the preview relay vs isolated mirror selection.
- Initial targeted validation showed 20 passing and one failure (duplicate `d1Export` declaration in generated merged test).
- Second targeted validation fixed duplicate test declaration in ephemeral runner and **31/31 tests passed**.
- Push was rejected by GitHub: `refusing to allow a GitHub App to create or update workflow .github/workflows/deploy-candidate-preview.yml without workflows permission`.
- Consequently, **no new merge commit was published**, and neither `main`, candidate, nor production were modified by the attempt.

## Blocker and next gate
Use an authorized owner-controlled checkout or a narrowly scoped credential that is explicitly permitted to update workflow files, to reproduce and review the merge and publish **only** to the integration branch. Do not weaken access policies or reuse opaque secrets. Review both alternative ShardVault preview mirror/relay implementations before finalizing any conflict decisions.

Then run full CI, new exact-SHA isolated preview, full 7/7 external ShardVault proof, three-loss recovery stress and production readiness on the newly published SHA. Leave MAX OFF and do not promote production or touch MINI/APK/Companion.
