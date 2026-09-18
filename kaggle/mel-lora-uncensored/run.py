#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

TARGET_SHA = "__MEL_GIT_SHA__"
CYCLE = int("__MEL_CYCLE__")
SHARD_SIZE = int("__MEL_SHARD_SIZE__")

WORK = Path("/kaggle/working")
INPUT = Path("/kaggle/input")
PAYLOAD = INPUT / "mel-lora-cycle-payload"
DATA = WORK / "data"
SHARD = DATA / f"mel-uncensored-cycle-{CYCLE:03d}.jsonl"
SHARD_META = DATA / f"mel-uncensored-cycle-{CYCLE:03d}.meta.json"
SCRIPTS = WORK / "mel-src" / "scripts"
OUTPUT = WORK / "mel-lora-output"
PARENT = WORK / "parent-adapter"
BUNDLE = WORK / "mel-lora-bundle.tar.gz"
RUN_META = WORK / "kaggle-run.json"

def run(cmd, *, cwd=None):
    print("+", " ".join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), cwd=str(cwd) if cwd else None, check=True)

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()

def find_input_dir(slug: str) -> Path:
    direct = INPUT / slug
    if direct.exists():
        return direct

    # Kaggle may mount private/versioned sources below an owner or version
    # directory rather than directly under /kaggle/input/<slug>. Resolve
    # recursively, preferring an exact directory-name match.
    exact = []
    fuzzy = []
    if INPUT.exists():
        for p in INPUT.rglob("*"):
            if not p.is_dir():
                continue
            name = p.name.lower()
            target = slug.lower()
            if name == target:
                exact.append(p)
            elif target in name:
                fuzzy.append(p)
    candidates = sorted(exact, key=lambda p: (len(p.parts), str(p)))
    if not candidates:
        candidates = sorted(fuzzy, key=lambda p: (len(p.parts), str(p)))
    if candidates:
        print(json.dumps({
            "resolved_kaggle_input": slug,
            "path": str(candidates[0]),
        }), flush=True)
        return candidates[0]

    visible = []
    if INPUT.exists():
        for p in sorted(INPUT.rglob("*")):
            if p.is_dir():
                visible.append(str(p.relative_to(INPUT)))
            if len(visible) >= 120:
                break
    print(json.dumps({
        "missing_kaggle_input": slug,
        "visible_input_dirs": visible,
    }, indent=2), flush=True)
    raise SystemExit("KAGGLE_INPUT_MISSING:" + slug)

def _payload_file(payload: Path, *names: str) -> Path | None:
    for name in names:
        direct = payload / name
        if direct.is_file():
            return direct
        matches = sorted(payload.rglob(name))
        if matches:
            return matches[0]
    return None

def prepare_payload():
    payload = find_input_dir("mel-lora-cycle-payload")
    SCRIPTS.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)

    for name in ("train-mel-lora.py", "create-lora-plan.py", "run-local-lora-impact.py"):
        source = _payload_file(payload, name)
        if source is None:
            raise SystemExit("KAGGLE_PAYLOAD_SCRIPT_MISSING:" + name)
        shutil.copy2(source, SCRIPTS / name)

    shard_gz = _payload_file(payload, "mel-training-shard.jsonl.gz")
    shard_plain = _payload_file(payload, "mel-training-shard.jsonl")
    shard_meta = _payload_file(payload, "mel-training-shard.jsonl.meta.json")
    payload_meta = _payload_file(payload, "payload.json")
    if (shard_gz is None and shard_plain is None) or shard_meta is None or payload_meta is None:
        available = sorted(str(p.relative_to(payload)) for p in payload.rglob("*") if p.is_file())
        print(json.dumps({"payload_root": str(payload), "available_files": available}, indent=2), flush=True)
        raise SystemExit("KAGGLE_PAYLOAD_DATA_MISSING")

    if shard_gz is not None:
        import gzip
        with gzip.open(shard_gz, "rb") as src, SHARD.open("wb") as dst:
            shutil.copyfileobj(src, dst)
    else:
        shutil.copy2(shard_plain, SHARD)
    shutil.copy2(shard_meta, SHARD_META)

    meta = json.loads(payload_meta.read_text(encoding="utf-8"))
    if str(meta.get("source_sha") or "") != TARGET_SHA:
        raise SystemExit("KAGGLE_PAYLOAD_SOURCE_SHA_MISMATCH")
    if int(meta.get("cycle", -1)) != CYCLE:
        raise SystemExit("KAGGLE_PAYLOAD_CYCLE_MISMATCH")
    if int(meta.get("shard_size", -1)) != SHARD_SIZE:
        raise SystemExit("KAGGLE_PAYLOAD_SHARD_SIZE_MISMATCH")
    return payload

