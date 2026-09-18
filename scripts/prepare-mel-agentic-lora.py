#!/usr/bin/env python3
"""Prepare MEL AGENTIC LoRA data without rewriting source content.

Supported sources:
- xLAM parsed function-calling rows (messages/tools/extra or query/tools/answers)
- ToolACE cleaned rows
- DR-TULU deep-research cleaned rows
- MEL canonical lessons

Text content and turn order are preserved. Structural fields are mapped into the
trainer's messages schema. No synthetic duplication or reordering is performed.
Operational high-risk rows are quarantined rather than rewritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROLE_MAP = {
    "human": "user",
    "user": "user",
    "gpt": "assistant",
    "assistant": "assistant",
    "chatgpt": "assistant",
    "system": "system",
    "tool": "tool",
}

HIGH_RISK_ACTION_RE = re.compile(
    r"(?:how to|comment|instructions?|steps?|étapes?|recipe|recette|build|make|fabriquer|"
    r"construct|assemble|préparer|bypass|contourner|deploy|exécuter)", re.I
)
HIGH_RISK_OBJECT_RE = re.compile(
    r"(?:bomb|explosive|bombe|explosif|detonat|déton|ransomware|malware|credential stealer|"
    r"phishing kit|poison|poisoning|empoison|weapon|arme)", re.I
)

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def payload_digest(row) -> str:
    raw = json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()

def scalar_text(value):
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def normalize_messages(raw):
    if not isinstance(raw, list) or len(raw) < 2:
        return None
    out = []
    for turn in raw:
        if not isinstance(turn, dict):
            return None
        role_raw = turn.get("role", turn.get("from"))
        role = ROLE_MAP.get(str(role_raw or "").lower())
        if role is None:
            return None
        if "content" in turn:
            content = scalar_text(turn.get("content"))
        elif "value" in turn:
            content = scalar_text(turn.get("value"))
        elif "text" in turn:
            content = scalar_text(turn.get("text"))
        else:
            # Preserve tool-call-only assistant turns as exact JSON payload.
            content = scalar_text({k: v for k, v in turn.items() if k not in {"role", "from"}})
        out.append({"role": role, "content": content})
    if not any(x["role"] == "user" for x in out):
        return None
    if not any(x["role"] == "assistant" for x in out):
        return None
    return out

def xlam_messages(row):
    direct = normalize_messages(row.get("messages"))
    if direct is not None:
        return direct
    query = row.get("query")
    answers = row.get("answers", row.get("answer"))
    tools = row.get("tools")
    if not isinstance(query, str) or answers is None:
        return None
    # The source strings are embedded verbatim; only role wrappers are added.
    return [
        {"role": "system", "content": scalar_text(tools)},
        {"role": "user", "content": query},
        {"role": "assistant", "content": scalar_text(answers)},
    ]

def generic_messages(row):
    for key in ("messages", "conversations", "conversation"):
        normalized = normalize_messages(row.get(key))
        if normalized is not None:
            return normalized
    return None

def is_high_risk_operational(messages):
    user_text = "\n".join(x["content"] for x in messages if x["role"] == "user")
    return bool(HIGH_RISK_ACTION_RE.search(user_text) and HIGH_RISK_OBJECT_RE.search(user_text))

def iter_rows(path: Path, kind: str):
    with path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            messages = xlam_messages(row) if kind == "xlam" else generic_messages(row)
            if messages is None:
                continue
            yield lineno, row, messages

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlam", required=True)
    ap.add_argument("--toolace", required=True)
    ap.add_argument("--deep-research", required=True)
    ap.add_argument("--mel-lessons", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--quarantine-output", default="")
    args = ap.parse_args()

    sources = [
        ("xlam_function_calling", "xlam", Path(args.xlam).resolve()),
        ("toolace_agent", "generic", Path(args.toolace).resolve()),
        ("deep_research_agent", "generic", Path(args.deep_research).resolve()),
        ("mel_validated", "generic", Path(args.mel_lessons).resolve()),
    ]
    for name, _, path in sources:
        if not path.is_file() or path.stat().st_size <= 0:
            raise SystemExit(f"SOURCE_MISSING:{name}:{path}")

    output = Path(args.output).resolve()
    quarantine = Path(args.quarantine_output).resolve() if args.quarantine_output else output.with_suffix(output.suffix + ".quarantine.jsonl")
    output.parent.mkdir(parents=True, exist_ok=True)
    quarantine.parent.mkdir(parents=True, exist_ok=True)

    counts = {name: {"valid": 0, "trained": 0, "quarantined": 0} for name, _, _ in sources}
    total = 0
    qtotal = 0
    with output.open("w", encoding="utf-8") as out, quarantine.open("w", encoding="utf-8") as qout:
        for source_name, kind, path in sources:
            for lineno, original, messages in iter_rows(path, kind):
                counts[source_name]["valid"] += 1
                row = {
                    "messages": messages,
                    "source": source_name,
                    "source_line": lineno,
                    "source_payload_sha256": payload_digest(original),
                    "verbatim": True,
                }
                if is_high_risk_operational(messages):
                    qout.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                    counts[source_name]["quarantined"] += 1
                    qtotal += 1
                    continue
                out.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                counts[source_name]["trained"] += 1
                total += 1

    if total < 50:
        output.unlink(missing_ok=True)
        raise SystemExit(f"AGENTIC_DATASET_TOO_SMALL:{total}")

    meta = {
        "schema": "mel.agentic-verbatim-dataset.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "source_text_rewritten": False,
            "turn_order_changed": False,
            "synthetic_repetition": False,
            "deduplicated": False,
            "high_risk_operational_quarantined": True,
        },
        "source_order": [name for name, _, _ in sources],
        "counts": counts,
        "examples": total,
        "quarantined_examples": qtotal,
        "source_sha256": {name: sha256_file(path) for name, _, path in sources},
        "output_sha256": sha256_file(output),
        "quarantine_sha256": sha256_file(quarantine),
    }
    output.with_suffix(output.suffix + ".meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(meta, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
