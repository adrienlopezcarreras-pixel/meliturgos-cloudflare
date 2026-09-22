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
    "vercel.deployments.read",
    "vercel.deployments.redeploy"
  ]
});
// Runtime read/control adapters are registered through CapabilityBus; redeploy mutation requires exact owner approval and one configured project.
export const createConnector = options => new Connector(definition,options);
