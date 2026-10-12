#!/usr/bin/env python3
"""Offline ESP32-S3 image header preflight. Never accesses hardware or writes flash."""
import argparse
import hashlib
import json
from pathlib import Path

ESP_IMAGE_MAGIC = 0xE9
ESP32S3_CHIP_ID = 9

def inspect(path: Path):
    blob = path.read_bytes()
    if len(blob) < 24 or blob[0] != ESP_IMAGE_MAGIC:
        raise ValueError("ESP_IMAGE_HEADER_INVALID")
    segments = blob[1]
    if segments < 1 or segments > 16:
        raise ValueError("ESP_IMAGE_SEGMENTS_INVALID")
    chip_id = int.from_bytes(blob[12:14], "little")
    if chip_id != ESP32S3_CHIP_ID:
        raise ValueError("ESP_IMAGE_CHIP_ID_NOT_ESP32S3")
    return {"file": path.name, "size_bytes": len(blob),
            "sha256": hashlib.sha256(blob).hexdigest(),
            "chip_id": chip_id, "segment_count": segments,
            "header_valid": True, "flash_allowed": False}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("firmware", type=Path)
    args = p.parse_args()
    print(json.dumps(inspect(args.firmware), indent=2))
if __name__ == "__main__":
    main()
