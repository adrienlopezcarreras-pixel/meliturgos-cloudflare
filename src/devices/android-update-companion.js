// MEL Android update over Wi-Fi debugging, run by the Windows Companion.
//
// One fixed PowerShell command built here (owner values are validated with
// strict patterns before being embedded):
//   1. gets Google's official platform-tools (adb) from dl.google.com, checks the
//      SHA-1 published in Google's SDK repository index, caches it;
//   2. optional one-time pairing (Wireless debugging > Pair with code), then
//      connects (explicit ip:port, or the phone's mDNS announcement);
//   3. downloads the published, signed MEL APK through a single-use ticket and
//      checks its SHA-256;
//   4. adb install -r, then reads the installed version back.
// Android itself refuses an APK signed with another key or an older version,
// so the installed app and its data cannot be replaced by something else.

export const ANDROID_UPDATE_CONFIRMATION = 'UPDATE_MEL_ANDROID_APPROVED';
const MANIFEST_KEY = 'devices/android/manifest.json';
const PRIVATE_HOST = /^(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}:\d{2,5}$/;

export function validateAndroidUpdateInput({ pair_host = '', pair_code = '', connect_host = '' } = {}) {
  const pair = String(pair_host || '').trim();
  const code = String(pair_code || '').trim();
  const connect = String(connect_host || '').trim();
  if (pair && !PRIVATE_HOST.test(pair)) throw new Error('ANDROID_PAIR_HOST_INVALID');
  if (pair && !/^\d{6}$/.test(code)) throw new Error('ANDROID_PAIR_CODE_INVALID');
  if (!pair && code) throw new Error('ANDROID_PAIR_HOST_REQUIRED');
  if (connect && !PRIVATE_HOST.test(connect)) throw new Error('ANDROID_CONNECT_HOST_INVALID');
  return { pair, code, connect };
}

export async function readPublishedAndroidApk(env) {
  if (!env?.MEDIA_BUCKET) throw Object.assign(new Error('MEDIA_BUCKET_UNAVAILABLE'), { status: 503 });
  const object = await env.MEDIA_BUCKET.get(MANIFEST_KEY);
  if (!object) throw Object.assign(new Error('ANDROID_APK_NOT_PUBLISHED'), { status: 404 });
  let manifest;
  try { manifest = JSON.parse(await object.text()); } catch { throw Object.assign(new Error('ANDROID_MANIFEST_INVALID'), { status: 502 }); }
  const key = String(manifest?.key || '');
  const sha256 = String(manifest?.sha256 || '').toLowerCase();
  if (manifest?.available !== true || !key.startsWith('devices/android/') || !key.endsWith('.apk') || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw Object.assign(new Error('ANDROID_APK_NOT_PUBLISHED'), { status: 404 });
  }
  return { key, sha256, versionName: String(manifest.version_name || ''), versionCode: Number(manifest.version_code) || null };
}

