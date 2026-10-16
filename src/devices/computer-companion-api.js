import {evaluateDesktopViewClaim} from "../portability/companion-desktop-view-claim-policy.js";
import { requireAuth } from "../core/security.js";
import { authorizeGitHubActionsOidcRequest } from "../security/github-actions-oidc.js";
import { evaluateComputerUsePlan } from "./computer-use.js";
import { getVerifiedShardVaultCodeArchive } from "../continuity/shardvault-runtime.js";
import { isLocalSovereigntyAction } from "../portability/local-sovereignty-actions.js";
import {
 evaluateMeasuredOptionalCompute,
 shouldInvalidateOptionalComputeTelemetryOnHeartbeat,
 evaluateQueuedOptionalComputeClaim,
 evaluateOptionalAiResultDeadline,
 evaluateOptionalAiResultProof,
 getOwnerCompanionComputeReadiness,
} from "./companion-compute-admission.js";
import { miniReadOnlyPcCommand } from "./mini-readonly-companion.js";
import { miniMaintenanceAssessCommand } from "./mini-maintenance-companion.js";
import { companionBleDiagnosticsCommand } from "./companion-ble-diagnostics.js";
import { miniFirmwareStageCommand } from "./mini-firmware-stage-companion.js";
import { androidMaintenancePcCommand } from "./android-maintenance-companion.js";
import { androidStagePcCommand } from "./android-apk-stage-companion.js";
import { readAndroidTriadActivityForCompanion } from "./triad-activity-readonly.js";

export const COMPUTER_API_BASE="/api/computer/v1";
export const COMPUTER_ROUTES=Object.freeze({
 pairCode:"/api/computer/v1/pair-code",
 pair:"/api/computer/v1/pair",
 revoke:"/api/computer/v1/revoke",
 status:"/api/computer/v1/status",
 controlState:"/api/computer/v1/control-state",
 commands:"/api/computer/v1/commands",
 desktopViewRequest:"/api/computer/v1/desktop-view-request",
 halt:"/api/computer/v1/halt",
 resume:"/api/computer/v1/resume",
 installer:"/api/computer/v1/installer",
 companion:"/api/computer/v1/companion",
 companions:"/api/computer/v1/companions",
 triadActivity:"/api/computer/v1/triad-activity",
 screenshot:"/api/computer/v1/screenshot",
 power:"/api/computer/v1/power",
 sovereigntyArchive:"/api/computer/v1/sovereignty-code-archive",
 sovereigntyCommand:"/api/computer/v1/sovereignty-command",
 pcControl:"/api/computer/v1/pc-control"
});
const DEFAULT_APPS=["notepad","calculator","explorer","msedge","firefox","chrome"];
const PAIR_TTL_MS=10*60*1000;
const MINI_ONLINE_MS=60*1000;
const ANDROID_ONLINE_MS=35*60*1000;
const MIN_SOVEREIGN_AI_ENGINE_VERSION="1.4.1";

function versionAtLeast(actual,required){
 const a=String(actual||"").match(/^\d+(?:\.\d+){0,3}/)?.[0]?.split(".").map(Number)||[];
 const r=String(required||"").match(/^\d+(?:\.\d+){0,3}/)?.[0]?.split(".").map(Number)||[];
 if(!a.length||!r.length)return false;
 for(let i=0;i<Math.max(a.length,r.length);i++){
  const av=Number(a[i]||0),rv=Number(r[i]||0);
  if(av>rv)return true;if(av<rv)return false;
 }
 return true;
}


function json(v,s=200,h={}){return Response.json(v,{status:s,headers:{"cache-control":"no-store",...h}})}
function safe(v,n=200){return typeof v==="string"?v.trim().slice(0,n):""}
function bearer(r){const h=r.headers.get("authorization")||"";return /^Bearer\s+/i.test(h)?h.replace(/^Bearer\s+/i,"").trim():""}
async function sha(v){const b=new TextEncoder().encode(String(v||""));const d=new Uint8Array(await crypto.subtle.digest("SHA-256",b));return [...d].map(x=>x.toString(16).padStart(2,"0")).join("")}
function parse(v,f){try{return JSON.parse(v)}catch{return f}}
function pairCode(){const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);return [...bytes].map(byte=>alphabet[byte%alphabet.length]).join("")}

async function tables(env){
 if(!env?.DB) throw Object.assign(new Error("COMPUTER_DB_REQUIRED"),{code:"COMPUTER_DB_REQUIRED",status:503});
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS computer_devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}")`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS computer_commands(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)`).run();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS computer_pair_codes(code_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER)`).run();
}
function normalizeDevice(r){if(!r)return null;const metadata=parse(r.metadata,{});return {id:r.id,name:r.name,platform:r.platform,capabilities:parse(r.capabilities,[]),allowed_apps:parse(r.allowed_apps,[]),allowed_paths:Array.isArray(metadata.allowed_paths)?metadata.allowed_paths:[],halted:Number(r.halted)===1,created_at:Number(r.created_at||0),last_seen_at:Number(r.last_seen_at||0),online:Date.now()-Number(r.last_seen_at||0)<35000,metadata}}
function normalizeCommand(r){if(!r)return null;return {id:r.id,device_id:r.device_id,session_id:r.session_id,status:r.status,created_at:Number(r.created_at||0),claimed_at:r.claimed_at==null?null:Number(r.claimed_at),finished_at:r.finished_at==null?null:Number(r.finished_at),result:parse(r.result_json,null),error_code:r.error_code||null}}

async function authDevice(request,env){
 await tables(env); const id=safe(request.headers.get("x-mel-computer-id")); const token=bearer(request);
 if(!id||!token)return {ok:false,response:json({ok:false,code:"COMPUTER_AUTH_REQUIRED"},401)};
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? AND token_hash=? LIMIT 1").bind(id,await sha(token)).first();
 if(!row)return {ok:false,response:json({ok:false,code:"COMPUTER_AUTH_INVALID"},401)};
 return {ok:true,device:normalizeDevice(row)};
}

async function createPairCode(request,env){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);
 const code=pairCode(),now=Date.now();
 await env.DB.prepare("DELETE FROM computer_pair_codes WHERE expires_at<? OR used_at IS NOT NULL").bind(now).run();
 await env.DB.prepare("INSERT INTO computer_pair_codes(code_hash,created_at,expires_at,used_at) VALUES(?,?,?,NULL)").bind(await sha(code),now,now+PAIR_TTL_MS).run();
 return json({ok:true,code,expires_at:now+PAIR_TTL_MS,ttl_seconds:PAIR_TTL_MS/1000});
}

async function consumePairCode(env,raw){
 const code=safe(raw,32).toUpperCase();if(!code)return false;const hash=await sha(code),now=Date.now();
 const row=await env.DB.prepare("SELECT code_hash FROM computer_pair_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1").bind(hash,now).first();
 if(!row)return false;
 await env.DB.prepare("UPDATE computer_pair_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL").bind(now,hash).run();
 return true;
}

async function pair(request,env){
 const b=await request.json().catch(()=>({}));
 const owner=requireAuth(request,env);
 const requestedPairCode=safe(b.pair_code,32);
 if(!owner.ok&&!requestedPairCode)return owner.response;
 await tables(env);
 if(!owner.ok){
   const valid=await consumePairCode(env,requestedPairCode);
   if(!valid)return json({ok:false,code:"COMPUTER_PAIR_CODE_INVALID_OR_EXPIRED"},401);
 }
 const id=safe(b.computer_id)||crypto.randomUUID();
 const raw=new Uint8Array(32);crypto.getRandomValues(raw);let s="";for(const x of raw)s+=String.fromCharCode(x);const token=btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
 const now=Date.now(),apps=Array.isArray(b.allowed_apps)&&b.allowed_apps.length?b.allowed_apps.slice(0,64):DEFAULT_APPS;
 await env.DB.prepare(`INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,0,?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,name=excluded.name,platform=excluded.platform,capabilities=excluded.capabilities,allowed_apps=excluded.allowed_apps,halted=0,last_seen_at=excluded.last_seen_at,metadata=excluded.metadata`).bind(id,await sha(token),safe(b.name)||"Ordinateur MEL",safe(b.platform)||"windows",JSON.stringify(["computer.use"]),JSON.stringify(apps),now,now,JSON.stringify({version:b.version||null,allowed_paths:Array.isArray(b.allowed_paths)?b.allowed_paths.slice(0,64):[]})).run();
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=?").bind(id).first();
 return json({ok:true,computer:normalizeDevice(row),token,token_storage:"DPAPI_CURRENT_USER_REQUIRED"});
}

