// Canonical core Worker handler. The retired root worker.js stays inert;
// deployment/auth/UI wrappers delegate here without owning a second runtime.
import router from "./router.js";
import { requireAuth } from "./core/security.js";
import { createGen2Runtime } from "./core/orchestrator/gen2-runtime.js";
import { injectEvolutionPreflightCapability } from "./evolution/chat-intent.js";
import { getSystemReadiness } from "./diagnostics/system-readiness.js";
import { handleNativeChat } from "./api/native-chat.js";
import { maybeHandlePublicTeacherBridge } from "./teachers/public-teacher-api.js";
import { runAutonomyMaintenance, runAutonomyRuntimeTick } from "./evolution/autonomy-runtime.js";
import { runEcosystemCapabilityWatch } from "./evaluation/capability-watch-runtime.js";
import { maybeHandleAutonomyApi } from "./evolution/autonomy-api.js";
import { maybeHandleReleaseLaunchBootstrap } from "./evolution/release-launch-bootstrap.js";
import { enhanceMvpBehavior } from "./pages/mvp-behavior-enhancer.js";
import { runLoraTrainingHeartbeat } from "./learning/lora-training-heartbeat.js";
import { handleVoiceTranscription } from "./api/voice-transcribe.js";
import { handleFileUpload } from "./api/file-upload.js";
import { readLastSafeWorkJob, writeLastSafeWorkJob } from "./dev/dev-bridge-state-store.js";
import { getChatGPTImportStatus } from "./persistence/chatgpt-archive-importer.js";
import { maybeHandleWaveshareTerminalApi } from "./devices/waveshare-terminal-api.js";
import { maybeHandleComputerApi } from "./devices/computer-companion-api.js";
import { runShardVaultCycle, searchAutonomousShardVaultRepositories } from "./continuity/shardvault-runtime.js";

function deployedWatchSourceSha() {
  return typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '') || null : null;
}

function isArchivePayload(value) {
  if (Array.isArray(value)) return value.some(x => x && (x.mapping || x.messages || x.conversation_id || x.id));
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.conversations) || Array.isArray(value.items)) return true;
  return Boolean(value.mapping || value.messages);
}

async function readJsonObject(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw Object.assign(new Error('JSON_REQUIRED'), { code: 'JSON_REQUIRED', status: 415 });
  }
  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object') throw new Error('not-object');
    return body;
  } catch {
    throw Object.assign(new Error('INVALID_JSON'), { code: 'INVALID_JSON', status: 400 });
  }
}

function apiError(error, fallback = 'INTERNAL_ERROR') {
  return Response.json(
    { ok: false, error: String(error?.message || fallback), code: error?.code || fallback },
    { status: Number(error?.status) || 500, headers: { 'cache-control': 'no-store' } }
  );
}

function aiResultText(result) {
  if (typeof result === 'string') return result;
  return result?.response
    ?? result?.text
    ?? result?.message?.content
    ?? result?.choices?.[0]?.message?.content
    ?? result?.choices?.[0]?.text
    ?? '';
}

function aiFinishReason(result) {
  if (!result || typeof result === 'string') return null;
  const value = result.finish_reason
    ?? result.finishReason
    ?? result.stop_reason
    ?? result.stopReason
    ?? result.message?.finish_reason
    ?? result.message?.finishReason
    ?? result.choices?.[0]?.finish_reason
    ?? result.choices?.[0]?.stop_reason
    ?? null;
  return value == null ? null : String(value).trim().toLowerCase();
}

function aiWasTruncated(result) {
  const reason = aiFinishReason(result);
  if (!reason) return false;
  return ['length','max_tokens','max_token','max_output_tokens','token_limit','context_length','max_length'].includes(reason)
    || /(?:max|token|length).*(?:limit|length|tokens?)/i.test(reason);
}

function mergeContinuationResult(first, last, text, segments, incomplete) {
  if (typeof first === 'string' && segments === 1) return first;
  const base = first && typeof first === 'object' ? first : {};
  const tail = last && typeof last === 'object' ? last : {};
  return {
    ...base,
    ...tail,
    response: text,
    finish_reason: aiFinishReason(last),
    mel_auto_continued: segments > 1,
    mel_continuation_segments: segments,
    mel_response_incomplete: Boolean(incomplete),
  };
}

