#!/usr/bin/env python3
"""Verify Qwen3 Kaggle output locally, without declaring a model active."""
import argparse
import hashlib
import json
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
    if proof.get("base_model") != "Qwen/Qwen3-14B":
        raise ValueError("QWEN_UNEXPECTED_BASE_MODEL")
    if type(proof.get("steps_executed")) is not int or proof["steps_executed"] < 1:
        raise ValueError("QWEN_TRAINING_STEPS_NOT_PROVEN")
    for filename, field in (("adapter_model.safetensors","adapter_sha256"),("adapter_config.json","adapter_config_sha256")):
        file = folder / filename
        if not file.is_file() or not file.stat().st_size:
            raise ValueError("QWEN_ADAPTER_FILE_MISSING:" + filename)
        if proof.get(field) != digest(file):
            raise ValueError("QWEN_ADAPTER_HASH_MISMATCH:" + filename)
    if proof.get("promoted") is not False or proof.get("activated") is not False:
        raise ValueError("QWEN_PREMATURE_ACTIVATION")
    if source_sha is not None and proof.get("source_sha") != source_sha:
        raise ValueError("QWEN_SOURCE_SHA_MISMATCH")
    return {"status":"TRAINED_UNBENCHMARKED", "base_model":proof["base_model"], "steps":proof["steps_executed"], "adapter_sha256":proof["adapter_sha256"], "verified":True, "promoted":False}

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--source-sha")
    args=parser.parse_args()
    print(json.dumps(verify(args.folder, args.source_sha), sort_keys=True))
