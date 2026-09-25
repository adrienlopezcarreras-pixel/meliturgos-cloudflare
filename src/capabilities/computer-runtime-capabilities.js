import { evaluateComputerUsePlan } from "../devices/computer-use.js";

function parse(v,f){try{return JSON.parse(v)}catch{return f}}
function normalizeDevice(r){if(!r)return null;const metadata=parse(r.metadata,{});return {id:r.id,name:r.name,platform:r.platform,capabilities:parse(r.capabilities,[]),allowed_apps:parse(r.allowed_apps,[]),allowed_paths:Array.isArray(metadata.allowed_paths)?metadata.allowed_paths:[],halted:Number(r.halted)===1,last_seen_at:Number(r.last_seen_at||0),online:Date.now()-Number(r.last_seen_at||0)<15000,metadata}}
async function ensure(db){if(!db)throw Object.assign(new Error("COMPUTER_DB_REQUIRED"),{code:"COMPUTER_DB_REQUIRED",status:503});await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}")`).run();await db.prepare(`CREATE TABLE IF NOT EXISTS computer_commands(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)`).run();}
function sensitiveApprovals(session,steps){const set=new Set(["keyboard.type","app.open","app.close","file.open","file.close","clipboard.read","clipboard.write"]);return steps.filter(x=>set.has(String(x.action||""))).map(x=>({approved:true,session_id:session,step_id:String(x.id),action:String(x.action)}))}
function quickSteps(input){
 const kind=String(input.kind||"");
 if(kind==="screenshot")return[{action:"screen.capture"}];
 if(kind==="open_app")return[{action:"app.open",app:String(input.app||"")}];
 if(kind==="close_app")return[{action:"app.close",app:String(input.app||"")}];
 if(kind==="open_file")return[{action:"file.open",path:String(input.path||"")}];
 if(kind==="close_file")return[{action:"file.close",path:String(input.path||"")}];
 if(kind==="type_text")return[{action:"keyboard.type",text:String(input.text||"").slice(0,4096)}];
 if(kind==="press_key")return[{action:"keyboard.press",key:String(input.key||"").slice(0,80)}];
 if(kind==="scroll")return[{action:"pointer.scroll",delta_y:Number(input.delta_y)||-240}];
 if(kind==="click")return[{action:"cursor.move",x:Number(input.x)||0,y:Number(input.y)||0},{action:"pointer.click"}];
 return[];
}
async function queuePlan(db,device,{session_id,steps,approve_sensitive=false,allowed_origins=[],allowed_paths=[]}={}){
 if(!device)throw Object.assign(new Error("COMPUTER_NOT_FOUND"),{code:"COMPUTER_NOT_FOUND",status:404});
 if(device.halted)throw Object.assign(new Error("OWNER_HALT_ACTIVE"),{code:"OWNER_HALT_ACTIVE",status:409});
 const session=String(session_id||crypto.randomUUID()),normalized=(steps||[]).map((x,i)=>({...x,id:String(x?.id||`step-${i+1}`)}));
 const approvals=approve_sensitive===true?sensitiveApprovals(session,normalized):[];
 const requestedPaths=Array.isArray(allowed_paths)&&allowed_paths.length?allowed_paths:device.allowed_paths;
 const pairedPaths=new Set((device.allowed_paths||[]).map(x=>String(x).toLowerCase()));
 const effectivePaths=requestedPaths.filter(x=>pairedPaths.has(String(x).toLowerCase()));
 const plan=evaluateComputerUsePlan({session_id:session,owner_halt:false,device:{id:device.id,capabilities:device.capabilities},sandbox:{allowed_apps:device.allowed_apps,allowed_paths:effectivePaths,allowed_origins:Array.isArray(allowed_origins)?allowed_origins:[],max_steps:20},approvals,steps:normalized});
 if(!plan.allowed)throw Object.assign(new Error(plan.reason),{code:plan.reason,status:403});
 const id=crypto.randomUUID();await db.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)").bind(id,device.id,session,JSON.stringify(plan.request),"PENDING",Date.now()).run();
 return {ok:true,command_id:id,status:"PENDING",device_id:device.id,decisions:plan.decisions};
}

