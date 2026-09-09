import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "github",
  "provider": "github",
  "auth_type": "API_KEY",
  "probe": "https://api.github.com/user",
  "secret_references": [
    "GITHUB_TOKEN"
  ],
  "capabilities": [
    "github.repositories.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
