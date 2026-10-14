#!/usr/bin/env python3
"""Read-only validation of a previously trained Kaggle LoRA bundle; never extract."""
import argparse
import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path

FILES = {
    "adapter_model.safetensors", "adapter_config.json", "training-evidence.json",
    "training-started.json", "training-progress.jsonl", "artifact-evidence.json",
    "lora-plan.json", "dataset-metadata.json", "shard-metadata.json",
    "local-impact-benchmark.json", "kaggle-run.json",
}
SHA256 = re.compile(r"^(?:sha256:)?[0-9a-f]{64}$")
SOURCE_SHA = "635c4786b39b9c3a5458126d64ec7bb726a282e7"
ADAPTER_SHA = "9c9957a6ab31b7c43f4ee0a3699b9d9292cbdd3fd3fd7368ace74657fb83f6aa"
CONFIG_SHA = "d3757ba7a01af18e474afc90048795dbd1b12f193144239c09939ae75173e2ce"
IMPACT_SHA = "7758c3e0acb249b3ecd3f403bb6249fd417d7fe7d14934de6ae695fe7045e7e4"
ADAPTER_SIZE = 13648432
CONFIG_SIZE = 1063

def verify(path):
    if Path(path).stat().st_size > 320_000_000:
        raise ValueError("RECOVERY_ARCHIVE_TOO_LARGE")
    digests = {}
    documents = {}
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        if len(members) != len(FILES) or set(m.name for m in members) != FILES:
            raise ValueError("RECOVERY_UNEXPECTED_ARCHIVE_MEMBERS")
        for member in members:
            if not member.isfile() or member.name != member.name.split("/")[-1]:
                raise ValueError("RECOVERY_UNSAFE_ARCHIVE_MEMBER")
            max_bytes = 300_000_000 if member.name == "adapter_model.safetensors" else 5_000_000
            if member.size <= 0 or member.size > max_bytes:
                raise ValueError("RECOVERY_MEMBER_SIZE_INVALID")
            digest = hashlib.sha256()
            data = bytearray() if member.name.endswith(".json") else None
            with archive.extractfile(member) as stream:
                remaining = member.size
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError("RECOVERY_TRUNCATED_MEMBER")
                    digest.update(chunk)
                    if data is not None:
                        data.extend(chunk)
                    remaining -= len(chunk)
            digests[member.name] = digest.hexdigest()
            if data is not None:
                documents[member.name] = json.loads(data)
            if member.name == "adapter_model.safetensors":
                if member.size != ADAPTER_SIZE or digests[member.name] != ADAPTER_SHA:
                    raise ValueError("RECOVERY_ADAPTER_HASH_MISMATCH")
            if member.name == "adapter_config.json":
                if member.size != CONFIG_SIZE or digests[member.name] != CONFIG_SHA:
                    raise ValueError("RECOVERY_CONFIG_HASH_MISMATCH")

    if digests["local-impact-benchmark.json"] != IMPACT_SHA:
        raise ValueError("RECOVERY_LOCAL_IMPACT_HASH_MISMATCH")
    run = documents["kaggle-run.json"]
    training = documents["training-evidence.json"]
    artifact = documents["artifact-evidence.json"]
    plan = documents["lora-plan.json"]
    normalize = lambda value: str(value or "").removeprefix("sha256:").lower()
    if (run.get("source_sha") != SOURCE_SHA or run.get("cycle") != 0 or
        run.get("status") != "TRAINED_UNBENCHMARKED" or run.get("global_step") != 32 or
        run.get("local_uncensored_gate") is not False or run.get("offline_kernel") is not True):
        raise ValueError("RECOVERY_WRONG_TRAINING_CYCLE")
    if (normalize(run.get("artifact_digest")) != ADAPTER_SHA or
        normalize(artifact.get("digest")) != ADAPTER_SHA or
        artifact.get("size_bytes") != ADAPTER_SIZE):
        raise ValueError("RECOVERY_EVIDENCE_MISMATCH")
    weights = training.get("artifacts", {}).get("adapter_model", {})
    config = training.get("artifacts", {}).get("adapter_config", {})
    if (normalize(weights.get("digest")) != ADAPTER_SHA or
        weights.get("size_bytes") != ADAPTER_SIZE or
        normalize(config.get("digest")) != CONFIG_SHA or
        config.get("size_bytes") != CONFIG_SIZE):
        raise ValueError("RECOVERY_TRAINING_DIGEST_MISMATCH")
    if (training.get("promotion", {}).get("approved") is not False or
        plan.get("id") != training.get("plan_id")):
        raise ValueError("RECOVERY_PROMOTION_OR_PLAN_MISMATCH")
    bundle_digest = hashlib.sha256()
    with open(path, "rb") as original:
        for block in iter(lambda: original.read(1024 * 1024), b""):
            bundle_digest.update(block)
    return {
        "status": "CHECKPOINT_BYTES_RECOVERED_UNBENCHMARKED",
        "source_sha": SOURCE_SHA,
        "cycle": 0,
        "global_step": 32,
        "adapter_sha256": ADAPTER_SHA,
        "bundle_sha256": bundle_digest.hexdigest(),
        "benchmark_verified": False,
        "activated": False,
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.bundle), sort_keys=True))
    except Exception as exc:
        print("RECOVERY_VERIFICATION_FAILED: " + type(exc).__name__ + ": " + str(exc), file=sys.stderr)
        sys.exit(1)
