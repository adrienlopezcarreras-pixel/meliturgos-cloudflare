const SAFE_ID = /^[A-Za-z0-9@._:/+\-]{1,240}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/i;
const ALLOWED_QUANT = new Set(['none','8bit','4bit']);
const ALLOWED_STATUS = new Set(['DRAFT','READY_FOR_TRAINING','TRAINING','EVALUATING','APPROVED','REJECTED','ACTIVE','ROLLED_BACK']);
const READY_REQUIRED_STATUS = new Set(['READY_FOR_TRAINING','TRAINING','EVALUATING','APPROVED','ACTIVE']);
const MAX_CLOUDFLARE_ADAPTER_BYTES = 300_000_000;
export const MIN_LORA_VALIDATED_EXAMPLES = 30;

export const CLOUDFLARE_LORA_MODEL_PAIRS = Object.freeze({
  'mistralai/Mistral-7B-Instruct-v0.2':'@cf/mistral/mistral-7b-instruct-v0.2-lora',
  'google/gemma-7b-it':'@cf/google/gemma-7b-it-lora',
  'google/gemma-2b-it':'@cf/google/gemma-2b-it-lora',
  'meta-llama/Llama-2-7b-chat-hf':'@cf/meta-llama/llama-2-7b-chat-hf-lora',
});
export const CLOUDFLARE_LORA_RUNTIME_MODELS = Object.freeze(Object.values(CLOUDFLARE_LORA_MODEL_PAIRS));
export const DEFAULT_LORA_BASE_MODEL='mistralai/Mistral-7B-Instruct-v0.2';
export const DEFAULT_LORA_RUNTIME_MODEL=CLOUDFLARE_LORA_MODEL_PAIRS[DEFAULT_LORA_BASE_MODEL];

function bounded(value,max=1000){const text=String(value??'').trim();return text.length>max?text.slice(0,max):text;}
function safeId(value,label){const text=bounded(value,240);if(!SAFE_ID.test(text))throw Object.assign(new Error(`LORA_INVALID_${label}`),{code:`LORA_INVALID_${label}`});return text;}
function finiteNumber(value,fallback=null){const n=Number(value);return Number.isFinite(n)?n:fallback;}
export function isSupportedCloudflareLoraRuntimeModel(model){return CLOUDFLARE_LORA_RUNTIME_MODELS.includes(String(model||'').trim());}
export function isSupportedCloudflareLoraPair(baseModel,runtimeModel){return CLOUDFLARE_LORA_MODEL_PAIRS[String(baseModel||'').trim()]===String(runtimeModel||'').trim();}

