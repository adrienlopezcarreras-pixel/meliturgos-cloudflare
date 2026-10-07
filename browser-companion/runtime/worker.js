import { launch } from '@cloudflare/playwright';
import {
  allowedDomainsFromOrigins,
  companionError,
  errorEnvelope,
  executeBrowserStep,
  normalizeCompanionPayload,
  successEnvelope,
} from './browser-core.js';

const KEEP_ALIVE_MS = 60000;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function boundedNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function renderMediaVideo(request, env) {
  if (!env?.BROWSER) return json({ ok: false, code: 'BROWSER_BINDING_MISSING' }, 503);
  const payload = await request.json().catch(() => null);
  if (!payload || payload.schema !== 'mel.media.browser-render-video/v1') {
    return json({ ok: false, code: 'MEDIA_VIDEO_RENDER_REQUEST_INVALID' }, 400);
  }
  const frames = (Array.isArray(payload.frames) ? payload.frames : [])
    .slice(0, 3)
    .map(row => ({
      mime: ['image/jpeg','image/png','image/webp'].includes(String(row?.mime || '').toLowerCase())
        ? String(row.mime).toLowerCase()
        : 'image/jpeg',
      base64: typeof row?.base64 === 'string' ? row.base64.trim() : '',
    }))
    .filter(row => row.base64 && row.base64.length <= 12_000_000);
  if (!frames.length) return json({ ok: false, code: 'MEDIA_VIDEO_RENDER_FRAMES_REQUIRED' }, 400);

  const width = Math.round(boundedNumber(payload.width, 640, 256, 960));
  const height = Math.round(boundedNumber(payload.height, 360, 144, 540));
  const durationMs = Math.round(boundedNumber(payload.duration_ms, 3000, 1500, 6000));
  const fps = Math.round(boundedNumber(payload.fps, 12, 8, 20));
  let browser;
  try {
    browser = await launch(env.BROWSER, { keep_alive: 60000 });
    const context = browser.contexts?.()[0] || await browser.newContext();
    const page = context.pages?.()[0] || await context.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:#000"><canvas id="c"></canvas></body></html>');
    const result = await page.evaluate(async ({ frames, width, height, durationMs, fps }) => {
      const canvas = document.getElementById('c');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      const images = await Promise.all(frames.map(frame => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('FRAME_DECODE_FAILED'));
        img.src = 'data:' + frame.mime + ';base64,' + frame.base64;
      })));
      const stream = canvas.captureStream(fps);
      const mime = ['video/webm;codecs=vp8','video/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
      if (!mime) throw new Error('MEDIARECORDER_WEBM_UNSUPPORTED');
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = event => reject(event.error || new Error('MEDIARECORDER_FAILED'));
      });
      recorder.start(250);
      const started = performance.now();
      await new Promise(resolve => {
        const draw = now => {
          const elapsed = Math.min(durationMs, now - started);
          const progress = elapsed / durationMs;
          const position = progress * images.length;
          const index = Math.min(images.length - 1, Math.floor(position));
          const next = Math.min(images.length - 1, index + 1);
          const local = position - Math.floor(position);
          const drawFrame = (img, alpha, zoomOffset) => {
            const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * (1 + 0.08 * progress + zoomOffset);
            const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
            const x = (width - w) / 2 + Math.sin(progress * Math.PI * 2) * width * 0.025;
            const y = (height - h) / 2 + Math.cos(progress * Math.PI) * height * 0.02;
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, x, y, w, h);
          };
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.fillRect(0,0,width,height);
          drawFrame(images[index], 1, 0);
          if (next !== index && local > 0.55) {
            const alpha = Math.min(1, (local - 0.55) / 0.45);
            drawFrame(images[next], alpha, 0.01);
          }
          ctx.globalAlpha = 1;
          if (elapsed >= durationMs) return resolve();
          requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
      });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, { type: mime });
      const buffer = new Uint8Array(await blob.arrayBuffer());
      if (!buffer.byteLength || buffer.byteLength > 12_000_000) throw new Error('VIDEO_RENDER_OUTPUT_INVALID');
      let binary = '';
      const size = 0x8000;
      for (let i=0;i<buffer.length;i+=size) binary += String.fromCharCode(...buffer.subarray(i, Math.min(buffer.length, i+size)));
      return { mime, base64: btoa(binary), bytes: buffer.byteLength };
    }, { frames, width, height, durationMs, fps });
    if (!result?.base64 || !result?.bytes) return json({ ok: false, code: 'MEDIA_VIDEO_RENDER_EMPTY' }, 502);
    return json({
      ok: true,
      schema: 'mel.media.browser-render-video.result/v1',
      mime: result.mime || 'video/webm',
      base64: result.base64,
      bytes: result.bytes,
      width,
      height,
      duration_ms: durationMs,
      fps,
    });
  } catch (error) {
    return json({ ok: false, code: String(error?.message || 'MEDIA_VIDEO_RENDER_FAILED').slice(0,120) }, 502);
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

function policyFingerprint(origins) {
  return JSON.stringify([...origins].sort());
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/v1/media/render-video') {
      return renderMediaVideo(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: Boolean(env.BROWSER && env.BROWSER_SESSIONS),
        schema: 'mel.devices.browser-companion.health.v1',
        browser_binding: Boolean(env.BROWSER),
        durable_object_binding: Boolean(env.BROWSER_SESSIONS),
      }, env.BROWSER && env.BROWSER_SESSIONS ? 200 : 503);
    }

    if (request.method !== 'POST'
        || !['/v1/browser/perform', '/v1/browser/close'].includes(url.pathname)) {
      return json({ ok: false, code: 'NOT_FOUND' }, 404);
    }

    const payload = await request.json().catch(() => null);
    const sessionId = typeof payload?.session_id === 'string' ? payload.session_id.trim().slice(0, 200) : '';
    if (!sessionId) return json({ ok: false, code: 'SESSION_AND_DEVICE_REQUIRED' }, 400);

    const id = env.BROWSER_SESSIONS.idFromName(sessionId);
    const stub = env.BROWSER_SESSIONS.get(id);
    return stub.fetch(new Request(`https://browser-session.internal${url.pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));
  },
};

export class BrowserSession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.policy = '';
    this.tail = Promise.resolve();
  }

  fetch(request) {
    const next = this.tail.then(() => this.handle(request), () => this.handle(request));
    this.tail = next.catch(() => {});
    return next;
  }

  async handle(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);

    if (url.pathname === '/v1/browser/close') {
      await this.closeSession();
      return json({ ok: true, schema: 'mel.devices.browser-companion.close.v1' });
    }

    try {
      const payload = normalizeCompanionPayload(await request.json());
      const fingerprint = policyFingerprint(payload.sandbox.allowed_origins);
      const storedPolicy = await this.state.storage.get('policy_fingerprint');

      if (storedPolicy && storedPolicy !== fingerprint) {
        throw companionError('BROWSER_SESSION_POLICY_MISMATCH', 409);
      }

      if (!storedPolicy) {
        await this.state.storage.put('policy_fingerprint', fingerprint);
      }
      this.policy = fingerprint;

      await this.ensurePage(payload.sandbox.allowed_origins);
      const result = await executeBrowserStep(this.page, payload.step, payload.sandbox.allowed_origins);
      return json(successEnvelope(payload.step, result));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return json(errorEnvelope(error), status);
    }
  }

  async ensurePage(allowedOrigins) {
    if (this.browser && this.browser.isConnected?.() && this.page && !this.page.isClosed?.()) return;

    const domains = allowedDomainsFromOrigins(allowedOrigins);
    this.browser = await launch(this.env.BROWSER, {
      keep_alive: KEEP_ALIVE_MS,
      guardrails: {
        allowedDomains: domains,
      },
    });
    this.context = this.browser.contexts?.()[0] || await this.browser.newContext();
    this.page = this.context.pages?.()[0] || await this.context.newPage();
  }

  async closeSession() {
    try {
      if (this.browser) await this.browser.close();
    } catch {
      // Closing is best-effort and must never create a retryable browser side effect.
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.policy = '';
    await this.state.storage.delete('policy_fingerprint');
  }
}
