import { DomainError, requireValue } from '../core/contracts.js';

export const VIDEO_RUNTIME_SCHEMA = 'mel.video-runtime/v1';
export const VIDEO_ACTIONS = Object.freeze(['ANALYZE','PROCESS','GENERATE']);

const MAX_VIDEO_BYTES = 120_000_000;
const MAX_PROMPT_CHARS = 6000;
const MAX_OUTPUTS = 12;
const MODES = Object.freeze(['VIDEO','TALKING_AVATAR']);

function err(code,status=400){ return new DomainError(code,status); }
function text(v){ return String(v ?? '').trim(); }
function isObject(v){ return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
function finite(v,fallback=null){ const n=Number(v); return Number.isFinite(n)&&n>=0?n:fallback; }

function bytesFrom(value){
  if(value==null) return null;
  if(value instanceof Uint8Array) return value;
  if(value instanceof ArrayBuffer) return new Uint8Array(value);
  if(ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw err('VIDEO_BYTES_INVALID');
}

function safeUrl(value,code='VIDEO_URL_INVALID'){
  if(!value) return null;
  let u;
  try{ u=new URL(text(value)); }catch{ throw err(code); }
  requireValue(['https:','http:'].includes(u.protocol),code);
  requireValue(!u.username&&!u.password,code);
  return u.toString();
}

async function sha256Bytes(bytes){
  if(!bytes) return null;
  const digest=await crypto.subtle.digest('SHA-256',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function sha256Text(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text(value)));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function capability(provider){
  const c=typeof provider?.capability==='function'?provider.capability():provider?.capability;
  return isObject(c)?c:{};
}
function providerId(provider){ return text(capability(provider).id||provider?.id); }
function paid(provider){ return capability(provider).paid===true; }
function priority(provider){ return finite(capability(provider).priority,100); }
function enabled(provider){ return capability(provider).enabled!==false; }
function supports(provider,action){
  const c=capability(provider);
  const actions=Array.isArray(c.actions)?c.actions.map(v=>text(v).toUpperCase()):[];
  if(actions.includes(action)) return true;
  if(action==='GENERATE'){
    return typeof provider?.generate==='function'
      && Array.isArray(c.kinds)
      && c.kinds.map(v=>text(v).toUpperCase()).includes('VIDEO');
  }
  if(action==='ANALYZE') return typeof provider?.analyze==='function';
  if(action==='PROCESS') return typeof provider?.process==='function';
  return false;
}

function sanitize(value,depth=0){
  if(depth>6) return '[DEPTH_LIMIT]';
  if(value==null||typeof value==='boolean'||typeof value==='number') return value;
  if(typeof value==='string') return value.slice(0,12000);
  if(Array.isArray(value)) return value.slice(0,100).map(v=>sanitize(v,depth+1));
  if(isObject(value)){
    const out={};
    for(const [k,v] of Object.entries(value).slice(0,120)){
      if(/token|secret|password|authorization|cookie|credential|api[_-]?key/i.test(k)) continue;
      if(['bytes','buffer','data'].includes(k)) continue;
      out[String(k).slice(0,120)]=sanitize(v,depth+1);
    }
    return out;
  }
  return String(value).slice(0,2000);
}

async function normalizeInput(action,input={}){
  requireValue(isObject(input),'VIDEO_REQUEST_INVALID');

  if(action==='GENERATE'){
    const prompt=text(input.prompt);
    requireValue(prompt.length>0&&prompt.length<=MAX_PROMPT_CHARS,'VIDEO_PROMPT_INVALID');
    const mode=text(input.mode||'VIDEO').toUpperCase();
    requireValue(MODES.includes(mode),'VIDEO_MODE_INVALID');
    const image=input.image||input.referenceImage||null;
    const audio=input.audio||input.voiceAudio||null;
    return Object.freeze({
      action,
      mode,
      prompt,
      prompt_sha256:await sha256Text(prompt),
      image_url:image?safeUrl(image,'VIDEO_IMAGE_REFERENCE_INVALID'):null,
      audio_url:audio?safeUrl(audio,'VIDEO_AUDIO_REFERENCE_INVALID'):null,
      duration_seconds:finite(input.duration_seconds,null),
      aspect_ratio:text(input.aspect_ratio||'')||null,
      approvedPaidCall:input.approvedPaidCall===true,
    });
  }

  const bytes=bytesFrom(input.bytes);
  const url=input.url?safeUrl(input.url):null;
  requireValue(bytes||url,'VIDEO_SOURCE_REQUIRED');
  if(bytes) requireValue(bytes.byteLength>0&&bytes.byteLength<=MAX_VIDEO_BYTES,'VIDEO_BYTES_TOO_LARGE',413);

  const operation=action==='PROCESS'?text(input.operation):null;
  if(action==='PROCESS') requireValue(operation.length>0&&operation.length<=160,'VIDEO_OPERATION_INVALID');

  return Object.freeze({
    action,
    bytes,
    url,
    mime:text(input.mime||'application/octet-stream').slice(0,160),
    source_sha256:await sha256Bytes(bytes),
    operation,
    params:isObject(input.params)?sanitize(input.params):{},
  });
}

function publicRequest(request){
  return Object.freeze({
    action:request.action,
    ...(request.mode?{mode:request.mode}:{}),
    ...(request.prompt_sha256?{prompt_sha256:request.prompt_sha256}:{}),
    ...(request.source_sha256?{source_sha256:request.source_sha256}:{}),
    ...(request.url?{source_url:request.url}:{}),
    ...(request.mime?{mime:request.mime}:{}),
    ...(request.operation?{operation:request.operation}:{}),
    ...(request.duration_seconds!=null?{duration_seconds:request.duration_seconds}:{}),
    ...(request.aspect_ratio?{aspect_ratio:request.aspect_ratio}:{}),
    image_reference:Boolean(request.image_url),
    audio_reference:Boolean(request.audio_url),
  });
}

async function cost(provider,request,action){
  if(typeof provider?.estimateCostUsd==='function') return finite(await provider.estimateCostUsd(request,action),null);
  return paid(provider)?null:0;
}

function normalizeOutputs(result){
  const src=Array.isArray(result?.outputs)?result.outputs:Array.isArray(result?.artifacts)?result.artifacts:[];
  requireValue(src.length>0&&src.length<=MAX_OUTPUTS,'VIDEO_PROVIDER_OUTPUTS_INVALID',502);
  return src.map((item,index)=>{
    requireValue(isObject(item),'VIDEO_PROVIDER_OUTPUT_INVALID',502);
    const url=item.url?safeUrl(item.url,'VIDEO_OUTPUT_URL_INVALID'):null;
    const id=text(item.id);
    requireValue(url||id,'VIDEO_OUTPUT_REFERENCE_REQUIRED',502);
    return Object.freeze({
      index,
      ...(id?{id:id.slice(0,240)}:{}),
      ...(url?{url}:{}),
      ...(item.mime?{mime:text(item.mime).slice(0,160)}:{}),
      ...(item.duration_seconds!=null?{duration_seconds:finite(item.duration_seconds,null)}:{}),
      ...(item.width!=null?{width:finite(item.width,null)}:{}),
      ...(item.height!=null?{height:finite(item.height,null)}:{}),
      metadata:Object.freeze(sanitize(item.metadata||{})),
    });
  });
}

export class VideoRuntime{
  constructor({providers=[],authorization=null,now=()=>new Date().toISOString()}={}){
    requireValue(Array.isArray(providers),'VIDEO_PROVIDERS_INVALID');
    if(authorization!=null&&typeof authorization.isAllowed!=='function') throw new Error('VIDEO_AUTHORIZATION_INVALID');
    this.providers=[...providers];
    this.authorization=authorization;
    this.now=now;
  }

  listProviders(action=null){
    const a=action?text(action).toUpperCase():null;
    if(a) requireValue(VIDEO_ACTIONS.includes(a),'VIDEO_ACTION_INVALID');
    return this.providers
      .filter(p=>enabled(p)&&(!a||supports(p,a)))
      .map(p=>Object.freeze({id:providerId(p),paid:paid(p),priority:priority(p),actions:Object.freeze(VIDEO_ACTIONS.filter(x=>supports(p,x)))}))
      .sort((x,y)=>Number(x.paid)-Number(y.paid)||x.priority-y.priority||x.id.localeCompare(y.id));
  }

  async run(action,input={},options={},context={}){
    const a=text(action).toUpperCase();
    requireValue(VIDEO_ACTIONS.includes(a),'VIDEO_ACTION_INVALID');
    const request=await normalizeInput(a,input);
    const maxCostUsd=finite(options.maxCostUsd,0);
    const attempts=[];

    const providers=this.providers
      .filter(p=>enabled(p)&&supports(p,a))
      .sort((x,y)=>Number(paid(x))-Number(paid(y))||priority(x)-priority(y)||providerId(x).localeCompare(providerId(y)));

    for(const provider of providers){
      const id=providerId(provider);
      if(!id) continue;

      let allowed=!paid(provider);
      if(this.authorization){
        try{
          allowed=(await this.authorization.isAllowed({
            provider:id,action:a,capability:capability(provider),request:publicRequest(request),context
          }))===true;
        }catch{ allowed=false; }
      }
      if(!allowed){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'not_authorized'}));
        continue;
      }

      const estimated=await cost(provider,request,a);
      if(paid(provider)&&input.approvedPaidCall!==true){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'paid_call_not_approved'}));
        continue;
      }
      if(estimated==null){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'cost_unknown'}));
        continue;
      }
      if(estimated>maxCostUsd){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'cost_guard',estimated_cost_usd:estimated,max_cost_usd:maxCostUsd}));
        continue;
      }

      const fn=a==='GENERATE'?provider.generate?.bind(provider):a==='ANALYZE'?provider.analyze?.bind(provider):provider.process?.bind(provider);
      if(!fn) continue;

      try{
        const payload=a==='GENERATE'
          ? {
              kind:'VIDEO',
              prompt:request.prompt,
              mode:request.mode,
              referenceImages:request.image_url?[request.image_url]:[],
              audio:request.audio_url,
              duration_seconds:request.duration_seconds,
              aspect_ratio:request.aspect_ratio,
              approvedPaidCall:input.approvedPaidCall===true,
            }
          : {
              bytes:request.bytes,
              url:request.url,
              mime:request.mime,
              ...(request.operation?{operation:request.operation,params:request.params}:{}),
            };

        const result=await fn(payload,context);
        requireValue(result&&typeof result==='object','VIDEO_PROVIDER_RESULT_INVALID',502);
        const provenance=Object.freeze({
          provider:id,
          action:a,
          model:text(result.model||capability(provider).model)||null,
          paid:paid(provider),
          estimated_cost_usd:estimated,
          created_at:this.now(),
          request:publicRequest(request),
        });

        if(a==='ANALYZE'){
          const analysis=sanitize(result.analysis??result.result??result);
          return Object.freeze({
            schema:VIDEO_RUNTIME_SCHEMA,
            action:a,
            provider:id,
            analysis:Object.freeze(isObject(analysis)?analysis:{text:analysis}),
            provenance,
            attempts:Object.freeze([...attempts,Object.freeze({provider:id,status:'success'})]),
          });
        }

        return Object.freeze({
          schema:VIDEO_RUNTIME_SCHEMA,
          action:a,
          provider:id,
          outputs:Object.freeze(normalizeOutputs(result)),
          provenance,
          attempts:Object.freeze([...attempts,Object.freeze({provider:id,status:'success'})]),
        });
      }catch(error){
        attempts.push(Object.freeze({provider:id,status:'failed',reason:text(error?.code||error?.message||error).slice(0,300)}));
      }
    }

    throw err(`VIDEO_NO_PROVIDER:${a}:${attempts.map(x=>`${x.provider}:${x.reason}`).join(',')}`,503);
  }

  analyze(input,options={},context={}){ return this.run('ANALYZE',input,options,context); }
  process(input,options={},context={}){ return this.run('PROCESS',input,options,context); }
  generate(input,options={},context={}){ return this.run('GENERATE',input,options,context); }
}

export function createVideoRuntime(options={}){ return new VideoRuntime(options); }
export function createVideoAdapters(options={}){
  const runtime=createVideoRuntime(options);
  return Object.freeze({
    analyze:(input,context)=>runtime.analyze(input,input?.options||{},context),
    process:(input,context)=>runtime.process(input,input?.options||{},context),
    generate:(input,context)=>runtime.generate(input,input?.options||{},context),
  });
}
