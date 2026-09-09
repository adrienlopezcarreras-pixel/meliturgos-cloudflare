import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "google-calendar",
  "provider": "google",
  "auth_type": "OAUTH2",
  "probe": "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
  "secret_references": [
    "GOOGLE_CALENDAR_ACCESS_TOKEN"
  ],
  "capabilities": [
    "calendar.events.read"
  ]
});
// TODO implement bounded read adapter via CapabilityBus; OAuth grant is external.
export const createConnector = options => new Connector(definition,options);
