import { DomainError, requireValue } from '../core/contracts.js';

export const AUDIO_RUNTIME_SCHEMA = 'mel.audio-runtime/v1';
export const AUDIO_ACTIONS = Object.freeze(['TRANSCRIBE','SYNTHESIZE','ANALYZE','GENERATE']);

const MAX_AUDIO_BYTES = 30_000_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_PROMPT_CHARS = 6_000;
const MAX_OUTPUTS = 12;
const GENERATION_MODES = Object.freeze(['AUDIO','MUSIC','SFX','SPEECH']);

function err(code,status=400){ return new DomainError(code,status); }
function text(v){ return String(v ?? '').trim(); }
function isObject(v){ return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
function finite(v,fallback=null){ const n=Number(v); return Number.isFinite(n)&&n>=0?n:fallback; }

function bytesFrom(value){
  if(value==null) return null;
  if(value instanceof Uint8Array) return value;
  if(value instanceof ArrayBuffer) return new Uint8Array(value);
  if(ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw err('AUDIO_BYTES_INVALID');
}

function safeUrl(value,code='AUDIO_URL_INVALID'){
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
  if(action==='TRANSCRIBE') return typeof provider?.transcribe==='function';
  if(action==='SYNTHESIZE') return typeof provider?.synthesize==='function';
  if(action==='ANALYZE') return typeof provider?.analyze==='function';
  if(action==='GENERATE') return typeof provider?.generate==='function';
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
      if(['bytes','buffer','data','audio'].includes(String(k).toLowerCase())) continue;
      out[String(k).slice(0,120)]=sanitize(v,depth+1);
    }
    return out;
  }
  return String(value).slice(0,2000);
}

async function normalizeInput(action,input={}){
  requireValue(isObject(input),'AUDIO_REQUEST_INVALID');

  if(action==='SYNTHESIZE'){
    const value=text(input.text);
    requireValue(value.length>0&&value.length<=MAX_TEXT_CHARS,'AUDIO_TEXT_INVALID');
    return Object.freeze({
      action,
      text:value,
      text_sha256:await sha256Text(value),
      voice:text(input.voice||'')||null,
      language:text(input.language||'fr-FR').slice(0,32),
      format:text(input.format||'mp3').toLowerCase().slice(0,16),
      speed:finite(input.speed,null),
      approvedPaidCall:input.approvedPaidCall===true,
    });
  }

  if(action==='GENERATE'){
    const prompt=text(input.prompt);
    requireValue(prompt.length>0&&prompt.length<=MAX_PROMPT_CHARS,'AUDIO_PROMPT_INVALID');
    const mode=text(input.mode||'AUDIO').toUpperCase();
    requireValue(GENERATION_MODES.includes(mode),'AUDIO_MODE_INVALID');
    return Object.freeze({
      action,
      prompt,
      prompt_sha256:await sha256Text(prompt),
      mode,
      duration_seconds:finite(input.duration_seconds,null),
      format:text(input.format||'mp3').toLowerCase().slice(0,16),
      approvedPaidCall:input.approvedPaidCall===true,
    });
  }

  const bytes=bytesFrom(input.bytes);
  const url=input.url?safeUrl(input.url):null;
  requireValue(bytes||url,'AUDIO_SOURCE_REQUIRED');
  if(bytes) requireValue(bytes.byteLength>0&&bytes.byteLength<=MAX_AUDIO_BYTES,'AUDIO_BYTES_TOO_LARGE',413);
  return Object.freeze({
    action,
    bytes,
    url,
    mime:text(input.mime||'application/octet-stream').slice(0,160),
    source_sha256:await sha256Bytes(bytes),
    language:text(input.language||'').slice(0,32)||null,
  });
}

function publicRequest(request){
  return Object.freeze({
    action:request.action,
    ...(request.text_sha256?{text_sha256:request.text_sha256}:{}),
    ...(request.prompt_sha256?{prompt_sha256:request.prompt_sha256}:{}),
    ...(request.source_sha256?{source_sha256:request.source_sha256}:{}),
    ...(request.url?{source_url:request.url}:{}),
    ...(request.mime?{mime:request.mime}:{}),
    ...(request.voice?{voice:request.voice}:{}),
    ...(request.language?{language:request.language}:{}),
    ...(request.mode?{mode:request.mode}:{}),
    ...(request.format?{format:request.format}:{}),
    ...(request.duration_seconds!=null?{duration_seconds:request.duration_seconds}:{}),
  });
}

async function estimatedCost(provider,request,action){
  if(typeof provider?.estimateCostUsd==='function') return finite(await provider.estimateCostUsd(request,action),null);
  return paid(provider)?null:0;
}

function normalizeOutputs(result){
  const src=Array.isArray(result?.outputs)?result.outputs:Array.isArray(result?.artifacts)?result.artifacts:[];
  requireValue(src.length>0&&src.length<=MAX_OUTPUTS,'AUDIO_PROVIDER_OUTPUTS_INVALID',502);
  return src.map((item,index)=>{
    requireValue(isObject(item),'AUDIO_PROVIDER_OUTPUT_INVALID',502);
    const url=item.url?safeUrl(item.url,'AUDIO_OUTPUT_URL_INVALID'):null;
    const id=text(item.id);
    requireValue(url||id,'AUDIO_OUTPUT_REFERENCE_REQUIRED',502);
    return Object.freeze({
      index,
      ...(id?{id:id.slice(0,240)}:{}),
      ...(url?{url}:{}),
      ...(item.mime?{mime:text(item.mime).slice(0,160)}:{}),
      ...(item.duration_seconds!=null?{duration_seconds:finite(item.duration_seconds,null)}:{}),
      metadata:Object.freeze(sanitize(item.metadata||{})),
    });
  });
}

