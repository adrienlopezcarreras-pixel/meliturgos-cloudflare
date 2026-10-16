$ErrorActionPreference = 'Stop'

# Upload-Screenshot now reads the real virtual-screen bounds, so load the same Windows Forms assembly as the running Companion.
Add-Type -AssemblyName System.Windows.Forms

$source = Get-Content -Raw -Encoding UTF8 -LiteralPath 'assets/MEL-Computer-Companion.ps1'
$packaged = Get-Content -Raw -Encoding UTF8 -LiteralPath 'dist/MEL-Computer-Companion.ps1'
if ($source -cne $packaged) { throw 'COMPANION_BINARY_SOURCE_DIST_DIVERGENCE' }
if ($source -notmatch 'return ,\$ms\.ToArray\(\)') { throw 'COMPANION_PNG_RETURN_ENUMERATES_BYTES' }
if ($source -notmatch '\[byte\[\]\]\$bytes = Capture-PngBytes') { throw 'COMPANION_PNG_BODY_NOT_TYPED_BYTE_ARRAY' }
if ($source -notmatch 'SCREENSHOT_BINARY_PAYLOAD_INVALID') { throw 'COMPANION_PNG_SIZE_GUARD_MISSING' }

function Emit-PngBytes {
  $ms = New-Object IO.MemoryStream
  try {
    [byte[]]$png = @(137,80,78,71,13,10,26,10,0,0,0,0)
    $ms.Write($png,0,$png.Length)
    return ,$ms.ToArray()
  } finally { $ms.Dispose() }
}

$body = Emit-PngBytes
if ($body -isnot [byte[]]) { throw "COMPANION_PNG_NOT_BINARY:$($body.GetType().FullName)" }
if ($body.Length -ne 12) { throw "COMPANION_PNG_SIZE_WRONG:$($body.Length)" }
if ($body[0] -ne 137 -or $body[1] -ne 80 -or $body[2] -ne 78 -or $body[3] -ne 71) {
  throw 'COMPANION_PNG_SIGNATURE_CORRUPTED'
}
Write-Host 'COMPANION_PNG_BINARY_PAYLOAD_OK'

# Exercise the real Upload-Screenshot function with controlled Windows PowerShell stubs.
# The capture may change the owner's local permission; no request may be sent then.
$start = $source.IndexOf('function Upload-Screenshot([string]$commandId) {')
$end = $source.IndexOf('function Key-Token(', $start)
if ($start -lt 0 -or $end -le $start) { throw 'COMPANION_UPLOAD_HANDLER_MISSING' }
. ([ScriptBlock]::Create($source.Substring($start, $end - $start)))
$Server = 'https://mel.test'
$script:accessAllowed = $true
$script:revokeDuringCapture = $true
$script:uploadCalls = 0

function Assert-LocalRemoteAccess {
  if (-not $script:accessAllowed) { throw 'REMOTE_ACCESS_DISABLED_LOCALLY' }
}
function Capture-PngBytes {
  [byte[]]$testPng = @(137,80,78,71,13,10,26,10,0,0,0,0)
  if ($script:revokeDuringCapture) { $script:accessAllowed = $false }
  return ,$testPng
}
function Headers { return @{} }
function Invoke-RestMethod {
  param($Uri,$Method,$Headers,$ContentType,$Body,$TimeoutSec)
  $script:uploadCalls++
  if ($Body -isnot [byte[]]) { throw 'COMPANION_HTTP_BODY_NOT_BINARY' }
  if ($Body.Length -ne 12) { throw 'COMPANION_HTTP_BODY_BYTES_CHANGED' }
  if ($ContentType -ne 'image/png' -or $Method -ne 'Post') { throw 'COMPANION_HTTP_REQUEST_INVALID' }
  return @{key='computer/screenshots/test/revocation-proof.png';view_url='https://mel.test/screenshot'}
}

try {
  [void](Upload-Screenshot 'revoke-command')
  throw 'COMPANION_REVOKED_CAPTURE_WAS_UPLOADED'
} catch {
  if ($_.Exception.Message -ne 'REMOTE_ACCESS_DISABLED_LOCALLY') { throw }
}
if ($script:uploadCalls -ne 0) { throw 'COMPANION_REVOKED_CAPTURE_SENT_HTTP' }

$script:accessAllowed = $true
$script:revokeDuringCapture = $false
$result = Upload-Screenshot 'approved-command'
if ($script:uploadCalls -ne 1 -or -not $result.key) { throw 'COMPANION_AUTHORIZED_CAPTURE_NOT_SENT' }
Write-Host 'COMPANION_SCREENSHOT_LIVE_REVOCATION_OK'
