import { ProviderAdapter } from './provider-adapter.js';

function cleanUrl(value) {
  const url = new URL(String(value || ''));
  if (!['https:','http:'].includes(url.protocol)) throw new TypeError('HTTP_CHAT_ENDPOINT_INVALID');
  return url.toString();
}

function normalizeMessages(input, context = {}) {
  if (Array.isArray(input)) return input.map(row=>({role:String(row?.role||'user'),content:String(row?.content||'')}));
  const messages=[];
  if(context?.system) messages.push({role:'system',content:String(context.system)});
  messages.push({role:'user',content:typeof input==='string'?input:JSON.stringify(input)});
  return messages;
}

function extractText(body) {
  return body?.choices?.[0]?.message?.content
    ?? body?.choices?.[0]?.text
    ?? body?.response
    ?? body?.text
    ?? null;
}

function secretFromEnv(env, secretName) {
  const key=String(secretName||'').trim();
  if(!key || !/^[A-Z0-9_]{3,120}$/.test(key)) return '';
  return String(env?.[key]||'').trim();
}

export function createHttpChatAdapter({
  env = {},
  id,
  providerId,
  modelId,
  endpoint,
  secretEnv,
  capabilities=['GENERAL'],
  priority=0,
  estimatedCost=null,
  costProvenance=null,
  concurrency=1,
  fetchImpl=fetch,
}={}) {
  const adapterId=String(id||'').trim();
  const provider=String(providerId||'').trim();
  const model=String(modelId||'').trim();
  if(!adapterId || !provider || !model) throw new TypeError('HTTP_CHAT_DESCRIPTOR_INVALID');
  const target=cleanUrl(endpoint);
  const secret=secretFromEnv(env,secretEnv);

  return new ProviderAdapter({
    id:adapterId,
    providerId:provider,
    modelId:model,
    capabilities,
    priority,
    estimatedCost,
    costProvenance,
    concurrency,
    authRequired:Boolean(secretEnv),
    terms:'Provider-neutral HTTP chat adapter. No provider-specific behavior is assumed.',
    healthCheck:async()=>{
      if(secretEnv && !secret) return 'UNAVAILABLE';
      return 'UNKNOWN';
    },
    quotaSnapshot:async()=>({known:false,source:'provider-neutral-http'}),
    invoke:async({input,context={},signal}={})=>{
      if(signal?.aborted) throw Object.assign(new Error('PROVIDER_ABORTED'),{code:'PROVIDER_ABORTED'});
      if(secretEnv && !secret) throw Object.assign(new Error('HTTP_CHAT_SECRET_REQUIRED'),{code:'HTTP_CHAT_SECRET_REQUIRED',status:503});
      const response=await fetchImpl(target,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          ...(secret?{authorization:`Bearer ${secret}`}:{}),
        },
        body:JSON.stringify({
          model,
          messages:normalizeMessages(input,context),
          ...(context?.inference_settings||{}),
        }),
        signal,
      });
      if(!response.ok) throw Object.assign(new Error('HTTP_CHAT_PROVIDER_ERROR'),{code:'HTTP_CHAT_PROVIDER_ERROR',status:response.status});
      const body=await response.json();
      const text=extractText(body);
      if(typeof text!=='string'||!text.trim()) throw Object.assign(new Error('HTTP_CHAT_EMPTY_RESPONSE'),{code:'HTTP_CHAT_EMPTY_RESPONSE',status:502});
      return {
        text:text.trim(),
        provenance:{provider,model,transport:'provider-neutral-http'},
        raw:body,
      };
    },
  });
}

export function parseHttpChatProviderDescriptors(env={}) {
  const raw=String(env?.MEL_ALT_AI_PROVIDERS_JSON||'').trim();
  if(!raw) return [];
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw Object.assign(new Error('ALT_AI_PROVIDERS_JSON_INVALID'),{code:'ALT_AI_PROVIDERS_JSON_INVALID'});}
  if(!Array.isArray(parsed)) throw Object.assign(new Error('ALT_AI_PROVIDERS_JSON_INVALID'),{code:'ALT_AI_PROVIDERS_JSON_INVALID'});
  return parsed.slice(0,8).map((row,index)=>({
    id:String(row?.id||`http-ai-${index+1}`).trim(),
    providerId:String(row?.provider||'http-ai').trim(),
    modelId:String(row?.model||'').trim(),
    endpoint:String(row?.endpoint||'').trim(),
    secretEnv:String(row?.secret_env||'').trim(),
    capabilities:Array.isArray(row?.capabilities)?row.capabilities.map(String):['GENERAL'],
    priority:Number(row?.priority||0),
    estimatedCost:row?.estimated_cost==null?null:Number(row.estimated_cost),
    costProvenance:row?.cost_provenance&&typeof row.cost_provenance==='object'?row.cost_provenance:null,
    concurrency:Number(row?.concurrency||1),
  }));
}