export function createLoraTrainingPlan({id=`mel-lora-${Date.now()}`,base_model=DEFAULT_LORA_BASE_MODEL,runtime_model=DEFAULT_LORA_RUNTIME_MODEL,runtime='cloudflare-workers-ai',dataset_digest,examples=0,rank=8,alpha=16,dropout=0.05,learning_rate=2e-4,epochs=2,quantization='none',target_modules=['q_proj','v_proj'],seed=42,min_measured_gain=0.02,status}={}){
  const count=Math.max(0,Math.floor(Number(examples)||0));
  const normalizedRank=Math.max(1,Math.min(32,Math.round(Number(rank)||8)));
  const normalizedQuantization=ALLOWED_QUANT.has(String(quantization))?String(quantization):'none';
  const normalizedRuntime=safeId(runtime,'RUNTIME'); const normalizedRuntimeModel=safeId(runtime_model,'RUNTIME_MODEL'); const normalizedBaseModel=safeId(base_model,'BASE_MODEL');
  const runtimeModelSupported=normalizedRuntime==='cloudflare-workers-ai'&&isSupportedCloudflareLoraPair(normalizedBaseModel,normalizedRuntimeModel);
  const cloudflareCompatible=normalizedRank<=32&&normalizedQuantization==='none'&&runtimeModelSupported;
  const ready=count>=MIN_LORA_VALIDATED_EXAMPLES&&cloudflareCompatible;
  const requestedStatus=status&&ALLOWED_STATUS.has(String(status))?String(status):null;
  const normalizedStatus=!ready&&READY_REQUIRED_STATUS.has(requestedStatus)?'DRAFT':(requestedStatus||(ready?'READY_FOR_TRAINING':'DRAFT'));
  return {id:safeId(id,'ID'),base_model:normalizedBaseModel,runtime_model:normalizedRuntimeModel,runtime:normalizedRuntime,dataset_digest:safeId(dataset_digest,'DATASET_DIGEST'),examples:count,rank:normalizedRank,alpha:Math.max(1,Math.min(1024,Math.round(Number(alpha)||16))),dropout:Math.max(0,Math.min(.5,Number(dropout)||0)),learning_rate:Math.max(1e-7,Math.min(1e-2,Number(learning_rate)||2e-4)),epochs:Math.max(1,Math.min(20,Math.round(Number(epochs)||2))),quantization:normalizedQuantization,target_modules:Array.isArray(target_modules)?[...new Set(target_modules.map(x=>safeId(x,'TARGET_MODULE')))].slice(0,32):[],seed:Math.round(Number(seed)||42),min_measured_gain:Math.max(0,Math.min(1,finiteNumber(min_measured_gain,.02))),status:normalizedStatus,readiness:{ready_for_training:ready,enough_examples:count>=MIN_LORA_VALIDATED_EXAMPLES,min_examples:MIN_LORA_VALIDATED_EXAMPLES,base_weights_frozen:true,trainable_parameters:'LORA_ADAPTER_ONLY',benchmark_required_before_activation:true,measured_gain_required:true,runtime_model_supported:runtimeModelSupported,cloudflare_inference_compatible:cloudflareCompatible,cloudflare_requirements:{quantization:'none',max_rank:32,max_adapter_bytes:MAX_CLOUDFLARE_ADAPTER_BYTES,expected_files:['adapter_config.json','adapter_model.safetensors'],supported_runtime_models:[...CLOUDFLARE_LORA_RUNTIME_MODELS]}}};
}

export function assertAdapterArtifact(artifact={}){
  const id=safeId(artifact.id,'ARTIFACT_ID'); const digest=safeId(artifact.digest,'ARTIFACT_DIGEST'); const baseModel=safeId(artifact.base_model,'BASE_MODEL'); const runtimeModel=safeId(artifact.runtime_model,'RUNTIME_MODEL'); const runtime=safeId(artifact.runtime||'cloudflare-workers-ai','RUNTIME'); const format=bounded(artifact.format||'safetensors',80); const sizeBytes=Math.trunc(finiteNumber(artifact.size_bytes,0)); const rank=Math.trunc(finiteNumber(artifact.rank,0));
  if(!['safetensors','peft'].includes(format))throw Object.assign(new Error('LORA_UNSUPPORTED_ARTIFACT_FORMAT'),{code:'LORA_UNSUPPORTED_ARTIFACT_FORMAT'});
  if(!SHA256_DIGEST.test(digest))throw Object.assign(new Error('LORA_ARTIFACT_SHA256_REQUIRED'),{code:'LORA_ARTIFACT_SHA256_REQUIRED'});
  if(sizeBytes<=0||sizeBytes>MAX_CLOUDFLARE_ADAPTER_BYTES)throw Object.assign(new Error('LORA_ARTIFACT_SIZE_INVALID'),{code:'LORA_ARTIFACT_SIZE_INVALID'});
  if(rank<1||rank>32)throw Object.assign(new Error('LORA_ARTIFACT_RANK_INVALID'),{code:'LORA_ARTIFACT_RANK_INVALID'});
  if(runtime!=='cloudflare-workers-ai'||!isSupportedCloudflareLoraPair(baseModel,runtimeModel))throw Object.assign(new Error('LORA_RUNTIME_INCOMPATIBLE'),{code:'LORA_RUNTIME_INCOMPATIBLE'});
  return {id,digest:digest.toLowerCase(),base_model:baseModel,runtime_model:runtimeModel,runtime,size_bytes:sizeBytes,rank,format,uri:bounded(artifact.uri,2000)||null,training_manifest_digest:artifact.training_manifest_digest?safeId(artifact.training_manifest_digest,'TRAINING_MANIFEST_DIGEST'):null};
}

