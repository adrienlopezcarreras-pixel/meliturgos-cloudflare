# MELITURGOS autonomy checkpoint — 2026-09-14 00:46Z

## Source of truth

- Repository: `adrienlopezcarreras-pixel/meliturgos-cloudflare`
- Canonical candidate: `candidate/mel-clean-autonomy`
- Roadmap: `src/roadmap/master-roadmap.js`
- Verified implementation SHA before this checkpoint: `10b87c9a8bd5e33bfbb512e8593ffc63c3fadcaa`
- Exact `full-candidate-ci` run for that implementation SHA: `34793683922` — **SUCCESS**
- Production changed: **NO**

## Work completed in this run

A defect was found in the new evidence-gated XP journal. A checkpoint without durable proof, or a regression in the measured report, could still persist `xp_after = progress.xp`. That meant the next checkpoint could use an unproven or lower value as its canonical baseline.

The canonical XP writer now:

1. recomputes observed XP only from `buildLearningProgress`;
2. awards a delta only when observed XP is strictly greater than the previous canonical XP and at least one durable proof artifact is attached;
3. persists `xp_after` monotonically — no proof or regression keeps `previousXp` unchanged;
4. records the raw measurement separately as `observed_xp`;
5. preserves the ability to award a later, genuinely proven gain from the last canonical value.

Files:

- `src/learning/xp-journal.js`
- `tests/learning-xp-journal.test.mjs`

Commits:

- `0d040b329d9aaece445830e6256a5b141bf9b4e9` — monotone XP persistence fix
- `10b87c9a8bd5e33bfbb512e8593ffc63c3fadcaa` — regression/no-proof/recovery tests

## Learning / XP truth

This is a real learning-governance improvement with code, tests and exact full CI evidence. No absolute runtime XP number is invented by this checkpoint. A numeric XP gain may only be persisted when the canonical writer is called against real LearningEngine/MentorMemory state with durable proof artifacts.

`neural_weights_changed = false` for this run. No LoRA/QLoRA or other model-weight training is claimed.

## Drive backup

External backup structure is active under `MELITURGOS/` with `XP/`, `Checkpoints/` and `Reports/`. The CI report and XP evidence for this run are saved there. No secrets are stored in Drive.

## Remaining high-priority work

- Run the canonical XP writer against real runtime learning state and persist only a proven delta.
- Continue GEN2-17/MEL autonomy runtime closure without bypassing stale-SHA, Teacher, Council or full-CI gates.
- Continue benchmark canonical integration and connect it to persisted baseline/candidate score comparisons used for evidence-gated XP.
- Continue the real-training prerequisite pipeline; do not claim changed weights until a real versioned adapter/checkpoint exists with before/after benchmark evidence and rollback.
