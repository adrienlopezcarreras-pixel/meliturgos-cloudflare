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

1. [Notebook Google Colab communiqué](https://colab.research.google.com/drive/1VYm3hOcvCpbGiqKZb141gJwjdmmCcVpR?usp=sharing) — **vérifié via Google Drive** : fichier `Uncensor any LLM with abliteration.ipynb` (10 cellules, version modifiée le 6 juin 2024). Exemple `mlabonne/Daredevil-8B` et `transformer_lens` : collecte d'activations sur jeux de prompts, direction différentielle, orthogonalisation de matrices, sauvegarde du modèle modifié. **Il ne s'agit pas d'un QLoRA Qwen3**. L'adaptation à Qwen est une expérience séparée qui exige un portage architectural, une revue de sécurité et des benchmarks.
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

## Fiche de paramétrage affichée dans Professeur → Entraînement

La page inclut maintenant **7 jalons successifs** (audit, baseline, smoke QLoRA, comparaison de candidats, benchmark, endpoint, bascule). Ce sont des étapes documentées, **pas un ordonnanceur GPU actif**. Chaque jalon indique un statut non réalisé tant qu'aucune preuve de production ne permet d'afficher autre chose.

### Configuration de référence externe (nicoboss, non MEL)

D'après la carte du modèle publiée sur Hugging Face, la réalisation externe utilisait **2 × RTX 4090 de 24 Go**, Axolotl, QLoRA 4-bit, l'architecture Qwen3-14B, `r=32`, `alpha=16`, `dropout=0.05`, `sequence_len=4096`, `learning_rate=2e-4`, `num_epochs=4`, `micro_batch_size=1`, `gradient_accumulation_steps=4` et le corpus `Guilherme34/uncensor`. Ces valeurs décrivent l'original ; elles **ne constituent pas une configuration prouvée sur GPU gratuit**. L'auteur publie aussi un prompt visant à imposer des réponses sans limites. Ce texte n'est pas une règle de MEL et ne doit pas être recopié comme prompt système de production.

### Profil MEL Qwen3 — smoke *proposé*, non validé

| Paramètre | Hypothèse de départ |
| --- | --- |
| Modèle | `Qwen/Qwen3-14B`, révision exacte enregistrée |
| Entraîneur | Unsloth / PEFT (isolé du trainer Mistral) |
| Quantification | 4-bit NF4, dépendances et versions gelées |
| LoRA | r=16, alpha=32, dropout=0,05 ; modules à vérifier sur l'architecture exacte |
| Mémoire / séquence | batch 1, accumulation 8, séquence 512 à 1024 pour le pilote ; raccourcir si GPU insuffisant |
| Durée | 1 epoch, maximum 50 steps pour la première preuve (limite de protection, pas objectif de qualité) |
| Contrôle | gradient checkpointing, GPU CUDA effectif, logs de pertes/VRAM, sha256 des artefacts |
| Sortie | PEFT safetensors, adapter_config, identité base/tokenizer, trace GPU et résultat d'évaluation indépendant |

Deux pistes séparées : A) apprendre un nouvel adaptateur Qwen à partir de la base ; B) reprendre l'adaptateur `nicoboss` après validation de sa compatibilité. Interdire les écrasements mutuels et comparer sur la même validation hors entraînement. Ne pas entraîner un poids externe sans vérifier le droit d'usage et le contenu.

### Inventaire complémentaire des corpus / expériences

