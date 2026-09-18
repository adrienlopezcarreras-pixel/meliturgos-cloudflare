#!/usr/bin/env python3
"""Prepare one deterministic MEL Kaggle training shard on GitHub Actions.

The GPU kernel receives only the already-prepared shard, so Kaggle itself does
not need network access. Public source conversations are streamed from their
canonical Hugging Face datasets here, normalized without rewriting content or
turn order, and operational high-risk rows are excluded from the training
shard. Exactly 50 canonical MEL lessons are appended to every shard.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

ULTRA_REPO = "Devilishcode/ultrachat-uncensored"
OPUS_REPO = "anthracite-org/kalo-opus-instruct-22k-no-refusal"

def sha256_bytes(raw: bytes) -> str:
    return "sha256:" + hashlib.sha256(raw).hexdigest()

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def load_normalizer(path: Path):
    spec = importlib.util.spec_from_file_location("mel_prepare_max", str(path))
    if spec is None or spec.loader is None:
        raise SystemExit("LORA_NORMALIZER_IMPORT_FAILED")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def exact_digest(row) -> str:
    raw = json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(raw)

def collect_stream(ds, *, start: int, target: int, convert, risky, source_name: str):
    accepted = []
    quarantined = 0
    scanned = 0
    passes = 0
    skip = max(0, start)
    while len(accepted) < target and passes < 3:
        passes += 1
        for index, row in enumerate(ds()):
            if index < skip:
                continue
            scanned += 1
            messages = convert(row)
            if messages is None:
                continue
            if risky(messages):
                quarantined += 1
                continue
            accepted.append({
                "messages": messages,
                "source": source_name,
                "source_id": str(row.get("id") or row.get("prompt_id") or f"{source_name}-{index}"),
                "source_payload_sha256": exact_digest(row),
                "verbatim": True,
            })
            if len(accepted) >= target:
                break
        skip = 0
    if len(accepted) != target:
        raise SystemExit(f"LORA_PUBLIC_SHARD_INCOMPLETE:{source_name}:{len(accepted)}:{target}")
    return accepted, {"accepted": len(accepted), "quarantined": quarantined, "scanned": scanned}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cycle", type=int, required=True)
    ap.add_argument("--shard-size", type=int, default=750)
    ap.add_argument("--mel-lessons", required=True)
    ap.add_argument("--normalizer", default="scripts/prepare-mel-max-lora.py")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    if args.cycle < 0:
        raise SystemExit("LORA_CYCLE_INVALID")
    if args.shard_size < 50 or args.shard_size > 3000:
        raise SystemExit("LORA_SHARD_SIZE_INVALID")

    mel_path = Path(args.mel_lessons).resolve()
    normalizer_path = Path(args.normalizer).resolve()
    if not mel_path.is_file():
        raise SystemExit("MEL_CANONICAL_LESSONS_MISSING")
    if not normalizer_path.is_file():
        raise SystemExit("LORA_NORMALIZER_MISSING")

    mod = load_normalizer(normalizer_path)

    mel_rows = []
    with mel_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            row = json.loads(line)
            messages = mod.mel_messages(row.get("messages"))
            if messages is None:
                raise SystemExit("MEL_CANONICAL_LESSON_INVALID")
            mel_rows.append({
                "messages": messages,
                "source": "mel_validated",
                "source_id": str(row.get("lesson_id") or row.get("id") or f"mel-{len(mel_rows)+1}"),
                "source_payload_sha256": exact_digest(row),
                "verbatim": True,
            })
    if len(mel_rows) != 50:
        raise SystemExit(f"MEL_CANONICAL_LESSON_COUNT_INVALID:{len(mel_rows)}")

    public_needed = args.shard_size - 50
    ultra_target = (public_needed + 1) // 2
    opus_target = public_needed - ultra_target

    from datasets import load_dataset

    def ultra_factory():
        return iter(load_dataset(ULTRA_REPO, split="train", streaming=True))

    def opus_factory():
        return iter(load_dataset(OPUS_REPO, split="train", streaming=True))

    ultra_start = args.cycle * max(1, ultra_target)
    opus_start = args.cycle * max(1, opus_target)

    ultra_rows, ultra_stats = collect_stream(
        ultra_factory,
        start=ultra_start,
        target=ultra_target,
        convert=lambda row: mod.ultrachat_messages(row.get("data")),
        risky=mod.is_high_risk_operational,
        source_name="ultrachat_train",
    ) if ultra_target else ([], {"accepted": 0, "quarantined": 0, "scanned": 0})

    opus_rows, opus_stats = collect_stream(
        opus_factory,
        start=opus_start,
        target=opus_target,
        convert=lambda row: mod.sharegpt_messages(row.get("conversations", row.get("messages"))),
        risky=mod.is_high_risk_operational,
        source_name="opus_no_refusal",
    ) if opus_target else ([], {"accepted": 0, "quarantined": 0, "scanned": 0})

    rows = [*ultra_rows, *opus_rows, *mel_rows]
    if len(rows) != args.shard_size:
        raise SystemExit(f"LORA_SHARD_COUNT_INVALID:{len(rows)}:{args.shard_size}")

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

    metadata = {
        "schema": "mel.kaggle-offline-shard.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cycle": args.cycle,
        "shard_size": args.shard_size,
        "canonical_mel_lessons": 50,
        "public_examples": public_needed,
        "sources": {
            "ultrachat_train": {"repo": ULTRA_REPO, "start": ultra_start, **ultra_stats},
            "opus_no_refusal": {"repo": OPUS_REPO, "start": opus_start, **opus_stats},
        },
        "policy": {
            "source_text_rewritten": False,
            "turn_order_changed": False,
            "high_risk_operational_excluded": True,
            "validation_test_excluded": True,
        },
        "output_sha256": sha256_file(output),
    }
    meta = output.with_suffix(output.suffix + ".meta.json")
    meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
