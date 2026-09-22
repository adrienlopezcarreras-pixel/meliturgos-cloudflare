import { requireAuth } from "../core/security.js";
import { createDefaultCapabilityBus } from "../capabilities/default-bus.js";
import { attachRequestApproval } from "../security/explicit-approval.js";

export const COMPUTER_API_BASE="/api/computer/v1";
export const COMPUTER_ROUTES=Object.freeze({
 pair:"/api/computer/v1/pair",
 status:"/api/computer/v1/status",
 commands:"/api/computer/v1/commands",
 halt:"/api/computer/v1/halt",
 resume:"/api/computer/v1/resume",
 installer:"/api/computer/v1/installer",
 companion:"/api/computer/v1/companion",
 screenshot:"/api/computer/v1/screenshot"
});
const DEFAULT_APPS=["notepad","calculator","explorer","msedge","firefox","chrome"];

function json(v,s=200,h={}){return Response.json(v,{status:s,headers:{"cache-control":"no-store",...h}})}
function safe(v,n=200){return typeof v==="string"?v.trim().slice(0,n):""}
function bearer(r){const h=r.headers.get("authorization")||"";return /^Bearer\s+/i.test(h)?h.replace(/^Bearer\s+/i,"").trim():""}
async function sha(v){const b=new TextEncoder().encode(String(v||""));const d=new Uint8Array(await crypto.subtle.digest("SHA-256",b));return [...d].map(x=>x.toString(16).padStart(2,"0")).join("")}
function parse(v,f){try{return JSON.parse(v)}catch{return f}}

async function tables(env){
 if(!env?.DB) throw Object.assign(new Error("COMPUTER_DB_REQUIRED"),{code:"COMPUTER_DB_REQUIRED",status:503});
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS computer_devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}")`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS computer_commands(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)`).run();
}
function normalizeDevice(r){if(!r)return null;return {id:r.id,name:r.name,platform:r.platform,capabilities:parse(r.capabilities,[]),allowed_apps:parse(r.allowed_apps,[]),halted:Number(r.halted)===1,created_at:Number(r.created_at||0),last_seen_at:Number(r.last_seen_at||0),online:Date.now()-Number(r.last_seen_at||0)<15000,metadata:parse(r.metadata,{})}}
function normalizeCommand(r){if(!r)return null;return {id:r.id,device_id:r.device_id,session_id:r.session_id,status:r.status,created_at:Number(r.created_at||0),claimed_at:r.claimed_at==null?null:Number(r.claimed_at),finished_at:r.finished_at==null?null:Number(r.finished_at),result:parse(r.result_json,null),error_code:r.error_code||null}}

async function authDevice(request,env){
 await tables(env); const id=safe(request.headers.get("x-mel-computer-id")); const token=bearer(request);
 if(!id||!token)return {ok:false,response:json({ok:false,code:"COMPUTER_AUTH_REQUIRED"},401)};
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? AND token_hash=? LIMIT 1").bind(id,await sha(token)).first();
 if(!row)return {ok:false,response:json({ok:false,code:"COMPUTER_AUTH_INVALID"},401)};
 return {ok:true,device:normalizeDevice(row)};
}

async function pair(request,env){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);
 const b=await request.json().catch(()=>({})); const id=safe(b.computer_id)||crypto.randomUUID();
 const raw=new Uint8Array(32);crypto.getRandomValues(raw);let s="";for(const x of raw)s+=String.fromCharCode(x);const token=btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
 const now=Date.now(),apps=Array.isArray(b.allowed_apps)&&b.allowed_apps.length?b.allowed_apps.slice(0,64):DEFAULT_APPS;
 await env.DB.prepare(`INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,0,?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,name=excluded.name,platform=excluded.platform,capabilities=excluded.capabilities,allowed_apps=excluded.allowed_apps,halted=0,last_seen_at=excluded.last_seen_at,metadata=excluded.metadata`).bind(id,await sha(token),safe(b.name)||"Ordinateur MEL",safe(b.platform)||"windows",JSON.stringify(["computer.use"]),JSON.stringify(apps),now,now,JSON.stringify({version:b.version||null})).run();
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=?").bind(id).first();
 return json({ok:true,computer:normalizeDevice(row),token});
}

