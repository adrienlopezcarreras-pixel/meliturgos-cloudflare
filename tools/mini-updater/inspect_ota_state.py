#!/usr/bin/env python3
"""Offline, read-only ESP32-S3 OTA-selection preflight; never writes or flashes."""
import argparse
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path
from inspect_partitions import inspect as inspect_partitions
from inspect_image import inspect as inspect_image

OTA_ENTRY_SIZE = 32
OTA_SECTOR_SIZE = 4096
OTA_STATES = {0: 'NEW', 1: 'PENDING_VERIFY', 2: 'VALID', 3: 'INVALID', 4: 'ABORTED', 0xFFFFFFFF: 'UNDEFINED'}


def decode_sector(data: bytes, index: int) -> dict:
    sector = data[index * OTA_SECTOR_SIZE: (index + 1) * OTA_SECTOR_SIZE]
    entry = sector[:OTA_ENTRY_SIZE]
    if sector == b'\xff' * OTA_SECTOR_SIZE:
        return {'sector': index, 'status': 'ERASED'}
    if entry == b'\xff' * OTA_ENTRY_SIZE:
        return {'sector': index, 'status': 'UNEXPECTED_NONERASED_TAIL'}
    seq, = struct.unpack_from('<I', entry)
    state, crc = struct.unpack_from('<II', entry, 24)
    computed = zlib.crc32(entry[:4], 0xFFFFFFFF)
    result = {'sector': index, 'sequence': seq, 'state': OTA_STATES.get(state, 'UNKNOWN'),
              'state_code': state, 'crc_valid': crc == computed}
    if seq in (0, 0xFFFFFFFF) or crc != computed or state != 2 or any(v != 0xff for v in sector[OTA_ENTRY_SIZE:]):
        result['status'] = 'NOT_BOOT_APPROVED'
    else:
        result['status'] = 'BOOT_SELECTABLE'
    return result


def analyze(partitions_data: bytes, otadata: bytes, firmware: Path | None = None, expected_sha256: str | None = None) -> dict:
    if len(otadata) != 2 * OTA_SECTOR_SIZE:
        raise ValueError('OTA_DATA_SIZE_INVALID')
    table = inspect_partitions(partitions_data)
    parts = table['partitions']
    ota_meta = [p for p in parts if p['type'] == 1 and p['subtype'] == 0]
    if len(ota_meta) != 1 or ota_meta[0]['size'] != len(otadata):
        raise ValueError('OTA_DATA_PARTITION_INVALID')
    ota_slots = {p['subtype'] - 0x10: p for p in parts if p['type'] == 0 and 0x10 <= p['subtype'] <= 0x1F}
    if set(ota_slots) != set(range(len(ota_slots))) or len(ota_slots) < 2:
        raise ValueError('OTA_APP_PARTITIONS_INVALID')
    metadata = [decode_sector(otadata, i) for i in range(2)]
    selectable = [entry for entry in metadata if entry['status'] == 'BOOT_SELECTABLE']
    erased = [entry for entry in metadata if entry['status'] == 'ERASED']
    selected = None
    alternative = None
    selection_reason = 'OTA_SELECTION_AMBIGUOUS_OR_UNVERIFIED'
    # Fail closed except for exactly one VALID record plus one wholly erased sector.
    if len(selectable) == 1 and len(erased) == 1:
        active_index = (selectable[0]['sequence'] - 1) % len(ota_slots)
        selected = 'ota_' + str(active_index)
        other = [i for i in ota_slots if i != active_index]
        if len(other) == 1:
            alternative = 'ota_' + str(other[0])
        selection_reason = 'OTA_SINGLE_VALID_ENTRY_OTHER_ERASED'
    result = {
        'schema': 'mel-mini-offline-ota-readonly-v1',
        'partition_dump_sha256': hashlib.sha256(partitions_data).hexdigest(),
        'otadata_sha256': hashlib.sha256(otadata).hexdigest(),
        'partition_table_parsed': True,
        'ota_records': metadata,
        'selected_boot_slot_from_otadata': selected,
        'alternative_slot': alternative,
        'selection_reason': selection_reason,
        'running_slot_verified': False,
        'bootloader_compatibility_verified': False,
        'rollback_verified': False,
        'flash_allowed': False,
        'flash_performed': False,
    }
    if expected_sha256 is not None and firmware is None:
        raise ValueError('FIRMWARE_REQUIRED_FOR_SHA256')
    if firmware:
        image = inspect_image(firmware)
        if expected_sha256 is not None and image['sha256'].lower() != expected_sha256.lower():
            raise ValueError('FIRMWARE_SHA256_MISMATCH')
        candidate = {'sha256': image['sha256'], 'size_bytes': image['size_bytes'],
                     'chip_id': image['chip_id'], 'structurally_valid': image['structurally_valid']}
        result['candidate_firmware'] = candidate
        if alternative:
            idx = int(alternative.split('_')[1])
            part = ota_slots[idx]
            result['inactive_slot_capacity_ok'] = part['size'] >= image['size_bytes']
            result['inactive_slot_offset'] = hex(part['offset'])
            result['inactive_slot_size_bytes'] = part['size']
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--partitions', type=Path, required=True)
    ap.add_argument('--otadata', type=Path, required=True)
    ap.add_argument('--firmware', type=Path)
    ap.add_argument('--expected-sha256')
    ap.add_argument('--output', type=Path)
    args = ap.parse_args()
    try:
        result = analyze(args.partitions.read_bytes(), args.otadata.read_bytes(), args.firmware, args.expected_sha256)
    except ValueError as exc:
        print(json.dumps({'valid': False, 'error': str(exc), 'flash_allowed': False}), file=sys.stderr)
        return 2
    payload = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    if args.output:
        if args.output.exists():
            print('REFUSING_TO_OVERWRITE_EXISTING_EVIDENCE', file=sys.stderr)
            return 3
        args.output.write_text(payload, encoding='utf-8')
    print(payload, end='')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
