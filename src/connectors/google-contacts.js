import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "google-contacts",
  "provider": "google",
  "auth_type": "OAUTH2",
  "probe": "https://people.googleapis.com/v1/people/me?personFields=names",
  "secret_references": [
    "GOOGLE_CONTACTS_ACCESS_TOKEN"
  ],
  "capabilities": [
    "contacts.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
