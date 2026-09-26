import { Connector } from './sdk.js';

export const definition = Object.freeze({
  id: 'microsoft-onedrive',
  provider: 'microsoft',
  auth_type: 'OAUTH2',
  probe: 'https://graph.microsoft.com/v1.0/me/drive/root?$select=id,name,webUrl',
  secret_references: ['MICROSOFT_OAUTH_CLIENT_ID','MICROSOFT_OAUTH_CLIENT_SECRET'],
  capabilities: [
    'files.list',
    'files.read',
    'files.search',
    'files.write',
    'files.delete',
  ],
  oauth_scopes: {
    read: 'https://graph.microsoft.com/Files.Read.All',
    write: 'https://graph.microsoft.com/Files.ReadWrite.All',
    refresh: 'offline_access',
  },
});

export const createConnector = options => new Connector(definition, options);
