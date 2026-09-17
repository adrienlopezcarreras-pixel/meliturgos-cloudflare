# MEL LoRA — ShareGPT integration run — 2026-09-17

Status: **PASS — DATASET_PREPARED_UNTRAINED**

This document records the real full-corpus integration run performed by GitHub Actions before LoRA training.

## Execution

- Branch: `candidate/mel-clean-autonomy`
- Workflow: `MEL LoRA dataset integration`
- GitHub Actions run: `35188450758`
- Job: `prepare-integrated-sharegpt`
- Source commit: `5b97d58f2aafd2d9e8ad9b737c223b384d3a51c7`
- Result: all preparation, validation and evidence-upload steps succeeded.

## Verified source datasets

### standard

- File: `ShareGPT_V3_unfiltered_cleaned_split.json`
- SHA-256: `35f0e213ce091ed9b9af2a1f0755e9d39f9ccec34ab281cd4ca60d70f6479ba4`
- Reference hash match: `true`
- Valid normalized conversations: `92773`
- Unique conversations first seen from this source: `78814`

### no-imsorry

- File: `ShareGPT_V3_unfiltered_cleaned_split_no_imsorry.json`
- SHA-256: `014bcc3352fd62df5bbb7fb8af9b4fd12f87bb8a2b48a147789f245176ac8e4f`
- Reference hash match: `true`
- Valid normalized conversations: `92526`
- Unique conversations first seen from this source: `1488`

## Integrated dataset

- Integration mode: `both`
- Deduplication: SHA-256 of canonical normalized messages
- Unique conversations: `80302`
- Messages: `568239`
- Duplicate hits removed: `104997`
- Output size: `492710653` bytes
- Output SHA-256: `acd426c133730ae5193febd1b84c6e68172ee71543f822cff714be1196a47ce4`
- Provenance SHA-256: `bfa9c2d6d8d7e0daff1113d50be3108f5ad392f311d03726c107965fc1070ddd`

### Overlap after normalization

- standard only: `1731`
- no-imsorry only: `1488`
- present in both: `77083`

The large overlap confirms that concatenating both files without deduplication would heavily double-weight the common corpus.

## Evidence artifact

- Artifact name: `mel-lora-sharegpt-integration-evidence`
- Artifact ID: `10483740259`
- Uploaded ZIP size: `2926663` bytes
- Artifact ZIP SHA-256: `8a129e7792abf55c60cb348d046bac48feb2fb53252a2cef4febef7272e205e2`

The compact artifact contains metadata, per-conversation provenance and preparation stdout. The ~493 MB final training JSONL is intentionally not uploaded as a GitHub Actions artifact.

## Training gate

LoRA weights were **not** produced in this run. The available ChatGPT execution runtime is CPU-only and no CUDA device was available; the repository also exposed no configured self-hosted GPU runner during this run.

The next valid state transition is therefore:

`DATASET_PREPARED_UNTRAINED` -> GPU execution of `scripts/train-mel-lora.py` -> `TRAINED_UNBENCHMARKED` -> Professor/base-vs-adapter benchmark -> promotion only if the benchmark gate passes.

Do not mark the adapter trained or promoted without real GPU training artifacts (`adapter_model.safetensors`, `adapter_config.json`, `training-evidence.json`) and benchmark evidence.
