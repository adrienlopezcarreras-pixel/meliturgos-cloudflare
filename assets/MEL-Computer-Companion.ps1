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
$Version = "1.1.0"
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
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
Add-Type -TypeDefinition $Native -Language CSharp

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
    version = $Version
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

function Perform-Step($step, [string]$commandId) {
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
      $exe = Join-Path $env:SystemRoot "System32\shutdown.exe"
      Start-Process -FilePath $exe -ArgumentList @("/s","/t","5","/d","p:0:0","/c","MEL owner-approved shutdown") -WindowStyle Hidden
      return @{ action=$action; scheduled=$true; delay_seconds=5 }
    }
    "power.restart" {
      $exe = Join-Path $env:SystemRoot "System32\shutdown.exe"
      Start-Process -FilePath $exe -ArgumentList @("/r","/t","5","/d","p:0:0","/c","MEL owner-approved restart") -WindowStyle Hidden
      return @{ action=$action; scheduled=$true; delay_seconds=5 }
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
