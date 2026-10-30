import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("conv", Path(__file__).resolve().parents[1] / "scripts/convert-ultrachat-uncensored.py")
conv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(conv)


class ConvertUltrachatUncensored(unittest.TestCase):
    def test_alternating_turns_become_messages_and_duplicates_drop(self):
        line = json.dumps({"id": "1", "data": ["q", "a", "q2"]})
        rows = conv.convert([line] * 2 + [json.dumps({"id": str(i), "data": ["q%d" % i, "a"]}) for i in range(60)], 100)
        first = json.loads(rows[0])
        self.assertEqual([m["role"] for m in first["messages"]], ["user", "assistant"])
        self.assertEqual(len(rows), 61)

    def test_too_few_valid_rows_refuses(self):
        with self.assertRaises(ValueError):
            conv.convert([json.dumps({"data": ["only one"]})], 100)


if __name__ == "__main__":
    unittest.main()
