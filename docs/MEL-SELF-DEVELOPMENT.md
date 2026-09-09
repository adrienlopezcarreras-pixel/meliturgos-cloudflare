# MEL self-development bridge

1. `cd ~/meliturgos-cloudflare && export MEL_DEV_BRIDGE_TOKEN='<local-secret>'`
2. `npm run mel:dev-bridge`
3. Open `/professor`; development API integration is the next server wiring step.
4. Jobs must end in candidate/test/review; rollback removes only the candidate.

The bridge is bound to `127.0.0.1`, rejects secret paths and arbitrary commands, and never deploys automatically.
