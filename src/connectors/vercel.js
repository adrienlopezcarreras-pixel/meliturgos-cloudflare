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
    "vercel.projects.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
