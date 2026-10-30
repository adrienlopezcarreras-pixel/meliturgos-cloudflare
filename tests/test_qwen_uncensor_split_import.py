import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("uncensor", Path(__file__).resolve().parents[1] / "scripts/import-qwen-uncensor-jsonl.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SplitImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name) / "source.jsonl"
        self.dest = Path(self.tmp.name) / "train.jsonl"

    def write(self, test_duplicate=False):
        rows = []
        for i in range(55):
            rows.append({"split": "TRAIN", "messages": [{"role": "user", "content": f"input {i}"}, {"role": "assistant", "content": f"answer {i}"}]})
        rows.append({"split": "TEST", "messages": [{"role": "user", "content": "input 0" if test_duplicate else "held-out"}, {"role": "assistant", "content": "answer 0" if test_duplicate else "held-out answer"}]})
        self.source.write_text("".join(json.dumps(x) + "\n" for x in rows), encoding="utf-8")
        return module.digest(self.source)

    def test_preserves_holdout(self):
        sha = self.write()
        summary = module.convert(self.source, self.dest, sha)
        self.assertEqual(summary["output_rows"], 55)
        self.assertEqual(summary["test_valid_rows_excluded"], 1)
        self.assertFalse(summary["license_review_passed"])
        self.assertEqual(len(self.dest.read_text().splitlines()), 55)

    def test_rejects_cross_split_duplication(self):
        sha = self.write(test_duplicate=True)
        with self.assertRaisesRegex(ValueError, "CROSS_SPLIT_DUPLICATES"):
            module.convert(self.source, self.dest, sha)
        self.assertFalse(self.dest.exists())

    def test_opt_in_quarantines_cross_split_duplicates(self):
        sha = self.write(test_duplicate=True)
        summary = module.convert(self.source, self.dest, sha, exclude_cross_split=True)
        self.assertEqual(summary["cross_split_duplicate_conversations_excluded"], 1)
        self.assertEqual(summary["output_rows"], 54)
        self.assertFalse(summary["license_review_passed"])
        self.assertNotIn("input 0", self.dest.read_text())

    def test_rejects_unpinned_source(self):
        self.write()
        with self.assertRaisesRegex(ValueError, "SOURCE_SHA_REQUIRED"):
            module.convert(self.source, self.dest, "")
        self.assertFalse(self.dest.exists())

    def test_rejects_unexpected_split(self):
        sha = self.write()
        rows = self.source.read_text().replace('"TRAIN"', '"VALID"', 1)
        self.source.write_text(rows)
        with self.assertRaisesRegex(ValueError, "UNEXPECTED_SPLIT"):
            module.convert(self.source, self.dest, module.digest(self.source))

if __name__ == "__main__":
    unittest.main()