export function registerComputerRuntimeCapabilities(bus,{db}={}){
 const health=async()=>{if(!db)return "OFFLINE";try{await ensure(db);const r=await db.prepare("SELECT COUNT(*) AS n FROM computer_devices WHERE last_seen_at>? AND halted=0").bind(Date.now()-15000).first();return Number(r?.n||0)>0?"ONLINE":"OFFLINE"}catch{return "OFFLINE"}};
 bus.discover({id:"computer.status",name:"État ordinateur MEL",category:"device",version:"1.0.0",provider:"mel",description:"Liste les ordinateurs appairés et leur présence récente.",input_schema:{type:"object",additionalProperties:false},output_schema:{type:"object",additionalProperties:true},risk:"LOW",permissions:[],health:db?"DEGRADED":"UNAVAILABLE",enabled:true},async()=>{await ensure(db);const rows=await db.prepare("SELECT * FROM computer_devices ORDER BY last_seen_at DESC LIMIT 20").all();return {ok:true,devices:(rows.results||[]).map(normalizeDevice)}},db?health:null);
 bus.discover({id:"computer.execute",name:"Contrôler ordinateur MEL",category:"device",version:"1.0.0",provider:"mel",description:"Met en file des actions visuelles bornées pour le compagnon Windows appairé. Les saisies, ouvertures d’applications et accès presse-papiers exigent une approbation explicite.",input_schema:{type:"object",properties:{computer_id:{type:"string",minLength:1,maxLength:200},session_id:{type:"string",maxLength:200},steps:{type:"array",minItems:1,maxItems:20,items:{type:"object",additionalProperties:true}},approve_sensitive:{type:"boolean"},allowed_paths:{type:"array",maxItems:32,items:{type:"string",maxLength:4096}},allowed_origins:{type:"array",maxItems:32,items:{type:"string",maxLength:2048}}},required:["computer_id","steps"],additionalProperties:false},output_schema:{type:"object",additionalProperties:true},risk:"HIGH",permissions:[],health:db?"DEGRADED":"UNAVAILABLE",enabled:true},async(input)=>{
   await ensure(db);const row=await db.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(String(input.computer_id)).first();return queuePlan(db,normalizeDevice(row),input);
 },db?health:null);
 bus.discover({id:"computer.quick",name:"Commande rapide ordinateur",category:"device",version:"1.0.0",provider:"mel",description:"Exécute une commande directe sur le premier ordinateur MEL en ligne : capture, ouverture d’application, saisie, touche, défilement ou clic. Les actions sensibles ne sont approuvées que lorsque la requête courante le demande explicitement.",input_schema:{type:"object",properties:{kind:{type:"string",enum:["screenshot","open_app","close_app","open_file","close_file","type_text","press_key","scroll","click"]},app:{type:"string",maxLength:100},path:{type:"string",maxLength:4096},text:{type:"string",maxLength:4096},key:{type:"string",maxLength:80},x:{type:"number"},y:{type:"number"},delta_y:{type:"number"},approve_sensitive:{type:"boolean"},allowed_paths:{type:"array",maxItems:32,items:{type:"string",maxLength:4096}}},required:["kind"],additionalProperties:false},output_schema:{type:"object",additionalProperties:true},risk:"HIGH",permissions:[],health:db?"DEGRADED":"UNAVAILABLE",enabled:true},async(input)=>{
   await ensure(db);const row=await db.prepare("SELECT * FROM computer_devices WHERE halted=0 ORDER BY CASE WHEN last_seen_at>? THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 1").bind(Date.now()-15000).first();const device=normalizeDevice(row);const steps=quickSteps(input);if(!steps.length)throw Object.assign(new Error("COMPUTER_QUICK_ACTION_INVALID"),{code:"COMPUTER_QUICK_ACTION_INVALID",status:400});return queuePlan(db,device,{steps,approve_sensitive:input.approve_sensitive===true,allowed_paths:Array.isArray(input.allowed_paths)?input.allowed_paths:[]});
 },db?health:null);
}