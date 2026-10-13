// Operator-facing preflight without performing any deployment or network change.
// A boolean "isolated" flag is not proof of an actually separate database.
import {validateCompanionMcpPreviewEnv} from './companion-mcp-deployment-guard.js';
export function companionMcpPreviewPreflight(env){
 validateCompanionMcpPreviewEnv(env);
 const worker=String(env.MCP_PREVIEW_WORKER_NAME||'');
 const dbId=String(env.MCP_PREVIEW_D1_DATABASE_ID||'');
 const productionWorker=String(env.MCP_PRODUCTION_WORKER_NAME||'');
 const productionDbId=String(env.MCP_PRODUCTION_D1_DATABASE_ID||'');
 if(!worker||!dbId||!productionWorker||!productionDbId)throw Error('MCP_RESOURCE_IDENTITIES_REQUIRED');
 if(worker===productionWorker||dbId===productionDbId)throw Error('MCP_PREVIEW_RESOURCE_COLLISION');
 return {ready_for_manual_review:true,worker_name:worker,d1_database_id:dbId};
}
