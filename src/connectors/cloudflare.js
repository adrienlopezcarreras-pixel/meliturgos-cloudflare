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
    "cloudflare.deployments.read",
    "cloudflare.deployments.create"
  ]
});
// Runtime read/control adapters are registered through CapabilityBus; deployment mutation requires exact owner approval and a configured Worker target.
export const createConnector = options => new Connector(definition,options);
