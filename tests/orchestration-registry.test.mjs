import assert from "node:assert/strict";

// Import the Worker in place so its lazy Gen2 imports resolve against the real src tree.
// The old /tmp copy silently disabled ModelRouter and could only exercise legacy single-call inference.
const workerUrl=new URL("../worker.js",import.meta.url);
workerUrl.searchParams.set("v",String(Date.now()));
const {default:worker}=await import(workerUrl.href);

const auth="Basic "+Buffer.from("adrien:test").toString("base64");
let mediaPuts=0;
function makeEnv({ai=true,failFirst=false}={}){
 let aiCalls=0;
 const statement={bind(){return this},run:async()=>({meta:{changes:1,last_row_id:1}}),first:async()=>({n:0,id:"session"}),all:async()=>({results:[]})};
 return{
  MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",
  DB:{prepare(sql){const s=Object.create(statement);if(String(sql).includes("PRAGMA quick_check"))s.first=async()=>({quick_check:"ok"});return s},batch:async()=>[]},
  MEDIA_BUCKET:{put:async()=>{mediaPuts++}},
  ...(ai?{AI:{run:async(model)=>{aiCalls++;if(failFirst&&aiCalls===1)throw new Error("MODEL_UNAVAILABLE");return{response:"réponse test",model}}}}:{})
 };
}
async function call(path,{method="GET",body,env=makeEnv(),authorized=true}={}){
 const headers=authorized?{Authorization:auth}:{};
 if(body!==undefined)headers["content-type"]="application/json";
 return worker.fetch(new Request("https://meliturgos.test"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
}
async function data(path,options){const response=await call(path,options);return{response,body:await response.json()}}

{
 const response=await call("/api/tools/registry",{authorized:false});
 assert.equal(response.status,401,"Basic Auth protège le registre");
}
{
 const {response,body}=await data("/api/tools/registry");
 assert.equal(response.status,200);
 assert.ok(body.tools.length>=10);
 for(const tool of body.tools)for(const field of ["name","capability","status","model_used","estimated_cost","limits","risk_level","permissions","data_access","available","effective_status","explanation"])assert.ok(Object.hasOwn(tool,field),`${tool.id}.${field}`);
 assert.equal(body.tools.find(t=>t.id==="workers_ai_chat").available,true);
 assert.equal(body.tools.find(t=>t.id==="media_upload").effective_status,"disabled");
 assert.equal(body.tools.find(t=>t.id==="external_connectors").read_only,true);
}
{
 const {body}=await data("/api/tools/registry",{env:makeEnv({ai:false})});
 const ai=body.tools.find(t=>t.id==="workers_ai_chat");
 assert.equal(ai.available,false);
 assert.match(ai.explanation,/AI absent/);
}
{
 const {body}=await data("/api/tools/orchestration/select?q=écris%20du%20code");
 assert.equal(body.task,"code");
 assert.equal(body.selected_model,"@cf/meta/llama-3.3-70b-instruct-fp8-fast");
 assert.equal(body.simulation,true);
 assert.equal(body.within_cost_limit,true);
 assert.equal(body.candidates.length,2);
}
{
 // Bounded legacy chat: first CODE model fails, the second CODE model must answer.
 const {response,body}=await data("/api/chat",{method:"POST",body:{text:"Écris du code JavaScript"},env:makeEnv({failFirst:true})});
 assert.equal(response.status,200,JSON.stringify(body));
 assert.equal(body.model,"@cf/google/gemma-3-12b-it");
 assert.equal(body.fallback_used,true);
 assert.equal(body.model_attempts,2);
 assert.equal(body.tool_succeeded,true);
}
{
 const {response,body}=await data("/api/chat",{method:"POST",body:{text:"x".repeat(12001)}});
 assert.equal(response.status,413);
 assert.equal(body.code,"MESSAGE_TOO_LONG");
}
{
 const denied=await data("/api/tasks",{method:"POST",body:{type:"email",idempotency_key:"denied"}});
 assert.equal(denied.response.status,403);
 assert.equal(denied.body.code,"HUMAN_APPROVAL_REQUIRED");
 const simulated=await data("/api/tasks",{method:"POST",body:{type:"email",idempotency_key:"simulated",simulation:true,estimated_cost_usd:0.001}});
 assert.equal(simulated.response.status,200);
 assert.equal(simulated.body.executed,false);
 assert.equal(simulated.body.task.state,"simulated");
 const costly=await data("/api/tasks",{method:"POST",body:{type:"read",idempotency_key:"costly",estimated_cost_usd:1}});
 assert.equal(costly.response.status,422);
 assert.equal(costly.body.code,"COST_LIMIT_EXCEEDED");
}
{
 const {body}=await data("/api/tools/media/status");
 assert.equal(body.r2_binding,true);
 assert.equal(body.status,"disabled");
 const upload=await data("/api/media/upload",{method:"POST",body:{}});
 assert.equal(upload.response.status,503);
 assert.equal(upload.body.code,"MEDIA_DISABLED");
 assert.equal(mediaPuts,0,"aucun objet R2 écrit lorsque le module est désactivé");
}
{
 for(const path of ["/professor","/professor/"]){const response=await call(path),body=await response.text();assert.equal(response.status,200);assert.match(body,/capability-panel/);assert.match(body,/api\/tools\/registry/)}
}
{
 const {response,body}=await data("/api/diagnostic");
 assert.equal(response.status,200);
 assert.equal(body.checks.d1.status,"ok");
 assert.equal(body.checks.workers_ai.status,"configured_not_probed");
 assert.equal(body.checks.media_bucket.status,"configured_private_not_probed");
}

console.log("orchestration-registry: 10 groupes de tests réussis");
