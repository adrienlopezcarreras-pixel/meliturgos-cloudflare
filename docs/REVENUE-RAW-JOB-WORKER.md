# MEL raw-task revenue worker

## Scope
Build a headless worker that accepts permitted, machine-verifiable data/compute jobs, returns the requested output, and reconciles payment per accepted job. No customer interface, customer messaging, or manual per-job handling is in scope.

## Market reality (reviewed 2026-10-16)
- Golem pays for metered computer resources in GLM, not a guaranteed fixed payment per data packet. The official provider guide requires Linux x86-64, Docker Engine and KVM: https://docs.golem.network/docs/providers/provider-installation
- Bittensor mining rewards depend on each subnet's specific task and incentive logic; registration may cost TAO/alpha, and mining is not supported on Windows according to the official guide: https://www.bittensor.com/docs/guides/mining
- Salad pays rewards for shared idle resources, but it is a workload/reward pool, not a guarantee of €0.10 per packet: https://support.salad.com/
- Therefore do not assume any network pays €0.10/package. Find a documented task stream, verify the acceptance contract and actual settlement, and only then automate it.

## This first implementation
The raw-job gate in src/revenue/raw-job-gate.js performs deterministic allowlist, image pinning, sandbox, time/power and unit-economics checks. It cannot launch a job, install an agent, create a wallet, or send money. Its default mode is observation-only.

## Next steps
1. Inventory the actual Windows PC hardware (GPU model/VRAM, CPU, RAM, OS, availability) through the paired Companion; don't infer it.
2. Evaluate task markets for paid data transformation/inference/embeddings/transcription, prioritizing API-accessible tasks with machine-verifiable acceptance and documented payouts.
3. Separate true per-job fees from GPU resource rental. Normalize reward to EUR only using a fresh source and timestamp; volatile tokens are not booked as settled euros.
4. Start observation-only and run a small capped pilot. Track offered jobs, rejected jobs, accepted output, runtime, watts, fees, failures, credits and withdrawable payout.
5. Before any real execution, require a pinned image, rootless sandbox, read-only filesystem, no host mounts, no privileged container, restricted networking, resource/time limits and cancellation.
6. Stop a provider automatically when settlement is missing, actual cost exceeds estimate, profit is below the configured floor, or task behavior deviates from its contract.

## Success criteria
- Jobs are only drawn from explicitly permitted providers and workload classes.
- No host credentials, unrelated personal files or arbitrary shell access are exposed to a task.
- Success requires provider acceptance of the output, not merely process exit code 0.
- Income is reported as earned only after actual settlement; estimates, tokens and withdrawable money remain distinct fields.
- No job is dispatched while the default dispatch gate is disabled.

## Limitations
This commit is a safety/economics gate, not a working marketplace integration. Hardware inventory, market selection, adapter, isolated executor, payout reconciliation, tests on the actual Windows device and production deployment still need to be done.