export function withChatAiDefaults(env) {
  if (!env?.AI || typeof env.AI.run !== 'function') return env;
  const configured = Number(env.MEL_MAX_OUTPUT_TOKENS);
  const maxTokens = Math.max(512, Math.min(8192, Number.isFinite(configured) && configured > 0 ? configured : 4096));
  const configuredSegments = Number(env.MEL_MAX_CONTINUATION_SEGMENTS);
  const maxSegments = Math.max(1, Math.min(4, Number.isFinite(configuredSegments) && configuredSegments > 0 ? configuredSegments : 3));
  const configuredChars = Number(env.MEL_MAX_COMBINED_OUTPUT_CHARS);
  const maxCombinedChars = Math.max(8000, Math.min(120000, Number.isFinite(configuredChars) && configuredChars > 0 ? configuredChars : 50000));
  const base = env.AI;

  return {
    ...env,
    AI: {
      async run(model, input = {}, ...rest) {
        const payload = input && typeof input === 'object' && !Array.isArray(input)
          ? { ...input, max_tokens: Number(input.max_tokens) > 0 ? input.max_tokens : maxTokens }
          : input;
        const first = await base.run.call(base, model, payload, ...rest);
        if (!payload || typeof payload !== 'object' || !Array.isArray(payload.messages) || !aiWasTruncated(first) || maxSegments <= 1) return first;

        let last = first;
        let combined = String(aiResultText(first) || '').trim();
        let segments = 1;
        const continuationMessages = payload.messages.map(message => ({ ...message }));
        if (combined) continuationMessages.push({ role: 'assistant', content: combined });

        while (aiWasTruncated(last) && segments < maxSegments && combined.length < maxCombinedChars) {
          continuationMessages.push({
            role: 'user',
            content: 'Continue exactement à partir de la dernière phrase, sans répéter ce qui précède. Termine complètement la réponse.'
          });
          let next;
          try {
            next = await base.run.call(base, model, { ...payload, messages: continuationMessages }, ...rest);
          } catch {
            break;
          }
          const segment = String(aiResultText(next) || '').trim();
          if (!segment) break;
          combined = `${combined}${combined ? '\n' : ''}${segment}`.slice(0, maxCombinedChars);
          continuationMessages.push({ role: 'assistant', content: segment });
          last = next;
          segments++;
        }

        return mergeContinuationResult(first, last, combined, segments, aiWasTruncated(last));
      }
    }
  };
}

