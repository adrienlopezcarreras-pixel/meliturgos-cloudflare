# MELITURGOS — MASTER SPECIFICATION

> **Source de vérité du projet MELITURGOS.**
> Version : 0.2.5-gen2.1
> Dernière mise à jour : 2026-09-06
> Propriétaire : Adrien Lopez
> Objectif final : transformer MELITURGOS en agent personnel IA Gen 2 sur Cloudflare Workers.

---

## 1. VISION

MELITURGOS est un agent IA personnel, stateful, multimodal, autonome dans ses capacités de développement, et contrôlé par son propriétaire.

- Identité stable et portable indépendamment du modèle d'IA sous-jacent.
- Mémoire cognitive durable séparée de l'archive exhaustive des conversations.
- Synchronisation multi-appareils (PC, téléphone, futurs companions).
- Capacités extensibles via plugins, modules et connecteurs.
- Auto-développement supervisé : l'agent peut modifier son propre code sur une branche `staging`, tester, et demander validation avant production.
- Jamais d'écrasement silencieux de la version stable.

---

## 2. ARCHITECTURE CIBLE GEN 2

### 2.1 Core minimal
- Configuration centralisée (`src/core/config.js`).
- Erreurs typées (`src/core/errors.js`).
- Helpers HTTP/JSON/HTML (`src/core/http.js`).
- Sécurité : Basic Auth, CSRF, rate-limit, body-limit, secret-filter (`src/core/security.js`).
- Audit log : logging structuré, propagation via headers, persistance future (`src/audit/audit-service.js`).

### 2.2 Identity / System Prompt
- Persona MELITURGOS versionnée.
- Prompt système construit à partir de l'identité + contexte propriétaire + mémoire active.
- Séparation forte entre identité et modèle exécutant.

### 2.3 Conversation Service
- Tables : `conversations`, `devices`, `archive_messages`, `sync_checkpoints`.
- Chaque message intégral archivé : utilisateur, assistant, professeur, autres agents, timestamp, conversation, appareil, pièces jointes, provenance.
- API `/api/v1/conversations/*` + `/api/v1/sync`.
- L'archive ne doit jamais être perdue par un résumé.

### 2.4 Memory 2.0
- Service centralisé `MemoryService`.
- Cycle de vie : OBSERVED → CANDIDATE → CONFIRMED → ACTIVE → SUPERSEDED.
- Distinction archive vs mémoire cognitive.
- Gestion des contradictions, provenance, temporalité (`valid_from`, `valid_until`, `supersedes_id`).
- Import sûr depuis contexte externe (ex. ChatGPT) avec `source_type`, déduplication, préservation de l'incertitude.

### 2.5 Knowledge Graph
- Sources, passages, imports, droits, révocation.
- Lien mémoire cognitive ↔ connaissances extérieures.
- Recherche sémantique et factuelle future.

### 2.6 Timeline
- Séquence temporelle des événements importants (santé, famille, projets, décisions).
- Alimentée par l'archive et les mémoires épisodiques.

### 2.7 Projects / Decisions
- Entités projet avec objectifs, décisions, leçons.
- Suivi des décisions passées et de leur statut.

### 2.8 Model Registry / Model Router / Model Council
- `ModelRegistry` : liste des modèles supportés avec capacités, coûts, limitations.
- `ModelRouter` : sélection du modèle selon la tâche (conversation, raisonnement, code, vision, audio, génération média).
- Fallback automatique si un modèle échoue.
- Support futur de modèles externes.
- Modèle de code actuel : `@cf/moonshotai/kimi-k2.7-code`.
- Modèles par défaut actuels : GLM/Gemma/Llama pour compatibilité Cloudflare.

### 2.9 Capability Bus
- Registre unifié des capacités (tools, skills, connectors, modules).
- État `available | disabled | unavailable` avec raison explicite.
- Exécution contrôlée : simulation, approval, permissions.

### 2.10 Plugin SDK
- Format de plugin déclaratif.
- Chargement supervisé.
- Pas d'exécution aveugle de code tiers.

