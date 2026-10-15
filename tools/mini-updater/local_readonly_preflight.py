#!/usr/bin/env python3
"""Attended ESP32-S3 USB readback: partitions and OTA selection. Never flashes."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

from inspect_partitions import inspect
from inspect_ota_state import analyze

PARTITION_BYTES = 4096
OTA_BYTES = 8192


def digest(data):
    return hashlib.sha256(data).hexdigest()


def probe(common, name, operation, evidence):
    try:
        completed = subprocess.run(common + operation, capture_output=True,
                                   text=True, timeout=75, check=False)
        row = {"exit_code": completed.returncode,
               "stdout": completed.stdout[-6000:],
               "stderr": completed.stderr[-3000:]}
    except (subprocess.TimeoutExpired, OSError) as exc:
        row = {"exit_code": -1, "error": type(exc).__name__}
    evidence[name] = row
    return row["exit_code"] == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Operator-confirmed ESP32-S3 COM port")
    parser.add_argument("--output", type=Path, required=True, help="Fresh directory for readback evidence")
    parser.add_argument("--firmware", type=Path, help="Candidate image SHA-256 only (not flashed)")
    parser.add_argument("--ack-bootloader", action="store_true",
                        help="Explicit approval to connect to bootloader; may reset USB board")
    args = parser.parse_args()
    port = args.port.upper()
    if not re.fullmatch(r"COM[0-9]{1,3}", port):
        parser.error("Expected COM<number>")
    if not args.ack_bootloader:
        parser.error("Bootloader access can reset the board: --ack-bootloader required")
    dump = args.output / "partitions-0x8000.bin"
    ota_dump = args.output / "otadata.bin"
    report = args.output / "preflight.json"
    if any(p.exists() for p in (dump, ota_dump, report)):
        parser.error("Existing partition dump or OTA evidence: use a fresh output directory")
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = {"schema": "mel-mini-live-readonly-preflight/v2",
                "port": port, "read_only": True, "flash_allowed": False,
                "flash_performed": False, "board_may_reset_on_bootloader": True,
                "running_slot_verified_on_device": False, "ota_slot_from_metadata": None}
    if args.firmware:
        candidate = args.firmware.read_bytes()
        evidence["candidate"] = {"file": args.firmware.name, "bytes": len(candidate),
                                 "sha256": digest(candidate)}
    # Every attended read ends with a normal boot attempt, including
    # failed/incomplete preflights. --after no_reset strands the board in
    # ROM/stub bootloader mode; this preflight must not silently leave MEL offline.
    # v4 underscore names are still accepted by esptool v5 (deprecated there).
    common = [sys.executable, "-m", "esptool", "--chip", "esp32s3",
              "--port", port, "--before", "default_reset", "--after", "hard_reset"]
    ready = False
    try:
        if not probe(common, "chip_id", ["chip_id"], evidence):
            evidence["error"] = "MINI_CHIP_PROBE_FAILED"
        elif not probe(common, "flash_id", ["flash_id"], evidence):
            evidence["error"] = "MINI_FLASH_ID_FAILED"
        elif not probe(common, "partition_readback",
                       ["read_flash", "0x8000", "0x1000", str(dump)], evidence):
            evidence["error"] = "MINI_PARTITION_READ_FAILED"
        elif not dump.is_file() or dump.stat().st_size != PARTITION_BYTES:
            evidence["error"] = "MINI_PARTITION_READBACK_SIZE_INVALID"
        else:
            partitions = dump.read_bytes()
            evidence["partition_readback"]["sha256"] = digest(partitions)
            evidence["partition_readback"]["bytes"] = len(partitions)
            table = inspect(partitions)
            evidence["partition_table"] = table
            metadata = [p for p in table["partitions"]
                        if p["type"] == 1 and p["subtype"] == 0]
            if len(metadata) != 1 or metadata[0]["size"] != OTA_BYTES:
                evidence["error"] = "MINI_OTADATA_PARTITION_LAYOUT_INVALID"
            else:
                entry = metadata[0]
                if not probe(common, "ota_readback",
                             ["read_flash", hex(entry["offset"]), hex(OTA_BYTES),
                              str(ota_dump)], evidence):
                    evidence["error"] = "MINI_OTADATA_READ_FAILED"
                elif not ota_dump.is_file() or ota_dump.stat().st_size != OTA_BYTES:
                    evidence["error"] = "MINI_OTADATA_READBACK_SIZE_INVALID"
                else:
                    ota_data = ota_dump.read_bytes()
                    evidence["ota_readback"]["sha256"] = digest(ota_data)
                    evidence["ota_readback"]["bytes"] = len(ota_data)
                    selection = analyze(partitions, ota_data)
                    evidence["ota_selection"] = selection
                    evidence["ota_slot_from_metadata"] = selection["selected_boot_slot_from_otadata"]
                    ready = (selection["selected_boot_slot_from_otadata"] in ("ota_0", "ota_1")
                             and selection["alternative_slot"] in ("ota_0", "ota_1")
                             and selection["selected_boot_slot_from_otadata"] != selection["alternative_slot"])
                    if not ready:
                        evidence["error"] = "MINI_OTA_SLOT_AMBIGUOUS"
    except (ValueError, UnicodeError, OSError, KeyError, TypeError) as exc:
        evidence["error"] = "MINI_PREFLIGHT_INVALID:" + type(exc).__name__ + ":" + str(exc)[:160]
    # Metadata is not proof of the currently executing slot or rollback ability.
    evidence["partition_valid"] = bool(evidence.get("partition_table", {}).get("valid"))
    evidence["ota_metadata_unambiguous"] = bool(ready)
    evidence["next_required_proof"] = "LIVE_RUNNING_SLOT_SECURITY_BACKUP_AND_RECOVERY"
    report.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"evidence": str(report),
                      "partition_dump": dump.is_file(),
                      "partition_valid": evidence["partition_valid"],
                      "ota_metadata_unambiguous": ready,
                      "ota_slot_from_metadata": evidence["ota_slot_from_metadata"],
                      "running_slot_verified_on_device": False,
                      "flash_allowed": False, "flash_performed": False}))
    return 0 if ready else 2


if __name__ == "__main__":
    raise SystemExit(main())
