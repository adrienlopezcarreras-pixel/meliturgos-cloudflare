#!/usr/bin/env python3
"""Fail-closed, read-only OTA backup job for the MINI. No erase/write operations."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from inspect_partitions import inspect
from inspect_ota_state import analyze
from inspect_ota_backup import inspect_backup

PINNED_ESPTOOL_SHA256 = "069db0f1e4d8f929f36d0f60243499eb670626c03a686376728998aaaad2f664"
MAX_BACKUP_BYTES = 16 * 1024 * 1024

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def atomic_status(folder, **state):
    p = folder / "status.json"
    tmp = folder / "status.json.tmp"
    tmp.write_text(json.dumps(dict(schema="mel-mini-ota-backup-job-v1", **state), indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, p)

def read_flash(exe, port, offset, size, destination, stage=None):
    if destination.exists():
        raise ValueError("REFUSING_TO_OVERWRITE_BACKUP")
    args = [str(exe), "--chip", "esp32s3", "--port", port,
            "--before", "default_reset", "--after", "no_reset",
            "read_flash", hex(offset), hex(size), str(destination)]
    log = destination.parent / ((stage or destination.stem) + ".esptool.log")
    with log.open("x", encoding="utf-8") as output:
        output.write("stage=" + (stage or destination.stem) + " offset=" + hex(offset) + " bytes=" + str(size) + "\\n")
        output.flush()
        try:
            result = subprocess.run(args, stdout=output, stderr=subprocess.STDOUT, timeout=180, check=False)
        except subprocess.TimeoutExpired:
            output.write("\\nESPTOOL_READ_TIMEOUT\\n")
            raise
        if result.returncode:
            output.write("\\nESPTOOL_READ_FAILED_" + str(result.returncode) + "\\n")
            raise RuntimeError("ESPTOOL_READ_FAILED_" + str(result.returncode))
    if not destination.is_file() or destination.stat().st_size != size:
        raise ValueError("READBACK_SIZE_MISMATCH")
    return digest(destination)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--esptool", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ack-bootloader-reset", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"COM\d{1,3}", args.port.upper()):
        parser.error("Expected COM<number>")
    if not args.ack_bootloader_reset:
        parser.error("Connection may reset MINI: explicit --ack-bootloader-reset required")
    if not args.esptool.is_file() or digest(args.esptool) != PINNED_ESPTOOL_SHA256:
        parser.error("Pinned esptool SHA-256 mismatch")
    # A unique directory prevents clobbering prior proof.
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.time()
    state = {"state": "RUNNING", "port": args.port.upper(), "flash_performed": False,
             "flash_allowed": False, "started_at": started}
    atomic_status(args.output, **state)
    try:
        part_dump = args.output / "partitions.bin"
        state["stage"] = "PARTITIONS"; atomic_status(args.output, **state)
        read_flash(args.esptool, args.port.upper(), 0x8000, 0x1000, part_dump, "partitions")
        parts = inspect(part_dump.read_bytes())["partitions"]
        metadata = [p for p in parts if p["type"] == 1 and p["subtype"] == 0]
        if len(metadata) != 1 or metadata[0]["size"] != 8192:
            raise ValueError("OTA_METADATA_PARTITION_INVALID")
        ota = args.output / "otadata.bin"
        state["stage"] = "OTADATA"; atomic_status(args.output, **state)
        read_flash(args.esptool, args.port.upper(), metadata[0]["offset"], 8192, ota, "otadata")
        proof = analyze(part_dump.read_bytes(), ota.read_bytes())
        if proof["selected_boot_slot_from_otadata"] != "ota_0":
            raise ValueError("OTA_0_NOT_PROVEN_SELECTED_NO_BACKUP_ATTEMPTED")
        slots = [p for p in parts if p["type"] == 0 and p["name"] == "ota_0"
                 and p["subtype"] == 0x10]
        if len(slots) != 1 or not 0 < slots[0]["size"] <= MAX_BACKUP_BYTES:
            raise ValueError("OTA_0_PARTITION_INVALID")
        state["partition_offset"] = hex(slots[0]["offset"])
        state["partition_size_bytes"] = slots[0]["size"]
        atomic_status(args.output, **state)
        target = args.output / "ota_0.bin"
        state["stage"] = "OTA_0"; atomic_status(args.output, **state)
        sha = read_flash(args.esptool, args.port.upper(), slots[0]["offset"], slots[0]["size"], target, "ota_0")
        verification = inspect_backup(part_dump.read_bytes(), ota.read_bytes(), target.read_bytes())
        if not verification["app_structure_valid"] or not verification["app_checksum_valid"] or not verification["app_embedded_sha256_valid"]:
            raise ValueError("BACKUP_IMAGE_INTEGRITY_UNVERIFIED")
        (args.output / "verification.json").write_text(json.dumps(verification, indent=2) + "\n", encoding="utf-8")
        atomic_status(args.output, **dict(state, state="SUCCESS", finished_at=time.time(),
                                          backup_bytes=target.stat().st_size, backup_sha256=sha,
                                          backup_path=str(target), evidence_path=str(args.output / "verification.json")))
        print(json.dumps({"status": "SUCCESS", "evidence_path": str(args.output / "status.json"),
                          "backup_sha256": sha, "backup_bytes": target.stat().st_size,
                          "flash_performed": False}))
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
        atomic_status(args.output, **dict(state, state="FAILED", finished_at=time.time(),
                                          error=type(exc).__name__ + ": " + str(exc),
                                          last_stage=state.get("stage")))
        print(json.dumps({"status": "FAILED", "code": type(exc).__name__,
                          "evidence_path": str(args.output / "status.json"),
                          "flash_performed": False}), file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