async function ownerStatus(request,env,url){
 const a=await authorizeOwnerOrPcProof(request,env);if(!a.ok)return a.response;await tables(env);
 const rows=await env.DB.prepare("SELECT * FROM computer_devices ORDER BY last_seen_at DESC LIMIT 20").all();
 const statusAt=Date.now();
 const devices=(rows.results||[]).map(normalizeDevice).map(device=>({
   ...device,local_compute_admission:getOwnerCompanionComputeReadiness(device,{now:statusAt})
 }));
 const id=url.searchParams.get("computer_id")||devices[0]?.id||"";let commands=[];
 if(id){const q=await env.DB.prepare("SELECT * FROM computer_commands WHERE device_id=? ORDER BY created_at DESC LIMIT 30").bind(id).all();commands=(q.results||[]).map(normalizeCommand)}
 return json({ok:true,devices,selected_id:id||null,commands});
}

function approvals(session,steps){const sensitive=new Set(["keyboard.press","keyboard.type","browser.navigate","browser.capture","browser.click","browser.scroll","browser.type","browser.press","browser.find","browser.find-next","browser.find-previous","browser.next-tab","browser.previous-tab","browser.select-tab","browser.zoom-in","browser.zoom-out","browser.zoom-reset","browser.open-downloads","browser.open-history","browser.focus-address","browser.back","browser.new-tab","browser.close-tab","browser.reopen-tab","browser.bookmark-page","browser.forward","browser.reload","app.open","app.close","file.open","file.close","clipboard.read","clipboard.write"]);return steps.filter(x=>sensitive.has(String(x.action||""))).map(x=>({approved:true,session_id:session,step_id:String(x.id),action:String(x.action)}))}

async function ownerCommand(request,env){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);const b=await request.json().catch(()=>({}));
 const id=safe(b.computer_id);const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(id).first();const device=normalizeDevice(row);
 if(!device)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404); if(device.halted)return json({ok:false,code:"OWNER_HALT_ACTIVE"},409);
 const session=safe(b.session_id)||crypto.randomUUID();const steps=(Array.isArray(b.steps)?b.steps:[]).map((x,i)=>({...x,id:String(x?.id||`step-${i+1}`)}));
 const requestedPaths=Array.isArray(b.allowed_paths)&&b.allowed_paths.length?b.allowed_paths:device.allowed_paths;
 const pairedPaths=new Set(device.allowed_paths.map(x=>String(x).toLowerCase()));
 const effectivePaths=requestedPaths.filter(x=>pairedPaths.has(String(x).toLowerCase()));
 const plan=evaluateComputerUsePlan({session_id:session,owner_halt:false,device:{id:device.id,capabilities:device.capabilities},sandbox:{allowed_apps:device.allowed_apps,allowed_paths:effectivePaths,allowed_origins:Array.isArray(b.allowed_origins)?b.allowed_origins:[],max_steps:Math.max(1,Math.min(100,Number(b.max_steps)||20))},approvals:b.approve_sensitive===true?approvals(session,steps):(Array.isArray(b.approvals)?b.approvals:[]),steps});
 if(!plan.allowed)return json({ok:false,code:plan.reason,decisions:plan.decisions},403);const cid=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)").bind(cid,device.id,session,JSON.stringify(plan.request),"PENDING",Date.now()).run();
 return json({ok:true,command_id:cid,status:"PENDING",decisions:plan.decisions},202);
}

async function ownerDesktopViewRequest(request,env){
 const owner=requireAuth(request,env);if(!owner.ok)return owner.response;
 await tables(env);
 const b=await request.json().catch(()=>({}));
 const id=safe(b.computer_id);
 if(!id)return json({ok:false,code:"COMPUTER_ID_REQUIRED"},400);
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(id).first();
 const device=normalizeDevice(row);
 if(!device)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404);
 if(String(device.platform||"").toLowerCase()!=="windows")return json({ok:false,code:"DESKTOP_VIEW_WINDOWS_REQUIRED"},409);
 if(device.halted)return json({ok:false,code:"OWNER_HALT_ACTIVE"},409);
 const now=Date.now();
 // The prior grant is set locally in the Windows Companion; the caller
 // cannot authorize its own request by sending local_approved in JSON.
 // Reject stale UI heartbeat and stale engine presence independently.
 if(!device.online||device.last_seen_at>now||now-device.last_seen_at>20_000)
  return json({ok:false,code:"DESKTOP_VIEW_DEVICE_OFFLINE"},409);
 if(device.metadata?.remote_access_enabled!==true)
  return json({ok:false,code:"REMOTE_ACCESS_DISABLED_LOCALLY"},403);
 const engineSeen=Number(device.metadata?.engine_heartbeat_at);
 if(!Number.isFinite(engineSeen)||engineSeen<=0||engineSeen>now||now-engineSeen>20_000)
  return json({ok:false,code:"DESKTOP_VIEW_ENGINE_OFFLINE"},409);
 const commandId=crypto.randomUUID();
 const sessionId=crypto.randomUUID();
 const expiresAt=now+90_000;
 const plan={schema:"mel.companion.desktop-view-request/v1",action:"desktop.view.request",
  session_id:sessionId,device_id:device.id,expires_at:expiresAt,
  requires_local_stop:true,screen_capture_only:true};
 const write=await env.DB.prepare(
  "INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)"
 ).bind(commandId,device.id,sessionId,JSON.stringify(plan),"PENDING",now).run();
 if(!write||write.success===false||Number(write.meta?.changes)!==1)
  return json({ok:false,code:"DESKTOP_VIEW_QUEUE_WRITE_UNCONFIRMED"},503);
 return json({ok:true,command_id:commandId,computer_id:device.id,
  status:"PENDING",expires_at:expiresAt},202);
}

async function ownerHalt(request,env,halted){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);
 const b=await request.json().catch(()=>({}));const id=safe(b.computer_id);
 const updated=await env.DB.prepare("UPDATE computer_devices SET halted=? WHERE id=?").bind(halted?1:0,id).run();
 if(!updated||updated.success===false)return json({ok:false,code:"COMPUTER_HALT_WRITE_UNCONFIRMED"},503);
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=?").bind(id).first();
 if(!row)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404);
 let cancelledPending=0;
 if(halted){
  // STOP is not a pause: queued work must not resume without new approval.
  // A command already RUNNING still requires cooperative local cancellation.
  const cancelled=await env.DB.prepare(
   "UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE device_id=? AND status=?"
  ).bind("FAILED",Date.now(),"OWNER_HALT_ACTIVE",id,"PENDING").run();
  if(!cancelled||cancelled.success===false)
   return json({ok:false,code:"COMPUTER_HALT_QUEUE_CANCELLATION_FAILED"},503);
  cancelledPending=Number(cancelled.meta?.changes||0);
 }
 let cancelledRunning=0;
 if(halted){
  // A running command must never report SUCCESS after STOP, even after RESUME.
  // The Windows engine cooperatively checks between steps; a blocking native
  // operation may still need to return before its next checkpoint.
  const cancelled=await env.DB.prepare(
   "UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE device_id=? AND status=?"
  ).bind("FAILED",Date.now(),"OWNER_HALT_ACTIVE",id,"RUNNING").run();
  if(!cancelled||cancelled.success===false)
   return json({ok:false,code:"COMPUTER_HALT_RUNNING_CANCELLATION_FAILED"},503);
  cancelledRunning=Number(cancelled.meta?.changes||0);
 }
 return json({ok:true,computer:normalizeDevice(row),cancelled_pending:cancelledPending,cancelled_running:cancelledRunning});
}

