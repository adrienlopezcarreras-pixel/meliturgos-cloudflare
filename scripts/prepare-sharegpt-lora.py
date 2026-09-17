#!/usr/bin/env python3
"""Prepare ShareGPT/Vicuna conversations for MEL LoRA training.

Converts the public ShareGPT_Vicuna_unfiltered JSON arrays into the JSONL
{"messages": [...]} format expected by scripts/train-mel-lora.py.

By default both published variants are integrated. Conversations are
content-deduplicated so the no-imsorry derivative cannot accidentally double
weight examples also present in the standard corpus. A provenance sidecar
records whether every retained conversation came from standard, no-imsorry,
or both.

This script intentionally does not add another keyword-based filtering pass:
its job is reproducible format conversion, validation, deduplication, sampling
and provenance. Model promotion remains gated by MEL's benchmark after training.
"""
from __future__ import annotations

import argparse
import hashlib
import json
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
    req = urllib.request.Request(url, headers={"User-Agent": "mel-lora-preparer/2.0"})
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


def conversation_fingerprint(messages: list[dict[str, str]]) -> str:
    canonical = json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def converted_rows(source: Path, variant: str) -> Iterator[dict]:
    for row in iter_json_array(source):
        messages = normalize_messages(row)
        if messages is None:
            continue
        fingerprint = conversation_fingerprint(messages)
        out = {
            "messages": messages,
            "conversation_sha256": fingerprint,
            "source_variant": variant,
        }
        if isinstance(row.get("id"), str):
            out["source_id"] = row["id"]
        yield out


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


def selected_variants(mode: str) -> list[str]:
    return ["standard", "no-imsorry"] if mode == "both" else [mode]


def resolve_sources(
    mode: str,
    input_path: str | None,
    input_standard: str | None,
    input_no_imsorry: str | None,
    temp_root: Path,
) -> tuple[dict[str, Path], dict[str, str | None]]:
    variants = selected_variants(mode)
    sources: dict[str, Path] = {}
    urls: dict[str, str | None] = {}

    if input_path and mode == "both":
        raise SystemExit(
            "INPUT_AMBIGUOUS_FOR_BOTH: use --input-standard and --input-no-imsorry with --variant both"
        )

    explicit = {
        "standard": input_standard,
        "no-imsorry": input_no_imsorry,
    }
    if mode != "both" and input_path:
        explicit[mode] = input_path

    for variant in variants:
        candidate = explicit[variant]
        if candidate:
            path = Path(candidate).resolve()
            if not path.is_file():
                raise SystemExit(f"SHAREGPT_SOURCE_NOT_FOUND: {variant}: {path}")
            sources[variant] = path
            urls[variant] = None
            continue

        spec = VARIANTS[variant]
        path = temp_root / spec["filename"]
        url = dataset_url(spec["filename"])
        print(f"Downloading {variant}: {url}")
        download(url, path)
        sources[variant] = path
        urls[variant] = url

    return sources, urls