def find_base_model() -> Path:
    for slug in ("mistral-7b-instruct-v02-fp16", "mistral-7b-instruct-v0-2"):
        try:
            path = find_input_dir(slug)
        except SystemExit:
            continue
        if (path / "config.json").is_file() and (path / "tokenizer_config.json").is_file():
            return path
    for cfg in INPUT.rglob("config.json"):
        root = cfg.parent
        if (root / "tokenizer_config.json").is_file() and (
            (root / "model.safetensors.index.json").is_file()
            or any(root.glob("model-*.safetensors"))
        ):
            return root
    raise SystemExit("KAGGLE_MISTRAL_BASE_MODEL_NOT_FOUND")

def require_kaggle_gpu():
    import os
    try:
        import torch
    except Exception as exc:
        raise SystemExit("KAGGLE_TORCH_IMPORT_FAILED:" + f"{type(exc).__name__}:{exc}")

    smi = shutil.which("nvidia-smi")
    smi_text = ""
    if smi:
        proc = subprocess.run(
            [smi, "--query-gpu=name,memory.total", "--format=csv,noheader"],
            text=True, capture_output=True
        )
        smi_text = (proc.stdout or proc.stderr or "").strip()
    diag = {
        "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES"),
        "nvidia_smi": smi_text or None,
        "torch_version": getattr(torch, "__version__", "unknown"),
        "torch_cuda_version": getattr(torch.version, "cuda", None),
        "cuda_available": bool(torch.cuda.is_available()),
        "cuda_device_count": int(torch.cuda.device_count()),
        "cuda_devices": [
            torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())
        ] if torch.cuda.is_available() else [],
    }
    print(json.dumps({"kaggle_gpu_preflight": diag}, indent=2), flush=True)
    if not torch.cuda.is_available():
        raise SystemExit("KAGGLE_GPU_NOT_ASSIGNED")