export class AudioRuntime{
  constructor({providers=[],authorization=null,now=()=>new Date().toISOString()}={}){
    requireValue(Array.isArray(providers),'AUDIO_PROVIDERS_INVALID');
    if(authorization!=null&&typeof authorization.isAllowed!=='function') throw new Error('AUDIO_AUTHORIZATION_INVALID');
    this.providers=[...providers];
    this.authorization=authorization;
    this.now=now;
  }

  listProviders(action=null){
    const a=action?text(action).toUpperCase():null;
    if(a) requireValue(AUDIO_ACTIONS.includes(a),'AUDIO_ACTION_INVALID');
    return this.providers
      .filter(p=>enabled(p)&&(!a||supports(p,a)))
      .map(p=>Object.freeze({
        id:providerId(p),
        paid:paid(p),
        priority:priority(p),
        actions:Object.freeze(AUDIO_ACTIONS.filter(x=>supports(p,x))),
      }))
      .sort((x,y)=>Number(x.paid)-Number(y.paid)||x.priority-y.priority||x.id.localeCompare(y.id));
  }

  async run(action,input={},options={},context={}){
    const a=text(action).toUpperCase();
    requireValue(AUDIO_ACTIONS.includes(a),'AUDIO_ACTION_INVALID');
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

      const cost=await estimatedCost(provider,request,a);
      if(paid(provider)&&request.approvedPaidCall!==true){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'paid_call_not_approved'}));
        continue;
      }
      if(cost==null){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'cost_unknown'}));
        continue;
      }
      if(cost>maxCostUsd){
        attempts.push(Object.freeze({provider:id,status:'skipped',reason:'cost_guard',estimated_cost_usd:cost,max_cost_usd:maxCostUsd}));
        continue;
      }

      const fn=a==='TRANSCRIBE'?provider.transcribe?.bind(provider)
        :a==='SYNTHESIZE'?provider.synthesize?.bind(provider)
        :a==='ANALYZE'?provider.analyze?.bind(provider)
        :provider.generate?.bind(provider);
      if(!fn) continue;

      try{
        const payload=a==='SYNTHESIZE'
          ? {text:request.text,voice:request.voice,language:request.language,format:request.format,speed:request.speed,approvedPaidCall:request.approvedPaidCall}
          :a==='GENERATE'
            ? {prompt:request.prompt,mode:request.mode,duration_seconds:request.duration_seconds,format:request.format,approvedPaidCall:request.approvedPaidCall}
            : {bytes:request.bytes,url:request.url,mime:request.mime,language:request.language};
        const result=await fn(payload,context);
        requireValue(result&&typeof result==='object','AUDIO_PROVIDER_RESULT_INVALID',502);
        const provenance=Object.freeze({
          provider:id,
          action:a,
          model:text(result.model||capability(provider).model)||null,
          paid:paid(provider),
          estimated_cost_usd:cost,
          created_at:this.now(),
          request:publicRequest(request),
        });

        if(a==='TRANSCRIBE'){
          const transcript=text(result.text??result.transcript??result.transcription);
          requireValue(transcript,'AUDIO_TRANSCRIPT_INVALID',502);
          return Object.freeze({
            schema:AUDIO_RUNTIME_SCHEMA,
            action:a,
            provider:id,
            text:transcript,
            language:text(result.language||request.language||'')||null,
            provenance,
            attempts:Object.freeze([...attempts,Object.freeze({provider:id,status:'success'})]),
          });
        }

        if(a==='ANALYZE'){
          const analysis=sanitize(result.analysis??result.result??result);
          return Object.freeze({
            schema:AUDIO_RUNTIME_SCHEMA,
            action:a,
            provider:id,
            analysis:Object.freeze(isObject(analysis)?analysis:{text:analysis}),
            provenance,
            attempts:Object.freeze([...attempts,Object.freeze({provider:id,status:'success'})]),
          });
        }

        return Object.freeze({
          schema:AUDIO_RUNTIME_SCHEMA,
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

    throw err(`AUDIO_NO_PROVIDER:${a}:${attempts.map(x=>`${x.provider}:${x.reason}`).join(',')}`,503);
  }

  transcribe(input,options={},context={}){ return this.run('TRANSCRIBE',input,options,context); }
  synthesize(input,options={},context={}){ return this.run('SYNTHESIZE',input,options,context); }
  analyze(input,options={},context={}){ return this.run('ANALYZE',input,options,context); }
  generate(input,options={},context={}){ return this.run('GENERATE',input,options,context); }
}

export function createAudioRuntime(options={}){ return new AudioRuntime(options); }
export function createAudioAdapters(options={}){
  const runtime=createAudioRuntime(options);
  return Object.freeze({
    transcribe:(input,context)=>runtime.transcribe(input,input?.options||{},context),
    synthesize:(input,context)=>runtime.synthesize(input,input?.options||{},context),
    analyze:(input,context)=>runtime.analyze(input,input?.options||{},context),
    generate:(input,context)=>runtime.generate(input,input?.options||{},context),
  });
}
