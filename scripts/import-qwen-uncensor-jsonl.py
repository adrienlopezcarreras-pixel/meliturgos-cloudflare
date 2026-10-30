#!/usr/bin/env python3
"""Import a pinned Hugging Face JSONL source without mixing TEST into training.

This is a local, unreviewed conversion only. No license approval or GPU dispatch.
"""
import argparse
import hashlib
import json
from pathlib import Path

def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return "sha256:" + h.hexdigest()

def convert(source, output, expected_sha256, limit=1000, exclude_cross_split=False):
    source, output = Path(source), Path(output)
    if not source.is_file():
        raise ValueError("QWEN_SOURCE_MISSING")
    if output.exists():
        raise ValueError("QWEN_OUTPUT_EXISTS")
    if not isinstance(expected_sha256, str) or len(expected_sha256) != 71 or not expected_sha256.startswith("sha256:") or any(c not in "0123456789abcdef" for c in expected_sha256[7:]):
        raise ValueError("QWEN_SOURCE_SHA_REQUIRED")
    actual = digest(source)
    if actual != expected_sha256:
        raise ValueError("QWEN_SOURCE_SHA_MISMATCH")
    if not 50 <= limit <= 50000:
        raise ValueError("QWEN_LIMIT_INVALID")
    selected, train_hashes, test_hashes = [], set(), set()
    counts = {"TRAIN": 0, "TEST": 0}
    with source.open(encoding="utf-8") as stream:
        for line_number, raw in enumerate(stream, 1):
            if not raw.strip():
                continue
            if len(raw) > 131072:
                raise ValueError(f"QWEN_ROW_TOO_LARGE:{line_number}")
            row = json.loads(raw)
            if not isinstance(row, dict):
                raise ValueError(f"QWEN_INVALID_ROW:{line_number}")
            split = row.get("split")
            if split not in ("TRAIN", "TEST"):
                raise ValueError(f"QWEN_UNEXPECTED_SPLIT:{line_number}")
            messages = row.get("messages")
            if not isinstance(messages, list) or not 2 <= len(messages) <= 40:
                continue
            if any(not isinstance(m, dict) or m.get("role") not in ("system", "user", "assistant") or
                   not isinstance(m.get("content"), str) or not m["content"].strip() or
                   len(m["content"]) > 32000 for m in messages):
                continue
            if not any(m["role"] == "user" for m in messages) or not any(m["role"] == "assistant" for m in messages):
                continue
            canonical = {"messages": [{"role": m["role"], "content": m["content"]} for m in messages]}
            key = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            counts[split] += 1
            if split == "TEST":
                test_hashes.add(key)
            else:
                train_hashes.add(key)
                if len(selected) < limit and not any(item[0] == key for item in selected):
                    selected.append((key, canonical))
    overlap = train_hashes & test_hashes
    if overlap and not exclude_cross_split:
        raise ValueError("QWEN_CROSS_SPLIT_DUPLICATES")
    if overlap:
        selected = [(key, row) for key, row in selected if key not in overlap]
    if len(selected) < 50:
        raise ValueError("QWEN_TOO_FEW_TRAIN_EXAMPLES")
    lines = [json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n" for _, row in selected]
    if sum(len(s.encode()) for s in lines) > 20_000_000:
        raise ValueError("QWEN_CORPUS_TOO_LARGE")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(lines), encoding="utf-8")
    return {"status": "QWEN_UNREVIEWED_TRAIN_ONLY_NOT_PUBLISHED", "source_sha256": actual,
            "output_sha256": digest(output), "train_valid_rows": counts["TRAIN"],
            "test_valid_rows_excluded": counts["TEST"], "cross_split_duplicate_conversations_excluded": len(overlap), "output_rows": len(selected),
            "license_review_passed": False, "gpu_training_performed": False}

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--expected-sha256", required=True)
    p.add_argument("--limit", type=int, default=1000)
    p.add_argument("--exclude-cross-split", action="store_true")
    args = p.parse_args()
    print(json.dumps(convert(args.input, args.output, args.expected_sha256, args.limit, args.exclude_cross_split), sort_keys=True))
