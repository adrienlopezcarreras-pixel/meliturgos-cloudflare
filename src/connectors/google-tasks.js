import { Connector } from './sdk.js';
export const definition = Object.freeze({
  id: 'google-tasks',
  provider: 'google',
  auth_type: 'OAUTH2',
  probe: 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1',
  secret_references: ['GOOGLE_TASKS_ACCESS_TOKEN'],
  capabilities: [
    'tasks.list',
    'tasks.create',
    'tasks.update',
    'tasks.delete'
  ],
  scopes: {
    read: ['https://www.googleapis.com/auth/tasks.readonly'],
    write: ['https://www.googleapis.com/auth/tasks']
  }
});
export const createConnector = options => new Connector(definition,options);
