import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "onedrive",
  "provider": "microsoft",
  "auth_type": "OAUTH2",
  "probe": "https://graph.microsoft.com/v1.0/me/drive",
  "secret_references": [
    "ONEDRIVE_ACCESS_TOKEN"
  ],
  "capabilities": [
    "onedrive.files.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
