#!/usr/bin/env python3
"""Explicit GPU entrypoint for isolated Abliteration candidates.
Never publishes, benchmarks, activates, or promotes a model.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from importlib.machinery import SourceFileLoader

def preflight(config,positive,negative,output,layer,device_memory_gib):
    root=Path(__file__).resolve().parent
    check=SourceFileLoader("mel_abliteration_direction",str(root/"abliteration-direction-gpu.py")).load_module()
    check.validate(config,positive,negative)
    if layer<0 or layer>=64:raise ValueError("ABLITERATION_LAYER_OUT_OF_BOUNDS")
    if Path(output).exists():raise FileExistsError("ABLITERATION_OUTPUT_EXISTS")
    if device_memory_gib<40:raise ValueError("ABLITERATION_GPU_MEMORY_UNSUITABLE")
    return {"status":"ABLITERATION_GPU_PREFLIGHT_PASSED_UNTRAINED","gpu_training_verified":False,
            "checkpoint_verified":False,"promoted":False,"activated":False}

def detect_gpu_memory_gib():
    import torch
    if not torch.cuda.is_available():raise RuntimeError("ABLITERATION_GPU_REQUIRED")
    return max(torch.cuda.get_device_properties(i).total_memory/(1024**3)
               for i in range(torch.cuda.device_count()))

def run(args):
    memory=detect_gpu_memory_gib()
    evidence=preflight(args.config,args.positive,args.negative,args.output,args.layer,memory)
    if args.preflight_only:
        print(json.dumps(evidence,sort_keys=True))
        return
    script=Path(__file__).with_name("abliteration-direction-gpu.py")
    cmd=[sys.executable,str(script),"--config",args.config,"--positive",args.positive,
         "--negative",args.negative,"--output",args.output,"--layer",str(args.layer)]
    subprocess.run(cmd,check=True)
    # The estimator writes evidence.json; never claim benchmark success.
    result=json.loads((Path(args.output)/"evidence.json").read_text(encoding="utf-8"))
    if result.get("status")!="ABLITERATION_DIRECTION_ESTIMATED_UNBENCHMARKED":
        raise RuntimeError("ABLITERATION_EVIDENCE_MISSING")
    print(json.dumps(result,sort_keys=True))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("config","positive","negative","output"):p.add_argument("--"+name,required=True)
    p.add_argument("--layer",type=int,default=10)
    p.add_argument("--preflight-only",action="store_true")
    run(p.parse_args())
