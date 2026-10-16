# Connectivity matrix

`npm run test:connections` is MOCK and deterministic. `node scripts/test-connections.mjs --real` performs fixed read-only probes only when credentials exist. Values are never printed.

| Connector | IMPLEMENTATION | CONTRACT | MOCK_TEST | REAL_TEST | AUTH_REQUIRED | OPENHANDS_TASK |
|---|---|---|---|---|---|---|
| Gmail | `src/connectors/gmail.js` | `src/connectors/sdk.js` | test:connections | `--real` | BLOCKED_EXTERNAL OAuth2 | OH-037 |
| Google Calendar | `src/connectors/google-calendar.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL OAuth2 | OH-038 |
| Google Contacts | `src/connectors/google-contacts.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL OAuth2 | OH-039 |
| Google Drive | `src/connectors/google-drive.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL OAuth2 | OH-040 |
| Outlook | `src/connectors/outlook.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL OAuth2 | OH-041 |
| OneDrive | `src/connectors/onedrive.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL OAuth2 | OH-042 |
| GitHub | `src/connectors/github.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL token | OH-044 |
| Cloudflare | `src/connectors/cloudflare.js` | SDK | test:connections | `--real` | BLOCKED_EXTERNAL token | OH-045 |

SharePoint and Vercel are intentionally excluded from the active MEL connector registry and connection tests because their current use would add paid-plan costs. The free-first deployment path remains Cloudflare. Current real status for the remaining connector rows: `AUTH_REQUIRED`; independent mock tests remain READY.