def ensure_dependencies():
    # Never choose wheels by filename ordering: Kaggle's Python ABI can differ
    # from the ABI used by the newest wheel mirrored in hf-libraries. Keep the
    # run offline and delegate wheel-tag compatibility selection to pip.
    required = (
        "torch", "transformers", "tokenizers", "peft", "accelerate",
        "bitsandbytes", "datasets", "safetensors"
    )
    missing = []
    for name in required:
        try:
            __import__(name)
        except Exception:
            missing.append(name)
    if not missing:
        print("LoRA dependencies already available", flush=True)
        return

    roots = []
    for slug in ("mel-lora-runtime-wheels", "hf-libraries"):
        try:
            roots.append(find_input_dir(slug))
        except SystemExit:
            continue
    if not roots:
        raise SystemExit("KAGGLE_OFFLINE_WHEELHOUSE_MISSING")

    aliases = {
        "transformers": "transformers-",
        "tokenizers": "tokenizers-",
        "peft": "peft-",
        "accelerate": "accelerate-",
        "bitsandbytes": "bitsandbytes-",
        "datasets": "datasets-",
        "safetensors": "safetensors-",
    }

    for name in missing:
        if name == "torch":
            raise SystemExit("KAGGLE_TORCH_MISSING")
        prefix = aliases.get(name)
        found = sorted(
            p
            for root in roots
            for p in root.rglob("*.whl")
            if p.name.lower().startswith(prefix)
        )
        if not found:
            raise SystemExit("KAGGLE_OFFLINE_WHEEL_MISSING:" + name)

        package_dirs = sorted({p.parent for p in found}, key=lambda p: str(p))
        installed = False
        failures = []
        for package_dir in package_dirs:
            cmd = [
                sys.executable, "-m", "pip", "install",
                "--no-index", "--no-deps",
                "--find-links", str(package_dir),
                name,
            ]
            print("+", " ".join(map(str, cmd)), flush=True)
            proc = subprocess.run(cmd, text=True, capture_output=True)
            if proc.stdout:
                print(proc.stdout, flush=True)
            if proc.stderr:
                print(proc.stderr, file=sys.stderr, flush=True)
            if proc.returncode == 0:
                installed = True
                break
            failures.append(f"{package_dir}:{proc.returncode}")
        if not installed:
            raise SystemExit(
                "KAGGLE_OFFLINE_COMPATIBLE_WHEEL_MISSING:"
                + name + ":" + ",".join(failures)
            )

    # datasets can require pyarrow_hotfix in some offline library snapshots.
    try:
        __import__("datasets")
    except Exception:
        hotfix = sorted(p for root in roots for p in root.rglob("pyarrow_hotfix-*.whl"))
        if hotfix:
            for package_dir in sorted({p.parent for p in hotfix}, key=lambda p: str(p)):
                proc = subprocess.run([
                    sys.executable, "-m", "pip", "install",
                    "--no-index", "--no-deps",
                    "--find-links", str(package_dir),
                    "pyarrow_hotfix",
                ], text=True, capture_output=True)
                if proc.stdout:
                    print(proc.stdout, flush=True)
                if proc.stderr:
                    print(proc.stderr, file=sys.stderr, flush=True)
                if proc.returncode == 0:
                    break

    import_failures = {}
    for name in required:
        try:
            module = __import__(name)
            if name != "torch":
                print(f"dependency {name}={getattr(module, '__version__', 'unknown')}", flush=True)
        except Exception as exc:
            import_failures[name] = f"{type(exc).__name__}:{exc}"
    if import_failures:
        print(json.dumps({"dependency_import_failures": import_failures}, indent=2), flush=True)
        raise SystemExit(
            "KAGGLE_OFFLINE_DEPENDENCY_IMPORT_FAILED:"
            + ",".join(sorted(import_failures))
        )

def extract_parent(payload: Path) -> str | None:
    archive = payload / "parent-bundle.tar.gz"
    if not archive.is_file():
        return None
    PARENT.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        tar.extractall(PARENT)
    artifact = json.loads((PARENT / "artifact-evidence.json").read_text(encoding="utf-8"))
    digest = str(artifact.get("digest") or "").lower()
    if not digest.startswith("sha256:"):
        raise SystemExit("KAGGLE_PARENT_DIGEST_INVALID")
    return digest

def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8") as fh:
        return sum(1 for line in fh if line.strip())

