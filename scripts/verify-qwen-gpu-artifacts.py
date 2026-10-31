#!/usr/bin/env python3
"""Verify Qwen3 Kaggle output locally, without declaring a model active."""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def verify(folder, source_sha=None):
    folder = Path(folder)
    evidence = folder / "training-evidence.json"
    if not evidence.is_file():
        raise ValueError("QWEN_TRAINING_EVIDENCE_MISSING")
    proof = json.loads(evidence.read_text(encoding="utf-8"))
    if not isinstance(proof, dict) or proof.get("status") != "TRAINED_UNBENCHMARKED":
        raise ValueError("QWEN_TRAINING_NOT_PROVEN")
    if proof.get("base_model") not in ("Qwen/Qwen3-14B", "mlabonne/Qwen3-14B-abliterated"):
        raise ValueError("QWEN_UNEXPECTED_BASE_MODEL")
    if type(proof.get("steps_executed")) is not int or proof["steps_executed"] < 1:
        raise ValueError("QWEN_TRAINING_STEPS_NOT_PROVEN")
    for field in ("dataset_sha256", "source_manifest_sha256"):
        if not isinstance(proof.get(field), str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", proof[field]):
            raise ValueError("QWEN_DATASET_PROVENANCE_MISSING:" + field)
    for field in ("examples", "train_examples", "validation_examples", "max_steps"):
        if type(proof.get(field)) is not int or proof[field] < 1:
            raise ValueError("QWEN_TRAINING_PLAN_INVALID:" + field)
    if (proof["train_examples"] + proof["validation_examples"] != proof["examples"]
            or proof["steps_executed"] > proof["max_steps"]):
        raise ValueError("QWEN_TRAINING_PLAN_INCONSISTENT")
    if proof.get("cuda_available") is not True or not isinstance(proof.get("gpu_name"), str) or not proof["gpu_name"].strip():
        raise ValueError("QWEN_CUDA_GPU_EVIDENCE_MISSING")
    memory = proof.get("peak_cuda_memory_mb")
    if type(memory) is not int or memory <= 0:
        raise ValueError("QWEN_GPU_MEMORY_EVIDENCE_MISSING")
    for field in ("train_loss", "baseline_eval_loss", "trained_eval_loss"):
        value = proof.get(field)
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError("QWEN_TRAINING_METRIC_MISSING:" + field)
    for filename, field in (("adapter_model.safetensors","adapter_sha256"),("adapter_config.json","adapter_config_sha256")):
        file = folder / filename
        if not file.is_file() or not file.stat().st_size:
            raise ValueError("QWEN_ADAPTER_FILE_MISSING:" + filename)
        if proof.get(field) != digest(file):
            raise ValueError("QWEN_ADAPTER_HASH_MISMATCH:" + filename)
    if proof.get("promoted") is not False or proof.get("activated") is not False:
        raise ValueError("QWEN_PREMATURE_ACTIVATION")
    if source_sha is not None:
        if not isinstance(source_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", source_sha):
            raise ValueError("QWEN_INVALID_EXPECTED_SOURCE_SHA")
        if proof.get("source_sha") != source_sha:
            raise ValueError("QWEN_SOURCE_SHA_MISMATCH")
    return {"status":"TRAINED_UNBENCHMARKED", "base_model":proof["base_model"], "steps":proof["steps_executed"], "adapter_sha256":proof["adapter_sha256"], "verified":True, "promoted":False}

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--source-sha")
    args=parser.parse_args()
    print(json.dumps(verify(args.folder, args.source_sha), sort_keys=True))
