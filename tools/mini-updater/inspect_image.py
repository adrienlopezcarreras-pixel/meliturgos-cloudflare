#!/usr/bin/env python3
"""Offline ESP32-S3 application integrity preflight. No hardware access or flashing."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

ESP_IMAGE_MAGIC = 0xE9
ESP32S3_CHIP_ID = 9

def inspect_bytes(blob: bytes, filename: str = '<memory>'):
    if len(blob) < 24 or blob[0] != ESP_IMAGE_MAGIC:
        raise ValueError("ESP_IMAGE_HEADER_INVALID")
    count = blob[1]
    if not 1 <= count <= 16:
        raise ValueError("ESP_IMAGE_SEGMENTS_INVALID")
    chip_id = int.from_bytes(blob[12:14], "little")
    if chip_id != ESP32S3_CHIP_ID:
        raise ValueError("ESP_IMAGE_CHIP_ID_NOT_ESP32S3")
    appended = blob[23]
    if appended not in (0, 1):
        raise ValueError("ESP_IMAGE_HASH_FLAG_INVALID")

    offset = 24
    checksum = 0xEF
    segments = []
    for idx in range(count):
        if offset + 8 > len(blob):
            raise ValueError("ESP_IMAGE_TRUNCATED_SEGMENT_HEADER")
        address, size = struct.unpack_from("<II", blob, offset)
        offset += 8
        if size == 0 or size > len(blob) - offset:
            raise ValueError("ESP_IMAGE_TRUNCATED_SEGMENT_DATA")
        for value in blob[offset:offset + size]:
            checksum ^= value
        segments.append({"index": idx, "address": hex(address), "size": size})
        offset += size

    checksum_at = offset + ((15 - offset % 16) % 16)
    if checksum_at >= len(blob):
        raise ValueError("ESP_IMAGE_CHECKSUM_MISSING")
    if any(blob[offset:checksum_at]):
        raise ValueError("ESP_IMAGE_PADDING_NONZERO")
    if blob[checksum_at] != checksum:
        raise ValueError("ESP_IMAGE_CHECKSUM_INVALID")
    body_end = checksum_at + 1
    if appended:
        if len(blob) != body_end + 32:
            raise ValueError("ESP_IMAGE_HASH_LENGTH_INVALID")
        if blob[body_end:] != hashlib.sha256(blob[:body_end]).digest():
            raise ValueError("ESP_IMAGE_EMBEDDED_SHA256_INVALID")
    elif len(blob) != body_end:
        raise ValueError("ESP_IMAGE_TRAILING_DATA")

    return {"file": filename, "size_bytes": len(blob),
            "sha256": hashlib.sha256(blob).hexdigest(),
            "chip_id": chip_id, "segment_count": count,
            "segments": segments, "checksum_valid": True,
            "embedded_sha256_valid": bool(appended),
            "structurally_valid": True, "flash_allowed": False}

def inspect(path: Path):
    return inspect_bytes(path.read_bytes(), path.name)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("firmware", type=Path)
    args = p.parse_args()
    print(json.dumps(inspect(args.firmware), indent=2))
if __name__ == "__main__":
    main()
