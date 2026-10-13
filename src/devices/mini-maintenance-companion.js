// Safe, fixed, remotely schedulable MINI maintenance assessment via Windows Companion.
// This assesses backup integrity and USB readiness; it never opens a serial port,
// requests a bootloader reset, mutates backup state, or allows firmware writes.
export function miniMaintenanceAssessCommand(){
  const command=String.raw`$ErrorActionPreference='Stop'
$schema='mel.mini.maintenance.assess/v1'
$root=Join-Path $env:LOCALAPPDATA 'MEL'
$backupRoot=Join-Path $root 'mini-backups'
$ports=@([IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -match '^COM[0-9]{1,3}$' } | Sort-Object)
$espDevices=@(Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object { ([string]$_.PNPDeviceID) -match '^USB\\VID_303A&PID_1001' })
$espPortNames=@($espDevices | ForEach-Object { if(([string]$_.Name) -match '\\((COM[0-9]{1,3})\\)'){ $Matches[1] } } | Sort-Object -Unique)
$jobs=@()
$runningCount=0
$staleCount=0
$verifiedCount=0
$unverifiedCount=0
$hashesChecked=0
if(Test-Path -LiteralPath $backupRoot -PathType Container){
 $directories=@(Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction Stop |
  Where-Object { $_.Name -match '^[a-fA-F0-9]{32}$' } |
  Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 30)
 $candidates=@(Get-CimInstance Win32_Process -ErrorAction Stop |
  Where-Object { $_.Name -match '^(python|pythonw|esptool|powershell|pwsh)(\\.exe)?$' -and ([string]$_.CommandLine) -match 'ota_backup_worker\\.py|mini-backups' })
 $inventoryLimited=$candidates.Count -gt 30
 foreach($dir in $directories){
  $statusFile=Join-Path $dir.FullName 'status.json'
  if(-not(Test-Path -LiteralPath $statusFile -PathType Leaf)){continue}
  $row=[ordered]@{job_id=$dir.Name;state='UNKNOWN';assessment='UNVERIFIED';verified_backup=$false;age_seconds=0;backup_bytes=0}
  try {
   $status=Get-Content -LiteralPath $statusFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
   $state=[string]$status.state
   $row.state=$state
   $age=[int][Math]::Max(0,([DateTime]::UtcNow-(Get-Item -LiteralPath $statusFile).LastWriteTimeUtc).TotalSeconds)
   $row.age_seconds=$age
   if($state -eq 'RUNNING'){
    $runningCount++
    $matches=@($candidates | Where-Object { ([string]$_.CommandLine).Contains($dir.FullName) })
    if(-not $inventoryLimited -and $matches.Count -eq 0 -and $age -gt 240){$row.assessment='STALE_CANDIDATE';$staleCount++}
    else{$row.assessment='RUNNING_OR_UNCERTAIN'}
   }elseif($state -eq 'SUCCESS'){
    $image=Join-Path $dir.FullName 'ota_0.bin'
    $verifyFile=Join-Path $dir.FullName 'verification.json'
    $expectedHash=[string]$status.backup_sha256
    $expectedSize=[long]$status.backup_bytes
    if($hashesChecked -lt 3 -and $expectedHash -match '^[0-9a-fA-F]{64}$' -and
       $expectedSize -gt 0 -and $expectedSize -le 16777216 -and
       (Test-Path -LiteralPath $image -PathType Leaf) -and
       (Test-Path -LiteralPath $verifyFile -PathType Leaf)){
      $hashesChecked++
      $size=(Get-Item -LiteralPath $image).Length
      $proof=Get-Content -LiteralPath $verifyFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      $actual=(Get-FileHash -LiteralPath $image -Algorithm SHA256 -ErrorAction Stop).Hash
      $valid=$size -eq $expectedSize -and
       $actual -ieq $expectedHash -and
       [string]$proof.full_backup_sha256 -ieq $actual -and
       $proof.app_structure_valid -eq $true -and
       $proof.app_checksum_valid -eq $true -and
       $proof.app_embedded_sha256_valid -eq $true -and
       $proof.flash_performed -eq $false
      $row.backup_bytes=$size
      $row.verified_backup=[bool]$valid
      if($valid){$row.assessment='INTEGRITY_VERIFIED';$verifiedCount++}
      else{$row.assessment='INTEGRITY_FAILED';$unverifiedCount++}
    }else{$row.assessment='INTEGRITY_NOT_CHECKED';$unverifiedCount++}
   }else{$row.assessment='TERMINAL_NOT_VALIDATED'}
  }catch{$row.assessment='STATUS_OR_FILE_UNREADABLE';$unverifiedCount++}
  $jobs+= $row
 }
}else{$inventoryLimited=$false}
$state='NO_VERIFIED_BACKUP'
if($staleCount -gt 0){$state='STALE_BACKUP_REQUIRES_RECONCILIATION'}
elseif($verifiedCount -gt 0){$state='BACKUP_AVAILABLE_BUT_FLASH_NOT_AUTHORIZED'}
[ordered]@{
 schema=$schema
 action='mini.maintenance.assess'
 maintenance_state=$state
 observed_at=([DateTime]::UtcNow.ToString('o'))
 serial_ports=$ports
 espressif_port_candidates=$espPortNames
 espressif_device_count=$espDevices.Count
 backup_jobs=$jobs
 backup_verified_count=$verifiedCount
 backup_unverified_count=$unverifiedCount
 running_job_count=$runningCount
 stale_job_count=$staleCount
 process_inventory_limited=[bool]$inventoryLimited
 read_only=$true
 serial_opened=$false
 board_reset=$false
 flash_performed=$false
 firmware_write_authorized=$false
 rollback_verified=$false
 autonomous_flash_ready=$false
}|ConvertTo-Json -Depth 6 -Compress`;
  if(command.length>11000)throw new Error('MINI_MAINTENANCE_COMMAND_TOO_LONG');
  return {command,timeout_ms:45000};
}