const PC_CONTROL_ACTIONS=new Set([
 "serial.list","serial.read","serial.inspect","serial.hard_reset",
 "process.list","process.start","process.kill",
 "file.list","file.read_text","file.write_text",
 "system.info","system.exec","mini.readonly.discover","mini.readonly.security","mini.readonly.backup","mini.readonly.backup.status","mini.readonly.backup.audit","mini.maintenance.assess","mini.android.ble.diagnose","mini.maintenance.stage","android.maintenance.assess","android.maintenance.stage","android.maintenance.install"
]);
const PC_CONTROL_PROOF_ACTIONS=new Set(["system.info","serial.list","serial.read","serial.inspect","mini.readonly.discover","process.list","mini.readonly.backup.audit","mini.maintenance.assess","mini.android.ble.diagnose","android.maintenance.assess"]);

async function authorizeOwnerOrPcProof(request,env,{action=null}={}){
 const owner=requireAuth(request,env);if(owner.ok)return {ok:true,kind:"owner"};
 if(action&&!PC_CONTROL_PROOF_ACTIONS.has(action))return owner;
 const oidc=await authorizeGitHubActionsOidcRequest(request,env,{
  allowedWorkflows:["cloudflare-api-relay.yml"],
  allowedEvents:["workflow_dispatch","schedule","workflow_run"]
 });
 if(oidc.ok)return {ok:true,kind:"github-oidc",identity:oidc.identity};
 return owner;
}

async function ownerPcControl(request,env){
 const b=await request.json().catch(()=>({}));
 const id=safe(b.computer_id),action=safe(b.action,160);
 const a=await authorizeOwnerOrPcProof(request,env,{action});if(!a.ok)return a.response;await tables(env);
 const payload=b.payload&&typeof b.payload==="object"?b.payload:{};
 if(!id)return json({ok:false,code:"COMPUTER_ID_REQUIRED"},400);
 if(!PC_CONTROL_ACTIONS.has(action))return json({ok:false,code:"PC_CONTROL_ACTION_NOT_ALLOWED"},403);
 if(action.startsWith("mini.readonly.")&&a.kind!=="owner"&&!["mini.readonly.discover","mini.readonly.backup.audit"].includes(action))return json({ok:false,code:"MINI_READONLY_OWNER_ONLY"},403);
 if((action==="mini.readonly.security"||action==="mini.readonly.backup")&&payload.ack_bootloader_reset!==true)return json({ok:false,code:"MINI_BOOTLOADER_RESET_ACK_REQUIRED"},400);
 if(action==="mini.readonly.backup"&&payload.ack_local_backup!==true)return json({ok:false,code:"MINI_BACKUP_ACK_REQUIRED"},400);
 if(action==="mini.maintenance.stage"&&(a.kind!=="owner"||payload.ack_local_firmware_stage!==true))
  return json({ok:false,code:"MINI_FIRMWARE_STAGE_OWNER_CONFIRMATION_REQUIRED"},403);
 if(action==="android.maintenance.stage"&&
    (a.kind!=="owner"||payload.ack_local_apk_stage!==true))
  return json({ok:false,code:"ANDROID_APK_STAGE_OWNER_CONFIRMATION_REQUIRED"},403);
 if(action==="android.maintenance.install"){
  if(a.kind!=="owner")return json({ok:false,code:"ANDROID_INSTALL_OWNER_ONLY"},403);
  if(payload.confirmation!=="INSTALL_MEL_ANDROID_APPROVED"||payload.ack_wifi_adb_pairing!==true||payload.ack_local_apk_backup!==true)
   return json({ok:false,code:"ANDROID_APK_INSTALL_CONFIRMATION_REQUIRED"},403);
 }
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(id).first();
 const device=normalizeDevice(row);
 if(!device)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404);
 if(device.halted)return json({ok:false,code:"OWNER_HALT_ACTIVE"},409);
 if(String(device.platform||"").toLowerCase()!=="windows")return json({ok:false,code:"PC_CONTROL_WINDOWS_REQUIRED"},409);
 if(!device.online)return json({ok:false,code:"COMPUTER_OFFLINE"},409);
 if(["mini.readonly.discover","mini.readonly.backup.audit"].includes(action)&&device.metadata?.remote_access_enabled!==true)return json({ok:false,code:"REMOTE_ACCESS_DISABLED_LOCALLY"},403);
 if(["mini.maintenance.assess","mini.android.ble.diagnose","mini.maintenance.stage","android.maintenance.assess","android.maintenance.stage","android.maintenance.install"].includes(action)&&device.metadata?.remote_access_enabled!==true)return json({ok:false,code:"REMOTE_ACCESS_DISABLED_LOCALLY"},403);
 if(device.metadata?.remote_access_enabled!==true&&a.kind!=="github-oidc")return json({ok:false,code:"REMOTE_ACCESS_DISABLED_LOCALLY"},403);
 let effectiveAction=action;
 let effectivePayload=payload;
 if(a.kind==="github-oidc"){
  if(action==="serial.read"){
   const port=safe(payload.port,16).toUpperCase();
   if(!/^COM\d{1,3}$/.test(port))return json({ok:false,code:"SERIAL_PORT_INVALID"},400);
   const durationMs=Math.max(250,Math.min(3000,Number(payload.duration_ms)||1500));
   effectivePayload={port,baud:115200,duration_ms:durationMs};
  }else if(action==="serial.inspect"){
   const port=safe(payload.port,16).toUpperCase();
   if(!/^COM\d{1,3}$/.test(port))return json({ok:false,code:"SERIAL_PORT_INVALID"},400);
   effectiveAction="system.exec";
   const escaped=port.replace(/'/g,"''");
   effectivePayload={
    command:`$port='${escaped}';$pnp=@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { ([string]$_.Name) -like "*($port)*" -or ([string]$_.Caption) -like "*($port)*" } | Select-Object -First 5 Name,Caption,PNPDeviceID,Manufacturer,Status,Service,ClassGuid);$serial=@(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | Where-Object { ([string]$_.DeviceID).ToUpperInvariant() -eq $port } | Select-Object -First 5 DeviceID,Name,PNPDeviceID,ProviderType,Status);$py=@(Get-Command py,python,python3 -ErrorAction SilentlyContinue | Select-Object -First 3 Name,Source);[ordered]@{action='serial.inspect';port=$port;pnp=$pnp;serial=$serial;python=$py}|ConvertTo-Json -Depth 5 -Compress`,
    timeout_ms:15000
   };
  }else if(action==="android.maintenance.assess"){
   effectiveAction="system.exec";
   effectivePayload={...androidMaintenancePcCommand(action),require_success_exit:true};
  }else if(action==="mini.android.ble.diagnose"){
   const port=safe(payload.port,16).toUpperCase();
   if(!/^COM\d{1,3}$/.test(port))return json({ok:false,code:"MINI_DIAGNOSTICS_PORT_INVALID"},400);
   effectiveAction="system.exec";
   effectivePayload=companionBleDiagnosticsCommand(port);
  }else if(action==="mini.maintenance.assess"){
   effectiveAction="system.exec";
   effectivePayload=miniMaintenanceAssessCommand();
  }else if(action==="mini.readonly.backup.audit"){
   effectiveAction="system.exec";
   effectivePayload=miniReadOnlyPcCommand(action,"COM3");
  }else if(action==="mini.readonly.discover"){
   const port=safe(payload.port,16).toUpperCase();
   if(!/^COM\d{1,3}$/.test(port))return json({ok:false,code:"SERIAL_PORT_INVALID"},400);
   effectiveAction="system.exec";
   effectivePayload=miniReadOnlyPcCommand(action,port);
  }else{
   effectivePayload={};
  }
 }
 if(action==="mini.android.ble.diagnose"&&a.kind==="owner"){
  const port=safe(payload.port,16).toUpperCase();
  if(!/^COM\d{1,3}$/.test(port))return json({ok:false,code:"MINI_DIAGNOSTICS_PORT_INVALID"},400);
  effectiveAction="system.exec";
  effectivePayload=companionBleDiagnosticsCommand(port);
 }else if(action==="android.maintenance.assess"&&a.kind==="owner"){
  effectiveAction="system.exec";
  effectivePayload={...androidMaintenancePcCommand(action),require_success_exit:true};
 }else if(action==="android.maintenance.stage"&&a.kind==="owner"){
  effectiveAction="system.exec";
  effectivePayload={...androidStagePcCommand({filename:safe(payload.filename,125),sha256:safe(payload.sha256,64)}),require_success_exit:true};
 }else if(action==="android.maintenance.install"&&a.kind==="owner"){
  effectiveAction="system.exec";
  effectivePayload={...androidMaintenancePcCommand(action,{serial:safe(payload.serial,32),sha256:safe(payload.sha256,64)}),require_success_exit:true};
 }else if(action==="mini.maintenance.stage"&&a.kind==="owner"){
  effectiveAction="system.exec";
  effectivePayload={...miniFirmwareStageCommand({filename:safe(payload.filename,125),sha256:safe(payload.sha256,64)}),require_success_exit:true};
 }else if(action==="mini.maintenance.assess"&&a.kind==="owner"){
  effectiveAction="system.exec";
  effectivePayload=miniMaintenanceAssessCommand();
 }else if(action==="mini.readonly.backup.audit"&&a.kind==="owner"){
  effectiveAction="system.exec";
  effectivePayload=miniReadOnlyPcCommand(action,null);
 }else if(action.startsWith("mini.readonly.")&&a.kind==="owner"){
  if(action==="mini.readonly.backup.status"){ const jobId=safe(payload.job_id,32).toLowerCase();if(!/^[a-f0-9]{32}$/.test(jobId))return json({ok:false,code:"MINI_BACKUP_JOB_ID_INVALID"},400); }
  if(action==="mini.readonly.backup"&&payload.ack_local_backup!==true)return json({ok:false,code:"MINI_BACKUP_ACK_REQUIRED"},400);
  const port=action==="mini.readonly.backup.status"?null:safe(payload.port,16).toUpperCase();
  if(port!==null&&!/^COM\d{1,3}$/.test(port))return json({ok:false,code:"MINI_READONLY_PORT_INVALID"},400);
  effectiveAction="system.exec";
  effectivePayload=miniReadOnlyPcCommand(action,port,action==="mini.readonly.backup.status"?safe(payload.job_id,32).toLowerCase():null);
 }
 const session=safe(b.session_id)||crypto.randomUUID();
 const cid=crypto.randomUUID();
 const plan={schema:"mel.devices.pc-control.v1",owner_authorized:true,steps:[{id:"pc-control-1",action:effectiveAction,payload:effectivePayload}]};
 await env.DB.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)")
  .bind(cid,device.id,session,JSON.stringify(plan),"PENDING",Date.now()).run();
 return json({ok:true,command_id:cid,status:"PENDING",action,device_id:device.id},202);
}

