#!/usr/bin/env python3
"""MEL Qwen3-14B QLoRA trainer: separate, evidence-first, never promotes a model.

GPU dependencies are lazy-imported, so --dry-run validates the dataset on CPU.
This entrypoint never loads or modifies Mistral checkpoints. It requires a
reviewed dataset manifest with an exact SHA-256 before starting a GPU job.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

# Owner decision 31/10: free Kaggle GPUs cannot abliterate a 14B model (needs
# >=40 GB). Train on Maxime Labonne's published abliteration of Qwen3-14B
# (Apache-2.0), pinned to an immutable revision.
BASE_MODEL = "mlabonne/Qwen3-14B-abliterated"
BASE_REVISION = "9d8db58cddb750e732cd2179fa504e8830b733ce"
ORIGIN_MODEL = "Qwen/Qwen3-14B"
ROLES = {"system", "user", "assistant"}
MIN_ROWS = 50


def sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(block)
    return "sha256:" + hasher.hexdigest()


def read_corpus(path: Path):
    rows = []
    seen = set()
    with path.open("r", encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, 1):
            if not raw.strip():
                continue
            if len(raw) > 131072:
                raise ValueError(f"QWEN_DATA_ROW_TOO_LARGE:{line_no}")
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"QWEN_DATA_INVALID_JSON:{line_no}") from exc
            messages = data.get("messages") if isinstance(data, dict) else None
            if not isinstance(messages, list) or len(messages) < 2 or len(messages) > 40:
                raise ValueError(f"QWEN_DATA_INVALID_MESSAGES:{line_no}")
            if any(not isinstance(m, dict) or m.get("role") not in ROLES
                   or not isinstance(m.get("content"), str) or not m["content"].strip()
                   or len(m["content"]) > 32000 for m in messages):
                raise ValueError(f"QWEN_DATA_INVALID_ROLE_OR_TEXT:{line_no}")
            if not any(m["role"] == "user" for m in messages) or not any(
                    m["role"] == "assistant" for m in messages):
                raise ValueError(f"QWEN_DATA_MISSING_USER_OR_ASSISTANT:{line_no}")
            canonical = [{"role": m["role"], "content": m["content"]} for m in messages]
            fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True,
                                                     ensure_ascii=False).encode("utf-8")).hexdigest()
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            rows.append({"messages": canonical})
    if len(rows) < MIN_ROWS:
        raise ValueError(f"QWEN_DATA_TOO_SMALL:{len(rows)}:{MIN_ROWS}")
    return rows


def validate_manifest(path: Path, dataset_digest: str):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("dataset_sha256") != dataset_digest:
        raise ValueError("QWEN_DATASET_DIGEST_MISMATCH")
    if manifest.get("license_review_passed") is not True:
        raise ValueError("QWEN_DATASET_LICENSE_REVIEW_REQUIRED")
    sources = manifest.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("QWEN_DATASET_SOURCES_REQUIRED")
    for src in sources:
        if not isinstance(src, dict) or not isinstance(src.get("id"), str) or not src["id"].strip() \
                or not isinstance(src.get("revision"), str) or not src["revision"].strip() \
                or not isinstance(src.get("license"), str) or not src["license"].strip():
            raise ValueError("QWEN_DATASET_SOURCE_PROVENANCE_REQUIRED")
    return manifest


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--manifest", required=True, help="Reviewed source manifest with dataset_sha256")
    ap.add_argument("--output", required=True)
    ap.add_argument("--dry-run", action="store_true", help="Validate only, no model download or GPU")
    ap.add_argument("--max-steps", type=int, default=50)
    ap.add_argument("--max-length", type=int, default=512)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--alpha", type=int, default=32)
    ap.add_argument("--learning-rate", type=float, default=2e-4)
    ap.add_argument("--seed", type=int, default=42)
    return ap.parse_args(argv)


def run(argv=None):
    args = parse_args(argv)
    dataset = Path(args.dataset).resolve()
    source_manifest = Path(args.manifest).resolve()
    output = Path(args.output).resolve()
    if not dataset.is_file() or not source_manifest.is_file():
        raise ValueError("QWEN_DATASET_OR_MANIFEST_MISSING")
    if not (1 <= args.max_steps <= 250000 and 128 <= args.max_length <= 8192
            and 1 <= args.rank <= 64 and 1 <= args.alpha <= 1024
            and 1e-7 <= args.learning_rate <= 1e-3 and 0 <= args.seed <= 2**32 - 1):
        raise ValueError("QWEN_INVALID_TRAINING_PARAMETERS")
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("QWEN_IMMUTABLE_OUTPUT_ALREADY_EXISTS")

    digest = sha256(dataset)
    manifest = validate_manifest(source_manifest, digest)
    rows = read_corpus(dataset)
    random.Random(args.seed).shuffle(rows)
    validation_count = max(5, len(rows) // 10)
    train_rows = rows[validation_count:]
    eval_rows = rows[:validation_count]
    plan = {
        "status": "TRAINING_PLAN_VALIDATED_UNTRAINED",
        "base_model": BASE_MODEL, "base_revision": BASE_REVISION, "origin_model": ORIGIN_MODEL,
        "training_mode": "qlora-4bit-nf4",
        "dataset_sha256": digest,
        "source_manifest_sha256": sha256(source_manifest),
        "source_count": len(manifest["sources"]),
        "examples": len(rows),
        "train_examples": len(train_rows),
        "validation_examples": len(eval_rows),
        "rank": args.rank,
        "alpha": args.alpha,
        "max_steps": args.max_steps,
        "max_length": args.max_length,
        "learning_rate": args.learning_rate,
        "seed": args.seed,
    }
    if args.dry_run:
        print(json.dumps(plan, ensure_ascii=False, sort_keys=True))
        return plan

    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig, Trainer, TrainingArguments
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from datasets import Dataset
    except ImportError as exc:
        raise RuntimeError("QWEN_GPU_DEPENDENCIES_MISSING") from exc

    if not torch.cuda.is_available():
        raise RuntimeError("QWEN_CUDA_REQUIRED")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, revision=BASE_REVISION, trust_remote_code=False)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, revision=BASE_REVISION,
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                                bnb_4bit_use_double_quant=True,
                                                bnb_4bit_compute_dtype=torch.float16),
        device_map="auto", torch_dtype=torch.float16, trust_remote_code=False,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model = get_peft_model(model, LoraConfig(
        r=args.rank, lora_alpha=args.alpha, lora_dropout=0.05, bias="none",
        task_type="CAUSAL_LM", target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                                               "gate_proj", "up_proj", "down_proj"]
    ))

    def encode(item):
        text = tokenizer.apply_chat_template(item["messages"], tokenize=False,
                                             add_generation_prompt=False)
        encoded = tokenizer(text, truncation=True, max_length=args.max_length)
        encoded["labels"] = list(encoded["input_ids"])
        return encoded

    class PaddedCausalCollator:
        def __call__(self, batch):
            longest = max(len(row["input_ids"]) for row in batch)
            ids, masks, labels = [], [], []
            for row in batch:
                length = longest - len(row["input_ids"])
                ids.append(row["input_ids"] + [tokenizer.pad_token_id] * length)
                masks.append(row["attention_mask"] + [0] * length)
                labels.append(row["labels"] + [-100] * length)
            return {"input_ids": torch.tensor(ids), "attention_mask": torch.tensor(masks),
                    "labels": torch.tensor(labels)}

    train_ds = Dataset.from_list(train_rows).map(encode, remove_columns=["messages"])
    eval_ds = Dataset.from_list(eval_rows).map(encode, remove_columns=["messages"])
    if not all(len(row["input_ids"]) >= 8 for row in train_ds):
        raise ValueError("QWEN_TOKENIZED_SEQUENCE_TOO_SHORT")
    if any(all(label == tokenizer.pad_token_id for label in row["labels"]) for row in train_ds):
        raise ValueError("QWEN_TOKENIZED_SEQUENCE_EMPTY")

    output.mkdir(parents=True, exist_ok=True)
    kwargs = dict(
        output_dir=str(output), max_steps=args.max_steps, per_device_train_batch_size=1,
        per_device_eval_batch_size=1, gradient_accumulation_steps=8, learning_rate=args.learning_rate,
        logging_steps=5, save_strategy="no", fp16=True, gradient_checkpointing=True,
        seed=args.seed, report_to="none", remove_unused_columns=False,
    )
    trainer = Trainer(model=model, args=TrainingArguments(**kwargs),
                      train_dataset=train_ds, eval_dataset=eval_ds,
                      data_collator=PaddedCausalCollator())
    baseline = trainer.evaluate()
    trained = trainer.train()
    after = trainer.evaluate()
    model.save_pretrained(str(output), safe_serialization=True)
    tokenizer.save_pretrained(str(output))
    weights = output / "adapter_model.safetensors"
    config = output / "adapter_config.json"
    if not weights.is_file() or not config.is_file() or int(trainer.state.global_step) < 1:
        raise RuntimeError("QWEN_TRAINED_ARTIFACTS_NOT_PROVED")
    proof = dict(plan)
    proof.update({
        "status": "TRAINED_UNBENCHMARKED",
        "cuda_available": True,
        "gpu_name": torch.cuda.get_device_name(0),
        "steps_executed": int(trainer.state.global_step),
        "train_loss": float(trained.training_loss),
        "baseline_eval_loss": float(baseline.get("eval_loss", -1)),
        "trained_eval_loss": float(after.get("eval_loss", -1)),
        "adapter_sha256": sha256(weights),
        "adapter_config_sha256": sha256(config),
        "peak_cuda_memory_mb": int(torch.cuda.max_memory_allocated() / (1024 * 1024)),
        "promoted": False,
        "activated": False,
    })
    (output / "training-evidence.json").write_text(json.dumps(proof, indent=2,
        ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(proof, ensure_ascii=False, sort_keys=True))
    return proof


if __name__ == "__main__":
    try:
        run()
    except (ValueError, RuntimeError) as exc:
        raise SystemExit(str(exc)) from exc
