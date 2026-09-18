#!/usr/bin/env python3
"""Discover PEFT/LoRA adapters compatible with MEL's Cloudflare base model."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download

BASE_MODEL = "mistralai/Mistral-7B-Instruct-v0.2"
MAX_BYTES = 300_000_000
SEARCH_TERMS = (
    "Mistral-7B-Instruct-v0.2 lora",
    "Mistral-7B-Instruct-v0.2 peft",
    "Mistral-7B-Instruct-v0.2 instruction lora",
    "Mistral-7B-Instruct-v0.2 tool use lora",
    "Mistral-7B-Instruct-v0.2 agent lora",
)

def load_config(repo_id: str):
    try:
        path = hf_hub_download(repo_id=repo_id, filename="adapter_config.json", repo_type="model")
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return {}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default="artifacts/lora-hf-compatible-registry.json")
    ap.add_argument("--limit-per-query", type=int, default=100)
    args = ap.parse_args()

    api = HfApi()
    discovered = {}
    for term in SEARCH_TERMS:
        for model in api.list_models(search=term, limit=max(1, min(args.limit_per_query, 100)), full=True):
            discovered[model.id] = model

    accepted = []
    rejected = []
    for repo_id, model in sorted(discovered.items()):
        tags = [str(x) for x in (getattr(model, "tags", None) or [])]
        siblings = {getattr(x, "rfilename", ""): getattr(x, "size", None) for x in (getattr(model, "siblings", None) or [])}
        if "adapter_config.json" not in siblings or "adapter_model.safetensors" not in siblings:
            rejected.append({"repo_id": repo_id, "reason": "MISSING_PEFT_SAFETENSORS"})
            continue
        cfg = load_config(repo_id)
        base = str(cfg.get("base_model_name_or_path") or cfg.get("base_model") or "").strip()
        if base != BASE_MODEL:
            rejected.append({"repo_id": repo_id, "reason": "BASE_MODEL_MISMATCH", "base_model": base or None})
            continue
        rank = int(cfg.get("r") or 0)
        if rank < 1 or rank > 32:
            rejected.append({"repo_id": repo_id, "reason": "RANK_UNSUPPORTED", "rank": rank})
            continue
        size = siblings.get("adapter_model.safetensors")
        if size is not None and int(size) > MAX_BYTES:
            rejected.append({"repo_id": repo_id, "reason": "ADAPTER_TOO_LARGE", "adapter_bytes": int(size)})
            continue
        accepted.append({
            "repo_id": repo_id,
            "base_model": BASE_MODEL,
            "rank": rank,
            "adapter_bytes": int(size) if size is not None else None,
            "tags": tags[:80],
            "downloads": int(getattr(model, "downloads", 0) or 0),
            "likes": int(getattr(model, "likes", 0) or 0),
        })

    accepted.sort(key=lambda x: (-(x["downloads"] or 0), -(x["likes"] or 0), x["repo_id"]))
    payload = {
        "schema": "mel.hf-compatible-lora-registry.v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_model": BASE_MODEL,
        "search_terms": list(SEARCH_TERMS),
        "cloudflare_constraints": {
            "max_rank": 32,
            "max_adapter_bytes": MAX_BYTES,
            "required_files": ["adapter_config.json", "adapter_model.safetensors"],
        },
        "compatible_count": len(accepted),
        "rejected_count": len(rejected),
        "compatible": accepted,
        "rejected": rejected,
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "HF_LORA_REGISTRY_READY",
        "base_model": BASE_MODEL,
        "compatible_count": len(accepted),
        "rejected_count": len(rejected),
        "output": str(output),
    }, indent=2))

if __name__ == "__main__":
    main()
