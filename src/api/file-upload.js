import { requireAuth, isReleaseSmokeRequest } from '../core/security.js';
import { createEnvMediaVaultCodec } from '../media/media-vault-crypto.js';
import {
  MAX_INLINE_TRANSCRIPTION_BYTES,
  WORKERS_AI_TRANSCRIPTION_MODEL,
  transcribeAudioBytes,
} from '../media/workers-ai-media-capabilities.js';

const MAX_FILE_BYTES = 25_000_000;
const DEFAULT_MEDIA_TTL_SECONDS = 7 * 24 * 60 * 60;

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function mediaTtlSeconds(env) {
  const configured = Number(env?.MEL_MEDIA_TTL_SECONDS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MEDIA_TTL_SECONDS;
  return Math.max(300, Math.min(30 * 24 * 60 * 60, Math.floor(configured)));
}

function safeName(value) {
  return String(value || 'file')
    .replace(/[\\/\0\r\n]+/g, '_')
    .replace(/[^\p{L}\p{N}._() -]/gu, '_')
    .slice(0, 180) || 'file';
}

function isTextual(type, name) {
  return /^text\//i.test(type)
    || /(?:json|xml|javascript|typescript|yaml|yml|csv|markdown|sql)$/i.test(type)
    || /\.(?:txt|md|json|csv|tsv|js|mjs|cjs|ts|tsx|jsx|css|html|htm|xml|yml|yaml|toml|ini|log|sql|py|sh|ps1|java|c|h|cpp|hpp|rs|go|php|rb)$/i.test(name);
}

const RICH_CONVERSION_EXTENSIONS = new Set([
  'pdf','docx','xlsx','xlsm','xlsb','xls','et','ods','odt','numbers',
  'jpeg','jpg','png','webp','svg','gif','bmp',
]);
const RICH_CONVERSION_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.apple.numbers',
  'image/jpeg','image/png','image/webp','image/svg+xml','image/gif','image/bmp',
]);

function extension(name) {
  return String(name || '').toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1] || '';
}

function isImageLike(type, name) {
  return /^image\//i.test(type) || ['jpeg','jpg','png','webp','svg','gif','bmp'].includes(extension(name));
}

function isAudioLike(type, name) {
  return /^audio\//i.test(type)
    || ['mp3','wav','m4a','aac','ogg','oga','opus','webm','flac','mp4'].includes(extension(name));
}

function isRichConversionCandidate(type, name) {
  return RICH_CONVERSION_MIMES.has(String(type || '').toLowerCase())
    || RICH_CONVERSION_EXTENSIONS.has(extension(name));
}

function hasFailClosedWorkersFreeProof(env) {
  let proof = env?.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON;
  if (typeof proof === 'string') {
    try { proof = JSON.parse(proof); } catch { return false; }
  }
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return false;
  if (String(proof.account_plan || '') !== 'WORKERS_FREE') return false;
  if (String(proof.billing_path || '') !== 'direct-workers-ai-binding') return false;
  if (String(proof.free_overage_behavior || '') !== 'FAIL_NOT_BILL') return false;
  const expires = Date.parse(String(proof.expires_at || ''));
  return Number.isFinite(expires) && expires > Date.now();
}

function normalizeMarkdownConversionResult(value) {
  const row = Array.isArray(value) ? value[0] : (Array.isArray(value?.result) ? value.result[0] : value?.result || value);
  if (!row || typeof row !== 'object') return null;
  if (String(row.format || '').toLowerCase() === 'error') return null;
  const data = String(row.data || '').trim();
  return data ? data.slice(0, 120_000) : null;
}

