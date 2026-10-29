import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/"scripts/prepare-qwen-kaggle-corpus.py"
S=importlib.util.spec_from_file_location("qwen_pack",P)
M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
class TestPack(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.source=self.root/"source.jsonl"
        with self.source.open("w") as f:
            for i in range(50):
                f.write(json.dumps({"messages":[{"role":"user","content":f"question {i}"},
                                                {"role":"assistant","content":f"answer {i}"}]})+"\n")
        self.review=self.root/"review.json"
        self.approval={"license_review_passed":True,"source_id":"reviewed/source",
          "revision":"reviewed-revision","license":"explicit-reviewed-license",
          "input_sha256":M.digest(self.source)}
        self.write()
    def write(self):self.review.write_text(json.dumps(self.approval))
    def test_refuses_unreviewed(self):
        self.approval["license_review_passed"]=False;self.write()
        with self.assertRaisesRegex(ValueError,"LICENSE_OR_HASH_REVIEW_REQUIRED"):
            M.pack(self.source,self.root/"out",self.review)
    def test_refuses_changed_source(self):
        self.source.write_text(self.source.read_text()+"\n")
        with self.assertRaisesRegex(ValueError,"LICENSE_OR_HASH_REVIEW_REQUIRED"):
            M.pack(self.source,self.root/"out",self.review)
    def test_package_rejects_oversized_normalized_output(self):
        from unittest.mock import patch
        with patch.object(M, "json") as mock_json:
            import json as real_json
            mock_json.loads.side_effect=real_json.loads
            mock_json.dumps.return_value="x"*500000
            with self.assertRaisesRegex(ValueError,"EXCEEDS_KAGGLE_LIMIT"):
                M.pack(self.source,self.root/"out",self.review)
        self.assertFalse((self.root/"out").exists())
    def test_offline_package_contract(self):
        result=M.pack(self.source,self.root/"out",self.review)
        self.assertEqual(result["rows"],50)
        self.assertFalse(result["kaggle_published"])
        self.assertTrue((self.root/"out/dataset.jsonl").is_file())
        manifest=json.loads((self.root/"out/sources.json").read_text())
        self.assertEqual(manifest["dataset_sha256"],M.digest(self.root/"out/dataset.jsonl"))
if __name__=="__main__": unittest.main()
