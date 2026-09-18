# MEL LoRA — runbook GPU gratuit / QLoRA 4-bit

Status cible avant entraînement : `DATASET_PREPARED_UNTRAINED`.

Ce runbook lance un entraînement réel de l'adaptateur MEL en QLoRA 4-bit. Il ne promeut jamais automatiquement l'adaptateur : le script produit `TRAINED_UNBENCHMARKED` et le benchmark Professor reste obligatoire avant activation.

## Lancement le plus simple : notebook Colab

Notebook prêt à exécuter :

https://colab.research.google.com/github/adrienlopezcarreras-pixel/meliturgos-cloudflare/blob/candidate/mel-clean-autonomy/notebooks/MEL-QLORA-SMOKE-COLAB.ipynb

1. Ouvrir le lien.
2. Choisir un runtime GPU si Colab n'en a pas déjà attribué un.
3. Exécuter **Run all**.

Le notebook refuse de continuer sans CUDA. Il clone la branche MEL, installe les dépendances, prépare un échantillon déterministe de 500 conversations depuis les deux sources ShareGPT vérifiées, entraîne réellement l'adaptateur QLoRA 4-bit, valide les trois artefacts attendus et produit `/content/MEL-QLORA-smoke-500.zip`.

## 1. Préparer manuellement un notebook GPU

Utiliser un environnement CUDA (T4, L4, A10, A100 ou équivalent), puis :

```bash
git clone https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare.git
cd meliturgos-cloudflare
git checkout candidate/mel-clean-autonomy
python -m pip install -U pip
python -m pip install -r requirements-lora.txt ijson
nvidia-smi
```

Le chemin CUDA utilise automatiquement :

- base Mistral 7B quantifiée en 4 bits ;
- NF4 + double quantification ;
- `prepare_model_for_kbit_training` ;
- gradient checkpointing ;
- optimiseur `paged_adamw_8bit` ;
- FP16 sur T4 et BF16 lorsque le GPU le supporte ;
- LoRA rank 8 par défaut, modules `q_proj` et `v_proj` ;
- séquences jusqu'à 2048 tokens par défaut.

## 2. Régénérer le corpus ShareGPT vérifié

Le dataset final d'environ 493 Mo n'est volontairement pas stocké dans GitHub. Le préparateur le régénère depuis les deux sources publiques et vérifie leurs SHA-256 avant conversion/déduplication.

```bash
mkdir -p artifacts/lora-data
python scripts/prepare-sharegpt-lora.py \
  --variant both \
  --output artifacts/lora-data/sharegpt-mel-integrated.jsonl
```

Le résultat attendu est un JSONL au format `messages`, accompagné des fichiers `.meta.json` et `.provenance.jsonl`.

## 3. Smoke test obligatoire

Commencer par 500 conversations sélectionnées de manière déterministe :

```bash
mkdir -p artifacts/lora-train
python scripts/prepare-sharegpt-lora.py \
  --variant both \
  --max-conversations 500 \
  --seed 42 \
  --output artifacts/lora-data/sharegpt-mel-smoke-500.jsonl

node scripts/create-lora-plan.mjs \
  --dataset artifacts/lora-data/sharegpt-mel-smoke-500.jsonl \
  --output artifacts/lora-data/lora-plan-smoke-500.json \
  --epochs 1 \
  --seed 42

python scripts/train-mel-lora.py \
  --dataset artifacts/lora-data/sharegpt-mel-smoke-500.jsonl \
  --plan artifacts/lora-data/lora-plan-smoke-500.json \
  --output artifacts/lora-train/smoke-500 \
  --epochs 1 \
  --save-steps 50 \
  --seed 42
```

Le run n'est considéré comme réellement entraîné que si ces fichiers existent :

```text
adapter_model.safetensors
adapter_config.json
training-evidence.json
artifact-evidence.json
lora-plan.json
```

`training-evidence.json` doit contenir notamment :

```text
status = TRAINED_UNBENCHMARKED
training_mode = qlora-4bit-nf4
quantization.bits = 4
cuda_available = true
```

## 4. Run complet

Après réussite du smoke test :

