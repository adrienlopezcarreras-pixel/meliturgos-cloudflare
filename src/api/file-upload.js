import { requireAuth } from '../core/security.js';

const MAX_FILE_BYTES = 25_000_000;

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

export async function handleFileUpload(request, env) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/files/upload') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

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
  const id = crypto.randomUUID();
  const key = `uploads/${new Date().toISOString().slice(0,10)}/${id}-${name}`;
  let stored = false;

  if (env?.MEDIA_BUCKET && typeof env.MEDIA_BUCKET.put === 'function') {
    await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType:mime },
      customMetadata: { originalName:name, owner:String(env.MELITURGOS_USER || 'owner') },
    });
    stored = true;
  }

  let preview_text = null;
  if (isTextual(mime, name) && size <= 512_000) {
    try { preview_text = new TextDecoder('utf-8', { fatal:false }).decode(bytes).slice(0, 120_000); } catch {}
  }

  return Response.json({
    ok:true,id,name,size,type:mime,stored,private:true,key:stored?key:null,url:null,
    preview_text,
    analysis_status: preview_text !== null ? 'TEXT_EXTRACTED' : (stored ? 'STORED_PRIVATE' : 'RECEIVED_NOT_PERSISTED')
  }, { headers:{'cache-control':'no-store'} });
}
