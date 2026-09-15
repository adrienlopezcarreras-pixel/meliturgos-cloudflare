#!/usr/bin/env python3
"""Train a MEL LoRA adapter on a GPU and emit fail-closed evidence.

This script deliberately writes TRAINED_UNBENCHMARKED, never "successful".
Promotion is a separate runtime step and requires benchmark gain + compatibility.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BASE = "mistralai/Mistral-7B-Instruct-v0.2"
DEFAULT_RUNTIME = "@cf/mistral/mistral-7b-instruct-v0.2-lora"
MAX_RANK = 32


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def require_gpu(torch, allow_cpu: bool) -> None:
    if torch.cuda.is_available():
        return
    if allow_cpu:
        return
    raise SystemExit(
        "GPU_REQUIRED_FOR_LORA_TRAINING: no CUDA GPU detected. "
        "Use a compatible GPU runner; do not treat a prepared plan as trained weights."
    )


def load_rows(path: Path):
    rows = []
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            messages = row.get("messages")
            if not isinstance(messages, list) or not messages:
                raise ValueError(f"invalid messages at line {lineno}")
            rows.append(row)
    if len(rows) < 50:
        raise SystemExit(f"LORA_DATASET_TOO_SMALL: {len(rows)} examples; minimum is 50")
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help="JSONL with one {'messages': [...]} object per line")
    ap.add_argument("--output", required=True)
    ap.add_argument("--base-model", default=DEFAULT_BASE)
    ap.add_argument("--runtime-model", default=DEFAULT_RUNTIME)
    ap.add_argument("--rank", type=int, default=8)
    ap.add_argument("--alpha", type=int, default=16)
    ap.add_argument("--dropout", type=float, default=0.05)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--learning-rate", type=float, default=2e-4)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--allow-cpu", action="store_true", help="Explicitly allow impractical CPU training")
    args = ap.parse_args()

    if not 1 <= args.rank <= MAX_RANK:
        raise SystemExit(f"LORA_RANK_INVALID: rank must be in [1,{MAX_RANK}]")
    if args.base_model != DEFAULT_BASE or args.runtime_model != DEFAULT_RUNTIME:
        raise SystemExit(
            "LORA_MODEL_PAIR_NOT_APPROVED: this trainer is pinned to the currently "
            "approved MEL/Cloudflare LoRA model pair. Change code + tests before changing the pair."
        )

    dataset_path = Path(args.dataset).resolve()
    output_dir = Path(args.output).resolve()
    if not dataset_path.is_file():
        raise SystemExit("LORA_DATASET_NOT_FOUND")
    rows = load_rows(dataset_path)

    try:
        import torch
        import datasets
        import peft
        import transformers
        from datasets import Dataset
        from peft import LoraConfig, get_peft_model
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            DataCollatorForLanguageModeling,
            Trainer,
            TrainingArguments,
            set_seed,
        )
    except ImportError as exc:
        raise SystemExit(
            "LORA_TRAINING_DEPENDENCIES_MISSING: install transformers, datasets, peft, accelerate, safetensors and torch"
        ) from exc

    require_gpu(torch, args.allow_cpu)
    set_seed(args.seed)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
    )
    config = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        lora_dropout=args.dropout,
        target_modules=["q_proj", "v_proj"],
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, config)

    def render(row):
        text = tokenizer.apply_chat_template(row["messages"], tokenize=False, add_generation_prompt=False)
        tokenized = tokenizer(text, truncation=True, max_length=2048)
        tokenized["labels"] = list(tokenized["input_ids"])
        return tokenized

    raw_dataset = Dataset.from_list(rows)
    ds = raw_dataset.map(render, remove_columns=raw_dataset.column_names)
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        logging_steps=10,
        save_strategy="epoch",
        report_to=[],
        seed=args.seed,
        data_seed=args.seed,
        fp16=bool(torch.cuda.is_available()),
        remove_unused_columns=False,
    )
    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)
    trainer = Trainer(model=model, args=training_args, train_dataset=ds, data_collator=collator)
    train_result = trainer.train()
    model.save_pretrained(output_dir, safe_serialization=True)
    tokenizer.save_pretrained(output_dir)

    adapter_model = output_dir / "adapter_model.safetensors"
    adapter_config = output_dir / "adapter_config.json"
    if not adapter_model.is_file() or not adapter_config.is_file():
        raise SystemExit("LORA_ARTIFACT_MISSING_AFTER_TRAINING")

    cfg = json.loads(adapter_config.read_text(encoding="utf-8"))
    cfg["model_type"] = "mistral"
    cfg["base_model_name_or_path"] = args.base_model
    adapter_config.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    evidence = {
        "schema": "mel.lora-training-evidence.v1",
        "status": "TRAINED_UNBENCHMARKED",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "base_model": args.base_model,
        "runtime_model": args.runtime_model,
        "runtime": "cloudflare-workers-ai",
        "dataset": {
            "path": dataset_path.name,
            "examples": len(rows),
            "digest": sha256_file(dataset_path),
        },
        "hyperparameters": {
            "rank": args.rank,
            "alpha": args.alpha,
            "dropout": args.dropout,
            "epochs": args.epochs,
            "learning_rate": args.learning_rate,
            "seed": args.seed,
            "target_modules": ["q_proj", "v_proj"],
        },
        "artifacts": {
            "adapter_model": {
                "file": adapter_model.name,
                "digest": sha256_file(adapter_model),
                "size_bytes": adapter_model.stat().st_size,
            },
            "adapter_config": {
                "file": adapter_config.name,
                "digest": sha256_file(adapter_config),
                "size_bytes": adapter_config.stat().st_size,
            },
        },
        "training_metrics": {
            "train_loss": getattr(train_result, "training_loss", None),
            "global_step": getattr(train_result, "global_step", None),
        },
        "environment": {
            "python": platform.python_version(),
            "torch": getattr(torch, "__version__", "unknown"),
            "transformers": getattr(transformers, "__version__", "unknown"),
            "datasets": getattr(datasets, "__version__", "unknown"),
            "peft": getattr(peft, "__version__", "unknown"),
            "cuda_available": bool(torch.cuda.is_available()),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        },
        "promotion": {
            "approved": False,
            "reason": "BENCHMARK_REQUIRED",
            "minimum_measured_gain": 0.02,
        },
    }
    (output_dir / "training-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
