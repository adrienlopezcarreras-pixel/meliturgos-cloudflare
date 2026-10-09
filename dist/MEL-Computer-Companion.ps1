param(
  [switch]$Run
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$MelDir = Join-Path $env:LOCALAPPDATA "MEL"
$ConfigPath = Join-Path $MelDir "computer.json"

if (-not (Test-Path $ConfigPath)) {
  Write-Error "Configuration MEL absente. Lancez d'abord MEL-Computer-Setup.ps1."
  exit 2
}

$config = Get-Content -Raw -Encoding UTF8 $ConfigPath | ConvertFrom-Json

function Unprotect-Text([string]$value) {
  $cipher = [Convert]::FromBase64String($value)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect(
    $cipher,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [Text.Encoding]::UTF8.GetString($plain)
}

$Token = Unprotect-Text $config.token_protected
$Server = ([string]$config.server_url).TrimEnd("/")
$ComputerId = [string]$config.computer_id
$Version = "1.4.0"
$Headless = $env:MEL_COMPANION_HEADLESS -eq "1"
$ParentPid = 0
[void][int]::TryParse([string]$env:MEL_COMPANION_PARENT_PID,[ref]$ParentPid)
$script:MelExitRequested = $false
$script:MelTrayIcon = $null

function Open-MelUi {
  try { Start-Process $Server } catch {}
}

function Show-MelTrayPanel {
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "MEL Companion"
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.ClientSize = New-Object System.Drawing.Size(430,260)
  $form.BackColor = [System.Drawing.Color]::FromArgb(8,13,28)
  $form.ForeColor = [System.Drawing.Color]::White

  $logo = New-Object System.Windows.Forms.Label
  $logo.Text = "MEL"
  $logo.Font = New-Object System.Drawing.Font("Segoe UI",22,[System.Drawing.FontStyle]::Bold)
  $logo.ForeColor = [System.Drawing.Color]::FromArgb(68,232,255)
  $logo.SetBounds(24,18,90,45)

  $title = New-Object System.Windows.Forms.Label
  $title.Text = "Companion PC"
  $title.Font = New-Object System.Drawing.Font("Segoe UI Semibold",15,[System.Drawing.FontStyle]::Bold)
  $title.ForeColor = [System.Drawing.Color]::White
  $title.SetBounds(118,24,260,34)

  $status = New-Object System.Windows.Forms.Label
  $status.Text = "●  Connecte a MEL"
  $status.Font = New-Object System.Drawing.Font("Segoe UI",10)
  $status.ForeColor = [System.Drawing.Color]::FromArgb(72,220,170)
  $status.SetBounds(28,82,250,26)

  $info = New-Object System.Windows.Forms.Label
  $info.Text = "Le compagnon tourne en arriere-plan. Il permet a MEL d interagir avec ce PC dans les limites autorisees."
  $info.Font = New-Object System.Drawing.Font("Segoe UI",9.5)
  $info.ForeColor = [System.Drawing.Color]::FromArgb(205,218,240)
  $info.SetBounds(28,118,370,55)

  $openButton = New-Object System.Windows.Forms.Button
  $openButton.Text = "OUVRIR MEL"
  $openButton.Font = New-Object System.Drawing.Font("Segoe UI",10,[System.Drawing.FontStyle]::Bold)
  $openButton.ForeColor = [System.Drawing.Color]::FromArgb(5,18,27)
  $openButton.BackColor = [System.Drawing.Color]::FromArgb(68,232,255)
  $openButton.FlatStyle = "Flat"
  $openButton.FlatAppearance.BorderSize = 0
  $openButton.SetBounds(165,195,125,38)
  $openButton.Add_Click({ Open-MelUi; $form.Close() })

  $closeButton = New-Object System.Windows.Forms.Button
  $closeButton.Text = "FERMER"
  $closeButton.Font = New-Object System.Drawing.Font("Segoe UI",10,[System.Drawing.FontStyle]::Bold)
  $closeButton.ForeColor = [System.Drawing.Color]::FromArgb(207,222,246)
  $closeButton.BackColor = [System.Drawing.Color]::FromArgb(28,38,65)
  $closeButton.FlatStyle = "Flat"
  $closeButton.SetBounds(300,195,100,38)
  $closeButton.Add_Click({ $form.Close() })

  $form.Controls.AddRange(@($logo,$title,$status,$info,$openButton,$closeButton))
  [void]$form.ShowDialog()
}

function New-MelTrayIcon {
  $bmp = New-Object System.Drawing.Bitmap 32,32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(10,18,38))
    $ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(68,232,255)),2
    $font = New-Object System.Drawing.Font("Segoe UI",14,[System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(68,232,255))
    try {
      $g.FillEllipse($bg,1,1,30,30)
      $g.DrawEllipse($ring,2,2,27,27)
      $g.DrawString("M",$font,$brush,7,5)
    } finally {
      $bg.Dispose(); $ring.Dispose(); $font.Dispose(); $brush.Dispose()
    }
  } finally { $g.Dispose() }

  $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $menu.BackColor = [System.Drawing.Color]::FromArgb(17,25,48)
  $menu.ForeColor = [System.Drawing.Color]::FromArgb(225,235,250)
  $menu.Font = New-Object System.Drawing.Font("Segoe UI",10)

  $open = $menu.Items.Add("Ouvrir MEL")
  $panel = $menu.Items.Add("Companion MEL")
  [void]$menu.Items.Add("-")
  $quit = $menu.Items.Add("Quitter")

  $notify = New-Object System.Windows.Forms.NotifyIcon
  $notify.Icon = $icon
  $notify.Text = "MEL Companion - connecté"
  $notify.ContextMenuStrip = $menu
  $notify.Visible = $true

  $open.add_Click({ Open-MelUi })
  $panel.add_Click({ Show-MelTrayPanel })
  $notify.add_Click({
    param($sender,$eventArgs)
    if ($eventArgs.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Show-MelTrayPanel }
  })
  $notify.add_DoubleClick({ Open-MelUi })
  $quit.add_Click({
    $script:MelExitRequested = $true
    if ($script:MelTrayIcon) {
      $script:MelTrayIcon.Visible = $false
    }
  })

  $script:MelTrayIcon = $notify
  return @{ notify=$notify; icon=$icon; bitmap=$bmp; menu=$menu }
}

$Native = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MelNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
Add-Type -TypeDefinition $Native -Language CSharp
try {
  $dpiContext = [IntPtr]::new(-4)
  if (-not [MelNative]::SetProcessDpiAwarenessContext($dpiContext)) {
    [void][MelNative]::SetProcessDPIAware()
  }
} catch {
  try { [void][MelNative]::SetProcessDPIAware() } catch {}
}

$MOUSE_LEFTDOWN = 0x0002
$MOUSE_LEFTUP   = 0x0004
$MOUSE_WHEEL    = 0x0800

function Headers {
  return @{
    "Authorization" = "Bearer $Token"
    "X-MEL-Computer-ID" = $ComputerId
  }
}

function Invoke-MelJson {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [ValidateSet("GET","POST")][string]$Method = "GET",
    $Body = $null
  )
  $uri = "$Server$Path"
  $h = Headers
  if ($null -eq $Body) {
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $h -TimeoutSec 20
  }
  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $h -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 20
}

function Active-Window {
  try {
    $hwnd = [MelNative]::GetForegroundWindow()
    $sb = New-Object Text.StringBuilder 512
    [void][MelNative]::GetWindowText($hwnd, $sb, $sb.Capacity)
    return $sb.ToString()
  } catch { return "" }
}

function Send-Heartbeat {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $body = @{
    engine_version = $Version
    engine_heartbeat_at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    hostname = $env:COMPUTERNAME
    user = $env:USERNAME
    screen = @{ x=$bounds.X; y=$bounds.Y; width=$bounds.Width; height=$bounds.Height }
    active_window = (Active-Window)
  }
  try { [void](Invoke-MelJson -Path "/api/computer/v1/heartbeat" -Method "POST" -Body $body) } catch {}
}

function Capture-PngBytes {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size)
    $ms = New-Object IO.MemoryStream
    try {
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      return $ms.ToArray()
    } finally { $ms.Dispose() }
  } finally {
    $g.Dispose()
    $bmp.Dispose()
  }
}

function Upload-Screenshot([string]$commandId) {
  $bytes = Capture-PngBytes
  $uri = "$Server/api/computer/v1/screenshot?command_id=$([uri]::EscapeDataString($commandId))"
  return Invoke-RestMethod -Uri $uri -Method Post -Headers (Headers) -ContentType "image/png" -Body $bytes -TimeoutSec 30
}

function Key-Token([string]$key) {
  $k = $key.Trim().ToUpperInvariant()
  switch ($k) {
    "ENTER" { return "{ENTER}" }
    "RETURN" { return "{ENTER}" }
    "TAB" { return "{TAB}" }
    "ESC" { return "{ESC}" }
    "ESCAPE" { return "{ESC}" }
    "BACKSPACE" { return "{BACKSPACE}" }
    "DELETE" { return "{DELETE}" }
    "UP" { return "{UP}" }
    "DOWN" { return "{DOWN}" }
    "LEFT" { return "{LEFT}" }
    "RIGHT" { return "{RIGHT}" }
    "HOME" { return "{HOME}" }
    "END" { return "{END}" }
    "PGUP" { return "{PGUP}" }
    "PGDN" { return "{PGDN}" }
    "CTRL+L" { return "^l" }
    "CTRL+C" { return "^c" }
    "CTRL+V" { return "^v" }
    "CTRL+A" { return "^a" }
    "CTRL+S" { return "^s" }
    "ALT+TAB" { return "%{TAB}" }
    default {
      if ($k -match "^F([1-9]|1[0-2])$") { return "{$k}" }
      if ($k.Length -eq 1) { return $k.ToLowerInvariant() }
      throw "KEY_NOT_SUPPORTED"
    }
  }
}

function Type-Text([string]$text) {
  $old = $null
  $hadOld = $false
  try {
    $old = Get-Clipboard -Raw -ErrorAction Stop
    $hadOld = $true
  } catch {}
  try {
    Set-Clipboard -Value $text
    [System.Windows.Forms.SendKeys]::SendWait("^v")
  } finally {
    if ($hadOld) {
      try { Set-Clipboard -Value $old } catch {}
    }
  }
}

function Resolve-App([string]$app) {
  $a = $app.Trim().ToLowerInvariant()
  $allowed = @($config.allowed_apps | ForEach-Object { ([string]$_).ToLowerInvariant() })
  if ($allowed -notcontains $a) { throw "APP_OUTSIDE_LOCAL_ALLOWLIST" }
  switch ($a) {
    "notepad" { return "notepad.exe" }
    "calculator" { return "calc.exe" }
    "explorer" { return "explorer.exe" }
    "msedge" { return "msedge.exe" }
    "chrome" { return "chrome.exe" }
    "firefox" { return "firefox.exe" }
    default { throw "APP_NOT_MAPPED" }
  }
}

