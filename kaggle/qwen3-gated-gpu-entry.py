"""Kaggle Qwen3 GPU entry: only audited dataset files; never promotes weights."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

root=Path('/kaggle/input')
slug=os.environ.get('MEL_QWEN_DATASET_SLUG','')
if not slug or '/' not in slug:
    raise SystemExit('QWEN_DATASET_SLUG_REQUIRED')
dataset_dir=root/slug.split('/')[-1]
if not dataset_dir.is_dir():
    raise SystemExit('QWEN_AUDITED_KAGGLE_DATASET_NOT_MOUNTED')
files=list(dataset_dir.rglob('dataset.jsonl'))
manifests=list(dataset_dir.rglob('sources.json'))
if len(files)!=1 or len(manifests)!=1:
    raise SystemExit('QWEN_EXACTLY_ONE_DATASET_AND_MANIFEST_REQUIRED')
subprocess.run([sys.executable,'-m','pip','install','-q','transformers>=4.51,<5','peft>=0.15,<1','datasets>=3,<5','accelerate>=1,<2','bitsandbytes>=0.45,<1','safetensors>=0.5,<1'],check=True)
output=Path('/kaggle/working/qwen3-candidate')
cmd=[sys.executable,'/kaggle/working/train-qwen3-lora.py','--dataset',str(files[0]),'--manifest',str(manifests[0]),'--output',str(output),'--max-steps','10','--max-length','256']
print(json.dumps({'stage':'QWEN_GPU_START','dataset_slug':slug,'output':str(output)},sort_keys=True),flush=True)
subprocess.run(cmd,check=True)
proof_file=output/'training-evidence.json'
if not proof_file.is_file():
    raise SystemExit('QWEN_GPU_PROOF_MISSING')
proof=json.loads(proof_file.read_text(encoding='utf-8'))
if proof.get('status')!='TRAINED_UNBENCHMARKED' or int(proof.get('steps_executed',0))<1:
    raise SystemExit('QWEN_GPU_PROOF_MISSING')
for filename, field in (('adapter_model.safetensors','adapter_sha256'),
                        ('adapter_config.json','adapter_config_sha256')):
    artifact=output/filename
    if not artifact.is_file() or artifact.stat().st_size==0:
        raise SystemExit('QWEN_GPU_ARTIFACT_MISSING:'+filename)
    digest='sha256:'+hashlib.sha256(artifact.read_bytes()).hexdigest()
    if proof.get(field)!=digest:
        raise SystemExit('QWEN_GPU_ARTIFACT_DIGEST_MISMATCH:'+filename)
if proof.get('promoted') is not False or proof.get('activated') is not False:
    raise SystemExit('QWEN_GPU_PREMATURE_ACTIVATION_FORBIDDEN')
print(json.dumps({'stage':'QWEN_GPU_TRAINED_UNBENCHMARKED','steps':proof['steps_executed'],'adapter_sha256':proof['adapter_sha256']},sort_keys=True),flush=True)
