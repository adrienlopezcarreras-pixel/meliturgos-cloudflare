# Launch the read-only MEL Companion MCP stdio adapter on Windows.
# Configure MEL_MCP_SERVER_URL and MEL_MCP_OWNER_TOKEN in the local MCP client's secret environment.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$adapter=Join-Path $root 'tools\mel-companion-mcp.mjs'
if (-not (Test-Path -LiteralPath $adapter -PathType Leaf)) { throw 'MEL_MCP_ADAPTER_MISSING' }
if ([string]::IsNullOrWhiteSpace($env:MEL_MCP_SERVER_URL) -or [string]::IsNullOrWhiteSpace($env:MEL_MCP_OWNER_TOKEN)) { throw 'MEL_MCP_CONFIGURATION_MISSING' }
$node=Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'MEL_MCP_NODE_MISSING' }
& $node.Source $adapter
exit $LASTEXITCODE