```bash
node scripts/create-lora-plan.mjs \
  --dataset artifacts/lora-data/sharegpt-mel-integrated.jsonl \
  --output artifacts/lora-data/lora-plan-full.json \
  --epochs 2 \
  --seed 42

python scripts/train-mel-lora.py \
  --dataset artifacts/lora-data/sharegpt-mel-integrated.jsonl \
  --plan artifacts/lora-data/lora-plan-full.json \
  --output artifacts/lora-train/sharegpt-full \
  --epochs 2 \
  --save-steps 250 \
  --seed 42
```

`--max-samples 0` est la valeur par défaut : toutes les conversations sont utilisées.

## 5. Reprendre après une coupure

Les notebooks gratuits peuvent être interrompus. Le trainer garde les deux derniers checkpoints. Reprendre avec :

```bash
python scripts/train-mel-lora.py \
  --dataset artifacts/lora-data/sharegpt-mel-integrated.jsonl \
  --plan artifacts/lora-data/lora-plan-full.json \
  --output artifacts/lora-train/sharegpt-full \
  --epochs 2 \
  --save-steps 250 \
  --resume-from-checkpoint artifacts/lora-train/sharegpt-full/checkpoint-N
```

Remplacer `checkpoint-N` par le dernier checkpoint réellement présent.

## 6. Charger l'adaptateur sur Cloudflare

Le trainer produit aussi `artifact-evidence.json` et une copie de `lora-plan.json`. Après le run GPU, charger les deux fichiers LoRA sur Workers AI :

```bash
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_API_TOKEN="..."

node scripts/upload-cloudflare-lora.mjs \
  --dir artifacts/lora-train/sharegpt-full \
  --name mel-sharegpt-full
```

Le script crée le fine-tune Cloudflare, charge exactement `adapter_model.safetensors` et `adapter_config.json`, puis inscrit le `finetune_id` réel dans `artifact-evidence.json`. L'état reste `UPLOADED_UNAPPROVED`.

## 7. Approuver explicitement l'artefact exact

L'approbation est une étape séparée. Elle lie le corpus, le manifeste d'entraînement, l'artefact SHA-256 et le `finetune_id` Cloudflare exacts :

```bash
node scripts/approve-lora-artifact.mjs \
  --dir artifacts/lora-train/sharegpt-full
```

Cette commande produit `approval-evidence.json`. Toute régénération de l'artefact, tout nouveau `finetune_id`, ou tout changement du corpus/manifeste rend cette approbation inutilisable.

## 8. Benchmark réel base vs LoRA et activation

Une fois la version MEL contenant l'endpoint LoRA déployée :

```bash
export MELITURGOS_PASSWORD="..."
export MEL_BASE_URL="https://votre-worker.example"

node scripts/finalize-lora.mjs \
  --dir artifacts/lora-train/sharegpt-full \
  --url "$MEL_BASE_URL"
```

Cette commande exécute le même benchmark canonique deux fois sur le même runtime : d'abord sans adaptateur, puis avec le `finetune_id` exact. Le candidat conserve les preuves `dataset_digest + training_manifest_digest + artifact_digest`. L'activation n'est persistée que si le benchmark LoRA passe, améliore suffisamment le score et n'introduit pas de régression de domaine au-delà de la politique.

Après activation, le chat natif charge `LORA_ADAPTER_ACTIVE`, sélectionne le runtime LoRA en priorité et transmet `lora: finetune_id` à Workers AI. En l'absence d'adaptateur actif, le routage standard reste inchangé.

## 9. Gate après entraînement

La présence de poids LoRA ne vaut pas promotion. La séquence reste :

```text
DATASET_PREPARED_UNTRAINED
  -> QLoRA GPU réel
TRAINED_UNBENCHMARKED
  -> upload Cloudflare de l'artefact exact
UPLOADED_UNAPPROVED
  -> approbation explicite de cet artefact
ARTIFACT_APPROVED_UNBENCHMARKED
  -> benchmark Professor base vs cet adaptateur exact
  -> contrôle compatibilité Cloudflare
  -> promotion uniquement si les gates passent
```

Ne jamais déclarer MEL entraînée à partir d'un simple plan, d'un run CPU de préparation ou d'un notebook interrompu sans les trois artefacts d'entraînement et leurs preuves.
