// Isolated worker entrypoint. Not referenced by production build or routes.
// Deployment requires an explicit owner-approved preview configuration.
import {createPreviewCompanionMcpHandler} from '../devices/companion-mcp-preview-runtime.js';
export default {
 async fetch(request,env){
  try{
   const handler=createPreviewCompanionMcpHandler(env);
   return await handler(request);
  }catch{
   return Response.json({error:'MCP_PREVIEW_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});
  }
 }
};
