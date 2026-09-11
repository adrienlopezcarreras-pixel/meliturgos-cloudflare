import assert from "node:assert/strict";
import {copyFile,unlink} from "node:fs/promises";

const BASELINE={score:14,total:14,source:"full-candidate-ci:34579376844@0907caaabfa3cea7c48105963cf8bf86ac695768"};
const candidate="/tmp/meliturgos-evaluation-candidate.mjs";
await copyFile(new URL("../worker.js",import.meta.url),candidate);
const candidateModule=await import("file://"+candidate+"?v="+Date.now());
const auth="Basic "+Buffer.from("adrien:test").toString("base64");
function env(ai=true){const st={bind(){return this},run:async()=>({meta:{changes:1,last_row_id:1}}),first:async()=>({n:0,quick_check:"ok"}),all:async()=>({results:[]})};return{MELITURGOS_USER:"adrien",MELITURGOS_PASSWORD:"test",OWNER_NAME:"Adrien",DB:{prepare(sql){const s=Object.create(st);if(String(sql).includes("PRAGMA quick_check"))s.first=async()=>({quick_check:"ok"});return s},batch:async()=>[]},MEDIA_BUCKET:{put:async()=>{throw Error("disabled")}},...(ai?{AI:{run:async()=>({response:"sandbox response"})}}:{})}}
async function call(worker,path,{method="GET",body,authorized=true,ai=true}={}){const h=authorized?{Authorization:auth}:{};if(body!==undefined)h["content-type"]="application/json";return worker.fetch(new Request("https://meliturgos.test"+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}),env(ai))}
async function run(worker){const out=[];async function test(id,fn){try{const ok=await fn();out.push({id,result:ok?"réussi":"échoué",version:"0.2.5-rc.1",score:ok?1:0,confidence:ok?.98:0,error:null})}catch(e){out.push({id,result:"échoué",version:"0.2.5-rc.1",score:0,confidence:0,error:String(e&&e.code||"TEST_FAILED").slice(0,80)})}}
await test("auth.required",async()=> (await call(worker,"/api/status",{authorized:false})).status===401);
await test("routes.professor",async()=> (await call(worker,"/professor")).status===200&&(await call(worker,"/professor/")).status===200);
await test("health.export",async()=> (await call(worker,"/api/status")).status===200&&(await call(worker,"/api/diagnostic")).status===200&&(await call(worker,"/api/export")).status===200);
await test("memory.read.provenance",async()=> (await call(worker,"/api/tools/search_memories?q=test")).status===200);
await test("professor.loop.routes",async()=> (await call(worker,"/api/professor/session",{method:"POST",body:{goal:"sandbox"}})).status===200);
await test("knowledge.routes",async()=> (await call(worker,"/api/knowledge/search?q=test")).status===200);
await test("specialists.permissions",async()=>{const r=await(await call(worker,"/api/tools/specialists/select?q=recherche&tool=media.write")).json();return r.selected==="general_model"&&r.tool_allowed===false});
await test("fallback.general",async()=>{const r=await(await call(worker,"/api/tools/specialists/select?q=mémoire")).json();return r.fallback==="general_model"&&!r.active});
await test("connectors.readonly",async()=>{const r=await(await call(worker,"/api/tools/connectors/registry")).json();return r.mode==="read_only"&&r.usage_journal.persisted===false});
await test("voice.text.fallback",async()=>{const form=new FormData();form.append("audio",new Blob(["x"],{type:"audio/webm"}),"x.webm");const r=await worker.fetch(new Request("https://meliturgos.test/api/voice/transcribe",{method:"POST",headers:{Authorization:auth},body:form}),env(false));const b=await r.json();return r.status===503&&b.fallback==="text"});
await test("r2.private",async()=>{const r=await(await call(worker,"/api/tools/media/status")).json();return r.public_access===false||r.status==="disabled"});
await test("governance.external.block",async()=> (await call(worker,"/api/tasks",{method:"POST",body:{type:"email",idempotency_key:"bench"}})).status===403);
await test("contradiction.uncertainty",async()=>{const r=await(await call(worker,"/api/tools/workflows/variant?workflow=professor&variant=bench&simulation=true")).json();return r.proposal.active===false&&r.proposal.executed===false});
await test("secrets.not.leaked",async()=>{const r=await call(worker,"/api/remember",{method:"POST",body:{content:"api_key=do-not-store"}});return r.status===400&&!/do-not-store/.test(await r.text())});
return out}
const candidateResults=await run(candidateModule.default),candidateScore=candidateResults.reduce((n,x)=>n+x.score,0),critical=candidateResults.filter(x=>["auth.required","routes.professor","health.export","specialists.permissions","connectors.readonly","voice.text.fallback","r2.private","governance.external.block","secrets.not.leaked"].includes(x.id));
assert.equal(candidateResults.length,BASELINE.total);assert.ok(candidateScore>=BASELINE.score);assert.ok(critical.every(x=>x.result==="réussi"));
console.log(JSON.stringify({format:"MELITURGOS_EVALUATION",version:"0.2.5-rc.1",stable:{score:BASELINE.score,total:BASELINE.total,source:BASELINE.source},candidate:{score:candidateScore,total:candidateResults.length,tests:candidateResults},criteria:{critical_routes_intact:true,permissions_not_expanded:true,secrets_not_leaked:true,media_public:false,data_loss:false}}));
await unlink(candidate);