async function ownerSovereigntyCommand(request,env){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);
 const b=await request.json().catch(()=>({}));
 const id=safe(b.computer_id);
 const action=safe(b.action,160);
 const payload=b.payload&&typeof b.payload==="object"?b.payload:{};
 if(!id)return json({ok:false,code:"COMPUTER_ID_REQUIRED"},400);
 if(!isLocalSovereigntyAction(action))return json({ok:false,code:"SOVEREIGNTY_ACTION_NOT_ALLOWED"},403);
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(id).first();
 const device=normalizeDevice(row);
 if(!device)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404);
 if(device.halted)return json({ok:false,code:"OWNER_HALT_ACTIVE"},409);
 if(String(device.platform||"").toLowerCase()!=="windows")return json({ok:false,code:"SOVEREIGNTY_WINDOWS_REQUIRED"},409);
 if(!device.online)return json({ok:false,code:"COMPUTER_OFFLINE"},409);
 const session=safe(b.session_id)||crypto.randomUUID();
 const cid=crypto.randomUUID();
 const plan={
   schema:"mel.sovereignty.local-command/v1",
   owner_authorized:true,
   max_autonomy:b.max_autonomy===true,
   emergency:b.emergency===true,
   steps:[{
     id:"sovereignty-1",
     action,
     payload
   }]
 };
 await env.DB.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)")
   .bind(cid,device.id,session,JSON.stringify(plan),"PENDING",Date.now()).run();
 return json({ok:true,command_id:cid,status:"PENDING",action,device_id:device.id},202);
}

async function ownerPower(request,env){
 const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);
 const b=await request.json().catch(()=>({}));
 const id=safe(b.computer_id),action=safe(b.action,64),confirmation=safe(b.confirmation,128);
 if(!id)return json({ok:false,code:"COMPUTER_ID_REQUIRED"},400);
 if(!["power.off","power.restart"].includes(action))return json({ok:false,code:"POWER_ACTION_INVALID"},400);
 const expected=action==="power.off"?"POWER_OFF_APPROVED":"POWER_RESTART_APPROVED";
 if(confirmation!==expected)return json({ok:false,code:"OWNER_CONFIRMATION_REQUIRED"},403);
 const row=await env.DB.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(id).first();
 const device=normalizeDevice(row);
 if(!device)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404);
 if(String(device.platform||"").toLowerCase()!=="windows")return json({ok:false,code:"POWER_PLATFORM_UNSUPPORTED"},409);
 const session=crypto.randomUUID(),cid=crypto.randomUUID();
 const plan={schema:"mel.devices.power-command.v1",owner_approved:true,steps:[{id:"power-1",action}]};
 await env.DB.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)").bind(cid,device.id,session,JSON.stringify(plan),"PENDING",Date.now()).run();
 return json({ok:true,command_id:cid,status:"PENDING",action,owner_approved:true},202);
}

async function ownerRevoke(request,env){const a=requireAuth(request,env);if(!a.ok)return a.response;await tables(env);const b=await request.json().catch(()=>({}));const id=safe(b.computer_id);if(!id)return json({ok:false,code:"COMPUTER_ID_REQUIRED"},400);const row=await env.DB.prepare("SELECT id FROM computer_devices WHERE id=?").bind(id).first();if(!row)return json({ok:false,code:"COMPUTER_NOT_FOUND"},404);await env.DB.prepare("DELETE FROM computer_commands WHERE device_id=?").bind(id).run();await env.DB.prepare("DELETE FROM computer_devices WHERE id=?").bind(id).run();return json({ok:true,computer_id:id,revoked:true})}

async function asset(request,env,name,{allowDevice=false}={}){const owner=requireAuth(request,env);if(!owner.ok){if(!allowDevice)return owner.response;const device=await authDevice(request,env);if(!device.ok)return device.response}if(!env?.ASSETS?.fetch)return json({ok:false,code:"ASSETS_BINDING_UNAVAILABLE"},503);const u=new URL("/"+name,request.url);const r=await env.ASSETS.fetch(new Request(u.toString(),{method:"GET"}));if(!r.ok)return json({ok:false,code:"ASSET_NOT_FOUND"},404);const h=new Headers(r.headers);h.set("content-type","text/plain; charset=utf-8");h.set("content-disposition",`attachment; filename="${name}"`);h.set("cache-control","no-store");return new Response(r.body,{status:200,headers:h})}

