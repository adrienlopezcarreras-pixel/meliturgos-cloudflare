// Media on the owner's PC. The command carries only a small JSON payload.
// User text stays inside that base64 blob, never in the PowerShell source.
// The PC keeps the last file and will only read it again if the hash matches.

import { localPcModelReady } from './local-pc-model.js';
import { mediaStorageReady, readPrivateArtifactBytes, storePrivateArtifact } from '../media/workers-ai-media-capabilities.js';

const MAX_PAYLOAD_B64 = 6_800;
const TIMEOUT_MS = 150_000;
const POLL_MS = 700;

const KINDS = new Set(['speech', 'image', 'analyze', 'process', 'transcribe', 'video']);

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64Utf8(b64) {
  const binary = atob(String(b64 || ''));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

function bytesFromBase64(b64) {
  const binary = atob(String(b64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function localPcMediaCommand({ kind, text = '', prompt = '', sha256 = '' } = {}) {
  if (!KINDS.has(kind)) throw new Error('LOCAL_MEDIA_KIND_UNSUPPORTED');
  const payload = toBase64Utf8(JSON.stringify({
    kind,
    text: String(text || '').slice(0, 400),
    prompt: String(prompt || '').slice(0, 500),
    sha256: String(sha256 || '').toLowerCase().slice(0, 64),
  }));
  if (payload.length > MAX_PAYLOAD_B64) throw new Error('LOCAL_MEDIA_PAYLOAD_TOO_LARGE');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$req=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + payload + "'))|ConvertFrom-Json",
    "$dir=Join-Path $env:LOCALAPPDATA 'MEL\\media'",
    "New-Item -ItemType Directory -Force -Path $dir|Out-Null",
    "$cap=280000",
    "function Emit($o){$o.action='local.media';$o|ConvertTo-Json -Compress}",
    "function Hash($b){[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($b)).Replace('-','').ToLower()}",
    "if($req.kind -eq 'speech'){",
    " Add-Type -AssemblyName System.Speech",
    " $path=Join-Path $dir 'last-speech.wav'",
    " $s=New-Object System.Speech.Synthesis.SpeechSynthesizer",
    " if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}",
    " $s.SetOutputToWaveFile($path);$s.Speak([string]$req.text);$s.Dispose()",
    " $b=[IO.File]::ReadAllBytes($path); if($b.Length -gt $cap){throw 'LOCAL_MEDIA_TOO_LARGE'}",
    " $h=Hash $b; Set-Content -LiteralPath (Join-Path $dir 'last-speech.sha') -Value $h -NoNewline -Encoding ascii",
    " Emit @{kind='speech';mime='audio/wav';sha256=$h;media_b64=[Convert]::ToBase64String($b)}; return}",
    "if($req.kind -eq 'image'){",
    " $body=@{prompt=[string]$req.prompt;steps=4;width=512;height=512}|ConvertTo-Json -Compress",
    " try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:7860/sdapi/v1/txt2img' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 90}catch{Emit @{kind='image';code='LOCAL_IMAGE_ENGINE_ABSENT'}; return}",
    " $img=[string]$r.images[0]; if(-not $img){throw 'LOCAL_MEDIA_EMPTY'}",
    " $b=[Convert]::FromBase64String($img); if($b.Length -gt $cap){throw 'LOCAL_MEDIA_TOO_LARGE'}",
    " $path=Join-Path $dir 'last-image.png'; [IO.File]::WriteAllBytes($path,$b)",
    " $h=Hash $b; Set-Content -LiteralPath (Join-Path $dir 'last-image.sha') -Value $h -NoNewline -Encoding ascii",
    " Emit @{kind='image';mime='image/png';sha256=$h;media_b64=$img}; return}",
    "if($req.kind -eq 'analyze' -or $req.kind -eq 'process' -or $req.kind -eq 'transcribe'){",
    " if($req.kind -eq 'transcribe'){$path=Join-Path $dir 'last-speech.wav'; $shaPath=Join-Path $dir 'last-speech.sha'}else{$path=Join-Path $dir 'last-image.png'; $shaPath=Join-Path $dir 'last-image.sha'}",
    " if(-not (Test-Path -LiteralPath $path)){Emit @{kind=$req.kind;code='LOCAL_MEDIA_FILE_MISSING'}; return}",
    " $h=(Get-Content -LiteralPath $shaPath -Raw).Trim()",
    " if($h -ne [string]$req.sha256){Emit @{kind=$req.kind;code='LOCAL_MEDIA_FILE_MISMATCH'}; return}",
    "}",
    "if($req.kind -eq 'analyze'){",
    " $model='moondream'; $pref=Join-Path $env:LOCALAPPDATA 'MEL\\local-vision.txt'",
    " if(Test-Path -LiteralPath $pref){$n=(Get-Content -LiteralPath $pref -Raw).Trim(); if($n -match '^[A-Za-z0-9_.:/-]{1,80}$'){$model=$n}}",
    " $b64=[Convert]::ToBase64String([IO.File]::ReadAllBytes($path))",
    " $body=@{model=$model;stream=$false;messages=@(@{role='user';content=[string]$req.prompt;images=@($b64)})}|ConvertTo-Json -Compress -Depth 6",
    " try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 90}catch{Emit @{kind='analyze';code='LOCAL_VISION_ENGINE_ABSENT'}; return}",
    " $t=[string]$r.message.content; if(-not $t.Trim()){throw 'LOCAL_MEDIA_EMPTY'}",
    " Emit @{kind='analyze';text_b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t))}; return}",
    "if($req.kind -eq 'process'){",
    " $body=@{prompt=[string]$req.prompt;steps=4;width=512;height=512;init_images=@([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)))}|ConvertTo-Json -Compress -Depth 5",
    " try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:7860/sdapi/v1/img2img' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 90}catch{Emit @{kind='process';code='LOCAL_IMAGE_ENGINE_ABSENT'}; return}",
    " $img=[string]$r.images[0]; if(-not $img){throw 'LOCAL_MEDIA_EMPTY'}",
    " $b=[Convert]::FromBase64String($img); if($b.Length -gt $cap){throw 'LOCAL_MEDIA_TOO_LARGE'}",
    " [IO.File]::WriteAllBytes($path,$b); $h=Hash $b; Set-Content -LiteralPath $shaPath -Value $h -NoNewline -Encoding ascii",
    " Emit @{kind='process';mime='image/png';sha256=$h;media_b64=$img}; return}",
    "if($req.kind -eq 'transcribe'){",
    " $whisper=Get-Command whisper -ErrorAction SilentlyContinue",
    " if(-not $whisper){Emit @{kind='transcribe';code='LOCAL_TRANSCRIPTION_ENGINE_ABSENT'}; return}",
    " $out=& $whisper.Source $path --language fr --output_format txt --output_dir $dir",
    " $txt=Join-Path $dir 'last-speech.txt'",
    " if(-not (Test-Path -LiteralPath $txt)){throw 'LOCAL_MEDIA_EMPTY'}",
    " $t=[IO.File]::ReadAllText($txt)",
    " Emit @{kind='transcribe';text_b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t))}; return}",
    "if($req.kind -eq 'video'){",
    " $path=Join-Path $dir 'last-image.png'",
    " if(-not (Test-Path -LiteralPath $path)){Emit @{kind='video';code='LOCAL_MEDIA_FILE_MISSING'}; return}",
    " if([string]$req.sha256){$h=(Get-Content -LiteralPath (Join-Path $dir 'last-image.sha') -Raw).Trim(); if($h -ne [string]$req.sha256){Emit @{kind='video';code='LOCAL_MEDIA_FILE_MISMATCH'}; return}}",
    " $ff=Get-Command ffmpeg -ErrorAction SilentlyContinue",
    " if(-not $ff){Emit @{kind='video';code='LOCAL_VIDEO_ENGINE_ABSENT'}; return}",
    " $video=Join-Path $dir 'last-video.mp4'",
    " if(Test-Path -LiteralPath $video){Remove-Item -LiteralPath $video -Force}",
    " & $ff.Source -y -loop 1 -i $path -t 2 -r 10 -pix_fmt yuv420p $video",
    " $b=[IO.File]::ReadAllBytes($video); if($b.Length -gt $cap){throw 'LOCAL_MEDIA_TOO_LARGE'}",
    " Emit @{kind='video';mime='video/mp4';media_b64=[Convert]::ToBase64String($b)}; return}",
    "throw 'LOCAL_MEDIA_KIND_UNSUPPORTED'",
  ].join('\n');
  return { command, timeout_ms: TIMEOUT_MS };
}

export function parseLocalMediaStdout(stdout) {
  let out;
  try { out = JSON.parse(String(stdout || '').trim()); } catch { return { ok: false, code: 'LOCAL_MEDIA_RESULT_INVALID' }; }
  if (out?.code) return { ok: false, code: String(out.code).slice(0, 80), kind: out.kind || null };
  if (out?.text_b64) {
    const text = fromBase64Utf8(out.text_b64).trim();
    return text ? { ok: true, kind: out.kind || null, text } : { ok: false, code: 'LOCAL_MEDIA_EMPTY' };
  }
  if (!out?.media_b64) return { ok: false, code: 'LOCAL_MEDIA_EMPTY' };
  const bytes = bytesFromBase64(out.media_b64);
  if (!bytes.byteLength) return { ok: false, code: 'LOCAL_MEDIA_EMPTY' };
  return { ok: true, kind: out.kind || null, mime: String(out.mime || 'application/octet-stream'), bytes, sha256: out.sha256 || null };
}

export async function runLocalPcMedia({ env, kind, text, prompt, sha256, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  const ready = await localPcModelReady(env, now()).catch(() => ({ ok: false, code: 'LOCAL_CHECK_FAILED' }));
  if (!ready?.ok) return { ok: false, code: ready?.code || 'COMPANION_OFFLINE_OR_NOT_AUTHORIZED' };
  let step;
  try { step = localPcMediaCommand({ kind, text, prompt, sha256 }); }
  catch (error) { return { ok: false, code: error.message }; }
  const db = env.DB;
  const id = crypto.randomUUID();
  const plan = { schema: 'mel.devices.pc-control.v1', owner_authorized: true, steps: [{ id: 'pc-control-1', action: 'system.exec', payload: step }] };
  await db.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
    .bind(id, ready.device_id, 'local-media-' + id, JSON.stringify(plan), 'PENDING', now()).run();
  const deadline = now() + TIMEOUT_MS;
  while (now() < deadline) {
    await sleep(POLL_MS);
    const row = await db.prepare('SELECT status,result_json,error_code FROM computer_commands WHERE id=?').bind(id).first();
    if (!row || row.status === 'PENDING' || row.status === 'RUNNING') continue;
    if (row.status !== 'SUCCEEDED') return { ok: false, code: row.error_code || 'LOCAL_MEDIA_FAILED' };
    let stdout = '';
    try { stdout = JSON.parse(row.result_json || '{}')?.outputs?.[0]?.stdout || ''; } catch { stdout = ''; }
    return parseLocalMediaStdout(stdout);
  }
  await db.prepare("UPDATE computer_commands SET status='FAILED',error_code=? WHERE id=? AND status IN ('PENDING','RUNNING')").bind('LOCAL_MEDIA_TIMEOUT', id).run().catch(() => {});
  return { ok: false, code: 'LOCAL_MEDIA_TIMEOUT' };
}

async function stored(env, local, meta) {
  if (!local?.ok) return local;
  if (!local.bytes) return { ok: true, provider: 'local-pc', local: true, zero_added_cost: true, ...local };
  if (!mediaStorageReady(env)) return { ok: false, code: 'MEDIA_VAULT_UNAVAILABLE', provider: 'local-pc', generated: true };
  const artifact = await storePrivateArtifact(env, local.bytes, meta);
  return { ok: true, provider: 'local-pc', local: true, zero_added_cost: true, artifact, mime: local.mime, sha256: local.sha256 || await sha256Hex(local.bytes) };
}

async function artifactSha(env, input) {
  if (!input?.artifact_key) return '';
  const artifact = await readPrivateArtifactBytes(env, input.artifact_key);
  return sha256Hex(artifact.bytes);
}

export function createLocalPcMediaCapabilities(env = {}) {
  return {
    'media.image.generate': async input => stored(env, await runLocalPcMedia({ env, kind: 'image', prompt: input?.prompt }), { capability: 'media.image.generate', model: 'pc:a1111', mime: 'image/png', extension: 'png' }),
    'media.image.analyze': async input => {
      const local = await runLocalPcMedia({ env, kind: 'analyze', prompt: input?.prompt, sha256: await artifactSha(env, input) });
      return local?.ok ? { ok: true, provider: 'local-pc', local: true, zero_added_cost: true, analysis: local.text } : local;
    },
    'media.image.process': async input => stored(env, await runLocalPcMedia({ env, kind: 'process', prompt: input?.instruction || input?.prompt, sha256: await artifactSha(env, input) }), { capability: 'media.image.process', model: 'pc:a1111', mime: 'image/png', extension: 'png' }),
    'media.audio.synthesize': async input => stored(env, await runLocalPcMedia({ env, kind: 'speech', text: input?.text }), { capability: 'media.audio.synthesize', model: 'pc:sapi', mime: 'audio/wav', extension: 'wav' }),
    'media.audio.transcribe': async input => {
      const local = await runLocalPcMedia({ env, kind: 'transcribe', sha256: await artifactSha(env, input) });
      return local?.ok ? { ok: true, provider: 'local-pc', local: true, zero_added_cost: true, text: local.text } : local;
    },
    'media.video.generate': async input => stored(env, await runLocalPcMedia({ env, kind: 'video', prompt: input?.prompt, sha256: await artifactSha(env, input) }), { capability: 'media.video.generate', model: 'pc:ffmpeg', mime: 'video/mp4', extension: 'mp4' }),
  };
}