function Resolve-AllowedPath([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { throw "FILE_PATH_REQUIRED" }
  $full = [IO.Path]::GetFullPath($path)
  if ($full.StartsWith("\\")) { throw "NETWORK_PATH_NOT_ALLOWED" }
  $roots = @($config.allowed_paths | ForEach-Object {
    try { [IO.Path]::GetFullPath([string]$_).TrimEnd("\") } catch { $null }
  } | Where-Object { $_ })
  if (-not $roots.Count) { throw "LOCAL_PATH_ALLOWLIST_EMPTY" }
  $ok = $false
  foreach ($root in $roots) {
    if ($full.Equals($root,[StringComparison]::OrdinalIgnoreCase) -or
        $full.StartsWith($root + "\",[StringComparison]::OrdinalIgnoreCase)) {
      $ok = $true
      break
    }
  }
  if (-not $ok) { throw "PATH_OUTSIDE_LOCAL_ALLOWLIST" }
  return $full
}

function Close-AppGracefully([string]$app) {
  $exe = Resolve-App $app
  $name = [IO.Path]::GetFileNameWithoutExtension($exe)
  $closed = 0
  foreach ($p in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
    try {
      if ($p.MainWindowHandle -ne 0 -and $p.CloseMainWindow()) { $closed++ }
    } catch {}
  }
  return $closed
}

function Close-ForegroundFile([string]$path) {
  $full = Resolve-AllowedPath $path
  $leaf = [IO.Path]::GetFileName($full)
  $title = Active-Window
  if ([string]::IsNullOrWhiteSpace($leaf) -or
      $title.IndexOf($leaf,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
    throw "FILE_NOT_FOREGROUND"
  }
  [System.Windows.Forms.SendKeys]::SendWait("%{F4}")
  return @{ path=$full; active_window=$title }
}

function Ensure-ShutdownEnvironment {
  $fallbacks = [ordered]@{
    COMPUTERNAME = [Environment]::MachineName
    TMP = $env:TEMP
    ProgramData = if ($env:SystemDrive) { Join-Path $env:SystemDrive "ProgramData" } else { "C:\ProgramData" }
    ComSpec = if ($env:SystemRoot) { Join-Path $env:SystemRoot "System32\cmd.exe" } else { "C:\Windows\System32\cmd.exe" }
  }
  foreach ($name in $fallbacks.Keys) {
    $current = [Environment]::GetEnvironmentVariable($name,"Process")
    if (-not [string]::IsNullOrWhiteSpace([string]$current)) { continue }
    $value = [Environment]::GetEnvironmentVariable($name,"Machine")
    if ([string]::IsNullOrWhiteSpace([string]$value)) { $value = [Environment]::GetEnvironmentVariable($name,"User") }
    if ([string]::IsNullOrWhiteSpace([string]$value)) { $value = [string]$fallbacks[$name] }
    if (-not [string]::IsNullOrWhiteSpace([string]$value)) {
      [Environment]::SetEnvironmentVariable($name,[string]$value,"Process")
    }
  }
}

function Invoke-ShutdownCommand([string]$action) {
  Ensure-ShutdownEnvironment
  $exe = Join-Path $env:SystemRoot "System32\shutdown.exe"
  $arguments = if ($action -eq "power.off") {
    @("/s","/t","5","/d","p:0:0","/c","MEL owner-approved shutdown")
  } else {
    @("/r","/t","5","/d","p:0:0","/c","MEL owner-approved restart")
  }
  & $exe @arguments | Out-Null
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "POWER_SCHEDULE_FAILED:$exitCode" }
  return @{ action=$action; scheduled=$true; delay_seconds=5; exit_code=$exitCode }
}


function Sovereignty-Root {
  $base = if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { Join-Path $env:USERPROFILE "AppData\Local" } else { $env:LOCALAPPDATA }
  $root = Join-Path $base "MEL\Sovereignty"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  [IO.Directory]::CreateDirectory((Join-Path $root "repos")) | Out-Null
  [IO.Directory]::CreateDirectory((Join-Path $root "worktrees")) | Out-Null
  return [IO.Path]::GetFullPath($root)
}

function Resolve-SovereigntyRepo([string]$repository) {
  $name = ([string]$repository).Trim()
  if ($name -notmatch '^[A-Za-z0-9_.-]{1,200}$') { throw "SOVEREIGNTY_REPOSITORY_INVALID" }
  $root = Sovereignty-Root
  $reposRoot = [IO.Path]::GetFullPath((Join-Path $root "repos")).TrimEnd("\")
  $path = [IO.Path]::GetFullPath((Join-Path $reposRoot $name))
  if (-not $path.StartsWith($reposRoot + "\",[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_REPOSITORY_OUTSIDE_SANDBOX" }
  return $path
}

function Assert-SovereigntyGitRef([string]$ref) {
  $value = ([string]$ref).Trim()
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -gt 240) { throw "SOVEREIGNTY_GIT_REF_INVALID" }
  if ($value -match '[\s~^:?*\\\[]' -or $value.Contains("..") -or $value.StartsWith("-")) { throw "SOVEREIGNTY_GIT_REF_INVALID" }
  return $value
}

function Resolve-SovereigntyRelativePath([string]$repo,[string]$relative) {
  $rel = ([string]$relative).Replace("/","\").TrimStart("\")
  if ([string]::IsNullOrWhiteSpace($rel) -or [IO.Path]::IsPathRooted($rel) -or $rel -match '(^|\\)\.\.(\\|$)') { throw "SOVEREIGNTY_PATH_INVALID" }
  $full = [IO.Path]::GetFullPath((Join-Path $repo $rel))
  $root = [IO.Path]::GetFullPath($repo).TrimEnd("\")
  if (-not $full.StartsWith($root + "\",[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_PATH_OUTSIDE_REPO" }
  return @{ full=$full; relative=$rel.Replace("\","/") }
}

function Invoke-SovereigntyGit([string]$repo,[string[]]$arguments) {
  if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "SOVEREIGNTY_GIT_NOT_INSTALLED" }
  $output = & git.exe -C $repo @arguments 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    $detail = ([string]($output -join " ")).Trim()
    if ($detail.Length -gt 500) { $detail = $detail.Substring(0,500) }
    throw ("SOVEREIGNTY_GIT_FAILED:" + $exitCode + ":" + $detail)
  }
  return ([string]($output -join [Environment]::NewLine)).Trim()
}

function Require-SovereigntyGitRepo([string]$repository) {
  $repo = Resolve-SovereigntyRepo $repository
  if (-not (Test-Path -LiteralPath (Join-Path $repo ".git") -PathType Container)) { throw "SOVEREIGNTY_GIT_REPO_NOT_SEEDED" }
  [void](Invoke-SovereigntyGit $repo @("status","--porcelain=v1"))
  return $repo
}

function Test-SovereigntyHex([string]$value,[int]$length) {
  $text = ([string]$value).Trim()
  if ($text.Length -ne $length) { return $false }
  foreach ($ch in $text.ToCharArray()) {
    if (-not [Uri]::IsHexDigit($ch)) { return $false }
  }
  return $true
}

function Seed-SovereigntyGitRepo([string]$repository,[string]$expectedSha) {
  $sha = ([string]$expectedSha).Trim().ToLowerInvariant()
  if (-not (Test-SovereigntyHex $sha 40)) { throw "SOVEREIGNTY_SEED_SHA_INVALID" }
  if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "SOVEREIGNTY_GIT_NOT_INSTALLED" }
  if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "SOVEREIGNTY_TAR_NOT_INSTALLED" }

  $root = Sovereignty-Root
  $repo = Resolve-SovereigntyRepo $repository
  $temp = Join-Path $root ("seed-" + [guid]::NewGuid().ToString("N"))
  $archive = Join-Path $temp "source.tgz"
  $extract = Join-Path $temp "extract"
  [IO.Directory]::CreateDirectory($extract) | Out-Null

  try {
    $uri = $Server + "/api/computer/v1/sovereignty-code-archive?sha=" + [uri]::EscapeDataString($sha)
    $response = Invoke-WebRequest -Uri $uri -Method Get -Headers (Headers) -OutFile $archive -UseBasicParsing -TimeoutSec 120
    $sourceSha = ([string]$response.Headers["X-MEL-Source-Sha"]).Trim().ToLowerInvariant()
    $expectedArchiveHash = ([string]$response.Headers["X-MEL-Archive-Sha256"]).Trim().ToLowerInvariant()
    $externalVerified = ([string]$response.Headers["X-MEL-External-Reconstruction-Verified"]).Trim()

    if ($sourceSha -ne $sha) { throw "SOVEREIGNTY_SEED_SOURCE_SHA_MISMATCH" }
    if (-not (Test-SovereigntyHex $expectedArchiveHash 64)) { throw "SOVEREIGNTY_SEED_ARCHIVE_HASH_MISSING" }
    if ($externalVerified -ne "1") { throw "SOVEREIGNTY_SEED_EXTERNAL_RECONSTRUCTION_REQUIRED" }

    $actualArchiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualArchiveHash -ne $expectedArchiveHash) { throw "SOVEREIGNTY_SEED_ARCHIVE_HASH_MISMATCH" }

    & tar.exe -xzf $archive -C $extract
    if ($LASTEXITCODE -ne 0) { throw "SOVEREIGNTY_SEED_ARCHIVE_EXTRACT_FAILED" }

    $entries = @(Get-ChildItem -LiteralPath $extract -Force)
    $sourceRoot = $extract
    if ($entries.Count -eq 1 -and $entries[0].PSIsContainer) { $sourceRoot = $entries[0].FullName }

    if (Test-Path -LiteralPath $repo) { Remove-Item -LiteralPath $repo -Recurse -Force }
    [IO.Directory]::CreateDirectory($repo) | Out-Null
    Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $repo -Recurse -Force
    }

    $gitDir = Join-Path $repo ".git"
    if (Test-Path -LiteralPath $gitDir) { Remove-Item -LiteralPath $gitDir -Recurse -Force }

    $provenance = @{
      schema="mel.local-source-provenance/v1"
      source_sha=$sha
      archive_sha256=$actualArchiveHash
      external_reconstruction_verified=$true
      seeded_at=(Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText((Join-Path $repo ".mel-source-provenance.json"),$provenance,[Text.UTF8Encoding]::new($false))

    [void](Invoke-SovereigntyGit $repo @("init","-b","main"))
    [void](Invoke-SovereigntyGit $repo @("add","-A"))
    [void](Invoke-SovereigntyGit $repo @("-c","user.name=MEL Sovereignty","-c","user.email=mel-sovereignty@localhost","commit","-m",("Recovered source " + $sha)))
    $localSha = Invoke-SovereigntyGit $repo @("rev-parse","HEAD")

    return @{ action="sovereignty.source_control.seed"; repository=$repository; source_sha=$sha; archive_sha256=$actualArchiveHash; local_commit_sha=$localSha; external_reconstruction_verified=$true }
  } finally {
    try { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force } } catch {}
  }
}


function Sovereignty-StorageRoot([string]$namespace) {
  $ns = ([string]$namespace).Trim()
  if ($ns -notmatch '^[A-Za-z0-9_.-]{1,160}$') { throw "SOVEREIGNTY_STORAGE_NAMESPACE_INVALID" }
  $root = Join-Path (Sovereignty-Root) "storage"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $path = [IO.Path]::GetFullPath((Join-Path $root $ns))
  $base = [IO.Path]::GetFullPath($root).TrimEnd("\")
  if (-not $path.StartsWith($base + "\",[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_STORAGE_NAMESPACE_OUTSIDE_SANDBOX" }
  [IO.Directory]::CreateDirectory($path) | Out-Null
  return $path
}

function Resolve-SovereigntyStorageKey([string]$namespace,[string]$key) {
  $root = Sovereignty-StorageRoot $namespace
  $rel = ([string]$key).Replace("/","\").TrimStart("\")
  if ([string]::IsNullOrWhiteSpace($rel) -or [IO.Path]::IsPathRooted($rel) -or $rel -match '(^|\\)\.\.(\\|$)') { throw "SOVEREIGNTY_STORAGE_KEY_INVALID" }
  $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
  $base = [IO.Path]::GetFullPath($root).TrimEnd("\")
  if (-not $full.StartsWith($base + "\",[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_STORAGE_KEY_OUTSIDE_SANDBOX" }
  return @{ root=$root; full=$full; relative=$rel.Replace("\","/") }
}


$script:SovereigntyDbTransactions = @{}

function Sovereignty-DatabasePath([string]$database) {
  $name = ([string]$database).Trim()
  if ([string]::IsNullOrWhiteSpace($name)) { $name = "mel-sovereignty" }
  if ($name -notmatch '^[A-Za-z0-9_.-]{1,200}$') { throw "SOVEREIGNTY_DATABASE_NAME_INVALID" }
  $root = Join-Path (Sovereignty-Root) "database"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $path = [IO.Path]::GetFullPath((Join-Path $root ($name + ".clixml")))
  $base = [IO.Path]::GetFullPath($root).TrimEnd("\")
  if (-not $path.StartsWith($base + "\",[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_DATABASE_OUTSIDE_SANDBOX" }
  return $path
}

function ConvertTo-SovereigntyHashtable($value) {
  if ($null -eq $value) { return $null }
  if ($value -is [Collections.IDictionary]) {
    $h = @{}
    foreach ($k in $value.Keys) { $h[[string]$k] = ConvertTo-SovereigntyHashtable $value[$k] }
    return $h
  }
  if ($value -is [Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $value.PSObject.Properties) { $h[$p.Name] = ConvertTo-SovereigntyHashtable $p.Value }
    return $h
  }
  if (($value -is [Collections.IEnumerable]) -and -not ($value -is [string])) {
    $arr = @()
    foreach ($item in $value) { $arr += ,(ConvertTo-SovereigntyHashtable $item) }
    return $arr
  }
  return $value
}

function New-SovereigntyDbState {
  return @{ tables=@{} }
}

function Load-SovereigntyDbState([string]$database) {
  $path = Sovereignty-DatabasePath $database
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return New-SovereigntyDbState }
  try {
    $state = Import-Clixml -LiteralPath $path
    $state = ConvertTo-SovereigntyHashtable $state
    if ($null -eq $state.tables) { $state.tables=@{} }
    return $state
  } catch {
    throw "SOVEREIGNTY_DATABASE_STATE_CORRUPT"
  }
}

function Save-SovereigntyDbState([string]$database,$state) {
  $path = Sovereignty-DatabasePath $database
  $tmp = $path + "." + [guid]::NewGuid().ToString("N") + ".tmp"
  try {
    $state | Export-Clixml -LiteralPath $tmp -Depth 20
    Move-Item -LiteralPath $tmp -Destination $path -Force
  } finally {
    try { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force } } catch {}
  }
}

function Clone-SovereigntyDbState($state) {
  $serialized = [Management.Automation.PSSerializer]::Serialize($state,20)
  return ConvertTo-SovereigntyHashtable ([Management.Automation.PSSerializer]::Deserialize($serialized))
}

function Require-SovereigntyDbTx([string]$tx) {
  $id = ([string]$tx).Trim()
  if ($id -notmatch '^tx-[A-Fa-f0-9]{32}$') { throw "SOVEREIGNTY_DATABASE_TX_INVALID" }
  if (-not $script:SovereigntyDbTransactions.ContainsKey($id)) { throw "SOVEREIGNTY_DATABASE_TX_NOT_FOUND" }
  return $script:SovereigntyDbTransactions[$id]
}

function Assert-SovereigntySqlIdentifier([string]$value) {
  $v = ([string]$value).Trim()
  if ($v -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,127}$') { throw "SOVEREIGNTY_DATABASE_IDENTIFIER_INVALID" }
  return $v
}


function Sovereignty-CiRoot {
  $root = Join-Path (Sovereignty-Root) "ci"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  [IO.Directory]::CreateDirectory((Join-Path $root "runs")) | Out-Null
  return $root
}

function Resolve-SovereigntyCiRunPath([string]$runId) {
  $id = ([string]$runId).Trim()
  if ($id -notmatch '^ci-[A-Fa-f0-9]{32}$') { throw "SOVEREIGNTY_CI_RUN_ID_INVALID" }
  return Join-Path (Join-Path (Sovereignty-CiRoot) "runs") ($id + ".clixml")
}

function Save-SovereigntyCiRun($run) {
  $path = Resolve-SovereigntyCiRunPath ([string]$run.run_id)
  $run | Export-Clixml -LiteralPath $path -Depth 12
}

function Load-SovereigntyCiRun([string]$runId) {
  $path = Resolve-SovereigntyCiRunPath $runId
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "SOVEREIGNTY_CI_RUN_NOT_FOUND" }
  return ConvertTo-SovereigntyHashtable (Import-Clixml -LiteralPath $path)
}

function Read-SovereigntySourceProvenance([string]$repository) {
  $repo = Require-SovereigntyGitRepo $repository
  $path = Join-Path $repo ".mel-source-provenance.json"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "SOVEREIGNTY_CI_PROVENANCE_REQUIRED" }
  try { $p = Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json } catch { throw "SOVEREIGNTY_CI_PROVENANCE_INVALID" }
  $sha = ([string]$p.source_sha).Trim().ToLowerInvariant()
  if ($sha -notmatch '^[0-9a-f]{40}$') { throw "SOVEREIGNTY_CI_PROVENANCE_INVALID" }
  if ($p.external_reconstruction_verified -ne $true) { throw "SOVEREIGNTY_CI_EXTERNAL_RECONSTRUCTION_REQUIRED" }
  return @{ repo=$repo; source_sha=$sha }
}

function Invoke-SovereigntyNodeCheck([string]$repo,[string]$relativePath,[int]$timeoutMs=120000) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($null -eq $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
  if ($null -eq $node) { throw "SOVEREIGNTY_CI_NODE_NOT_INSTALLED" }

  $safe = Resolve-SovereigntyRelativePath $repo $relativePath
  if (-not (Test-Path -LiteralPath $safe.full -PathType Leaf)) { throw "SOVEREIGNTY_CI_TARGET_NOT_FOUND" }

  $root = Sovereignty-CiRoot
  $stdout = Join-Path $root ("stdout-" + [guid]::NewGuid().ToString("N") + ".txt")
  $stderr = Join-Path $root ("stderr-" + [guid]::NewGuid().ToString("N") + ".txt")
  try {
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $node.Source
    $psi.Arguments = '--check "' + $safe.full.Replace('"','') + '"'
    $psi.WorkingDirectory = $repo
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $proc = New-Object Diagnostics.Process
    $proc.StartInfo = $psi
    if (-not $proc.Start()) { throw "SOVEREIGNTY_CI_PROCESS_START_FAILED" }
    if (-not $proc.WaitForExit($timeoutMs)) {
      try { $proc.Kill() } catch {}
      throw "SOVEREIGNTY_CI_TIMEOUT"
    }
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    if ($out.Length -gt 4000) { $out=$out.Substring(0,4000) }
    if ($err.Length -gt 4000) { $err=$err.Substring(0,4000) }
    return @{ exit_code=$proc.ExitCode; stdout=$out; stderr=$err; node_version=(& $node.Source --version 2>$null) }
  } finally {
    try { if (Test-Path -LiteralPath $stdout) { Remove-Item -LiteralPath $stdout -Force } } catch {}
    try { if (Test-Path -LiteralPath $stderr) { Remove-Item -LiteralPath $stderr -Force } } catch {}
  }
}

function Perform-SovereigntyCi([string]$operation,$payload) {
  $repository = [string]$payload.repository
  switch ($operation) {
    "health" {
      $node = Get-Command node.exe -ErrorAction SilentlyContinue
      if ($null -eq $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
      if ($null -eq $node) { throw "SOVEREIGNTY_CI_NODE_NOT_INSTALLED" }
      [void](Read-SovereigntySourceProvenance $repository)
      return @{ action="sovereignty.ci.health"; node_version=[string](& $node.Source --version 2>$null); backend="local-bounded-node-ci" }
    }
    "dispatch" {
      $pipeline = ([string]$payload.pipeline).Trim()
      if ($pipeline -ne "sovereignty-smoke") { throw "SOVEREIGNTY_CI_PIPELINE_NOT_ALLOWED" }
      $sourceSha = ([string]$payload.source_sha).Trim().ToLowerInvariant()
      if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw "SOVEREIGNTY_CI_SOURCE_SHA_INVALID" }

      $prov = Read-SovereigntySourceProvenance $repository
      if ($prov.source_sha -ne $sourceSha) { throw "SOVEREIGNTY_CI_SOURCE_SHA_MISMATCH" }

      $runId = "ci-" + [guid]::NewGuid().ToString("N")
      $startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $check = $null
      $status = "FAILED"
      try {
        $check = Invoke-SovereigntyNodeCheck $prov.repo "src/index.js"
        if ([int]$check.exit_code -eq 0) { $status = "SUCCESS" }
      } catch {
        $check = @{ exit_code=-1; stdout=""; stderr=[string]$_.Exception.Message; node_version=$null }
      }

      $artifact = @{
        id="proof"
        name="proof.json"
        pipeline=$pipeline
        source_sha=$sourceSha
        status=$status
        exit_code=[int]$check.exit_code
        node_version=[string]$check.node_version
      }
      $run = @{
        run_id=$runId
        repository=$repository
        source_sha=$sourceSha
        pipeline=$pipeline
        mode=([string]$payload.mode).Trim()
        status=$status
        started_at=$startedAt
        finished_at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        artifact=$artifact
        stdout=[string]$check.stdout
        stderr=[string]$check.stderr
        cancelled=$false
      }
      Save-SovereigntyCiRun $run
      return @{ action="sovereignty.ci.dispatch"; run_id=$runId; status=$status }
    }
    "get_run" {
      $run = Load-SovereigntyCiRun ([string]$payload.run_id)
      return @{ action="sovereignty.ci.get_run"; run_id=$run.run_id; source_sha=$run.source_sha; status=$run.status }
    }
    "get_artifacts" {
      $run = Load-SovereigntyCiRun ([string]$payload.run_id)
      return @{ action="sovereignty.ci.get_artifacts"; artifacts=@($run.artifact) }
    }
    "cancel_run" {
      $run = Load-SovereigntyCiRun ([string]$payload.run_id)
      $run.cancelled=$true
      if ([string]$run.status -notin @("SUCCESS","FAILED","COMPLETED")) { $run.status="CANCELLED" }
      Save-SovereigntyCiRun $run
      return @{ action="sovereignty.ci.cancel_run"; run_id=$run.run_id; cancelled=$true }
    }
    default { throw "SOVEREIGNTY_CI_OPERATION_NOT_SUPPORTED" }
  }
}

function Perform-SovereigntyDatabase([string]$operation,$payload) {
  $database = [string]$payload.database
  switch ($operation) {
    "health" {
      $path = Sovereignty-DatabasePath $database
      [void](Load-SovereigntyDbState $database)
      return @{ action="sovereignty.database.health"; engine="local-transactional-store"; database_ready=$true; path=[IO.Path]::GetFileName($path) }
    }
    "begin" {
      $state = Load-SovereigntyDbState $database
      $tx = "tx-" + [guid]::NewGuid().ToString("N")
      $script:SovereigntyDbTransactions[$tx] = @{ database=$database; state=(Clone-SovereigntyDbState $state) }
      return @{ action="sovereignty.database.begin"; tx=$tx }
    }
    "commit" {
      $entry = Require-SovereigntyDbTx ([string]$payload.tx)
      Save-SovereigntyDbState ([string]$entry.database) $entry.state
      [void]$script:SovereigntyDbTransactions.Remove([string]$payload.tx)
      return @{ action="sovereignty.database.commit"; committed=$true }
    }
    "rollback" {
      [void](Require-SovereigntyDbTx ([string]$payload.tx))
      [void]$script:SovereigntyDbTransactions.Remove([string]$payload.tx)
      return @{ action="sovereignty.database.rollback"; rolled_back=$true }
    }
    "execute" {
      $entry = Require-SovereigntyDbTx ([string]$payload.tx)
      $sql = ([string]$payload.sql).Trim()
      $params = @($payload.params)

      if ($sql -match '^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.+)\)\s*$') {
        $table = Assert-SovereigntySqlIdentifier $matches[1]
        if (-not $entry.state.tables.ContainsKey($table)) {
          $defs = @($matches[2] -split ',')
          $columns = @()
          foreach ($def in $defs) {
            $name = ([string]$def).Trim().Split(' ')[0]
            $columns += (Assert-SovereigntySqlIdentifier $name)
          }
          $entry.state.tables[$table] = @{ columns=$columns; rows=@() }
        }
        return @{ action="sovereignty.database.execute"; changes=0 }
      }

      if ($sql -match '^INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s+VALUES\s*\(([^)]+)\)\s*$') {
        $table = Assert-SovereigntySqlIdentifier $matches[1]
        if (-not $entry.state.tables.ContainsKey($table)) { throw "SOVEREIGNTY_DATABASE_TABLE_NOT_FOUND" }
        $columns = @($matches[2] -split ',' | ForEach-Object { Assert-SovereigntySqlIdentifier $_.Trim() })
        if ($columns.Count -ne $params.Count) { throw "SOVEREIGNTY_DATABASE_PARAM_COUNT_MISMATCH" }
        $row = @{}
        for ($i=0; $i -lt $columns.Count; $i++) { $row[$columns[$i]] = $params[$i] }

        if ($row.ContainsKey("id")) {
          foreach ($existing in @($entry.state.tables[$table].rows)) {
            if ([string]$existing.id -eq [string]$row.id) { throw "SOVEREIGNTY_DATABASE_PRIMARY_KEY_CONFLICT" }
          }
        }
        $entry.state.tables[$table].rows += ,$row
        return @{ action="sovereignty.database.execute"; changes=1 }
      }

      throw "SOVEREIGNTY_DATABASE_SQL_NOT_SUPPORTED"
    }
    "query" {
      $entry = Require-SovereigntyDbTx ([string]$payload.tx)
      $sql = ([string]$payload.sql).Trim()
      $params = @($payload.params)

      if ($sql -notmatch '^SELECT\s+([A-Za-z0-9_,\s*]+)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WHERE\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\?)?\s*$') {
        throw "SOVEREIGNTY_DATABASE_QUERY_NOT_SUPPORTED"
      }

      $selected = @($matches[1] -split ',' | ForEach-Object { $_.Trim() })
      $table = Assert-SovereigntySqlIdentifier $matches[2]
      $whereColumn = ([string]$matches[3]).Trim()
      if (-not $entry.state.tables.ContainsKey($table)) { return @{ action="sovereignty.database.query"; rows=@() } }

      $rows = @()
      foreach ($raw in @($entry.state.tables[$table].rows)) {
        $row = ConvertTo-SovereigntyHashtable $raw
        if (-not [string]::IsNullOrWhiteSpace($whereColumn)) {
          if ($params.Count -lt 1) { throw "SOVEREIGNTY_DATABASE_PARAM_COUNT_MISMATCH" }
          if ([string]$row[$whereColumn] -ne [string]$params[0]) { continue }
        }
        if ($selected.Count -eq 1 -and $selected[0] -eq "*") {
          $rows += ,$row
        } else {
          $projected = @{}
          foreach ($colRaw in $selected) {
            $col = Assert-SovereigntySqlIdentifier $colRaw
            $projected[$col] = $row[$col]
          }
          $rows += ,$projected
        }
      }
      return @{ action="sovereignty.database.query"; rows=$rows }
    }
    "export_logical" {
      $entry = Require-SovereigntyDbTx ([string]$payload.tx)
      $tables = @($payload.tables)
      $snapshot = @{ schema="mel.local-database-snapshot/v1"; tables=@{} }
      foreach ($tableRaw in $tables) {
        $table = Assert-SovereigntySqlIdentifier ([string]$tableRaw)
        if ($entry.state.tables.ContainsKey($table)) {
          $snapshot.tables[$table] = Clone-SovereigntyDbState $entry.state.tables[$table]
        }
      }
      return @{ action="sovereignty.database.export_logical"; snapshot=$snapshot }
    }
    "import_logical" {
      $entry = Require-SovereigntyDbTx ([string]$payload.tx)
      $snapshot = ConvertTo-SovereigntyHashtable $payload.snapshot
      if ([string]$snapshot.schema -ne "mel.local-database-snapshot/v1") { throw "SOVEREIGNTY_DATABASE_SNAPSHOT_INVALID" }
      if ($null -eq $snapshot.tables) { throw "SOVEREIGNTY_DATABASE_SNAPSHOT_INVALID" }
      foreach ($tableRaw in $snapshot.tables.Keys) {
        $table = Assert-SovereigntySqlIdentifier ([string]$tableRaw)
        $entry.state.tables[$table] = Clone-SovereigntyDbState $snapshot.tables[$table]
      }
      return @{ action="sovereignty.database.import_logical"; imported=$true }
    }
    default { throw "SOVEREIGNTY_DATABASE_OPERATION_NOT_SUPPORTED" }
  }
}

function Perform-SovereigntyStorage([string]$operation,$payload) {
  $namespace = [string]$payload.namespace
  switch ($operation) {
    "health" {
      $root = Sovereignty-StorageRoot $namespace
      return @{ action="sovereignty.storage.health"; backend="local-files"; root_ready=(Test-Path -LiteralPath $root) }
    }
    "put" {
      $safe = Resolve-SovereigntyStorageKey $namespace ([string]$payload.key)
      $parent = Split-Path -Parent $safe.full
      if (-not [string]::IsNullOrWhiteSpace($parent)) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
      try { $bytes = [Convert]::FromBase64String([string]$payload.bytes_base64) } catch { throw "SOVEREIGNTY_STORAGE_BASE64_INVALID" }
      [IO.File]::WriteAllBytes($safe.full,$bytes)
      $etag = (Get-FileHash -LiteralPath $safe.full -Algorithm SHA256).Hash.ToLowerInvariant()
      return @{ action="sovereignty.storage.put"; key=$safe.relative; etag=$etag }
    }
    "get" {
      $safe = Resolve-SovereigntyStorageKey $namespace ([string]$payload.key)
      if (-not (Test-Path -LiteralPath $safe.full -PathType Leaf)) {
        return @{ action="sovereignty.storage.get"; key=$safe.relative; found=$false }
      }
      $bytes = [IO.File]::ReadAllBytes($safe.full)
      return @{ action="sovereignty.storage.get"; key=$safe.relative; found=$true; bytes_base64=[Convert]::ToBase64String($bytes) }
    }
    "list" {
      $root = Sovereignty-StorageRoot $namespace
      $prefix = ([string]$payload.prefix).Replace("\","/")
      $keys = @()
      Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length).TrimStart("\").Replace("\","/")
        if ([string]::IsNullOrEmpty($prefix) -or $rel.StartsWith($prefix,[StringComparison]::Ordinal)) { $keys += $rel }
      }
      return @{ action="sovereignty.storage.list"; keys=@($keys | Select-Object -First 1000) }
    }
    "delete" {
      $safe = Resolve-SovereigntyStorageKey $namespace ([string]$payload.key)
      if (Test-Path -LiteralPath $safe.full -PathType Leaf) { Remove-Item -LiteralPath $safe.full -Force }
      return @{ action="sovereignty.storage.delete"; key=$safe.relative; deleted=$true }
    }
    default { throw "SOVEREIGNTY_STORAGE_OPERATION_NOT_SUPPORTED" }
  }
}

function Perform-SovereigntySourceControl([string]$operation,$payload) {
  $repository = [string]$payload.repository
  if ($operation -eq "seed") { return Seed-SovereigntyGitRepo $repository ([string]$payload.expected_sha) }

  $repo = Require-SovereigntyGitRepo $repository
  switch ($operation) {
    "health" {
      $version = (& git.exe --version 2>$null)
      return @{ action="sovereignty.source_control.health"; repository=$repository; git_version=[string]$version; repository_ready=$true }
    }
    "read_ref" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $sha = Invoke-SovereigntyGit $repo @("rev-parse",($ref + "^{commit}"))
      return @{ action="sovereignty.source_control.read_ref"; sha=$sha }
    }
    "read_file" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $safe = Resolve-SovereigntyRelativePath $repo ([string]$payload.path)
      $content = Invoke-SovereigntyGit $repo @("show",($ref + ":" + $safe.relative))
      return @{ action="sovereignty.source_control.read_file"; content=$content; encoding="utf-8" }
    }
    "create_ref" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $sha = ([string]$payload.sha).Trim()
      if (-not (Test-SovereigntyHex $sha 40)) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("branch","-f",$ref,$sha))
      return @{ action="sovereignty.source_control.create_ref"; ref=$ref; sha=$sha }
    }
    "update_ref" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $sha = ([string]$payload.sha).Trim()
      if (-not (Test-SovereigntyHex $sha 40)) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("branch","-f",$ref,$sha))
      return @{ action="sovereignty.source_control.update_ref"; ref=$ref; sha=$sha; force=($payload.force -eq $true) }
    }
    "compare_refs" {
      $base = Assert-SovereigntyGitRef ([string]$payload.base)
      $head = Assert-SovereigntyGitRef ([string]$payload.head)
      $counts = Invoke-SovereigntyGit $repo @("rev-list","--left-right","--count",($base + "..." + $head))
      $parts = @($counts -split '\s+' | Where-Object { $_ -ne "" })
      if ($parts.Count -lt 2) { throw "SOVEREIGNTY_GIT_COMPARE_INVALID" }
      return @{ action="sovereignty.source_control.compare_refs"; behind_by=[int]$parts[0]; ahead_by=[int]$parts[1] }
    }
    "write_file" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $safeRef = $ref.Replace("/","-")
      $worktree = Join-Path (Join-Path (Sovereignty-Root) "worktrees") ($safeRef + "-" + [guid]::NewGuid().ToString("N"))
      try {
        [void](Invoke-SovereigntyGit $repo @("worktree","add","--detach",$worktree,$ref))
        $safe = Resolve-SovereigntyRelativePath $worktree ([string]$payload.path)
        $parent = Split-Path -Parent $safe.full
        if (-not [string]::IsNullOrWhiteSpace($parent)) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
        [IO.File]::WriteAllText($safe.full,[string]$payload.content,[Text.UTF8Encoding]::new($false))
        [void](Invoke-SovereigntyGit $worktree @("add","-A"))
        $message = ([string]$payload.message).Trim()
        if ([string]::IsNullOrWhiteSpace($message)) { $message = "MEL sovereignty proof" }
        [void](Invoke-SovereigntyGit $worktree @("-c","user.name=MEL Sovereignty","-c","user.email=mel-sovereignty@localhost","commit","-m",$message))
        $candidate = Invoke-SovereigntyGit $worktree @("rev-parse","HEAD")
        [void](Invoke-SovereigntyGit $repo @("update-ref",("refs/heads/" + $ref),$candidate))
        return @{ action="sovereignty.source_control.write_file"; sha=$candidate; ref=$ref; path=$safe.relative }
      } finally {
        try { [void](Invoke-SovereigntyGit $repo @("worktree","remove","--force",$worktree)) } catch {}
        try { if (Test-Path -LiteralPath $worktree) { Remove-Item -LiteralPath $worktree -Recurse -Force } } catch {}
      }
    }
    default { throw "SOVEREIGNTY_SOURCE_CONTROL_OPERATION_NOT_SUPPORTED" }
  }
}

function Sovereignty-ObservabilityRoot {
  $root = Join-Path (Sovereignty-Root) "observability"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  return [IO.Path]::GetFullPath($root)
}

function Read-SovereigntyJsonLines([string]$path) {
  $rows = @()
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $rows }
  foreach ($line in @(Get-Content -LiteralPath $path -Encoding UTF8 -ErrorAction SilentlyContinue)) {
    if ([string]::IsNullOrWhiteSpace([string]$line)) { continue }
    try { $rows += ,($line | ConvertFrom-Json) } catch {}
  }
  return $rows
}

function Write-SovereigntyJsonLines([string]$path,$rows) {
  $lines = @()
  foreach ($row in @($rows)) { $lines += ,($row | ConvertTo-Json -Compress -Depth 8) }
  [IO.File]::WriteAllLines($path,[string[]]$lines,[Text.UTF8Encoding]::new($false))
}

function Append-SovereigntyJsonLine([string]$path,$row) {
  $line = $row | ConvertTo-Json -Compress -Depth 8
  [IO.File]::AppendAllText($path,$line + [Environment]::NewLine,[Text.UTF8Encoding]::new($false))
}

function Perform-SovereigntyObservability([string]$operation,$payload) {
  $root = Sovereignty-ObservabilityRoot
  $logsPath = Join-Path $root "logs.jsonl"
  $metricsPath = Join-Path $root "metrics.jsonl"
  switch ($operation) {
    "health" {
      return @{ action="sovereignty.observability.health"; backend="local-jsonl"; root_ready=(Test-Path -LiteralPath $root) }
    }
    "emit_log" {
      $row = @{
        trace_id=[string]$payload.trace_id
        level=[string]$payload.level
        message=([string]$payload.message).Substring(0,[Math]::Min(4000,([string]$payload.message).Length))
        recorded_at=(Get-Date).ToUniversalTime().ToString("o")
      }
      Append-SovereigntyJsonLine $logsPath $row
      return @{ action="sovereignty.observability.emit_log"; stored=$true; trace_id=$row.trace_id }
    }
    "emit_metric" {
      $row = @{
        trace_id=[string]$payload.trace_id
        name=[string]$payload.name
        value=[double]$payload.value
        tags=$payload.tags
        recorded_at=(Get-Date).ToUniversalTime().ToString("o")
      }
      Append-SovereigntyJsonLine $metricsPath $row
      return @{ action="sovereignty.observability.emit_metric"; stored=$true; trace_id=$row.trace_id; name=$row.name }
    }
    "query_logs" {
      $trace = [string]$payload.trace_id
      $limit = [Math]::Max(1,[Math]::Min(100,[int]$payload.limit))
      $rows = @(Read-SovereigntyJsonLines $logsPath | Where-Object { [string]$_.trace_id -eq $trace } | Select-Object -Last $limit)
      return @{ action="sovereignty.observability.query_logs"; rows=$rows }
    }
    "query_metrics" {
      $trace = [string]$payload.trace_id
      $name = [string]$payload.name
      $rows = @(Read-SovereigntyJsonLines $metricsPath | Where-Object {
        ([string]$_.trace_id -eq $trace) -and ([string]::IsNullOrWhiteSpace($name) -or [string]$_.name -eq $name)
      })
      return @{ action="sovereignty.observability.query_metrics"; rows=$rows }
    }
    "delete_test_data" {
      $trace = [string]$payload.trace_id
      $logs = @(Read-SovereigntyJsonLines $logsPath | Where-Object { [string]$_.trace_id -ne $trace })
      $metrics = @(Read-SovereigntyJsonLines $metricsPath | Where-Object { [string]$_.trace_id -ne $trace })
      Write-SovereigntyJsonLines $logsPath $logs
      Write-SovereigntyJsonLines $metricsPath $metrics
      return @{ action="sovereignty.observability.delete_test_data"; deleted=$true; trace_id=$trace }
    }
    default { throw "SOVEREIGNTY_OBSERVABILITY_OPERATION_NOT_SUPPORTED" }
  }
}

function Sovereignty-SchedulerRoot {
  $root = Join-Path (Sovereignty-Root) "scheduler"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  return [IO.Path]::GetFullPath($root)
}

function Sovereignty-SchedulerStatePath {
  return Join-Path (Sovereignty-SchedulerRoot) "schedules.json"
}

function Read-SovereigntySchedulerState {
  $path = Sovereignty-SchedulerStatePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @() }
  try {
    $value = Get-Content -Raw -Encoding UTF8 -LiteralPath $path | ConvertFrom-Json
    return @($value)
  } catch { return @() }
}

function Write-SovereigntySchedulerState($rows) {
  $path = Sovereignty-SchedulerStatePath
  $json = @($rows) | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($path,$json,[Text.UTF8Encoding]::new($false))
}

function Require-SovereigntyScheduler {
  foreach ($name in @("Register-ScheduledTask","Get-ScheduledTask","Disable-ScheduledTask","Enable-ScheduledTask","Start-ScheduledTask","Unregister-ScheduledTask")) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "SOVEREIGNTY_SCHEDULER_UNAVAILABLE" }
  }
}

