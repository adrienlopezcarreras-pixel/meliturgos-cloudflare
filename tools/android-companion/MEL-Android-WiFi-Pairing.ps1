param(
  [switch]$Pair
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This helper is run locally on the owner's Windows PC. Pairing code is entered
# only into the interactive ADB terminal, never into MEL, Cloudflare, or logs.
function Resolve-Adb {
  $sdk = [string]$env:ANDROID_SDK_ROOT
  if (-not $sdk) { $sdk = [string]$env:ANDROID_HOME }
  if (-not $sdk -or -not (Test-Path -LiteralPath $sdk -PathType Container)) {
    throw 'ANDROID_SDK_ROOT_REQUIRED: install Android SDK Platform Tools and set ANDROID_SDK_ROOT'
  }
  $adb = Join-Path $sdk 'platform-tools\adb.exe'
  if (-not (Test-Path -LiteralPath $adb -PathType Leaf)) {
    throw 'ANDROID_ADB_MISSING: install official Android SDK Platform Tools'
  }
  return $adb
}
function Assert-PrivateWifiEndpoint([string]$value) {
  if ($value -notmatch '^([0-9]{1,3}\.){3}[0-9]{1,3}:([0-9]{1,5})$') {
    throw 'ANDROID_WIFI_IPV4_ENDPOINT_INVALID'
  }
  $parts = $value.Split(':')
  $port = [int]$parts[1]
  if ($port -lt 1024 -or $port -gt 65535) { throw 'ANDROID_WIFI_PORT_INVALID' }
  $ip = $null
  if (-not [Net.IPAddress]::TryParse($parts[0],[ref]$ip)) {
    throw 'ANDROID_WIFI_IP_INVALID'
  }
  $octets = $ip.GetAddressBytes()
  if ($octets.Length -ne 4 -or -not (
    $octets[0] -eq 10 -or
    ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or
    ($octets[0] -eq 192 -and $octets[1] -eq 168)
  )) {
    throw 'ANDROID_WIFI_PRIVATE_LAN_REQUIRED'
  }
  return $value
}
$adb = Resolve-Adb
Write-Host ''
Write-Host '=== MEL Companion : connexion Android par Wi-Fi ===' -ForegroundColor Cyan
Write-Host 'Connexion autorisee uniquement avec le debogage sans fil active sur TON telephone.'
Write-Host 'Les ports d appairage et de connexion sont generalement differents.'
Write-Host ''
Write-Host 'Appareils ADB connus :'
& $adb devices -l
if ($LASTEXITCODE -ne 0) { throw 'ANDROID_ADB_LIST_FAILED' }
if (-not $Pair) {
  Write-Host ''
  Write-Host 'Pour associer le telephone, execute ce script avec -Pair.'
  Write-Host 'Sur Xiaomi : Parametres > Parametres supplementaires > Options developpeur > Debogage sans fil.'
  Write-Host 'Ne communique jamais ton code d appairage dans une conversation.'
  exit 0
}

Write-Host ''
Write-Host 'Sur le telephone : ouvrir Debogage sans fil > Associer appareil avec code d appairage.'
$pairAddress = Assert-PrivateWifiEndpoint (Read-Host 'Adresse IP:port d appairage indiquee sur le telephone')
Write-Host 'ADB demandera maintenant le code. Saisis-le DIRECTEMENT ici dans ce terminal Windows.'
& $adb pair $pairAddress
if ($LASTEXITCODE -ne 0) { throw 'ANDROID_LOCAL_PAIRING_FAILED' }
Write-Host ''
Write-Host 'Revenir a l ecran principal Debogage sans fil et noter Adresse IP et port (port de connexion).'
$connectAddress = Assert-PrivateWifiEndpoint (Read-Host 'Adresse IP:port de debogage')
if ($pairAddress.Split(':')[0] -ne $connectAddress.Split(':')[0]) {
  throw 'ANDROID_WIFI_ENDPOINT_ADDRESS_CHANGED'
}
& $adb connect $connectAddress
if ($LASTEXITCODE -ne 0) { throw 'ANDROID_LOCAL_CONNECT_FAILED' }
$devices = @(& $adb devices -l)
if ($LASTEXITCODE -ne 0) { throw 'ANDROID_ADB_LIST_FAILED' }
$connected = @($devices | Where-Object {
  ([string]$_).StartsWith($connectAddress + [char]9 + 'device') -or
  ([string]$_) -match ('^' + [regex]::Escape($connectAddress) + '\s+device\b')
})
if ($connected.Count -ne 1) {
  throw 'ANDROID_ADB_CONNECTED_DEVICE_NOT_CONFIRMED'
}
Write-Host 'Android Wi-Fi ADB est autorise sur ce PC.' -ForegroundColor Green
Write-Host 'Le Companion peut maintenant auditer le telephone et preparer une installation approuvee.'
Write-Host 'Aucun APK n a ete installe pendant l appairage.'
