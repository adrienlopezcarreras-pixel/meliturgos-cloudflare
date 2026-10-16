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

# Package the local interactive Wi-Fi pairing wizard (never invoked by a cloud job).
$androidPairSource = Join-Path $repoRoot "tools\android-companion\MEL-Android-WiFi-Pairing.ps1"
if (-not (Test-Path -LiteralPath $androidPairSource -PathType Leaf)) { throw "ANDROID_WIFI_PAIRING_HELPER_MISSING" }
Copy-Item -LiteralPath $androidPairSource -Destination (Join-Path $stage "MEL-Android-WiFi-Pairing.ps1")

# Package the owner-attended MINI read-only USB inspector and its offline parsers.
# Never invoked by the setup script, cloud relay or Windows boot.
$miniInspectorFiles = @(
  'local_readonly_preflight.py',
  'inspect_partitions.py',
  'inspect_ota_state.py',
  'inspect_image.py'
)
foreach ($name in $miniInspectorFiles) {
  $src = Join-Path $repoRoot (Join-Path 'tools\mini-updater' $name)
  if (!(Test-Path -LiteralPath $src -PathType Leaf)) { throw "MINI_USB_INSPECTOR_SOURCE_MISSING:$name" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $stage $name)
}
$miniHelper = Join-Path $repoRoot 'windows-companion\MEL-MINI-USB-Preflight.ps1'
if (!(Test-Path -LiteralPath $miniHelper -PathType Leaf)) { throw 'MINI_USB_HELPER_SOURCE_MISSING' }
Copy-Item -LiteralPath $miniHelper -Destination (Join-Path $stage 'MEL-MINI-USB-Preflight.ps1')

# Ship the read-only owner-launched MCP bridge alongside the Companion.
# Do not start the bridge during installation or any background service.
foreach ($entry in @(@{ source='windows-companion\\Start-MEL-Companion-MCP.ps1'; name='Start-MEL-Companion-MCP.ps1' },@{ source='tools\\mel-companion-mcp.mjs'; name='mel-companion-mcp.mjs' })) {
  $src=Join-Path $repoRoot $entry.source
  if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "WINDOWS_MCP_SOURCE_MISSING:$($entry.name)" }
  Copy-Item -LiteralPath $src -Destination (Join-Path $stage $entry.name)
}

# Include owner-facing MCP setup instructions in the release ZIP.
$mcpGuide = Join-Path $repoRoot 'docs\\MEL-COMPANION-MCP-WINDOWS-LAUNCH.md'
if (!(Test-Path -LiteralPath $mcpGuide -PathType Leaf)) { throw 'WINDOWS_MCP_GUIDE_MISSING' }
Copy-Item -LiteralPath $mcpGuide -Destination (Join-Path $stage 'MEL-Companion-MCP-README.md')

# Packaged but never executed during installation or build.
$benchmarkSource = Join-Path $repoRoot "scripts\companion-local-ai-benchmark.ps1"
if (-not (Test-Path -LiteralPath $benchmarkSource -PathType Leaf)) { throw "WINDOWS_LOCAL_AI_BENCHMARK_MISSING" }
Copy-Item -LiteralPath $benchmarkSource -Destination (Join-Path $stage "MEL-Local-AI-Benchmark.ps1")

$desktopSource = Join-Path $repoRoot "windows-companion\MEL-Companion.cs"
if (-not (Test-Path -LiteralPath $desktopSource -PathType Leaf)) { throw "WINDOWS_DESKTOP_SOURCE_MISSING" }
$companionSource = Join-Path $assetDir "MEL-Computer-Companion.ps1"
$desktopText = [IO.File]::ReadAllText($desktopSource,[Text.Encoding]::UTF8)
if ($desktopText -notmatch "__COMPANION_B64__") { throw "WINDOWS_DESKTOP_EMBED_PLACEHOLDER_MISSING" }
$companionB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($companionSource))
$adbWifiSource = Join-Path $repoRoot "windows-companion\MEL-ADB-WiFi.ps1"
if (-not (Test-Path -LiteralPath $adbWifiSource -PathType Leaf)) { throw "WINDOWS_ADB_WIFI_SOURCE_MISSING" }
$adbWifiB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($adbWifiSource))
$desktopBuildSource = Join-Path $stage "MEL-Companion.build.cs"
$desktopExe = Join-Path $stage "MEL-Companion.exe"
$unicodeEscape = [Text.RegularExpressions.MatchEvaluator]{
  param($match)
  return ('\u{0:X4}' -f [int][char]$match.Value[0])
}
$asciiDesktop = [Text.RegularExpressions.Regex]::Replace($desktopText,'[^\x00-\x7F]',$unicodeEscape)
$expandedSource = $asciiDesktop.Replace("__COMPANION_B64__",$companionB64).Replace("__ADB_WIFI_B64__",$adbWifiB64)
[IO.File]::WriteAllText($desktopBuildSource,$expandedSource,[Text.Encoding]::ASCII)
$cscCandidates = @(
  (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $csc) { throw "WINDOWS_CSC_COMPILER_MISSING" }
$compileArgs = @(
  "/nologo",
  "/target:winexe",
  "/optimize+",
  "/out:$desktopExe",
  "/reference:System.Windows.Forms.dll",
  "/reference:System.Drawing.dll",
  "/reference:System.Web.Extensions.dll",
  "/reference:System.Security.dll",
  $desktopBuildSource
)
& $csc @compileArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $desktopExe -PathType Leaf)) { throw "WINDOWS_DESKTOP_COMPILE_FAILED" }
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
