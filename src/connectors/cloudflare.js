import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "cloudflare",
  "provider": "cloudflare",
  "auth_type": "API_KEY",
  "probe": "https://api.cloudflare.com/client/v4/user/tokens/verify",
  "secret_references": [
    "CLOUDFLARE_API_TOKEN"
  ],
  "capabilities": [
    "cloudflare.resources.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