async function transcribeUploadedAudio({ env, bytes, name, mime }) {
  if (!isAudioLike(mime, name)) return { preview_text:null, analysis_status:null, analysis_provider:null };
  if (bytes.byteLength > MAX_INLINE_TRANSCRIPTION_BYTES) {
    return {
      preview_text:null,
      analysis_status:'AUDIO_TRANSCRIPTION_REQUIRES_CHUNKING',
      analysis_provider:null,
    };
  }
  try {
    const result = await transcribeAudioBytes(env, bytes, {});
    return {
      preview_text:String(result?.text || '').slice(0, 120_000) || null,
      analysis_status:result?.text ? 'AUDIO_TRANSCRIBED' : 'AUDIO_TRANSCRIPTION_EMPTY',
      analysis_provider:result?.text ? WORKERS_AI_TRANSCRIPTION_MODEL : null,
    };
  } catch (error) {
    const code = String(error?.code || '');
    if (code === 'WORKERS_AI_ZERO_COST_PROOF_REQUIRED') {
      return { preview_text:null, analysis_status:'AUDIO_TRANSCRIPTION_ZERO_COST_PROOF_REQUIRED', analysis_provider:null };
    }
    if (code === 'AI_BINDING_MISSING') {
      return { preview_text:null, analysis_status:'AUDIO_TRANSCRIPTION_UNAVAILABLE', analysis_provider:null };
    }
    if (code === 'AUDIO_TRANSCRIPTION_REQUIRES_CHUNKING') {
      return { preview_text:null, analysis_status:'AUDIO_TRANSCRIPTION_REQUIRES_CHUNKING', analysis_provider:null };
    }
    return { preview_text:null, analysis_status:'AUDIO_TRANSCRIPTION_FAILED', analysis_provider:null };
  }
}

async function convertRichFile({ env, bytes, name, mime }) {
  if (!isRichConversionCandidate(mime, name)) return { preview_text:null, analysis_status:null };
  if (!env?.AI || typeof env.AI.toMarkdown !== 'function') {
    return { preview_text:null, analysis_status:'RICH_ANALYSIS_UNAVAILABLE' };
  }

  const image = isImageLike(mime, name);
  if (image && !hasFailClosedWorkersFreeProof(env)) {
    return { preview_text:null, analysis_status:'IMAGE_ANALYSIS_ZERO_COST_PROOF_REQUIRED' };
  }

  try {
    const result = await env.AI.toMarkdown(
      { name, blob:new Blob([bytes], { type:mime || 'application/octet-stream' }) },
      {
        conversionOptions:{
          output:{ format:'text' },
          ...(image ? { image:{ descriptionLanguage:'fr' } } : {}),
        },
      },
    );
    const preview_text = normalizeMarkdownConversionResult(result);
    return {
      preview_text,
      analysis_status: preview_text
        ? (image ? 'IMAGE_DESCRIBED' : 'RICH_TEXT_EXTRACTED')
        : 'RICH_ANALYSIS_EMPTY',
      analysis_provider: preview_text ? 'cloudflare-workers-ai-to-markdown' : null,
    };
  } catch {
    return { preview_text:null, analysis_status:'RICH_ANALYSIS_FAILED' };
  }
}

