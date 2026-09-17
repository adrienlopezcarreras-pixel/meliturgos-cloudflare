# MEL LoRA — runbook GPU gratuit / QLoRA 4-bit

Status cible avant entraînement : `DATASET_PREPARED_UNTRAINED`.

Ce runbook lance un entraînement réel de l'adaptateur MEL en QLoRA 4-bit. Il ne promeut jamais automatiquement l'adaptateur : le script produit `TRAINED_UNBENCHMARKED` et le benchmark Professor reste obligatoire avant activation.

## 1. Préparer le notebook GPU

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
python scripts/train-mel-lora.py \
  --dataset artifacts/lora-data/sharegpt-mel-integrated.jsonl \
  --output artifacts/lora-train/smoke-500 \
  --max-samples 500 \
  --epochs 1 \
  --save-steps 50
```

Le run n'est considéré comme réellement entraîné que si ces fichiers existent :

```text
adapter_model.safetensors
adapter_config.json
training-evidence.json
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
python scripts/train-mel-lora.py \
  --dataset artifacts/lora-data/sharegpt-mel-integrated.jsonl \
  --output artifacts/lora-train/sharegpt-full \
  --epochs 2 \
  --save-steps 250
```

`--max-samples 0` est la valeur par défaut : toutes les conversations sont utilisées.

## 5. Reprendre après une coupure

Les notebooks gratuits peuvent être interrompus. Le trainer garde les deux derniers checkpoints. Reprendre avec :

```bash
python scripts/train-mel-lora.py \
  --dataset artifacts/lora-data/sharegpt-mel-integrated.jsonl \
  --output artifacts/lora-train/sharegpt-full \
  --epochs 2 \
  --save-steps 250 \
  --resume-from-checkpoint artifacts/lora-train/sharegpt-full/checkpoint-N
```

Remplacer `checkpoint-N` par le dernier checkpoint réellement présent.

## 6. Gate après entraînement

La présence de poids LoRA ne vaut pas promotion. La séquence reste :

```text
DATASET_PREPARED_UNTRAINED
  -> QLoRA GPU réel
TRAINED_UNBENCHMARKED
  -> benchmark Professor base vs adaptateur
  -> contrôle compatibilité Cloudflare
  -> promotion uniquement si les gates passent
```

Ne jamais déclarer MEL entraînée à partir d'un simple plan, d'un run CPU de préparation ou d'un notebook interrompu sans les trois artefacts d'entraînement et leurs preuves.
