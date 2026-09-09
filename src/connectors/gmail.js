import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "gmail",
  "provider": "google",
  "auth_type": "OAUTH2",
  "probe": "https://gmail.googleapis.com/gmail/v1/users/me/profile",
  "secret_references": [
    "GMAIL_ACCESS_TOKEN"
  ],
  "capabilities": [
    "gmail.messages.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
