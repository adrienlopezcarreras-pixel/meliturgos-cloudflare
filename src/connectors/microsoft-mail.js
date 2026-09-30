import { Connector } from './sdk.js';

export const definition = Object.freeze({
  id: 'microsoft-mail',
  provider: 'microsoft',
  auth_type: 'OAUTH2',
  probe: 'https://graph.microsoft.com/v1.0/me/messages?$top=1',
  secret_references: ['MICROSOFT_OAUTH_CLIENT_ID','MICROSOFT_OAUTH_CLIENT_SECRET'],
  capabilities: [
    'mail.messages.search',
    'mail.messages.read',
    'mail.messages.move',
    'mail.messages.send',
  ],
  oauth_scopes: {
    read: 'https://graph.microsoft.com/Mail.Read',
    write: 'https://graph.microsoft.com/Mail.ReadWrite',
    send: 'https://graph.microsoft.com/Mail.Send',
    refresh: 'offline_access',
  },
});

export const createConnector = options => new Connector(definition, options);