async function maybeHandleMemoryCompatibility(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['/api/memory/status', '/api/memory/consolidate', '/api/export'].includes(url.pathname)) return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const runtime = createGen2Runtime({ env });
  if (url.pathname === '/api/memory/status') {
    const status = await runtime.bus.execute('memory.status', {}, busContext(env));
    return Response.json(status, { headers: { 'cache-control': 'no-store' } });
  }

  if (url.pathname === '/api/memory/consolidate') {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit == null ? 100 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return Response.json({ ok: false, error: 'MEMORY_CONSOLIDATE_LIMIT_INVALID' }, { status: 400, headers: { 'cache-control': 'no-store' } });
    }
    const result = await runtime.bus.execute('memory.consolidate', { limit }, busContext(env));
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  }

  const payload = await runtime.bus.execute('memory.export', {}, busContext(env));
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="meliturgos-memory-${new Date().toISOString().slice(0,10)}.json"`,
      'cache-control': 'no-store'
    }
  });
}

function busContext(env) {
  return {
    owner: env.MELITURGOS_USER || 'owner',
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID(),
  };
}

async function maybeHandleWorkPreflight(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/work/')) return null;
  if (url.pathname !== '/api/work/health' && url.pathname !== '/api/work/jobs') return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if (request.method === 'GET' && url.pathname === '/api/work/health') {
    return Response.json({
      ok: true,
      available: true,
      status: 'ONLINE',
      mode: 'preflight-only',
      protected_write_bridge: true,
      rule: 'AI_COUNCIL_BEFORE_CODE'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method === 'GET' && url.pathname === '/api/work/jobs') {
    const lastSafeWorkJob = await readLastSafeWorkJob(env.DB);
    return Response.json({
      ok: true,
      jobs: lastSafeWorkJob ? [lastSafeWorkJob] : [],
      last_job: lastSafeWorkJob,
      persisted: Boolean(env.DB),
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method === 'POST' && url.pathname === '/api/work/jobs') {
    try {
      const body = await readJsonObject(request);
      const mode = String(body.mode || 'prepare').toLowerCase();
      if (mode !== 'prepare' && mode !== 'preflight') return null;
      const goal = String(body.goal || body.objective || body.prompt || body.description || '').trim();
      if (!goal) return Response.json({ ok: false, error: 'GOAL_REQUIRED', code: 'GOAL_REQUIRED' }, { status: 400 });
      const runtime = createGen2Runtime({ env });
      const preflight = await runtime.bus.execute('evolution.preflight', {
        goal,
        context: { ...(body.context && typeof body.context === 'object' ? body.context : {}), origin: 'work-ui', rule: 'AI_COUNCIL_BEFORE_CODE' },
        minResponses: Math.max(2, Math.min(12, Number(body.minResponses) || 2))
      }, busContext(env));
      const lastSafeWorkJob = {
        id: crypto.randomUUID(),
        mode: 'preflight-only',
        status: 'PREPARED',
        goal,
        created_at: new Date().toISOString(),
        preflight
      };
      const persisted = await writeLastSafeWorkJob(env.DB, lastSafeWorkJob);
      return Response.json({ ok: true, ...lastSafeWorkJob, persisted }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return apiError(error, 'WORK_PREFLIGHT_FAILED');
    }
  }

  return null;
}

async function maybeHandleReadiness(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/gen2/readiness') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const refreshHealth = url.searchParams.get('refresh') === '1';
    return Response.json(await getSystemReadiness({ env, refreshHealth }), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'READINESS_FAILED');
  }
}

async function maybeHandleCouncilAndEvolution(request, env) {
  if (request.method !== 'POST') return null;
  const path = new URL(request.url).pathname;
  if (path !== '/api/gen2/council/state-of-play' && path !== '/api/gen2/evolution/preflight') return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const goal = String(body.goal || body.objective || '').trim();
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const minResponses = Math.max(2, Math.min(12, Number(body.minResponses) || 2));
    const runtime = createGen2Runtime({ env });
    const capabilityId = path === '/api/gen2/council/state-of-play'
      ? 'council.state-of-play'
      : 'evolution.preflight';
    const result = await runtime.bus.execute(capabilityId, { goal, context, minResponses }, busContext(env));

    if (capabilityId === 'council.state-of-play') {
      return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
    }
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'AI_PREFLIGHT_FAILED');
  }
}

async function maybeHandleChatGPTArchive(request, env) {
  const url = new URL(request.url);
  const statusPath = url.pathname === '/api/gen2/import/chatgpt-status';

  if (request.method === 'GET' && statusPath) {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
    try {
      return Response.json(await getChatGPTImportStatus(env), { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return apiError(error, 'CHATGPT_IMPORT_STATUS_FAILED');
    }
  }

  if (request.method !== 'POST') return null;
  const explicit = url.pathname === '/api/gen2/import/chatgpt-archive';
  const compatibility = url.pathname === '/api/import/chatgpt-context';
  if (!explicit && !compatibility) return null;

  if (compatibility) {
    return new Response(null, {
      status: 307,
      headers: { location: '/api/gen2/import/chatgpt-archive', 'cache-control': 'no-store' },
    });
  }
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return Response.json({ ok: false, code: 'JSON_REQUIRED' }, { status: 415 });
  }

  let body;
  try { body = await request.clone().json(); }
  catch { return Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }); }

  const archive = body.archive ?? body.payload ?? body;
  if (!isArchivePayload(archive)) return Response.json({ ok: false, code: 'CHATGPT_EXPORT_FORMAT_UNSUPPORTED' }, { status: 400 });

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const preview = body.preview !== false;
  try {
    const runtime = createGen2Runtime({ env });
    const capabilityId = preview ? 'chatgpt.archive.preview' : 'chatgpt.archive.import';
    const result = await runtime.bus.execute(capabilityId, { archive }, busContext(env));
    return Response.json(result, { status: result.ok === false ? 207 : 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'CHATGPT_ARCHIVE_IMPORT_FAILED');
  }
}

/** Main fetch and scheduled handlers. */
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path.startsWith('/api/device/v1/')) {
        const terminalResponse = await maybeHandleWaveshareTerminalApi(request, env);
        if (terminalResponse) return terminalResponse;
      }

      if (path.startsWith('/api/computer/v1/')) {
        const computerResponse = await maybeHandleComputerApi(request, env);
        if (computerResponse) return computerResponse;
      }

      if (path === '/api/voice/transcribe') {
        const voiceResponse = await handleVoiceTranscription(request, env);
        if (voiceResponse) return voiceResponse;
      }

      if (path === '/api/files/upload') {
        const fileResponse = await handleFileUpload(request, env);
        if (fileResponse) return fileResponse;
      }

      if (path === '/api/internal/release-launch-bootstrap') {
        const releaseBootstrapResponse = await maybeHandleReleaseLaunchBootstrap(request, env);
        if (releaseBootstrapResponse) return releaseBootstrapResponse;
      }

      if (path.startsWith('/api/teacher/')) {
        const publicTeacherResponse = await maybeHandlePublicTeacherBridge(request, env);
        if (publicTeacherResponse) return publicTeacherResponse;
      }

      if (path === '/api/memory/status' || path === '/api/memory/consolidate' || path === '/api/export') {
        const memoryResponse = await maybeHandleMemoryCompatibility(request, env);
        if (memoryResponse) return memoryResponse;
      }

      if (path.startsWith('/api/work/')) {
        const safeWorkResponse = await maybeHandleWorkPreflight(request, env);
        if (safeWorkResponse) return safeWorkResponse;
      }

      if (path.startsWith('/api/gen2/autonomy/')) {
        const autonomyResponse = await maybeHandleAutonomyApi(request, env);
        if (autonomyResponse) return autonomyResponse;
      }

      if (path === '/api/gen2/readiness') {
        const readinessResponse = await maybeHandleReadiness(request, env);
        if (readinessResponse) return readinessResponse;
      }

      if (path === '/api/gen2/council/state-of-play' || path === '/api/gen2/evolution/preflight') {
        const councilResponse = await maybeHandleCouncilAndEvolution(request, env);
        if (councilResponse) return councilResponse;
      }

      if (
        path === '/api/gen2/import/chatgpt-status'
        || path === '/api/gen2/import/chatgpt-archive'
        || path === '/api/import/chatgpt-context'
      ) {
        const archiveResponse = await maybeHandleChatGPTArchive(request, env);
        if (archiveResponse) return archiveResponse;
      }

      const preparedRequest = path === '/api/chat' && request.method === 'POST'
        ? await injectEvolutionPreflightCapability(request, env)
        : request;
      if (path === '/api/chat') {
        return await handleNativeChat(preparedRequest, withChatAiDefaults(env));
      }

      const response = await router.fetch(preparedRequest, env, ctx);
      if (response) {
        return path === '/professor' ? await enhanceMvpBehavior(response) : response;
      }
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
  },

  async scheduled(controller, env, ctx) {
    const cron = String(controller?.cron || '');
    const maintenanceCron = cron === '17 * * * *';

    const tasks = maintenanceCron
      ? [
          runAutonomyMaintenance(env).catch((error) => {
            console.error('[MEL autonomy] hourly maintenance failed:', error?.code || error?.message || error);
            return null;
          }),
          runEcosystemCapabilityWatch(env, { sourceSha: deployedWatchSourceSha() }).catch((error) => {
            console.error('[MEL watch] hourly ecosystem watch failed:', error?.code || error?.message || error);
            return null;
          }),
          runShardVaultCycle(env).then((result) => {
            if (result?.ok === false) console.error('[MEL ShardVault] cycle reported:', result.reason || result.error || 'NOT_OK');
            return result;
          }).catch((error) => {
            console.error('[MEL ShardVault] scheduled continuity cycle failed:', error?.code || error?.message || error);
            return null;
          }),
          searchAutonomousShardVaultRepositories(env).then((result) => {
            if (result?.ok === false) console.error('[MEL ShardVault] hourly Internet discovery reported:', result.status || result.error || 'NOT_OK');
            return result;
          }).catch((error) => {
            console.error('[MEL ShardVault] hourly Internet discovery failed:', error?.code || error?.message || error);
            return null;
          }),
        ]
      : [
          runAutonomyRuntimeTick(env).catch((error) => {
            console.error('[MEL autonomy] scheduled tick failed:', error?.code || error?.message || error);
            return null;
          }),
          runLoraTrainingHeartbeat(env).then((result) => {
            if (result?.status === 'HEARTBEAT_ERROR') {
              console.error('[MEL LoRA] training heartbeat error:', result.error || result.status);
            }
            return result;
          }).catch((error) => {
            console.error('[MEL LoRA] scheduled training heartbeat failed:', error?.code || error?.message || error);
            return null;
          }),
        ];

    const work = Promise.allSettled(tasks);
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else await work;
  }
};