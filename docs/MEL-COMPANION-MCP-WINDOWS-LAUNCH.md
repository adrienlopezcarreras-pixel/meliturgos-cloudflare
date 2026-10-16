# MEL Companion MCP — Windows local launch

This is a local **read-only** MCP stdio server. It is not a hosted MCP connector, a Windows installer, or proof of a live ChatGPT connection.

1. Install Node.js 22+ locally and obtain an authorized MEL owner token through the existing MEL owner process.
2. In a trusted local MCP client's secret/environment configuration set `MEL_MCP_SERVER_URL` to the MEL HTTPS origin (for example, `https://your-mel-server.example/`) and `MEL_MCP_OWNER_TOKEN` to the secret owner token. Never commit or paste the token into a repository, command line, or chat.
3. From the **extracted Windows release ZIP**, configure the MCP client to launch PowerShell using `-NoProfile -NonInteractive -File <extracted-folder>\\Start-MEL-Companion-MCP.ps1`. If working from the source repository instead, use `<repository>\\windows-companion\\Start-MEL-Companion-MCP.ps1`. The script needs no token argument.
4. Confirm `tools/list` exposes only `mel_companion_status` and an authenticated status request returns the expected device. Do not describe the connection as live before this verification.

If Node, the adapter, or environment variables are missing, the launcher fails closed. The server cannot execute shell commands, install apps, or control the PC. The owner's client must support local stdio MCP; remote ChatGPT plugins are not automatically connected.
