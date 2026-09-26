param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$SourceSha,
  [string]$OutputDir = "artifacts/windows",
  [switch]$Sign
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "WINDOWS_RELEASE_VERSION_INVALID"
}
if ($SourceSha -notmatch '^[0-9a-fA-F]{40}$') {
  throw "WINDOWS_RELEASE_SHA_INVALID"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $repoRoot "assets"
$stageRoot = Join-Path $repoRoot ".windows-release"
$stage = Join-Path $stageRoot "MEL-Windows-$Version"
$packageDir = Join-Path $repoRoot $OutputDir

if (Test-Path $stageRoot) { Remove-Item -Recurse -Force $stageRoot }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

$files = @(
  "MEL-Computer-Setup.ps1",
  "MEL-Computer-Companion.ps1"
)

foreach ($name in $files) {
  $src = Join-Path $assetDir $name
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "WINDOWS_RELEASE_SOURCE_MISSING:$name" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $stage $name)
}

$desktopSource = Join-Path $repoRoot "windows-companion\MEL-Companion.cs"
if (-not (Test-Path -LiteralPath $desktopSource -PathType Leaf)) { throw "WINDOWS_DESKTOP_SOURCE_MISSING" }
$companionSource = Join-Path $assetDir "MEL-Computer-Companion.ps1"
$desktopText = Get-Content -Raw -Encoding UTF8 -LiteralPath $desktopSource
if ($desktopText -notmatch "__COMPANION_B64__") { throw "WINDOWS_DESKTOP_EMBED_PLACEHOLDER_MISSING" }
$companionB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($companionSource))
$desktopBuildSource = Join-Path $stage "MEL-Companion.build.cs"
$desktopExe = Join-Path $stage "MEL-Companion.exe"
Set-Content -LiteralPath $desktopBuildSource -Value ($desktopText.Replace("__COMPANION_B64__",$companionB64)) -Encoding UTF8
Add-Type -Path $desktopBuildSource -ReferencedAssemblies @(
  "System.Windows.Forms.dll",
  "System.Drawing.dll",
  "System.Web.Extensions.dll",
  "System.Security.dll"
) -OutputAssembly $desktopExe -OutputType WindowsApplication
Remove-Item -LiteralPath $desktopBuildSource -Force

$launcher = @(
  '@echo off',
  'start "" "%~dp0MEL-Companion.exe"'
) -join [Environment]::NewLine
Set-Content -LiteralPath (Join-Path $stage "Install-MEL.cmd") -Value $launcher -Encoding ASCII

if ($Sign) {
  $pfx = [string]$env:MEL_WINDOWS_SIGNING_PFX_BASE64
  $password = [string]$env:MEL_WINDOWS_SIGNING_PFX_PASSWORD
  if ([string]::IsNullOrWhiteSpace($pfx)) { throw "WINDOWS_SIGN_PFX_MISSING" }
  if ([string]::IsNullOrWhiteSpace($password)) { throw "WINDOWS_SIGN_PASSWORD_MISSING" }
  & (Join-Path $PSScriptRoot "sign-windows-release.ps1") -StageDir $stage -PfxBase64 $pfx -PfxPassword $password
}

$manifestFiles = @()
foreach ($file in Get-ChildItem -LiteralPath $stage -File | Sort-Object Name) {
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName
  $manifestFiles += [ordered]@{
    name = $file.Name
    bytes = [int64]$file.Length
    sha256 = $hash.Hash.ToLowerInvariant()
  }
}

$manifestCore = [ordered]@{
  schema = "mel.windows-release-manifest.v1"
  version = $Version
  source_sha = $SourceSha.ToLowerInvariant()
  platform = "windows"
  architecture = "any"
  source = "assets"
  files = $manifestFiles
}
$manifestJson = $manifestCore | ConvertTo-Json -Depth 8
$manifestPath = Join-Path $stage "release-manifest.json"
Set-Content -LiteralPath $manifestPath -Value $manifestJson -Encoding UTF8

$manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()

$zipPath = Join-Path $packageDir "MEL-Windows-$Version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew)
try {
  $archive = New-Object IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    $epoch = [DateTimeOffset]::Parse("1980-01-01T00:00:00Z")
    foreach ($file in Get-ChildItem -LiteralPath $stage -File | Sort-Object Name) {
      $entry = $archive.CreateEntry($file.Name, [IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = $epoch
      $entryStream = $entry.Open()
      try {
        $input = [IO.File]::OpenRead($file.FullName)
        try { $input.CopyTo($entryStream) } finally { $input.Dispose() }
      } finally { $entryStream.Dispose() }
    }
  } finally { $archive.Dispose() }
} finally { $zipStream.Dispose() }

$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
$releaseMeta = [ordered]@{
  schema = "mel.windows-release.v1"
  version = $Version
  source_sha = $SourceSha.ToLowerInvariant()
  manifest_sha256 = $manifestHash
  package = [IO.Path]::GetFileName($zipPath)
  package_sha256 = $zipHash
  signed = [bool]$Sign
}
$releaseMetaPath = Join-Path $packageDir "MEL-Windows-$Version.release.json"
$releaseMeta | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $releaseMetaPath -Encoding UTF8

Write-Output ($releaseMeta | ConvertTo-Json -Compress)
