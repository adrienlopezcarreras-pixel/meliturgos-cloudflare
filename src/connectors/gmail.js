import { Connector } from './sdk.js';
export const definition = Object.freeze({
  id: 'gmail',
  provider: 'google',
  auth_type: 'OAUTH2',
  probe: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
  secret_references: ['GMAIL_ACCESS_TOKEN'],
  capabilities: [
    'gmail.messages.search',
    'gmail.messages.read',
    'gmail.drafts.create',
    'gmail.messages.send'
  ],
  scopes: {
    read: ['https://www.googleapis.com/auth/gmail.readonly'],
    write: ['https://www.googleapis.com/auth/gmail.compose'],
    send: ['https://www.googleapis.com/auth/gmail.send']
  }
});
export const createConnector = options => new Connector(definition,options);
