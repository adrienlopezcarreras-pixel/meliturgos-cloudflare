#!/usr/bin/env python3
"""Generate the canonical MEL LoRA training plan without requiring Node.

The training_manifest JSON and digest intentionally match src/learning/lora-plan.js.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

MIN_EXAMPLES = 50
MAX_ADAPTER_BYTES = 300_000_000
BASE_MODEL = "mistralai/Mistral-7B-Instruct-v0.2"
RUNTIME_MODEL = "@cf/mistral/mistral-7b-instruct-v0.2-lora"
RUNTIME = "cloudflare-workers-ai"
MANIFEST_VERSION = "mel-lora-training-manifest-v1"
TARGET_MODULES = ["q_proj", "v_proj"]
SUPPORTED_RUNTIME_MODELS = [
    "@cf/mistral/mistral-7b-instruct-v0.2-lora",
    "@cf/google/gemma-7b-it-lora",
    "@cf/google/gemma-2b-it-lora",
    "@cf/meta-llama/llama-2-7b-chat-hf-lora",
]

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def sha256_json(value) -> str:
    return "sha256:" + hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()

def count_jsonl(path: Path) -> int:
    count = 0
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                count += 1
    return count

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--id", default="")
    ap.add_argument("--rank", type=int, default=8)
    ap.add_argument("--alpha", type=int, default=16)
    ap.add_argument("--dropout", type=float, default=0.05)
    ap.add_argument("--learning-rate", type=float, default=2e-4)
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--min-measured-gain", type=float, default=0.02)
    args = ap.parse_args()

    dataset = Path(args.dataset).resolve()
    if not dataset.is_file() or dataset.stat().st_size <= 0:
        raise SystemExit("LORA_DATASET_NOT_FOUND")

    examples = count_jsonl(dataset)
    dataset_digest = sha256_file(dataset)
    rank = max(1, min(32, round(args.rank or 8)))
    alpha = max(1, min(1024, round(args.alpha or 16)))
    dropout = max(0.0, min(0.5, float(args.dropout or 0.0)))
    learning_rate = max(1e-7, min(1e-2, float(args.learning_rate or 2e-4)))
    epochs = max(1, min(20, round(args.epochs or 2)))
    seed = round(args.seed or 42)
    min_gain = max(0.0, min(1.0, float(args.min_measured_gain if math.isfinite(args.min_measured_gain) else 0.02)))
    ready = examples >= MIN_EXAMPLES

    manifest = {
        "version": MANIFEST_VERSION,
        "dataset_digest": dataset_digest,
        "examples": examples,
        "base_model": BASE_MODEL,
        "runtime_model": RUNTIME_MODEL,
        "runtime": RUNTIME,
        "method": "lora",
        "rank": rank,
        "alpha": alpha,
        "dropout": dropout,
        "learning_rate": learning_rate,
        "epochs": epochs,
        "quantization": "none",
        "target_modules": TARGET_MODULES,
        "seed": seed,
    }
    manifest_digest = sha256_json(manifest)
    plan = {
        "id": args.id or f"mel-lora-{int(time.time() * 1000)}",
        "base_model": BASE_MODEL,
        "runtime_model": RUNTIME_MODEL,
        "runtime": RUNTIME,
        "dataset_digest": dataset_digest,
        "training_manifest_digest": manifest_digest,
        "training_manifest": manifest,
        "examples": examples,
        "rank": rank,
        "alpha": alpha,
        "dropout": dropout,
        "learning_rate": learning_rate,
        "epochs": epochs,
        "quantization": "none",
        "target_modules": TARGET_MODULES,
        "seed": seed,
        "min_measured_gain": min_gain,
        "status": "READY_FOR_TRAINING" if ready else "DRAFT",
        "readiness": {
            "ready_for_training": ready,
            "enough_examples": ready,
            "min_examples": MIN_EXAMPLES,
            "base_weights_frozen": True,
            "trainable_parameters": "LORA_ADAPTER_ONLY",
            "benchmark_required_before_activation": True,
            "measured_gain_required": True,
            "runtime_model_supported": True,
            "cloudflare_inference_compatible": True,
            "cloudflare_requirements": {
                "quantization": "none",
                "max_rank": 32,
                "max_adapter_bytes": MAX_ADAPTER_BYTES,
                "expected_files": ["adapter_config.json", "adapter_model.safetensors"],
                "supported_runtime_models": SUPPORTED_RUNTIME_MODELS,
            },
        },
    }

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": plan["status"],
        "plan_id": plan["id"],
        "examples": examples,
        "dataset_digest": dataset_digest,
        "training_manifest_digest": manifest_digest,
        "output": str(output),
    }, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
