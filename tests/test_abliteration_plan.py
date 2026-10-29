import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/"scripts/abliteration-gated-preflight.py"
S=importlib.util.spec_from_file_location("abliteration_plan",P)
M=importlib.util.module_from_spec(S);S.loader.exec_module(M)

class AbliterationPlanTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/"reviewed.json"
        self.config={"reviewed":True,"base_model":"Qwen/Qwen3-14B",
          "method":"directional-refusal-vector","dataset_license_reviewed":True,
          "positive_dataset_sha256":"sha256:"+"a"*64,
          "negative_dataset_sha256":"sha256:"+"b"*64}
        self.write()
    def write(self):
        self.path.write_text(json.dumps(self.config),encoding="utf-8")
    def test_reviewed_plan_not_training(self):
        out=M.plan(self.path)
        self.assertEqual(out["status"],"ABLITERATION_PLAN_VALIDATED_UNTRAINED")
        self.assertFalse(out["activated"])
    def test_unreviewed_rejected(self):
        self.config["reviewed"]=False;self.write()
        with self.assertRaisesRegex(ValueError,"REVIEW_REQUIRED"):M.plan(self.path)
    def test_unlicensed_rejected(self):
        self.config["dataset_license_reviewed"]=False;self.write()
        with self.assertRaisesRegex(ValueError,"LICENSE_REVIEW_REQUIRED"):M.plan(self.path)
    def test_duplicate_datasets_rejected(self):
        self.config["negative_dataset_sha256"]=self.config["positive_dataset_sha256"];self.write()
        with self.assertRaisesRegex(ValueError,"DATASETS_NOT_DISTINCT"):M.plan(self.path)
if __name__=="__main__":unittest.main()
