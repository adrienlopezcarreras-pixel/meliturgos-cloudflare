import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/"scripts/abliteration-direction-gpu.py"
S=importlib.util.spec_from_file_location("abliteration_gpu",P)
M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
class AbliterationGpuContracts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.pos=self.root/"positive.json";self.neg=self.root/"negative.json";self.cfg=self.root/"config.json"
        self.pos.write_text(json.dumps(["safe answer a","safe answer b"]))
        self.neg.write_text(json.dumps(["refusal a","refusal b"]))
        self.data={"reviewed":True,"dataset_license_reviewed":True,
            "base_model":"Qwen/Qwen3-14B","method":"directional-refusal-vector",
            "positive_dataset_sha256":M.digest(self.pos),"negative_dataset_sha256":M.digest(self.neg)}
        self.write()
    def write(self):self.cfg.write_text(json.dumps(self.data))
    def test_valid_offline_preflight(self):
        _,a,b=M.validate(self.cfg,self.pos,self.neg)
        self.assertEqual(len(a),2);self.assertEqual(len(b),2)
    def test_digest_tampering_rejected(self):
        self.pos.write_text('["changed","data"]')
        with self.assertRaisesRegex(ValueError,"DIGEST_MISMATCH"):M.validate(self.cfg,self.pos,self.neg)
    def test_review_required(self):
        self.data["reviewed"]=False;self.write()
        with self.assertRaisesRegex(ValueError,"REVIEW_REQUIRED"):M.validate(self.cfg,self.pos,self.neg)
    def test_invalid_prompts(self):
        self.pos.write_text('["only one"]');self.data["positive_dataset_sha256"]=M.digest(self.pos);self.write()
        with self.assertRaisesRegex(ValueError,"INVALID_PROMPTS"):M.validate(self.cfg,self.pos,self.neg)
if __name__=="__main__":unittest.main()
