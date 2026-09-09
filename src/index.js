// Canonical Worker entrypoint. worker.js is an API compatibility dependency.
import router from "./router.js";
import { requireAuth } from "./core/security.js";
import { importChatGPTArchive } from "./persistence/chatgpt-archive-importer.js";

function isArchivePayload(value) {
  if (Array.isArray(value)) return value.some(x => x && (x.mapping || x.messages || x.conversation_id || x.id));
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.conversations) || Array.isArray(value.items)) return true;
  return Boolean(value.mapping || value.messages);
}

async function maybeHandleChatGPTArchive(request, env) {
  if (request.method !== 'POST') return null;
  const url = new URL(request.url);
  const explicit = url.pathname === '/api/gen2/import/chatgpt-archive';
  const compatibility = url.pathname === '/api/import/chatgpt-context';
  if (!explicit && !compatibility) return null;
  if (!(request.headers.get('content-type') || '').includes('application/json')) return null;

  let body;
  try { body = await request.clone().json(); }
  catch { return explicit ? Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }) : null; }

  const archive = explicit ? (body.archive ?? body.payload ?? body) : body;
  if (!isArchivePayload(archive)) return compatibility ? null : Response.json({ ok: false, code: 'CHATGPT_EXPORT_FORMAT_UNSUPPORTED' }, { status: 400 });

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const preview = explicit ? body.preview !== false : false;
  try {
    const result = await importChatGPTArchive(env, archive, { preview });
    return Response.json(result, { status: result.ok === false ? 207 : 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, error: error.message, code: error.code || 'CHATGPT_ARCHIVE_IMPORT_FAILED' }, { status: error.status || 500 });
  }
}

/** Main fetch handler. */
export default {
  async fetch(request, env, ctx) {
    try {
      const archiveResponse = await maybeHandleChatGPTArchive(request, env);
      if (archiveResponse) return archiveResponse;

      const response = await router.fetch(request, env, ctx);
      if (response) return response;
      throw new Error("Router returned null");
    } catch (error) {
      if (error?.status >= 400 && error.status < 600 && typeof error.code === "string") return Response.json({error:error.code,code:error.code},{status:Number(error.status)});
      if (error instanceof SyntaxError) return Response.json({error:"Invalid JSON",code:"INVALID_JSON"},{status:400});
      console.error("[Gen2] Request error:", error);
      return new Response(
        JSON.stringify({ error: "Une erreur interne est survenue.", code: "INTERNAL_ERROR" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};
