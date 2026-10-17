// MINI firmware update over USB, run by the Windows Companion on the owner's click.
//
// What it does on the PC (one fixed PowerShell command built here, never from
// browser input):
//   1. finds exactly one Espressif native-USB port (VID 303A, PID 1001);
//   2. gets the official esptool Windows build from Espressif's GitHub release,
//      checks the SHA-256 digest GitHub publishes for that asset, caches it;
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

async function ticketsTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS mini_flash_tickets (ticket TEXT PRIMARY KEY, firmware_key TEXT NOT NULL, sha256 TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)').run();
}

export async function createMiniFlashTicket(env, firmware, now = Date.now()) {
  await ticketsTable(env.DB);
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const ticket = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO mini_flash_tickets (ticket,firmware_key,sha256,expires_at) VALUES (?,?,?,?)').bind(ticket, firmware.key, firmware.sha256, now + TICKET_TTL_MS).run();
  return ticket;
}

// GET /api/computer/v1/mini-firmware?ticket=…  (single use, 10 minutes)
export async function serveMiniFirmwareByTicket(request, env, now = Date.now()) {
  const ticket = String(new URL(request.url).searchParams.get('ticket') || '');
  if (!/^[a-f0-9]{48}$/.test(ticket)) return Response.json({ ok: false, code: 'MINI_TICKET_INVALID' }, { status: 400 });
  await ticketsTable(env.DB);
  const claimed = await env.DB.prepare('UPDATE mini_flash_tickets SET used_at=? WHERE ticket=? AND used_at IS NULL AND expires_at>?').bind(now, ticket, now).run();
  if (claimed?.meta?.changes !== 1) return Response.json({ ok: false, code: 'MINI_TICKET_EXPIRED_OR_USED' }, { status: 403 });
  const row = await env.DB.prepare('SELECT firmware_key, sha256 FROM mini_flash_tickets WHERE ticket=?').bind(ticket).first();
  const object = await env.MEDIA_BUCKET?.get(row.firmware_key);
  if (!object) return Response.json({ ok: false, code: 'MINI_FIRMWARE_NOT_FOUND' }, { status: 404 });
  return new Response(object.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(object.size), 'cache-control': 'no-store', 'x-mel-sha256': row.sha256 } });
}

const FLASH = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$sha='__SHA__';$url='__URL__';$tag='__TAG__'
$root=Join-Path $env:LOCALAPPDATA ('MEL\tools\esptool-'+$tag)
$exe=Get-ChildItem -LiteralPath $root -Filter esptool.exe -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
if(-not $exe){
 $rel=Invoke-RestMethod -Uri ('https://api.github.com/repos/espressif/esptool/releases/tags/'+$tag) -Headers @{'User-Agent'='MEL-Companion';'Accept'='application/vnd.github+json'} -TimeoutSec 20
 $asset=@($rel.assets | Where-Object { $_.name -match '\.zip$' -and $_.name -match 'win' -and $_.name -match '64' }) | Select-Object -First 1
 if(-not $asset){throw 'ESPTOOL_WINDOWS_ASSET_NOT_FOUND'}
 $digest=([string]$asset.digest).ToLowerInvariant()
 if($digest -notmatch '^sha256:[0-9a-f]{64}$'){throw 'ESPTOOL_DIGEST_UNAVAILABLE'}
 New-Item -ItemType Directory -Force -Path $root | Out-Null
 $zip=Join-Path $root 'esptool.zip'
 Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing -TimeoutSec 90
 if(('sha256:'+(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()) -ne $digest){Remove-Item -LiteralPath $zip -Force;throw 'ESPTOOL_DIGEST_MISMATCH'}
 Expand-Archive -LiteralPath $zip -DestinationPath $root -Force
 Remove-Item -LiteralPath $zip -Force
 $exe=Get-ChildItem -LiteralPath $root -Filter esptool.exe -Recurse -File | Select-Object -First 1
 if(-not $exe){throw 'ESPTOOL_EXE_NOT_IN_ARCHIVE'}
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
$log=Join-Path $work 'flash.log';$err=Join-Path $work 'flash.err'
$arguments='--chip esp32s3 --port '+$port+' --baud 460800 --before default-reset --after hard-reset write-flash __OTA0__ "'+$bin+'" 0xF000 "'+$blank+'"'
$p=Start-Process -FilePath $exe.FullName -ArgumentList $arguments -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
if(-not $p.WaitForExit(75000)){try{$p.Kill()}catch{};throw 'MINI_FLASH_TIMEOUT'}
$out=(Get-Content -Raw -LiteralPath $log -ErrorAction SilentlyContinue)+(Get-Content -Raw -LiteralPath $err -ErrorAction SilentlyContinue)
$verified=([regex]::Matches([string]$out,'Hash of data verified')).Count
$tail=([string]$out); if($tail.Length -gt 1500){$tail=$tail.Substring($tail.Length-1500)}
[ordered]@{action='mini.flash';port=$port;esptool=$tag;sha256=$sha;size_bytes=$size;exit_code=$p.ExitCode;verified_regions=$verified;flash_performed=($p.ExitCode -eq 0);flash_verified=($p.ExitCode -eq 0 -and $verified -ge 2);nvs_preserved=$true;log_tail=$tail}|ConvertTo-Json -Compress
if($p.ExitCode -ne 0){exit 3}
`;

export function miniFlashCommand({ downloadUrl, sha256 }) {
  if (!/^https:\/\/[^\s'"`]+\/api\/computer\/v1\/mini-firmware\?ticket=[a-f0-9]{48}$/.test(String(downloadUrl || ''))) throw new Error('MINI_FLASH_URL_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(sha256 || ''))) throw new Error('MINI_FLASH_SHA256_INVALID');
  const command = FLASH.replaceAll('__SHA__', sha256).replaceAll('__URL__', downloadUrl).replaceAll('__TAG__', ESPTOOL_TAG)
    .replaceAll('__MAX__', String(OTA0_SIZE)).replaceAll('__OTA0__', OTA0_OFFSET);
  if (command.length > 8192) throw new Error('MINI_FLASH_COMMAND_TOO_LONG');
  return { command, timeout_ms: 120000 };
}
