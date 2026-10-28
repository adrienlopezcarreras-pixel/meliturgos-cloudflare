# MAX Cloud Council output and retry policy — 28 October 2026

Production D1 read-only run 40744185321 on deployed 491eb458 reported 14 Council-exhausted missions, 124 provider timeouts (maximum 20,000ms), and one shared-deadline failure. The 20-second timeout correction alone has not demonstrated mission progress.

A regression using the real Council, deployed learned-runtime wrapper and metered binding reproduces a separate contract error: Council calls inherit the ordinary 4,096-token generation fallback. The mocked binding verifies outgoing payloads; it does not claim real provider latency. Critiques now explicitly request at most 512 tokens, synthesis 768, with concise prompts. Mandatory independent models, roles, synthesis, zero-cost proof and neuron accounting are preserved. Per-call 20s and shared 58s remain unchanged.

Previously exhausted Council attempts have no inference-policy identity and remain parked even after inference changes. A stable policy ID (not release SHA or wall clock) permits one new bounded attempt sequence under this changed payload contract. Matching-policy cooldowns and maximum three rounds remain enforced. D1 atomic admission and memory scheduling agree: the old mission reclaims one slot rather than admitting parallel work. The previous failure, attempts and exclusions are retained when a new failure is persisted; cancelled jobs are untouched. Implementation/bridge exhaustion is unchanged.

Validation: regression fails before output bound; 70 targeted tests pass including learned runtime/meter composition, SQLite admission and single flight, current-policy cooldown and retry counting. Full CI and live Cloud mission outcome remain required before declaring MAX operational. No PC requirement, paid provider, quota reset, synthetic approval or CI receipt is introduced.

XP MEL : NON — real composed binding/provenance and bounded retry rules already exist.
