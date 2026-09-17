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

All non-canonical `candidate/*` refs that existed before final consolidation are recorded below. They are historical only and must never be selected by runtime configuration:

- candidate/augmentio-core — ea0935c45224ca904299fb0d3ded8c110e0af1f3
- candidate/chat-capabilities-teacher-bridge — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/chat-timeout-bounded-fallback-20260912 — 9d8288b471e0cd823ac8411ab5d9875c7aacf376
- candidate/cleanup-coordination-20260916 — d0244a55d5fce69425c01a95ab5db3b5c3bc5b30
- candidate/consolidation-20260916-checks — 3613c57421706a9878ce3ac6a04d697ea93f1eaf
- candidate/consolidation-20260916-registry-tests — 3613c57421706a9878ce3ac6a04d697ea93f1eaf
- candidate/consolidation-20260916-tests — 3613c57421706a9878ce3ac6a04d697ea93f1eaf
- candidate/consolidation-20260916 — 210eee990823529014d4973d0e5a9a930e81dd50
- candidate/context-interpreter-20260916 — ce54f982f5804ee080c4af131c02a1412808d425
- candidate/dev-bridge-fetch-fix — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/dev-bridge-hardening-20260916 — 475eedf51a632ebb070566f924472f39b12d68ea
- candidate/dev-bridge-hardening-v2-20260916 — 961637f41d5b10fcfceb56c3a66abc23ea7fdb6f
- candidate/device-control-core — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/grande-maj-chat-queue-2026-09-09 — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/grande-maj-runtime-2026-09-09 — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-20260915-complete — db4724ee3b934618823ea7cf64a63a8ca7886e73
- candidate/mel-security-env-fix-20260916 — 93994aacb9596359d3aa55a3ce1ef4c454f8f0ed
- candidate/mel-ui-selfaware-integration — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state-final — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state-final2 — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state-impl — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state-impl2 — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state-v2 — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mel-work-02-state-v3 — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/mentor-guarded-zero-euro-20260912 — 4a49a17f3216c9e3ee27ae23b2b01effb21f3d65
- candidate/professor-layout-fix-20260916 — 6ec1b7bca5c2b9353ce592676f882ab25bcb9549
- candidate/professor-layout-fix-canonical-20260916 — 4aa1675be126b1246cef1861ebea080a5cd14814
- candidate/professor-tests-20260916 — 257f77f3136176315956d94987a774520c5a0524
- candidate/teacher-bridge — 69be3c77f473c7d6c403daa28e7ddb80a178d30f
- candidate/ui-six-point-20260912 — 4a49a17f3216c9e3ee27ae23b2b01effb21f3d65
- candidate/ui-visual-refine-20260912 — 5c757e047edea6a64f7078cea6b88d38bc47e93e
- candidate/visual-pipeline-fix-20260916 — d40f4b134418612b9fc9627184b6250cc19b68fc

The canonical branch itself is intentionally omitted from this archive list. Backup, archive, rollback, release and main refs are preserved for recovery/audit and are not operational candidate sources.

## Launch gate

Do not launch the autonomous loop until the final cleanup HEAD has all four candidate gates green. The loop may continue roadmap work automatically, but production deployment remains a separate human-approved action.