### 2.11 Module Lab
- Espace de prototypage de modules.
- Dev Agent : propose, génère, teste, déploie en staging.

### 2.12 Dev Agent / Auto-évolution
MELITURGOS doit pouvoir :
1. Détecter une capacité manquante.
2. Rechercher de la documentation.
3. Écrire un module candidat.
4. Modifier son propre code.
5. Créer une branche `staging`.
6. Écrire et lancer des tests.
7. Lancer une version staging.
8. Comparer les résultats.
9. Demander validation avant production.
10. Revenir automatiquement à la dernière version stable si nécessaire.

### 2.13 Professor / Teachers / Learning Engine
- Mode Professeur existant conservé.
- Session, tour, correction, leçon, retest.
- Learning profile, topics, reviews spaced-repetition.

### 2.14 Media Service
- Stockage R2 privé.
- Image, audio, voix, vidéo, documents.
- Analyse multimodale quand modèles disponibles.
- Uploads désactivés par défaut (`MEDIA_FEATURE_ENABLED=false`) jusqu'à validation.

### 2.15 Personal Search / RAG
- Recherche unifiée dans archive, mémoires, connaissances.
- RAG avec citations de provenance.

### 2.16 PWA / Android Companion / Windows Companion / Device Bus
- PWA web existante.
- Companions natifs Android/Windows à construire.
- `DeviceBus` : enregistrement, appairage, synchronisation.

### 2.17 Computer Use / Browser Capability
- Abstraction computer-use (future).
- Browser capability supervisée, sandboxée, avec consentement.

### 2.18 Connector SDK
- Connecteurs déclarés en lecture seule par défaut : Gmail, Google Agenda, Google Drive, Outlook, OneDrive, SharePoint, GitHub, Cloudflare, Vercel.
- OAuth séparé, jamais de secrets stockés en clair.

### 2.19 Tasks / Goals / Planning / Agents / Automations
- Task queue, goal tracking, planning.
- Agents autonomes en mode simulation d'abord.
- Automations : event bus, follow-ups, open loops, notifications.

### 2.20 Evaluation
- Final maturity tests.
- Capability Watch, Model Watch.
- Benchmark/shadow testing.

### 2.21 Observability / Diagnostics / Audit
- `/api/status`, `/api/diagnostic`.
- Audit log structuré.
- Health logging.

### 2.22 Security / Secrets / Auth
- Basic Auth actuel conservé.
- Secrets jamais dans D1, logs, mémoire exportable.
- Policy Layer centralisée future remplaçant les restrictions dispersées.

### 2.23 Backups / Export / Restore / Disaster Recovery / Portability
- Backup automatique avant migration.
- Export/import JSON.
- Rollback rapide.

### 2.24 API Versioning / Prompt Versioning
- `/api/v1/` pour nouveaux services.
- Versionning des prompts et stratégies.

### 2.25 Canary / Rollback
- Branche `staging` obligatoire avant `main`.
- Déploiement canary.
- Rollback automatique vers dernier tag stable si tests/staging échouent.

### 2.26 Control Center / Developer Dashboard
- Interface d'administration et de supervision.

### 2.27 MCP (Model Context Protocol)
- Conformité future avec standards d'interopérabilité d'agents.

### 2.28 Fault Injection
- Tests de résilience : indisponibilité modèle, binding manquant, timeout.

### 2.29 Import Contexte ChatGPT
- Importer le contexte personnel exporté (`MELITURGOS_CONTEXT_TRANSFER_MAX_*.json`).
- Stocker comme mémoires `source_type=chatgpt_context_summary`.
- Préserver incertitude, dates, classification sensible.
- Lier aux sources originales futures sans écraser.

### 2.30 Migration Gen1 sans perte
- Conserver `memories`, `interactions`, `knowledge_*`, `media_assets`, `professor_*`, `learning_*`.
- Migrer `interactions` vers `archive_messages` avec `conversation_id="legacy"`.