async function screenshotView(request,env,url){
 const a=requireAuth(request,env);if(!a.ok)return a.response;
 if(!env?.MEDIA_BUCKET)return json({ok:false,code:"MEDIA_BUCKET_UNAVAILABLE"},503);
 const key=String(url.searchParams.get("key")||"");
 // Never treat an owner-authenticated URL as a durable access grant.
 // Resolve it to the original command/device so HALT and revocation still apply.
 const match=/^computer\/screenshots\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\.png$/.exec(key);
 if(!match||key.includes(".."))return json({ok:false,code:"SCREENSHOT_KEY_INVALID"},400);
 if(!env?.DB)return json({ok:false,code:"COMPUTER_DB_REQUIRED"},503);
 const row=await env.DB.prepare(
  "SELECT c.id,c.device_id,c.status,c.plan_json,d.halted,d.metadata FROM computer_commands c JOIN computer_devices d ON d.id=c.device_id WHERE c.id=? LIMIT 1"
 ).bind(match[2]).first();
 if(!row||
    row.device_id.replace(/[^A-Za-z0-9_.-]/g,"_")!==match[1]||
    row.id.replace(/[^A-Za-z0-9_.-]/g,"_")!==match[2]||
    !["RUNNING","SUCCEEDED"].includes(row.status))
  return json({ok:false,code:"SCREENSHOT_ACCESS_REVOKED_OR_UNKNOWN"},404);
 if(Number(row.halted)===1)
  return json({ok:false,code:"SCREENSHOT_OWNER_HALT"},409);
 const metadata=parse(row.metadata,{});
 if(metadata.remote_access_enabled!==true)
  return json({ok:false,code:"SCREENSHOT_LOCAL_ACCESS_REVOKED"},409);
 const plan=parse(row.plan_json,{});
 if(plan.schema==="mel.companion.desktop-view-request/v1"||plan.action==="desktop.view.request"){
  if(plan.schema!=="mel.companion.desktop-view-request/v1"||
     plan.action!=="desktop.view.request"||plan.screen_capture_only!==true||
     plan.requires_local_stop!==true||plan.device_id!==row.device_id||
     !Number.isFinite(Number(plan.expires_at))||Number(plan.expires_at)<=Date.now())
   return json({ok:false,code:"SCREENSHOT_VIEW_EXPIRED_OR_REVOKED"},409);
 }
 let object;
 try{object=await env.MEDIA_BUCKET.get(key)}
 catch{return json({ok:false,code:"SCREENSHOT_STORAGE_UNAVAILABLE"},503)}
 if(!object)return json({ok:false,code:"SCREENSHOT_NOT_FOUND"},404);
 const headers=new Headers({"content-type":"image/png","cache-control":"no-store","x-content-type-options":"nosniff"});
 return new Response(object.body,{headers});
}

async function sovereigntyCodeArchive(request,env,url){
 const a=await authDevice(request,env);if(!a.ok)return a.response;
 if(a.device.halted)return json({ok:false,code:"OWNER_HALT_ACTIVE"},409);
 if(String(a.device.platform||"").toLowerCase()!=="windows")return json({ok:false,code:"SOVEREIGNTY_ARCHIVE_WINDOWS_REQUIRED"},409);
 const expected=safe(url.searchParams.get("sha"),80).toLowerCase();
 const archive=await getVerifiedShardVaultCodeArchive(env);
 if(!archive?.ok)return json({ok:false,code:archive?.status||"SOVEREIGNTY_ARCHIVE_UNAVAILABLE",details:{status:archive?.status||null}},503);
 const sourceSha=String(archive.source_sha||"").toLowerCase();
 if(expected&&expected!==sourceSha)return json({ok:false,code:"SOVEREIGNTY_ARCHIVE_SHA_MISMATCH",expected_sha:expected,source_sha:sourceSha},409);
 const headers=new Headers({
   "content-type":"application/gzip",
   "content-length":String(archive.byte_length||archive.bytes?.length||0),
   "cache-control":"no-store",
   "x-content-type-options":"nosniff",
   "x-mel-source-sha":sourceSha,
   "x-mel-archive-sha256":String(archive.sha256||""),
   "x-mel-external-reconstruction-verified":archive.external_reconstruction_verified===true?"1":"0"
 });
 return new Response(archive.bytes,{status:200,headers});
}

