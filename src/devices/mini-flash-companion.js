// MINI firmware update over USB, run by the Windows Companion on the owner's click.
//
// What it does on the PC (one fixed PowerShell command built here, never from
// browser input):
//   1. finds exactly one Espressif native-USB port (VID 303A, PID 1001);
//   2. uses esptool through the PC's Python (pip, official Espressif package,
//      pinned version) — a downloaded .exe was blocked by antivirus;
//   3. downloads the published MEL application image through a single-use
//      10-minute ticket, checks SHA-256, ESP image magic and that it fits ota_0;
//   4. writes it to ota_0 (0x20000) and blanks otadata (0xF000) so the board
//      boots it, then hard-resets. Bootloader, partition table and NVS (Wi-Fi,
//      pairing) are untouched. esptool verifies the written data itself.
// The board stays recoverable over USB download mode whatever happens.

export const MINI_FLASH_CONFIRMATION = 'FLASH_MINI_APPROVED';
export const ESPTOOL_TAG = 'v5.4.0';
const MANIFEST_KEY = 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/manifest.json';
const OTA0_OFFSET = '0x20000';
const OTA0_SIZE = 0x600000;
const TICKET_TTL_MS = 10 * 60 * 1000;

export async function readPublishedMiniFirmware(env) {
  if (!env?.MEDIA_BUCKET) throw Object.assign(new Error('MEDIA_BUCKET_UNAVAILABLE'), { status: 503 });
  const object = await env.MEDIA_BUCKET.get(MANIFEST_KEY);
  if (!object) throw Object.assign(new Error('MINI_FIRMWARE_NOT_PUBLISHED'), { status: 404 });
  let manifest;
  try { manifest = JSON.parse(await object.text()); } catch { throw Object.assign(new Error('MINI_MANIFEST_INVALID'), { status: 502 }); }
  const firmware = manifest?.firmware || {};
  const key = String(firmware.key || '');
  const sha256 = String(firmware.sha256 || '').toLowerCase();
  if (firmware.available !== true || !key.startsWith('devices/waveshare-esp32-s3-touch-lcd-3.5-c/') || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw Object.assign(new Error('MINI_FIRMWARE_NOT_PUBLISHED'), { status: 404 });
  }
  return { key, sha256, version: String(firmware.version || ''), size: Number(firmware.size) || null };
}

// Single-use, 10-minute download tickets for files the Companion must fetch
// without owner credentials (MINI firmware, Android APK). Only published device
// files under these prefixes can ever be served.
// 'mel-work:<artifactId>' = a MEL WORK draft stored in D1, fetched by the Companion to submit it.
const TICKET_KEY_PREFIXES = ['devices/waveshare-esp32-s3-touch-lcd-3.5-c/', 'devices/android/', 'mel-work:'];

async function ticketsTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS device_file_tickets (ticket TEXT PRIMARY KEY, file_key TEXT NOT NULL, sha256 TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)').run();
}

export async function createDeviceFileTicket(env, file, now = Date.now()) {
  if (!TICKET_KEY_PREFIXES.some(prefix => String(file?.key || '').startsWith(prefix))) throw new Error('DEVICE_FILE_KEY_NOT_ALLOWED');
  await ticketsTable(env.DB);
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const ticket = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO device_file_tickets (ticket,file_key,sha256,expires_at) VALUES (?,?,?,?)').bind(ticket, file.key, file.sha256, now + TICKET_TTL_MS).run();
  return ticket;
}
export const createMiniFlashTicket = createDeviceFileTicket;

// GET /api/computer/v1/device-file?ticket=…  (single use, 10 minutes)
export async function serveDeviceFileByTicket(request, env, now = Date.now()) {
  const ticket = String(new URL(request.url).searchParams.get('ticket') || '');
  if (!/^[a-f0-9]{48}$/.test(ticket)) return Response.json({ ok: false, code: 'DEVICE_FILE_TICKET_INVALID' }, { status: 400 });
  await ticketsTable(env.DB);
  const claimed = await env.DB.prepare('UPDATE device_file_tickets SET used_at=? WHERE ticket=? AND used_at IS NULL AND expires_at>?').bind(now, ticket, now).run();
  if (claimed?.meta?.changes !== 1) return Response.json({ ok: false, code: 'DEVICE_FILE_TICKET_EXPIRED_OR_USED' }, { status: 403 });
  const row = await env.DB.prepare('SELECT file_key, sha256 FROM device_file_tickets WHERE ticket=?').bind(ticket).first();
  if (!TICKET_KEY_PREFIXES.some(prefix => row.file_key.startsWith(prefix))) return Response.json({ ok: false, code: 'DEVICE_FILE_KEY_NOT_ALLOWED' }, { status: 403 });
  if (row.file_key.startsWith('mel-work:')) {
    const artifact = await env.DB.prepare('SELECT content FROM mel_work_artifacts WHERE id=?').bind(row.file_key.slice(9)).first();
    if (!artifact) return Response.json({ ok: false, code: 'DEVICE_FILE_NOT_FOUND' }, { status: 404 });
    return new Response(artifact.content, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store', 'x-mel-sha256': row.sha256 } });
  }
  const object = await env.MEDIA_BUCKET?.get(row.file_key);
  if (!object) return Response.json({ ok: false, code: 'DEVICE_FILE_NOT_FOUND' }, { status: 404 });
  return new Response(object.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(object.size), 'cache-control': 'no-store', 'x-mel-sha256': row.sha256 } });
}
export const serveMiniFirmwareByTicket = serveDeviceFileByTicket;

