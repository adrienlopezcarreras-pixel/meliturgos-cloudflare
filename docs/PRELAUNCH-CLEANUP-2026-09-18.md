# MEL pre-launch cleanup — 2026-09-18

Canonical active development branch: `candidate/mel-clean-autonomy`.

Verified pre-cleanup HEAD: `48307507f753413f9aca10d34b6e89d4926866d2`.
All four gates were green on that HEAD: full candidate CI, runtime Teacher smoke, candidate capture and candidate preview deployment.

## Operational cleanup

- Active roadmap: `src/roadmap/master-roadmap.js`.
- Active scheduler: `src/evolution/autonomy-supervisor.js`.
- Persistent heartbeat: `* * * * *`.
- Historical OpenHands M001–M014 queue: archived and forbidden as an independent scheduler.
- Canonical candidate only: `candidate/mel-clean-autonomy`.
- Production/main and rollback/archive refs are preserved and are not rewritten by this cleanup.

## Historical candidate refs

These refs are obsolete operationally. Their pre-cleanup tips are recorded here so no history is lost when their role is retired:

- candidate/augmentio-core — ea0935c45224ca904299fb0d3ded8c110e0af1f3
- candidate/cleanup-coordination-20260916 — d0244a55d5fce69425c01a95ab5db3b5c3bc5b30
- candidate/dev-bridge-hardening-20260916 — 475eedf51a632ebb070566f924472f39b12d68ea
- candidate/mel-20260915-complete — db4724ee3b934618823ea7cf64a63a8ca7886e73
- candidate/mel-security-env-fix-20260916 — 93994aacb9596359d3aa55a3ce1ef4c454f8f0ed
- candidate/mentor-guarded-zero-euro-20260912 — 4a49a17f3216c9e3ee27ae23b2b01effb21f3d65
- candidate/professor-layout-fix-20260916 — 6ec1b7bca5c2b9353ce592676f882ab25bcb9549
- candidate/professor-layout-fix-canonical-20260916 — 4aa1675be126b1246cef1861ebea080a5cd14814
- candidate/professor-tests-20260916 — 257f77f3136176315956d94987a774520c5a0524
- candidate/ui-six-point-20260912 — 4a49a17f3216c9e3ee27ae23b2b01effb21f3d65
- candidate/ui-visual-refine-20260912 — 5c757e047edea6a64f7078cea6b88d38bc47e93e

Other historical candidate refs were already strict ancestors of the canonical branch. Backup, archive, rollback, release and main refs are intentionally retained for recovery/audit.

## Launch gate

Do not launch the autonomous loop until the final cleanup HEAD has all four candidate gates green. The loop may continue roadmap work automatically, but production deployment remains a separate human-approved action.
