# ChatGPT ↔ MEL Companion: production connector architecture (unimplemented)

**State:** design-only. The existing `tools/mel-companion-mcp.mjs` is a local **stdio** MCP server. It cannot be reached directly by a ChatGPT custom app over the Internet. Do not describe it as connected.

## Required architecture

ChatGPT custom MCP app → **public HTTPS MCP endpoint** → identity-aware MCP gateway → authenticated MEL owner session → existing `/api/computer/v1/status` API → paired Windows Companion.

The gateway must NOT expose the MEL owner password/token as a shared static secret to ChatGPT. The user's ChatGPT connection must be independently authenticated using a supported OAuth flow, with per-user account binding, audience validation, state/PKCE, issuer verification, revocation and token expiry. No endpoint should accept anonymous or arbitrary bearer tokens.

### Initial public capability
- `mel_companion_status`: **read-only**, reduced non-sensitive fields; recent command IDs and status, but no logs, screenshots, secrets or arbitrary process results.
- No PC-control tool until separate local approval, per-action scopes, expiring request grants and verified emergency stop are implemented and tested.
- Keep MINI, APK and firmware controls out of the initial ChatGPT connector.
- Do not claim that a ChatGPT custom app can execute local stdio servers directly.

### Implementation sequence
1. Add a dedicated MCP Streamable HTTP endpoint behind Cloudflare in an isolated preview (not on production routes). Enforce supported MCP protocol and content types; set request/body/response limits and timeouts.
2. Add OAuth authorization server metadata, dynamic-client-registration strategy compatible with the actual ChatGPT platform, PKCE, token issuance/verification and revocation; use a dedicated audience for MCP. **No implicit auto-authorize or long-lived shared static tokens.**
3. Map authenticated owner identity to specific already-paired MEL device IDs; default to deny if the mapping is missing.
4. Map tool calls to the existing MEL computer status API without leaking owner authentication material; audit and rate-limit tool calls.
5. Test identity isolation, invalid and expired tokens, cancellation, schema validation, redaction, bad endpoint replies and offline Companion states in CI.
6. Deploy to a dedicated preview only after owner approval; verify HTTPS/TLS and end-to-end Companion heartbeat with the owner's test client.
7. Owner/admin must **register and connect** the remote MCP app in ChatGPT. Until this step is performed, this conversation has no new MEL command tool.

## Explicitly not done
- Public HTTP MCP server; OAuth authorization and identity mapping; ChatGPT app registration; real MEL Companion heartbeat proof; remotely executed commands; production deployment.

## Security invariants
- Companion stays under owner control, with a local stop control; MAX doesn't grant MCP privileges.
- No blind `system.exec`, arbitrary powershell, disk delete, flash or force-push. User confirmation must be scoped to an individual action and device.
- Production and main remain untouched until CI, security review and explicit owner authorization.
