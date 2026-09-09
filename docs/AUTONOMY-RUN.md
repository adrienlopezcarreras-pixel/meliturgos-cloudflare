# OpenHands autonomous run

BOOT: read `docs/CURRENT-PRIORITY.md`, then `docs/OPENHANDS-INTEGRATION-QUEUE.md` (details in `OPENHANDS-MORNING-QUEUE.md`); read `docs/ARCHITECTURE-ACTIVE.md` only when the ticket references a contract. Run `git status`, execute the ticket, run `npm run test:integration` or its specific command, run `scripts/openhands-checkpoint.sh`, mark DONE, select the next READY ticket and CONTINUE.

`MASTER-SPEC` is consulted only for ambiguity. At most two identical attempts. On the second identical failure set `STATUS: BLOCKED`, record exact stack/cause, and continue with the next READY ticket. OAuth, secrets, external services, DNS, permissions, payment and deployment are `BLOCKED_EXTERNAL`; they never stop independent tickets. Never reset/clean/rollback globally, mutate production D1, expose secrets, or silently activate production changes.
