#!/usr/bin/env python3
"""Read-only audit of MEL LoRA checkpoint lineage (never trains or promotes)."""
import argparse
import json
import re
import sys
from pathlib import Path

DIGEST = re.compile(r"^(?:sha256:)?[0-9a-f]{64}$")


def normalize_digest(value):
    raw = str(value or "").lower()
    return raw.removeprefix("sha256:") if DIGEST.fullmatch(raw) else None
CYCLE = re.compile(r"^C([0-9]{3})$", re.I)


def audit(records, expected=25):
    issues = []
    by_cycle = {}
    for record in records:
        if not isinstance(record, dict):
            issues.append("record is not an object")
            continue
        raw_cycle = record.get("cycle")
        label = f"C{raw_cycle:03d}" if isinstance(raw_cycle, int) and not isinstance(raw_cycle, bool) else str(raw_cycle or "").upper()
        match = CYCLE.fullmatch(label)
        if not match:
            issues.append(f"invalid cycle: {label!r}")
            continue
        index = int(match.group(1))
        if index < 1 or index > expected:
            issues.append(f"out of range: {label}")
        if index in by_cycle:
            issues.append(f"duplicate cycle: {label}")
        by_cycle[index] = record
    for index in range(1, expected + 1):
        label = f"C{index:03d}"
        rec = by_cycle.get(index)
        if rec is None:
            issues.append(f"missing cycle: {label}")
            continue
        digest = normalize_digest(rec.get("artifact_digest"))
        parent = normalize_digest(rec.get("parent_artifact_digest"))
        if not digest:
            issues.append(f"{label}: invalid or missing artifact_digest")
        if index > 1:
            prior = by_cycle.get(index - 1)
            prior_digest = normalize_digest((prior or {}).get("artifact_digest"))
            if not parent:
                issues.append(f"{label}: invalid or missing parent_artifact_digest")
            elif not prior_digest or parent != prior_digest:
                issues.append(f"{label}: parent does not match C{index-1:03d} digest")
        elif rec.get("parent_artifact_digest") and not parent:
            issues.append(f"{label}: invalid initial parent digest")
        elif parent and not rec.get("parent_release_tag"):
            issues.append(f"{label}: initial parent requires parent_release_tag provenance")
    return {"status": "VERIFIED" if not issues else "UNVERIFIED",
            "expected_cycles": expected, "present_cycles": len(by_cycle),
            "issues": issues}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="JSON array of cycle records; read-only")
    parser.add_argument("--expected", type=int, default=25)
    args = parser.parse_args()
    if args.expected < 1 or args.expected > 999:
        parser.error("--expected must be between 1 and 999")
    try:
        records = json.loads(args.manifest.read_text(encoding="utf-8"))
        if not isinstance(records, list):
            raise ValueError("manifest must be a JSON array")
    except (OSError, ValueError) as exc:
        print(json.dumps({"status": "UNVERIFIED", "error": str(exc)}))
        return 2
    result = audit(records, args.expected)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    sys.exit(main())
