#!/usr/bin/env python3
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

TARGET_SHA = "__MEL_GIT_SHA__"
CYCLE = int("__MEL_CYCLE__")
SHARD_SIZE = int("__MEL_SHARD_SIZE__")
MEL_TRAIN_SCRIPT_B64 = """__MEL_TRAIN_SCRIPT_B64__"""
MEL_PLAN_SCRIPT_B64 = """__MEL_PLAN_SCRIPT_B64__"""
MEL_SHARD_GZ_B64 = """__MEL_SHARD_GZ_B64__"""
MEL_SHARD_META_B64 = """__MEL_SHARD_META_B64__"""
MEL_PARENT_BUNDLE_B64 = """__MEL_PARENT_BUNDLE_B64__"""

WORK = Path("/kaggle/working")
SRC = WORK / "mel-src"
SCRIPTS = SRC / "scripts"
DATA = WORK / "data"
SHARD = DATA / f"mel-uncensored-cycle-{CYCLE:03d}.jsonl"
SHARD_META = DATA / f"mel-uncensored-cycle-{CYCLE:03d}.meta.json"
OUTPUT = WORK / "mel-lora-output"
PARENT = WORK / "parent-adapter"
BUNDLE = WORK / "mel-lora-bundle.tar.gz"
RUN_META = WORK / "kaggle-run.json"

def run(cmd, *, cwd=None):
    print("+", " ".join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), cwd=str(cwd) if cwd else None, check=True)

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def decode_text(value: str, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(value.encode("ascii")))

def extract_embedded_payload():
    SCRIPTS.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    decode_text(MEL_TRAIN_SCRIPT_B64, SCRIPTS / "train-mel-lora.py")
    decode_text(MEL_PLAN_SCRIPT_B64, SCRIPTS / "create-lora-plan.py")
    compressed = base64.b64decode(MEL_SHARD_GZ_B64.encode("ascii"))
    SHARD.write_bytes(gzip.decompress(compressed))
    decode_text(MEL_SHARD_META_B64, SHARD_META)

def find_base_model() -> Path:
    candidates = [
        Path("/kaggle/input/mistral-7b-instruct-v02-fp16"),
        Path("/kaggle/input/mistral-7b-instruct-v0-2"),
    ]
    for path in candidates:
        if (path / "config.json").is_file() and (path / "tokenizer_config.json").is_file():
            return path
    for cfg in Path("/kaggle/input").rglob("config.json"):
        root = cfg.parent
        if (root / "tokenizer_config.json").is_file() and (
            (root / "model.safetensors.index.json").is_file()
            or any(root.glob("model-*.safetensors"))
        ):
            return root
    raise SystemExit("KAGGLE_MISTRAL_BASE_MODEL_NOT_FOUND")

def ensure_dependencies():
    required = ("torch", "transformers", "peft", "accelerate", "bitsandbytes", "datasets", "safetensors")
    missing = []
    for name in required:
        try:
            __import__(name)
        except Exception:
            missing.append(name)
    if not missing:
        print("LoRA dependencies already available in Kaggle image", flush=True)
        return

    wheels_root = Path("/kaggle/input/hf-libraries")
    if not wheels_root.exists():
        raise SystemExit("KAGGLE_HF_LIBRARIES_INPUT_MISSING:" + ",".join(missing))

    aliases = {
        "transformers": "transformers-",
        "peft": "peft-",
        "accelerate": "accelerate-",
        "bitsandbytes": "bitsandbytes-",
        "datasets": "datasets-",
        "safetensors": "safetensors-",
    }
    wheels = []
    for name in missing:
        if name == "torch":
            # Kaggle GPU images must provide a CUDA-matched torch build.
            raise SystemExit("KAGGLE_TORCH_MISSING")
        prefix = aliases.get(name)
        found = sorted(p for p in wheels_root.rglob("*.whl") if p.name.lower().startswith(prefix))
        if not found:
            raise SystemExit("KAGGLE_OFFLINE_WHEEL_MISSING:" + name)
        wheels.append(found[-1])
    run([sys.executable, "-m", "pip", "install", "--no-index", "--no-deps", *wheels])

def extract_parent() -> str | None:
    if not MEL_PARENT_BUNDLE_B64.strip():
        return None
    archive = WORK / "parent-bundle.tar.gz"
    archive.write_bytes(base64.b64decode(MEL_PARENT_BUNDLE_B64.encode("ascii")))
    PARENT.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(PARENT)
    artifact = json.loads((PARENT / "artifact-evidence.json").read_text(encoding="utf-8"))
    digest = str(artifact.get("digest") or "").lower()
    if not digest.startswith("sha256:"):
        raise SystemExit("KAGGLE_PARENT_DIGEST_INVALID")
    return digest

