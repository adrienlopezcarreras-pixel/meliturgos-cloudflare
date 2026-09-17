#!/usr/bin/env python3
"""Prepare ShareGPT/Vicuna conversations for MEL LoRA training.

Converts the public ShareGPT_Vicuna_unfiltered JSON array into the JSONL
{"messages": [...]} format expected by scripts/train-mel-lora.py.

Default choice: the standard cleaned split.  The more aggressively filtered
"no_imsorry" variant is available explicitly with --variant no-imsorry.

This script intentionally does not add another keyword-based censorship pass:
its job is reproducible format conversion, validation, sampling and provenance.
Model promotion remains gated by MEL's benchmark after training.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import shutil
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

DATASET_REPO = "anon8231489123/ShareGPT_Vicuna_unfiltered"
VARIANTS = {
    "standard": {
        "filename": "ShareGPT_V3_unfiltered_cleaned_split.json",
        "sha256": "35f0e213ce091ed9b9af2a1f0755e9d39f9ccec34ab281cd4ca60d70f6479ba4",
    },
    "no-imsorry": {
        "filename": "ShareGPT_V3_unfiltered_cleaned_split_no_imsorry.json",
        "sha256": "014bcc3352fd62df5bbb7fb8af9b4fd12f87bb8a2b48a147789f245176ac8e4f",
    },
}

ROLE_MAP = {
    "human": "user",
    "user": "user",
    "gpt": "assistant",
    "assistant": "assistant",
    "chatgpt": "assistant",
    "system": "system",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def dataset_url(filename: str) -> str:
    return (
        "https://huggingface.co/datasets/"
        f"{DATASET_REPO}/resolve/main/{filename}?download=true"
    )


def download(url: str, destination: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "mel-lora-preparer/1.0"})
    with urllib.request.urlopen(req) as src, destination.open("wb") as dst:
        shutil.copyfileobj(src, dst, length=1024 * 1024)


def iter_json_array(path: Path) -> Iterator[dict]:
    """Stream a top-level JSON array when ijson is available; fallback to json.load."""
    try:
        import ijson  # type: ignore
    except ImportError:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            raise ValueError("expected a top-level JSON array")
        for row in data:
            if isinstance(row, dict):
                yield row
        return

    with path.open("rb") as fh:
        for row in ijson.items(fh, "item"):
            if isinstance(row, dict):
                yield row


def normalize_messages(row: dict) -> list[dict[str, str]] | None:
    raw = row.get("conversations")
    if raw is None:
        raw = row.get("messages")
    if not isinstance(raw, list):
        return None

    messages: list[dict[str, str]] = []
    for turn in raw:
        if not isinstance(turn, dict):
            continue
        role_raw = turn.get("from", turn.get("role"))
        value = turn.get("value", turn.get("content"))
        if not isinstance(role_raw, str) or not isinstance(value, str):
            continue
        role = ROLE_MAP.get(role_raw.strip().lower())
        text = value.strip()
        if role is None or not text:
            continue

        # Chat templates are more reliable if same-role fragments are coalesced.
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n\n" + text
        else:
            messages.append({"role": role, "content": text})

    # Drop leading assistant output with no prompt context.
    while messages and messages[0]["role"] == "assistant":
        messages.pop(0)

    if len(messages) < 2:
        return None
    if not any(m["role"] == "user" for m in messages):
        return None
    if not any(m["role"] == "assistant" for m in messages):
        return None
    return messages


def reservoir_sample(rows: Iterable[dict], k: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    sample: list[dict] = []
    for i, row in enumerate(rows):
        if i < k:
            sample.append(row)
            continue
        j = rng.randint(0, i)
        if j < k:
            sample[j] = row
    return sample


def converted_rows(source: Path) -> Iterator[dict]:
    for row in iter_json_array(source):
        messages = normalize_messages(row)
        if messages is None:
            continue
        out = {"messages": messages}
        if isinstance(row.get("id"), str):
            out["source_id"] = row["id"]
        yield out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True, help="Destination JSONL for train-mel-lora.py")
    ap.add_argument(
        "--variant",
        choices=sorted(VARIANTS),
        default="standard",
        help="Dataset variant; standard is the default, no-imsorry must be explicit",
    )
    ap.add_argument(
        "--input",
        help="Optional local ShareGPT JSON file; skips download but still validates/converts",
    )
    ap.add_argument(
        "--max-conversations",
        type=int,
        default=0,
        help="0 keeps all valid conversations; positive values use deterministic reservoir sampling",
    )
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--skip-source-hash-check",
        action="store_true",
        help="Allow a local/changed source whose SHA-256 differs from the published reference",
    )
    args = ap.parse_args()

    spec = VARIANTS[args.variant]
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    cleanup_dir: tempfile.TemporaryDirectory[str] | None = None
    if args.input:
        source = Path(args.input).resolve()
        if not source.is_file():
            raise SystemExit("SHAREGPT_SOURCE_NOT_FOUND")
        source_url = None
    else:
        cleanup_dir = tempfile.TemporaryDirectory(prefix="mel-sharegpt-")
        source = Path(cleanup_dir.name) / spec["filename"]
        source_url = dataset_url(spec["filename"])
        print(f"Downloading {source_url}")
        download(source_url, source)

    actual_hash = sha256_file(source)
    expected_hash = spec["sha256"]
    if not args.skip_source_hash_check and actual_hash != expected_hash:
        raise SystemExit(
            "SHAREGPT_SOURCE_HASH_MISMATCH: "
            f"expected {expected_hash}, got {actual_hash}. "
            "Use --skip-source-hash-check only after manually reviewing the new source revision."
        )

    rows_iter = converted_rows(source)
    if args.max_conversations < 0:
        raise SystemExit("MAX_CONVERSATIONS_INVALID")
    if args.max_conversations:
        rows: Iterable[dict] = reservoir_sample(rows_iter, args.max_conversations, args.seed)
    else:
        rows = rows_iter

    count = 0
    message_count = 0
    with output.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += 1
            message_count += len(row["messages"])

    if count < 50:
        output.unlink(missing_ok=True)
        raise SystemExit(f"LORA_DATASET_TOO_SMALL_AFTER_CONVERSION: {count}; minimum is 50")

    metadata = {
        "schema": "mel.lora-dataset-evidence.v1",
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "dataset_repo": DATASET_REPO,
        "variant": args.variant,
        "source_filename": spec["filename"],
        "source_url": source_url,
        "source_sha256": actual_hash,
        "reference_sha256": expected_hash,
        "output_file": output.name,
        "output_sha256": sha256_file(output),
        "conversations": count,
        "messages": message_count,
        "sampling": {
            "max_conversations": args.max_conversations or None,
            "seed": args.seed,
            "method": "reservoir" if args.max_conversations else "all-valid",
        },
        "notes": [
            "Converted to the messages JSONL format consumed by train-mel-lora.py.",
            "No additional keyword-based refusal/safety stripping was applied by this converter.",
            "Training output must still pass MEL benchmark/promotion gates before activation.",
        ],
    }
    meta_path = output.with_suffix(output.suffix + ".meta.json")
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if cleanup_dir is not None:
        cleanup_dir.cleanup()

    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
