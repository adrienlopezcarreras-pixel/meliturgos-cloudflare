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
$Version = "1.2.0"
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
  if ($name -notmatch '^[A-Za-z0-9_.-]{1,200}
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
) { throw "SOVEREIGNTY_REPOSITORY_INVALID" }
  $root = Sovereignty-Root
  $reposRoot = [IO.Path]::GetFullPath((Join-Path $root "repos")).TrimEnd("\")
  $path = [IO.Path]::GetFullPath((Join-Path $reposRoot $name))
  if (-not $path.StartsWith($reposRoot + "\",[StringComparison]::OrdinalIgnoreCase)) { throw "SOVEREIGNTY_REPOSITORY_OUTSIDE_SANDBOX" }
  return $path
}

function Assert-SovereigntyGitRef([string]$ref) {
  $value = ([string]$ref).Trim()
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -gt 240) { throw "SOVEREIGNTY_GIT_REF_INVALID" }
  $hasInvalid = $false
  foreach ($ch in @('~','^',':','?','*','\','[')) {
    if ($value.Contains($ch)) { $hasInvalid = $true; break }
  }
  if ($value -match '\s' -or $hasInvalid -or $value.Contains("..") -or $value.StartsWith("-")) { throw "SOVEREIGNTY_GIT_REF_INVALID" }
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

function Seed-SovereigntyGitRepo([string]$repository,[string]$expectedSha) {
  $sha = ([string]$expectedSha).Trim().ToLowerInvariant()
  if ($sha -notmatch '^[0-9a-f]{40}
  $repository = [string]$payload.repository
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
      if ($sha -notmatch '^[0-9a-fA-F]{40}
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
) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("branch","-f",$ref,$sha))
      return @{ action="sovereignty.source_control.create_ref"; ref=$ref; sha=$sha }
    }
    "update_ref" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $sha = ([string]$payload.sha).Trim()
      if ($sha -notmatch '^[0-9a-fA-F]{40}
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("update-ref",("refs/heads/" + $ref),$sha))
      return @{ action="sovereignty.source_control.update_ref"; ref=$ref; sha=$sha }
    }
    "compare_refs" {
      $base = Assert-SovereigntyGitRef ([string]$payload.base)
      $head = Assert-SovereigntyGitRef ([string]$payload.head)
      $ahead = [int](Invoke-SovereigntyGit $repo @("rev-list","--count",($base + ".." + $head)))
      $behind = [int](Invoke-SovereigntyGit $repo @("rev-list","--count",($head + ".." + $base)))
      return @{ action="sovereignty.source_control.compare_refs"; ahead_by=$ahead; behind_by=$behind }
    }
    "write_file" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $safe = Resolve-SovereigntyRelativePath $repo ([string]$payload.path)
      $worktree = Join-Path (Join-Path (Sovereignty-Root) "worktrees") ([guid]::NewGuid().ToString("N"))
      try {
        [void](Invoke-SovereigntyGit $repo @("worktree","add","--detach",$worktree,$ref))
        $target = Resolve-SovereigntyRelativePath $worktree $safe.relative
        $parent = Split-Path -Parent $target.full
        if ($parent) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
        [IO.File]::WriteAllText($target.full,[string]$payload.content,[Text.UTF8Encoding]::new($false))
        [void](Invoke-SovereigntyGit $worktree @("add","--",$safe.relative))
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
function Perform-Step($step, [string]$commandId, [string]$planSchema="") {
  $action = [string]$step.action
  if ($action.StartsWith("sovereignty.")) {
    if ($planSchema -ne "mel.sovereignty.local-command/v1") { throw "SOVEREIGNTY_COMMAND_SCHEMA_REQUIRED" }
    if ($action.StartsWith("sovereignty.source_control.")) {
      $op = $action.Substring("sovereignty.source_control.".Length)
      return Perform-SovereigntySourceControl $op $step.payload
    }
    throw "SOVEREIGNTY_ACTION_NOT_SUPPORTED"
  }
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_SEED_SHA_INVALID" }
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
    if ($expectedArchiveHash -notmatch '^[0-9a-f]{64}
  $repository = [string]$payload.repository
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
      if ($sha -notmatch '^[0-9a-fA-F]{40}
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("branch","-f",$ref,$sha))
      return @{ action="sovereignty.source_control.create_ref"; ref=$ref; sha=$sha }
    }
    "update_ref" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $sha = ([string]$payload.sha).Trim()
      if ($sha -notmatch '^[0-9a-fA-F]{40}
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("update-ref",("refs/heads/" + $ref),$sha))
      return @{ action="sovereignty.source_control.update_ref"; ref=$ref; sha=$sha }
    }
    "compare_refs" {
      $base = Assert-SovereigntyGitRef ([string]$payload.base)
      $head = Assert-SovereigntyGitRef ([string]$payload.head)
      $ahead = [int](Invoke-SovereigntyGit $repo @("rev-list","--count",($base + ".." + $head)))
      $behind = [int](Invoke-SovereigntyGit $repo @("rev-list","--count",($head + ".." + $base)))
      return @{ action="sovereignty.source_control.compare_refs"; ahead_by=$ahead; behind_by=$behind }
    }
    "write_file" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $safe = Resolve-SovereigntyRelativePath $repo ([string]$payload.path)
      $worktree = Join-Path (Join-Path (Sovereignty-Root) "worktrees") ([guid]::NewGuid().ToString("N"))
      try {
        [void](Invoke-SovereigntyGit $repo @("worktree","add","--detach",$worktree,$ref))
        $target = Resolve-SovereigntyRelativePath $worktree $safe.relative
        $parent = Split-Path -Parent $target.full
        if ($parent) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
        [IO.File]::WriteAllText($target.full,[string]$payload.content,[Text.UTF8Encoding]::new($false))
        [void](Invoke-SovereigntyGit $worktree @("add","--",$safe.relative))
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
function Perform-Step($step, [string]$commandId, [string]$planSchema="") {
  $action = [string]$step.action
  if ($action.StartsWith("sovereignty.")) {
    if ($planSchema -ne "mel.sovereignty.local-command/v1") { throw "SOVEREIGNTY_COMMAND_SCHEMA_REQUIRED" }
    if ($action.StartsWith("sovereignty.source_control.")) {
      $op = $action.Substring("sovereignty.source_control.".Length)
      return Perform-SovereigntySourceControl $op $step.payload
    }
    throw "SOVEREIGNTY_ACTION_NOT_SUPPORTED"
  }
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_SEED_ARCHIVE_HASH_MISSING" }
    if ($externalVerified -ne "1") { throw "SOVEREIGNTY_SEED_EXTERNAL_PROOF_REQUIRED" }
    $actualArchiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualArchiveHash -ne $expectedArchiveHash) { throw "SOVEREIGNTY_SEED_ARCHIVE_HASH_MISMATCH" }
    if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { throw "SOVEREIGNTY_TAR_NOT_AVAILABLE" }
    & tar.exe -xzf $archive -C $extract
    if ($LASTEXITCODE -ne 0) { throw "SOVEREIGNTY_ARCHIVE_EXTRACT_FAILED" }
    $sourceRoot = $extract
    $topDirs = @(Get-ChildItem -LiteralPath $extract -Directory -Force)
    if (-not (Test-Path -LiteralPath (Join-Path $extract "package.json") -PathType Leaf) -and $topDirs.Count -eq 1) { $sourceRoot = $topDirs[0].FullName }
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "package.json") -PathType Leaf)) { throw "SOVEREIGNTY_SEED_PACKAGE_JSON_MISSING" }
    if (Test-Path -LiteralPath $repo) { Remove-Item -LiteralPath $repo -Recurse -Force }
    [IO.Directory]::CreateDirectory($repo) | Out-Null
    foreach ($item in @(Get-ChildItem -LiteralPath $sourceRoot -Force)) {
      Copy-Item -LiteralPath $item.FullName -Destination $repo -Recurse -Force
    }
    $gitDir = Join-Path $repo ".git"
    if (Test-Path -LiteralPath $gitDir) { Remove-Item -LiteralPath $gitDir -Recurse -Force }
    $provenance = @{
      schema="mel.local-source-provenance/v1";
      source_sha=$sha;
      archive_sha256=$actualArchiveHash;
      external_reconstruction_verified=$true;
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
function Perform-SovereigntySourceControl([string]$operation,$payload) {
  $repository = [string]$payload.repository
  if ($operation -eq "seed") {
    return Seed-SovereigntyGitRepo $repository ([string]$payload.expected_sha)
  }
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
      if ($sha -notmatch '^[0-9a-fA-F]{40}
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("branch","-f",$ref,$sha))
      return @{ action="sovereignty.source_control.create_ref"; ref=$ref; sha=$sha }
    }
    "update_ref" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $sha = ([string]$payload.sha).Trim()
      if ($sha -notmatch '^[0-9a-fA-F]{40}
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
) { throw "SOVEREIGNTY_GIT_SHA_INVALID" }
      [void](Invoke-SovereigntyGit $repo @("update-ref",("refs/heads/" + $ref),$sha))
      return @{ action="sovereignty.source_control.update_ref"; ref=$ref; sha=$sha }
    }
    "compare_refs" {
      $base = Assert-SovereigntyGitRef ([string]$payload.base)
      $head = Assert-SovereigntyGitRef ([string]$payload.head)
      $ahead = [int](Invoke-SovereigntyGit $repo @("rev-list","--count",($base + ".." + $head)))
      $behind = [int](Invoke-SovereigntyGit $repo @("rev-list","--count",($head + ".." + $base)))
      return @{ action="sovereignty.source_control.compare_refs"; ahead_by=$ahead; behind_by=$behind }
    }
    "write_file" {
      $ref = Assert-SovereigntyGitRef ([string]$payload.ref)
      $safe = Resolve-SovereigntyRelativePath $repo ([string]$payload.path)
      $worktree = Join-Path (Join-Path (Sovereignty-Root) "worktrees") ([guid]::NewGuid().ToString("N"))
      try {
        [void](Invoke-SovereigntyGit $repo @("worktree","add","--detach",$worktree,$ref))
        $target = Resolve-SovereigntyRelativePath $worktree $safe.relative
        $parent = Split-Path -Parent $target.full
        if ($parent) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
        [IO.File]::WriteAllText($target.full,[string]$payload.content,[Text.UTF8Encoding]::new($false))
        [void](Invoke-SovereigntyGit $worktree @("add","--",$safe.relative))
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
function Perform-Step($step, [string]$commandId, [string]$planSchema="") {
  $action = [string]$step.action
  if ($action.StartsWith("sovereignty.")) {
    if ($planSchema -ne "mel.sovereignty.local-command/v1") { throw "SOVEREIGNTY_COMMAND_SCHEMA_REQUIRED" }
    if ($action.StartsWith("sovereignty.source_control.")) {
      $op = $action.Substring("sovereignty.source_control.".Length)
      return Perform-SovereigntySourceControl $op $step.payload
    }
    throw "SOVEREIGNTY_ACTION_NOT_SUPPORTED"
  }
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
      $outputs += ,(Perform-Step $step ([string]$command.id))
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
