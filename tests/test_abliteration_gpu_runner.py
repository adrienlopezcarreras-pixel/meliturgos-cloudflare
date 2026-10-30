import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/"scripts/abliteration-gpu-runner.py"
S=importlib.util.spec_from_file_location("abl_gpu_runner",P)
M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
D=Path(__file__).resolve().parents[1]/"scripts/abliteration-direction-gpu.py"
DS=importlib.util.spec_from_file_location("abl_direction",D)
DR=importlib.util.module_from_spec(DS);DS.loader.exec_module(DR)
class TestRunner(unittest.TestCase):
    def test_review_and_gpu_memory_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            pos=root/"positive.json"; neg=root/"negative.json";cfg=root/"config.json"
            pos.write_text(json.dumps(["a","b"]));neg.write_text(json.dumps(["c","d"]))
            cfg.write_text(json.dumps({"reviewed":True,"dataset_license_reviewed":True,
              "base_model":"Qwen/Qwen3-14B","method":"directional-refusal-vector",
              "positive_dataset_sha256":DR.digest(pos),"negative_dataset_sha256":DR.digest(neg)}))
            with self.assertRaisesRegex(ValueError,"GPU_MEMORY_UNSUITABLE"):
                M.preflight(str(cfg),str(pos),str(neg),str(root/"out"),10,16)
            result=M.preflight(str(cfg),str(pos),str(neg),str(root/"out"),10,48)
            self.assertFalse(result["gpu_training_verified"])
            self.assertFalse(result["activated"])
            cfg.write_text(json.dumps({"reviewed":False}))
            with self.assertRaisesRegex(ValueError,"REVIEW_REQUIRED"):
                M.preflight(str(cfg),str(pos),str(neg),str(root/"out"),10,48)
if __name__=="__main__":unittest.main()
