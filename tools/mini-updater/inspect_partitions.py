#!/usr/bin/env python3
"""Read-only offline ESP-IDF partition-table inspector. Never accesses a serial port."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

ENTRY_MAGIC = b"\xaa\x50"
MD5_MAGIC = b"\xeb\xeb"
ENTRY_SIZE = 32

def inspect(data: bytes):
    if len(data) < ENTRY_SIZE or len(data) % ENTRY_SIZE:
        raise ValueError("PARTITION_TABLE_LENGTH_INVALID")
    entries = []
    seen = set()
    for pos in range(0, len(data), ENTRY_SIZE):
        entry = data[pos:pos + ENTRY_SIZE]
        if entry == b"\xff" * ENTRY_SIZE:
            break
        if entry[:2] == MD5_MAGIC:
            if entry[2:16] not in (bytes(14), b"\xff" * 14) or entry[16:32] != hashlib.md5(data[:pos]).digest():
                raise ValueError("PARTITION_TABLE_MD5_INVALID")
            if any(byte != 0xff for byte in data[pos + ENTRY_SIZE:]):
                raise ValueError("PARTITION_TABLE_TRAILING_DATA")
            break
        if entry[:2] != ENTRY_MAGIC:
            raise ValueError("PARTITION_TABLE_MAGIC_INVALID")
        _magic, kind, subtype, offset, size, label, flags = struct.unpack("<2sBBII16sI", entry)
        name = label.split(b"\x00", 1)[0].decode("ascii", "strict")
        if not name or size == 0 or offset % 4096 or size % 4096:
            raise ValueError("PARTITION_ENTRY_INVALID")
        if offset + size > 0x100000000:
            raise ValueError("PARTITION_RANGE_INVALID")
        if name in seen:
            raise ValueError("PARTITION_LABEL_DUPLICATE")
        seen.add(name)
        entries.append({"name": name, "type": kind, "subtype": subtype,
                        "offset": offset, "size": size, "flags": flags})
    if not entries:
        raise ValueError("PARTITION_TABLE_EMPTY")
    ordered = sorted(entries, key=lambda item: item["offset"])
    for first, second in zip(ordered, ordered[1:]):
        if first["offset"] + first["size"] > second["offset"]:
            raise ValueError("PARTITION_OVERLAP")
    return {"valid": True, "read_only": True, "flash_allowed": False, "partitions": entries}

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dump", type=Path, help="existing binary partition dump; no serial commands")
    args = ap.parse_args()
    print(json.dumps(inspect(args.dump.read_bytes()), indent=2))
if __name__ == "__main__":
    main()
