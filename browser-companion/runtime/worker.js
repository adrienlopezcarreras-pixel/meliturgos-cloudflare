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


function normalizeVideoPayload(payload, expectedSchema) {
  if (!payload || payload.schema !== expectedSchema) throw Object.assign(new Error('MEDIA_VIDEO_REQUEST_INVALID'), { status: 400 });
  const base64 = typeof payload.base64 === 'string' ? payload.base64.trim() : '';
  if (!base64 || base64.length > 16_000_000) throw Object.assign(new Error('MEDIA_VIDEO_INPUT_INVALID'), { status: 413 });
  const mimeRaw = String(payload.mime || '').toLowerCase();
  const mime = ['video/webm','video/mp4','video/ogg'].includes(mimeRaw) ? mimeRaw : 'video/webm';
  return {
    base64,
    mime,
    width: Math.round(boundedNumber(payload.width, 640, 256, 960)),
    height: Math.round(boundedNumber(payload.height, 360, 144, 540)),
    durationMs: Math.round(boundedNumber(payload.duration_ms, 3000, 500, 6000)),
    startMs: Math.round(boundedNumber(payload.start_ms, 0, 0, 60_000)),
    fps: Math.round(boundedNumber(payload.fps, 12, 8, 20)),
    imageCount: Math.round(boundedNumber(payload.image_count, 4, 3, 8)),
    includeAudio: payload.audio !== false,
  };
}

