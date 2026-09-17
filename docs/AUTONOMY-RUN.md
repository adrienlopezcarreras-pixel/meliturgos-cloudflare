# MEL canonical autonomous run

BOOT: `candidate/mel-clean-autonomy` is the only active development branch. Read `docs/CURRENT-PRIORITY.md` and `src/roadmap/master-roadmap.js`. The runtime AutonomySupervisor is the only authority that selects the next roadmap item.

Do not execute the historical M001–M014 OpenHands queues as an independent plan. `docs/OPENHANDS-INTEGRATION-QUEUE.md` and `docs/OPENHANDS-MORNING-QUEUE.md` are archive/reference only.

Before any write, confirm the current candidate HEAD has not moved. Reuse the existing supervised job when one exists; otherwise follow the next item selected by the canonical supervisor. Never create a second candidate branch, second roadmap, second orchestrator, or duplicate module to bypass a blocked item.

Run the smallest bounded change, execute the requested tests and `scripts/openhands-checkpoint.sh`, then leave exact evidence. At most two identical attempts. On the second identical failure, record the exact cause and mark the work BLOCKED/FAILED so the canonical scheduler can continue with other eligible roadmap work.

OAuth, secrets, external services, DNS, permissions, payment and production deployment are external gates; they must not silently become local approvals. Never reset/clean/rollback globally, mutate production D1, expose secrets, force stale Teacher approval, or silently activate production changes.
