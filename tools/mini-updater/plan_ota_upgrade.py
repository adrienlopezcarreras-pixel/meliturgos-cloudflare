#!/usr/bin/env python3
"""Offline MINI OTA upgrade assessment. Never connects, resets, writes or flashes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from inspect_partitions import inspect as inspect_partitions
from inspect_ota_backup import inspect_backup
from inspect_ota_state import analyze as inspect_ota
from inspect_image import inspect_bytes as inspect_image_bytes

MAX_APP_BYTES = 16 * 1024 * 1024
HEX_SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def read_limited(path: Path, maximum: int) -> bytes:
    if not path.is_file() or not 0 < path.stat().st_size <= maximum:
        raise ValueError("MINI_PROOF_FILE_MISSING_OR_SIZE_INVALID:" + path.name)
    content = path.read_bytes()
    if not 0 < len(content) <= maximum:
        raise ValueError('MINI_PROOF_FILE_CHANGED_DURING_READ:' + path.name)
    return content


def prepare(backup_dir: Path, firmware: Path, expected_sha256: str) -> dict:
    if not HEX_SHA256.fullmatch(expected_sha256):
        raise ValueError("MINI_EXPECTED_FIRMWARE_SHA256_REQUIRED")

    # Never trust a claimed SUCCESS without matching the bytes on disk.
    status = json.loads(read_limited(backup_dir / "status.json", 131072).decode("utf-8"))
    if status.get("schema") != "mel-mini-ota-backup-job-v1" or status.get("state") != "SUCCESS":
        raise ValueError("MINI_BACKUP_NOT_SUCCESSFULLY_COMPLETED")
    if status.get("flash_performed") is not False or status.get("flash_allowed") is not False:
        raise ValueError("MINI_BACKUP_JOB_MUTATION_FLAG_UNSAFE")

    partitions = read_limited(backup_dir / "partitions.bin", 4096)
    otadata = read_limited(backup_dir / "otadata.bin", 8192)
    previous_image = read_limited(backup_dir / "ota_0.bin", MAX_APP_BYTES)
    original_sha = sha256(previous_image)
    if str(status.get("backup_sha256", "")).lower() != original_sha or status.get("backup_bytes") != len(previous_image):
        raise ValueError("MINI_BACKUP_SHA256_OR_SIZE_MISMATCH")

    proof_saved = json.loads(read_limited(backup_dir / "verification.json", 131072).decode("utf-8"))
    parsed = inspect_backup(partitions, otadata, previous_image, "ota_0")
    proof_fields = (
        "full_backup_sha256", "app_image_sha256", "app_image_size_bytes",
        "partition_size_bytes", "partition_offset", "source_slot",
        "app_structure_valid", "app_checksum_valid",
        "app_embedded_sha256_valid", "trailing_bytes_all_ff",
        "ota_metadata_selection",
    )
    if any(proof_saved.get(key) != parsed.get(key) for key in proof_fields):
        raise ValueError("MINI_BACKUP_SAVED_VERIFICATION_DISAGREES_WITH_BYTES")
    if not all(parsed.get(k) is True for k in (
        "app_structure_valid", "app_checksum_valid", "app_embedded_sha256_valid",
        "trailing_bytes_all_ff",
    )):
        raise ValueError("MINI_BACKUP_APP_INTEGRITY_NOT_PROVEN")

    ota_proof = inspect_ota(partitions, otadata)
    if ota_proof["selected_boot_slot_from_otadata"] != "ota_0":
        raise ValueError("MINI_OTA_SOURCE_NOT_PROVEN_SELECTED")
    if ota_proof["alternative_slot"] != "ota_1":
        raise ValueError("MINI_OTA_INACTIVE_SLOT_NOT_PROVEN")
    slots = [p for p in inspect_partitions(partitions)["partitions"]
             if p["type"] == 0 and p["name"] == "ota_1" and p["subtype"] == 0x11]
    if len(slots) != 1:
        raise ValueError("MINI_INACTIVE_PARTITION_LAYOUT_INVALID")
    inactive = slots[0]
    current_slots = [p for p in inspect_partitions(partitions)["partitions"]
                     if p["type"] == 0 and p["name"] == "ota_0" and p["subtype"] == 0x10]
    if len(current_slots) != 1:
        raise ValueError("MINI_CURRENT_PARTITION_LAYOUT_INVALID")
    if status.get("partition_offset") != hex(current_slots[0]["offset"]) or status.get("partition_size_bytes") != current_slots[0]["size"]:
        raise ValueError("MINI_BACKUP_PARTITION_METADATA_MISMATCH")

    fw = read_limited(firmware, MAX_APP_BYTES)
    actual_fw_sha256 = sha256(fw)
    if actual_fw_sha256 != expected_sha256.lower():
        raise ValueError("MINI_FIRMWARE_SHA256_MISMATCH")
    image = inspect_image_bytes(fw, filename=firmware.name)
    if image["chip_id"] != 9 or image.get("embedded_sha256_valid") is not True or image.get("checksum_valid") is not True:
        raise ValueError("MINI_FIRMWARE_CHIP_OR_INTEGRITY_UNVERIFIED")
    if image["size_bytes"] > inactive["size"]:
        raise ValueError("MINI_FIRMWARE_EXCEEDS_INACTIVE_PARTITION")

    return {
        "schema": "mel-mini-ota-write-plan/v1",
        "status": "OFFLINE_PLAN_VERIFIED_FLASH_BLOCKED",
        "partition_table_sha256": sha256(partitions),
        "otadata_sha256": sha256(otadata),
        "current_slot_from_metadata": "ota_0",
        "inactive_slot_candidate": "ota_1",
        "inactive_offset": hex(inactive["offset"]),
        "inactive_size_bytes": inactive["size"],
        "existing_backup_sha256": original_sha,
        "existing_backup_size_bytes": len(previous_image),
        "candidate_firmware_sha256": actual_fw_sha256,
        "candidate_firmware_size_bytes": image["size_bytes"],
        "backup_verified_offline": True,
        "firmware_verified_offline": True,
        "running_slot_verified_on_device": False,
        "flash_encryption_and_secure_boot_verified": False,
        "bootloader_compatibility_verified": False,
        "ota_rollback_on_real_device_verified": False,
        "operator_present": False,
        "flash_allowed": False,
        "flash_performed": False,
        "next_required_proof": "PHYSICAL_CHIP_SECURITY_RUNNING_SLOT_AND_RECOVERY",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-dir", type=Path, required=True)
    parser.add_argument("--firmware", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    args = parser.parse_args()
    try:
        result = prepare(args.backup_dir, args.firmware, args.expected_sha256)
    except (ValueError, OSError, KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL_CLOSED", "reason": str(exc),
                          "flash_allowed": False, "flash_performed": False}), file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
