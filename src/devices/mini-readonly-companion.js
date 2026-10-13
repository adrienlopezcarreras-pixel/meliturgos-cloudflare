// Owner-authenticated, fixed PowerShell read-only diagnostic sent through existing Companion system.exec.
// Never accepts a caller-supplied command, tool path or ESP flash write.
const EXPECTED_ESPTOOL_SHA="069db0f1e4d8f929f36d0f60243499eb670626c03a686376728998aaaad2f664";
export function miniReadOnlyPcCommand(action,port,jobId=null){
 if(!["mini.readonly.discover","mini.readonly.security","mini.readonly.backup","mini.readonly.backup.status"].includes(action))throw new Error("MINI_READONLY_ACTION_NOT_IMPLEMENTED");
 if(!/^COM\d{1,3}$/.test(port))throw new Error("MINI_READONLY_PORT_INVALID");
 const mode=action.split(".")[2];
 const script=String.raw`
$ErrorActionPreference='Stop'
$port='__PORT__'
$mode='__MODE__'
if (@([IO.Ports.SerialPort]::GetPortNames()) -notcontains $port) { throw 'MINI_PORT_OFFLINE' }
$pnp=@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { ([string]$_.Name) -like ('*('+$port+')*') -and ([string]$_.PNPDeviceID) -match '^USB\\VID_303A&PID_1001' })
if ($pnp.Count -ne 1) { throw 'MINI_ESPRESSIF_USB_NOT_CONFIRMED' }
$found=$null
foreach($root in @((Join-Path $env:USERPROFILE 'Downloads'),(Join-Path $env:LOCALAPPDATA 'MEL'))) {
 if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
 $exeFiles=@(Get-ChildItem -LiteralPath $root -Filter 'esptool.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 25)
 foreach($exe in $exeFiles) {
  if ((Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq '__SHA__') { $found=$exe.FullName;break }
 }
 if($found){break}
}
if(-not $found){throw 'MINI_PINNED_ESPTOOL_NOT_FOUND'}
if($mode -eq 'discover') {
 [ordered]@{action='mini.readonly.discover';port=$port;esptool_verified=$true;board_reset=$false;flash_performed=$false}|ConvertTo-Json -Compress
 exit 0
}
$base=Join-Path (Join-Path $env:LOCALAPPDATA 'MEL\mini-readonly') ((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfff')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
[IO.Directory]::CreateDirectory($base)|Out-Null
$out=Join-Path $base 'security.stdout.txt';$err=Join-Path $base 'security.stderr.txt'
$arguments='--chip esp32s3 --port '+$port+' --before default_reset --after hard_reset get_security_info'
$process=Start-Process -FilePath $found -ArgumentList $arguments -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err -ErrorAction Stop
if(-not $process.WaitForExit(60000)){try{$process.Kill()}catch{};throw 'MINI_SECURITY_COMMAND_TIMEOUT'}
if($process.ExitCode -ne 0){throw 'MINI_SECURITY_COMMAND_FAILED'}
[ordered]@{action='mini.readonly.security';port=$port;evidence_path=$out;evidence_sha256=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant();flash_performed=$false;flash_allowed=$false;board_reset_possible=$true;security_policy_approved=$false}|ConvertTo-Json -Compress
`;
 const command=script.replaceAll("__PORT__",port).replaceAll("__MODE__",mode).replaceAll("__SHA__",EXPECTED_ESPTOOL_SHA);
 if(command.length>8192)throw new Error("MINI_READONLY_COMMAND_TOO_LONG");
 return {command,timeout_ms:90000};
}
