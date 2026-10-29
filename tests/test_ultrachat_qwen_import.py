import importlib.util
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/"scripts/import-ultrachat-qwen.py"
S=importlib.util.spec_from_file_location("ultrachat_import",P)
M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
class TestUltraChat(unittest.TestCase):
    def test_converts_chat_without_approval(self):
        rows=[{"messages":[{"role":"user","content":"Q"+str(i)},{"role":"assistant","content":"A"+str(i)}]} for i in range(55)]
        self.assertEqual(len(M.convert_rows(rows,"sha256:"+("a"*64),50)),50)
    def test_rejects_invalid_content(self):
        rows=[{"messages":[{"role":"user","content":"Q"},{"role":"assistant","content":""}]}]*55
        with self.assertRaisesRegex(ValueError,"TOO_FEW"):M.convert_rows(rows,"x",50)
    def test_deduplication(self):
        rows=[{"messages":[{"role":"user","content":"Q"},{"role":"assistant","content":"A"}]}]*100
        with self.assertRaisesRegex(ValueError,"TOO_FEW"):M.convert_rows(rows,"x",50)
if __name__=="__main__":unittest.main()
