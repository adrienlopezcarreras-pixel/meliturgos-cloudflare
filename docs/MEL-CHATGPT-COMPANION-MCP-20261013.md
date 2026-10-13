# MEL Companion — ChatGPT MCP connector (first secure milestone)

Status: **CODE ADDED / NOT CONNECTED / NOT DEPLOYED / NOT LIVE VERIFIED**.

The repository already includes an authenticated MEL computer-device command queue and a local Windows Companion poller. This MCP adapter is a **separate, read-only stdio bridge** for compatible MCP clients. It does NOT create a ChatGPT plugin, give this conversation direct access, or submit OS commands.

## How to launch in a locally authorized MCP client

Requires Node.js 22+, a previously configured MEL owner API token, and the MEL server's HTTPS origin. In the client MCP configuration, execute:

`node tools/mel-companion-mcp.mjs`

Supply environment variables locally:
- `MEL_MCP_SERVER_URL`: HTTPS MEL server base origin, ending with `/`. Never a preview URL chosen by untrusted input.
- `MEL_MCP_OWNER_TOKEN`: owner session/token issued by MEL. Keep only in the local MCP client secret store. Never commit, print, paste or send via chat.

Exposes exactly one tool: `mel_companion_status`, optional `computer_id`. Outputs limited device name, online/halted/remote-access flags, last heartbeat, and recent command statuses; no raw results or screenshots.

## Security boundaries

- No arbitrary shell, file access, flash, relay dispatch, installer, branch write, pairing, or production changes.
- Authenticated owner call; HTTPS origin required, no redirects, 12-second request timeout, response size bounded.
- Excludes stored device tokens, metadata, hostname, screenshots, plan payloads, and command result bodies.
- Does not bypass Companion's local Stop button.
- A future command tool must require separate local, time-limited, per-action consent and evidence with live end-to-end testing.
- This is **not** usable by ChatGPT until the user/admin registers and connects an MCP connector that can run or host the server; ChatGPT's current plugin inventory does not automatically include this local stdio process.

## Acceptance gates

1. Automated JSON-RPC initialize / tools/list / ping / invalid-argument tests.
2. Real MCP client installation and owner auth configured securely.
3. Status tool returns a fresh authenticated Companion heartbeat, device ID matches owner.
4. Local Stop correctly blocks remote operations (future feature).
5. Any commands beyond read-only status require a reviewed, scoped authenticated control plane and interactive local authorization. No silent background PC control.

Keep MAX OFF. Do not modify production, MINI, APK, or Companion build as part of this initial MCP adapter.
