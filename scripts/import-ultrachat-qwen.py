#!/usr/bin/env python3
"""Select a reproducible bounded sample of UltraChat parquet rows into Qwen messages JSONL.
Does not assert license approval, publish data, dispatch GPU, or activate a model.
"""
import argparse
import hashlib
import json
from pathlib import Path

def digest(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for part in iter(lambda:f.read(1024*1024),b""):h.update(part)
    return "sha256:"+h.hexdigest()

def convert_rows(rows,source_sha,limit=1000):
    if not isinstance(source_sha,str) or len(source_sha)!=71 or not source_sha.startswith("sha256:") or any(ch not in "0123456789abcdef" for ch in source_sha[7:]):
        raise ValueError("QWEN_SOURCE_SHA_INVALID")
    if not 50<=limit<=50000:raise ValueError("QWEN_LIMIT_INVALID")
    output=[];seen=set()
    for item in rows:
        messages=item.get("messages") if isinstance(item,dict) else None
        if not isinstance(messages,list) or not 2<=len(messages)<=40:continue
        if any(not isinstance(m,dict) or m.get("role") not in ("user","assistant","system")
               or not isinstance(m.get("content"),str) or not m["content"].strip()
               or len(m["content"])>32000 for m in messages):continue
        if not any(m["role"]=="user" for m in messages) or not any(m["role"]=="assistant" for m in messages):continue
        canonical={"messages":[{"role":m["role"],"content":m["content"]} for m in messages]}
        encoded=json.dumps(canonical,sort_keys=True,ensure_ascii=False)
        key=hashlib.sha256(encoded.encode()).hexdigest()
        if key not in seen:
            seen.add(key);output.append(canonical)
        if len(output)>=limit:break
    if len(output)<50:raise ValueError("QWEN_TOO_FEW_VALID_EXAMPLES")
    return output

def main(args):
    import pyarrow.parquet as pq
    source=Path(args.parquet)
    if not source.is_file():raise ValueError("QWEN_SOURCE_MISSING")
    output=Path(args.output)
    if output.exists():raise FileExistsError("QWEN_OUTPUT_EXISTS")
    actual_sha=digest(source)
    if args.expected_sha256 and actual_sha!=args.expected_sha256:
        raise ValueError("QWEN_SOURCE_SHA_MISMATCH")
    iterator=pq.ParquetFile(source).iter_batches(batch_size=256,columns=["messages"])
    def rows():
        for batch in iterator:
            yield from batch.to_pylist()
    selected=convert_rows(rows(),actual_sha,args.limit)
    output.parent.mkdir(parents=True,exist_ok=True)
    lines=[json.dumps(row,sort_keys=True,ensure_ascii=False)+"\n" for row in selected]
    if sum(len(line.encode("utf-8")) for line in lines)>20_000_000:
        raise ValueError("QWEN_CORPUS_EXCEEDS_KAGGLE_PREFLIGHT_LIMIT")
    with output.open("w",encoding="utf-8") as fh:
        fh.writelines(lines)
    print(json.dumps({"status":"QWEN_UNREVIEWED_SOURCE_CONVERTED_NOT_PUBLISHED",
      "origin":"HuggingFaceH4/ultrachat_200k","source_parquet_sha256":actual_sha,
      "dataset_sha256":digest(output),"examples":len(selected),"license_review_passed":False,
      "gpu_training_performed":False},sort_keys=True))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--parquet",required=True)
    p.add_argument("--output",required=True)
    p.add_argument("--limit",type=int,default=1000)
    p.add_argument("--expected-sha256",help="Required SHA-256 provenance gate when a revision is pinned")
    main(p.parse_args())
