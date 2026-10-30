import unittest
from pathlib import Path

WORKFLOW = (Path(__file__).resolve().parents[1] / ".github/workflows/qwen-hf-source-audit.yml").read_text()

class QwenHfAuditContract(unittest.TestCase):
    def test_pinned_source_and_bounded_download(self):
        self.assertIn("QWEN_HF_REVISION_MUST_BE_IMMUTABLE_SHA", WORKFLOW)
        self.assertIn("Guilherme34/uncensor/resolve/", WORKFLOW)
        self.assertIn("QWEN_HF_FILE_EXCEEDS_AUDIT_LIMIT", WORKFLOW)
        self.assertIn("mod.convert(target,Path('.tmp-qwen-audit/train-only.jsonl'),sha)", WORKFLOW)
    def test_no_gpu_promotion_or_license_claim(self):
        self.assertIn("license_review_passed=False", WORKFLOW)
        self.assertIn("kaggle_published=False", WORKFLOW)
        self.assertIn("model_activated=False", WORKFLOW)
        self.assertIn("path: artifacts/source-audit.json", WORKFLOW)
        self.assertNotIn("kaggle kernels push", WORKFLOW)
        self.assertNotIn("model.save_pretrained", WORKFLOW)

if __name__ == "__main__":
    unittest.main()
