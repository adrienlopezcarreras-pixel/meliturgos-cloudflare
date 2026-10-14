$ErrorActionPreference = 'Stop'

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
