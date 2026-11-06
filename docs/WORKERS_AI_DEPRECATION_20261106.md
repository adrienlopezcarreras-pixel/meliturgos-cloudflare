# MEL — Directive obligatoire : dépréciations Cloudflare Workers AI (novembre 2026)

**Date de publication : 6 novembre 2026. Priorité : P0, risque de rupture de service.**
**Échéance annoncée dans le courriel Cloudflare transmis par le propriétaire : 20 novembre 2026.**
Source à recontrôler avant intervention : https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/
Si la documentation officielle affiche une date antérieure ou différente, appliquer **la plus proche**, la consigner et prévenir le propriétaire. Ne jamais présumer qu'un changement de modèle est gratuit ou compatible.

## Consigne pour TOUS les modèles, agents et assistants intervenant sur MEL

Lire cette directive avant toute modification de routage IA, configuration de modèles, Council, Teacher, Dev Bridge, génération/analyse de médias, embeddings et pipelines LoRA. Propager ce lien dans chaque handoff/mission portant sur ces composants. Ce texte n'autorise **ni activation de MAX, ni fusion sans Council, ni déploiement sans les gates habituels**.

1. Faire un inventaire complet (code actif, variables d'environnement, configuration D1, workflows Actions, scripts de migration, tests, fallbacks et déploiements) ; classer chaque référence en **runtime actif**, **fallback actif**, **tests/doc seulement**, **configuration historique** ou **inconnu**. Les recherches textuelles seules ne prouvent pas la configuration de production.
2. Avant la date effective, remplacer uniquement les modèles actifs dépréciés par des alternatives disponibles **après tests de compatibilité fonctionnelle, API, formats et tarification**. Préserver le comportement et les contrôles de sécurité ; aucun remplacement silencieux.
3. Pour Council et Teacher, maintenir la diversité/indépendance des votes, la provenance exacte SHA, les validations de décision et les contrôles fail-closed. Ne pas transformer un modèle non raisonnant en votant raisonnant sans validation.
4. Pour la voix, l'image et les embeddings, revalider les schémas de requête/réponse et les formats de données ; ne pas considérer les noms ci-dessous comme interchangeables.
5. Pour LoRA, les modèles de base dépréciés peuvent rendre d'anciens adaptateurs inutilisables. Inventorier, sauvegarder, désactiver la sélection des chemins non compatibles et définir un plan de réentraînement **sans inventer de compatibilité de poids**.
6. Respecter la politique zéro surcoût MEL : coûts, quotas et limites doivent être mesurés, jamais déduits du nom ou d'une priorité de registre. Préparer le fallback si une solution à coût nul équivalente n'existe pas et remonter le blocage.
7. Tests exigés : inventaire automatisé des références actives, tests unitaires/par composant, preuve de compatibilité runtime, full CI sur SHA exact, Council indépendant, validation de release et smoke tests de production. Ne marquer `DONE_VERIFIED` qu'après preuve.
8. Tracer les décisions dans une PR distincte, avec SHA, modèles avant/après, preuves, coût, risques et retour arrière. Ne pas masquer une référence historique utile aux audits ; empêcher uniquement son usage runtime futur.

## Avis Cloudflare transmis (modèles annoncés comme dépréciés)

| Modèle annoncé obsolète | Alternative suggérée dans le courriel |
| --- | --- |
| `@cf/myshell-ai/melotts` | `@cf/deepgram/aura-2-en` |
| `@cf/stabilityai/stable-diffusion-xl-base-1.0` | `@cf/black-forest-labs/flux-2-klein-9b` |
| `@cf/runwayml/stable-diffusion-v1-5-inpainting` | `@cf/black-forest-labs/flux-2-klein-9b` |
| `@cf/bytedance/stable-diffusion-xl-lightning` | `@cf/black-forest-labs/flux-2-klein-9b` |
| `@cf/openai/whisper-tiny-en` | `@cf/deepgram/nova-3` |
| `@cf/llava-hf/llava-1.5-7b-hf` | `@cf/moondream/moondream3.1-9B-A2B` |
| `@cf/lykon/dreamshaper-8-lcm` | `@cf/black-forest-labs/flux-2-klein-9b` |
| `@cf/google/embeddinggemma-300m` | `@cf/google/embeddinggemma-2` (annoncé « available soon », **ne pas considérer disponible sans vérification**) |

**LLM annoncés obsolètes :** `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`, `@cf/nvidia/nemotron-3-120b-a12b`, `@cf/deepseek-ai/deepseek-v4-pro-0813`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `@cf/qwen/qwq-32b`, `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-5.3-flash`, `@cf/meta-llama/llama-2-7b-chat-hf-lora`, `@cf/google/gemma-2b-it-lora`, `@cf/google/gemma-7b-it-lora`, `@cf/meta/llama-3.1-8b-instruct-fp8`, `@cf/meta/llama-3.2-1b-instruct`, `@cf/meta/llama-3.2-3b-instruct`.

**LLM suggérés (sans équivalence implicite) :**
- haute performance : `@cf/deepseek-ai/deepseek-v4.1-flash-1017`, `@cf/zai-org/glm-5.3` ;
- modèles plus petits : `@cf/google/gemma-4-26b-a4b-it`, `@cf/qwen/qwen3.8-27b`.

## Références initiales repérées dans MEL le 06/11/2026 (non exhaustif)

- `src/models/ModelRegistry.js`, `src/api/chat-stream.js`, `src/api/native-chat.js`, `src/augmentio/workers-ai-adapter.js` : Nemotron 3 120B.
- `src/core/config.js` : Kimi K2.7 Code.
- `src/media/workers-ai-media-capabilities.js` : SDXL Lightning et LLaVA 1.5.
- `src/learning/lora-plan.js`, `scripts/create-lora-plan.py` : Gemma 2B/7B LoRA et Llama 2 LoRA.

Ces références **n'établissent pas** seules l'usage réel en production. Priorité à la correction vérifiée et progressive, sans modifier par inadvertance le catalogue historique ou ses tests de régression.

## Conditions de reprise MAX

La présente directive ne lève aucun verrou. Ne relancer MAX qu'après clôture vérifiée des blocages Council/release et contrôle de la file D1, avec consentement explicite du propriétaire et gates applicables. Une file exécutable vide ne prouve pas que la roadmap est entièrement terminée.
