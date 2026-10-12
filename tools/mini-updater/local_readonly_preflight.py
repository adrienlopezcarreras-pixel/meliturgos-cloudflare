#!/usr/bin/env python3
"""Explicitly local, read-only ESP32-S3 preflight; no flash writes or resets on startup."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from inspect_partitions import inspect

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Operator-confirmed ESP32-S3 COM port")
    parser.add_argument("--output", type=Path, required=True, help="Directory for readback evidence")
    parser.add_argument("--firmware", type=Path, help="Candidate image for SHA-256 only")
    parser.add_argument("--ack-bootloader", action="store_true",
                        help="Explicit approval to connect to bootloader; may reset USB board")
    args = parser.parse_args()
    if not args.port.upper().startswith("COM") or not args.port[3:].isdigit():
        parser.error("Expected COM<number>")
    if not args.ack_bootloader:
        parser.error("Bootloader access can reset the board: --ack-bootloader required")
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = {"port": args.port.upper(), "read_only": True, "flash_allowed": False}
    if args.firmware:
        image = args.firmware.read_bytes()
        evidence["candidate"] = {"file": args.firmware.name, "bytes": len(image),
                                 "sha256": hashlib.sha256(image).hexdigest()}
    common = [sys.executable, "-m", "esptool", "--chip", "esp32s3",
              "--port", args.port.upper(), "--before", "default_reset",
              "--after", "no_reset"]
    dump = args.output / "partitions-0x8000.bin"
    if dump.exists():
        parser.error("Existing partition dump: use a fresh output directory")
    commands = [
        ("chip_id", ["chip_id"]),
        ("flash_id", ["flash_id"]),
        ("partition_readback", ["read_flash", "0x8000", "0x1000",
                                str(args.output / "partitions-0x8000.bin")]),
    ]
    for name, operation in commands:
        completed = subprocess.run(common + operation, capture_output=True,
                                   text=True, timeout=75, check=False)
        evidence[name] = {"exit_code": completed.returncode,
                          "stdout": completed.stdout[-6000:],
                          "stderr": completed.stderr[-3000:]}
        if completed.returncode:
            break
    valid_dump = False
    if dump.is_file() and evidence.get("partition_readback", {}).get("exit_code") == 0:
        data = dump.read_bytes()
        evidence["partition_readback"]["sha256"] = hashlib.sha256(data).hexdigest()
        evidence["partition_readback"]["bytes"] = len(data)
        try:
            evidence["partition_table"] = inspect(data)
            valid_dump = True
        except (ValueError, UnicodeError) as exc:
            evidence["partition_table"] = {"valid": False, "error": str(exc)}
    (args.output / "preflight.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(json.dumps({"evidence": str(args.output / "preflight.json"),
                      "partition_dump": dump.is_file(), "partition_valid": valid_dump, "flash_performed": False}))
    return 0 if valid_dump else 2

if __name__ == "__main__":
    raise SystemExit(main())
