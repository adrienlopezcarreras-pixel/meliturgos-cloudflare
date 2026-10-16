# Launch the read-only MEL Companion MCP stdio adapter on Windows.
# Configure MEL_MCP_SERVER_URL and MEL_MCP_OWNER_TOKEN in the local MCP client's secret environment.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$adapter=Join-Path $PSScriptRoot 'mel-companion-mcp.mjs'
if (-not (Test-Path -LiteralPath $adapter -PathType Leaf)) { $adapter=Join-Path $root 'tools\mel-companion-mcp.mjs' }
if (-not (Test-Path -LiteralPath $adapter -PathType Leaf)) { throw 'MEL_MCP_ADAPTER_MISSING' }
if ([string]::IsNullOrWhiteSpace($env:MEL_MCP_SERVER_URL) -or [string]::IsNullOrWhiteSpace($env:MEL_MCP_OWNER_TOKEN)) { throw 'MEL_MCP_CONFIGURATION_MISSING' }
if ($env:MEL_MCP_OWNER_TOKEN.Length -gt 4096 -or $env:MEL_MCP_OWNER_TOKEN -match '[\r\n]') { throw 'MEL_MCP_OWNER_TOKEN_INVALID' }
$serverUri=$null
if (-not [Uri]::TryCreate($env:MEL_MCP_SERVER_URL,[UriKind]::Absolute,[ref]$serverUri) -or $serverUri.Scheme -ne 'https' -or -not $env:MEL_MCP_SERVER_URL.EndsWith('/') -or -not [string]::IsNullOrEmpty($serverUri.UserInfo) -or -not [string]::IsNullOrEmpty($serverUri.Query) -or -not [string]::IsNullOrEmpty($serverUri.Fragment) -or $serverUri.AbsolutePath -ne '/') { throw 'MEL_MCP_SERVER_URL_INVALID' }
$node=Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'MEL_MCP_NODE_MISSING' }
$versionLine=(& $node.Source --version 2>$null)
if ($LASTEXITCODE -ne 0 -or $versionLine -notmatch '^v(\d+)\.') { throw 'MEL_MCP_NODE_VERSION_UNAVAILABLE' }
if ([int]$Matches[1] -lt 22) { throw 'MEL_MCP_NODE_22_REQUIRED' }
& $node.Source $adapter
exit $LASTEXITCODE
