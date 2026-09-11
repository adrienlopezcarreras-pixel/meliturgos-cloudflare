# MEL Clean Autonomy — checkpoint

- Branch: `candidate/mel-clean-autonomy`
- Verified code/data SHA: `7832d9dae66820718ce28674a1bf95aa62a7d97d`
- Block: Priority 7 — capability truth audit.
- Change: `CAPABILITY_MATRIX.json` schema v2 now preserves legacy runtime `status` and adds evidence-based `truth_status`: `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, `BLOQUE`.
- Runtime behavior: unchanged.
- CI: `full-candidate-ci` run `34590930648` on exact SHA `7832d9dae66820718ce28674a1bf95aa62a7d97d` = SUCCESS; check/lint/tests/governance/LOW-risk smoke/security gates green.
- Verified: the matrix distinguishes tested, partial, and not implemented capabilities without inflating untested claims. `work_agent_mode` remains `PARTIEL` until a persistent general DAG and the complete runtime Teacher loop are proven end-to-end.
- Blockers: none for this audit block.
- Next: Priority 6 — verify the backend `ui_theme` contract preserves `granada`, `aviation`, `paladin`, and `amazon`; add or repair focused tests only if the active candidate still falls back silently.