function Perform-SovereigntyScheduler([string]$operation,$payload) {
  Require-SovereigntyScheduler
  switch ($operation) {
    "health" {
      return @{ action="sovereignty.scheduler.health"; backend="windows-task-scheduler"; available=$true }
    }
    "create" {
      $id = "sched-" + [guid]::NewGuid().ToString("N")
      $taskName = "MEL-Sovereignty-" + $id.Substring(6,16)
      $externalId = [string]$payload.external_id
      $exe = Join-Path $env:SystemRoot "System32\cmd.exe"
      $taskAction = New-ScheduledTaskAction -Execute $exe -Argument "/c exit 0"
      $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddDays(30)
      [void](Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Description ("MEL sovereignty " + $externalId) -Force)
      $rows = @(Read-SovereigntySchedulerState)
      $rows += ,@{ id=$id; external_id=$externalId; task_name=$taskName; schedule=[string]$payload.schedule; enabled=$true }
      Write-SovereigntySchedulerState $rows
      return @{ action="sovereignty.scheduler.create"; id=$id }
    }
    "list" {
      $externalId = [string]$payload.external_id
      $rows = @(Read-SovereigntySchedulerState | Where-Object {
        [string]::IsNullOrWhiteSpace($externalId) -or [string]$_.external_id -eq $externalId
      })
      return @{ action="sovereignty.scheduler.list"; schedules=$rows }
    }
    "pause" {
      $id = [string]$payload.id
      $rows = @(Read-SovereigntySchedulerState)
      $row = $rows | Where-Object { [string]$_.id -eq $id } | Select-Object -First 1
      if ($null -eq $row) { throw "SOVEREIGNTY_SCHEDULER_NOT_FOUND" }
      [void](Disable-ScheduledTask -TaskName ([string]$row.task_name))
      $row.enabled=$false
      Write-SovereigntySchedulerState $rows
      return @{ action="sovereignty.scheduler.pause"; id=$id; paused=$true }
    }
    "resume" {
      $id = [string]$payload.id
      $rows = @(Read-SovereigntySchedulerState)
      $row = $rows | Where-Object { [string]$_.id -eq $id } | Select-Object -First 1
      if ($null -eq $row) { throw "SOVEREIGNTY_SCHEDULER_NOT_FOUND" }
      [void](Enable-ScheduledTask -TaskName ([string]$row.task_name))
      $row.enabled=$true
      Write-SovereigntySchedulerState $rows
      return @{ action="sovereignty.scheduler.resume"; id=$id; resumed=$true }
    }
    "trigger_now" {
      $id = [string]$payload.id
      $rows = @(Read-SovereigntySchedulerState)
      $row = $rows | Where-Object { [string]$_.id -eq $id } | Select-Object -First 1
      if ($null -eq $row) { throw "SOVEREIGNTY_SCHEDULER_NOT_FOUND" }
      [void](Start-ScheduledTask -TaskName ([string]$row.task_name))
      return @{ action="sovereignty.scheduler.trigger_now"; id=$id; run_id=("local-" + [guid]::NewGuid().ToString("N")) }
    }
    "delete" {
      $id = [string]$payload.id
      $rows = @(Read-SovereigntySchedulerState)
      $row = $rows | Where-Object { [string]$_.id -eq $id } | Select-Object -First 1
      if ($null -eq $row) { throw "SOVEREIGNTY_SCHEDULER_NOT_FOUND" }
      [void](Unregister-ScheduledTask -TaskName ([string]$row.task_name) -Confirm:$false)
      $remaining = @($rows | Where-Object { [string]$_.id -ne $id })
      Write-SovereigntySchedulerState $remaining
      return @{ action="sovereignty.scheduler.delete"; id=$id; deleted=$true }
    }
    default { throw "SOVEREIGNTY_SCHEDULER_OPERATION_NOT_SUPPORTED" }
  }
}