def validate_sources(
    sources: dict[str, Path], skip_hash_check: bool
) -> dict[str, dict[str, str | bool]]:
    evidence: dict[str, dict[str, str | bool]] = {}
    for variant, source in sources.items():
        expected = VARIANTS[variant]["sha256"]
        actual = sha256_file(source)
        matches = actual == expected
        if not skip_hash_check and not matches:
            raise SystemExit(
                "SHAREGPT_SOURCE_HASH_MISMATCH: "
                f"{variant}: expected {expected}, got {actual}. "
                "Use --skip-source-hash-check only after manually reviewing the new source revision."
            )
        evidence[variant] = {
            "filename": source.name,
            "sha256": actual,
            "reference_sha256": expected,
            "reference_hash_matches": matches,
        }
    return evidence


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True, help="Destination JSONL for train-mel-lora.py")
    ap.add_argument(
        "--variant",
        choices=["both", *sorted(VARIANTS)],
        default="both",
        help="Dataset integration mode; both is the default and content-deduplicates the two variants",
    )
    ap.add_argument(
        "--input",
        help="Optional local source for a single variant; invalid with --variant both",
    )
    ap.add_argument("--input-standard", help="Optional local standard ShareGPT JSON source")
    ap.add_argument("--input-no-imsorry", help="Optional local no-imsorry ShareGPT JSON source")
    ap.add_argument(
        "--max-conversations",
        type=int,
        default=0,
        help="0 keeps all unique conversations; positive values sample deterministically after deduplication",
    )
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--skip-source-hash-check",
        action="store_true",
        help="Allow a local/changed source whose SHA-256 differs from the published reference",
    )
    args = ap.parse_args()

    if args.max_conversations < 0:
        raise SystemExit("MAX_CONVERSATIONS_INVALID")

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mel-sharegpt-") as temp_dir:
        temp_root = Path(temp_dir)
        sources, source_urls = resolve_sources(
            args.variant,
            args.input,
            args.input_standard,
            args.input_no_imsorry,
            temp_root,
        )
        source_evidence = validate_sources(sources, args.skip_source_hash_check)

        # Keep only compact membership state in RAM. Rows themselves stream to a
        # temporary JSONL file, so integrating ~1.3 GB of source JSON does not
        # require holding the corpora in memory.
        memberships: dict[str, set[str]] = {}
        primary_source: dict[str, str] = {}
        per_source_valid: dict[str, int] = {variant: 0 for variant in sources}
        per_source_unique_first_seen: dict[str, int] = {variant: 0 for variant in sources}
        duplicate_hits = 0
        unique_count = 0
        message_count = 0
        deduped_path = temp_root / "deduped.jsonl"

        with deduped_path.open("w", encoding="utf-8") as deduped:
            for variant in selected_variants(args.variant):
                for row in converted_rows(sources[variant], variant):
                    per_source_valid[variant] += 1
                    fingerprint = row["conversation_sha256"]
                    membership = memberships.setdefault(fingerprint, set())
                    if membership:
                        duplicate_hits += 1
                        membership.add(variant)
                        continue

                    membership.add(variant)
                    primary_source[fingerprint] = variant
                    per_source_unique_first_seen[variant] += 1
                    unique_count += 1
                    message_count += len(row["messages"])
                    deduped.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

        if unique_count < 50:
            raise SystemExit(
                f"LORA_DATASET_TOO_SMALL_AFTER_CONVERSION: {unique_count}; minimum is 50"
            )

        def iter_deduped() -> Iterator[dict]:
            with deduped_path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    if line.strip():
                        yield json.loads(line)

        if args.max_conversations:
            selected: Iterable[dict] = reservoir_sample(
                iter_deduped(), args.max_conversations, args.seed
            )
        else:
            selected = iter_deduped()

        written = 0
        written_messages = 0
        selected_fingerprints: set[str] = set()
        with output.open("w", encoding="utf-8") as fh:
            for row in selected:
                fingerprint = row["conversation_sha256"]
                selected_fingerprints.add(fingerprint)
                row["source_variants"] = sorted(memberships[fingerprint])
                fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                written += 1
                written_messages += len(row["messages"])

        if written < 50:
            output.unlink(missing_ok=True)
            raise SystemExit(
                f"LORA_DATASET_TOO_SMALL_AFTER_SAMPLING: {written}; minimum is 50"
            )

        provenance_path = output.with_suffix(output.suffix + ".provenance.jsonl")
        with provenance_path.open("w", encoding="utf-8") as fh:
            for fingerprint in sorted(selected_fingerprints):
                fh.write(
                    json.dumps(
                        {
                            "conversation_sha256": fingerprint,
                            "source_variants": sorted(memberships[fingerprint]),
                            "primary_source_variant": primary_source[fingerprint],
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                )

        overlap_counts = {
            "standard_only": sum(
                1 for variants in memberships.values() if variants == {"standard"}
            ),
            "no_imsorry_only": sum(
                1 for variants in memberships.values() if variants == {"no-imsorry"}
            ),
            "both": sum(1 for variants in memberships.values() if len(variants) > 1),
        }

        metadata = {
            "schema": "mel.lora-dataset-evidence.v2",
            "prepared_at": datetime.now(timezone.utc).isoformat(),
            "dataset_repo": DATASET_REPO,
            "integration_mode": args.variant,
            "sources": {
                variant: {
                    **source_evidence[variant],
                    "source_url": source_urls[variant],
                    "valid_conversations": per_source_valid[variant],
                    "unique_first_seen": per_source_unique_first_seen[variant],
                }
                for variant in selected_variants(args.variant)
            },
            "deduplication": {
                "algorithm": "sha256-canonical-messages",
                "unique_conversations_before_sampling": unique_count,
                "duplicate_hits": duplicate_hits,
                "overlap": overlap_counts,
            },
            "output_file": output.name,
            "output_sha256": sha256_file(output),
            "provenance_file": provenance_path.name,
            "provenance_sha256": sha256_file(provenance_path),
            "conversations": written,
            "messages": written_messages,
            "sampling": {
                "max_conversations": args.max_conversations or None,
                "seed": args.seed,
                "method": "reservoir-after-dedup" if args.max_conversations else "all-unique",
            },
            "notes": [
                "Both public variants are integrated by default.",
                "Exact duplicate conversations are retained once, never double-weighted.",
                "source_variants records standard/no-imsorry membership for every retained row.",
                "No additional keyword-based refusal/safety stripping is applied by this converter.",
                "Training output must still pass MEL benchmark/promotion gates before activation.",
            ],
        }
        meta_path = output.with_suffix(output.suffix + ".meta.json")
        meta_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    print(json.dumps(metadata, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
