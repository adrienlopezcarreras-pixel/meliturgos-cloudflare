# MELITURGOS GEN2 — RAPPORT D'ÉTAT ACTUEL (PHASE 1)

> Généré après inspection du dépôt, exécution des tests et analyse de worker.js.
> Aucun fichier de production n'a été modifié pendant la phase audit.

## CURRENT STATE

- Branche active : `meliturgos-gen2`
- Last stable (HEAD) : `daa0dde` — "GEN1 FINAL: backup, schema, config, worker, tests, runner, docs"
- Version tag : `v0.2.5-rc.1`
- Version package.json : `0.2.5-rc.2-gen2.1` (modifiée localement, non commitée)
- Version worker.js : `0.2.5-rc.1`
- Point d'entrée déployé actuel : `worker.js` (monolithique ~247 lignes minifiées)
- Nouveau point d'entrée Gen2 créé : `src/index.js` + `src/router.js` (non encore câblé dans wrangler.jsonc)

## WHAT WORKS

- Authentification Basic Auth via `MELITURGOS_PASSWORD`.
- Chat textuel basique avec mémoire D1 (`memories`, `interactions`).
- Import/export de mémoire au format MELITURGOS.
- Mode Professeur (interface et endpoints API) — partiel, stabilisé en lecture/simulation.
- Transcription vocale via `@cf/openai/whisper-large-v3-turbo` si binding AI présent.
- Synthèse vocale via navigateur + endpoint `/api/voice/speak` (`@cf/deepgram/aura-1`).
- Upload média R2 privé et accès authentifié.
- Analyse de fichiers en lecture (TXT, image, MP3, vidéo, ZIP, JS) — sans écriture.
- Gestion des tâches autonomes en mode simulation (pas d'exécution réelle externe).
- Registre de modules / connecteurs en mode déclaratif.
- Tests Gen1 validés (14/14 evaluation benchmark stable/candidate).

## WHAT IS BROKEN

1. **Synchronisation PC/téléphone non corrigée**
   - Aucune table `devices` ou `conversations` normalisée n'est activement utilisée par les routes existantes.
   - Le chat via `/api/chat` enregistre dans `interactions` (utilisateur + assistant) mais sans `conversation_id`, sans `device_id`, sans idempotence.
   - La lecture par un autre appareil ne peut pas reconstruire la conversation ; la synchronisation repose sur `interactions` globales, pas sur un thread partagé.

2. **Tests échouant (4/16)**
   - `orchestration-registry.test.mjs` : attend `status: "disabled"`, obtient `"available"`.
   - `root-media-video.test.mjs` : attend un contenu "Assistant vidéo" ; reçoit la page HTML principale (route non spécialisée ou test obsolète).
   - `specialists-router.test.mjs` : similaire, attend une réponse structurée ; reçoit du HTML.
   - `workflow-improvement.test.mjs` : le texte généré par le worker mentionne "training/LoRA/retrain" mais le test interdit ces termes ; faux positif sémantique.

3. **Code dupliqué / monolithique**
   - Tout est dans `worker.js` (minifié/compacté, ~2,3 Mo à cause de l'avatar encodé en base64).
   - Plusieurs fonctions `json`, `html`, `authorized`, `ClientError` existent en dur dans worker.js alors que des versions modulaires ont été créées dans `src/core/`.
   - `src/router.js` importe `worker.js` par défaut pour déléguer, créant un risque de conflit de définitions.

4. **wrangler.jsonc non mis à jour**
   - `main: "worker.js"` pointe toujours l'ancien monolithe.
   - Le nouveau `src/index.js` n'est pas l'entrée de production.

5. **Divergence de versions**
   - `worker.js` annonce `0.2.5-rc.1` ; `package.json` annonce `0.2.5-rc.2-gen2.1`.
   - L'interface HTML affiche encore "Cloud v0.2.2".

## WHAT IS MISSING

- ConversationService centralisé connecté aux routes existantes.
- Tables Gen2 actives : `conversations`, `devices`, `archive_messages`, `sync_checkpoints`.
- Modèle de données `messages` (conversation parentée, device_id, attachments, model, provenance).
- API `/api/v1/conversations/*`.
- ModelRouter externe/fallback réel (uniquement simulation actuellement).
- Capability Bus exécutable.
- Plugin SDK / Module Lab exécutables.
- Dev Agent connecté au code.
- AutonomyCoordinator / SelfHealingEngine.
- Companions Android/Windows (hors spécifications textuelles).
- Voice mode continu et wake word.
- Personal Search / RAG Engine.
- Projects, Tasks, Goals, Knowledge Graph.
- Connecteurs OAuth (Gmail, Calendar, Drive, Outlook, GitHub, etc.).
- Audit log persistant.
- Backup/Restore automatisé et vérifié.
- Git rollback full opérationnel.

## DATA AT RISK

- **Aucun message n'est associé à une conversation** : en cas de perte de `interactions`, le contexte conversationnel disparaît.
- **Aucun device_id archivé** : impossibilité de synchroniser proprement.
- **Pas d'intégrité checksum** sur l'archive.
- **Export/Import actuel ne migre pas vers la nouvelle archive** : double source de vérité possible si on déploie Gen2 sans migration.
- **Avatar en base64 dans worker.js** : binaire source, non versionné séparément, augmente drastiquement la taille du worker.

## ARCHITECTURAL PROBLEMS

1. **Monolithe `worker.js` comme seule source de vérité d'exécution.**
2. **Modularisation Gen2 non branchée au runtime.**
3. **Routes `/api/` et pages HTML mélangées dans un même fichier.**
4. **Modèle en mémoire `interactions` (utilisateur+assistant fusionnés) insuffisant pour multi-device.**
5. **Absence de couche d'abstraction Models : env.AI appelé directement partout.**
6. **Absence de Policy Layer centralisée : restrictions dispersées dans `governanceStatus`, `taskEndpoint`, `securityGate`, UI texte.**
7. **Pas de versionnement d'API : tous les endpoints sont `/api/...` directement.**
8. **Aucun test end-to-end multi-device.**

## GEN 2 TARGET ARCHITECTURE (vision cible)

```text
src/
  core/            config, errors, http helpers, security, audit
  identity/        persona MELITURGOS versionnée
  conversations/   ConversationService, archive, sync, device registry
  memory/          MemoryService, lifecycle, contradictions
  models/          ModelRegistry, ModelRouter, providers, fallback
  media/           MediaService, R2 adapters, image/audio/video pipeline
  capabilities/    Capability Bus, registry, execution
  plugins/         Plugin SDK, manifest, sandbox, marketplace local
  modules/         Module Lab, Dev Agent, auto-prototyping
  connectors/      Connector SDK, OAuth adapters
  devices/         DeviceBus, pairing, Android/Windows companions
  professors/      Professor Bridge, Teacher Network, Lesson Engine
  agents/          Orchestrator, Agent Task Queue
  automations/     Scheduler, Event Bus, Follow-up Engine
  planning/        Goals, Tasks, Planner
  search/          Personal Search, RAG Engine
  evaluation/      Benchmark Lab, Shadow Mode
  security/        Policy Layer, secrets, auth v2
  backup/          Export/Import, restore, disaster recovery
  api/             route handlers v1
  ui/              HTML/PWA fragments
  index.js         bootstrap
  router.js        routing
```

## MIGRATION PLAN

1. **Phase 1 (en cours) : socle sécurisé**
   - Finaliser `src/core/*` (config, errors, http, security, audit).
   - Terminer `ConversationService` avec D1 migrations.
   - Créer routes `/api/v1/conversations/*` et tests.
   - Basculer `wrangler.jsonc` vers `src/index.js` en environnement de développement d'abord.
   - Conserver `worker.js` comme fallback immédiat (`main: worker.js` reste production jusqu'à validation).

2. **Phase 2 : archive exhaustive + multi-device**
   - Brancher `/api/chat` et `/api/professor/*` sur `ConversationService.archiveMessage`.
   - Migrer les anciennes `interactions` vers `archive_messages` avec `conversation_id="legacy"`.
   - Ajouter `device_id` et idempotence côté client.
   - Implémenter `/api/v1/sync`.

3. **Phase 3 : mémoire cognitive**
   - Créer `MemoryService` avec lifecycle (OBSERVED → CANDIDATE → CONFIRMED → ACTIVE → SUPERSEDED).
   - Séparer `memories` cognitives de `archive_messages`.

4. **Phase 4 : models et fallback**
   - Créer `ModelRegistry` et `ModelRouter`.
   - Implémenter fallback réel entre modèles Cloudflare.

5. **Phase 5+ : capabilities, plugins, devices, etc.**

## WHAT MUST BE PRESERVED

- Toutes les données Gen1 (`memories`, `interactions`, `knowledge_*`, `media_assets`, `professor_*`, `learning_*`).
- Authentification existante (pas de lockout).
- URL de production existante.
- Export/Import existant pendant la migration.
- Mode Professeur existant (même si simulé partiellement).

## FIRST SAFE DEVELOPMENT STEP

1. Corriger `wrangler.jsonc` pour pointer vers `src/index.js` en local/dev uniquement ; garder `worker.js` comme production temporaire.
2. Vérifier que `src/router.js` ne recharge pas `worker.js` de manière circulaire en dev ; ajuster le fallback.
3. Connecter `ConversationService` aux routes `/api/chat` et `/api/professor/ask` via intercepteur `withConversationArchive`.
4. Ajouter migration réversible pour créer les tables Gen2.
5. Aligner les tests existants (corriger les 4 tests échouants).
6. Commit et smoke test local avant tout déploiement.

## INVENTORY DES RESTRICTIONS / POLITIQUES ACTUELLES

| Fichier | Fonction | Rôle | Origine | Source |
|---------|----------|------|---------|--------|
| worker.js | `governanceStatus` | Blocage actions extern_write, email, message, publication, purchase, delete | Code MELITURGOS | Application |
| worker.js | `taskEndpoint` | Exige `simulation=true` ou `explicit_approval=true` pour actions non read ; refuse exécution réelle externe | Code MELITURGOS | Application |
| worker.js | `securityGate` | CSRF origin/site check, rate limit 60 req/min, max body 1 Mo | Code MELITURGOS | Application |
| worker.js | `publicError` | Masque erreurs DB/AI en messages génériques | Code MELITURGOS | Application |
| worker.js | `authorized` | Authentification Basic Auth obligatoire si mot de passe configuré | Code MELITURGOS | Application |
| worker.js | Modèles disponibles UI | Propose GLM/Gemma/Llama, pas Kimi dans la `<select>` HTML | Code MELITURGOS | Application (incohérence) |
| worker.js | `modelChoice`/`orchestrationSelection` | Limite à 2 appels modèle, coût max $0.01 | Code MELITURGOS | Application |
| worker.js | `voiceTranscribe` | Langue forcée `"fr"`, max 15 Mo | Code MELITURGOS | Application |
| worker.js | Contenu généré | Peut refuser selon prompt système interne | Fournisseur LLM | Provider |

> Note : actuellement, `@cf/moonshotai/kimi-k2.7-code` est codé dans les prompts et expectations utilisateur mais n'est pas la valeur par défaut dans l'UI (`<select>`) ; ce n'est pas une restriction du fournisseur, c'est une incohérence applicative.

## PROCHAINES ACTIONS RECOMMANDÉES

1. Corriger les tests cassés ou les marquer PARTIAL/obsolètes.
2. Brancher `src/index.js` localement via `wrangler dev` et valider que les routes legacy passent toujours.
3. Activer la nouvelle archive Gen2 sur `/api/chat` et `/api/professor/ask`.
4. Documenter chaque capability déclarée en la marquant AVAILABLE uniquement si testée.
5. Ne pas déployer en production avant que tous les tests passent.

---
Rapport établi conformément à l'instruction : aucune modification du code n'a été effectuée pendant la phase audit.
