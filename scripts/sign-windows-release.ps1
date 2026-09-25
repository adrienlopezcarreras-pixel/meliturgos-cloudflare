param(
  [Parameter(Mandatory=$true)][string]$StageDir,
  [Parameter(Mandatory=$true)][string]$PfxBase64,
  [Parameter(Mandatory=$true)][string]$PfxPassword
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $StageDir -PathType Container)) { throw "WINDOWS_SIGN_STAGE_MISSING" }
if ([string]::IsNullOrWhiteSpace($PfxBase64)) { throw "WINDOWS_SIGN_PFX_MISSING" }
if ([string]::IsNullOrWhiteSpace($PfxPassword)) { throw "WINDOWS_SIGN_PASSWORD_MISSING" }

$tempPfx = Join-Path $env:RUNNER_TEMP "mel-windows-signing.pfx"
try {
  [IO.File]::WriteAllBytes($tempPfx, [Convert]::FromBase64String($PfxBase64))
  $secure = ConvertTo-SecureString -String $PfxPassword -AsPlainText -Force
  $cert = New-Object Security.Cryptography.X509Certificates.X509Certificate2(
    $tempPfx,
    $secure,
    [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
  )
  if (-not $cert.HasPrivateKey) { throw "WINDOWS_SIGN_PRIVATE_KEY_MISSING" }

  foreach ($file in Get-ChildItem -LiteralPath $StageDir -Filter *.ps1 -File) {
    $sig = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $cert -HashAlgorithm SHA256
    if ($sig.Status -ne 'Valid') { throw "WINDOWS_SIGN_FAILED:$($file.Name):$($sig.Status)" }
  }
}
finally {
  if (Test-Path -LiteralPath $tempPfx) { Remove-Item -Force $tempPfx }
}