async function ownerStatus(request,env,url){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);
 const rows=await env.DB.prepare("SELECT * FROM computer_devices ORDER BY last_seen_at DESC LIMIT 20").all();const devices=(rows.results||[]).map(normalizeDevice);
 const id=url.searchParams.get("computer_id")||devices[0]?.id||"";let commands=[];
 if(id){const q=await env.DB.prepare("SELECT * FROM computer_commands WHERE device_id=? ORDER BY created_at DESC LIMIT 30").bind(id).all();commands=(q.results||[]).map(normalizeCommand)}
 return json({ok:true,devices,selected_id:id||null,commands});
}

async function ownerCommand(request,env){
 const auth=requireAuth(request,env);if(!auth.ok)return auth.response;
 await tables(env);
 const body=await request.json().catch(()=>({}));
 const input={
  computer_id:safe(body.computer_id),
  session_id:safe(body.session_id)||crypto.randomUUID(),
  steps:Array.isArray(body.steps)?body.steps:[],
  allowed_origins:Array.isArray(body.allowed_origins)?body.allowed_origins:[],
  max_steps:Math.max(1,Math.min(100,Number(body.max_steps)||20)),
 };
 const requestId=crypto.randomUUID();
 let context={owner:env.MELITURGOS_USER||"owner",permissions:env.CAPABILITY_PERMISSIONS||[],requestId};
 context=await attachRequestApproval(context,{request,capability:"computer.execute",input,source:"owner-computer-api-confirmation"});
 try{
  const bus=createDefaultCapabilityBus({env});
  const result=await bus.execute("computer.execute",input,context);
  return json(result,202);
 }catch(error){
  return json({ok:false,code:error?.code||error?.message||"COMPUTER_COMMAND_FAILED"},error?.status||409);
 }
}

async function ownerHalt(request,env,halted){const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);const b=await request.json().catch(()=>({}));const id=safe(b.computer_id);await env.DB.prepare("UPDATE computer_devices SET halted=? WHERE id=?").bind(halted?1:0,id).run();const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=?").bind(id).first();return row?json({ok:true,computer:normalizeDevice(row)}):json({ok:false,code:"COMPUTER_NOT_FOUND"},404)}

async function asset(request,env,name){const a=requireAuth(request,env);if(!a.ok)return a.response;if(!env?.ASSETS?.fetch)return json({ok:false,code:"ASSETS_BINDING_UNAVAILABLE"},503);const u=new URL("/"+name,request.url);const r=await env.ASSETS.fetch(new Request(u.toString(),{method:"GET"}));if(!r.ok)return json({ok:false,code:"ASSET_NOT_FOUND"},404);const h=new Headers(r.headers);h.set("content-type","text/plain; charset=utf-8");h.set("content-disposition",`attachment; filename="${name}"`);h.set("cache-control","no-store");return new Response(r.body,{status:200,headers:h})}

async function screenshotView(request,env,url){const a=requireAuth(request,env);if(!a.ok)return a.response;if(!env?.MEDIA_BUCKET)return json({ok:false,code:"MEDIA_BUCKET_UNAVAILABLE"},503);const key=String(url.searchParams.get("key")||"");if(!key.startsWith("computer/screenshots/")||key.includes(".."))return json({ok:false,code:"SCREENSHOT_KEY_INVALID"},400);const o=await env.MEDIA_BUCKET.get(key);if(!o)return json({ok:false,code:"SCREENSHOT_NOT_FOUND"},404);const h=new Headers({"content-type":"image/png","cache-control":"private, max-age=30"});return new Response(o.body,{headers:h})}

