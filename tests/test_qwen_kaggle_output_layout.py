import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORKFLOW=ROOT/'.github/workflows/professor-qwen-kaggle-result-verify.yml'

class KaggleOutputLayoutContract(unittest.TestCase):
    def test_flat_and_nested_output_allowed_without_ambiguous_result(self):
        src=WORKFLOW.read_text(encoding='utf-8')
        self.assertIn("root/'qwen3-candidate',root",src)
        self.assertIn('QWEN_CANDIDATE_OUTPUT_MISSING_OR_AMBIGUOUS',src)
        self.assertIn('scripts/verify-qwen-gpu-artifacts.py "$candidate"',src)
        self.assertIn('--source-sha "$EXPECTED_SHA"',src)
        self.assertNotIn('kaggle kernels push',src)

if __name__=='__main__':
    unittest.main()
