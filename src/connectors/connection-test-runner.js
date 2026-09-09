import { connectorDefinitions } from './registry.js';
import { testConnection } from './sdk.js';
export async function runConnectionTests(options={}) { const rows=[]; for (const def of connectorDefinitions) rows.push(await testConnection(def,options)); return rows; }
export function formatConnectionReport(rows) { return rows.map(row=>Object.entries(row).map(([k,v])=>`${k}=${v}`).join('\n')).join('\n\n'); }
