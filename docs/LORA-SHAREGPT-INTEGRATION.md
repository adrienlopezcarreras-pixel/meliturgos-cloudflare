# MEL LoRA — ShareGPT dual-corpus integration

## Status

MEL integrates both published `anon8231489123/ShareGPT_Vicuna_unfiltered` cleaned variants through `scripts/prepare-sharegpt-lora.py`.

The default mode is `--variant both`.

Sources:

- `ShareGPT_V3_unfiltered_cleaned_split.json` (`standard`)
- `ShareGPT_V3_unfiltered_cleaned_split_no_imsorry.json` (`no-imsorry`)

Each source is SHA-256 checked against the pinned reference before conversion. A changed upstream source fails closed unless `--skip-source-hash-check` is explicitly supplied after review.

## Why both are integrated without raw concatenation

`no-imsorry` is derived from the same ShareGPT cleaning lineage as `standard`. Raw concatenation would repeat many conversations and unintentionally give those examples extra training weight.

The preparer therefore:

1. downloads/reads both variants;
2. normalizes ShareGPT roles to `user` / `assistant` / `system`;
3. computes a SHA-256 fingerprint over canonical normalized messages;
4. retains each exact conversation once;
5. records membership in `source_variants` (`standard`, `no-imsorry`, or both);
6. emits a separate provenance JSONL sidecar and a metadata/evidence JSON file;
7. optionally performs deterministic reservoir sampling only after deduplication.

This gives MEL access to both datasets while keeping the effective training distribution auditable.

## Prepare the integrated corpus

```bash
pip install ijson
python scripts/prepare-sharegpt-lora.py \
  --output data/sharegpt-mel-integrated.jsonl
```

Equivalent explicit form:

```bash
python scripts/prepare-sharegpt-lora.py \
  --variant both \
  --output data/sharegpt-mel-integrated.jsonl
```

Generated evidence files:

```text
data/sharegpt-mel-integrated.jsonl
 data/sharegpt-mel-integrated.jsonl.meta.json
 data/sharegpt-mel-integrated.jsonl.provenance.jsonl
```

## Train MEL LoRA

```bash
python scripts/train-mel-lora.py \
  --dataset data/sharegpt-mel-integrated.jsonl \
  --output artifacts/mel-lora-sharegpt
```

The trainer remains pinned to MEL's approved Mistral/Cloudflare model pair and emits `TRAINED_UNBENCHMARKED`. Training is not promotion.

## Benchmark variants separately when useful

The same preparer can still create controlled comparison corpora:

```bash
python scripts/prepare-sharegpt-lora.py \
  --variant standard \
  --output data/sharegpt-standard.jsonl

python scripts/prepare-sharegpt-lora.py \
  --variant no-imsorry \
  --output data/sharegpt-no-imsorry.jsonl
```

This allows Professor/benchmark runs to compare:

- base model;
- standard-only adapter;
- no-imsorry-only adapter;
- integrated/deduplicated adapter.

Activation should remain conditional on measured benchmark gain and compatibility rather than the dataset label alone.
