# MEL parallel work protocol

This protocol is the coordination contract for all ChatGPT/Codex pages working on MEL.

## Shared source of truth

- Canonical candidate branch: `candidate/mel-clean-autonomy`.
- Production release branch: `release/mel-2026-09-10-r3-3`.
- Read both branch heads immediately before starting shared work and again immediately before promotion.
- `main` and feature branches are not substitutes for the canonical candidate unless an explicit migration is performed and validated.

## Before editing

1. Sync the work branch from the current canonical candidate SHA.
2. Declare the files/resources the page intends to edit. Shared files such as runtime entrypoints, roadmap registry, workflows and release wiring must have one active editor at a time.
3. Keep isolated feature work on its own branch/PR until it is rebased or rebuilt on the current canonical candidate.
4. Never force-reset the canonical candidate or release branch to an older tree.

## One candidate, one validation lane

Shared candidate workflows are triggered only by `candidate/mel-clean-autonomy`.
Feature branches may run their own non-deploying checks, but they must not deploy the shared preview or impersonate the canonical candidate.

Canonical sequence:

`code -> targeted tests -> full candidate CI -> Teacher/runtime smoke -> isolated preview -> roadmap evidence/status -> release`

A change is not `DONE_VERIFIED` merely because code exists. It needs the proof required by its contract. A release is allowed only from the exact candidate SHA/tree for which the three canonical gates are green.

## Promotion and collision rules

- Re-read the candidate and release heads immediately before promotion.
- If another page advanced the candidate, rebuild/reconcile the local lot on that newer tip and re-run validation. Do not overwrite it.
- If another page already promoted the same tree, treat that as successful convergence; do not create a duplicate release commit.
- Never deploy an older green SHA over a newer production tree.
- The first completed, fully validated lot has priority to integrate; later pages resync afterward.

## Roadmap rules

- `src/roadmap/master-roadmap.js` is the canonical registry.
- One deliverable has one canonical roadmap item; do not create aliases for the same outcome.
- Update roadmap state only with evidence from the validated implementation/runtime.
- Keep the registry revision visible to the UI and serve roadmap reads without stale client caching.
- `DONE_VERIFIED` requires the stated proof, not a manual status edit.

## UI rules

- Each surface has one presentation owner.
- Normal mode theme/background/avatar presentation is owned by `theme-avatar-enhancer.js` at the final response edge.
- Lower wrappers may add functional behavior, but must not leave competing theme/background/avatar layers in the delivered HTML.
- A visual patch is not complete until the final composed response is checked, not merely the source fragment that generated it.

## Stale and specialized branches

Old candidate branches are reference-only once superseded. They must not trigger shared candidate workflows.
Unique feature work such as Model Watch or Dreamina remains preserved on its branch/PR; before resuming it, synchronize or rebuild it from the current canonical candidate and revalidate all touched shared surfaces.

## Handoff checklist

A page may tell other pages to resume only when:

- canonical candidate points to the intended final SHA;
- full candidate CI is green on that SHA;
- Teacher/runtime smoke is green on that SHA;
- isolated preview and its HTTP smoke are green on that SHA;
- production has not been overwritten by an older tree;
- roadmap registry is internally consistent;
- no competing presentation layer is present on normal mode;
- durable MEL learning contains the coordination lesson;
- open specialized PRs have been told to resync before touching shared files.
