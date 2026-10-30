import unittest
from importlib.machinery import SourceFileLoader
from pathlib import Path

M = SourceFileLoader("lineage_audit", str(Path(__file__).resolve().parents[1] / "scripts" / "audit-lora-checkpoint-lineage.py")).load_module()

A = "a" * 64
B = "b" * 64

class LineageAuditTests(unittest.TestCase):
    def test_prefixed_digests_and_explicit_parent_provenance(self):
        records = [
            {"cycle": 1, "artifact_digest": "sha256:" + A, "parent_artifact_digest": "sha256:" + B, "parent_release_tag": "verified-external-release"},
            {"cycle": "C002", "artifact_digest": B, "parent_artifact_digest": A},
        ]
        self.assertEqual(M.audit(records, expected=2)["status"], "VERIFIED")

    def test_c001_external_parent_without_provenance_is_not_verified(self):
        records = [{"cycle": 1, "artifact_digest": "sha256:" + A, "parent_artifact_digest": "sha256:" + B}]
        self.assertEqual(M.audit(records, expected=1)["status"], "UNVERIFIED")

    def test_parent_mismatch_rejected(self):
        records = [{"cycle": 1, "artifact_digest": A}, {"cycle": 2, "artifact_digest": B, "parent_artifact_digest": "c"*64}]
        self.assertEqual(M.audit(records, expected=2)["status"], "UNVERIFIED")

if __name__ == "__main__":
    unittest.main()
