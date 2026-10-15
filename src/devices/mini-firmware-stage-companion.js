// Local owner-only staging: no USB, serial, reset, partition writes or flashing.
const STAGE = String.raw`
$ErrorActionPreference='Stop'
$sha='__SHA__';$file='__FILENAME__'
$source=Join-Path (Join-Path $env:USERPROFILE 'Downloads') $file
if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw 'MINI_FIRMWARE_SOURCE_NOT_FOUND'}
$size=(Get-Item -LiteralPath $source -ErrorAction Stop).Length
if($size -lt 1048576 -or $size -gt 16777216){throw 'MINI_FIRMWARE_SIZE_INVALID'}
if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'MINI_FIRMWARE_SOURCE_SHA256_MISMATCH'}
[byte[]]$bytes=[IO.File]::ReadAllBytes($source)
if($bytes.Length -ne $size){throw 'MINI_FIRMWARE_READ_SIZE_CHANGED'}
$count=[int]$bytes[1]
$chip=[BitConverter]::ToUInt16($bytes,12)
if($bytes[0] -ne 0xE9 -or $count -lt 1 -or $count -gt 16){throw 'MINI_FIRMWARE_IMAGE_HEADER_INVALID'}
if($chip -ne 9 -or $bytes[23] -ne 1){throw 'MINI_FIRMWARE_CHIP_OR_EMBEDDED_HASH_MISSING'}
$offset=24;$checksum=0xEF
for($i=0;$i -lt $count;$i++){
 if(($offset+8) -gt $bytes.Length){throw 'MINI_FIRMWARE_SEGMENT_HEADER_TRUNCATED'}
 $length=[long][BitConverter]::ToUInt32($bytes,$offset+4)
 $offset+=8
 $end=$offset+$length
 if($length -eq 0 -or $end -gt $bytes.LongLength){throw 'MINI_FIRMWARE_SEGMENT_DATA_TRUNCATED'}
 for($j=$offset;$j -lt $end;$j++){$checksum=$checksum -bxor [int]$bytes[$j]}
 $offset=$end
}
$checksumAt=$offset+((15-($offset%16))%16)
if($checksumAt -ge $bytes.LongLength){throw 'MINI_FIRMWARE_CHECKSUM_MISSING'}
for($j=$offset;$j -lt $checksumAt;$j++){
 if($bytes[$j] -ne 0){throw 'MINI_FIRMWARE_PADDING_NONZERO'}
}
if($bytes[$checksumAt] -ne $checksum){throw 'MINI_FIRMWARE_SEGMENT_CHECKSUM_INVALID'}
$bodyEnd=$checksumAt+1
if($bytes.LongLength -ne ($bodyEnd+32)){throw 'MINI_FIRMWARE_EMBEDDED_SHA256_LENGTH_INVALID'}
$hash=[Security.Cryptography.SHA256]::Create()
try{$digest=$hash.ComputeHash($bytes,0,[int]$bodyEnd)}finally{$hash.Dispose()}
for($i=0;$i -lt 32;$i++){
 if($bytes[$bodyEnd+$i] -ne $digest[$i]){throw 'MINI_FIRMWARE_EMBEDDED_SHA256_INVALID'}
}
$folder=Join-Path $env:LOCALAPPDATA 'MEL\mini-firmware'
[IO.Directory]::CreateDirectory($folder)|Out-Null
$target=Join-Path $folder ($sha+'.bin')
if(Test-Path -LiteralPath $target){
 if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'MINI_PREVIOUS_STAGED_IMAGE_CHANGED'}
}else{
 $temp=Join-Path $folder ('stage-'+[Guid]::NewGuid().ToString('N')+'.tmp')
 Copy-Item -LiteralPath $source -Destination $temp -ErrorAction Stop
 try{
  if((Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash.ToLowerInvariant() -cne $sha){throw 'MINI_STAGED_FIRMWARE_SHA256_MISMATCH'}
  Move-Item -LiteralPath $temp -Destination $target -ErrorAction Stop
 }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
}
[ordered]@{schema='mel.mini.maintenance.stage/v1';action='mini.maintenance.stage';status='STAGED_IMAGE_INTEGRITY_VERIFIED_FLASH_BLOCKED';sha256=$sha;size_bytes=$size;path=$target;esp32s3_header_checked=$true;image_checksum_valid=$true;embedded_sha256_valid=$true;segment_count=$count;image_checksum_and_partition_fit_checked=$false;partition_fit_verified=$false;flash_allowed=$false;flash_performed=$false;board_reset=$false}|ConvertTo-Json -Compress
`;
export function miniFirmwareStageCommand({filename='',sha256=''}={}){
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.bin$/i.test(filename))throw new Error('MINI_FIRMWARE_FILENAME_INVALID');
 if(!/^[a-f0-9]{64}$/i.test(sha256))throw new Error('MINI_FIRMWARE_SHA256_INVALID');
 const command=STAGE.replaceAll('__SHA__',sha256.toLowerCase()).replaceAll('__FILENAME__',filename);
 if(command.length>8192)throw new Error('MINI_FIRMWARE_STAGE_COMMAND_TOO_LONG');
 return {command,timeout_ms:120000};
}
