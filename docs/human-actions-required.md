# MELITURGOS — Human Actions Required

> Actions bloquées par nature : secrets, OAuth, paiement, DNS, choix stratégiques, accès fournisseurs.
> Dernière mise à jour : 2026-09-06

| ID | ACTION | RAISON | IMPACT | DÉTENTEUR |
|---|---|---|---|---|
| H-A-01 | Fournir `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` | Déploiement Worker/D1/R2 | Bloque tout déploiement | Adrien |
| H-A-02 | Créer/configurer les bindings D1, R2, AI dans le compte Cloudflare | Runtime MELITURGOS | Bloque exécution en production | Adrien |
| H-A-03 | Choisir et configurer secrets `MELITURGOS_PASSWORD`, `OWNER_NAME` | Authentification et persona | Bloque auth de production | Adrien |
| H-A-04 | Configurer Git remote et credentials (HTTPS/SSH/token) | Push commits, branches, tags | Bloque versioning cloud | Adrien |
| H-A-05 | Choisir domaine de production et configurer DNS | URL publique finale | Bloque déploiement public | Adrien / FAI |
| H-A-06 | Autoriser OAuth Google (Gmail, Calendar, Drive) | Connecteurs Google | Bloque connecteurs Google | Adrien |
| H-A-07 | Autoriser OAuth Microsoft (Outlook, OneDrive, SharePoint) | Connecteurs Microsoft | Bloque connecteurs Microsoft | Adrien |
| H-A-08 | Fournir tokens GitHub/Cloudflare/Vercel si connecteurs dev | Connecteurs dev | Bloque automations repo | Adrien |
| H-A-09 | Choisir stack Android (Kotlin, React Native, Flutter, PWA wrap) | Android Companion | Bloque build natif | Adrien |
| H-A-10 | Choisir stack Windows (UWP, WinUI3, PWA, Electron) | Windows Companion | Bloque build natif | Adrien |
| H-A-11 | Activer média upload en production (`MEDIA_FEATURE_ENABLED`) | Uploads R2 privés | Bloque fonctionnalité média | Adrien |
| H-A-12 | Valider import du contexte ChatGPT avant exécution D1 réelle | Données personnelles | Risque d'import anticipé | Adrien |
| H-A-13 | Décider modèle par défaut final : Kimi vs GLM/Gemma/Llama | Qualité/coût | Impacte expérience conversation | Adrien |
| H-A-14 | Fournir le fichier `MELITURGOS_CONTEXT_TRANSFER_MAX_*.json` (ChatGPT context export) | Import réel du contexte | Bloque l'import ChatGPT | Adrien |

## État du déploiement v0.2.5-rc.2-gen2.1 (2026-09-06)

### ✅ Déployé et fonctionnel
- **URL production** : https://meliturgos.adrien-lopezcarreras.workers.dev/
- **Version** : v0.2.5-rc.2-gen2.1
- **UI** : ROOT_PAGE_PATCHED_V3 actif avec avatar assistant, voix mobile, capacités panel
- **Authentification** : Basic Auth MELITURGOS (user: `meliturgos`, password: `password`)
- **Bindings** :
  - ✅ AI (Workers AI)
  - ✅ DB (D1 meliturgos-memory, 6d502448-8780-4cf0-8c82-863cccb2e1cd)
  - ✅ MEDIA_BUCKET (R2 meliturgos-private-media)
  - ✅ Env vars (OWNER_NAME="Adrien", MELITURGOS_USER="adrien")

### 📊 Statistiques gén2
- **Tests** : 18/18 passants
- **Git** : Branch `meliturgos-gen2`, commit nightly: `5fdf7ac`
- **Backups** : Pre-import backups préservés
- **ChatGPT context** : Import préparé (fichier JSON, SQL scripts)

### ⚠️ Actions requises
1. **URLs de production** : Choisir et configurer DNS pour https://meliturgos.fr/
2. **Reproduction locale** : `npx wrangler dev` pour dev
3. **Reconnexion API** : Établir et stocker CLOUDFLARE_API_TOKEN + ACCOUNT_ID

### 📋 Phase 2 prévue
- Brancher `/api/chat` et `/api/professor/ask` sur `ConversationService`
- Migrer `interactions` vers `archive_messages`
- Valider `/api/v1/sync`

## Notes

- Tout ce qui nécessite un paiement doit être arrêté jusqu'à autorisation explicite.
- Les OAuth ne doivent jamais être demandés/saisis par l'agent ; ils sont fournis par Adrien via le dashboard fournisseur puis injectés dans les secrets Wrangler.
- Les DNS ne sont jamais modifiés automatiquement.
