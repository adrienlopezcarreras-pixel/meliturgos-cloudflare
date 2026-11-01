// MINI with a broken screen: Bluetooth pairing with the phone through the PC.
// Firmware ≥ 0.6.17 announces each pairing passkey on USB; the Companion types
// it into the phone over adb. No Wi-Fi is involved: MINI talks to MEL through
// the phone over Bluetooth.

export const MINI_BLE_PASSKEY_FIRMWARE = '0.6.17-usb-ble-passkey';

// Bluetooth pairing MINI ↔ phone without the MINI's screen (firmware ≥ 0.6.17):
// the MINI announces each pairing passkey on USB ("MELBLE PASSKEY nnnnnn");
// the Companion turns the phone's Bluetooth on, waits for the passkey and types
// it into Android's pairing dialog through adb (already paired with this PC).
const BLE_PAIR = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$adb=@((Join-Path $env:LOCALAPPDATA 'Android\platform-tools\adb.exe'),(Join-Path $env:LOCALAPPDATA 'MEL\tools\platform-tools\adb.exe'),@(Get-Command adb.exe -All -ErrorAction SilentlyContinue|ForEach-Object{$_.Source}))|Where-Object{$_ -and (Test-Path -LiteralPath $_)}|Select-Object -First 1
if(-not $adb){throw 'ADB_NOT_INSTALLED_USE_CONFIGURER_ADB_WIFI'}
function A([string[]]$a){$p=$ErrorActionPreference;$ErrorActionPreference='Continue';try{$o=@(& $adb @a 2>&1|ForEach-Object{[string]$_})}finally{$ErrorActionPreference=$p};return ($o -join [string][char]10)}
$devs=@([regex]::Matches((A @('devices')),'(?m)^(\S+)\s+device\s*$')|ForEach-Object{$_.Groups[1].Value})
if($devs.Count -lt 1){throw 'ANDROID_DEVICE_NOT_FOUND'}
# The same phone can appear twice (IP:port and mDNS name): one is enough.
$devs=@($devs|Sort-Object {$_ -notmatch '^\d'})
$s=$devs[0]
$ports=@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue|ForEach-Object{if(([string]$_.PNPDeviceID) -match '^USB\\VID_303A&PID_1001' -and ([string]$_.Name) -match '\((COM\d{1,3})\)'){$Matches[1]}}|Sort-Object -Unique)
if($ports.Count -ne 1){throw ('MINI_USB_PORT_NOT_UNIQUE:'+$ports.Count)}
$sp=New-Object IO.Ports.SerialPort $ports[0],115200
$sp.DtrEnable=$false;$sp.RtsEnable=$false;$sp.ReadTimeout=300
$sp.Open()
$typed=@();$log=@()
try{
 [void](A @('-s',$s,'shell','cmd','bluetooth_manager','enable'))
 $buf='';$deadline=(Get-Date).AddSeconds(100)
 while((Get-Date) -lt $deadline){
  try{$buf+=$sp.ReadExisting()}catch{}
  $m=[regex]::Match($buf,'MELBLE PASSKEY (\d{6})')
  if($m.Success){
   $pk=$m.Groups[1].Value;$buf=$buf.Substring($m.Index+$m.Length)
   if($typed -notcontains $pk){
    Start-Sleep -Seconds 2
    [void](A @('-s',$s,'shell','input','text',$pk))
    Start-Sleep -Milliseconds 700
    [void](A @('-s',$s,'shell','uiautomator','dump','/sdcard/mel-ui.xml'))
    $ui=A @('-s',$s,'shell','cat','/sdcard/mel-ui.xml')
    $b=[regex]::Match($ui,'text="(?:Associer|ASSOCIER|Appairer|Pair|PAIR|OK)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
    if($b.Success){$x=[int](([int]$b.Groups[1].Value+[int]$b.Groups[3].Value)/2);$y=[int](([int]$b.Groups[2].Value+[int]$b.Groups[4].Value)/2);[void](A @('-s',$s,'shell','input','tap',"$x","$y"));$log+='tap '+$x+','+$y}else{[void](A @('-s',$s,'shell','input','keyevent','66'));$log+='enter'}
    $typed+=$pk
    $deadline=(Get-Date).AddSeconds(25)
   }
  }
  Start-Sleep -Milliseconds 300
 }
}finally{try{$sp.Close()}catch{}}
$bonded=A @('-s',$s,'shell','dumpsys','bluetooth_manager')
$mel=@([regex]::Matches($bonded,'(?im)^\s*(?:name|Name)?[:\s]*(MEL[^\r\n]{0,40})')|ForEach-Object{$_.Groups[1].Value.Trim()}|Select-Object -Unique -First 5)
[ordered]@{action='mini.ble.pair';phone=$s;port=$ports[0];passkeys_typed=$typed.Count;steps=$log;mel_devices_seen=$mel}|ConvertTo-Json -Compress
if($typed.Count -eq 0){exit 3}
`;

export function miniBlePairCommand() {
  return { command: BLE_PAIR, timeout_ms: 120000 };
}

// MEL-FOUNDER-06: software bench for the Companion/Android/MINI protocol.
// It runs pairing, shutdown, permissions and disconnection against an
// EXPLICIT double, so CI proves the protocol without any hardware. What it
// proves is the protocol, never the device: the physical recipe below stays
// separate and unvalidated until a real device runs it.
export const MINI_PROTOCOL_STEPS = Object.freeze(['pair', 'permissions', 'shutdown', 'disconnect']);

export const MINI_PHYSICAL_RECIPE = Object.freeze({
  schema: 'mel.mini-physical-recipe/v1',
  validated: false,
  reason: 'PHYSICAL_DEVICE_PROOF_REQUIRED',
  steps: Object.freeze(['brancher le MINI en USB', 'lancer l’appairage BLE depuis le téléphone',
    'accorder les autorisations Android', 'couper l’alimentation', 'vérifier la déconnexion propre']),
});

// The double must say what it is. A silent fake that looks like a device is
// how a bench ends up claiming a hardware proof it never had.
export function createMiniProtocolDouble({ fails = [] } = {}) {
  const failing = new Set(fails);
  const calls = [];
  return {
    kind: 'EXPLICIT_DOUBLE',
    hardware: false,
    calls,
    async run(step) {
      calls.push(step);
      if (failing.has(step)) return { ok: false, code: 'MINI_' + step.toUpperCase() + '_FAILED' };
      return { ok: true, step };
    },
  };
}

export async function runMiniProtocolBench(double) {
  if (!double || double.kind !== 'EXPLICIT_DOUBLE' || double.hardware !== false) {
    throw Object.assign(new Error('MINI_BENCH_EXPLICIT_DOUBLE_REQUIRED'), { code: 'MINI_BENCH_EXPLICIT_DOUBLE_REQUIRED' });
  }
  const steps = [];
  for (const step of MINI_PROTOCOL_STEPS) {
    const result = await double.run(step).catch(error => ({ ok: false, code: String(error?.code || 'MINI_STEP_THREW') }));
    steps.push({ step, ok: result?.ok === true, code: result?.ok === true ? null : String(result?.code || 'MINI_STEP_FAILED') });
  }
  return {
    schema: 'mel.mini-protocol-bench/v1',
    steps,
    passed: steps.every(row => row.ok),
    // Never conflated with a device acceptance.
    proves: 'PROTOCOL_ONLY',
    hardware_validated: false,
    physical_recipe: MINI_PHYSICAL_RECIPE,
  };
}
