// Fixed, bounded, read-only diagnostics for owner's MINI USB and paired Android ADB Wi-Fi.
// Does not open COM3, reset the board, pair Bluetooth, flash, install APK or change settings.
export function companionBleDiagnosticsCommand(port="COM3"){
 if(!/^COM\d{1,3}$/.test(port))throw new Error("MINI_PORT_INVALID");
 const command=String.raw`$ErrorActionPreference='Stop'
$port='__PORT__'
$stamp=[DateTime]::UtcNow.ToString('o')
$ports=@([IO.Ports.SerialPort]::GetPortNames())
$pnp=@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { ([string]$_.Name) -like ('*('+$port+')*') } | Select-Object -First 4 Name,PNPDeviceID,Status)
$adb=(Get-Command adb.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if(-not $adb){
 foreach($candidate in @((Join-Path $env:LOCALAPPDATA 'Android\platform-tools\adb.exe'),(Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'))){if(Test-Path -LiteralPath $candidate -PathType Leaf){$adb=$candidate;break}}
}
$status='ADB_UNAVAILABLE';$models=@();$events=@()
if($adb){
 $devices=@(& $adb devices -l 2>&1 | ForEach-Object { [string]$_ })
 if($LASTEXITCODE -ne 0){$status='ADB_DEVICES_FAILED'}
 else {
  $serials=@($devices | ForEach-Object { if($_ -match '^([^\s]+)\s+device(?:\s|$)' -and $Matches[1] -match '(:\d{2,5}$|_adb-tls-connect)'){ $Matches[1] } })
  if($serials.Count -eq 1){
   $id=$serials[0];$status='ADB_CONNECTED'
   $model=@(& $adb -s $id shell getprop ro.product.model 2>&1 | ForEach-Object { [string]$_ })
   if($LASTEXITCODE -ne 0){$status='ADB_MODEL_READ_FAILED'}else{$models=@($model | Select-Object -First 2)}
   $raw=@(& $adb -s $id logcat -d -t 1500 -v time 2>&1 | ForEach-Object { [string]$_ })
   if($LASTEXITCODE -ne 0){$status='ADB_LOGCAT_FAILED'}
   else {$events=@($raw | Where-Object { $_ -match 'BluetoothGatt|BondState|BtGatt|MelLinkV2|SESSION_OK|btm_sec|SMP|pairing' } | Select-Object -Last 45)}
  }elseif($serials.Count -gt 1){$status='MULTIPLE_ADB_DEVICES_REFUSED'}else{$status='NO_PAIRED_ADB_WIFI_DEVICE'}
 }
}
[ordered]@{schema='mel.companion.ble.diagnostics.v1';action='mini.android.ble.diagnose';observed_at_utc=$stamp;port=$port;com_present=($ports -contains $port);pnp=$pnp;adb_status=$status;android_models=$models;log_events=$events;read_only=$true;serial_opened=$false;flash_performed=$false;apk_install_performed=$false}|ConvertTo-Json -Depth 6 -Compress`.replaceAll("__PORT__",port);
 if(command.length>6500)throw new Error("BLE_DIAGNOSTICS_COMMAND_TOO_LONG");
 return {command,timeout_ms:25000,require_success_exit:true};
}
