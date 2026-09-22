import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "vercel",
  "provider": "vercel",
  "auth_type": "API_KEY",
  "probe": "https://api.vercel.com/v2/user",
  "secret_references": [
    "VERCEL_TOKEN"
  ],
  "capabilities": [
    "vercel.projects.read",
    "vercel.deployments.read"
  ]
});
// Runtime read adapters are registered through CapabilityBus; API-token grant remains external.
export const createConnector = options => new Connector(definition,options);
