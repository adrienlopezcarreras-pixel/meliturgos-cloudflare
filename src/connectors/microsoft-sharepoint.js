import { Connector } from './sdk.js';

export const definition = Object.freeze({
  id: 'microsoft-sharepoint',
  provider: 'microsoft',
  auth_type: 'OAUTH2',
  probe: 'https://graph.microsoft.com/v1.0/sites/root?$select=id,name,webUrl',
  secret_references: ['MICROSOFT_OAUTH_CLIENT_ID','MICROSOFT_OAUTH_CLIENT_SECRET'],
  capabilities: [
    'sites.list',
    'sites.read',
    'sites.search',
    'sites.write',
  ],
  oauth_scopes: {
    files_read: 'https://graph.microsoft.com/Files.Read.All',
    files_write: 'https://graph.microsoft.com/Files.ReadWrite.All',
    sites_read: 'https://graph.microsoft.com/Sites.Read.All',
    sites_write: 'https://graph.microsoft.com/Sites.ReadWrite.All',
    refresh: 'offline_access',
  },
});

export const createConnector = options => new Connector(definition, options);