async function computerCompanions(env){
 const now=Date.now();
 const devices=[];
 try{
   const rows=await env.DB.prepare(`SELECT t.device_id,t.model,t.last_seen_at,t.revoked_at,
     s.payload_json,s.updated_at
     FROM device_tokens t
     LEFT JOIN device_status s ON s.device_id=t.device_id
     ORDER BY t.last_seen_at DESC LIMIT 20`).all();
   for(const row of rows.results||[]){
     let status={};try{status=JSON.parse(row.payload_json||"{}")}catch{}
     devices.push({
       device_id:row.device_id,
       name:safe(status.name,80)||"MEL MINI",
       model:safe(row.model,120)||"waveshare-terminal",
       kind:"mini",
       online:row.revoked_at==null&&now-Number(row.last_seen_at||0)<30000,
       last_seen_at:Number(row.last_seen_at||0),
       phase:safe(status.phase,40)||null,
       firmware:safe(status.firmware,80)||null,
       battery:Number.isFinite(Number(status.battery))?Number(status.battery):null,
       wifi_rssi:Number.isFinite(Number(status.wifi_rssi))?Number(status.wifi_rssi):null,
       camera:status.camera??null,
       microphone:status.microphone??null,
       speaker:status.speaker??null,
       live_stream:false
     });
   }
 }catch{}
 try{
   const rows=await env.DB.prepare(`SELECT t.device_id,t.name,t.app_version,t.last_seen_at,t.revoked_at,
     s.payload_json,s.updated_at
     FROM android_device_tokens t
     LEFT JOIN android_device_status s ON s.device_id=t.device_id
     ORDER BY t.last_seen_at DESC LIMIT 50`).all();
   const androidCandidates=(rows.results||[]).map(row=>{
     let status={};try{status=JSON.parse(row.payload_json||"{}")}catch{}
     const name=safe(row.name,80)||"MEL Android";
     return {
       device_id:row.device_id,
       name,
       model:"android-companion",
       kind:"android",
       online:row.revoked_at==null&&now-Number(row.last_seen_at||0)<ANDROID_ONLINE_MS,
       last_seen_at:Number(row.last_seen_at||0),
       phase:safe(status.phase,40)||null,
       firmware:safe(row.app_version,80)||safe(status.app_version,80)||null,
       battery:Number.isFinite(Number(status.battery))?Number(status.battery):null,
       wifi_rssi:null,
       camera:status.camera??true,
       microphone:true,
       speaker:true,
       network:safe(status.network,40)||null,
       charging:status.charging===true,
       live_stream:false,
       dedupe_key:name.toLowerCase()
     };
   });
   const activeKeys=new Set(androidCandidates.filter(device=>device.online).map(device=>device.dedupe_key));
   const keptOfflineKeys=new Set();
   for(const candidate of androidCandidates){
     if(candidate.online){
       const {dedupe_key,...device}=candidate;
       devices.push(device);
       continue;
     }
     if(activeKeys.has(candidate.dedupe_key)||keptOfflineKeys.has(candidate.dedupe_key)) continue;
     keptOfflineKeys.add(candidate.dedupe_key);
     const {dedupe_key,...device}=candidate;
     devices.push(device);
   }
 }catch{}
 const miniDevices=devices.filter(device=>device.kind==="mini")
   .sort((a,b)=>(Number(b.online)-Number(a.online))||Number(b.last_seen_at||0)-Number(a.last_seen_at||0));
 const androidDevices=devices.filter(device=>device.kind==="android")
   .sort((a,b)=>(Number(b.online)-Number(a.online))||Number(b.last_seen_at||0)-Number(a.last_seen_at||0));
 const visibleDevices=[];
 if(miniDevices[0]) visibleDevices.push(miniDevices[0]);
 if(androidDevices[0]) visibleDevices.push(androidDevices[0]);
 return json({ok:true,devices:visibleDevices});
}
async function heartbeat(request,env,a){
 const b=await request.json().catch(()=>({}));
 const row=await env.DB.prepare("SELECT metadata FROM computer_devices WHERE id=? LIMIT 1").bind(a.device.id).first();
 let metadata={};try{metadata=JSON.parse(row?.metadata||"{}")}catch{}
 const now=Date.now();
 const patch={};
 if(b.version!==undefined)patch.version=b.version||null;
 if(b.engine_version!==undefined)patch.engine_version=b.engine_version||null;
 if(b.engine_refresh_status!==undefined)patch.engine_refresh_status=safe(b.engine_refresh_status,80)||null;
 if(b.engine_refresh_at!==undefined&&Number.isFinite(Number(b.engine_refresh_at)))patch.engine_refresh_at=Number(b.engine_refresh_at);
 if(b.engine_refresh_error!==undefined)patch.engine_refresh_error=safe(b.engine_refresh_error,180)||null;
 if(b.engine_heartbeat_at!==undefined&&Number.isFinite(Number(b.engine_heartbeat_at))){
   patch.engine_heartbeat_at=Number(b.engine_heartbeat_at);
 }else if(
   b.version!==undefined
   && typeof b.hostname==="string" && b.hostname.trim()
   && b.screen && typeof b.screen==="object"
 ){
   // Native Windows Companion heartbeats are emitted only after
   // EnsureCompanion() supervises the authenticated PowerShell engine.
   // Treat that authenticated supervisor heartbeat as fresh engine presence
   // for compatibility with already-installed native clients.
   patch.engine_heartbeat_at=now;
 }
 if(b.hostname!==undefined)patch.hostname=b.hostname||null;
 if(b.user!==undefined)patch.user=b.user||null;
 // Reflect the local Companion toggle on every authenticated heartbeat.
 // Never elevate permission from a non-boolean or absent value.
 if(typeof b.remote_access_enabled==="boolean")patch.remote_access_enabled=b.remote_access_enabled;
 // Separate, locally controlled opt-in for optional MEL compute acceleration.
 // Remote PC access permission does not imply permission to use CPU/GPU.
 // Fail closed on every heartbeat: legacy clients and malformed values cannot
 // preserve a previous opt-in after the local control disappears.
 patch.local_compute_enabled=b.local_compute_enabled===true;
 patch.local_compute_gpu_enabled=patch.local_compute_enabled&&b.local_compute_gpu_enabled===true;
 if(["light","balanced","performance"].includes(b.local_compute_profile))
   patch.local_compute_profile=b.local_compute_profile;
 const telemetry=b.local_compute_telemetry;
 if(patch.local_compute_enabled && telemetry && typeof telemetry==="object" &&
    Number.isFinite(telemetry.cpu_percent)&&telemetry.cpu_percent>=0&&telemetry.cpu_percent<=100 &&
    Number.isFinite(telemetry.free_ram_mb)&&telemetry.free_ram_mb>=0 &&
    Number.isSafeInteger(telemetry.active_jobs)&&telemetry.active_jobs>=0 &&
    typeof telemetry.on_battery==="boolean"&&typeof telemetry.user_busy==="boolean"&&
    typeof telemetry.gpu_available==="boolean"){
   patch.local_compute_telemetry={
     observed_at:now,cpu_percent:telemetry.cpu_percent,free_ram_mb:telemetry.free_ram_mb,
     on_battery:telemetry.on_battery,user_busy:telemetry.user_busy,
     gpu_available:telemetry.gpu_available,active_jobs:telemetry.active_jobs
   };
 }else if(shouldInvalidateOptionalComputeTelemetryOnHeartbeat({
   enabled:patch.local_compute_enabled,body:b
 })){
   // Native heartbeat with a missing/invalid sample invalidates it. The
   // separate PowerShell engine heartbeat carries no CPU sample and MUST NOT
   // erase a still-fresh native reading; admission still expires after 10 s.
   patch.local_compute_telemetry=null;
 }
 if(b.screen&&typeof b.screen==="object")patch.screen=b.screen;
 if(b.active_window!==undefined)patch.active_window=b.active_window||null;
 metadata={...metadata,...patch};
 await env.DB.prepare("UPDATE computer_devices SET last_seen_at=?,metadata=? WHERE id=?").bind(now,JSON.stringify(metadata),a.device.id).run();
 const engineHeartbeatAt=Number(metadata.engine_heartbeat_at||0);
 const engineOnline=engineHeartbeatAt>0&&now-engineHeartbeatAt<35000;
 const engineVersion=safe(metadata.engine_version,80)||null;
 const engineUpdateRequired=!versionAtLeast(engineVersion,MIN_SOVEREIGN_AI_ENGINE_VERSION);
 const computeAdmission=evaluateMeasuredOptionalCompute({
   enabled:metadata.local_compute_enabled===true,
   profile:metadata.local_compute_profile||"off",online:engineOnline,
   halted:a.device.halted===true,telemetry:metadata.local_compute_telemetry,now
 });
 return json({
   ok:true,
   server_time:now,
   engine_online:engineOnline,
   local_compute_enabled:metadata.local_compute_enabled===true,
   local_compute_gpu_enabled:metadata.local_compute_gpu_enabled===true,
   local_compute_admission:{allowed:computeAdmission.allowed,reason:computeAdmission.reason},
   engine_version:engineVersion,
   engine_last_seen_at:engineHeartbeatAt||null,
   required_engine_version:MIN_SOVEREIGN_AI_ENGINE_VERSION,
   engine_update_required:engineUpdateRequired,
   engine_refresh_status:safe(metadata.engine_refresh_status,80)||null,
   engine_refresh_at:Number(metadata.engine_refresh_at||0)||null,
   engine_refresh_error:safe(metadata.engine_refresh_error,180)||null
 })
}
async function controlState(request,env,a,url){
 // Device-authenticated, read only, and scoped to one command on this PC.
 // A new opt-in does not revive a command cancelled by a prior STOP.
 const id=safe(url.searchParams.get("command_id"));
 if(!id)return json({ok:false,code:"COMPUTER_CONTROL_COMMAND_REQUIRED"},400);
 const command=await env.DB.prepare("SELECT status FROM computer_commands WHERE id=? AND device_id=? LIMIT 1")
  .bind(id,a.device.id).first();
 if(!command)return json({ok:true,permitted:false,code:"COMPUTER_CONTROL_COMMAND_NOT_RUNNING"});
 const device=await env.DB.prepare("SELECT halted,metadata FROM computer_devices WHERE id=? LIMIT 1")
  .bind(a.device.id).first();
 const halted=!device||Number(device.halted)===1;
 const localEnabled=parse(device?.metadata,{})?.remote_access_enabled===true;
 const permitted=command.status==="RUNNING"&&!halted&&localEnabled;
 return json({ok:true,permitted,code:permitted?"AUTHORIZED":halted?"OWNER_HALT_ACTIVE":!localEnabled?"REMOTE_ACCESS_DISABLED_LOCALLY":"COMPUTER_CONTROL_COMMAND_NOT_RUNNING"});
}

