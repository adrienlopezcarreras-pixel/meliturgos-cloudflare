# MEL — Production capability evidence (2026-10-13)

This is a sanitized record of real GitHub Actions run [#38436125731](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38436125731).

## Identity and evidence

- Production Worker exact deployed SHA: `7e46ec102ca2a96bde9a9f898d0fa31c5b564c1b`.
- Immutable release pointer checked against the Worker self-check before reading the inventory.
- The GET-only inventory proof returned `CAPABILITY_INVENTORY_READ_ONLY_REAL_DEPLOYMENT` and `ok: true`.
- The four strictly allowlisted LOW-risk operations returned `LIVE_SAFE_READ_ONLY_CAPABILITIES_EXECUTED` and `ok: true`.
- No list body or private content was written to the GitHub logs/artifact. Only sanitized counts and capability IDs are retained.
- Source artifact: `mel-readonly-four-capabilities-38436125731`, GitHub Actions artifact ID `11833206430` (retention: 14 days).

## Actual production observations

| Metric | Verified number |
| --- | ---: |
| Registered capabilities | 165 |
| Enabled capabilities | 165 |
| LOW-risk capabilities | 103 |
| Protected MEDIUM/HIGH-risk capabilities | 62 |
| HEALTHY | 113 |
| DEGRADED | 48 |
| UNAVAILABLE | 4 |
| Individually executed and returned expected data in this run | **4** |

The four truly executed capabilities are `echo`, `project.list`, `skill.list`, and `timeline.list`. The list operations were checked for array outputs and not printed. The echo output was compared to an exact sentinel.

## Strict interpretation

These health counts **are not 165 individual executions**. The live-proof mechanism has tested only four allowlisted operations; the other 161 remain unproven by this specific run. No paid inference, deployment, MAX activation, destructive operation, or stress job was requested. GET endpoints may emit internal audit receipts.

The proof is tied to the exact production SHA above and must be rerun after relevant production changes. This document itself is not a deployment or a substitute for the signed GitHub Actions evidence.
