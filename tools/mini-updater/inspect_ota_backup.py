#!/usr/bin/env python3
"""Validate an ESP32-S3 OTA app backup offline, without any hardware or flash writes."""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from inspect_image import inspect_bytes
from inspect_ota_state import analyze

def app_span(blob: bytes) -> int:
    """Infer the ESP image end only for subsequently verifying its full integrity."""
    if len(blob) < 24 or blob[0] != 0xE9 or not 1 <= blob[1] <= 16:
        raise ValueError('OTA_BACKUP_APP_HEADER_INVALID')
    pos = 24
    for _ in range(blob[1]):
        if pos + 8 > len(blob):
            raise ValueError('OTA_BACKUP_SEGMENT_HEADER_TRUNCATED')
        _, n = struct.unpack_from('<II', blob, pos)
        pos += 8
        if n == 0 or n > len(blob) - pos:
            raise ValueError('OTA_BACKUP_SEGMENT_DATA_TRUNCATED')
        pos += n
    checksum_at = pos + ((15 - pos % 16) % 16)
    total = checksum_at + 1 + (32 if blob[23] == 1 else 0)
    if total > len(blob):
        raise ValueError('OTA_BACKUP_APP_TRUNCATED')
    return total

def inspect_backup(parts: bytes, ota: bytes, dump: bytes, slot: str = 'ota_0') -> dict:
    proof = analyze(parts, ota)
    if proof['selected_boot_slot_from_otadata'] != slot:
        raise ValueError('OTA_BACKUP_SOURCE_NOT_SELECTED_BY_METADATA')
    slot_partitions = [p for p in __import__('inspect_partitions').inspect(parts)['partitions']
                       if p['type'] == 0 and p['name'] == slot]
    if len(slot_partitions) != 1:
        raise ValueError('OTA_BACKUP_PARTITION_NOT_FOUND')
    app_part = slot_partitions[0]
    if len(dump) != app_part['size']:
        raise ValueError('OTA_BACKUP_SIZE_MISMATCH')
    length = app_span(dump)
    image = inspect_bytes(dump[:length], filename=slot + '-extracted-image')
    return {
        'schema': 'mel-mini-ota-backup-readonly-v1',
        'source_slot': slot,
        'partition_offset': hex(app_part['offset']),
        'partition_size_bytes': app_part['size'],
        'full_backup_sha256': hashlib.sha256(dump).hexdigest(),
        'app_image_sha256': image['sha256'],
        'app_image_size_bytes': length,
        'app_chip_id': image['chip_id'],
        'app_checksum_valid': image['checksum_valid'],
        'app_embedded_sha256_valid': image['embedded_sha256_valid'],
        'app_structure_valid': image['structurally_valid'],
        'trailing_bytes_all_ff': all(b == 0xFF for b in dump[length:]),
        'ota_metadata_selection': slot,
        'running_slot_verified': False,
        'rollback_tested': False,
        'security_configuration_verified': False,
        'flash_allowed': False,
        'flash_performed': False,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--partitions', required=True, type=Path)
    parser.add_argument('--otadata', required=True, type=Path)
    parser.add_argument('--backup', required=True, type=Path)
    parser.add_argument('--slot', choices=('ota_0', 'ota_1'), default='ota_0')
    args = parser.parse_args()
    try:
        result = inspect_backup(args.partitions.read_bytes(), args.otadata.read_bytes(),
                                args.backup.read_bytes(), args.slot)
    except ValueError as exc:
        print(json.dumps({'valid': False, 'error': str(exc), 'flash_allowed': False}), file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
