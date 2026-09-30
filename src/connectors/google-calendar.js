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
    "calendar.events.read",
    "calendar.events.create",
    "calendar.events.update",
    "calendar.events.delete"
  ],
  "oauth_scopes": {
    "read": "https://www.googleapis.com/auth/calendar.events.readonly",
    "write": "https://www.googleapis.com/auth/calendar.events"
  }
});
// Runtime execution is registered through CapabilityBus. Mutations require exact owner approval.
export const createConnector = options => new Connector(definition,options);
