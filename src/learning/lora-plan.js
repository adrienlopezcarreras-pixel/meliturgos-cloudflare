const SAFE_ID = /^[A-Za-z0-9@._:/+\-]{1,240}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/i;
const ALLOWED_QUANT = new Set(['none','8bit','4bit']);
const ALLOWED_STATUS = new Set(['DRAFT','READY_FOR_TRAINING','TRAINING','EVALUATING','APPROVED','REJECTED','ACTIVE','ROLLED_BACK']);
const READY_REQUIRED_STATUS = new Set(['READY_FOR_TRAINING','TRAINING','EVALUATING','APPROVED','ACTIVE']);
const MAX_CLOUDFLARE_ADAPTER_BYTES = 300_000_000;
const TRAINING_MANIFEST_VERSION = 'mel-lora-training-manifest-v1';
export const MIN_LORA_VALIDATED_EXAMPLES = 50;

export const CLOUDFLARE_LORA_MODEL_PAIRS = Object.freeze({
  'mistralai/Mistral-7B-Instruct-v0.2':'@cf/mistral/mistral-7b-instruct-v0.2-lora',
  'google/gemma-7b-it':'@cf/google/gemma-7b-it-lora',
  'google/gemma-2b-it':'@cf/google/gemma-2b-it-lora',
  'meta-llama/Llama-2-7b-chat-hf':'@cf/meta-llama/llama-2-7b-chat-hf-lora',
});
export const CLOUDFLARE_LORA_RUNTIME_MODELS = Object.freeze(Object.values(CLOUDFLARE_LORA_MODEL_PAIRS));
export const DEFAULT_LORA_BASE_MODEL='mistralai/Mistral-7B-Instruct-v0.2';
export const DEFAULT_LORA_RUNTIME_MODEL=CLOUDFLARE_LORA_MODEL_PAIRS[DEFAULT_LORA_BASE_MODEL];

