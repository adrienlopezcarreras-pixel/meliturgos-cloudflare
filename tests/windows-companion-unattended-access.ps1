$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw -Encoding UTF8 -LiteralPath 'assets/MEL-Computer-Companion.ps1'
$packaged = Get-Content -Raw -Encoding UTF8 -LiteralPath 'dist/MEL-Computer-Companion.ps1'
if ($source -cne $packaged) { throw 'UNATTENDED_COMPANION_SOURCE_DIST_DIVERGENCE' }

$start = $source.IndexOf('function Assert-LocalRemoteAccess {')
$end = $source.IndexOf('function Perform-Step(', $start)
if ($start -lt 0 -or $end -le $start) { throw 'UNATTENDED_COMPANION_GUARDS_MISSING' }
. ([ScriptBlock]::Create($source.Substring($start,$end-$start)))

$viewStart = $source.IndexOf('function Process-Command($command) {')
if ($viewStart -lt 0) { throw 'UNATTENDED_VIEW_HANDLER_MISSING' }
$view = $source.Substring($viewStart)
if ($view.Contains('MessageBox]::Show')) { throw 'UNATTENDED_VIEW_REQUIRES_LOCAL_DIALOG' }
if (-not $view.Contains('Assert-UnattendedCapturePermission')) { throw 'UNATTENDED_VIEW_OWNER_SWITCH_MISSING' }

$ConfigPath = Join-Path ([IO.Path]::GetTempPath()) ('mel-unattended-permissions-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  $script:MelExitRequested = $false
  '{"remote_access_enabled":true}' | Set-Content -Encoding UTF8 -LiteralPath $ConfigPath
  Assert-UnattendedCapturePermission

  '{"remote_access_enabled":false}' | Set-Content -Encoding UTF8 -LiteralPath $ConfigPath
  try {
    Assert-UnattendedCapturePermission
    throw 'UNATTENDED_ACCESS_SUCCEEDED_WITH_SWITCH_OFF'
  } catch {
    if ($_.Exception.Message -ne 'REMOTE_ACCESS_DISABLED_LOCALLY') { throw }
  }

  '{"remote_access_enabled":true}' | Set-Content -Encoding UTF8 -LiteralPath $ConfigPath
  $script:MelExitRequested = $true
  try {
    Assert-UnattendedCapturePermission
    throw 'UNATTENDED_ACCESS_IGNORED_LOCAL_STOP'
  } catch {
    if ($_.Exception.Message -ne 'SCREENSHOT_LOCAL_STOP_ACTIVE') { throw }
  }

  Remove-Item -LiteralPath $ConfigPath -Force
  $script:MelExitRequested = $false
  try {
    Assert-UnattendedCapturePermission
    throw 'UNATTENDED_ACCESS_SUCCEEDED_WITH_CONFIG_MISSING'
  } catch {
    if ($_.Exception.Message -ne 'REMOTE_ACCESS_DISABLED_LOCALLY') { throw }
  }
}
finally {
  $script:MelExitRequested = $false
  Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
}
Write-Host 'COMPANION_UNATTENDED_OWNER_OPT_IN_AND_REVOKE_OK'