def main():
    if TARGET_SHA.startswith("__"):
        raise SystemExit("MEL_GIT_SHA_NOT_INJECTED")
    payload = prepare_payload()

    if count_lines(SHARD) != SHARD_SIZE:
        raise SystemExit(f"MEL_SHARD_COUNT_INVALID:{count_lines(SHARD)}:{SHARD_SIZE}")
    shard_meta = json.loads(SHARD_META.read_text(encoding="utf-8"))
    if int(shard_meta.get("cycle", -1)) != CYCLE:
        raise SystemExit("MEL_SHARD_CYCLE_MISMATCH")
    if str(shard_meta.get("output_sha256") or "") != sha256_file(SHARD):
        raise SystemExit("MEL_SHARD_DIGEST_MISMATCH")

    require_kaggle_gpu()
    ensure_dependencies()
    base_model = find_base_model()
    print(json.dumps({
        "offline": True,
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "base_model_path": str(base_model),
        "shard_sha256": sha256_file(SHARD),
    }, indent=2), flush=True)

    plan = DATA / f"lora-plan-cycle-{CYCLE:03d}.json"
    run([
        sys.executable, SCRIPTS / "create-lora-plan.py",
        "--dataset", SHARD,
        "--output", plan,
        "--id", f"mel-kaggle-uncensored-c{CYCLE:03d}-{TARGET_SHA[:12]}",
        "--epochs", "1",
        "--rank", "8",
        "--alpha", "16",
        "--dropout", "0.05",
        "--learning-rate", "0.0002",
        "--seed", "42",
    ])

    parent_digest = extract_parent(payload)
    stage = "uncensored-continue" if parent_digest else "uncensored"
    cmd = [
        sys.executable, SCRIPTS / "train-mel-lora.py",
        "--dataset", SHARD,
        "--plan", plan,
        "--output", OUTPUT,
        "--base-model-path", base_model,
        "--stage", stage,
        "--epochs", "1",
        "--max-length", "512",
        "--gradient-accumulation-steps", "8",
        "--save-steps", "1000000",
        "--seed", "42",
    ]
    if parent_digest:
        cmd += ["--parent-adapter-dir", PARENT, "--parent-artifact-digest", parent_digest]
    run(cmd)

    impact_path = OUTPUT / "local-impact-benchmark.json"
    run([
        sys.executable, SCRIPTS / "run-local-lora-impact.py",
        "--base-model-path", base_model,
        "--adapter-dir", OUTPUT,
        "--output", impact_path,
    ])
    impact = json.loads(impact_path.read_text(encoding="utf-8"))

    shutil.copy2(SHARD_META, OUTPUT / "shard-metadata.json")
    dataset_meta = {
        "schema": "mel.kaggle-offline-dataset-evidence.v2",
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "examples": SHARD_SIZE,
        "output_sha256": sha256_file(SHARD),
        "source_metadata": shard_meta,
        "offline_kernel": True,
    }
    (OUTPUT / "dataset-metadata.json").write_text(json.dumps(dataset_meta, indent=2) + "\n", encoding="utf-8")

    required = [
        "adapter_model.safetensors", "adapter_config.json", "training-evidence.json",
        "artifact-evidence.json", "lora-plan.json", "dataset-metadata.json", "shard-metadata.json",
        "local-impact-benchmark.json",
    ]
    for name in required:
        target = OUTPUT / name
        if not target.is_file() or target.stat().st_size <= 0:
            raise SystemExit("MEL_OUTPUT_MISSING:" + name)

    artifact = json.loads((OUTPUT / "artifact-evidence.json").read_text(encoding="utf-8"))
    training = json.loads((OUTPUT / "training-evidence.json").read_text(encoding="utf-8"))
    run_meta = {
        "status": "TRAINED_UNBENCHMARKED",
        "source_sha": TARGET_SHA,
        "cycle": CYCLE,
        "stage": stage,
        "shard_size": SHARD_SIZE,
        "artifact_digest": artifact["digest"],
        "parent_artifact_digest": parent_digest,
        "train_loss": training.get("training_metrics", {}).get("train_loss"),
        "global_step": training.get("training_metrics", {}).get("global_step"),
        "local_impact": impact.get("candidate", {}).get("metrics", {}),
        "local_impact_delta": impact.get("delta", {}),
        "local_uncensored_gate": impact.get("local_uncensored_gate") is True,
        "local_next_stage": impact.get("next_stage") or "UNCENSORED_CONTINUE",
        "offline_kernel": True,
    }
    RUN_META.write_text(json.dumps(run_meta, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(RUN_META, OUTPUT / "kaggle-run.json")

    with tarfile.open(BUNDLE, "w:gz") as tar:
        for name in required + ["kaggle-run.json"]:
            tar.add(OUTPUT / name, arcname=name)

    print(json.dumps({
        **run_meta,
        "bundle": str(BUNDLE),
        "bundle_sha256": sha256_file(BUNDLE),
    }, indent=2), flush=True)

if __name__ == "__main__":
    main()