def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8") as fh:
        return sum(1 for line in fh if line.strip())

def main():
    if TARGET_SHA.startswith("__"):
        raise SystemExit("MEL_GIT_SHA_NOT_INJECTED")
    if SHARD_SIZE < 50:
        raise SystemExit("MEL_SHARD_SIZE_TOO_SMALL")

    extract_embedded_payload()
    if count_lines(SHARD) != SHARD_SIZE:
        raise SystemExit(f"MEL_SHARD_COUNT_INVALID:{count_lines(SHARD)}:{SHARD_SIZE}")

    shard_meta = json.loads(SHARD_META.read_text(encoding="utf-8"))
    if int(shard_meta.get("cycle", -1)) != CYCLE:
        raise SystemExit("MEL_SHARD_CYCLE_MISMATCH")
    if str(shard_meta.get("output_sha256") or "") != sha256_file(SHARD):
        raise SystemExit("MEL_SHARD_DIGEST_MISMATCH")

    ensure_dependencies()
    base_model = find_base_model()
    print(json.dumps({
        "offline": True,
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "base_model_path": str(base_model),
        "shard_sha256": sha256_file(SHARD),
    }, indent=2), flush=True)

    plan = DATA / f"lora-plan-cycle-{CYCLE:03d}.json"
    run([
        sys.executable, SCRIPTS / "create-lora-plan.py",
        "--dataset", SHARD,
        "--output", plan,
        "--id", f"mel-kaggle-uncensored-c{CYCLE:03d}-{TARGET_SHA[:12]}",
        "--epochs", "1",
        "--rank", "8",
        "--alpha", "16",
        "--dropout", "0.05",
        "--learning-rate", "0.0002",
        "--seed", "42",
    ])

    parent_digest = extract_parent()
    stage = "uncensored-continue" if parent_digest else "uncensored"
    cmd = [
        sys.executable, SCRIPTS / "train-mel-lora.py",
        "--dataset", SHARD,
        "--plan", plan,
        "--output", OUTPUT,
        "--base-model-path", base_model,
        "--stage", stage,
        "--epochs", "1",
        "--max-length", "512",
        "--gradient-accumulation-steps", "8",
        "--save-steps", "1000000",
        "--seed", "42",
    ]
    if parent_digest:
        cmd += [
            "--parent-adapter-dir", PARENT,
            "--parent-artifact-digest", parent_digest,
        ]
    run(cmd)

    shutil.copy2(SHARD_META, OUTPUT / "shard-metadata.json")
    dataset_meta = {
        "schema": "mel.kaggle-offline-dataset-evidence.v1",
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "examples": SHARD_SIZE,
        "output_sha256": sha256_file(SHARD),
        "source_metadata": shard_meta,
        "offline_kernel": True,
    }
    (OUTPUT / "dataset-metadata.json").write_text(json.dumps(dataset_meta, indent=2) + "\n", encoding="utf-8")

    required = [
        "adapter_model.safetensors",
        "adapter_config.json",
        "training-evidence.json",
        "artifact-evidence.json",
        "lora-plan.json",
        "dataset-metadata.json",
        "shard-metadata.json",
    ]
    for name in required:
        target = OUTPUT / name
        if not target.is_file() or target.stat().st_size <= 0:
            raise SystemExit(f"MEL_OUTPUT_MISSING:{name}")

    artifact = json.loads((OUTPUT / "artifact-evidence.json").read_text(encoding="utf-8"))
    training = json.loads((OUTPUT / "training-evidence.json").read_text(encoding="utf-8"))
    run_meta = {
        "status": "TRAINED_UNBENCHMARKED",
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "stage": stage,
        "shard_size": SHARD_SIZE,
        "artifact_digest": artifact["digest"],
        "parent_artifact_digest": parent_digest,
        "train_loss": training.get("training_metrics", {}).get("train_loss"),
        "global_step": training.get("training_metrics", {}).get("global_step"),
        "offline_kernel": True,
    }
    RUN_META.write_text(json.dumps(run_meta, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(RUN_META, OUTPUT / "kaggle-run.json")

    with tarfile.open(BUNDLE, "w:gz") as tar:
        for name in required + ["kaggle-run.json"]:
            tar.add(OUTPUT / name, arcname=name)

    print(json.dumps({
        **run_meta,
        "bundle": str(BUNDLE),
        "bundle_sha256": sha256_file(BUNDLE),
    }, indent=2), flush=True)

if __name__ == "__main__":
    main()
