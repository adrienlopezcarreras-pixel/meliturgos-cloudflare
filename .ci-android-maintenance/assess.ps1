$ErrorActionPreference='Stop'
$package='fr.veriteinterdite.mel'
$sdk=$env:ANDROID_SDK_ROOT
if(-not $sdk){$sdk=$env:ANDROID_HOME}
if(-not $sdk -or -not(Test-Path -LiteralPath $sdk -PathType Container)){throw 'ANDROID_SDK_NOT_INSTALLED'}
$adb=Join-Path $sdk 'platform-tools\adb.exe'
if(-not(Test-Path -LiteralPath $adb -PathType Leaf)){throw 'ANDROID_ADB_NOT_INSTALLED'}
$lines=@(& $adb devices -l 2>&1)
if($LASTEXITCODE -ne 0){throw 'ANDROID_ADB_DISCOVERY_FAILED'}
$devices=@()
foreach($line in $lines){
 if(([string]$line) -match '^([^\s]+)\s+(device|offline|unauthorized)\b'){
  $id=$Matches[1];$state=$Matches[2]
  $devices+=@{serial=$id;state=$state;transport=$(if($id -match '^[0-9.]+:[0-9]+$'){'wifi-adb'}else{'other'});authorized=($state -eq 'device')}
 }
}
[ordered]@{schema='mel.android.maintenance.assess/v1';action='android.maintenance.assess';package=$package;devices=$devices;wifi_adb_paired_count=@($devices|Where-Object {$_.transport -eq 'wifi-adb' -and $_.authorized}).Count;wifi_pairing_requires_phone_approval=$true;bluetooth_apk_install_supported=$false;apk_install_performed=$false;app_data_backup_performed=$false}|ConvertTo-Json -Depth 4 -Compress