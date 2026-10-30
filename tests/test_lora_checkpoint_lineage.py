import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "audit-lora-checkpoint-lineage.py"
spec = importlib.util.spec_from_file_location("lora_lineage", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

A = "a" * 64
B = "b" * 64


class LineageAuditTests(unittest.TestCase):
    def test_kaggle_prefixed_digest_and_initial_continuation(self):
        records = [
            {"cycle": "C001", "stage": "uncensored-continue",
             "artifact_digest": "sha256:" + A, "parent_artifact_digest": "sha256:" + B},
            {"cycle": "C002", "stage": "uncensored-continue",
             "artifact_digest": B, "parent_artifact_digest": A},
        ]
        self.assertEqual(module.audit(records, expected=2)["status"], "VERIFIED")

    def test_invalid_parent_is_not_accepted(self):
        rows = [{"cycle": "C001", "stage": "uncensored-continue",
                 "artifact_digest": A, "parent_artifact_digest": "sha256:nope"}]
        self.assertEqual(module.audit(rows, expected=1)["status"], "UNVERIFIED")

    def test_first_cycle_parent_requires_continuation_stage(self):
        rows = [{"cycle": "C001", "stage": "uncensored",
                 "artifact_digest": A, "parent_artifact_digest": B}]
        self.assertEqual(module.audit(rows, expected=1)["status"], "UNVERIFIED")

    def test_parent_chain_mismatch(self):
        rows = [{"cycle": "C001", "artifact_digest": A},
                {"cycle": "C002", "artifact_digest": B, "parent_artifact_digest": B}]
        self.assertEqual(module.audit(rows, expected=2)["status"], "UNVERIFIED")


if __name__ == "__main__":
    unittest.main()
