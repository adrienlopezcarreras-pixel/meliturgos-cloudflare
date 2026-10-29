#!/usr/bin/env python3
"""Experimental, offline-gated refusal-direction weight projection. Never promotes."""
import argparse
import hashlib
import json
from pathlib import Path

def sha(path):
    return "sha256:"+hashlib.sha256(Path(path).read_bytes()).hexdigest()

def check(evidence_path,direction_path,layer):
    evidence=json.loads(Path(evidence_path).read_text(encoding="utf-8"))
    if evidence.get("status")!="ABLITERATION_DIRECTION_ESTIMATED_UNBENCHMARKED":
        raise ValueError("ABLITERATION_DIRECTION_EVIDENCE_INVALID")
    if evidence.get("activated") is not False or evidence.get("promoted") is not False:
        raise ValueError("ABLITERATION_PREMATURE_ACTIVATION")
    if evidence.get("checkpoint_verified") is not False:
        raise ValueError("ABLITERATION_PROOF_CONFLICT")
    if evidence.get("base_model")!="Qwen/Qwen3-14B" or evidence.get("layer")!=layer:
        raise ValueError("ABLITERATION_BASE_OR_LAYER_MISMATCH")
    if sha(direction_path)!=evidence.get("direction_sha256"):
        raise ValueError("ABLITERATION_DIRECTION_DIGEST_MISMATCH")
    return evidence

def project_columns(matrix,vector):
    """Pure Python reference: subtract projection from each output column."""
    n=len(vector)
    if not n or any(not isinstance(row,list) or len(row)!=len(matrix[0]) for row in matrix) or len(matrix)!=n:
        raise ValueError("ABLITERATION_SHAPE_INVALID")
    norm=sum(v*v for v in vector)
    if abs(norm-1.0)>1e-3:
        raise ValueError("ABLITERATION_DIRECTION_NOT_NORMALIZED")
    width=len(matrix[0])
    if not width: raise ValueError("ABLITERATION_SHAPE_INVALID")
    coefficients=[sum(vector[i]*matrix[i][j] for i in range(n)) for j in range(width)]
    return [[matrix[i][j]-vector[i]*coefficients[j] for j in range(width)] for i in range(n)]

def run(args):
    import torch
    from safetensors.torch import load_file
    from transformers import AutoModelForCausalLM, AutoTokenizer
    evidence=check(args.evidence,args.direction,args.layer)
    if not torch.cuda.is_available():
        raise RuntimeError("ABLITERATION_GPU_REQUIRED")
    direction=load_file(args.direction)["direction"]
    if direction.ndim!=1 or not torch.isfinite(direction).all() or abs(direction.float().norm().item()-1)>1e-3:
        raise RuntimeError("ABLITERATION_DIRECTION_INVALID")
    output=Path(args.output)
    if output.exists(): raise FileExistsError("ABLITERATION_OUTPUT_EXISTS")
    model=AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-14B",torch_dtype=torch.float16,device_map="auto",trust_remote_code=False)
    if args.layer>=len(model.model.layers) or args.layer<0:
        raise ValueError("ABLITERATION_LAYER_OUT_OF_RANGE")
    layer=model.model.layers[args.layer]
    with torch.no_grad():
        # o_proj maps attention intermediate -> residual hidden dimension.
        weight=layer.self_attn.o_proj.weight
        unit=direction.to(device=weight.device,dtype=torch.float32)
        if weight.ndim!=2 or weight.shape[0]!=unit.numel():
            raise ValueError("ABLITERATION_WEIGHT_DIRECTION_SHAPE_MISMATCH")
        original=weight.float()
        updated=original-unit.unsqueeze(1)*(unit.unsqueeze(0)@original)
        weight.copy_(updated.to(dtype=weight.dtype))
    output.mkdir(parents=True)
    # Candidate only; this can be tens of GB and requires suitable disk/memory.
    model.save_pretrained(output,safe_serialization=True,max_shard_size="3GB")
    AutoTokenizer.from_pretrained("Qwen/Qwen3-14B",trust_remote_code=False).save_pretrained(output)
    details={"status":"ABLITERATION_APPLIED_UNBENCHMARKED","base_model":"Qwen/Qwen3-14B",
      "source_direction_sha256":evidence["direction_sha256"],"layer":args.layer,
      "benchmarked":False,"promoted":False,"activated":False}
    (output/"abliteration-evidence.json").write_text(json.dumps(details,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(details,sort_keys=True))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("evidence","direction","output"):p.add_argument("--"+name,required=True)
    p.add_argument("--layer",type=int,required=True)
    run(p.parse_args())
