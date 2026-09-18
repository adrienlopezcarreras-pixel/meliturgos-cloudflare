#!/usr/bin/env python3
"""Build MEL's maximal zero-cost LoRA corpus while preserving source text verbatim.

Rules:
- Source text is never rewritten, trimmed, merged, paraphrased, or reordered.
- Source conversation order is preserved inside every file.
- Structural field names may be mapped to the trainer's {role, content} schema.
- UltraChat validation/test are never accepted as training inputs.
- No synthetic repetition is added: source weighting stays faithful to the files.
- Every emitted row carries a SHA-256 over the original source payload.

High-risk operational examples are kept in a quarantine sidecar instead of being
silently modified. The original source files remain untouched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

ROLE_MAP = {
    "human": "user",
    "user": "user",
    "gpt": "assistant",
    "assistant": "assistant",
    "chatgpt": "assistant",
    "system": "system",
}

# Narrow quarantine: it is intentionally aimed at operational high-risk
# instructions, not merely sensitive subjects. No source text is rewritten.
HIGH_RISK_ACTION_RE = re.compile(
    r"(?:how to|comment|instructions?|steps?|étapes?|recipe|recette|build|make|fabriquer|"
    r"construct|assemble|préparer|bypass|contourner|deploy|exécuter)",
    re.I,
)
HIGH_RISK_OBJECT_RE = re.compile(
    r"(?:bomb|explosive|bombe|explosif|detonat|déton|ransomware|malware|credential stealer|"
    r"phishing kit|poison|poisoning|empoison|weapon|arme)",
    re.I,
)


def sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def exact_json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def is_high_risk_operational(messages: list[dict[str, str]]) -> bool:
    user_text = "\n".join(
        str(turn["content"])
        for turn in messages
        if turn.get("role") == "user" and isinstance(turn.get("content"), str)
    )
    return bool(HIGH_RISK_ACTION_RE.search(user_text) and HIGH_RISK_OBJECT_RE.search(user_text))


def ultrachat_messages(raw: list) -> list[dict[str, str]] | None:
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    if any(not isinstance(value, str) for value in raw):
        return None
    # Preserve every string byte-for-byte at the Python text level and keep
    # original ordering. Odd-length rows are invalid rather than repaired.
    if len(raw) % 2:
        return None
    return [
        {"role": "user" if index % 2 == 0 else "assistant", "content": value}
        for index, value in enumerate(raw)
    ]


def sharegpt_messages(raw: list) -> list[dict[str, str]] | None:
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    messages: list[dict[str, str]] = []
    for turn in raw:
        if not isinstance(turn, dict):
            return None
        role_raw = turn.get("from", turn.get("role"))
        content = turn.get("value", turn.get("content"))
        role = ROLE_MAP.get(str(role_raw or "").lower())
        if role is None or not isinstance(content, str):
            return None
        # Only the schema keys change. Content and turn order stay untouched.
        messages.append({"role": role, "content": content})
    if not any(x["role"] == "user" for x in messages) or not any(x["role"] == "assistant" for x in messages):
        return None
    return messages


def mel_messages(raw: list) -> list[dict[str, str]] | None:
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    messages: list[dict[str, str]] = []
    for turn in raw:
        if not isinstance(turn, dict):
            return None
        role = turn.get("role")
        content = turn.get("content")
        if role not in {"system", "user", "assistant"} or not isinstance(content, str):
            return None
        messages.append({"role": role, "content": content})
    if not any(x["role"] == "user" for x in messages) or not any(x["role"] == "assistant" for x in messages):
        return None
    return messages


def iter_ultrachat(path: Path) -> Iterator[tuple[str, dict, list[dict[str, str]]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            messages = ultrachat_messages(row.get("data"))
            if messages is not None:
                yield str(row.get("id") or f"ultrachat-{lineno}"), row, messages


def iter_sharegpt(path: Path, prefix: str) -> Iterator[tuple[str, dict, list[dict[str, str]]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            raw = row.get("conversations", row.get("messages"))
            messages = sharegpt_messages(raw)
            if messages is not None:
                yield str(row.get("id") or f"{prefix}-{lineno}"), row, messages


def iter_mel(path: Path) -> Iterator[tuple[str, dict, list[dict[str, str]]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            messages = mel_messages(row.get("messages"))
            if messages is not None:
                yield str(row.get("lesson_id") or row.get("id") or f"mel-{lineno}"), row, messages


def source_iter(kind: str, path: Path) -> Iterable[tuple[str, dict, list[dict[str, str]]]]:
    if kind == "ultrachat":
        return iter_ultrachat(path)
    if kind == "opus":
        return iter_sharegpt(path, "opus")
    if kind == "mel":
        return iter_mel(path)
    raise ValueError(kind)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ultrachat-train", required=True)
    ap.add_argument("--opus", required=True)
    ap.add_argument("--mel-lessons", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--quarantine-output", default="")
    args = ap.parse_args()

    sources = [
        ("ultrachat_train", "ultrachat", Path(args.ultrachat_train).resolve()),
        ("opus_no_refusal", "opus", Path(args.opus).resolve()),
        ("mel_validated", "mel", Path(args.mel_lessons).resolve()),
    ]
    for name, _, path in sources:
        if not path.is_file() or path.stat().st_size <= 0:
            raise SystemExit(f"SOURCE_MISSING:{name}:{path}")
        lower = path.name.lower()
        if name == "ultrachat_train" and ("-val" in lower or "-test" in lower or "validation" in lower):
            raise SystemExit(f"TRAINING_SPLIT_FORBIDDEN:{path.name}")

    output = Path(args.output).resolve()
    quarantine = Path(args.quarantine_output).resolve() if args.quarantine_output else output.with_suffix(output.suffix + ".quarantine.jsonl")
    output.parent.mkdir(parents=True, exist_ok=True)
    quarantine.parent.mkdir(parents=True, exist_ok=True)

    counts = {
        name: {"valid": 0, "trained": 0, "quarantined": 0}
        for name, _, _ in sources
    }
    total = 0
    quarantined = 0

    with output.open("w", encoding="utf-8") as train_out, quarantine.open("w", encoding="utf-8") as quarantine_out:
        for source_name, kind, path in sources:
            for source_id, original_row, messages in source_iter(kind, path):
                counts[source_name]["valid"] += 1
                source_digest = sha256_bytes(exact_json_bytes(original_row))
                row = {
                    "messages": messages,
                    "source": source_name,
                    "source_id": source_id,
                    "source_payload_sha256": source_digest,
                    "verbatim": True,
                }
                if is_high_risk_operational(messages):
                    quarantine_out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                    counts[source_name]["quarantined"] += 1
                    quarantined += 1
                    continue
                train_out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                counts[source_name]["trained"] += 1
                total += 1

    if total < 50:
        output.unlink(missing_ok=True)
        raise SystemExit(f"LORA_MAX_DATASET_TOO_SMALL:{total}")

    metadata = {
        "schema": "mel.lora-verbatim-max-dataset.v2",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "source_text_rewritten": False,
            "turn_order_changed": False,
            "synthetic_repetition": False,
            "deduplicated": False,
            "validation_test_excluded": True,
            "high_risk_operational_quarantined": True,
        },
        "source_order": [name for name, _, _ in sources],
        "counts": counts,
        "examples": total,
        "quarantined_examples": quarantined,
        "source_sha256": {name: sha256_file(path) for name, _, path in sources},
        "output_sha256": sha256_file(output),
        "quarantine_sha256": sha256_file(quarantine),
        "output": output.name,
        "quarantine_output": quarantine.name,
    }
    meta = output.with_suffix(output.suffix + ".meta.json")
    meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
