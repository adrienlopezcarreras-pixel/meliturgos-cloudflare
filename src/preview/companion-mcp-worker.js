// Isolated worker entrypoint. Not referenced by production build or routes.
// Deployment requires an explicit owner-approved preview configuration.
import {createPreviewCompanionMcpHandler} from '../devices/companion-mcp-preview-runtime.js';
import {validateCompanionMcpPreviewEnv} from './companion-mcp-deployment-guard.js';
export default {
 async fetch(request,env){
  try{
   validateCompanionMcpPreviewEnv(env);
   const handler=createPreviewCompanionMcpHandler(env);
   return await handler(request);
  }catch{
   return Response.json({error:'MCP_PREVIEW_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});
  }
 }
};
