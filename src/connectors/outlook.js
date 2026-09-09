import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "outlook",
  "provider": "microsoft",
  "auth_type": "OAUTH2",
  "probe": "https://graph.microsoft.com/v1.0/me",
  "secret_references": [
    "OUTLOOK_ACCESS_TOKEN"
  ],
  "capabilities": [
    "outlook.messages.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