const FLASH = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$sha='__SHA__';$url='__URL__';$tag='__TAG__'
# esptool through the PC's Python and pip (official Espressif distribution); a
# downloaded-and-launched .exe gets blocked by antivirus heuristics.
$py=@(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Python') -Filter python.exe -Recurse -File -ErrorAction SilentlyContinue|Where-Object{$_.FullName -notmatch 'WindowsApps'}|Sort-Object FullName -Descending|Select-Object -First 1).FullName
if(-not $py){$py=@(Get-Command python.exe -All -ErrorAction SilentlyContinue|Where-Object{$_.Source -notmatch 'WindowsApps'}|Select-Object -First 1).Source}
if(-not $py){throw 'PYTHON_NOT_FOUND'}
function Py([string[]]$a){$p=$ErrorActionPreference;$ErrorActionPreference='Continue';try{$o=@(& $py @a 2>&1|ForEach-Object{[string]$_})}finally{$ErrorActionPreference=$p};return @{code=$LASTEXITCODE;out=($o -join [string][char]10)}}
if((Py @('-m','esptool','version')).code -ne 0){
 $i=Py @('-m','pip','install','--user','--disable-pip-version-check','--quiet','esptool=='+$tag.TrimStart('v'))
 if($i.code -ne 0){throw 'ESPTOOL_PIP_INSTALL_FAILED'}
}
$ports=@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | ForEach-Object { if(([string]$_.PNPDeviceID) -match '^USB\\VID_303A&PID_1001' -and ([string]$_.Name) -match '\((COM\d{1,3})\)'){ $Matches[1] } } | Sort-Object -Unique)
if($ports.Count -ne 1){throw ('MINI_USB_PORT_NOT_UNIQUE:'+$ports.Count)}
$port=$ports[0]
$work=Join-Path $env:LOCALAPPDATA 'MEL\mini-flash'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$bin=Join-Path $work ($sha+'.bin')
if(-not (Test-Path -LiteralPath $bin) -or (Get-FileHash -LiteralPath $bin -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha){
 $tmp=$bin+'.part'
 Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 90
 if((Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha){Remove-Item -LiteralPath $tmp -Force;throw 'MINI_FIRMWARE_SHA256_MISMATCH'}
 Move-Item -LiteralPath $tmp -Destination $bin -Force
}
$size=(Get-Item -LiteralPath $bin).Length
$head=[IO.File]::ReadAllBytes($bin)[0]
if($head -ne 0xE9 -or $size -lt 65536 -or $size -gt __MAX__){throw 'MINI_FIRMWARE_IMAGE_INVALID'}
$blank=Join-Path $work 'otadata-blank.bin'
[byte[]]$ff=@(255)*8192;[IO.File]::WriteAllBytes($blank,$ff)
$r=Py @('-m','esptool','--chip','esp32s3','--port',$port,'--baud','460800','--before','default-reset','--after','hard-reset','write-flash','__OTA0__',$bin,'0xF000',$blank)
$out=[string]$r.out
$verified=([regex]::Matches($out,'Hash of data verified')).Count
$tail=([string]$out); if($tail.Length -gt 1500){$tail=$tail.Substring($tail.Length-1500)}
[ordered]@{action='mini.flash';port=$port;esptool=$tag;sha256=$sha;size_bytes=$size;exit_code=$r.code;verified_regions=$verified;flash_performed=($r.code -eq 0);flash_verified=($r.code -eq 0 -and $verified -ge 2);nvs_preserved=$true;log_tail=$tail}|ConvertTo-Json -Compress
if($r.code -ne 0){exit 3}
`;

export function miniFlashCommand({ downloadUrl, sha256 }) {
  if (!/^https:\/\/[^\s'"`]+\/api\/computer\/v1\/device-file\?ticket=[a-f0-9]{48}$/.test(String(downloadUrl || ''))) throw new Error('MINI_FLASH_URL_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(sha256 || ''))) throw new Error('MINI_FLASH_SHA256_INVALID');
  const command = FLASH.replaceAll('__SHA__', sha256).replaceAll('__URL__', downloadUrl).replaceAll('__TAG__', ESPTOOL_TAG)
    .replaceAll('__MAX__', String(OTA0_SIZE)).replaceAll('__OTA0__', OTA0_OFFSET);
  if (command.length > 8192) throw new Error('MINI_FLASH_COMMAND_TOO_LONG');
  return { command, timeout_ms: 120000 };
}