const UPDATE = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$sha='__SHA__';$url='__URL__';$pair='__PAIR__';$code='__CODE__';$target='__CONNECT__';$package='fr.veriteinterdite.mel'
$root=Join-Path $env:LOCALAPPDATA 'MEL\tools'
$adb=Join-Path $root 'platform-tools\adb.exe'
if(-not(Test-Path -LiteralPath $adb)){
 [xml]$repo=(Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-3.xml' -UseBasicParsing -TimeoutSec 30).Content
 $pkg=$repo.SelectNodes("//*[local-name()='remotePackage'][@path='platform-tools']")|Select-Object -First 1
 if(-not $pkg){throw 'ADB_PACKAGE_NOT_FOUND'}
 $arc=@($pkg.archives.archive|Where-Object{$_.'host-os' -eq 'windows'})|Select-Object -First 1
 if(-not $arc){throw 'ADB_WINDOWS_ARCHIVE_NOT_FOUND'}
 $c=$arc.complete.checksum;$sha1=[string]$(if($c -is [string]){$c}else{$c.'#text'})
 if($sha1 -notmatch '^[0-9a-fA-F]{40}$'){throw 'ADB_CHECKSUM_UNAVAILABLE'}
 New-Item -ItemType Directory -Force -Path $root|Out-Null
 $zip=Join-Path $root 'platform-tools.zip'
 Invoke-WebRequest -Uri ('https://dl.google.com/android/repository/'+[string]$arc.complete.url) -OutFile $zip -UseBasicParsing -TimeoutSec 90
 if((Get-FileHash -LiteralPath $zip -Algorithm SHA1).Hash -ne $sha1.ToUpperInvariant()){Remove-Item -LiteralPath $zip -Force;throw 'ADB_CHECKSUM_MISMATCH'}
 Expand-Archive -LiteralPath $zip -DestinationPath $root -Force;Remove-Item -LiteralPath $zip -Force
 if(-not(Test-Path -LiteralPath $adb)){throw 'ADB_EXE_NOT_IN_ARCHIVE'}
}
function Run([string[]]$a){$p=$ErrorActionPreference;$ErrorActionPreference='Continue';try{$o=@(& $adb @a 2>&1|ForEach-Object{[string]$_})}finally{$ErrorActionPreference=$p};return ($o -join [string][char]10)}
# The adb daemon must not inherit a captured pipe, or reading output never ends.
if(-not(Get-Process -Name adb -ErrorAction SilentlyContinue)){Start-Process -FilePath $adb -ArgumentList 'start-server' -WindowStyle Hidden;for($i=0;$i -lt 20 -and -not(Get-Process -Name adb -ErrorAction SilentlyContinue);$i++){Start-Sleep -Milliseconds 500};Start-Sleep -Seconds 2}
$log=@()
if($pair){$r=Run @('pair',$pair,$code);$log+='pair: '+$r;if($r -notmatch 'Successfully paired'){throw 'ADB_PAIRING_FAILED'}}
if(-not $target){
 $m=Run @('mdns','services')
 $hits=@([regex]::Matches($m,'_adb-tls-connect\._tcp\.?\s+(\d{1,3}(?:\.\d{1,3}){3}:\d{2,5})')|ForEach-Object{$_.Groups[1].Value}|Sort-Object -Unique)
 if($hits.Count -eq 1){$target=$hits[0]}
}
if($target){$r=Run @('connect',$target);$log+='connect: '+$r;if($r -notmatch 'connected to'){throw 'ADB_CONNECT_FAILED'}}
$list=Run @('devices')
$devs=@([regex]::Matches($list,'(?m)^(\S+)\s+device\s*$')|ForEach-Object{$_.Groups[1].Value})
if($target){$devs=@($devs|Where-Object{$_ -eq $target})}
if($devs.Count -ne 1){throw ('ANDROID_DEVICE_NOT_UNIQUE:'+$devs.Count)}
$serial=$devs[0]
function Ver{$d=Run @('-s',$serial,'shell','dumpsys','package',$package);$vc=0;$vn='';if($d -match 'versionCode=(\d+)'){$vc=[long]$Matches[1]};if($d -match 'versionName=(\S+)'){$vn=$Matches[1]};return [ordered]@{code=$vc;name=$vn}}
$before=Ver
$work=Join-Path $env:LOCALAPPDATA 'MEL\android-update'
New-Item -ItemType Directory -Force -Path $work|Out-Null
$apk=Join-Path $work ($sha+'.apk')
if(-not(Test-Path -LiteralPath $apk) -or (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha){
 $tmp=$apk+'.part'
 Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 90
 if((Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha){Remove-Item -LiteralPath $tmp -Force;throw 'ANDROID_APK_SHA256_MISMATCH'}
 Move-Item -LiteralPath $tmp -Destination $apk -Force
}
$size=(Get-Item -LiteralPath $apk).Length
$magic=[IO.File]::ReadAllBytes($apk)[0..1]
if($magic[0] -ne 0x50 -or $magic[1] -ne 0x4B -or $size -lt 1048576 -or $size -gt 209715200){throw 'ANDROID_APK_INVALID'}
$r=Run @('-s',$serial,'install','-r',$apk);$log+='install: '+$r
$after=Ver
$ok=($r -match '(?m)^Success\s*$') -and $after.code -ge $before.code -and $after.code -gt 0
$tail=($log -join [string][char]10);if($tail.Length -gt 1500){$tail=$tail.Substring($tail.Length-1500)}
[ordered]@{action='android.update';serial=$serial;package=$package;before=$before;after=$after;installed=$ok;apk_sha256=$sha;log_tail=$tail}|ConvertTo-Json -Compress -Depth 4
if(-not $ok){exit 3}
`;

export function androidUpdateCommand({ downloadUrl, sha256, pair = '', code = '', connect = '' }) {
  if (!/^https:\/\/[^\s'"`]+\/api\/computer\/v1\/device-file\?ticket=[a-f0-9]{48}$/.test(String(downloadUrl || ''))) throw new Error('ANDROID_UPDATE_URL_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(sha256 || ''))) throw new Error('ANDROID_UPDATE_SHA256_INVALID');
  const checked = validateAndroidUpdateInput({ pair_host: pair, pair_code: code, connect_host: connect });
  const command = UPDATE.replaceAll('__SHA__', sha256).replaceAll('__URL__', downloadUrl)
    .replaceAll('__PAIR__', checked.pair).replaceAll('__CODE__', checked.code).replaceAll('__CONNECT__', checked.connect);
  if (command.length > 8192) throw new Error('ANDROID_UPDATE_COMMAND_TOO_LONG');
  return { command, timeout_ms: 120000 };
}
