#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

TARGET_SHA = "__MEL_GIT_SHA__"
CYCLE = int("__MEL_CYCLE__")
SHARD_SIZE = int("__MEL_SHARD_SIZE__")
PARENT_BUNDLE_URL = "__MEL_PARENT_BUNDLE_URL__"
MEL_LESSONS_B64 = """__MEL_LESSONS_B64__"""

WORK = Path("/kaggle/working")
REPO = WORK / "meliturgos-cloudflare"
DATA = WORK / "data"
FULL = DATA / "mel-uncensored-max.jsonl"
SHARD = DATA / f"mel-uncensored-cycle-{CYCLE:03d}.jsonl"
MEL = DATA / "mel-canonical-50.jsonl"
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

def export_streaming_dataset(repo_id: str, target: Path):
    if target.is_file() and target.stat().st_size > 0:
        print("reuse", target)
        return
    from datasets import load_dataset
    print("streaming", repo_id)
    ds = load_dataset(repo_id, split="train", streaming=True)
    with target.open("w", encoding="utf-8") as out:
        for i, row in enumerate(ds, 1):
            out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            if i % 10000 == 0:
                print(repo_id, i, flush=True)

def copy_public_window(source: Path, target, start: int, count: int) -> int:
    written = 0
    with source.open("r", encoding="utf-8") as fh:
        for index, line in enumerate(fh):
            if index < start:
                continue
            if written >= count:
                break
            if line.strip():
                target.write(line)
                written += 1
    return written

def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8") as fh:
        return sum(1 for line in fh if line.strip())

def extract_parent(url: str):
    if not url:
        return None
    archive = WORK / "parent-bundle.tar.gz"
    print("download parent", url)
    req = urllib.request.Request(url, headers={"User-Agent": "mel-kaggle-lora/1.0"})
    with urllib.request.urlopen(req, timeout=180) as response, archive.open("wb") as out:
        shutil.copyfileobj(response, out)
    PARENT.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(PARENT)
    artifact = json.loads((PARENT / "artifact-evidence.json").read_text(encoding="utf-8"))
    return artifact["digest"]

def main():
    if TARGET_SHA.startswith("__"):
        raise SystemExit("MEL_GIT_SHA_NOT_INJECTED")
    if SHARD_SIZE < 50:
        raise SystemExit("MEL_SHARD_SIZE_TOO_SMALL")
    DATA.mkdir(parents=True, exist_ok=True)

    # Preserve Kaggle's working CUDA/PyTorch build. Install only higher-level LoRA deps.
    run([
        sys.executable, "-m", "pip", "install", "-q", "-U",
        "transformers>=4.45", "datasets>=2.20", "peft>=0.13",
        "accelerate>=0.33", "bitsandbytes>=0.43", "safetensors>=0.4",
        "huggingface_hub>=0.25",
    ])

    run(["git", "init", str(REPO)])
    run(["git", "-C", str(REPO), "remote", "add", "origin", "https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare.git"])
    run(["git", "-C", str(REPO), "fetch", "--depth", "1", "origin", TARGET_SHA])
    run(["git", "-C", str(REPO), "checkout", "--detach", "FETCH_HEAD"])

    MEL.write_bytes(base64.b64decode(MEL_LESSONS_B64.encode("ascii")))
    mel_count = count_lines(MEL)
    if mel_count != 50:
        raise SystemExit(f"MEL_CANONICAL_LESSON_COUNT_INVALID:{mel_count}")

    ultra = DATA / "ultrachat-train.jsonl"
    opus = DATA / "opus-no-refusal.jsonl"
    export_streaming_dataset("wangqi777/ultrachat-uncensored", ultra)
    export_streaming_dataset("anthracite-org/kalo-opus-instruct-22k-no-refusal", opus)

    quarantine = DATA / "mel-uncensored-max.quarantine.jsonl"
    run([
        sys.executable, REPO / "scripts/prepare-mel-max-lora.py",
        "--ultrachat-train", ultra,
        "--opus", opus,
        "--mel-lessons", MEL,
        "--output", FULL,
        "--quarantine-output", quarantine,
    ])

    full_meta = json.loads(Path(str(FULL) + ".meta.json").read_text(encoding="utf-8"))
    total = int(full_meta["examples"])
    if total < 50:
        raise SystemExit("MEL_FULL_CORPUS_TOO_SMALL")

    # Reserve 50 examples in every cycle for MEL's canonical lessons.
    public_count = max(0, SHARD_SIZE - mel_count)
    public_total = max(1, total - mel_count)
    start = (CYCLE * public_count) % public_total if public_count else 0
    with SHARD.open("w", encoding="utf-8") as out:
        written = copy_public_window(FULL, out, start, public_count)
        if written < public_count:
            written += copy_public_window(FULL, out, 0, public_count - written)
        with MEL.open("r", encoding="utf-8") as mel_in:
            for line in mel_in:
                if line.strip():
                    out.write(line)
    shard_examples = count_lines(SHARD)
    if shard_examples != SHARD_SIZE:
        raise SystemExit(f"MEL_SHARD_COUNT_INVALID:{shard_examples}:{SHARD_SIZE}")

    plan = DATA / f"lora-plan-cycle-{CYCLE:03d}.json"
    run([
        sys.executable, REPO / "scripts/create-lora-plan.py",
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

    parent_digest = extract_parent(PARENT_BUNDLE_URL)
    stage = "uncensored-continue" if parent_digest else "uncensored"
    cmd = [
        sys.executable, REPO / "scripts/train-mel-lora.py",
        "--dataset", SHARD,
        "--plan", plan,
        "--output", OUTPUT,
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

    shutil.copy2(Path(str(FULL) + ".meta.json"), OUTPUT / "dataset-metadata.json")
    shard_meta = {
        "schema": "mel.kaggle-lora-cycle.v1",
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "stage": stage,
        "shard_size": SHARD_SIZE,
        "canonical_mel_lessons": mel_count,
        "public_examples": public_count,
        "public_start": start,
        "full_training_examples": total,
        "full_quarantined_examples": int(full_meta.get("quarantined_examples") or 0),
        "shard_sha256": sha256_file(SHARD),
        "parent_artifact_digest": parent_digest,
    }
    (OUTPUT / "shard-metadata.json").write_text(json.dumps(shard_meta, indent=2) + "\n", encoding="utf-8")

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
        path = OUTPUT / name
        if not path.is_file() or path.stat().st_size <= 0:
            raise SystemExit(f"MEL_OUTPUT_MISSING:{name}")

    run_meta = {
        "status": "TRAINED_UNBENCHMARKED",
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "stage": stage,
        "shard_size": SHARD_SIZE,
        "artifact_digest": json.loads((OUTPUT / "artifact-evidence.json").read_text(encoding="utf-8"))["digest"],
        "parent_artifact_digest": parent_digest,
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