async function claim(env,a){
 if(a.device.halted)return json({ok:true,halted:true,command:null});
 const r=await env.DB.prepare("SELECT * FROM computer_commands WHERE device_id=? AND status=? ORDER BY created_at ASC LIMIT 1").bind(a.device.id,"PENDING").first();
 if(!r)return json({ok:true,halted:false,command:null});
 const plan=parse(r.plan_json,{});
 // A queued GUI action must never be handed to a device after its owner has
 // disabled remote control, even if it was approved before the opt-out.
 // The Windows agent also checks the local switch before each real step.
 if(plan.schema==="mel.devices.computer-use.v1"&&a.device.metadata?.remote_access_enabled!==true){
  const rejected=await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE id=? AND device_id=? AND status=?")
   .bind("FAILED",Date.now(),"REMOTE_ACCESS_DISABLED_LOCALLY",r.id,a.device.id,"PENDING").run();
  if(!rejected||rejected.success===false||Number(rejected.meta?.changes)!==1)
   return json({ok:false,code:"COMPUTER_CLAIM_REVALIDATION_RACE"},409);
  return json({ok:true,halted:false,command:null,blocked_command:{id:r.id,code:"REMOTE_ACCESS_DISABLED_LOCALLY"}});
 }
 const computeVerdict=evaluateQueuedOptionalComputeClaim({
   plan,device:a.device,now:Date.now()
 });
 if(!computeVerdict.ok){
   const updated=await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE id=? AND device_id=? AND status=?")
    .bind("FAILED",Date.now(),computeVerdict.code,r.id,a.device.id,"PENDING").run();
   if(!updated||updated.success===false||Number(updated.meta?.changes)!==1)
     return json({ok:false,code:"COMPUTER_CLAIM_REVALIDATION_RACE"},409);
   return json({ok:true,halted:false,command:null,blocked_command:{id:r.id,code:computeVerdict.code}});
 }
 if(plan.schema==="mel.companion.desktop-view-request/v1" || plan.action==="desktop.view.request"){
  // A previously queued request must not outlive a local opt-out reported
  // after the owner queued it but before the Windows agent claimed it.
  const verdict=a.device.metadata?.remote_access_enabled===true
   ?evaluateDesktopViewClaim({plan,device:a.device,now:Date.now()})
   :{ok:false,code:"REMOTE_ACCESS_DISABLED_LOCALLY"};
  if(!verdict.ok){
   await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE id=? AND device_id=? AND status=?").bind("FAILED",Date.now(),verdict.code,r.id,a.device.id,"PENDING").run();
   return json({ok:true,halted:false,command:null,blocked_command:{id:r.id,code:verdict.code}});
  }
 }
 // The authenticated device snapshot is not a lock: owner STOP may race
 // between the initial SELECT and the final claim.
 const update=await env.DB.prepare("UPDATE computer_commands SET status=?,claimed_at=? WHERE id=? AND device_id=? AND status=? AND EXISTS (SELECT 1 FROM computer_devices WHERE id=? AND halted=0)")
  .bind("RUNNING",Date.now(),r.id,a.device.id,"PENDING",a.device.id).run();
 if(!update || update.success===false || Number(update.meta?.changes)!==1)return json({ok:false,code:"COMPUTER_CLAIM_NOT_CONFIRMED"},409);
 return json({ok:true,halted:false,command:{id:r.id,session_id:r.session_id,plan}});
}
async function result(request,env,a){
 const b=await request.json().catch(()=>({}));
 const id=safe(b.command_id);
 if(!id)return json({ok:false,code:"COMPUTER_RESULT_ID_REQUIRED"},400);
 if(b.ok===true){
  const current=await env.DB.prepare("SELECT status,plan_json FROM computer_commands WHERE id=? AND device_id=? LIMIT 1").bind(id,a.device.id).first();
  if(!current||current.status!=="RUNNING")return json({ok:false,code:"COMPUTER_RESULT_NOT_RUNNING"},409);
  const plan=parse(current.plan_json,{});
  // A late Ollama result is evidence of a finished local call, NOT a timely
  // MEL response. Mark it failed instead of creating a false SUCCEEDED proof.
  const aiResultVerdict=evaluateOptionalAiResultDeadline({plan,now:Date.now()});
  if(!aiResultVerdict.ok){
   const expired=await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE id=? AND device_id=? AND status=?")
    .bind("FAILED",Date.now(),aiResultVerdict.code,id,a.device.id,"RUNNING").run();
   if(!expired||expired.success===false||Number(expired.meta?.changes)!==1)
    return json({ok:false,code:"COMPUTER_RESULT_NOT_RUNNING"},409);
   return json({ok:false,code:aiResultVerdict.code},409);
  }
  const aiProof=evaluateOptionalAiResultProof({plan,result:b.result});
  if(!aiProof.ok){
   const denied=await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,error_code=? WHERE id=? AND device_id=? AND status=?")
    .bind("FAILED",Date.now(),aiProof.code,id,a.device.id,"RUNNING").run();
   if(!denied||denied.success===false||Number(denied.meta?.changes)!==1)
    return json({ok:false,code:"COMPUTER_RESULT_NOT_RUNNING"},409);
   return json({ok:false,code:aiProof.code},409);
  }
  // Legacy computer.quick uses the computer-use screen.capture step, not the
  // dedicated desktop.view.request plan. Its success must be equally truthful.
  const steps=Array.isArray(plan.steps)?plan.steps:[];
  if(plan.schema==="mel.devices.computer-use.v1"&&steps.some(step=>step?.action==="screen.capture")){
   const outputs=b.result?.outputs;
   const key=`computer/screenshots/${a.device.id.replace(/[^A-Za-z0-9_.-]/g,"_")}/${id.replace(/[^A-Za-z0-9_.-]/g,"_")}.png`;
   const expectedUrl=`${new URL(request.url).origin}${COMPUTER_API_BASE}/screenshot?key=${encodeURIComponent(key)}`;
   if(!Array.isArray(outputs)||outputs.length!==steps.length||
      steps.some((step,i)=>step?.action==="screen.capture"&&(
        outputs[i]?.action!=="screen.capture"||
        outputs[i]?.screenshot_key!==key||
        outputs[i]?.view_url!==expectedUrl)))
    return json({ok:false,code:"SCREENSHOT_RESULT_PROOF_INVALID"},409);
   const device=await env.DB.prepare("SELECT halted,metadata FROM computer_devices WHERE id=? LIMIT 1").bind(a.device.id).first();
   if(!device||Number(device.halted)===1||parse(device.metadata,{})?.remote_access_enabled!==true)
    return json({ok:false,code:"SCREENSHOT_RESULT_AUTH_INVALID"},409);
   if(typeof env?.MEDIA_BUCKET?.head!=="function")
    return json({ok:false,code:"SCREENSHOT_RESULT_STORAGE_UNAVAILABLE"},503);
   let image;
   try{image=await env.MEDIA_BUCKET.head(key)}
   catch{return json({ok:false,code:"SCREENSHOT_RESULT_STORAGE_UNAVAILABLE"},503)}
   if(!image||Number(image.size)<=0)
    return json({ok:false,code:"SCREENSHOT_RESULT_IMAGE_MISSING"},409);
  }
  if(plan.schema==="mel.companion.desktop-view-request/v1"||plan.action==="desktop.view.request"){
   // A device may only mark a one-shot desktop view as succeeded if the image
   // actually reached R2 under the exact device/command key.
   const device=await env.DB.prepare("SELECT halted,metadata FROM computer_devices WHERE id=? LIMIT 1").bind(a.device.id).first();
   if(!device||Number(device.halted)===1||parse(device.metadata,{})?.remote_access_enabled!==true||plan.schema!=="mel.companion.desktop-view-request/v1"||
      plan.action!=="desktop.view.request"||plan.screen_capture_only!==true||
      plan.device_id!==a.device.id||!Number.isFinite(Number(plan.expires_at))||
      Number(plan.expires_at)<=Date.now())
    return json({ok:false,code:"SCREENSHOT_RESULT_AUTH_INVALID"},409);
   const key=`computer/screenshots/${a.device.id.replace(/[^A-Za-z0-9_.-]/g,"_")}/${id.replace(/[^A-Za-z0-9_.-]/g,"_")}.png`;
   const expectedUrl=`${new URL(request.url).origin}${COMPUTER_API_BASE}/screenshot?key=${encodeURIComponent(key)}`;
   const outputs=b.result?.outputs;
   if(!Array.isArray(outputs)||outputs.length!==1||b.result?.capture_count!==1||
      outputs[0]?.action!=="desktop.view.request"||outputs[0]?.screenshot_key!==key||
      outputs[0]?.view_url!==expectedUrl)
    return json({ok:false,code:"SCREENSHOT_RESULT_PROOF_INVALID"},409);
   if(typeof env?.MEDIA_BUCKET?.head!=="function")
    return json({ok:false,code:"SCREENSHOT_RESULT_STORAGE_UNAVAILABLE"},503);
   let image;
   try{image=await env.MEDIA_BUCKET.head(key)}catch{return json({ok:false,code:"SCREENSHOT_RESULT_STORAGE_UNAVAILABLE"},503)}
   if(!image||Number(image.size)<=0)
    return json({ok:false,code:"SCREENSHOT_RESULT_IMAGE_MISSING"},409);
  }
 }
 const update=await env.DB.prepare("UPDATE computer_commands SET status=?,finished_at=?,result_json=?,error_code=? WHERE id=? AND device_id=? AND status=? AND EXISTS (SELECT 1 FROM computer_devices WHERE id=? AND halted=0)")
  .bind(b.ok===true?"SUCCEEDED":"FAILED",Date.now(),JSON.stringify(b.result??null),b.error_code?safe(b.error_code):null,id,a.device.id,"RUNNING",a.device.id).run();
 if(!update||update.success===false||Number(update.meta?.changes)!==1)
  return json({ok:false,code:"COMPUTER_RESULT_NOT_RUNNING"},409);
 return json({ok:true});
}
// A device token never authorizes arbitrary screenshot uploads. The queued, running
// command itself must explicitly request the image. Local device opt-in is checked separately.
function screenshotPlanAuthorized(plan,deviceId,sessionId,now){
 if(!plan||typeof plan!=="object")return false;
 if(plan.schema==="mel.companion.desktop-view-request/v1"||plan.action==="desktop.view.request")
  return plan.schema==="mel.companion.desktop-view-request/v1"&&
   plan.action==="desktop.view.request"&&plan.screen_capture_only===true&&
   plan.requires_local_stop===true&&plan.device_id===deviceId&&
   plan.session_id===sessionId&&Number.isSafeInteger(plan.expires_at)&&
   plan.expires_at>now;
 return plan.schema==="mel.devices.computer-use.v1"&&Array.isArray(plan.steps)&&
  plan.steps.some(step=>step?.action==="screen.capture");
}
async function uploadShot(request,env,a,url){
 if(!env?.MEDIA_BUCKET)return json({ok:false,code:"MEDIA_BUCKET_UNAVAILABLE"},503);
 const id=safe(url.searchParams.get("command_id"));
 if(!id)return json({ok:false,code:"SCREENSHOT_COMMAND_REQUIRED"},400);
 const command=await env.DB.prepare("SELECT id,plan_json,session_id FROM computer_commands WHERE id=? AND device_id=? AND status=? LIMIT 1").bind(id,a.device.id,"RUNNING").first();
 if(!command)return json({ok:false,code:"SCREENSHOT_COMMAND_NOT_RUNNING"},409);
 const currentDevice=await env.DB.prepare("SELECT halted,metadata FROM computer_devices WHERE id=? LIMIT 1").bind(a.device.id).first();
 if(!currentDevice||Number(currentDevice.halted)===1)return json({ok:false,code:"SCREENSHOT_OWNER_HALT"},409);
 if(parse(currentDevice.metadata,{})?.remote_access_enabled!==true)
  return json({ok:false,code:"SCREENSHOT_LOCAL_ACCESS_REVOKED"},409);
 const plan=parse(command.plan_json,{});
 if(!screenshotPlanAuthorized(plan,a.device.id,command.session_id,Date.now())){
  const view=plan.schema==="mel.companion.desktop-view-request/v1"||plan.action==="desktop.view.request";
  return json({ok:false,code:view?"SCREENSHOT_VIEW_AUTH_EXPIRED_OR_INVALID":"SCREENSHOT_PLAN_NOT_AUTHORIZED"},409);
 }
 const bytes=new Uint8Array(await request.arrayBuffer());
 if(!bytes.byteLength||bytes.byteLength>5*1024*1024)return json({ok:false,code:"SCREENSHOT_SIZE_INVALID"},413);
 const signature=[137,80,78,71,13,10,26,10];
 if(bytes.length<signature.length||!signature.every((b,i)=>bytes[i]===b))
  return json({ok:false,code:"SCREENSHOT_PNG_INVALID"},415);
 // Revalidate after reading the body: HALT or completion may occur during the upload.
 const latest=await env.DB.prepare("SELECT c.status,c.plan_json,c.session_id,d.halted,d.metadata FROM computer_commands c JOIN computer_devices d ON d.id=c.device_id WHERE c.id=? AND c.device_id=? LIMIT 1").bind(id,a.device.id).first();
 if(!latest||Number(latest.halted)===1||parse(latest.metadata,{})?.remote_access_enabled!==true||latest.status!=="RUNNING")
  return json({ok:false,code:"SCREENSHOT_AUTH_REVOKED_DURING_UPLOAD"},409);
 const latestPlan=parse(latest.plan_json,{});
 if(!screenshotPlanAuthorized(latestPlan,a.device.id,latest.session_id,Date.now()))
  return json({ok:false,code:"SCREENSHOT_AUTH_REVOKED_DURING_UPLOAD"},409);
 const key=`computer/screenshots/${a.device.id.replace(/[^A-Za-z0-9_.-]/g,"_")}/${id.replace(/[^A-Za-z0-9_.-]/g,"_")}.png`;
 await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:"image/png"}});
 return json({ok:true,key,view_url:`${url.origin}${COMPUTER_API_BASE}/screenshot?key=${encodeURIComponent(key)}`});
}

