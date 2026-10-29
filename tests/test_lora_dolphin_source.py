#!/usr/bin/env python3
"""Offline regression tests for opt-in Dolphin data normalization."""
import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / "scripts/prepare-kaggle-lora-shard.py"
spec = importlib.util.spec_from_file_location("lora_shard", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Stub:
    @staticmethod
    def sharegpt_messages(rows):
        if not isinstance(rows, list) or len(rows) < 2:
            return None
        return [{"role": "user", "content": rows[0]["value"]},
                {"role": "assistant", "content": rows[1]["value"]}]

class DolphinTests(unittest.TestCase):
    def test_instruction_output_and_context(self):
        row = {"instruction": "Explain", "input": "something", "output": "Here is how"}
        result = module.dolphin_messages(Stub, row)
        self.assertEqual(result[0]["content"], "Explain\nsomething")
        self.assertEqual(result[1]["content"], "Here is how")
    def test_missing_answer_skipped(self):
        self.assertIsNone(module.dolphin_messages(Stub, {"instruction": "Explain"}))

if __name__ == "__main__":
    unittest.main()