async function withMediaPage(env, fn) {
  if (!env?.BROWSER) throw Object.assign(new Error('BROWSER_BINDING_MISSING'), { status: 503 });
  let browser;
  try {
    browser = await launch(env.BROWSER, { keep_alive: 60000 });
    const context = browser.contexts?.()[0] || await browser.newContext();
    const page = context.pages?.()[0] || await context.newPage();
    await page.setContent('<!doctype html><html><body style="margin:0;background:#000"><video id="v" playsinline></video><canvas id="c"></canvas></body></html>');
    return await fn(page);
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

async function resizeMediaImage(request, env) {
  if (!env?.BROWSER) return json({ ok:false, code:'BROWSER_BINDING_MISSING' },503);
  const payload=await request.json().catch(()=>null);
  if(!payload||payload.schema!=='mel.media.browser-resize-image/v1') return json({ok:false,code:'MEDIA_IMAGE_RESIZE_REQUEST_INVALID'},400);
  const base64=typeof payload.base64==='string'?payload.base64.trim():'';
  const mimeRaw=String(payload.mime||'').toLowerCase();
  const mime=['image/jpeg','image/png','image/webp'].includes(mimeRaw)?mimeRaw:'image/jpeg';
  if(!base64||base64.length>12_000_000) return json({ok:false,code:'MEDIA_IMAGE_RESIZE_INPUT_INVALID'},413);
  const maxEdge=Math.round(boundedNumber(payload.max_edge,510,64,510));
  try{
    const result=await withMediaPage(env,page=>page.evaluate(async({base64,mime,maxEdge})=>{
      const img=await new Promise((resolve,reject)=>{
        const node=new Image();
        node.onload=()=>resolve(node);
        node.onerror=()=>reject(new Error('IMAGE_DECODE_FAILED'));
        node.src='data:'+mime+';base64,'+base64;
      });
      const ratio=Math.min(1,maxEdge/Math.max(img.naturalWidth,img.naturalHeight));
      const width=Math.max(1,Math.floor(img.naturalWidth*ratio));
      const height=Math.max(1,Math.floor(img.naturalHeight*ratio));
      const canvas=document.getElementById('c');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
      ctx.drawImage(img,0,0,width,height);
      const data=canvas.toDataURL('image/jpeg',0.88);
      const encoded=data.slice(data.indexOf(',')+1);
      if(!encoded||encoded.length>8_000_000) throw new Error('IMAGE_RESIZE_OUTPUT_INVALID');
      return {base64:encoded,mime:'image/jpeg',width,height};
    },{base64,mime,maxEdge}));
    return json({ok:true,schema:'mel.media.browser-resize-image.result/v1',...result});
  }catch(error){
    return json({ok:false,code:String(error?.message||'MEDIA_IMAGE_RESIZE_FAILED').slice(0,120)},Number(error?.status)||502);
  }
}

async function processMediaVideo(request, env) {
  let payload;
  try { payload = normalizeVideoPayload(await request.json(), 'mel.media.browser-process-video/v1'); }
  catch (error) { return json({ ok:false, code:String(error?.message||'MEDIA_VIDEO_REQUEST_INVALID').slice(0,120) }, Number(error?.status)||400); }
  try {
    const result = await withMediaPage(env, page => page.evaluate(async ({ base64, mime, width, height, durationMs, startMs, fps, includeAudio }) => {
      const fromBase64 = value => {
        const binary = atob(value);
        const out = new Uint8Array(binary.length);
        for (let i=0;i<binary.length;i++) out[i]=binary.charCodeAt(i);
        return out;
      };
      const toBase64 = bytes => {
        let binary=''; const chunk=0x8000;
        for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk)));
        return btoa(binary);
      };
      const video=document.getElementById('v'), canvas=document.getElementById('c'), ctx=canvas.getContext('2d',{alpha:false});
      canvas.width=width; canvas.height=height;
      const url=URL.createObjectURL(new Blob([fromBase64(base64)],{type:mime}));
      video.src=url; video.preload='auto';
      await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('VIDEO_DECODE_FAILED'));});
      const sourceDurationMs=Number.isFinite(video.duration)?video.duration*1000:durationMs;
      const safeStartMs=Math.min(startMs,Math.max(0,sourceDurationMs-100));
      const safeDurationMs=Math.min(durationMs,Math.max(250,sourceDurationMs-safeStartMs));
      const seek=seconds=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('VIDEO_SEEK_TIMEOUT')),5000);
        const done=()=>{clearTimeout(timer);resolve();};
        video.addEventListener('seeked',done,{once:true});
        video.currentTime=Math.max(0,Math.min(seconds,Math.max(0,video.duration-0.001)));
      });
      await seek(safeStartMs/1000);
      const stream=canvas.captureStream(fps);
      let audioTracks=[];
      if(includeAudio && typeof video.captureStream==='function'){
        try{
          const captured=video.captureStream();
          audioTracks=captured.getAudioTracks();
          for(const track of audioTracks) stream.addTrack(track);
        }catch{}
      }
      const outMime=['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';
      if(!outMime) throw new Error('MEDIARECORDER_WEBM_UNSUPPORTED');
      const recorder=new MediaRecorder(stream,{mimeType:outMime,videoBitsPerSecond:1_200_000});
      const chunks=[]; recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('MEDIARECORDER_FAILED'));});
      const draw=()=>{
        ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
        const sw=video.videoWidth||width,sh=video.videoHeight||height,scale=Math.min(width/sw,height/sh);
        const dw=sw*scale,dh=sh*scale;
        ctx.drawImage(video,(width-dw)/2,(height-dh)/2,dw,dh);
      };
      recorder.start(250);
      try{await video.play();}catch{video.muted=true;await video.play();}
      const started=performance.now();
      await new Promise(resolve=>{
        const frame=now=>{draw();if(now-started>=safeDurationMs||video.ended)return resolve();requestAnimationFrame(frame);};
        requestAnimationFrame(frame);
      });
      video.pause(); recorder.stop(); await stopped;
      stream.getTracks().forEach(track=>track.stop()); URL.revokeObjectURL(url);
      const bytes=new Uint8Array(await new Blob(chunks,{type:outMime}).arrayBuffer());
      if(!bytes.byteLength||bytes.byteLength>12_000_000) throw new Error('VIDEO_PROCESS_OUTPUT_INVALID');
      return {base64:toBase64(bytes),mime:outMime,bytes:bytes.byteLength,audio_tracks:audioTracks.length,duration_ms:safeDurationMs};
    }, payload));
    return json({ok:true,schema:'mel.media.browser-process-video.result/v1',...result,width:payload.width,height:payload.height,fps:payload.fps});
  } catch(error) {
    return json({ok:false,code:String(error?.message||'MEDIA_VIDEO_PROCESS_FAILED').slice(0,120)},Number(error?.status)||502);
  }
}

