import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
P=Path(__file__).resolve().parents[1]/"scripts/abliteration-apply-gated.py"
S=importlib.util.spec_from_file_location("apply_abliteration",P)
M=importlib.util.module_from_spec(S);S.loader.exec_module(M)
class ApplyAbliterationContracts(unittest.TestCase):
    def test_projection_eliminates_component(self):
        direction=[0.6,0.8]
        original=[[2.0,3.0],[-1.0,5.0]]
        altered=M.project_columns(original,direction)
        for j in (0,1):
            self.assertAlmostEqual(sum(direction[i]*altered[i][j] for i in (0,1)),0.0,places=7)
    def test_nonunit_rejected(self):
        with self.assertRaisesRegex(ValueError,"NOT_NORMALIZED"):
            M.project_columns([[1],[2]],[1,1])
    def test_evidence_digest_and_activation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);v=root/"direction.safetensors";e=root/"evidence.json"
            v.write_bytes(b"offline-test")
            proof={"status":"ABLITERATION_DIRECTION_ESTIMATED_UNBENCHMARKED",
              "activated":False,"promoted":False,"checkpoint_verified":False,
              "base_model":"Qwen/Qwen3-14B","layer":10,"direction_sha256":M.sha(v)}
            e.write_text(json.dumps(proof))
            self.assertEqual(M.check(e,v,10),proof)
            v.write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError,"DIGEST_MISMATCH"): M.check(e,v,10)
            v.write_bytes(b"offline-test")
            proof["activated"]=True;e.write_text(json.dumps(proof))
            with self.assertRaisesRegex(ValueError,"PREMATURE_ACTIVATION"):M.check(e,v,10)
if __name__=="__main__":unittest.main()
