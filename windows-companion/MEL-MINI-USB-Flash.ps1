# MINI local OTA writer. Only invoked by the Windows Companion after GUI consent.
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^COM3$')][string]$Port,
 [Parameter(Mandatory=$true)][string]$Firmware,
 [Parameter(Mandatory=$true)][string]$Evidence,
 [switch]$ConfirmedByCompanion
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (-not $ConfirmedByCompanion) { throw 'MINI_GUI_OWNER_APPROVAL_REQUIRED' }
$approvedSha='835bd51f438d5465e30955a6783cf34fb8b2d95e2a98ee6f33f04ea406b1d172'
if (!(Test-Path -LiteralPath $Firmware -PathType Leaf)) { throw 'MINI_FIRMWARE_MISSING' }
if ((Get-FileHash -LiteralPath $Firmware -Algorithm SHA256).Hash.ToLowerInvariant() -cne $approvedSha) { throw 'MINI_IMAGE_SHA256_NOT_APPROVED' }
if (!(Test-Path -LiteralPath $Evidence -PathType Leaf)) { throw 'MINI_PROOF_MISSING' }
$p=Get-Content -LiteralPath $Evidence -Raw -Encoding UTF8 | ConvertFrom-Json
if ($p.schema -ne 'mel-mini-live-readonly-preflight/v2' -or
    $p.port -ne 'COM3' -or $p.partition_valid -ne $true -or
    $p.ota_metadata_unambiguous -ne $true -or
    $p.running_slot_verified_on_device -ne $true -or
    $p.restore_proven -ne $true -or $p.flash_allowed -ne $true) {
    throw 'MINI_RECOVERY_AND_RUNNING_SLOT_PROOF_REQUIRED'
}
# Never trust a hardcoded offset: derive the inactive OTA slot from a validated table.
$table=$p.partition_table
if ($null -eq $table -or $table.valid -ne $true) { throw 'MINI_PARTITION_TABLE_UNVERIFIED' }
$running=[string]$p.running_slot
if ($running -notin @('ota_0','ota_1')) { throw 'MINI_RUNNING_SLOT_UNKNOWN' }
$target=if ($running -eq 'ota_0') {'ota_1'} else {'ota_0'}
$entry=@($table.partitions | Where-Object { $_.name -eq $target -and $_.type -eq 0 -and $_.subtype -in @(16,17) })
if ($entry.Count -ne 1) { throw 'MINI_INACTIVE_PARTITION_MISSING' }
$offset=[long]$entry[0].offset
$length=[long]$entry[0].size
if ($offset -lt 0x20000 -or ($offset % 0x10000) -ne 0 -or $length -lt 0x100000 -or
    (Get-Item -LiteralPath $Firmware).Length -gt $length) { throw 'MINI_INACTIVE_IMAGE_DOES_NOT_FIT' }
# This executor deliberately refuses a fabricated preflight; only current
# live attestation with recovery proof can authorize the subsequent write.
if (-not $p.PSObject.Properties['live_attestation'] -or
    $p.live_attestation.verified -ne $true -or
    $p.live_attestation.flash_image_sha256 -cne $approvedSha) {
    throw 'MINI_LIVE_ATTESTATION_REQUIRED'
}
# One remaining prerequisite is an independently verified OTA selection/rollback
# procedure; never erase otadata to guess the boot slot.
throw 'MINI_OTA_ACTIVATION_AND_ROLLBACK_NOT_VERIFIED'