### 2.31 Builds Natifs
- Build réel Android (TBD).
- Build réel Windows (TBD).

### 2.32 Completion Matrix
- Tableau final des capacités : planifié / partiel / terminé / vérifié.

### 2.33 Final Status Report / human-actions-required
- Rapport de fin de projet.
- Liste des actions nécessitant un humain (secrets, OAuth, DNS, paiement).

### 2.34 Règle NON-IDLE / continue-when-blocked
- Si une tâche bloque : marquer BLOCKED, documenter, checkpoint, continuer sur une tâche indépendante.
- Ne jamais attendre Adrien si du travail réalisable reste disponible.

---

## 3. PRINCIPES NON NÉGOCIABLES

1. **Ne jamais écraser silencieusement la version stable.**
2. **Séparer archive et mémoire cognitive.**
3. **Ne jamais stocker de secrets dans D1, logs ou mémoire exportable.**
4. **Tester avant fusion.**
5. **Toute action externe réelle nécessite consentement explicite.**
6. **Documenter chaque blocker humain/externe.**
7. **La MASTER-SPEC et la MASTER-CHECKLIST sont la source de vérité.**

---

## 4. MODÈLES ET FOURNISSEURS

Modèle de code actuel : `@cf/moonshotai/kimi-k2.7-code`
Modèles supportés actuellement : Cloudflare Workers AI
Modèles futurs : externes, ajoutables via ModelRegistry.
L'identité de MELITURGOS ne dépend jamais d'un modèle unique.

---

## 5. RESTRICTIONS APPLICATIVES ACTUELLES (AVANT POLICY LAYER)

| Fichier | Fonction | Rôle | Origine |
|---------|----------|------|---------|
| worker.js | `governanceStatus` | Blocage actions extern_write, email, message, publication, purchase, delete | Application |
| worker.js | `taskEndpoint` | Simulation obligatoire ou approval explicite pour actions non read | Application |
| worker.js | `securityGate` | CSRF origin, rate limit 60 req/min, body 1 Mo | Application |
| worker.js | `authorized` | Basic Auth obligatoire | Application |
| worker.js | `secret()` | Rejet de chaînes ressemblant à des secrets | Application |
| worker.js | `MEDIA_FEATURE_ENABLED=false` | Upload multimédia désactivé par défaut | Application |
| worker.js | `voiceTranscribe` | Langue forcée `fr`, max 15 Mo | Application |
| worker.js | `ORCHESTRATION_LIMITS` | Max 2 appels modèles, $0.01, 12 000 caractères | Application |
| Fournisseurs LLM | Modèles Cloudflare | Contenu refusé selon leurs règles | Fournisseur |

Objectif futur : remplacer ces restrictions dispersées par une `PolicyLayer` centralisée, explicite et configurable.

---

## 6. COMMANDES DE TEST DE RÉFÉRENCE

```bash
node --check worker.js          # syntaxe production actuelle
node --check src/index.js       # syntaxe Gen2
node tests/*.test.mjs           # tests ciblés
npm test                        # suite complète
```

---

## 7. COMMANDES DE ROLLBACK

```bash
git checkout main
cp backups/gen1-final/code/worker.js ./worker.js
cp backups/gen1-final/config/wrangler.jsonc ./wrangler.jsonc
cp backups/gen1-final/config/package.json ./package.json
```

Version stable taguée : `v0.2.5-rc.1`

---

## 8. PROCHAIN ÉTAT CIBLE IMMÉDIAT

1. Finaliser `src/core/*` (fait partiellement).
2. Raccorder `ConversationService` aux routes `/api/chat` et `/api/professor/ask`.
3. Valider les tables Gen2 via `/api/v1/sync`.
4. Corriger tous les tests existants.
5. Importer le contexte ChatGPT JSON.
6. Committer et taguer `v0.2.5-rc.2-gen2.1`.

---

*Ce document est vivant. Toute modification majeure doit être commitée et reflétée dans MASTER-CHECKLIST.*
