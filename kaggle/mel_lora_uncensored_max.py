#!/usr/bin/env python3
"""Kaggle GPU entrypoint for MEL UNCENSORED MAX.

Designed for Kaggle "Save & Run All" / API execution with a free GPU.
It clones the exact candidate SHA, builds the maximal verbatim training corpus
from public sources, trains the LoRA, and leaves a self-contained evidence
bundle under /kaggle/working/mel-lora-output for later GitHub collection.

No Hugging Face write token is required inside Kaggle.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path("/kaggle/working")
REPO = ROOT / "meliturgos-cloudflare"
DATA = ROOT / "mel-data"
OUT = ROOT / "mel-lora-output"
SHA = os.environ.get("MEL_CANDIDATE_SHA", "").strip()
BRANCH = os.environ.get("MEL_CANDIDATE_BRANCH", "candidate/mel-clean-autonomy").strip()

def run(*args, cwd=None):
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run([str(x) for x in args], cwd=cwd, check=True)

def ensure_repo():
    if REPO.exists():
        shutil.rmtree(REPO)
    run("git", "clone", "--branch", BRANCH, "--single-branch",
        "https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare.git", REPO)
    if SHA:
        run("git", "checkout", SHA, cwd=REPO)
    run(sys.executable, "-m", "pip", "install", "-U", "pip")
    req = REPO / "requirements-lora.txt"
    run(sys.executable, "-m", "pip", "install", "-r", req)
    run(sys.executable, "-m", "pip", "install", "datasets", "huggingface_hub")

def export_hf_dataset(repo_id: str, target: Path):
    from datasets import load_dataset
    if target.exists() and target.stat().st_size > 0:
        return
    ds = load_dataset(repo_id, split="train")
    ds.to_json(str(target), orient="records", lines=True, force_ascii=False)
    print(json.dumps({"repo_id": repo_id, "rows": len(ds), "target": str(target)}), flush=True)

def main():
    ensure_repo()
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    ultra = DATA / "ultrachat-uncensored-train.jsonl"
    opus = DATA / "opus-no-refusal.jsonl"
    mel = DATA / "mel-lessons.jsonl"
    train = DATA / "mel-uncensored-max.jsonl"
    quarantine = DATA / "mel-uncensored-max.quarantine.jsonl"
    plan = DATA / "lora-plan.json"

    export_hf_dataset("wangqi777/ultrachat-uncensored", ultra)
    export_hf_dataset("anthracite-org/kalo-opus-instruct-22k-no-refusal", opus)

    run("node", "scripts/export-canonical-lora-dataset.mjs",
        "--output", mel, cwd=REPO)

    run(sys.executable, "scripts/prepare-mel-max-lora.py",
        "--ultrachat-train", ultra,
        "--opus", opus,
        "--mel-lessons", mel,
        "--output", train,
        "--quarantine-output", quarantine,
        cwd=REPO)

    run("node", "scripts/create-lora-plan.mjs",
        "--dataset", train,
        "--output", plan,
        "--epochs", "1",
        "--seed", "42",
        cwd=REPO)

    run(sys.executable, "scripts/train-mel-lora.py",
        "--dataset", train,
        "--plan", plan,
        "--output", OUT,
        "--stage", "uncensored",
        "--epochs", "1",
        "--save-steps", "100",
        "--gradient-accumulation-steps", "8",
        "--seed", "42",
        cwd=REPO)

    meta = Path(str(train) + ".meta.json")
    if meta.is_file():
        shutil.copy2(meta, OUT / "dataset-metadata.json")

    manifest = {
        "status": "KAGGLE_TRAINING_FINISHED",
        "candidate_sha": SHA or None,
        "candidate_branch": BRANCH,
        "output_dir": str(OUT),
        "files": sorted(p.name for p in OUT.iterdir() if p.is_file()),
    }
    (OUT / "kaggle-run.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2), flush=True)

if __name__ == "__main__":
    main()
