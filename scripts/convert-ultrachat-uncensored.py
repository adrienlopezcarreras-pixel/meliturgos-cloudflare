#!/usr/bin/env python3
"""Stream Devilishcode/ultrachat-uncensored rows ({"id","data":[user,assistant,...]})
from stdin into Qwen messages JSONL, stopping after --rows valid conversations.
No network, upload or GPU: the caller pins the source revision.
"""
import argparse
import json
import sys


def to_messages(item):
    turns = item.get("data") if isinstance(item, dict) else None
    if not isinstance(turns, list) or len(turns) < 2 or len(turns) > 40:
        return None
    messages = []
    for index, text in enumerate(turns):
        if not isinstance(text, str) or not text.strip() or len(text) > 32000:
            return None
        messages.append({"role": "user" if index % 2 == 0 else "assistant", "content": text})
    if messages[-1]["role"] != "assistant":
        messages.pop()
    return {"messages": messages} if len(messages) >= 2 else None


def convert(lines, rows):
    kept, seen = [], set()
    for line in lines:
        try:
            row = to_messages(json.loads(line))
        except ValueError:
            continue
        if row is None:
            continue
        key = json.dumps(row, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        kept.append(key + "\n")
        if len(kept) >= rows:
            break
    if len(kept) < 50:
        raise ValueError("QWEN_TOO_FEW_VALID_EXAMPLES")
    return kept


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    out = convert(sys.stdin, args.rows)
    with open(args.output, "w", encoding="utf-8") as fh:
        fh.writelines(out)
    print(json.dumps({"status": "QWEN_SOURCE_CONVERTED", "rows": len(out)}))
