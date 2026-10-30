import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("audit_lineage", Path(__file__).resolve().parents[1] / "scripts" / "audit-lora-checkpoint-lineage.py")
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class LineageEvidenceTests(unittest.TestCase):
    def test_kaggle_integer_cycle_and_prefixed_digest(self):
        a, b = "a" * 64, "b" * 64
        rows = [{"cycle": 1, "artifact_digest": "sha256:" + a, "parent_artifact_digest": "sha256:" + b}]
        self.assertEqual(M.audit(rows, expected=1, external_parent_digest=b)["status"], "VERIFIED")
        self.assertEqual(M.audit(rows, expected=1)["status"], "UNVERIFIED")

    def test_continuation_chain(self):
        a, b, c = "a" * 64, "b" * 64, "c" * 64
        rows = [
          {"cycle": "C001", "artifact_digest": "sha256:" + a, "parent_artifact_digest": b},
          {"cycle": 2, "artifact_digest": c, "parent_artifact_digest": "sha256:" + a},
        ]
        self.assertEqual(M.audit(rows, expected=2, external_parent_digest=b)["status"], "VERIFIED")
        rows[1]["parent_artifact_digest"] = "d" * 64
        self.assertEqual(M.audit(rows, expected=2, external_parent_digest=b)["status"], "UNVERIFIED")

    def test_missing_cycles_rejected(self):
        self.assertEqual(M.audit([], expected=25)["status"], "UNVERIFIED")

if __name__ == "__main__":
    unittest.main()
