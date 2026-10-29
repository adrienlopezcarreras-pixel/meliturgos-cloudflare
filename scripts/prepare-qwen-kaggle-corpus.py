#!/usr/bin/env python3
"""Make a locally reviewed Qwen Kaggle corpus; refuses unapproved licensing.
No network, upload, GPU, promotion or training. Input rows use messages schema.
"""
import argparse
import hashlib
import json
from pathlib import Path
from importlib.machinery import SourceFileLoader

def digest(file):
    h=hashlib.sha256()
    with open(file,"rb") as handle:
        for block in iter(lambda:handle.read(1024*1024),b""):h.update(block)
    return "sha256:"+h.hexdigest()

def pack(input_path,output_dir,license_review_path):
    source=Path(input_path)
    approval=json.loads(Path(license_review_path).read_text(encoding="utf-8"))
    if (not isinstance(approval,dict) or approval.get("license_review_passed") is not True
        or not isinstance(approval.get("source_id"),str) or not approval["source_id"].strip()
        or not isinstance(approval.get("revision"),str) or not approval["revision"].strip()
        or not isinstance(approval.get("license"),str) or not approval["license"].strip()
        or approval.get("input_sha256")!=digest(source)):
        raise ValueError("QWEN_SOURCE_LICENSE_OR_HASH_REVIEW_REQUIRED")
    trainer=SourceFileLoader("qwen_trainer",str(Path(__file__).with_name("train-qwen3-lora.py"))).load_module()
    rows=trainer.read_corpus(source)
    encoded=[json.dumps(row,ensure_ascii=False,sort_keys=True)+"\n" for row in rows]
    if sum(len(line.encode("utf-8")) for line in encoded)>20_000_000:
        raise ValueError("QWEN_PACKAGED_DATASET_EXCEEDS_KAGGLE_LIMIT")
    out=Path(output_dir)
    if out.exists():
        raise FileExistsError("QWEN_OUTPUT_MUST_NOT_EXIST")
    out.mkdir(parents=True)
    dataset=out/"dataset.jsonl"
    with dataset.open("w",encoding="utf-8") as fh:
        fh.writelines(encoded)
    manifest={"dataset_sha256":digest(dataset),"license_review_passed":True,
        "sources":[{"id":approval["source_id"],"revision":approval["revision"],
                    "license":approval["license"],"original_sha256":digest(source)}]}
    (out/"sources.json").write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    trainer.validate_manifest(out/"sources.json",digest(dataset))
    return {"status":"QWEN_CORPUS_PREPARED_NOT_PUBLISHED","rows":len(rows),
            "dataset_sha256":digest(dataset),"manifest_sha256":digest(out/"sources.json"),
            "kaggle_published":False,"gpu_training_performed":False}
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True)
    p.add_argument("--output",required=True)
    p.add_argument("--license-review",required=True)
    a=p.parse_args()
    print(json.dumps(pack(a.input,a.output,a.license_review),sort_keys=True))