async function sampleMediaVideo(request, env) {
  let payload;
  try { payload = normalizeVideoPayload(await request.json(), 'mel.media.browser-sample-video/v1'); }
  catch (error) { return json({ ok:false, code:String(error?.message||'MEDIA_VIDEO_REQUEST_INVALID').slice(0,120) }, Number(error?.status)||400); }
  try {
    const result = await withMediaPage(env, page => page.evaluate(async ({ base64, mime, durationMs, startMs, imageCount }) => {
      const fromBase64=value=>{const binary=atob(value),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;};
      const toBase64=bytes=>{let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk)));return btoa(binary);};
      const video=document.getElementById('v'),canvas=document.getElementById('c'),ctx=canvas.getContext('2d',{alpha:false});
      const url=URL.createObjectURL(new Blob([fromBase64(base64)],{type:mime}));
      video.src=url;video.preload='auto';
      await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('VIDEO_DECODE_FAILED'));});
      const sourceDurationMs=Number.isFinite(video.duration)?video.duration*1000:durationMs;
      const safeStartMs=Math.min(startMs,Math.max(0,sourceDurationMs-100));
      const safeDurationMs=Math.min(durationMs,Math.max(250,sourceDurationMs-safeStartMs));
      const tileW=320,tileH=180,cols=Math.ceil(Math.sqrt(imageCount)),rows=Math.ceil(imageCount/cols);
      canvas.width=tileW*cols;canvas.height=tileH*rows;
      const seek=seconds=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('VIDEO_SEEK_TIMEOUT')),5000);const done=()=>{clearTimeout(timer);resolve();};video.addEventListener('seeked',done,{once:true});video.currentTime=Math.max(0,Math.min(seconds,Math.max(0,video.duration-0.001)));});
      for(let i=0;i<imageCount;i++){
        const fraction=imageCount===1?0:i/(imageCount-1);
        await seek((safeStartMs+safeDurationMs*fraction)/1000);
        const x=(i%cols)*tileW,y=Math.floor(i/cols)*tileH;
        ctx.fillStyle='#000';ctx.fillRect(x,y,tileW,tileH);
        const sw=video.videoWidth||tileW,sh=video.videoHeight||tileH,scale=Math.min(tileW/sw,tileH/sh),dw=sw*scale,dh=sh*scale;
        ctx.drawImage(video,x+(tileW-dw)/2,y+(tileH-dh)/2,dw,dh);
      }
      const dataUrl=canvas.toDataURL('image/jpeg',0.72);
      const jpeg=dataUrl.slice(dataUrl.indexOf(',')+1);
      if(!jpeg||jpeg.length>8_000_000) throw new Error('VIDEO_SAMPLE_IMAGE_INVALID');

      let audioBase64=null,audioMime=null,audioBytes=0;
      if(typeof video.captureStream==='function'){
        try{
          await seek(safeStartMs/1000);
          const captured=video.captureStream();
          const tracks=captured.getAudioTracks();
          if(tracks.length){
            const audioStream=new MediaStream(tracks);
            const candidate=['audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';
            if(candidate){
              const rec=new MediaRecorder(audioStream,{mimeType:candidate,audioBitsPerSecond:96000}),chunks=[];
              rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
              const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error('AUDIO_RECORD_FAILED'));});
              rec.start(250);try{await video.play();}catch{video.muted=true;await video.play();}
              await new Promise(resolve=>setTimeout(resolve,Math.min(6000,safeDurationMs)));
              video.pause();rec.stop();await stopped;audioStream.getTracks().forEach(t=>t.stop());
              const bytes=new Uint8Array(await new Blob(chunks,{type:candidate}).arrayBuffer());
              if(bytes.byteLength&&bytes.byteLength<=6_000_000){audioBase64=toBase64(bytes);audioMime=candidate;audioBytes=bytes.byteLength;}
            }
          }
        }catch{}
      }
      URL.revokeObjectURL(url);
      return {spritesheet_base64:jpeg,spritesheet_mime:'image/jpeg',audio_base64:audioBase64,audio_mime:audioMime,audio_bytes:audioBytes,duration_ms:safeDurationMs,image_count:imageCount};
    }, payload));
    return json({ok:true,schema:'mel.media.browser-sample-video.result/v1',...result});
  } catch(error) {
    return json({ok:false,code:String(error?.message||'MEDIA_VIDEO_SAMPLE_FAILED').slice(0,120)},Number(error?.status)||502);
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
    if (request.method === 'POST' && url.pathname === '/v1/media/resize-image') {
      return resizeMediaImage(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/media/process-video') {
      return processMediaVideo(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/media/sample-video') {
      return sampleMediaVideo(request, env);
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
