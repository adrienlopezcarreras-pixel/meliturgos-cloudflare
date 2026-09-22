import { Connector } from './sdk.js';
export const definition = Object.freeze({
  "id": "github",
  "provider": "github",
  "auth_type": "API_KEY",
  "probe": "https://api.github.com/user",
  "secret_references": [
    "GITHUB_TOKEN"
  ],
  "capabilities": [
    "github.repositories.read",
    "github.actions.runs.read",
    "github.actions.workflow.dispatch"
  ]
});
// Runtime read/control adapters are registered through CapabilityBus; write control requires exact owner approval and an allowlisted workflow.
export const createConnector = options => new Connector(definition,options);
