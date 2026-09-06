# MELITURGOS — MASTER CHECKLIST

> Source de vérité de progression. Statuts : NOT_STARTED | IN_PROGRESS | PARTIAL | BLOCKED_EXTERNAL | BLOCKED_HUMAN | DONE | DONE_VERIFIED.

| ID | OBJECTIVE | STATUS | DEPENDENCIES | FILES | TESTS | PRODUCTION_STATUS | BLOCKER | NEXT_ACTION |
|---|---|---|---|---|---|---|---|---|
| GEN2-01 | Core minimal (config, errors, http, security, audit) | DONE | — | `src/core/*` | `conversation-service.test.mjs`, `chatgpt-context-import.test.mjs` | NON_PROD | — | Stabiliser imports circulaires |
| GEN2-02 | Identity / System Prompt | PARTIAL | Core | `worker.js` systemPrompt, `src/identity/` | manuel | NON_PROD | identity non modularisé | Extraire persona dans `src/identity/` |
| GEN2-03 | Model Registry | NOT_STARTED | Core | `src/models/` | — | NON_PROD | — | Créer ModelRegistry |
| GEN2-04 | Model Router + fallback | PARTIAL | Model Registry | `worker.js` askAI/orchestrationSelection | `orchestration-registry.test.mjs` | SIMULATION_SEULEMENT | fallback par simulation | Implémenter fallback réel |
| GEN2-05 | Model Council / benchmarks | NOT_STARTED | Model Router | `src/evaluation/` | — | NON_PROD | — | Spécifier plus tard |
| GEN2-06 | Conversation Service | IN_PROGRESS | Core, Persistence | `src/conversations/*`, `worker.js` archiveMessage | `conversation-service.test.mjs`, `/api/v1/sync` manuel | NON_PROD | routes Gen2 non câblées | Brancher aux routes chat/professeur |
| GEN2-07 | Sync PC / téléphone | IN_PROGRESS | Conversation Service | `worker.js` syncDevice | — | PARTIAL | pas de client multi-device | Valider `/api/v1/sync` |
| GEN2-08 | Archive exhaustive messages | IN_PROGRESS | Conversation Service | `worker.js` archiveMessage, archiveProfessorMessage | tests D1 mock | PARTIAL | appel conditionnel | Rendre non-conditionnel |
| GEN2-09 | Memory 2.0 (cognitive) | PARTIAL | Core, D1 | `worker.js` memories, `src/memory/` | `conversation-service.test.mjs` | NON_PROD | cycle de vie non implémenté | Créer MemoryService |
| GEN2-10 | Contradictions / provenance / temporalité | PARTIAL | Memory 2.0 | `worker.js` memories columns | — | NON_PROD | — | Algorithme de détection |
| GEN2-11 | Knowledge Graph | PARTIAL | Core | `worker.js` knowledge_* | `conversation-service.test.mjs` | NON_PROD | recherche sémantique absente | Ajouter embeddings |
| GEN2-12 | Timeline | NOT_STARTED | Memory 2.0 | `src/memory/timeline.js` | — | NON_PROD | — | — |
| GEN2-13 | Projects / Decisions | NOT_STARTED | Memory 2.0 | `src/planning/` | — | NON_PROD | — | — |
| GEN2-14 | Capability Bus | PARTIAL | Core, Model Router | `worker.js` TOOL_REGISTRY, toolAvailability | `orchestration-registry.test.mjs` | SIMULATION | pas d'exécution centralisée | Refactoriser tools |
| GEN2-15 | Plugin SDK | NOT_STARTED | Capability Bus | `src/plugins/` | — | NON_PROD | — | — |
| GEN2-16 | Module Lab | PARTIAL | Capability Bus | `src/router.js`, `src/modules/` | — | NON_PROD | — | Prototyper runner |
| GEN2-17 | Dev Agent / auto-évolution | NOT_STARTED | Module Lab, Git | `src/agents/dev-agent.js` | — | NON_PROD | Git remote inconnu | Configurer Git remote |
| GEN2-18 | Self Healing | NOT_STARTED | Dev Agent, Monitoring | `src/agents/self-healing.js` | — | NON_PROD | — | — |
| GEN2-19 | Professor / Teachers | PARTIAL | Core | `worker.js` professor* | `specialists-router.test.mjs` | PARTIAL | médias professeur désactivés | Stabiliser endpoints |
| GEN2-20 | Learning Engine | PARTIAL | Core | `worker.js` learning_* | — | PARTIAL | pas de spaced repetition actif | Activer reviews |
| GEN2-21 | Media Service — images | PARTIAL | Core, R2 | `worker.js` media*, rootFileAnalyze | `root-media-video.test.mjs` | DISABLED | `MEDIA_FEATURE_ENABLED=false` | Valider modèles vision |
| GEN2-22 | Media Service — audio / voix | PARTIAL | AI binding | `worker.js` voiceTranscribe, voiceSpeak | manuel | PARTIAL | transcription 15 Mo max | Évaluer limites |
| GEN2-23 | Media Service — vidéo | PARTIAL | R2 | `worker.js` rootFileAnalyze | `root-media-video.test.mjs` | DISABLED | pas de modèle vidéo | Attendre modèles |
| GEN2-24 | Media Service — documents | PARTIAL | AI | `worker.js` rootFileAnalyze | — | PARTIAL | extraction PDF limitée | Améliorer parsers |
| GEN2-25 | Personal Search / RAG | NOT_STARTED | Knowledge Graph, Archive | `src/search/` | — | NON_PROD | — | — |
| GEN2-26 | PWA | PARTIAL | UI | `worker.js` ROOT_PAGE, manifest | manuel | PARTIAL | pas de service worker avancé | Ajouter SW/cache |
| GEN2-27 | Android Companion | NOT_STARTED | Device Bus | `companions/android/` | — | NON_PROD | compétence mobile requise | Décider stack |
| GEN2-28 | Windows Companion | NOT_STARTED | Device Bus | `companions/windows/` | — | NON_PROD | — | — |
| GEN2-29 | Device Bus | IN_PROGRESS | Conversation Service | `worker.js` syncDevice, devices table | `/api/v1/sync` manuel | NON_PROD | pas de clients réels | Protocole sync |
| GEN2-30 | Computer Use abstraction | NOT_STARTED | Device Bus, Sandbox | `src/devices/computer-use.js` | — | NON_PROD | sécurité élevée | Spécifier sandbox |
| GEN2-31 | Browser capability | NOT_STARTED | Computer Use | `src/devices/browser.js` | — | NON_PROD | — | — |
| GEN2-32 | Connector SDK | PARTIAL | Core | `worker.js` CONNECTOR_REGISTRY | `orchestration-registry.test.mjs` | DÉCLARATIF_UNIQUEMENT | OAuth manquant | Implémenter OAuth flow |
| GEN2-33 | Gmail / Google connector | NOT_STARTED | Connector SDK | `src/connectors/google.js` | — | NON_PROD | OAuth non configuré |BLOCKER_HUMAN |
| GEN2-34 | Outlook / Microsoft connector | NOT_STARTED | Connector SDK | `src/connectors/microsoft.js` | — | NON_PROD | OAuth non configuré |BLOCKER_HUMAN |
| GEN2-35 | OneDrive / SharePoint connector | NOT_STARTED | Connector SDK | `src/connectors/microsoft.js` | — | NON_PROD | OAuth non configuré |BLOCKER_HUMAN |
| GEN2-36 | GitHub / Cloudflare / Vercel connector | NOT_STARTED | Connector SDK | `src/connectors/dev.js` | — | NON_PROD | tokens requis |BLOCKER_HUMAN |
| GEN2-37 | Web / research connector | PARTIAL | Knowledge Graph | `worker.js` knowledge sources web | — | SIMULATION | scraping limité | Évaluer APIs |
| GEN2-38 | Tasks / goals / planning | PARTIAL | Core | `worker.js` tasks endpoint | `orchestration-registry.test.mjs` | SIMULATION | exécution réelle bloquée | Spécifier planning engine |
| GEN2-39 | Agents / automations | NOT_STARTED | Capability Bus, Event Bus | `src/agents/`, `src/automations/` | — | NON_PROD | — | — |
| GEN2-40 | Event bus / follow-ups / open loops | NOT_STARTED | Automations | `src/automations/event-bus.js` | — | NON_PROD | — | — |
| GEN2-41 | Notifications | NOT_STARTED | Automations | `src/automations/notifications.js` | — | NON_PROD | pas de push service | Évaluer Web Push |
| GEN2-42 | Capability Watch | NOT_STARTED | Evaluation | `src/evaluation/capability-watch.js` | — | NON_PROD | — | — |
| GEN2-43 | Model Watch | NOT_STARTED | Evaluation | `src/evaluation/model-watch.js` | — | NON_PROD | — | — |
| GEN2-44 | Observability / diagnostics | PARTIAL | Core | `worker.js` status/diagnostic | `orchestration-registry.test.mjs` | PARTIAL | pas d'audit persistant | AuditService persist |
| GEN2-45 | Audit log | IN_PROGRESS | Core | `src/audit/audit-service.js` | — | NON_PROD | persistance future | Câbler persistance |
| GEN2-46 | Secrets / authentication | PARTIAL | Core | `worker.js` authorized, secret() | `orchestration-registry.test.mjs` | PARTIAL | Basic Auth unique | Auth v2 future |
| GEN2-47 | Backups / export | PARTIAL | Core | `worker.js` exportData | manuel | PARTIAL | pas de schedule | Automatiser backup |
| GEN2-48 | Restore / disaster recovery | PARTIAL | Backups | `backups/`, rollback.md | — | PARTIAL | pas testé end-to-end | Drill restore |
| GEN2-49 | Portability | NOT_STARTED | Backups | `src/backup/` | — | NON_PROD | — | — |
| GEN2-50 | MCP compatibility | NOT_STARTED | Capability Bus | `src/api/mcp/` | — | NON_PROD | — | — |
| GEN2-51 | API versioning | PARTIAL | Router | `worker.js` `/api/v1/sync` | — | NON_PROD | routes anciennes non versionnées | Migrer `/api/` vers `/api/v1/` |
| GEN2-52 | Prompt/strategy versioning | NOT_STARTED | Identity | `src/identity/` | — | NON_PROD | — | — |
| GEN2-53 | Canary / rollback | PARTIAL | Git | `backups/`, tags | — | PARTIAL | pas de CI/CD | Mise en place workflow manuel |
| GEN2-54 | Control Center / Developer Dashboard | NOT_STARTED | UI | `src/ui/` | — | NON_PROD | — | — |
| GEN2-55 | Data integrity / final maturity tests | NOT_STARTED | Tous | `tests/final-maturity.test.mjs` | — | NON_PROD | attendre stabilité | — |
| GEN2-56 | Import contexte ChatGPT | DONE_VERIFIED | Memory 2.0 | `src/persistence/chatgpt-import.js`, `/api/import/chatgpt-context` | `chatgpt-context-import.test.mjs` | NON_PROD | Fichier ChatGPT JSON non présent | Import réel bloqué par H-A-14 ; simulation OK |
| GEN2-57 | Migration Gen1 sans perte | IN_PROGRESS | Archive | `worker.js` archiveMessage | — | NON_PROD | interactions toujours source primaire | Migrer legacy |
| GEN2-58 | Build réel Android | NOT_STARTED | Android Companion | `companions/android/` | — | NON_PROD | stack non choisie |BLOCKER_HUMAN |
| GEN2-59 | Build réel Windows | NOT_STARTED | Windows Companion | `companions/windows/` | — | NON_PROD | stack non choisie |BLOCKER_HUMAN |
| GEN2-60 | Completion matrix | NOT_STARTED | Tous | `docs/completion-matrix.md` | — | NON_PROD | — | Rédiger en fin |
| GEN2-61 | Final status report | NOT_STARTED | Tous | `docs/final-status-report.md` | — | NON_PROD | — | Rédiger en fin |
| GEN2-62 | human-actions-required | NOT_STARTED | Tous | `docs/human-actions-required.md` | — | NON_PROD | — | Rédiger maintenant |
| GEN2-63 | Règle NON-IDLE / continue-when-blocked | IN_PROGRESS | Process | ce fichier | — | ACTIF | — | Appliquer systématiquement |

## Métriques rapides

- Tests passants : 17/17
- Version actuelle code : `0.2.5-rc.1-gen2-phase1`
- Branche : `meliturgos-gen2`
- Dernier tag : `v0.2.5-rc.1-gen2-phase1`
- Backup stable : `backups/v0.2.5-rc.1-stable/`, tag `v0.2.5-rc.1`

## Règles d'utilisation

- Avant chaque session : relire ce fichier, `docs/MELITURGOS-MASTER-SPEC.md`, `docs/gen2-progress.md`, `docs/gen2-resume.md`.
- Mettre à jour le statut immédiatement après une avancée ou un blocage.
- Utiliser `BLOCKED_EXTERNAL` pour dépendances fournisseurs/outils.
- Utiliser `BLOCKED_HUMAN` pour secrets, OAuth, DNS, paiement, choix de stack.

