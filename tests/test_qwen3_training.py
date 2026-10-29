#!/usr/bin/env python3
"""Pure-CPU regression cases for the independent Qwen3 LoRA entrypoint."""
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "train-qwen3-lora.py"
SPEC = importlib.util.spec_from_file_location("mel_qwen3_lora", SCRIPT)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class TestQwen3Training(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "dataset.jsonl"
        self.manifest = self.root / "sources.json"
        self.output = self.root / "candidate"
        rows = []
        for i in range(60):
            rows.append(json.dumps({"messages": [
                {"role": "user", "content": f"Bonjour, question légitime numéro {i}"},
                {"role": "assistant", "content": f"Réponse structurée numéro {i}, avec explications."},
            ]}, ensure_ascii=False))
        self.data.write_text("\n".join(rows) + "\n", encoding="utf-8")
        digest = "sha256:" + hashlib.sha256(self.data.read_bytes()).hexdigest()
        self.manifest.write_text(json.dumps({
            "dataset_sha256": digest,
            "license_review_passed": True,
            "sources": [{"id": "mel-curated-fixture", "revision": "frozen-local-sha",
                         "license": "test-fixture"}],
        }), encoding="utf-8")

    def args(self):
        return ["--dataset", str(self.data), "--manifest", str(self.manifest),
                "--output", str(self.output), "--dry-run"]

    def test_dry_run_is_evidence_honest_and_gpu_free(self):
        result = MOD.run(self.args())
        self.assertEqual(result["base_model"], "Qwen/Qwen3-14B")
        self.assertEqual(result["status"], "TRAINING_PLAN_VALIDATED_UNTRAINED")
        self.assertEqual(result["examples"], 60)
        self.assertEqual(result["train_examples"] + result["validation_examples"], 60)
        self.assertFalse(self.output.exists())

    def test_kaggle_entrypoint_contains_adapter_digest_gate(self):
        entry = Path(__file__).resolve().parents[1] / "kaggle" / "qwen3-gated-gpu-entry.py"
        source = entry.read_text(encoding="utf-8")
        compile(source, str(entry), "exec")
        self.assertIn("QWEN_GPU_ARTIFACT_DIGEST_MISMATCH", source)
        self.assertIn("QWEN_GPU_ARTIFACT_MISSING", source)
        self.assertIn("QWEN_GPU_PREMATURE_ACTIVATION_FORBIDDEN", source)
        self.assertIn("hashlib.sha256(artifact.read_bytes()).hexdigest()", source)

    def test_kaggle_gpu_workflow_embeds_trainer_in_main_script(self):
        workflow = (Path(__file__).resolve().parents[1] /
                    ".github/workflows/professor-qwen-kaggle-gpu.yml")
        source = workflow.read_text(encoding="utf-8")
        self.assertIn("base64.b64encode(trainer)", source)
        self.assertIn("artifacts/qwen-kernel/main.py", source)
        self.assertIn("train-qwen3-lora.py').write_bytes(", source)
        self.assertNotIn("cp scripts/train-qwen3-lora.py artifacts/qwen-kernel/", source)

    def test_generated_kaggle_script_has_compile_gate(self):
        workflow = (Path(__file__).resolve().parents[1] /
                    ".github/workflows/professor-qwen-kaggle-gpu.yml")
        content = workflow.read_text(encoding="utf-8")
        self.assertIn("compile(generated,'main.py','exec')", content)
        self.assertIn("compile(generated,'main.py','exec')", content)
        self.assertIn("write_text(generated,encoding='utf-8')", content)

    def test_generated_kaggle_kernel_compiles_in_real_subprocess(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / ".github/workflows/professor-qwen-kaggle-gpu.yml").read_text(encoding="utf-8")
        marker = "          mkdir -p artifacts/qwen-kernel\n"
        self.assertIn(marker, workflow)
        block = workflow.split(marker, 1)[1].split("          PY\n", 1)[0]
        script = block.split("          python - <<'PY'\n", 1)[1]
        script = "\n".join(line[10:] if line.startswith("          ") else line
                           for line in script.splitlines()) + "\n"
        scratch = self.root / "sandbox"
        (scratch / "scripts").mkdir(parents=True)
        (scratch / "kaggle").mkdir()
        (scratch / "artifacts/qwen-kernel").mkdir(parents=True)
        (scratch / "scripts/train-qwen3-lora.py").write_bytes(
            (root / "scripts/train-qwen3-lora.py").read_bytes())
        (scratch / "kaggle/qwen3-gated-gpu-entry.py").write_bytes(
            (root / "kaggle/qwen3-gated-gpu-entry.py").read_bytes())
        subprocess.run([sys.executable, "-c", script], cwd=scratch,
                       check=True, capture_output=True, text=True)
        generated = (scratch / "artifacts/qwen-kernel/main.py").read_text()
        compile(generated, "main.py", "exec")
        self.assertIn("QWEN_GPU_PROOF_MISSING", generated)
        self.assertIn("b64decode", generated)

    def test_reject_wrong_checksum(self):
        obj = json.loads(self.manifest.read_text())
        obj["dataset_sha256"] = "sha256:" + "0" * 64
        self.manifest.write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "QWEN_DATASET_DIGEST_MISMATCH"):
            MOD.run(self.args())

    def test_reject_unreviewed_sources(self):
        obj = json.loads(self.manifest.read_text())
        obj["license_review_passed"] = False
        self.manifest.write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "QWEN_DATASET_LICENSE_REVIEW_REQUIRED"):
            MOD.run(self.args())

    def test_reject_output_overwrite(self):
        self.output.mkdir()
        (self.output / "adapter_model.safetensors").write_bytes(b"existing")
        with self.assertRaisesRegex(ValueError, "QWEN_IMMUTABLE_OUTPUT_ALREADY_EXISTS"):
            MOD.run(self.args())

    def test_reject_invalid_messages(self):
        lines = self.data.read_text().splitlines()
        obj = json.loads(lines[0])
        obj["messages"][1]["role"] = "unknown"
        lines[0] = json.dumps(obj)
        self.data.write_text("\n".join(lines) + "\n")
        obj = json.loads(self.manifest.read_text())
        obj["dataset_sha256"] = MOD.sha256(self.data)
        self.manifest.write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "QWEN_DATA_INVALID_ROLE_OR_TEXT"):
            MOD.run(self.args())

    def test_reject_small_data(self):
        self.data.write_text("\n".join(self.data.read_text().splitlines()[:8]) + "\n")
        obj = json.loads(self.manifest.read_text())
        obj["dataset_sha256"] = MOD.sha256(self.data)
        self.manifest.write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError, "QWEN_DATA_TOO_SMALL"):
            MOD.run(self.args())


if __name__ == "__main__":
    unittest.main()
