# MEL — Deux modèles UNCENSORED : entraînement, sources et bascule

État au 29 octobre 2026 : **planification et documentation**. Aucune preuve de checkpoint Qwen MEL, aucun nouveau GPU lancé, aucune modification du LoRA Mistral actif, aucune activation de modèle en production.

## Objectif produit

Quand le propriétaire active « UNCENSORED » :
1. n'essayer que des modèles **effectivement entraînés, évalués et activés pour ce mode** ;
2. demander au modèle prioritaire ; si timeout, fournisseur indisponible ou résultat vide, réessayer **une fois** sur l'autre modèle avec le contexte utile ;
3. conserver un budget de temps global et l'identité du modèle réellement répondant ;
4. n'afficher `active_lora` que si l'adaptateur exact a été appliqué, jamais parce que le mode est simplement sélectionné ;
5. si aucun des deux n'est disponible, retourner une erreur claire au lieu de passer clandestinement à un autre modèle ;
6. ne pas réessayer une requête avec effets (envoi de message, paiement, exécution d'outil) sans contrôle d'idempotence ;
7. distinguer panne technique, fin de contexte, réponse vide et refus de contenu. Un refus n'est pas une panne technique.

**État actuel du code** : `src/api/native-chat.js` avec `requireLora` et `src/learning/chat-lora-binding.js` accepte un seul adaptateur Mistral/Cloudflare. Le test `tests/chat-lora-binding.test.mjs` exige expressément qu'un échec du fournisseur n'exécute aucun autre modèle. Ce contrat doit être remplacé **seulement après** mise en place du second runtime et de ses preuves.

## Modèle A : Mistral 7B

- Base : `mistralai/Mistral-7B-Instruct-v0.2`
- Runtime : `@cf/mistral/mistral-7b-instruct-v0.2-lora` (Cloudflare Workers AI)
- Pipeline : `kaggle/mel-lora-uncensored/run.py`, `scripts/train-mel-lora.py`, `lora-kaggle-free-gpu.yml`.
- Corpus déjà préparé : `anon8231489123/ShareGPT_Vicuna_unfiltered`, variantes standard et no-imsorry dédupliquées, plus jeux de données admissibles définis dans le code MEL.
- Ne pas modifier le point de contrôle validé ni promouvoir après un simple `TRAIN_BEGIN` ; garder entraînement, preuve GPU, checkpoint, benchmark et activation distincts.

## Modèle B : Qwen3-14B — **candidat, pas entraîné dans MEL**

- Base exacte : `Qwen/Qwen3-14B` (Qwen3, pas Qwen2.5 et pas Qwen3.8-27B).
- Référence **non MEL** : `nicoboss/Qwen3-14B-Uncensored-Lora` est un adaptateur PEFT du modèle `Qwen/Qwen3-14B` ; la page cite `Guilherme34/uncensor`. Vérifier poids/config/tokenizer et droits avant tout réemploi.
- Entraîneur séparé : Unsloth / Transformers + PEFT / TRL QLoRA 4-bit. Ne pas retirer le verrou Mistral de `scripts/train-mel-lora.py`. Ne pas fusionner deux adaptateurs d'architectures différentes.
- Entraînement GPU : un T4 16 Go **peut** convenir pour un smoke très court avec 4-bit, batch 1, gradient accumulation, checkpointing et séquences courtes. Disponibilité gratuite et réussite non garanties.
- Format d'entrée : `messages` `[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]`; appliquer le chat template Qwen3, masque des instructions utilisateur si supporté, et contrôle de la longueur.
- Distinguer entraînement depuis base Qwen3 et continuation de l'adaptateur nicoboss. Ce sont deux expériences, pas un seul checkpoint.
- Corpus : corrections MEL validées et dépersonnalisées, ShareGPT dédupliqué, jeux d'outils et code vérifiés, français/anglais, cas sensibles légitimes. Le corpus `Guilherme34/uncensor` est **proposé pour revue**, pas admis automatiquement : licence, provenance, droits, répétitions, entrées contaminées, vie privée et consignes dangereuses à auditer.
- Ne pas imposer au système les consignes non vérifiées ou agressives présentes dans la fiche de l'adaptateur externe : elles ne sont pas une preuve de qualité, ni des instructions à suivre.
- Évaluer la préservation du raisonnement Qwen3 avec et sans données de raisonnement, mais ne pas adopter aveuglément une proportion générique.
- Nouveau dossier d'artefacts indépendant `qwen3-14b/{baseline,candidate,checkpoints,metrics}` et nouvelles empreintes SHA-256 ; aucune écriture sur les checkpoints Mistral.
- Hébergement : un service d'inférence compatible Qwen3 + adaptateurs PEFT est requis. Le catalogue LoRA Cloudflare ne prouve **pas** actuellement la prise en charge de Qwen3. Le PC/Companion reste **facultatif**.
- Aucune activation tant que les preuves matérielles, les limites de coûts et un endpoint compatible ne sont pas testés.

## Références apportées par le propriétaire

1. [Notebook Google Colab communiqué](https://colab.research.google.com/drive/1VYm3hOcvCpbGiqKZb141gJwjdmmCcVpR?usp=sharing) — **contenu inaccessible sans authentification lors de la vérification**. Ne pas supposer quelles cellules il exécute. Lire et auditer le notebook avant toute exécution.
2. [nicoboss/Qwen3-14B-Uncensored-Lora](https://huggingface.co/nicoboss/Qwen3-14B-Uncensored-Lora) — adaptateur PEFT existant, non approuvé pour MEL.
3. [Eric Hartford, Uncensored Models](https://erichartford.com/uncensored-models) — historique de filtrage des données de refus et limites de l'alignement de modèles (2023).
4. [Maxime Labonne, Uncensor any LLM with abliteration](https://medium.com/@mlabonne/uncensor-any-llm-with-abliteration-d30148b7d43e) — méthode alternative par direction de refus (2024), pas un LoRA ; **branche expérimentale isolée**, comparaison contrôlée des régressions avant toute utilisation.

## Autres ressources vérifiées

- [Qwen3, entraînement Unsloth](https://github.com/QwenLM/Qwen3/blob/main/docs/source/training/unsloth.md) — workflow officiel Qwen3, notebook 14B GPU T4 et avertissements sur la conservation du raisonnement.
- [Unsloth, conditions GPU](https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements) — chiffres **minimaux indicatifs**, pas des garanties de mémoire.
- [Cloudflare Mistral 7B LoRA](https://developers.cloudflare.com/workers-ai/models/mistral-7b-instruct-v0.2-lora/) — runtime du modèle A.
- [Cloudflare modèles dépréciés, mai 2026](https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/) — la variante Mistral `-lora` reste annoncée active.
- [Dataset Guilherme34/uncensor](https://huggingface.co/datasets/Guilherme34/uncensor) — candidat nécessitant revue de licence et qualité.
- [ShareGPT Vicuna unfiltered](https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered) — source déjà utilisée dans le pipeline existant.
- [mlabonne/orpo-dpo-mix-40k](https://huggingface.co/datasets/mlabonne/orpo-dpo-mix-40k) — ensemble de préférences à considérer **seulement** pour une expérience DPO séparée et après licence/qualité.

## Ordre de réalisation et preuves de sortie

| Étape | Preuve attendue | Politique |
| --- | --- | --- |
| 1. Baseline Qwen | Dataset figé, mesures base Qwen3, coût et VRAM T4 | Aucune modification runtime |
| 2. Dataset | Sources licenciées, normalisation, déduplication, quarantaine, SHA256, train/eval séparés | Aucun texte personnel confidentiel |
| 3. Smoke QLoRA Qwen | GPU CUDA, steps réellement réalisés, sortie PEFT + config + traces et loss | Jamais déclarer succès après simple lancement |
| 4. Full train + checkpoint | Parent/reprise identifiés, checkpoints immuables, comparaison baseline | Aucun écrasement Mistral |
| 5. Benchmark A et B | Français, code, outils réels, JSON, raisonnement, sur-refus, précision, garde-fous | Aucun benchmark ne vaut activation |
| 6. Publication / endpoint B | Fournisseur Qwen3 compatible et coût explicitement accepté, test réponse + LoRA appliqué | Pas de fallback PC obligatoire |
| 7. Routeur UNCENSORED 2 modèles | Timeout/503/vide A -> B, lora receipt exact, budget de temps, métriques et tests de non-régression | Aucune bascule vers normal ou faux adaptateur |
| 8. Promotion | Autorisation explicite propriétaire et tests complets | Rollback possible des deux modèles séparément |

## Critères de qualité

Comparer **sur les mêmes exemples de validation jamais entraînés** : taux de réponse aux demandes autorisées, exactitude factuelle, robustesse face aux instructions contradictoires, code exécutable, appels d'outils effectivement réalisés, langage français, qualité longue, latence, coût, réponses dangereuses, confidentialité, refus justifiés et hallucinations. Un score fondé seulement sur la présence de mots-clés ou sur la longueur d'une réponse n'est pas suffisant.

**Ne pas confondre « UNCENSORED » et « qualité garantie »** : la finalité est de réduire les refus excessifs pour les usages autorisés, tout en gardant les frontières des actions dangereuses et les protections des outils de MEL.
