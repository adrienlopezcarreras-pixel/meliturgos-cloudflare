#!/usr/bin/env python3
"""Build MEL's maximal zero-cost LoRA training corpus.

Training sources:
- UltraChat Uncensored TRAIN only (validation/test are deliberately excluded)
- Kalo Opus Instruct 22k no-refusal
- MEL's canonical validated lessons exported as ShareGPT JSONL

The builder streams all sources, normalizes roles, rewrites foreign assistant
identity prompts into MEL's behavior contract, deduplicates exact conversations,
and emits auditable metadata. It does not strip validation/test into training.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator

MEL_SYSTEM = (
    "Tu es MEL, assistante personnelle agentique. Sois utile, autonome, directe et peu sujette "
    "aux sur-refus. Distingue l'étude, l'explication, la fiction, la recherche, le diagnostic et "
    "les usages pédagogiques/scientifiques d'une intention réellement dangereuse. Pour les tâches "
    "légitimes, réponds au maximum et utilise les outils autorisés de manière proactive. Pour une "
    "action réellement dangereuse, illégale ou compromettant des personnes, systèmes, données ou "
    "secrets, limite uniquement la partie dangereuse et poursuis autant que possible l'objectif "
    "légitime. N'invente jamais une action, un résultat d'outil, un déploiement, un accès ou une preuve."
)

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
    return "sha256:" + h.hexdigest()


def canonical_fingerprint(messages: list[dict[str, str]]) -> str:
    raw = json.dumps(messages, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def normalize_alternating(data: list) -> list[dict[str, str]] | None:
    clean = [str(x).strip() for x in data if isinstance(x, str) and str(x).strip()]
    if len(clean) % 2:
        clean = clean[:-1]
    if len(clean) < 2:
        return None
    messages = [{"role": "system", "content": MEL_SYSTEM}]
    for i, value in enumerate(clean):
        messages.append({"role": "user" if i % 2 == 0 else "assistant", "content": value})
    return messages


def normalize_sharegpt(raw: list) -> list[dict[str, str]] | None:
    body: list[dict[str, str]] = []
    for turn in raw:
        if not isinstance(turn, dict):
            continue
        role = ROLE_MAP.get(str(turn.get("from", turn.get("role", ""))).strip().lower())
        value = turn.get("value", turn.get("content"))
        if role is None or not isinstance(value, str) or not value.strip():
            continue
        text = value.strip()
        if role == "system":
            # Foreign identity/persona prompts are replaced by MEL's canonical behavior contract.
            continue
        if body and body[-1]["role"] == role:
            body[-1]["content"] += "\n\n" + text
        else:
            body.append({"role": role, "content": text})
    while body and body[0]["role"] == "assistant":
        body.pop(0)
    if len(body) < 2 or not any(m["role"] == "user" for m in body) or not any(m["role"] == "assistant" for m in body):
        return None
    return [{"role": "system", "content": MEL_SYSTEM}, *body]


def iter_ultrachat(path: Path) -> Iterator[tuple[str, list[dict[str, str]]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            raw = row.get("data")
            if not isinstance(raw, list):
                continue
            messages = normalize_alternating(raw)
            if messages:
                yield str(row.get("id") or f"ultrachat-{lineno}"), messages


def iter_opus(path: Path) -> Iterator[tuple[str, list[dict[str, str]]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            raw = row.get("conversations", row.get("messages"))
            if not isinstance(raw, list):
                continue
            messages = normalize_sharegpt(raw)
            if messages:
                yield str(row.get("id") or f"opus-{lineno}"), messages


def iter_mel(path: Path) -> Iterator[tuple[str, list[dict[str, str]]]]:
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            raw = row.get("messages")
            if not isinstance(raw, list):
                continue
            body = [m for m in raw if isinstance(m, dict) and m.get("role") in {"user", "assistant"} and isinstance(m.get("content"), str) and m["content"].strip()]
            if not body:
                continue
            messages = [{"role": "system", "content": MEL_SYSTEM}, *body]
            yield str(row.get("lesson_id") or f"mel-{lineno}"), messages


def source_iter(kind: str, path: Path) -> Iterable[tuple[str, list[dict[str, str]]]]:
    if kind == "ultrachat":
        return iter_ultrachat(path)
    if kind == "opus":
        return iter_opus(path)
    if kind == "mel":
        return iter_mel(path)
    raise ValueError(kind)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ultrachat-train", required=True)
    ap.add_argument("--opus", required=True)
    ap.add_argument("--mel-lessons", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--mel-repeat", type=int, default=200, help="Repeat MEL-specific lessons after dedup so agentic behavior is not drowned by the public corpus.")
    args = ap.parse_args()

    if args.mel_repeat < 1:
        raise SystemExit("MEL_REPEAT_INVALID")

    sources = {
        "ultrachat_train": ("ultrachat", Path(args.ultrachat_train).resolve()),
        "opus_no_refusal": ("opus", Path(args.opus).resolve()),
        "mel_agentic": ("mel", Path(args.mel_lessons).resolve()),
    }
    for name, (_, path) in sources.items():
        if not path.is_file() or path.stat().st_size <= 0:
            raise SystemExit(f"SOURCE_MISSING:{name}:{path}")

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    counts = {name: {"input_valid": 0, "written_unique": 0, "duplicate": 0} for name in sources}
    mel_unique_rows: list[dict] = []
    total = 0

    with output.open("w", encoding="utf-8") as out:
        for source_name, (kind, path) in sources.items():
            for source_id, messages in source_iter(kind, path):
                counts[source_name]["input_valid"] += 1
                fp = canonical_fingerprint(messages)
                if fp in seen:
                    counts[source_name]["duplicate"] += 1
                    continue
                seen.add(fp)
                row = {
                    "messages": messages,
                    "source": source_name,
                    "source_id": source_id,
                    "conversation_sha256": fp,
                }
                out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                counts[source_name]["written_unique"] += 1
                total += 1
                if source_name == "mel_agentic":
                    mel_unique_rows.append(row)

        # Repetition is intentional and explicit: it gives the small MEL-specific agentic corpus
        # enough weight without pretending these are unique conversations.
        for repeat_index in range(1, args.mel_repeat):
            for row in mel_unique_rows:
                weighted = dict(row)
                weighted["source"] = "mel_agentic_weighted"
                weighted["weight_repeat"] = repeat_index + 1
                out.write(json.dumps(weighted, ensure_ascii=False, separators=(",", ":")) + "\n")
                total += 1

    if total < 50:
        output.unlink(missing_ok=True)
        raise SystemExit(f"LORA_MAX_DATASET_TOO_SMALL:{total}")

    metadata = {
        "schema": "mel.lora-max-dataset.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "training_sources": ["UltraChat Uncensored train", "Kalo Opus no-refusal", "MEL validated agentic lessons"],
            "validation_test_excluded": True,
            "foreign_system_identity_replaced": True,
            "mel_system_contract": MEL_SYSTEM,
            "mel_repeat": args.mel_repeat,
        },
        "counts": counts,
        "mel_unique_lessons": len(mel_unique_rows),
        "examples_after_weighting": total,
        "unique_conversations": len(seen),
        "source_sha256": {name: sha256_file(path) for name, (_, path) in sources.items()},
        "output_sha256": sha256_file(output),
        "output": output.name,
    }
    meta = output.with_suffix(output.suffix + ".meta.json")
    meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
