#!/usr/bin/env python3
"""Validate recovered MEL LoRA c000 tensor structure; never load or execute weights.

This is an OFFLINE structural proof, not a model-quality, inference,
Cloudflare-compatibility or promotion benchmark.
"""
import argparse
import json
import re
import struct
import sys
import tarfile
from pathlib import Path

KEY = re.compile(r"^base_model\.model\.model\.layers\.(\d+)\.self_attn\.(q_proj|v_proj)\.lora_([AB])\.weight$")
BASE = "mistralai/Mistral-7B-Instruct-v0.2"
DTYPE_BYTES = {"F32": 4}
C000_CONFIG = {"r": 8, "lora_alpha": 16, "target_modules": ["q_proj", "v_proj"],
               "peft_type": "LORA", "task_type": "CAUSAL_LM",
               "base_model_name_or_path": BASE}


def verify_header(header, config, body_size):
    """Check a c000 safetensors header without ever allocating tensor contents."""
    if not isinstance(header, dict) or header.get("__metadata__") != {"format": "pt"}:
        raise ValueError("LORA_STRUCTURE_METADATA_INVALID")
    if not isinstance(config, dict) or any(config.get(k) != v for k, v in C000_CONFIG.items()):
        raise ValueError("LORA_STRUCTURE_CONFIG_MISMATCH")
    tensors = {k: v for k, v in header.items() if k != "__metadata__"}
    if len(tensors) != 128:
        raise ValueError("LORA_STRUCTURE_TENSOR_COUNT_INVALID")
    expected = {(layer, module, kind) for layer in range(32)
                for module in ("q_proj", "v_proj") for kind in ("A", "B")}
    observed = set()
    offsets = []
    for key, tensor in tensors.items():
        match = KEY.fullmatch(key)
        if match is None or not isinstance(tensor, dict):
            raise ValueError("LORA_STRUCTURE_TENSOR_NAME_INVALID")
        layer, module, kind = int(match[1]), match[2], match[3]
        observed.add((layer, module, kind))
        width = 4096 if module == "q_proj" else 1024
        shape = [8, 4096] if kind == "A" else [width, 8]
        if tensor.get("dtype") != "F32" or tensor.get("shape") != shape:
            raise ValueError("LORA_STRUCTURE_TENSOR_SHAPE_INVALID")
        raw = tensor.get("data_offsets")
        if not isinstance(raw, list) or len(raw) != 2 or any(type(x) is not int for x in raw):
            raise ValueError("LORA_STRUCTURE_OFFSETS_INVALID")
        lo, hi = raw
        if lo < 0 or hi <= lo or hi > body_size or hi - lo != shape[0] * shape[1] * 4:
            raise ValueError("LORA_STRUCTURE_TENSOR_SIZE_INVALID")
        offsets.append((lo, hi))
    if observed != expected:
        raise ValueError("LORA_STRUCTURE_LAYER_COVERAGE_INVALID")
    cursor = 0
    for lo, hi in sorted(offsets):
        if lo != cursor:
            raise ValueError("LORA_STRUCTURE_OFFSETS_NOT_CONTIGUOUS")
        cursor = hi
    if cursor != body_size:
        raise ValueError("LORA_STRUCTURE_BODY_SIZE_MISMATCH")
    return {"status": "STRUCTURE_VERIFIED_ONLY_NOT_BENCHMARKED",
            "layers": 32, "tensors": len(tensors), "rank": 8,
            "dtype": "F32", "activated": False, "promoted": False}


def verify_bundle(path):
    if Path(path).stat().st_size > 320_000_000:
        raise ValueError("LORA_STRUCTURE_BUNDLE_TOO_LARGE")
    with tarfile.open(path, "r:gz") as archive:
        names = archive.getnames()
        if len(names) != len(set(names)):
            raise ValueError("LORA_STRUCTURE_DUPLICATE_MEMBER")
        weights = archive.getmember("adapter_model.safetensors")
        cfg = archive.getmember("adapter_config.json")
        if not weights.isfile() or not cfg.isfile() or cfg.size > 100_000:
            raise ValueError("LORA_STRUCTURE_MEMBER_INVALID")
        with archive.extractfile(cfg) as f:
            config = json.load(f)
        with archive.extractfile(weights) as f:
            head_size_bytes = f.read(8)
            if len(head_size_bytes) != 8:
                raise ValueError("LORA_STRUCTURE_HEADER_TRUNCATED")
            head_size = struct.unpack("<Q", head_size_bytes)[0]
            if head_size < 2 or head_size > 1_000_000 or head_size + 8 > weights.size:
                raise ValueError("LORA_STRUCTURE_HEADER_SIZE_INVALID")
            header = json.loads(f.read(head_size))
        return verify_header(header, config, weights.size - head_size - 8)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle")
    args = parser.parse_args()
    try:
        print(json.dumps(verify_bundle(args.bundle), sort_keys=True))
    except Exception as exc:
        print("LORA_STRUCTURE_VERIFICATION_FAILED: " + type(exc).__name__ +
              ": " + str(exc), file=sys.stderr)
        sys.exit(1)
