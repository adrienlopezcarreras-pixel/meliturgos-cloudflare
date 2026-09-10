# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Baseline HEAD inspected: `95025835b3c3582f5362612749fa228a6b98c78d`

## Integrated / already contained

- `candidate/mel-ui-selfaware-integration` — ALREADY_CONTAINED. No selective recovery is currently justified without a reproducible missing behavior.
- `candidate/augmentio-core` — ALREADY_CONTAINED. Clean remains the branch of record for continued candidate work.
- `candidate/dev-bridge-fetch-fix` / PR #5 — ALREADY_CONTAINED. The local bridge transport/capability-registration fixes are already part of the clean lineage.
- `candidate/device-control-core` / PR #4 — INTEGRATED_BY_COMPARISON, not by blind branch merge. Keep the fail-closed device-control policy/tests already present; do not cherry-pick the divergent branch wholesale.
- `candidate/mel-work-02-state-final2` — ALREADY_CONTAINED. Git compare at baseline reports the old branch is 62 commits behind clean with 0 head-only commits/files.
- Mentor core is now ALREADY_CONTAINED on clean: `src/learning/mentor-engine.js`, `src/learning/mentor-memory.js`, `DB_SCHEMA_VERSION=6`, additive `mentor_lessons` migration and focused `tests/mentor-engine.test.mjs` are present.
- `.github/workflows/full-candidate-ci.yml` already includes `candidate/mel-clean-autonomy`.

## To recover selectively

- `feature/mel-autonomy-mentor` / PR #6/#7 lineage — REFERENCE_ONLY / TO_RECOVER_SELECTIVELY. Current comparison is highly divergent (53 head-only commits vs 272 clean-only). MentorEngine/Memory/schema/tests are already present on clean, so do not recover those again. Remaining head-only surfaces (fast/long chat, self-awareness, UI/theme assets, runtime glue) require file-by-file proof of a missing behavior before recovery.
- `hotfix/prompt-limit-100k` — REFERENCE_ONLY. The current MVP composer already uses `maxlength="100000"`; do not import the stale package/script unless a reproducible runtime limit gap is found.
- `release/mel-2026-09-10-r3-3` — REFERENCE_ONLY / TO_COMPARE_SELECTIVELY. Fresh comparison at baseline: 10 release-only commits, 79 clean-only. Release-only files touch autonomy/Teacher Bridge/GitHub-code fallback/Work DAG state; recover only a specific behavior backed by a failing test. Never replace candidate with release.
- PR #7 — REFERENCE_ONLY. It points to `feature/mel-autonomy-mentor` and must not be merged wholesale into the now much more advanced clean branch.

## Confirmed interface gaps at baseline

- `src/pages/mvp-interface.js` still exposes a visible `Compétences` button and a `skillsPanel`; this conflicts with the preserved final-interface requirement that the button/panel be removed.
- The MVP currently exposes only `classic`, `crusade`, and `religious`; the requested `Aviation 1940s` and exact UI name `Paladin Light Full Plate` are not yet implemented in the current clean file.
- Existing 100000-character composer behavior is present and must be preserved.
- Existing avatar, voice, file-drop and theme persistence behavior must not regress while fixing the above.

## Abandoned / superseded

- Any historical `Dark Full Plate` theme instruction — ABANDONED and superseded by exact UI theme name `Paladin Light Full Plate`.
- Blind cherry-picks or whole-branch merges from divergent mentor/device/release branches — ABANDONED METHOD.
- Re-implementing MentorEngine/Memory/schema v6 that are already present and tested — ABANDONED DUPLICATION.

## Conflict / verification rules

- Production/release/DNS/secrets/bindings/auth/billing remain untouched.
- Unknown added cost is fail-closed.
- D1 changes must be additive only; no automatic rollback.
- Before each write: refetch `candidate/mel-clean-autonomy` and never overwrite an advanced HEAD.
- Recovery unit is the smallest missing file/function/test, followed by targeted tests and exact-SHA `full-candidate-ci` verification.

## Next concrete block

Fix only the confirmed MVP interface gaps: remove the `Compétences` button/panel and its dead runtime fetch path, then add `Aviation 1940s` and `Paladin Light Full Plate` as non-destructive themes with existing-avatar fallback, persistent selection, idle/overlay styling and anti-regression tests. Preserve the 100000-character composer, current avatars, voice, file drop and existing three themes.