export function assertAdapterActivationEvidence({plan,artifact,baseline,candidate}={}){
  if(!plan?.readiness?.ready_for_training||!plan?.readiness?.benchmark_required_before_activation)throw Object.assign(new Error('LORA_PLAN_NOT_ACTIVATABLE'),{code:'LORA_PLAN_NOT_ACTIVATABLE'});
  if(!plan?.readiness?.cloudflare_inference_compatible||!isSupportedCloudflareLoraPair(plan?.base_model,plan?.runtime_model))throw Object.assign(new Error('LORA_RUNTIME_INCOMPATIBLE'),{code:'LORA_RUNTIME_INCOMPATIBLE'});
  const checked=assertAdapterArtifact(artifact);
  if(checked.base_model!==plan.base_model)throw Object.assign(new Error('LORA_BASE_MODEL_MISMATCH'),{code:'LORA_BASE_MODEL_MISMATCH'});
  if(checked.runtime_model!==plan.runtime_model||checked.runtime!==plan.runtime)throw Object.assign(new Error('LORA_RUNTIME_INCOMPATIBLE'),{code:'LORA_RUNTIME_INCOMPATIBLE'});
  if(checked.rank!==plan.rank)throw Object.assign(new Error('LORA_RANK_MISMATCH'),{code:'LORA_RANK_MISMATCH'});
  if(checked.training_manifest_digest&&checked.training_manifest_digest!==plan.dataset_digest)throw Object.assign(new Error('LORA_TRAINING_MANIFEST_MISMATCH'),{code:'LORA_TRAINING_MANIFEST_MISMATCH'});
  const baseOverall=Number(baseline?.overall),candidateOverall=Number(candidate?.overall); if(!Number.isFinite(baseOverall)||!Number.isFinite(candidateOverall))throw Object.assign(new Error('LORA_BENCHMARK_REQUIRED'),{code:'LORA_BENCHMARK_REQUIRED'});
  const baseSuite=String(baseline?.suite_digest||baseline?.metadata?.suite_digest||'').trim(),candidateSuite=String(candidate?.suite_digest||candidate?.metadata?.suite_digest||'').trim(); if(!baseSuite||!candidateSuite||baseSuite!==candidateSuite)throw Object.assign(new Error('LORA_BENCHMARK_SUITE_MISMATCH'),{code:'LORA_BENCHMARK_SUITE_MISMATCH'});
  const gain=candidateOverall-baseOverall,minimumGain=Number.isFinite(Number(plan.min_measured_gain))?Number(plan.min_measured_gain):.02; if(gain<minimumGain)throw Object.assign(new Error('LORA_MEASURED_GAIN_INSUFFICIENT'),{code:'LORA_MEASURED_GAIN_INSUFFICIENT',gain,minimumGain});
  return {artifact:checked,measured_gain:gain,minimum_gain:minimumGain,suite_digest:baseSuite};
}

export const loraPolicy=Object.freeze({minimum_validated_examples:MIN_LORA_VALIDATED_EXAMPLES,base_weights_frozen:true,preferred_quantization:'none',preferred_rank:8,maximum_cloudflare_rank:32,maximum_cloudflare_adapter_bytes:MAX_CLOUDFLARE_ADAPTER_BYTES,preferred_target_modules:['q_proj','v_proj'],activation_requires_benchmark:true,activation_requires_measured_gain:true,activation_requires_no_major_regression:true,activation_requires_exact_base_model_match:true,activation_requires_runtime_model_match:true,artifact_sha256_required:true});
