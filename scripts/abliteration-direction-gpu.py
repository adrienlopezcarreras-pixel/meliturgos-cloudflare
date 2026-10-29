#!/usr/bin/env python3
"""Gated experimental refusal-direction estimator; saves an unbenchmarked candidate only."""
import argparse
import hashlib
import json
from pathlib import Path

def digest(path):
    return "sha256:" + hashlib.sha256(Path(path).read_bytes()).hexdigest()

def validate(config, positive, negative):
    data=json.loads(Path(config).read_text(encoding="utf-8"))
    if data.get("reviewed") is not True or data.get("dataset_license_reviewed") is not True:
        raise ValueError("ABLITERATION_REVIEW_REQUIRED")
    if data.get("base_model")!="Qwen/Qwen3-14B" or data.get("method")!="directional-refusal-vector":
        raise ValueError("ABLITERATION_MODEL_OR_METHOD_INVALID")
    for path,key in ((positive,"positive_dataset_sha256"),(negative,"negative_dataset_sha256")):
        if not Path(path).is_file() or digest(path)!=data.get(key):
            raise ValueError("ABLITERATION_DATASET_DIGEST_MISMATCH:"+key)
    if digest(positive)==digest(negative):
        raise ValueError("ABLITERATION_DATASETS_NOT_DISTINCT")
    def read(path):
        rows=json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(rows,list) or not 2<=len(rows)<=64 or any(not isinstance(x,str) or not x.strip() or len(x)>4000 for x in rows):
            raise ValueError("ABLITERATION_INVALID_PROMPTS")
        return rows
    return data,read(positive),read(negative)

def run(args):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from safetensors.torch import save_file
    data,positives,negatives=validate(args.config,args.positive,args.negative)
    if not torch.cuda.is_available():
        raise RuntimeError("ABLITERATION_GPU_REQUIRED")
    if args.layer < 0:
        raise ValueError("ABLITERATION_INVALID_LAYER")
    tokenizer=AutoTokenizer.from_pretrained(data["base_model"],trust_remote_code=False)
    model=AutoModelForCausalLM.from_pretrained(data["base_model"],device_map="auto",torch_dtype=torch.float16,trust_remote_code=False)
    model.eval()
    layers=model.model.layers
    if args.layer >= len(layers):
        raise ValueError("ABLITERATION_LAYER_OUT_OF_RANGE")
    layer=layers[args.layer]
    def mean_rep(prompts):
        vectors=[]
        def capture(_module,_inputs,output):
            value=output[0] if isinstance(output,tuple) else output
            vectors.append(value[:, -1, :].detach().float().cpu())
        for prompt in prompts:
            handle=layer.register_forward_hook(capture)
            try:
                encoded=tokenizer(prompt,return_tensors="pt",truncation=True,max_length=256).to(model.device)
                with torch.inference_mode():
                    model(**encoded)
            finally:
                handle.remove()
        if len(vectors)!=len(prompts):
            raise RuntimeError("ABLITERATION_ACTIVATION_COUNT_MISMATCH")
        return torch.cat(vectors).mean(dim=0)
    positive=mean_rep(positives)
    negative=mean_rep(negatives)
    direction=positive-negative
    norm=direction.norm()
    if not torch.isfinite(norm) or norm.item()<1e-8:
        raise RuntimeError("ABLITERATION_DIRECTION_DEGENERATE")
    direction=direction/norm
    output=Path(args.output)
    output.mkdir(parents=True,exist_ok=False)
    candidate=output/"refusal-direction.safetensors"
    save_file({"direction":direction.contiguous()},str(candidate))
    evidence={"status":"ABLITERATION_DIRECTION_ESTIMATED_UNBENCHMARKED",
       "base_model":data["base_model"],"layer":args.layer,
       "positive_count":len(positives),"negative_count":len(negatives),
       "positive_dataset_sha256":digest(args.positive),"negative_dataset_sha256":digest(args.negative),
       "direction_sha256":digest(candidate),"gpu_training_verified":True,
       "checkpoint_verified":False,"promoted":False,"activated":False,
       "note":"Direction only; no model modification, ablation, evaluation or promotion performed."}
    (output/"evidence.json").write_text(json.dumps(evidence,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(evidence,sort_keys=True))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ("config","positive","negative","output"):
        p.add_argument("--"+name,required=True)
    p.add_argument("--layer",type=int,default=10)
    run(p.parse_args())
