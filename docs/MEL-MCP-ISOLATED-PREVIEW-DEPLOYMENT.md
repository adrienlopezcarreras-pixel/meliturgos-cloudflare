# MEL Companion MCP — isolated preview deployment checklist

**Status: NOT DEPLOYED.** The worker entry is `src/preview/companion-mcp-worker.js`.
Do not reuse the production Worker name, route, zone, secrets, D1 ID or deployment workflow.

## Before preview deployment
1. Allocate a separate Cloudflare Worker name and subdomain, and an isolated D1 database.
2. Run the reviewed grant/revocation migrations in **preview D1 only**. The grants table creates no active grants.
3. Configure `MCP_PREVIEW_ORIGIN` as the exact HTTPS origin of the preview Worker.
4. Configure `MCP_OAUTH_ISSUER` and `MCP_OAUTH_JWKS` using a reviewed OAuth issuer and pinned public keys (no private keys in this repository). The current project does **not** implement OAuth authorization-code/PKCE, token issuance or user consent.
5. Verify TLS, token rejection, revoked/expired grants, owner/device isolation, and preview database rollback plan.
6. Do **not** expose the actual computer command queue through the MCP interface; only `mel_companion_status` is included.
7. Test `initialize`, `tools/list`, and `tools/call` using a real authorized preview account. Passing unit tests alone is not live evidence.
8. After live authorization and review, have the user connect the compatible remote MCP endpoint in ChatGPT settings. That is not automatic.

## Known blockers
- OAuth issuer, authorization and registration compatible with ChatGPT are not provisioned.
- Cloudflare isolated preview Worker/D1 configuration and owner grants are absent.
- ChatGPT custom connector registration and a live Companion proof are absent.
- A Streamable HTTP protocol compliance review is required before a public endpoint is enabled.

No commands should be run on the user's PC until an independent local consent, audit and Stop flow is verified. No production deployment without explicit approval.
