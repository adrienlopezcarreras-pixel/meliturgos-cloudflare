param(
  [Parameter(Mandatory=$true)][string]$PackageDir,
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$SourceSha
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedPackageDir = if ([IO.Path]::IsPathRooted($PackageDir)) { $PackageDir } else { Join-Path $repoRoot $PackageDir }
$zip = Join-Path $resolvedPackageDir "MEL-Windows-$Version.zip"
$metaPath = Join-Path $resolvedPackageDir "MEL-Windows-$Version.release.json"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "WINDOWS_PACKAGE_MISSING" }
if (-not (Test-Path -LiteralPath $metaPath -PathType Leaf)) { throw "WINDOWS_RELEASE_METADATA_MISSING" }

$meta = Get-Content -Raw -Encoding UTF8 $metaPath | ConvertFrom-Json
if ($meta.schema -ne "mel.windows-release.v1") { throw "WINDOWS_RELEASE_SCHEMA_MISMATCH" }
if ($meta.version -ne $Version) { throw "WINDOWS_RELEASE_VERSION_MISMATCH" }
if ($meta.source_sha -ne $SourceSha.ToLowerInvariant()) { throw "WINDOWS_RELEASE_SHA_MISMATCH" }

$actualZipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
if ($actualZipHash -ne [string]$meta.package_sha256) { throw "WINDOWS_PACKAGE_CHECKSUM_MISMATCH" }

$tempRoot = if ([string]::IsNullOrWhiteSpace([string]$env:RUNNER_TEMP)) { [IO.Path]::GetTempPath() } else { [string]$env:RUNNER_TEMP }
$temp = Join-Path $tempRoot ("mel-windows-verify-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
try {
  Expand-Archive -LiteralPath $zip -DestinationPath $temp -Force
  $manifestPath = Join-Path $temp "release-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "WINDOWS_MANIFEST_MISSING" }
  $desktopExe = Join-Path $temp "MEL-Companion.exe"
  if (-not (Test-Path -LiteralPath $desktopExe -PathType Leaf)) { throw "WINDOWS_DESKTOP_EXE_MISSING" }
  if ((Get-Item -LiteralPath $desktopExe).Length -lt 50000) { throw "WINDOWS_DESKTOP_EXE_INVALID" }
  $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
  if ($manifest.schema -ne "mel.windows-release-manifest.v1") { throw "WINDOWS_MANIFEST_SCHEMA_MISMATCH" }
  if ($manifest.version -ne $Version) { throw "WINDOWS_MANIFEST_VERSION_MISMATCH" }
  if ($manifest.source_sha -ne $SourceSha.ToLowerInvariant()) { throw "WINDOWS_MANIFEST_SHA_MISMATCH" }
  foreach ($row in @($manifest.files)) {
    $path = Join-Path $temp ([string]$row.name)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "WINDOWS_MANIFEST_FILE_MISSING:$($row.name)" }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if ($hash -ne [string]$row.sha256) { throw "WINDOWS_MANIFEST_FILE_HASH_MISMATCH:$($row.name)" }
  }
}
finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -Recurse -Force $temp }
}

Write-Output "WINDOWS_RELEASE_VERIFIED"