export async function maybeHandleComputerApi(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith(COMPUTER_API_BASE+"/"))return null;
 if(url.pathname===COMPUTER_ROUTES.pairCode&&request.method==="POST")return createPairCode(request,env);
 if(url.pathname===COMPUTER_ROUTES.pair&&request.method==="POST")return pair(request,env);
 if(url.pathname===COMPUTER_ROUTES.revoke&&request.method==="POST")return ownerRevoke(request,env);
 if(url.pathname===COMPUTER_ROUTES.status&&request.method==="GET")return ownerStatus(request,env,url);
 if(url.pathname===COMPUTER_ROUTES.commands&&request.method==="POST")return ownerCommand(request,env);
 if(url.pathname===COMPUTER_ROUTES.desktopViewRequest&&request.method==="POST")return ownerDesktopViewRequest(request,env);
 if(url.pathname===COMPUTER_ROUTES.halt&&request.method==="POST")return ownerHalt(request,env,true);
 if(url.pathname===COMPUTER_ROUTES.resume&&request.method==="POST")return ownerHalt(request,env,false);
 if(url.pathname===COMPUTER_ROUTES.power&&request.method==="POST")return ownerPower(request,env);
 if(url.pathname===COMPUTER_ROUTES.sovereigntyCommand&&request.method==="POST")return ownerSovereigntyCommand(request,env);
 if(url.pathname===COMPUTER_ROUTES.pcControl&&request.method==="POST")return ownerPcControl(request,env);
 if(url.pathname===COMPUTER_ROUTES.installer&&request.method==="GET")return asset(request,env,"MEL-Computer-Setup.ps1");
 if(url.pathname===COMPUTER_ROUTES.companion&&request.method==="GET")return asset(request,env,"MEL-Computer-Companion.ps1",{allowDevice:true});
 if(url.pathname===COMPUTER_ROUTES.screenshot&&request.method==="GET")return screenshotView(request,env,url);
 if(url.pathname===COMPUTER_ROUTES.sovereigntyArchive&&request.method==="GET")return sovereigntyCodeArchive(request,env,url);
 const a=await authDevice(request,env);if(!a.ok)return a.response;
 if(url.pathname===COMPUTER_API_BASE+"/heartbeat"&&request.method==="POST")return heartbeat(request,env,a);
 if(url.pathname===COMPUTER_ROUTES.companions&&request.method==="GET")return computerCompanions(env);
 if(url.pathname===COMPUTER_ROUTES.controlState&&request.method==="GET")return controlState(request,env,a,url);
 if(url.pathname===COMPUTER_ROUTES.triadActivity&&request.method==="GET"){
  if(a.device.halted)return json({ok:false,code:"TRIAD_COMPANION_HALTED"},409);
  return json(await readAndroidTriadActivityForCompanion(env));
 }
 if(url.pathname===COMPUTER_ROUTES.commands&&request.method==="GET")return claim(env,a);
 if(url.pathname===COMPUTER_API_BASE+"/result"&&request.method==="POST")return result(request,env,a);
 if(url.pathname===COMPUTER_ROUTES.screenshot&&request.method==="POST")return uploadShot(request,env,a,url);
 return json({ok:false,code:"COMPUTER_ROUTE_NOT_FOUND"},404);
}