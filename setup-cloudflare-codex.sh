#!/usr/bin/env bash
set -euo pipefail

echo "=== MELITURGOS + Cloudflare agent setup ==="

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js est requis dans WSL2. Installe Node.js LTS puis relance ce script."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm est requis."
  exit 1
fi

echo "[1/5] Installation des dépendances du projet..."
npm install

echo "[2/5] Installation de Codex..."
npm install -g @openai/codex

echo "[3/5] Installation des Cloudflare Skills..."
npx --yes skills add https://github.com/cloudflare/skills

echo "[4/5] Ajout des serveurs MCP Cloudflare..."
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp || true
codex mcp add cloudflare-docs --url https://docs.mcp.cloudflare.com/mcp || true
codex mcp add cloudflare-bindings --url https://bindings.mcp.cloudflare.com/mcp || true
codex mcp add cloudflare-builds --url https://builds.mcp.cloudflare.com/mcp || true
codex mcp add cloudflare-observability --url https://observability.mcp.cloudflare.com/mcp || true

echo "[5/5] Vérification..."
codex mcp list || true

echo
echo "SETUP TERMINÉ."
echo "Lance maintenant : codex"
echo "Au premier appel à un outil Cloudflare, complète l'autorisation OAuth dans ton navigateur."
echo
echo "Premier prompt conseillé dans Codex :"
echo "Inspecte mon Worker meliturgos, sa D1 meliturgos-memory et ses logs. Ne modifie rien pour l'instant. Fais un diagnostic complet."
