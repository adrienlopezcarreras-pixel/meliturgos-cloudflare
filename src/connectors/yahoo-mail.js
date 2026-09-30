import { Connector } from './sdk.js';

export const definition = Object.freeze({
  id: 'yahoo-mail',
  provider: 'yahoo',
  auth_type: 'OAUTH2',
  probe: 'https://api.login.yahoo.com/openid/v1/userinfo',
  secret_references: ['YAHOO_OAUTH_CLIENT_ID','YAHOO_OAUTH_CLIENT_SECRET'],
  capabilities: [
    'mail.messages.search',
    'mail.messages.read',
    'mail.messages.send',
  ],
  oauth_scopes: {
    read: 'mail-r',
    write: 'mail-w',
    identity: 'openid',
  },
});

export const createConnector = options => new Connector(definition, options);
