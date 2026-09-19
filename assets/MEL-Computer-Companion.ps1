param(
  [switch]$Run
)

$ErrorActionPreference = "Stop"
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
$Version = "1.0.0"

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

$lastHeartbeat = Get-Date "2000-01-01"
while ($true) {
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
