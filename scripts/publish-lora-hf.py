#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

REQUIRED = (
    "adapter_model.safetensors",
    "adapter_config.json",
    "training-evidence.json",
    "artifact-evidence.json",
    "lora-plan.json",
)

def main():
    parser = argparse.ArgumentParser(description="Publish one trained MEL LoRA artifact bundle to Hugging Face Hub.")
    parser.add_argument("--dir", required=True, help="Trained adapter directory")
    parser.add_argument("--repo-id", default="", help="Target model repo, e.g. Meliturgos/mel-lora-smoke-500")
    parser.add_argument("--private", action="store_true", help="Create/use a private repository")
    args = parser.parse_args()

    try:
        from huggingface_hub import HfApi
    except ImportError as exc:
        raise SystemExit("Install first: python -m pip install -U huggingface_hub") from exc

    root = Path(args.dir).resolve()
    missing = [name for name in REQUIRED if not (root / name).is_file()]
    if missing:
        raise SystemExit("Missing required LoRA files: " + ", ".join(missing))

    plan = json.loads((root / "lora-plan.json").read_text(encoding="utf-8"))
    artifact = json.loads((root / "artifact-evidence.json").read_text(encoding="utf-8"))
    if artifact.get("finetune_id"):
        raise SystemExit("Refusing to publish post-Cloudflare artifact evidence; expected finetune_id to be empty before upload.")

    api = HfApi(token=os.environ.get("HF_TOKEN") or None)
    who = api.whoami()
    username = who.get("name") or who.get("fullname")
    if not username:
        raise SystemExit("Hugging Face login required. Run huggingface_hub.login() or set HF_TOKEN.")

    plan_id = str(plan.get("id") or "mel-lora").strip()
    safe_plan = "".join(c if c.isalnum() or c in "-._" else "-" for c in plan_id)[:70].strip("-") or "mel-lora"
    repo_id = args.repo_id.strip() or f"{username}/{safe_plan}"

    api.create_repo(repo_id=repo_id, repo_type="model", private=bool(args.private), exist_ok=True)
    for name in REQUIRED:
        api.upload_file(
            path_or_fileobj=str(root / name),
            path_in_repo=name,
            repo_id=repo_id,
            repo_type="model",
            commit_message=f"Upload MEL LoRA evidence: {name}",
        )

    print(json.dumps({
        "status": "PUBLISHED_UNAPPROVED",
        "repo_id": repo_id,
        "private": bool(args.private),
        "plan_id": plan_id,
        "artifact_digest": artifact.get("digest"),
        "dataset_digest": artifact.get("dataset_digest"),
        "training_manifest_digest": artifact.get("training_manifest_digest"),
        "files": list(REQUIRED),
    }, indent=2))

if __name__ == "__main__":
    main()
