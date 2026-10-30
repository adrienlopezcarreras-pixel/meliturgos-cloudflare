"""Regression tests for the read-only checkpoint lineage auditor."""
import importlib.util
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "audit-lora-checkpoint-lineage.py"
spec = importlib.util.spec_from_file_location("lora_lineage_audit", SOURCE)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)

A = "a" * 64
B = "b" * 64
C = "c" * 64


class CheckpointLineageAuditTests(unittest.TestCase):
    def test_two_cycles_with_prefixed_hashes(self):
        records = [
            {"cycle": 1, "artifact_digest": "sha256:" + A},
            {"cycle": "C002", "artifact_digest": B, "parent_artifact_digest": "sha256:" + A},
        ]
        self.assertEqual(auditor.audit(records, expected=2)["status"], "VERIFIED")

    def test_external_root_requires_independent_digest(self):
        records = [{"cycle": "C001", "artifact_digest": A, "parent_artifact_digest": "sha256:" + C}]
        result = auditor.audit(records, expected=1)
        self.assertEqual(result["status"], "UNVERIFIED")
        self.assertTrue(any("independently verified" in issue for issue in result["issues"]))
        self.assertEqual(auditor.audit(records, expected=1, root_digest=C)["status"], "VERIFIED")
        self.assertEqual(auditor.audit(records, expected=1, root_digest=B)["status"], "UNVERIFIED")

    def test_broken_parent_chain_rejected(self):
        records = [
            {"cycle": "C001", "artifact_digest": A},
            {"cycle": "C002", "artifact_digest": B, "parent_artifact_digest": C},
        ]
        result = auditor.audit(records, expected=2)
        self.assertEqual(result["status"], "UNVERIFIED")
        self.assertTrue(any("parent does not match" in issue for issue in result["issues"]))

    def test_missing_cycles_never_certified(self):
        result = auditor.audit([{"cycle": "C001", "artifact_digest": A}], expected=25)
        self.assertEqual(result["status"], "UNVERIFIED")
        self.assertEqual(result["present_cycles"], 1)
        self.assertTrue(any("missing cycle: C025" in issue for issue in result["issues"]))

    def test_duplicate_cycle_rejected(self):
        records = [{"cycle": "C001", "artifact_digest": A}, {"cycle": 1, "artifact_digest": B}]
        self.assertEqual(auditor.audit(records, expected=1)["status"], "UNVERIFIED")

    def test_malformed_digest_rejected(self):
        self.assertEqual(auditor.audit([{"cycle": 1, "artifact_digest": "sha256:not-a-hash"}], expected=1)["status"], "UNVERIFIED")


if __name__ == "__main__":
    unittest.main()
