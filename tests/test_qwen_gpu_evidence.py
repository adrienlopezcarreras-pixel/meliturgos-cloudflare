#!/usr/bin/env python3
import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

TARGET=Path(__file__).resolve().parents[1]/"scripts/verify-qwen-gpu-artifacts.py"
SPEC=importlib.util.spec_from_file_location("qwen_result_verify",TARGET)
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class TestQwenGpuEvidence(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder=Path(self.temp.name)
        for name,data in (("adapter_model.safetensors",b"mock-adapter"),("adapter_config.json",b'{"r":8}')):
            (self.folder/name).write_bytes(data)
        self.proof={"status":"TRAINED_UNBENCHMARKED","base_model":"Qwen/Qwen3-14B",
            "steps_executed":5,"promoted":False,"activated":False,
            "adapter_sha256":M.digest(self.folder/"adapter_model.safetensors"),
            "adapter_config_sha256":M.digest(self.folder/"adapter_config.json")}
        self.write()
    def write(self):
        (self.folder/"training-evidence.json").write_text(json.dumps(self.proof))
    def test_result_collection_workflow_is_strict_and_non_promoting(self):
        workflow=(Path(__file__).resolve().parents[1] /
                  ".github/workflows/professor-qwen-kaggle-result-verify.yml")
        source=workflow.read_text(encoding="utf-8")
        self.assertIn('kaggle kernels output "$KERNEL_SLUG"',source)
        self.assertIn('--source-sha "$EXPECTED_SHA"',source)
        self.assertIn('scripts/verify-qwen-gpu-artifacts.py',source)
        self.assertIn('path: artifacts/qwen-verification.json',source)
        self.assertNotIn('adapter_model.safetensors\n',source)
        self.assertNotIn('kaggle kernels push',source)

    def test_valid_unpromoted_candidate(self):
        self.assertTrue(M.verify(self.folder)["verified"])
    def test_reject_changed_weights(self):
        (self.folder/"adapter_model.safetensors").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError,"HASH_MISMATCH"):
            M.verify(self.folder)
    def test_reject_missing_file(self):
        (self.folder/"adapter_config.json").unlink()
        with self.assertRaisesRegex(ValueError,"FILE_MISSING"):
            M.verify(self.folder)
    def test_reject_fake_success(self):
        self.proof["steps_executed"]=0
        self.write()
        with self.assertRaisesRegex(ValueError,"STEPS_NOT_PROVEN"):
            M.verify(self.folder)
    def test_reject_activation(self):
        self.proof["activated"]=True
        self.write()
        with self.assertRaisesRegex(ValueError,"PREMATURE_ACTIVATION"):
            M.verify(self.folder)
    def test_reject_unbound_source(self):
        with self.assertRaisesRegex(ValueError,"SOURCE_SHA_MISMATCH"):
            M.verify(self.folder,"a"*40)
if __name__=="__main__":
    unittest.main()