export async function handleFileUpload(request, env, options = {}) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== 'POST' || (pathname !== '/api/files/upload' && options?.authorized !== true)) return null;
  if (options?.authorized !== true) {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
  }

  const parallelProofUpload = Boolean(request.headers.get('x-mel-parallel-proof'))
    && isReleaseSmokeRequest(request, env);

  const type = String(request.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('multipart/form-data')) {
    return Response.json({ ok:false, code:'FILE_REQUIRED' }, { status:415 });
  }

  let form;
  try { form = await request.formData(); }
  catch { return Response.json({ ok:false, code:'FILE_REQUIRED' }, { status:415 }); }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ ok:false, code:'FILE_REQUIRED' }, { status:400 });
  const size = Number(file.size || 0);
  if (size > MAX_FILE_BYTES) return Response.json({ ok:false, code:'FILE_TOO_LARGE', max_bytes:MAX_FILE_BYTES }, { status:413 });

  const name = safeName(file.name);
  const mime = String(file.type || 'application/octet-stream').slice(0, 160);
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (parallelProofUpload) {
    const proofName = /^mel-file-(normal|full)-proof\.txt$/i.exec(name);
    if (!proofName || mime.toLowerCase() !== 'text/plain' || bytes.byteLength > 16_384) {
      return Response.json({ ok:false, code:'MEL_FILE_PROOF_UPLOAD_REJECTED' }, {
        status:403, headers:{'cache-control':'no-store'}
      });
    }
    const proofText = new TextDecoder('utf-8', { fatal:false }).decode(bytes).trim();
    const proofMatch = /^MEL_FILE_(NORMAL|FULL)_PROOF_([a-f0-9]{40})$/i.exec(proofText);
    const expectedKind = proofName[1].toUpperCase();
    const deployedSha = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim().toLowerCase();
    if (!proofMatch || proofMatch[1].toUpperCase() !== expectedKind
      || !/^[a-f0-9]{40}$/.test(deployedSha)
      || proofMatch[2].toLowerCase() !== deployedSha) {
      return Response.json({ ok:false, code:'MEL_FILE_PROOF_PAYLOAD_INVALID' }, {
        status:403, headers:{'cache-control':'no-store'}
      });
    }
  }

  const sha256 = await sha256Hex(bytes);
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const ttlSeconds = parallelProofUpload ? 300 : mediaTtlSeconds(env);
  const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
  const key = `uploads/${new Date().toISOString().slice(0,10)}/${id}-${name}`;
  let stored = false;
  let storedEncryption = null;

  if (env?.MEDIA_BUCKET && typeof env.MEDIA_BUCKET.put === 'function') {
    let sealed;
    try {
      const codec = createEnvMediaVaultCodec(env);
      sealed = await codec.seal(bytes, {
        schema:'MEL_MEDIA_UPLOAD_AAD_V1',
        id,
        owner:String(env.MELITURGOS_USER || 'owner'),
        original_name:name,
        mime,
        plaintext_sha256:sha256,
      });
      await env.MEDIA_BUCKET.put(key, sealed.ciphertext, {
        httpMetadata: { contentType:'application/octet-stream' },
        customMetadata: {
          originalName:name,
          originalMime:mime,
          owner:String(env.MELITURGOS_USER || 'owner'),
          sha256,
          createdAt:createdAt.toISOString(),
          expiresAt:expiresAt.toISOString(),
          ...sealed.metadata,
        },
      });
      storedEncryption = {
        schema:String(sealed.metadata.mediaSchema || ''),
        algorithm:String(sealed.metadata.mediaAlgorithm || ''),
        key_id:String(sealed.metadata.mediaKeyId || ''),
      };
    } catch (error) {
      const code = String(error?.code || 'MEDIA_VAULT_ENCRYPTION_FAILED').slice(0,120);
      const status = Number(error?.status) >= 400 && Number(error?.status) <= 599 ? Number(error.status) : 503;
      return Response.json({ ok:false, code, stored:false, private:true }, { status, headers:{'cache-control':'no-store'} });
    }
    stored = true;
  }

  let preview_text = null;
  let analysis_status = null;
  let analysis_provider = null;
  if (isTextual(mime, name) && size <= 512_000) {
    try {
      preview_text = new TextDecoder('utf-8', { fatal:false }).decode(bytes).slice(0, 120_000);
      analysis_status = 'TEXT_EXTRACTED';
    } catch {}
  }

  if (preview_text === null && isAudioLike(mime, name)) {
    const audio = await transcribeUploadedAudio({ env, bytes, name, mime });
    preview_text = audio.preview_text;
    analysis_status = audio.analysis_status;
    analysis_provider = audio.analysis_provider || null;
  }

  if (preview_text === null && !isAudioLike(mime, name)) {
    const rich = await convertRichFile({ env, bytes, name, mime });
    preview_text = rich.preview_text;
    analysis_status = rich.analysis_status;
    analysis_provider = rich.analysis_provider || null;
  }

  return Response.json({
    ok:true,id,name,size,type:mime,sha256,stored,stored_encrypted:Boolean(stored&&storedEncryption),private:true,key:stored?key:null,url:null,
    encryption:storedEncryption,
    created_at:createdAt.toISOString(),
    expires_at:stored?expiresAt.toISOString():null,
    ttl_seconds:stored?ttlSeconds:null,
    preview_text,
    analysis_status: analysis_status || (stored ? 'STORED_PRIVATE' : 'RECEIVED_NOT_PERSISTED'),
    analysis_provider,
  }, { headers:{'cache-control':'no-store'} });
}


export function expiredMediaKeys(objects, now = Date.now()) {
  return (Array.isArray(objects) ? objects : [])
    .filter(object => {
      const expiresAt = Date.parse(String(object?.customMetadata?.expiresAt || ''));
      return Boolean(object?.key) && Number.isFinite(expiresAt) && expiresAt <= now;
    })
    .map(object => String(object.key));
}
