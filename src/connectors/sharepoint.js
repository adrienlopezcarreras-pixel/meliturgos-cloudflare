import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "sharepoint",
  "provider": "microsoft",
  "auth_type": "OAUTH2",
  "probe": "https://graph.microsoft.com/v1.0/sites/root",
  "secret_references": [
    "SHAREPOINT_ACCESS_TOKEN"
  ],
  "capabilities": [
    "sharepoint.sites.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