const SHA256_K = Object.freeze([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

function bounded(value,max=1000){const text=String(value??'').trim();return text.length>max?text.slice(0,max):text;}
function safeId(value,label){const text=bounded(value,240);if(!SAFE_ID.test(text))throw Object.assign(new Error(`LORA_INVALID_${label}`),{code:`LORA_INVALID_${label}`});return text;}
function finiteNumber(value,fallback=null){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function rotr(value,bits){return (value>>>bits)|(value<<(32-bits));}
function stableJson(value){
  if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256Digest(value){
  const bytes=new TextEncoder().encode(String(value));
  const bitLength=bytes.length*8;
  const paddedLength=Math.ceil((bytes.length+9)/64)*64;
  const data=new Uint8Array(paddedLength); data.set(bytes); data[bytes.length]=0x80;
  const view=new DataView(data.buffer);
  view.setUint32(paddedLength-8,Math.floor(bitLength/0x100000000),false);
  view.setUint32(paddedLength-4,bitLength>>>0,false);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w=new Uint32Array(64);
  for(let offset=0;offset<paddedLength;offset+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4,false);
    for(let i=16;i<64;i++){
      const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);
      const s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let i=0;i<64;i++){
      const s1=rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch=(e&f)^((~e)&g);
      const temp1=(h+s1+ch+SHA256_K[i]+w[i])>>>0;
      const s0=rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj=(a&b)^(a&c)^(b&c);
      const temp2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;
    }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
    h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  return `sha256:${[h0,h1,h2,h3,h4,h5,h6,h7].map(word=>word.toString(16).padStart(8,'0')).join('')}`;
}
function benchmarkField(evidence,key){return String(evidence?.[key]??evidence?.provenance?.[key]??evidence?.metadata?.[key]??'').trim();}
function benchmarkOverall(evidence){return Number(evidence?.overall??evidence?.score);}
export function isSupportedCloudflareLoraRuntimeModel(model){return CLOUDFLARE_LORA_RUNTIME_MODELS.includes(String(model||'').trim());}
export function isSupportedCloudflareLoraPair(baseModel,runtimeModel){return CLOUDFLARE_LORA_MODEL_PAIRS[String(baseModel||'').trim()]===String(runtimeModel||'').trim();}

export function createLoraTrainingPlan({id=`mel-lora-${Date.now()}`,base_model=DEFAULT_LORA_BASE_MODEL,runtime_model=DEFAULT_LORA_RUNTIME_MODEL,runtime='cloudflare-workers-ai',dataset_digest,examples=0,rank=8,alpha=16,dropout=0.05,learning_rate=2e-4,epochs=2,quantization='none',target_modules=['q_proj','v_proj'],seed=42,min_measured_gain=0.02,status}={}){
  const count=Math.max(0,Math.floor(Number(examples)||0));
  const normalizedRank=Math.max(1,Math.min(32,Math.round(Number(rank)||8)));
  const normalizedAlpha=Math.max(1,Math.min(1024,Math.round(Number(alpha)||16)));
  const normalizedDropout=Math.max(0,Math.min(.5,Number(dropout)||0));
  const normalizedLearningRate=Math.max(1e-7,Math.min(1e-2,Number(learning_rate)||2e-4));
  const normalizedEpochs=Math.max(1,Math.min(20,Math.round(Number(epochs)||2)));
  const normalizedQuantization=ALLOWED_QUANT.has(String(quantization))?String(quantization):'none';
  const normalizedTargetModules=Array.isArray(target_modules)?[...new Set(target_modules.map(x=>safeId(x,'TARGET_MODULE')))].slice(0,32):[];
  const normalizedSeed=Math.round(Number(seed)||42);
  const normalizedDatasetDigest=safeId(dataset_digest,'DATASET_DIGEST');
  const normalizedRuntime=safeId(runtime,'RUNTIME'); const normalizedRuntimeModel=safeId(runtime_model,'RUNTIME_MODEL'); const normalizedBaseModel=safeId(base_model,'BASE_MODEL');
  const runtimeModelSupported=normalizedRuntime==='cloudflare-workers-ai'&&isSupportedCloudflareLoraPair(normalizedBaseModel,normalizedRuntimeModel);
  const cloudflareCompatible=normalizedRank<=32&&normalizedQuantization==='none'&&runtimeModelSupported;
  const ready=count>=MIN_LORA_VALIDATED_EXAMPLES&&cloudflareCompatible;
  const requestedStatus=status&&ALLOWED_STATUS.has(String(status))?String(status):null;
  const normalizedStatus=!ready&&READY_REQUIRED_STATUS.has(requestedStatus)?'DRAFT':(requestedStatus||(ready?'READY_FOR_TRAINING':'DRAFT'));
  const trainingManifest=Object.freeze({
    version:TRAINING_MANIFEST_VERSION,
    dataset_digest:normalizedDatasetDigest,
    examples:count,
    base_model:normalizedBaseModel,
    runtime_model:normalizedRuntimeModel,
    runtime:normalizedRuntime,
    method:'lora',
    rank:normalizedRank,
    alpha:normalizedAlpha,
    dropout:normalizedDropout,
    learning_rate:normalizedLearningRate,
    epochs:normalizedEpochs,
    quantization:normalizedQuantization,
    target_modules:[...normalizedTargetModules],
    seed:normalizedSeed,
  });
  const trainingManifestDigest=sha256Digest(stableJson(trainingManifest));
  return {id:safeId(id,'ID'),base_model:normalizedBaseModel,runtime_model:normalizedRuntimeModel,runtime:normalizedRuntime,dataset_digest:normalizedDatasetDigest,training_manifest_digest:trainingManifestDigest,training_manifest:trainingManifest,examples:count,rank:normalizedRank,alpha:normalizedAlpha,dropout:normalizedDropout,learning_rate:normalizedLearningRate,epochs:normalizedEpochs,quantization:normalizedQuantization,target_modules:normalizedTargetModules,seed:normalizedSeed,min_measured_gain:Math.max(0,Math.min(1,finiteNumber(min_measured_gain,.02))),status:normalizedStatus,readiness:{ready_for_training:ready,enough_examples:count>=MIN_LORA_VALIDATED_EXAMPLES,min_examples:MIN_LORA_VALIDATED_EXAMPLES,base_weights_frozen:true,trainable_parameters:'LORA_ADAPTER_ONLY',benchmark_required_before_activation:true,measured_gain_required:true,runtime_model_supported:runtimeModelSupported,cloudflare_inference_compatible:cloudflareCompatible,cloudflare_requirements:{quantization:'none',max_rank:32,max_adapter_bytes:MAX_CLOUDFLARE_ADAPTER_BYTES,expected_files:['adapter_config.json','adapter_model.safetensors'],supported_runtime_models:[...CLOUDFLARE_LORA_RUNTIME_MODELS]}}};
}

export function assertAdapterArtifact(artifact={}){
  const id=safeId(artifact.id,'ARTIFACT_ID'); const digest=safeId(artifact.digest,'ARTIFACT_DIGEST'); const baseModel=safeId(artifact.base_model,'BASE_MODEL'); const runtimeModel=safeId(artifact.runtime_model,'RUNTIME_MODEL'); const runtime=safeId(artifact.runtime||'cloudflare-workers-ai','RUNTIME'); const format=bounded(artifact.format||'safetensors',80); const sizeBytes=Math.trunc(finiteNumber(artifact.size_bytes,0)); const rank=Math.trunc(finiteNumber(artifact.rank,0));
  const datasetDigest=artifact.dataset_digest?safeId(artifact.dataset_digest,'DATASET_DIGEST'):null; const trainingManifestDigest=artifact.training_manifest_digest?safeId(artifact.training_manifest_digest,'TRAINING_MANIFEST_DIGEST'):null;
  if(!['safetensors','peft'].includes(format))throw Object.assign(new Error('LORA_UNSUPPORTED_ARTIFACT_FORMAT'),{code:'LORA_UNSUPPORTED_ARTIFACT_FORMAT'});
  if(!SHA256_DIGEST.test(digest))throw Object.assign(new Error('LORA_ARTIFACT_SHA256_REQUIRED'),{code:'LORA_ARTIFACT_SHA256_REQUIRED'});
  if(trainingManifestDigest&&!SHA256_DIGEST.test(trainingManifestDigest))throw Object.assign(new Error('LORA_TRAINING_MANIFEST_SHA256_REQUIRED'),{code:'LORA_TRAINING_MANIFEST_SHA256_REQUIRED'});
  if(sizeBytes<=0||sizeBytes>MAX_CLOUDFLARE_ADAPTER_BYTES)throw Object.assign(new Error('LORA_ARTIFACT_SIZE_INVALID'),{code:'LORA_ARTIFACT_SIZE_INVALID'});
  if(rank<1||rank>32)throw Object.assign(new Error('LORA_ARTIFACT_RANK_INVALID'),{code:'LORA_ARTIFACT_RANK_INVALID'});
  if(runtime!=='cloudflare-workers-ai'||!isSupportedCloudflareLoraPair(baseModel,runtimeModel))throw Object.assign(new Error('LORA_RUNTIME_INCOMPATIBLE'),{code:'LORA_RUNTIME_INCOMPATIBLE'});
  return {id,digest:digest.toLowerCase(),base_model:baseModel,runtime_model:runtimeModel,runtime,size_bytes:sizeBytes,rank,format,uri:bounded(artifact.uri,2000)||null,dataset_digest:datasetDigest,training_manifest_digest:trainingManifestDigest?trainingManifestDigest.toLowerCase():null};
}

export function assertAdapterActivationEvidence({plan,artifact,baseline,candidate}={}){
  if(!plan?.readiness?.ready_for_training||!plan?.readiness?.benchmark_required_before_activation)throw Object.assign(new Error('LORA_PLAN_NOT_ACTIVATABLE'),{code:'LORA_PLAN_NOT_ACTIVATABLE'});
  if(!plan?.readiness?.cloudflare_inference_compatible||!isSupportedCloudflareLoraPair(plan?.base_model,plan?.runtime_model))throw Object.assign(new Error('LORA_RUNTIME_INCOMPATIBLE'),{code:'LORA_RUNTIME_INCOMPATIBLE'});
  const planManifestDigest=String(plan?.training_manifest_digest||'').trim().toLowerCase();
  if(!SHA256_DIGEST.test(planManifestDigest))throw Object.assign(new Error('LORA_TRAINING_MANIFEST_REQUIRED'),{code:'LORA_TRAINING_MANIFEST_REQUIRED'});
  const checked=assertAdapterArtifact(artifact);
  if(!checked.dataset_digest||!checked.training_manifest_digest)throw Object.assign(new Error('LORA_ARTIFACT_PROVENANCE_REQUIRED'),{code:'LORA_ARTIFACT_PROVENANCE_REQUIRED'});
  if(checked.base_model!==plan.base_model)throw Object.assign(new Error('LORA_BASE_MODEL_MISMATCH'),{code:'LORA_BASE_MODEL_MISMATCH'});
  if(checked.runtime_model!==plan.runtime_model||checked.runtime!==plan.runtime)throw Object.assign(new Error('LORA_RUNTIME_INCOMPATIBLE'),{code:'LORA_RUNTIME_INCOMPATIBLE'});
  if(checked.rank!==plan.rank)throw Object.assign(new Error('LORA_RANK_MISMATCH'),{code:'LORA_RANK_MISMATCH'});
  if(checked.dataset_digest!==plan.dataset_digest)throw Object.assign(new Error('LORA_DATASET_MISMATCH'),{code:'LORA_DATASET_MISMATCH'});
  if(checked.training_manifest_digest!==planManifestDigest)throw Object.assign(new Error('LORA_TRAINING_MANIFEST_MISMATCH'),{code:'LORA_TRAINING_MANIFEST_MISMATCH'});
  const baseOverall=benchmarkOverall(baseline),candidateOverall=benchmarkOverall(candidate); if(!Number.isFinite(baseOverall)||!Number.isFinite(candidateOverall))throw Object.assign(new Error('LORA_BENCHMARK_REQUIRED'),{code:'LORA_BENCHMARK_REQUIRED'});
  if(candidateOverall<=0||candidate?.passed===false)throw Object.assign(new Error('LORA_BENCHMARK_FAILED'),{code:'LORA_BENCHMARK_FAILED'});
  const baseSuite=String(baseline?.suite_digest||baseline?.metadata?.suite_digest||'').trim(),candidateSuite=String(candidate?.suite_digest||candidate?.metadata?.suite_digest||'').trim(); if(!baseSuite||!candidateSuite||baseSuite!==candidateSuite)throw Object.assign(new Error('LORA_BENCHMARK_SUITE_MISMATCH'),{code:'LORA_BENCHMARK_SUITE_MISMATCH'});
  const candidateArtifactDigest=benchmarkField(candidate,'artifact_digest').toLowerCase();
  const candidateManifestDigest=benchmarkField(candidate,'training_manifest_digest').toLowerCase();
  const candidateDatasetDigest=benchmarkField(candidate,'dataset_digest');
  if(!candidateArtifactDigest||!candidateManifestDigest||!candidateDatasetDigest)throw Object.assign(new Error('LORA_BENCHMARK_PROVENANCE_REQUIRED'),{code:'LORA_BENCHMARK_PROVENANCE_REQUIRED'});
  if(candidateArtifactDigest!==checked.digest)throw Object.assign(new Error('LORA_BENCHMARK_ARTIFACT_MISMATCH'),{code:'LORA_BENCHMARK_ARTIFACT_MISMATCH'});
  if(candidateManifestDigest!==planManifestDigest)throw Object.assign(new Error('LORA_BENCHMARK_MANIFEST_MISMATCH'),{code:'LORA_BENCHMARK_MANIFEST_MISMATCH'});
  if(candidateDatasetDigest!==plan.dataset_digest)throw Object.assign(new Error('LORA_BENCHMARK_DATASET_MISMATCH'),{code:'LORA_BENCHMARK_DATASET_MISMATCH'});
  const gain=candidateOverall-baseOverall,minimumGain=Number.isFinite(Number(plan.min_measured_gain))?Number(plan.min_measured_gain):.02; if(gain<minimumGain)throw Object.assign(new Error('LORA_MEASURED_GAIN_INSUFFICIENT'),{code:'LORA_MEASURED_GAIN_INSUFFICIENT',gain,minimumGain});
  return {artifact:checked,measured_gain:gain,minimum_gain:minimumGain,suite_digest:baseSuite,dataset_digest:plan.dataset_digest,training_manifest_digest:planManifestDigest,benchmark_artifact_digest:candidateArtifactDigest};
}

export const loraPolicy=Object.freeze({minimum_validated_examples:MIN_LORA_VALIDATED_EXAMPLES,base_weights_frozen:true,preferred_quantization:'none',preferred_rank:8,maximum_cloudflare_rank:32,maximum_cloudflare_adapter_bytes:MAX_CLOUDFLARE_ADAPTER_BYTES,preferred_target_modules:['q_proj','v_proj'],activation_requires_benchmark:true,activation_requires_measured_gain:true,activation_requires_no_major_regression:true,activation_requires_exact_base_model_match:true,activation_requires_runtime_model_match:true,activation_requires_exact_dataset_match:true,activation_requires_exact_training_manifest_match:true,activation_requires_exact_benchmark_artifact_match:true,artifact_sha256_required:true});