- `Devilishcode/ultrachat-uncensored` : dataset susceptible d'alimenter un corpus après audit. Le script actuel `scripts/prepare-kaggle-lora-shard.py` le référence ; ne pas déduire une compatibilité Qwen immédiate.
- `anthracite-org/kalo-opus-instruct-22k-no-refusal` : candidat soumis aux mêmes contrôles de provenance, de licences et de qualité.
- `mlabonne/orpo-dpo-mix-40k` : exemple de préférences pour une phase ORPO/DPO optionnelle ; ce n'est pas un corpus SFT à concaténer brut.
- [PR #2819](https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/pull/2819) : ajout opt-in de Dolphin au pipeline **Mistral**, sans démarrage GPU ni usage automatique pour Qwen.
- Notebook Colab du propriétaire : exemple d'**abliteration de Daredevil-8B** via TransformerLens. La technique change les activations ou les poids d'un modèle ; elle n'est **ni** un LoRA compatible Qwen, **ni** une validation du pipeline MEL. Expérience à isoler et benchmarker avant toute adaptation.

### Statuts et politique de lancement

Les mentions « non mesuré », « non lancé », « non hébergé » et « non disponible » restent exactes jusqu'à réception de preuves. Le bouton d'entraînement existant vise Mistral ; la fiche Qwen n'ajoute **aucun faux bouton de lancement**. Pour activer réellement l'entraînement Qwen, il faudra un exécuteur indépendant, une autorisation explicite du budget GPU et du checkpoint cible, et un pipeline de promotion compatible.

Une fois Qwen servi et validé, le routeur pourra essayer l'autre modèle uniquement si le premier a **échoué techniquement** (timeout, fournisseur indisponible, réponse vide), avec le même contexte, sans doublons d'actions externes et avec un reçu `active_lora` reflétant le modèle réellement utilisé. Les refus légitimes ne doivent pas être traités comme des pannes.


## Point d'entrée Qwen3 désormais codé — pas encore exécuté sur GPU

Le script `scripts/train-qwen3-lora.py` est **indépendant** du trainer Mistral et des checkpoints Mistral. Le fichier `requirements-qwen3-lora.txt` contient ses dépendances pour CUDA ; le test `tests/test_qwen3_training.py` vérifie hors ligne l'intégrité du manifeste, le dédoublonnage, les limites d'entrée et l'immuabilité des sorties.

### Contrat de préparation des données

Créer un corpus JSONL avec des objets `{"messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}`, au moins 50 conversations distinctes et un manifeste **revu** listant toutes les sources, leurs révisions et licences. Le fichier `sources-reviewed.json` doit inclure les champs suivants, avec l'empreinte réelle du corpus et les sources effectivement auditées :

```json
{
  "dataset_sha256": "sha256:REMPLACER_PAR_64_CARACTERES_HEXADECIMAUX",
  "license_review_passed": true,
  "sources": [
    {"id": "source-auditee", "revision": "commit-source-fige", "license": "licence-verifiee"}
  ]
}
```

Ne pas recopier cet exemple comme attestation de licence : les valeurs doivent être établies à partir du corpus réellement choisi.

### Pré-vérification CPU, sans GPU ni téléchargement de modèle

```bash
python scripts/train-qwen3-lora.py \
  --dataset /chemin/vers/dataset.jsonl \
  --manifest /chemin/vers/sources-reviewed.json \
  --output /chemin/vers/qwen3-14b/smoke-001 \
  --dry-run
```

### Entraînement GPU réel après validation et disponibilité des ressources

```bash
python -m pip install -r requirements-qwen3-lora.txt
python scripts/train-qwen3-lora.py \
  --dataset /chemin/vers/dataset.jsonl \
  --manifest /chemin/vers/sources-reviewed.json \
  --output /chemin/vers/qwen3-14b/smoke-001 \
  --rank 16 --alpha 32 --max-length 512 --max-steps 50
```

Il refuse l'absence de CUDA, les paramètres hors limites, une licence non revue, un jeu de données trop petit, un manifeste dont le digest ne correspond pas et l'écrasement d'un artefact existant. Sur réussite GPU, il génère `adapter_model.safetensors`, `adapter_config.json` et `training-evidence.json`, avec le SHA-256 de l'adaptateur, les étapes réellement réalisées, le GPU et les pertes d'évaluation. Cela donne **TRAINED_UNBENCHMARKED**, jamais **ACTIVE**. Les benchmarks indépendants, l'endpoint PEFT Qwen3 et la bascule A→B restent des jalons distincts.

Ce script utilise Transformers/PEFT/QLoRA ; Unsloth reste une option d'optimisation future, pas une dépendance prétendument déjà exécutée. Un GPU gratuit n'est ni réservé ni garanti par ce commit.