async function heartbeat(request,env,a){const b=await request.json().catch(()=>({}));await env.DB.prepare("UPDATE computer_devices SET last_seen_at=?,metadata=? WHERE id=?").bind(Date.now(),JSON.stringify({version:b.version||null,hostname:b.hostname||null,user:b.user||null,screen:b.screen||null,active_window:b.active_window||null}),a.device.id).run();return json({ok:true,server_time:Date.now()})}
async function claim(env,a){if(a.device.halted)return json({ok:true,halted:true,command:null});const r=await env.DB.prepare("SELECT * FROM computer_commands WHERE device_id=? AND status=? ORDER BY created_at ASC LIMIT 1").bind(a.device.id,"PENDING").first();if(!r)return json({ok:true,halted:false,command:null});await env.DB.prepare("UPDATE computer_commands SET status=?,claimed_at=? WHERE id=? AND status=?").bind("RUNNING",Date.now(),r.id,"PENDING").run();return json({ok:true,halted:false,command:{id:r.id,session_id:r.session_id,plan:parse(r.plan_json,{})}})}
async function result(request,env,a){const b=await request.json().catch(()=>({}));const id=safe(b.command_id);await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,result_json=?,error_code=? WHERE id=? AND device_id=?").bind(b.ok===true?"SUCCEEDED":"FAILED",Date.now(),JSON.stringify(b.result??null),b.error_code?safe(b.error_code):null,id,a.device.id).run();return json({ok:true})}
async function uploadShot(request,env,a,url){if(!env?.MEDIA_BUCKET)return json({ok:false,code:"MEDIA_BUCKET_UNAVAILABLE"},503);const id=safe(url.searchParams.get("command_id"));const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>5*1024*1024)return json({ok:false,code:"SCREENSHOT_SIZE_INVALID"},413);const key=`computer/screenshots/${a.device.id.replace(/[^A-Za-z0-9_.-]/g,"_")}/${id.replace(/[^A-Za-z0-9_.-]/g,"_")}.png`;await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:"image/png"}});return json({ok:true,key,view_url:`${url.origin}${COMPUTER_API_BASE}/screenshot?key=${encodeURIComponent(key)}`})}

export async function maybeHandleComputerApi(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith(COMPUTER_API_BASE+"/"))return null;
 if(url.pathname===COMPUTER_ROUTES.pair&&request.method==="POST")return pair(request,env);
 if(url.pathname===COMPUTER_ROUTES.status&&request.method==="GET")return ownerStatus(request,env,url);
 if(url.pathname===COMPUTER_ROUTES.commands&&request.method==="POST")return ownerCommand(request,env);
 if(url.pathname===COMPUTER_ROUTES.halt&&request.method==="POST")return ownerHalt(request,env,true);
 if(url.pathname===COMPUTER_ROUTES.resume&&request.method==="POST")return ownerHalt(request,env,false);
 if(url.pathname===COMPUTER_ROUTES.installer&&request.method==="GET")return asset(request,env,"MEL-Computer-Setup.ps1");
 if(url.pathname===COMPUTER_ROUTES.companion&&request.method==="GET")return asset(request,env,"MEL-Computer-Companion.ps1");
 if(url.pathname===COMPUTER_ROUTES.screenshot&&request.method==="GET")return screenshotView(request,env,url);
 const a=await authDevice(request,env);if(!a.ok)return a.response;
 if(url.pathname===COMPUTER_API_BASE+"/heartbeat"&&request.method==="POST")return heartbeat(request,env,a);
 if(url.pathname===COMPUTER_ROUTES.commands&&request.method==="GET")return claim(env,a);
 if(url.pathname===COMPUTER_API_BASE+"/result"&&request.method==="POST")return result(request,env,a);
 if(url.pathname===COMPUTER_ROUTES.screenshot&&request.method==="POST")return uploadShot(request,env,a,url);
 return json({ok:false,code:"COMPUTER_ROUTE_NOT_FOUND"},404);
}