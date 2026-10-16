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

## Taskmarket worker cycle (implementation started)

Taskmarket is currently the best-aligned candidate discovered for paid-by-result tasks: public REST lists open tasks, while work submission uses a worker wallet signature; task claims also require a valid signature. Some operations use x402 fees. Do not claim/submit/bid until the operator has reviewed the versioned legal bundle, set up the local worker identity, and configured an explicit spend ceiling. Official references:
- API: https://docs.taskmarket.dev/api/reference
- CLI/legal/identity: https://docs.taskmarket.dev/cli/commands
- Task schema/lifecycle: https://docs.taskmarket.dev/reference/task-schema

The read-only discovery utility is `scripts/revenue/taskmarket-scan.mjs`. The bounded orchestration contract is `src/revenue/taskmarket-worker-cycle.js`:
- discover open work;
- ask the Council adapter for category, confidence and risk assessment;
- skip tasks needing human judgment, host secrets, unsafe actions, or unverified acceptance criteria;
- read relevant learning context;
- solve via a MEL adapter;
- require an independent machine-verifiable validator;
- submit only if the operator explicitly enabled submission, legal acceptance is recorded, a worker identity exists, spend-cap approval exists and the validator is verified;
- record an outcome and distinguish submission from acceptance and settled payout.

This is not yet wired to the live Taskmarket wallet/CLI, the running Windows Companion, Council runtime, or LoRA training runtime. The injected adapters must be implemented against the actual current interfaces rather than guessed.

## Council, LoRA and veille feedback loop

- Council reviews task fit before claiming/solving and independently checks the deliverable against the task's actual acceptance criteria.
- A rejection, low rating or payout failure becomes a case file with task ID, task text hash, output hash, validation findings and external feedback.
- Only confirmed external outcomes can create a proposed LoRA example. The helper marks examples `REVIEW_REQUIRED`; it does not train automatically. LoRA data must exclude secrets, private task payloads not licensed for reuse, poisoned instructions and unverified self-ratings.
- Veille periodically checks the public task list, platform docs/policies and published feedback/reputation schema. Record the source URL, retrieval timestamp and changed claims; don't treat an LLM summary as a verified rule.
- After a successful validation/acceptance, update a small benchmark suite of sanitized, reusable tasks and compare the next candidate before rollout. Track quality, acceptance rate, payout latency and net income per hour.
- If failure/low ratings increase, pause that task category, roll back the relevant prompt/model/adapter version and rerun the regression suite.

## Current stage and honest status

Stage: read-only discovery + worker-cycle design. No task has been claimed, submitted, accepted or paid in this branch. There is no verified income yet. A live start requires:
1. Install/use the official Taskmarket CLI on the user's Windows machine (if compatible with their current Node/runtime).
2. Check whether a wallet/keystore already exists without displaying or exporting any secret.
3. Review the current Terms, Privacy, Risk Disclosure and Acceptable Use policies; acceptance is an explicit operator attestation.
4. Confirm the allowed spending/fee ceiling (submissions/claims can incur x402 fees in some task modes).
5. Test read-only scan and dry-run solve/validation before enabling paid calls.
