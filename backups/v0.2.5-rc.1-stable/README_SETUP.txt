MELITURGOS — CLOUDFLARE AGENT SETUP
==================================

Ce kit suit la configuration recommandée par Cloudflare pour OpenAI Codex :
- Codex
- Cloudflare Skills
- Cloudflare API MCP
- Documentation MCP
- Workers Bindings MCP
- Workers Builds MCP
- Observability MCP
- Wrangler

WINDOWS
-------
Cloudflare recommande WSL2 pour Codex CLI sous Windows.

1. Décompresse ce dossier.
2. Vérifie WSL avec CHECK_WINDOWS_SETUP.ps1.
3. Dans WSL, place-toi dans ce dossier.
4. Exécute :
   bash setup-cloudflare-codex.sh
5. Puis :
   codex
6. Au premier appel Cloudflare, valide l'autorisation OAuth dans le navigateur.

IMPORTANT
---------
Le secret MELITURGOS_PASSWORD n'est volontairement PAS dans wrangler.jsonc.
Ne le mets jamais dans Git ou dans un fichier partagé.

Le projet contient la configuration actuelle :
Worker : meliturgos
D1 : meliturgos-memory
Binding D1 : DB
Workers AI : AI

VERSION ACTIVE
--------------
MELITURGOS Cloud v0.2.2

La recherche mémoire reste volontairement dans D1 : à ce volume, le ranking
lexical adaptatif (12 résultats ciblés, jusqu'à 48 pour les questions globales)
évite une ressource supplémentaire. Vectorize deviendra pertinent seulement
si le corpus ou le besoin de recherche sémantique augmente.

SAUVEGARDE ET ROLLBACK v0.2.2
-----------------------------
Sauvegarde pré-migration :
  backups/2026-09-04-v0.2.1/worker.deployed.js
  backups/2026-09-04-v0.2.1/wrangler.jsonc
  backups/2026-09-04-v0.2.1/meliturgos-memory.sql

Version Worker précédente :
  b836e43d-20e7-4697-9881-c581d06fce2e

Rollback Worker : redéployer cette version à 100 %, ou téléverser
worker.deployed.js avec les bindings hérités en mode strict.

Rollback D1 : la table memories_v021_snapshot contient les 665 lignes
originales. Dans une transaction, renommer memories, recréer memories depuis
le snapshot, puis recréer idx_memories_created et idx_memories_kind. L'export
SQL complet ci-dessus constitue la seconde voie de restauration.

PREMIER PROMPT CODEX
--------------------
Inspecte mon Worker meliturgos, sa base D1 meliturgos-memory et ses logs.
Ne modifie rien pour l'instant. Fais un diagnostic complet, notamment sur
l'erreur "Réponse invalide", les doublons mémoire et les statistiques
d'interactions. Ensuite propose une v0.2.2 avec tests et rollback.
