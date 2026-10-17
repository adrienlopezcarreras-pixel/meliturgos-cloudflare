$ErrorActionPreference='Stop'
$sha='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';$file='MEL-Android-0.7.10.apk'
$source=Join-Path (Join-Path $env:USERPROFILE 'Downloads') $file
if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'ANDROID_SOURCE_APK_NOT_FOUND'}
$size=(Get-Item -LiteralPath $source).Length
if($size -lt 1048576 -or $size -gt 209715200){throw 'ANDROID_APK_SIZE_INVALID'}
if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'ANDROID_SOURCE_APK_DIGEST_MISMATCH'}
$root=Join-Path $env:LOCALAPPDATA 'MEL\android-releases'
[IO.Directory]::CreateDirectory($root)|Out-Null
$target=Join-Path $root ($sha+'.apk')
if(Test-Path -LiteralPath $target){
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'ANDROID_EXISTING_STAGE_HASH_MISMATCH'}
}else{
 $temp=Join-Path $root ('stage-'+[Guid]::NewGuid().ToString('N')+'.tmp')
 Copy-Item -LiteralPath $source -Destination $temp -ErrorAction Stop
 try{
  if((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'ANDROID_STAGED_APK_DIGEST_MISMATCH'}
  Move-Item -LiteralPath $temp -Destination $target -ErrorAction Stop
 }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
}
[ordered]@{schema='mel.android.maintenance.stage/v1';action='android.maintenance.stage';apk_sha256=$sha;size_bytes=$size;stage_path=$target;verified=$true;apk_installed=$false;bluetooth_installer=$false}|ConvertTo-Json -Compress