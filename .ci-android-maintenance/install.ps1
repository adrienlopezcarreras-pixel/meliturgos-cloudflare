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
$serial='192.168.1.55:39547';$sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
if($serial -notmatch '^([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{4,5}$'){throw 'ANDROID_WIFI_SERIAL_INVALID'}
$address=$null;$ip=$serial.Split(':')[0]
if(-not [Net.IPAddress]::TryParse($ip,[ref]$address)){throw 'ANDROID_WIFI_ADDRESS_INVALID'}
$b=$address.GetAddressBytes()
if($b.Length -ne 4 -or -not($b[0] -eq 10 -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168))){throw 'ANDROID_WIFI_PRIVATE_ADDRESS_REQUIRED'}
if(@($devices|Where-Object{$_.serial -ceq $serial -and $_.state -eq 'device'}).Count -ne 1){throw 'ANDROID_DEVICE_NOT_AUTHORIZED'}
$apk=Join-Path (Join-Path $env:LOCALAPPDATA 'MEL\android-releases') ($sha+'.apk')
if(-not(Test-Path -LiteralPath $apk -PathType Leaf)){throw 'ANDROID_STAGED_APK_MISSING'}
$size=(Get-Item -LiteralPath $apk).Length
if($size -lt 1048576 -or $size -gt 209715200){throw 'ANDROID_APK_SIZE_INVALID'}
if((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'ANDROID_APK_HASH_MISMATCH'}
$bt=Join-Path $sdk 'build-tools'
if(-not(Test-Path -LiteralPath $bt -PathType Container)){throw 'ANDROID_BUILD_TOOLS_MISSING'}
$tools=Get-ChildItem -LiteralPath $bt -Directory | Sort-Object Name -Descending
$signer=$null;$aapt=$null
foreach($d in $tools){$s=Join-Path $d.FullName 'apksigner.bat';$a=Join-Path $d.FullName 'aapt.exe';if((Test-Path $s) -and (Test-Path $a)){$signer=$s;$aapt=$a;break}}
if(-not $signer){throw 'ANDROID_SIGNATURE_TOOLS_REQUIRED'}
function apkSigner([string]$file){
 $result=@(& $signer verify --print-certs $file 2>&1)
 if($LASTEXITCODE -ne 0){throw 'ANDROID_APK_SIGNATURE_INVALID'}
 $certs=@($result|ForEach-Object{if(([string]$_) -match '^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$'){$Matches[1].ToLowerInvariant()}})
 if($certs.Count -ne 1){throw 'ANDROID_CERTIFICATE_AMBIGUOUS'}
 return [string]$certs[0]
}
function apkVersion([string]$file){
 $r=@(& $aapt dump badging $file 2>&1)
 if($LASTEXITCODE -ne 0){throw 'ANDROID_APK_BADGING_FAILED'}
 $line=@($r|Where-Object{([string]$_).StartsWith("package: name=")}|Select-Object -First 1)
 if($line.Count -ne 1 -or ([string]$line[0]) -notmatch "^package: name='fr\.veriteinterdite\.mel' versionCode='([0-9]+)'"){throw 'ANDROID_APK_PACKAGE_NOT_ALLOWED'}
 return [long]$Matches[1]
}
$nextVersion=apkVersion $apk;$nextCert=apkSigner $apk
$paths=@(& $adb -s $serial shell pm path $package 2>&1)
if($LASTEXITCODE -ne 0){throw 'ANDROID_INSTALLED_PACKAGE_QUERY_FAILED'}
$installed=@($paths|Where-Object{([string]$_) -match '^package:/data/app/.+/base\.apk$'})
if($installed.Count -ne 1){throw 'ANDROID_EXISTING_APP_REQUIRED'}
$backupRoot=Join-Path $env:LOCALAPPDATA 'MEL\android-backups'
[IO.Directory]::CreateDirectory($backupRoot)|Out-Null
$backup=Join-Path $backupRoot ([guid]::NewGuid().ToString('N')+'.apk')
$source=([string]$installed[0]).Substring(8)
$pull=@(& $adb -s $serial pull $source $backup 2>&1)
if($LASTEXITCODE -ne 0 -or -not(Test-Path $backup -PathType Leaf)){throw 'ANDROID_BACKUP_INSTALLED_APK_FAILED'}
$oldCert=apkSigner $backup
if($oldCert -cne $nextCert){throw 'ANDROID_SIGNING_CERTIFICATE_CHANGED'}
$oldVersion=apkVersion $backup
if($nextVersion -le $oldVersion){throw 'ANDROID_VERSION_NOT_NEWER'}
$backupHash=(Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLowerInvariant()
$done=@(& $adb -s $serial install -r $apk 2>&1)
if($LASTEXITCODE -ne 0 -or @($done|Where-Object{([string]$_).Trim() -eq 'Success'}).Count -ne 1){throw 'ANDROID_ADB_INSTALL_FAILED_BACKUP_PRESERVED'}
$pkg=@(& $adb -s $serial shell dumpsys package $package 2>&1)
if($LASTEXITCODE -ne 0){throw 'ANDROID_INSTALL_POSTCHECK_FAILED'}
$versionLine=@($pkg|Where-Object{([string]$_) -match '^\s*versionCode=([0-9]+)\b'}|Select-Object -First 1)
if($versionLine.Count -ne 1 -or ([string]$versionLine[0]) -notmatch 'versionCode=([0-9]+)' -or [long]$Matches[1] -ne $nextVersion){throw 'ANDROID_INSTALL_VERSION_NOT_VERIFIED'}
[ordered]@{schema='mel.android.maintenance.install/v1';action='android.maintenance.install';status='INSTALLED_VERSION_VERIFIED';transport='wifi-adb';package=$package;version_code=$nextVersion;apk_sha256=$sha;backup_apk_sha256=$backupHash;backup_path=$backup;app_data_backup_performed=$false;automatic_rollback_verified=$false;bluetooth_installer=$false}|ConvertTo-Json -Compress