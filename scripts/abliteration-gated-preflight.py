#!/usr/bin/env python3
"""Independent Abliteration plan preflight. No model downloads, GPU or promotion."""
import argparse
import hashlib
import json
from pathlib import Path

def sha(path):
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()

def plan(config_path):
    file=Path(config_path)
    data=json.loads(file.read_text(encoding="utf-8"))
    if not isinstance(data,dict):
        raise ValueError("ABLITERATION_INVALID_CONFIG")
    if data.get("reviewed") is not True:
        raise ValueError("ABLITERATION_REVIEW_REQUIRED")
    if data.get("base_model") not in ("Qwen/Qwen3-14B",):
        raise ValueError("ABLITERATION_UNSUPPORTED_MODEL")
    if data.get("method")!="directional-refusal-vector":
        raise ValueError("ABLITERATION_UNSUPPORTED_METHOD")
    if data.get("dataset_license_reviewed") is not True:
        raise ValueError("ABLITERATION_DATASET_LICENSE_REVIEW_REQUIRED")
    for key in ("positive_dataset_sha256","negative_dataset_sha256"):
        value=data.get(key)
        if not isinstance(value,str) or len(value)!=71 or not value.startswith("sha256:") or any(c not in "0123456789abcdef" for c in value[7:]):
            raise ValueError("ABLITERATION_INVALID_DIGEST:"+key)
    if data["positive_dataset_sha256"]==data["negative_dataset_sha256"]:
        raise ValueError("ABLITERATION_DATASETS_NOT_DISTINCT")
    return {"status":"ABLITERATION_PLAN_VALIDATED_UNTRAINED",
            "base_model":data["base_model"],"method":data["method"],
            "config_sha256":sha(file),"gpu_training_verified":False,
            "checkpoint_verified":False,"promoted":False,"activated":False}

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--config",required=True)
    args=parser.parse_args()
    print(json.dumps(plan(args.config),sort_keys=True))