function Sovereignty-SecretsRoot {
  $root = Join-Path (Sovereignty-Root) "secrets"
  [IO.Directory]::CreateDirectory($root) | Out-Null
  return [IO.Path]::GetFullPath($root)
}

function Assert-SovereigntySecretRef([string]$ref) {
  $value = ([string]$ref).Trim()
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -gt 180) { throw "SOVEREIGNTY_SECRET_REF_INVALID" }
  foreach ($ch in $value.ToCharArray()) {
    if (-not ([char]::IsLetterOrDigit($ch) -or $ch -eq "_" -or $ch -eq "-")) { throw "SOVEREIGNTY_SECRET_REF_INVALID" }
  }
  return $value
}

function Sovereignty-SecretPath([string]$ref) {
  $safe = Assert-SovereigntySecretRef $ref
  return Join-Path (Sovereignty-SecretsRoot) ($safe + ".bin")
}

function Write-SovereigntySecretRecord($record) {
  $json = $record | ConvertTo-Json -Compress -Depth 8
  $plain = [Text.Encoding]::UTF8.GetBytes($json)
  $cipher = [Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes((Sovereignty-SecretPath ([string]$record.ref)),$cipher)
}

function Read-SovereigntySecretRecord([string]$ref) {
  $path = Sovereignty-SecretPath $ref
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "SOVEREIGNTY_SECRET_REF_NOT_FOUND" }
  $cipher = [IO.File]::ReadAllBytes($path)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  return ([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json)
}

function Perform-SovereigntySecrets([string]$operation,$payload) {
  switch ($operation) {
    "health" {
      $probe = [Text.Encoding]::UTF8.GetBytes("MEL")
      $cipher = [Security.Cryptography.ProtectedData]::Protect($probe,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      $round = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
      return @{ action="sovereignty.secrets.health"; backend="windows-dpapi-metadata-vault"; dpapi_ready=($round.Length -eq $probe.Length) }
    }
    "put_ref" {
      $ref = Assert-SovereigntySecretRef ([string]$payload.ref)
      $record = @{ ref=$ref; version=1; metadata=$payload.metadata; updated_at=(Get-Date).ToUniversalTime().ToString("o") }
      Write-SovereigntySecretRecord $record
      return @{ action="sovereignty.secrets.put_ref"; ref=$ref; version=1 }
    }
    "get_ref" {
      $record = Read-SovereigntySecretRecord ([string]$payload.ref)
      return @{ action="sovereignty.secrets.get_ref"; ref=[string]$record.ref; version=[int]$record.version; metadata=$record.metadata }
    }
    "list_refs" {
      $prefix = [string]$payload.prefix
      $rows = @()
      foreach ($file in @(Get-ChildItem -LiteralPath (Sovereignty-SecretsRoot) -Filter "*.bin" -File -ErrorAction SilentlyContinue)) {
        $ref = [IO.Path]::GetFileNameWithoutExtension($file.Name)
        if (-not [string]::IsNullOrWhiteSpace($prefix) -and -not $ref.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { continue }
        try {
          $record = Read-SovereigntySecretRecord $ref
          $rows += ,@{ ref=[string]$record.ref; version=[int]$record.version; metadata=$record.metadata }
        } catch {}
      }
      return @{ action="sovereignty.secrets.list_refs"; refs=$rows }
    }
    "rotate_ref" {
      $record = Read-SovereigntySecretRecord ([string]$payload.ref)
      $record.version = [int]$record.version + 1
      $record.updated_at = (Get-Date).ToUniversalTime().ToString("o")
      Write-SovereigntySecretRecord $record
      return @{ action="sovereignty.secrets.rotate_ref"; ref=[string]$record.ref; version=[int]$record.version }
    }
    "delete_ref" {
      $ref = Assert-SovereigntySecretRef ([string]$payload.ref)
      $path = Sovereignty-SecretPath $ref
      if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
      return @{ action="sovereignty.secrets.delete_ref"; ref=$ref; deleted=$true }
    }
    default { throw "SOVEREIGNTY_SECRETS_OPERATION_NOT_SUPPORTED" }
  }
}


function Assert-SovereigntyRuntimeName([string]$value,[string]$code) {
  $name = ([string]$value).Trim()
  if ($name -notmatch '^[A-Za-z0-9_.-]{1,180}$') { throw $code }
  return $name
}

function Sovereignty-RuntimeServiceRoot([string]$service) {
  $name = Assert-SovereigntyRuntimeName $service "SOVEREIGNTY_RUNTIME_SERVICE_INVALID"
  $base = Join-Path (Sovereignty-Root) "runtime"
  [IO.Directory]::CreateDirectory($base) | Out-Null
  $root = [IO.Path]::GetFullPath((Join-Path $base $name))
  $baseFull = [IO.Path]::GetFullPath($base).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not $root.StartsWith($baseFull + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_RUNTIME_PATH_INVALID" }
  [IO.Directory]::CreateDirectory($root) | Out-Null
  return $root
}

function Read-SovereigntyRuntimeJson([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  try { return Get-Content -Raw -Encoding UTF8 -LiteralPath $path | ConvertFrom-Json }
  catch { throw "SOVEREIGNTY_RUNTIME_STATE_CORRUPT" }
}

function Write-SovereigntyRuntimeJson([string]$path,$value) {
  [IO.File]::WriteAllText($path,($value | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
}

function Sovereignty-RuntimeCandidatePath([string]$root,[string]$candidateId) {
  $id = Assert-SovereigntyRuntimeName $candidateId "SOVEREIGNTY_RUNTIME_CANDIDATE_INVALID"
  return Join-Path $root ("candidate-" + $id + ".json")
}

function Perform-SovereigntyRuntime([string]$operation,$payload) {
  $root = Sovereignty-RuntimeServiceRoot ([string]$payload.service)
  $activePath = Join-Path $root "active.json"
  switch ($operation) {
    "health" {
      return @{ action="sovereignty.runtime.health"; runtime="windows-powershell-local"; powershell_version=[string]$PSVersionTable.PSVersion; root_ready=$true }
    }
    "prepare" {
      $sha = ([string]$payload.source_sha).Trim().ToLowerInvariant()
      if (-not (Test-SovereigntyHex $sha 40)) { throw "SOVEREIGNTY_RUNTIME_SOURCE_SHA_INVALID" }
      $repository = ([string]$payload.artifact.ref).Trim()
      if ([string]::IsNullOrWhiteSpace($repository)) { $repository = "meliturgos-cloudflare" }
      $provenance = Read-SovereigntySourceProvenance $repository
      if ([string]$provenance.source_sha -ne $sha) { throw "SOVEREIGNTY_RUNTIME_SOURCE_SHA_MISMATCH" }
      $planId = "plan-" + [guid]::NewGuid().ToString("N")
      Write-SovereigntyRuntimeJson (Join-Path $root ($planId + ".json")) @{ plan_id=$planId; source_sha=$sha; repository=$repository }
      return @{ action="sovereignty.runtime.prepare"; plan_id=$planId; source_sha=$sha }
    }
    "deploy_candidate" {
      $sha = ([string]$payload.source_sha).Trim().ToLowerInvariant()
      $planId = Assert-SovereigntyRuntimeName ([string]$payload.prepared.plan_id) "SOVEREIGNTY_RUNTIME_PLAN_INVALID"
      $plan = Read-SovereigntyRuntimeJson (Join-Path $root ($planId + ".json"))
      if ($null -eq $plan) { throw "SOVEREIGNTY_RUNTIME_PLAN_NOT_FOUND" }
      if ([string]$plan.source_sha -ne $sha) { throw "SOVEREIGNTY_RUNTIME_PLAN_SHA_MISMATCH" }
      $prior = Read-SovereigntyRuntimeJson $activePath
      $priorId = $null
      if ($null -ne $prior) { $priorId = [string]$prior.candidate_id }
      $candidateId = "cand-" + [guid]::NewGuid().ToString("N")
      Write-SovereigntyRuntimeJson (Sovereignty-RuntimeCandidatePath $root $candidateId) @{ candidate_id=$candidateId; source_sha=$sha; repository=[string]$plan.repository; prior_active_id=$priorId; status="CANDIDATE" }
      return @{ action="sovereignty.runtime.deploy_candidate"; candidate_id=$candidateId; source_sha=$sha }
    }
    "smoke" {
      $candidateId = Assert-SovereigntyRuntimeName ([string]$payload.candidate_id) "SOVEREIGNTY_RUNTIME_CANDIDATE_INVALID"
      $sha = ([string]$payload.source_sha).Trim().ToLowerInvariant()
      $candidate = Read-SovereigntyRuntimeJson (Sovereignty-RuntimeCandidatePath $root $candidateId)
      if ($null -eq $candidate) { throw "SOVEREIGNTY_RUNTIME_CANDIDATE_NOT_FOUND" }
      if ([string]$candidate.source_sha -ne $sha) { throw "SOVEREIGNTY_RUNTIME_CANDIDATE_SHA_MISMATCH" }
      $provenance = Read-SovereigntySourceProvenance ([string]$candidate.repository)
      if ([string]$provenance.source_sha -ne $sha) { throw "SOVEREIGNTY_RUNTIME_PROVENANCE_MISMATCH" }
      return @{ action="sovereignty.runtime.smoke"; candidate_id=$candidateId; passed=$true }
    }
    "promote" {
      $candidateId = Assert-SovereigntyRuntimeName ([string]$payload.candidate_id) "SOVEREIGNTY_RUNTIME_CANDIDATE_INVALID"
      $sha = ([string]$payload.source_sha).Trim().ToLowerInvariant()
      $path = Sovereignty-RuntimeCandidatePath $root $candidateId
      $candidate = Read-SovereigntyRuntimeJson $path
      if ($null -eq $candidate) { throw "SOVEREIGNTY_RUNTIME_CANDIDATE_NOT_FOUND" }
      if ([string]$candidate.source_sha -ne $sha) { throw "SOVEREIGNTY_RUNTIME_CANDIDATE_SHA_MISMATCH" }
      $candidate.status = "ACTIVE"
      Write-SovereigntyRuntimeJson $path $candidate
      Write-SovereigntyRuntimeJson $activePath @{ candidate_id=$candidateId; source_sha=$sha }
      return @{ action="sovereignty.runtime.promote"; candidate_id=$candidateId; promoted=$true; release_id=("local-" + $candidateId) }
    }
    "rollback" {
      $candidateId = Assert-SovereigntyRuntimeName ([string]$payload.candidate_id) "SOVEREIGNTY_RUNTIME_CANDIDATE_INVALID"
      $path = Sovereignty-RuntimeCandidatePath $root $candidateId
      $candidate = Read-SovereigntyRuntimeJson $path
      if ($null -eq $candidate) { throw "SOVEREIGNTY_RUNTIME_CANDIDATE_NOT_FOUND" }
      $priorId = ([string]$candidate.prior_active_id).Trim()
      if (-not [string]::IsNullOrWhiteSpace($priorId)) {
        $prior = Read-SovereigntyRuntimeJson (Sovereignty-RuntimeCandidatePath $root $priorId)
        if ($null -ne $prior) { Write-SovereigntyRuntimeJson $activePath @{ candidate_id=$priorId; source_sha=[string]$prior.source_sha } }
      } elseif (Test-Path -LiteralPath $activePath) { Remove-Item -LiteralPath $activePath -Force }
      $candidate.status = "ROLLED_BACK"
      Write-SovereigntyRuntimeJson $path $candidate
      return @{ action="sovereignty.runtime.rollback"; candidate_id=$candidateId; rolled_back=$true }
    }
    default { throw "SOVEREIGNTY_RUNTIME_OPERATION_NOT_SUPPORTED" }
  }
}


function Test-SovereigntyLocalAiEndpoint([int]$timeoutSec=3) {
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method "GET" -TimeoutSec $timeoutSec -ErrorAction Stop
  } catch {
    return $null
  }
}

function Resolve-SovereigntyOllamaExe {
  try {
    $cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd -and -not [string]::IsNullOrWhiteSpace([string]$cmd.Source)) {
      return [string]$cmd.Source
    }
  } catch {}
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:LOCALAPPDATA "Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
  )
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace([string]$candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return [string]$candidate
    }
  }
  return $null
}

function Read-SovereigntyAiBootstrapStatus {
  try {
    $path = Join-Path (Sovereignty-Root) "ai-bootstrap-status.json"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Start-SovereigntyAiBootstrap([string]$requestedModel) {
  if ([string]$env:MEL_LOCAL_AI_AUTO_INSTALL -eq "0") { return "DISABLED" }

  $model = ([string]$requestedModel).Trim()
  if ([string]::IsNullOrWhiteSpace($model)) { $model = "qwen2.5:1.5b" }
  if ($model -notmatch '^[A-Za-z0-9_.:/-]{1,120}$') { throw "SOVEREIGNTY_AI_BOOTSTRAP_MODEL_INVALID" }

  $root = Sovereignty-Root
  $statusPath = Join-Path $root "ai-bootstrap-status.json"
  $scriptPath = Join-Path $root "ai-bootstrap.ps1"
  $stdoutPath = Join-Path $root "ai-bootstrap.stdout.log"
  $stderrPath = Join-Path $root "ai-bootstrap.stderr.log"
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $status = Read-SovereigntyAiBootstrapStatus
  $priorAttempt = 0
  $statusVersion = ""
  if ($null -ne $status) {
    try { $priorAttempt = [int]$status.attempt } catch {}
    $statusVersion = ([string]$status.engine_version).Trim()
  }

  if ($null -ne $status -and [string]$status.state -eq "FAILED" -and $statusVersion -eq $Version) {
    $failedAt = 0L
    try { $failedAt = [int64]$status.updated_at_unix_ms } catch {}
    $failedCode = ([string]$status.code).Trim()
    if ([string]::IsNullOrWhiteSpace($failedCode)) { $failedCode = "UNKNOWN" }
    if ($failedAt -gt 0 -and ($nowMs - $failedAt) -lt (5*60*1000)) {
      return ("FAILED:" + $failedCode)
    }
  }

  if ($null -ne $status -and [string]$status.state -eq "RUNNING") {
    $started = 0L
    $bootstrapPid = 0
    try { $started = [int64]$status.started_at_unix_ms } catch {}
    try { $bootstrapPid = [int]$status.process_id } catch {}
    $ageMs = if ($started -gt 0) { $nowMs - $started } else { [int64]::MaxValue }

    if ($statusVersion -eq $Version) {
      $processAlive = $false
      if ($bootstrapPid -gt 0) {
        try { $processAlive = $null -ne (Get-Process -Id $bootstrapPid -ErrorAction SilentlyContinue) } catch {}
      }
      if ($processAlive -and $ageMs -lt (30*60*1000)) {
        return "IN_PROGRESS"
      }
      if ($bootstrapPid -le 0 -and $ageMs -lt 30000) {
        return "IN_PROGRESS"
      }
      if ($priorAttempt -ge 3) {
        Start-Sleep -Milliseconds 250
        $terminal = Read-SovereigntyAiBootstrapStatus
        if ($null -ne $terminal -and $statusVersion -eq $Version) {
          $terminalState = ([string]$terminal.state).Trim().ToUpperInvariant()
          $terminalCode = ([string]$terminal.code).Trim()
          if ($terminalState -eq "FAILED" -and -not [string]::IsNullOrWhiteSpace($terminalCode)) {
            return ("FAILED:" + $terminalCode)
          }
          if ($terminalState -eq "READY") {
            return "READY"
          }
        }

        $lastStage = ([string]$status.code).Trim().ToUpperInvariant()
        if ([string]::IsNullOrWhiteSpace($lastStage)) { $lastStage = "UNKNOWN" }
        $lastStage = ($lastStage -replace '[^A-Z0-9_.:-]','_')
        $fallbackCode = "OLLAMA_BOOTSTRAP_PROCESS_EXITED_AT_" + $lastStage
        @{
          schema = "mel.local-ai-bootstrap/v2"
          state = "FAILED"
          code = $fallbackCode
          model = $model
          engine_version = $Version
          attempt = $priorAttempt
          process_id = $bootstrapPid
          started_at_unix_ms = $started
          updated_at = (Get-Date).ToUniversalTime().ToString("o")
          updated_at_unix_ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
        return ("FAILED:" + $fallbackCode)
      }
    } else {
      $priorAttempt = 0
    }
  }

  $attempt = [Math]::Min(3,[Math]::Max(1,$priorAttempt + 1))
  $startedAt = $nowMs

  $payload = @'
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$model = "__MODEL__"
$engineVersion = "__ENGINE_VERSION__"
$attempt = __ATTEMPT__
$startedAt = [int64]__STARTED_AT__
$statusPath = Join-Path $PSScriptRoot "ai-bootstrap-status.json"

function Write-MelAiBootstrapStatus([string]$state,[string]$code) {
  $row = @{
    schema = "mel.local-ai-bootstrap/v2"
    state = $state
    code = $code
    model = $model
    engine_version = $engineVersion
    attempt = $attempt
    process_id = $PID
    started_at_unix_ms = $startedAt
    updated_at = (Get-Date).ToUniversalTime().ToString("o")
    updated_at_unix_ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  $row | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}

function Resolve-MelOllamaExe {
  try {
    $cmd = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd -and -not [string]::IsNullOrWhiteSpace([string]$cmd.Source)) { return [string]$cmd.Source }
  } catch {}
  foreach ($candidate in @(
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
    (Join-Path $env:LOCALAPPDATA "Ollama\ollama.exe"),
    (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
  )) {
    if (-not [string]::IsNullOrWhiteSpace([string]$candidate) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return [string]$candidate }
  }
  return $null
}

function Read-MelOllamaTags {
  try { return Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 4 -ErrorAction Stop }
  catch { return $null }
}

try {
  Write-MelAiBootstrapStatus "RUNNING" "STARTED"
  $ollama = Resolve-MelOllamaExe

  if ([string]::IsNullOrWhiteSpace([string]$ollama)) {
    $installer = Join-Path $env:TEMP "MEL-OllamaSetup.exe"
    Write-MelAiBootstrapStatus "RUNNING" "DOWNLOADING_INSTALLER"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -UseBasicParsing -OutFile $installer -TimeoutSec 180
    $sig = Get-AuthenticodeSignature -FilePath $installer
    $subject = if ($null -ne $sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { "" }
    if ($sig.Status -ne "Valid" -or $subject -notmatch '(^|, )O=Ollama Inc\.(,|$)') {
      try { Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue } catch {}
      throw "OLLAMA_INSTALLER_SIGNATURE_INVALID"
    }
    Write-MelAiBootstrapStatus "RUNNING" "INSTALLING_ENGINE"
    $proc = Start-Process -FilePath $installer -ArgumentList "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES" -PassThru
    if (-not $proc.WaitForExit(300000)) {
      try { $proc.Kill() } catch {}
      throw "OLLAMA_INSTALL_TIMEOUT"
    }
    $exitCode = $proc.ExitCode
    try { Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue } catch {}
    if ($exitCode -ne 0) { throw ("OLLAMA_INSTALL_FAILED:" + $exitCode) }
    $ollama = Resolve-MelOllamaExe
  }

  if ([string]::IsNullOrWhiteSpace([string]$ollama)) { throw "OLLAMA_EXE_NOT_FOUND" }

  $tags = Read-MelOllamaTags
  if ($null -eq $tags) {
    Write-MelAiBootstrapStatus "RUNNING" "STARTING_ENGINE"
    try { Start-Process -FilePath $ollama -ArgumentList @("serve") -WindowStyle Hidden } catch {}
    for ($i=0; $i -lt 30 -and $null -eq $tags; $i++) {
      Start-Sleep -Seconds 2
      $tags = Read-MelOllamaTags
    }
  }
  if ($null -eq $tags) { throw "OLLAMA_SERVER_NOT_READY" }

  $installed = @($tags.models | ForEach-Object { ([string]$_.name).Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($installed -notcontains $model) {
    Write-MelAiBootstrapStatus "RUNNING" "PULLING_MODEL"
    $pull = Start-Process -FilePath $ollama -ArgumentList @("pull",$model) -PassThru -WindowStyle Hidden
    if (-not $pull.WaitForExit(720000)) {
      try { $pull.Kill() } catch {}
      throw "OLLAMA_MODEL_PULL_TIMEOUT"
    }
    if ($pull.ExitCode -ne 0) { throw ("OLLAMA_MODEL_PULL_FAILED:" + $pull.ExitCode) }
    $tags = Read-MelOllamaTags
    $installed = @($tags.models | ForEach-Object { ([string]$_.name).Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($installed -notcontains $model) { throw "OLLAMA_MODEL_PULL_NOT_VISIBLE" }
  }

  Write-MelAiBootstrapStatus "READY" "LOCAL_AI_READY"
  exit 0
}
catch {
  Write-MelAiBootstrapStatus "FAILED" ([string]$_.Exception.Message)
  exit 1
}
'@
  $payload = $payload.Replace("__MODEL__",$model)
  $payload = $payload.Replace("__ENGINE_VERSION__",$Version)
  $payload = $payload.Replace("__ATTEMPT__",[string]$attempt)
  $payload = $payload.Replace("__STARTED_AT__",[string]$startedAt)
  [IO.File]::WriteAllText($scriptPath,$payload,[Text.UTF8Encoding]::new($false))

  $tokens = $null
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$parseErrors)
  if ($null -ne $parseErrors -and $parseErrors.Count -gt 0) {
    @{
      schema = "mel.local-ai-bootstrap/v2"
      state = "FAILED"
      code = "OLLAMA_BOOTSTRAP_SCRIPT_PARSE_FAILED"
      model = $model
      engine_version = $Version
      attempt = $attempt
      started_at_unix_ms = $startedAt
      updated_at_unix_ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
    return "FAILED:OLLAMA_BOOTSTRAP_SCRIPT_PARSE_FAILED"
  }

  @{
    schema = "mel.local-ai-bootstrap/v2"
    state = "RUNNING"
    code = "LAUNCHING"
    model = $model
    engine_version = $Version
    attempt = $attempt
    started_at_unix_ms = $startedAt
    updated_at_unix_ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8

  try {
    try { Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue } catch {}
    $bootstrapProcess = Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -ArgumentList @(
      "-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",$scriptPath
    )
    if ($null -eq $bootstrapProcess -or $bootstrapProcess.Id -le 0) {
      throw "OLLAMA_BOOTSTRAP_LAUNCH_NO_PROCESS"
    }
    # The child process owns ai-bootstrap-status.json after launch.
    # Do not rewrite a stale RUNNING snapshot here: it can overwrite a fast
    # FAILED status emitted by the child and hide the real bootstrap error.
    return "STARTED"
  } catch {
    @{
      schema = "mel.local-ai-bootstrap/v2"
      state = "FAILED"
      code = "OLLAMA_BOOTSTRAP_LAUNCH_FAILED"
      model = $model
      engine_version = $Version
      attempt = $attempt
      started_at_unix_ms = $startedAt
      updated_at_unix_ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
    return "FAILED:OLLAMA_BOOTSTRAP_LAUNCH_FAILED"
  }
}


function Get-SovereigntyLocalAiState {
  $base = "http://127.0.0.1:11434"
  $requested = ([string]$env:MEL_LOCAL_AI_MODEL).Trim()
  $bootstrapModel = if ([string]::IsNullOrWhiteSpace($requested)) { "qwen2.5:1.5b" } else { $requested }

  $tags = Test-SovereigntyLocalAiEndpoint 4
  if ($null -eq $tags) {
    $bootstrap = Start-SovereigntyAiBootstrap $bootstrapModel
    if ($bootstrap -eq "DISABLED") { throw "SOVEREIGNTY_AI_LOCAL_ENGINE_UNAVAILABLE" }
    if ([string]$bootstrap -like "FAILED:*") { throw ("SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_FAILED:" + ([string]$bootstrap).Substring(7)) }
    throw "SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_PENDING"
  }

  $models = @()
  foreach ($row in @($tags.models)) {
    $name = ([string]$row.name).Trim()
    if (-not [string]::IsNullOrWhiteSpace($name)) { $models += ,$name }
  }

  if ($models.Count -lt 1) {
    $bootstrap = Start-SovereigntyAiBootstrap $bootstrapModel
    if ($bootstrap -eq "DISABLED") { throw "SOVEREIGNTY_AI_LOCAL_MODEL_MISSING" }
    if ([string]$bootstrap -like "FAILED:*") { throw ("SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_FAILED:" + ([string]$bootstrap).Substring(7)) }
    throw "SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_PENDING"
  }

  $model = $null
  if (-not [string]::IsNullOrWhiteSpace($requested)) {
    $model = $models | Where-Object { [string]$_ -eq $requested } | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace([string]$model)) {
      $bootstrap = Start-SovereigntyAiBootstrap $requested
      if ($bootstrap -eq "DISABLED") { throw "SOVEREIGNTY_AI_MODEL_NOT_INSTALLED" }
      if ([string]$bootstrap -like "FAILED:*") { throw ("SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_FAILED:" + ([string]$bootstrap).Substring(7)) }
      throw "SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_PENDING"
    }
  } else {
    $model = [string]$models[0]
  }

  return @{ endpoint=$base; model=[string]$model; installed_models=$models }
}

function Perform-SovereigntyAi([string]$operation,$payload) {
  $state = Get-SovereigntyLocalAiState
  switch ($operation) {
    "health" {
      return @{
        action="sovereignty.ai.health"
        backend="ollama-localhost"
        ready=$true
        model=[string]$state.model
        installed_model_count=@($state.installed_models).Count
        network_scope="localhost-only"
      }
    }
    "invoke" {
      $messages = @()
      $totalChars = 0
      foreach ($raw in @($payload.messages)) {
        $role = ([string]$raw.role).Trim().ToLowerInvariant()
        if (@("system","user","assistant") -notcontains $role) { throw "SOVEREIGNTY_AI_ROLE_INVALID" }
        $content = [string]$raw.content
        if ($content.Length -gt 12000) { throw "SOVEREIGNTY_AI_MESSAGE_TOO_LARGE" }
        $totalChars += $content.Length
        if ($totalChars -gt 32000) { throw "SOVEREIGNTY_AI_INPUT_TOO_LARGE" }
        $messages += ,@{ role=$role; content=$content }
      }
      if ($messages.Count -lt 1) { throw "SOVEREIGNTY_AI_INPUT_REQUIRED" }
      $requestedModel = ([string]$payload.model).Trim()
      if (-not [string]::IsNullOrWhiteSpace($requestedModel) -and $requestedModel -ne [string]$state.model) {
        throw "SOVEREIGNTY_AI_MODEL_NOT_ALLOWED"
      }
      $temperature = 0.0
      try { $temperature = [double]$payload.temperature } catch {}
      $temperature = [Math]::Max(0.0,[Math]::Min(2.0,$temperature))
      $maxTokens = 180
      try { $maxTokens = [int]$payload.max_tokens } catch {}
      $maxTokens = [Math]::Max(1,[Math]::Min(512,$maxTokens))
      $body = @{
        model=[string]$state.model
        messages=$messages
        stream=$false
        options=@{ temperature=$temperature; num_predict=$maxTokens }
      } | ConvertTo-Json -Depth 10 -Compress
      try {
        $response = Invoke-RestMethod -Uri ($state.endpoint + "/api/chat") -Method "POST" -ContentType "application/json" -Body $body -TimeoutSec 90 -ErrorAction Stop
      } catch {
        throw "SOVEREIGNTY_AI_LOCAL_INVOKE_FAILED"
      }
      $text = ([string]$response.message.content).Trim()
      if ([string]::IsNullOrWhiteSpace($text)) { throw "SOVEREIGNTY_AI_LOCAL_EMPTY_RESPONSE" }
      if ($text.Length -gt 32000) { $text = $text.Substring(0,32000) }
      return @{
        action="sovereignty.ai.invoke"
        backend="ollama-localhost"
        model=[string]$state.model
        text=$text
        network_scope="localhost-only"
      }
    }
    default { throw "SOVEREIGNTY_AI_OPERATION_NOT_SUPPORTED" }
  }
}


function PcControl-LimitText([string]$text,[int]$max=65536) {
  if ($null -eq $text) { return "" }
  if ($text.Length -le $max) { return $text }
  return $text.Substring(0,$max) + "\n...[TRUNCATED]"
}

function PcControl-ResolveLocalPath([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { throw "PC_PATH_REQUIRED" }
  $full = [IO.Path]::GetFullPath($path)
  if ($full.StartsWith("\\")) { throw "PC_NETWORK_PATH_NOT_ALLOWED" }
  return $full
}

function PcControl-SerialList {
  $ports = @([IO.Ports.SerialPort]::GetPortNames() | Sort-Object)
  return @{ action="serial.list"; ports=$ports; count=$ports.Count }
}

function PcControl-SerialRead($payload) {
  $portName = ([string]$payload.port).Trim().ToUpperInvariant()
  if ($portName -notmatch '^COM\d{1,3}$') { throw "SERIAL_PORT_INVALID" }
  $available = @([IO.Ports.SerialPort]::GetPortNames())
  if ($available -notcontains $portName) { throw "SERIAL_PORT_NOT_FOUND" }

  $baud = 115200
  if ($payload.baud) { $baud = [Math]::Max(1200,[Math]::Min(2000000,[int]$payload.baud)) }
  $durationMs = 5000
  if ($payload.duration_ms) { $durationMs = [Math]::Max(250,[Math]::Min(30000,[int]$payload.duration_ms)) }

  $serial = New-Object IO.Ports.SerialPort $portName,$baud,'None',8,'One'
  $serial.ReadTimeout = 200
  $serial.WriteTimeout = 1000
  $serial.DtrEnable = $false
  $serial.RtsEnable = $false
  $builder = New-Object Text.StringBuilder
  try {
    $serial.Open()
    $deadline = [DateTime]::UtcNow.AddMilliseconds($durationMs)
    while ([DateTime]::UtcNow -lt $deadline) {
      $chunk = $serial.ReadExisting()
      if (-not [string]::IsNullOrEmpty($chunk)) {
        [void]$builder.Append($chunk)
        if ($builder.Length -ge 65536) { break }
      }
      Start-Sleep -Milliseconds 50
    }
    $captured = $builder.ToString()
    return @{ action="serial.read"; port=$portName; baud=$baud; duration_ms=$durationMs; chars=$captured.Length; text=(PcControl-LimitText $captured 65536) }
  } finally {
    try { if ($serial.IsOpen) { $serial.Close() } } catch {}
    $serial.Dispose()
  }
}

function PcControl-ProcessList {
  $rows = @(Get-Process -ErrorAction SilentlyContinue | Sort-Object ProcessName | Select-Object -First 300 | ForEach-Object {
    @{ id=$_.Id; name=$_.ProcessName; cpu=[double]($_.CPU); memory=[long]($_.WorkingSet64) }
  })
  return @{ action="process.list"; processes=$rows; count=$rows.Count }
}

function PcControl-ProcessStart($payload) {
  $file = [string]$payload.file
  if ([string]::IsNullOrWhiteSpace($file)) { throw "PROCESS_FILE_REQUIRED" }
  $args = [string]$payload.arguments
  $working = [string]$payload.working_directory
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $file
  if (-not [string]::IsNullOrWhiteSpace($args)) { $psi.Arguments = $args }
  if (-not [string]::IsNullOrWhiteSpace($working)) { $psi.WorkingDirectory = (PcControl-ResolveLocalPath $working) }
  $psi.UseShellExecute = $true
  $p = [Diagnostics.Process]::Start($psi)
  if ($null -eq $p) { throw "PROCESS_START_FAILED" }
  return @{ action="process.start"; pid=$p.Id; file=$file }
}

function PcControl-ProcessKill($payload) {
  $pidValue = [int]$payload.pid
  if ($pidValue -le 0 -or $pidValue -eq $PID) { throw "PROCESS_ID_INVALID" }
  $p = Get-Process -Id $pidValue -ErrorAction Stop
  $name = $p.ProcessName
  Stop-Process -Id $pidValue -Force -ErrorAction Stop
  return @{ action="process.kill"; pid=$pidValue; name=$name; killed=$true }
}

function PcControl-FileList($payload) {
  $path = PcControl-ResolveLocalPath ([string]$payload.path)
  if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw "DIRECTORY_NOT_FOUND" }
  $items = @(Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop | Select-Object -First 500 | ForEach-Object {
    $itemLength = 0
    if (-not $_.PSIsContainer) { $itemLength = [long]$_.Length }
    @{ name=$_.Name; full_name=$_.FullName; directory=$_.PSIsContainer; length=$itemLength; modified=$_.LastWriteTimeUtc.ToString("o") }
  })
  return @{ action="file.list"; path=$path; items=$items; count=$items.Count }
}

function PcControl-FileReadText($payload) {
  $path = PcControl-ResolveLocalPath ([string]$payload.path)
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "FILE_NOT_FOUND" }
  $text = [IO.File]::ReadAllText($path,[Text.Encoding]::UTF8)
  return @{ action="file.read_text"; path=$path; text=(PcControl-LimitText $text 131072); chars=$text.Length }
}

function PcControl-FileWriteText($payload) {
  $path = PcControl-ResolveLocalPath ([string]$payload.path)
  $text = [string]$payload.text
  if ($text.Length -gt 1048576) { throw "FILE_TEXT_TOO_LARGE" }
  $parent = Split-Path -Parent $path
  if (-not [string]::IsNullOrWhiteSpace($parent)) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
  $utf8 = New-Object Text.UTF8Encoding $false
  [IO.File]::WriteAllText($path,$text,$utf8)
  return @{ action="file.write_text"; path=$path; chars=$text.Length }
}

function PcControl-SystemInfo {
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $cs = Get-CimInstance Win32_ComputerSystem
  return @{ action="system.info"; hostname=$env:COMPUTERNAME; user=$env:USERNAME; os=$os.Caption; version=$os.Version; architecture=$os.OSArchitecture; cpu=$cpu.Name; logical_processors=[int]$cs.NumberOfLogicalProcessors; memory_bytes=[long]$cs.TotalPhysicalMemory; powershell=$PSVersionTable.PSVersion.ToString() }
}

function PcControl-SystemExec($payload) {
  $command = [string]$payload.command
  if ([string]::IsNullOrWhiteSpace($command)) { throw "SYSTEM_COMMAND_REQUIRED" }
  if ($command.Length -gt 8192) { throw "SYSTEM_COMMAND_TOO_LONG" }
  $timeoutMs = 20000
  if ($payload.timeout_ms) { $timeoutMs = [Math]::Max(500,[Math]::Min(120000,[int]$payload.timeout_ms)) }
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = "powershell.exe"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + $encoded
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($psi)
  if ($null -eq $p) { throw "SYSTEM_EXEC_START_FAILED" }
  if (-not $p.WaitForExit($timeoutMs)) { try { $p.Kill() } catch {}; throw "SYSTEM_EXEC_TIMEOUT" }
  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  return @{ action="system.exec"; exit_code=$p.ExitCode; stdout=(PcControl-LimitText $out 65536); stderr=(PcControl-LimitText $err 32768) }
}

function Perform-PcControl([string]$action,$payload) {
  switch ($action) {
    "serial.list" { return PcControl-SerialList }
    "serial.read" { return PcControl-SerialRead $payload }
    "process.list" { return PcControl-ProcessList }
    "process.start" { return PcControl-ProcessStart $payload }
    "process.kill" { return PcControl-ProcessKill $payload }
    "file.list" { return PcControl-FileList $payload }
    "file.read_text" { return PcControl-FileReadText $payload }
    "file.write_text" { return PcControl-FileWriteText $payload }
    "system.info" { return PcControl-SystemInfo }
    "system.exec" { return PcControl-SystemExec $payload }
    default { throw "PC_CONTROL_ACTION_NOT_SUPPORTED" }
  }
}

function Perform-Step($step, [string]$commandId, [string]$planSchema="") {
  $action = [string]$step.action
  if ($planSchema -eq "mel.devices.pc-control.v1") {
    if ($config.remote_access_enabled -ne $true) { throw "REMOTE_ACCESS_DISABLED_LOCALLY" }
    if (-not ($step.PSObject.Properties.Name -contains "payload")) { throw "PC_CONTROL_PAYLOAD_REQUIRED" }
    return Perform-PcControl $action $step.payload
  }
  if ($action.StartsWith("sovereignty.")) {
    if ($planSchema -ne "mel.sovereignty.local-command/v1") { throw "SOVEREIGNTY_COMMAND_SCHEMA_REQUIRED" }
    if ($action.StartsWith("sovereignty.ai.")) {
      $op = $action.Substring("sovereignty.ai.".Length)
      return Perform-SovereigntyAi $op $step.payload
    }
    if ($action.StartsWith("sovereignty.runtime.")) {
      $op = $action.Substring("sovereignty.runtime.".Length)
      return Perform-SovereigntyRuntime $op $step.payload
    }
    if ($action.StartsWith("sovereignty.source_control.")) {
      $op = $action.Substring("sovereignty.source_control.".Length)
      return Perform-SovereigntySourceControl $op $step.payload
    }
    if ($action.StartsWith("sovereignty.ci.")) {
      $op = $action.Substring("sovereignty.ci.".Length)
      return Perform-SovereigntyCi $op $step.payload
    }
    if ($action.StartsWith("sovereignty.storage.")) {
      $op = $action.Substring("sovereignty.storage.".Length)
      return Perform-SovereigntyStorage $op $step.payload
    }
    if ($action.StartsWith("sovereignty.database.")) {
      $op = $action.Substring("sovereignty.database.".Length)
      return Perform-SovereigntyDatabase $op $step.payload
    }
    if ($action.StartsWith("sovereignty.observability.")) {
      $op = $action.Substring("sovereignty.observability.".Length)
      return Perform-SovereigntyObservability $op $step.payload
    }
    if ($action.StartsWith("sovereignty.scheduler.")) {
      $op = $action.Substring("sovereignty.scheduler.".Length)
      return Perform-SovereigntyScheduler $op $step.payload
    }
    if ($action.StartsWith("sovereignty.secrets.")) {
      $op = $action.Substring("sovereignty.secrets.".Length)
      return Perform-SovereigntySecrets $op $step.payload
    }
    throw "SOVEREIGNTY_ACTION_NOT_SUPPORTED"
  }
  $action = [string]$step.action
  switch ($action) {
    "screen.capture" {
      $shot = Upload-Screenshot $commandId
      return @{ action=$action; screenshot_key=$shot.key; view_url=$shot.view_url }
    }
    "cursor.move" {
      if (-not [MelNative]::SetCursorPos([int]$step.x, [int]$step.y)) { throw "CURSOR_MOVE_FAILED" }
      return @{ action=$action; x=[int]$step.x; y=[int]$step.y }
    }
    "pointer.click" {
      [MelNative]::mouse_event($MOUSE_LEFTDOWN,0,0,0,[UIntPtr]::Zero)
      Start-Sleep -Milliseconds 35
      [MelNative]::mouse_event($MOUSE_LEFTUP,0,0,0,[UIntPtr]::Zero)
      return @{ action=$action }
    }
    "pointer.scroll" {
      $delta = [int]$step.delta_y
      if ($delta -eq 0) { $delta = -120 }
      [MelNative]::mouse_event($MOUSE_WHEEL,0,0,$delta,[UIntPtr]::Zero)
      return @{ action=$action; delta_y=$delta }
    }
    "keyboard.press" {
      [System.Windows.Forms.SendKeys]::SendWait((Key-Token ([string]$step.key)))
      return @{ action=$action; key=[string]$step.key }
    }
    "keyboard.type" {
      Type-Text ([string]$step.text)
      return @{ action=$action; chars=([string]$step.text).Length }
    }
    "app.open" {
      $exe = Resolve-App ([string]$step.app)
      Start-Process $exe
      return @{ action=$action; app=[string]$step.app }
    }
    "app.close" {
      $count = Close-AppGracefully ([string]$step.app)
      return @{ action=$action; app=[string]$step.app; windows_requested_close=$count }
    }
    "file.open" {
      $path = Resolve-AllowedPath ([string]$step.path)
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "FILE_NOT_FOUND" }
      Start-Process -FilePath $path
      return @{ action=$action; path=$path }
    }
    "file.close" {
      $closed = Close-ForegroundFile ([string]$step.path)
      return @{ action=$action; path=$closed.path; active_window=$closed.active_window }
    }
    "clipboard.read" {
      $v = ""
      try { $v = [string](Get-Clipboard -Raw -ErrorAction Stop) } catch {}
      if ($v.Length -gt 4096) { $v = $v.Substring(0,4096) }
      return @{ action=$action; text=$v }
    }
    "clipboard.write" {
      Set-Clipboard -Value ([string]$step.text)
      return @{ action=$action; chars=([string]$step.text).Length }
    }
    "power.off" {
      return Invoke-ShutdownCommand $action
    }
    "power.restart" {
      return Invoke-ShutdownCommand $action
    }
    default { throw "ACTION_NOT_SUPPORTED" }
  }
}

function Process-Command($command) {
  $outputs = @()
  try {
    foreach ($step in @($command.plan.steps)) {
      $outputs += ,(Perform-Step $step ([string]$command.id) ([string]$command.plan.schema))
    }
    $body = @{ command_id=$command.id; ok=$true; result=@{ outputs=$outputs; active_window=(Active-Window) } }
    [void](Invoke-MelJson -Path "/api/computer/v1/result" -Method "POST" -Body $body)
  } catch {
    $code = [string]$_.Exception.Message
    $body = @{ command_id=$command.id; ok=$false; error_code=$code; result=@{ outputs=$outputs } }
    try { [void](Invoke-MelJson -Path "/api/computer/v1/result" -Method "POST" -Body $body) } catch {}
  }
}

$trayResources = $null
if (-not $Headless) { $trayResources = New-MelTrayIcon }
$lastHeartbeat = Get-Date "2000-01-01"
while (-not $script:MelExitRequested) {
  if ($Headless -and $ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  if (-not $Headless) { [System.Windows.Forms.Application]::DoEvents() }
  try {
    if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 10) {
      Send-Heartbeat
      $lastHeartbeat = Get-Date
    }
    $reply = Invoke-MelJson -Path "/api/computer/v1/commands" -Method "GET"
    if ($reply.halted -eq $true) {
      Start-Sleep -Seconds 2
      continue
    }
    if ($null -ne $reply.command) {
      Process-Command $reply.command
      continue
    }
  } catch {
    Start-Sleep -Seconds 3
  }
  Start-Sleep -Milliseconds 1200
}
if ($trayResources) {
  try { $trayResources.notify.Visible = $false } catch {}
  try { $trayResources.notify.Dispose() } catch {}
  try { $trayResources.menu.Dispose() } catch {}
  try { $trayResources.icon.Dispose() } catch {}
  try { $trayResources.bitmap.Dispose() } catch {}
}
