# MEL COMPANION signed proposal relay

## Status

This change lives on the isolated branch `via-companion-proposal-relay-20261121`.
It is not merged into `main` and is not deployed. Do not configure production
clients to depend on these routes until CI, review, deployment and end-to-end
tests have passed.

## Secret configuration

The Worker expects `COMPANION_PROPOSAL_HMAC_SECRET` as a Cloudflare Worker
secret containing exactly 64 hexadecimal characters (32 random bytes).
Generate a new value locally, for example:

```sh
openssl rand -hex 32
npx wrangler secret put COMPANION_PROPOSAL_HMAC_SECRET
```

Enter the generated value when Wrangler prompts for the secret. Never put the
value in Git, source files, logs, CI variables that print values, or screenshots.
The identical value is currently entered once in the VIA native COMPANION
"réception locale signée" key field; it is held only in process memory and is
cleared when VIA closes.

**Security limitation:** this first implementation uses one Worker-wide HMAC
secret shared by all devices in this deployment. That is acceptable for
isolated integration testing only. Before general production use, replace it
with per-device derived keys and a one-time authenticated provisioning flow;
a compromised device must not reveal the signing key for every other device.

Without the Worker secret, the proposal and receipt routes fail closed with
`503 COMPANION_PROPOSAL_SIGNING_SECRET_UNAVAILABLE`.

## Endpoints

### Owner-created proposal

`POST /api/computer/v1/proposals`

Requires the MEL owner authentication already used by the existing computer API.
The JSON object must contain exactly:

```json
{
  "computer_id": "paired-windows-device-id",
  "action": "windows.input.click",
  "payload": { "x": 120, "y": 240 }
}
```

Only two actions are admitted:

- `windows.input.click` with integer client coordinates `x` and `y`, each 0–30000.
- `windows.input.key` with one of `escape`, `tab`, `up`, `down`, `left`, `right`, `f5`.

No HWND, PID, executable path, shell command, free-form text, screenshot,
clipboard data or arbitrary application action is accepted. The paired Windows
device must be online, not halted, and have `remote_access_enabled=true`.

The server signs an envelope with schema
`vi.companion.signed-request.v1`, a 128-bit request nonce and a 30-second
expiry. At most 16 non-expired proposals may be pending/claimed per device.

### Device claim

`GET /api/computer/v1/proposals/next`

Requires the paired device bearer token and `X-MEL-Computer-ID`. A successful
claim changes the row from `PENDING` to `CLAIMED` before returning the signed
envelope. An empty queue returns HTTP 204. The VIA client must verify the HMAC,
device ID, timestamp and replay nonce before presenting the request for native
Yes/No review.

### Revalidation before local dispatch

`GET /api/computer/v1/proposals/control-state?request_id=<nonce>`

Requires the same device authentication. VIA must call this after the native
confirmation and immediately before the input action. A proposal is permitted
only while it remains `CLAIMED`, unexpired, the device is not halted and the
local remote-access switch remains enabled. STOP cancels pending and claimed
proposals; a stale or revoked proposal returns `permitted=false`.

### Terminal receipt

`POST /api/computer/v1/proposals/receipt`

Requires device authentication and a matching HMAC receipt using schema
`vi.companion.receipt.v1`. The server accepts only the exact receipt fields,
checks device scope and freshness, and records one terminal receipt per claimed
proposal. Repeating the identical receipt is idempotently acknowledged;
conflicting receipts are rejected. An acknowledgement means only that MEL
recorded the receipt. It is not independent proof that an OS action had the
intended effect.

## Rollout order

1. Run the targeted Worker test `tests/computer-companion-api.test.mjs` and
   the full required checks.
2. Review the change and merge only after approvals and green CI.
3. Configure the Worker secret through Wrangler's interactive prompt.
4. Deploy the Worker.
5. Update VIA to fetch the device-specific HMAC key through a future
   per-device provisioning design before production use.
6. Connect the VIA native review to `proposals/control-state`; no action may
   execute when revalidation fails or the network is unavailable.
7. Test STOP races, duplicate receipts, device revocation, expired proposals,
   missing secrets and the Windows session-1 native input path.

This relay is a proposal transport only. It does not remove the local target
window picker, Windows foreground/PID/session checks, per-action native
confirmation, emergency STOP, or VIA shutdown revocation.
