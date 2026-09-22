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
    "cloudflare.resources.read",
    "cloudflare.workers.read",
    "cloudflare.deployments.read"
  ]
});
// Runtime read adapters are registered through CapabilityBus; API-token grant remains external.
export const createConnector = options => new Connector(definition,options);
