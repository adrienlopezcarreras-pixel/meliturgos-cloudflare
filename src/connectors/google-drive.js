import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "google-drive",
  "provider": "google",
  "auth_type": "OAUTH2",
  "probe": "https://www.googleapis.com/drive/v3/about?fields=user",
  "secret_references": [
    "GOOGLE_DRIVE_ACCESS_TOKEN"
  ],
  "capabilities": [
    "drive.files.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
