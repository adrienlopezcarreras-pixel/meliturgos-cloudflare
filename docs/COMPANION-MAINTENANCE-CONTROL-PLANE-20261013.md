# Companion maintenance control plane — MINI, Android, Windows

Status: DESIGN / NOT DEPLOYED / NOT HARDWARE VERIFIED. This file defines the target capability model, not evidence that actions work.

## Allowed managed targets
- MINI ESP32-S3 on validated USB port (currently COM3), including ESP-IDF firmware, OTA slots and local backups.
- MEL Android package `fr.veriteinterdite.mel` on an explicitly approved, already paired Redmi over ADB Wi-Fi.
- MEL Windows Companion's own verified files and packages.
- No whole-PC delete, arbitrary PowerShell commands, arbitrary Android packages, arbitrary network host or arbitrary flash address.

## Maintenance phases
1. **Discover/audit (automatic/read-only):** inventory port, chip, partition map, running OTA slot, firmware metadata, Bluetooth bonding evidence, ADB state and version, installed package certificate and local diagnostics. Report facts, unknowns and evidence.
2. **Back up and prove recovery:** export permitted flash regions and current APK; capture hashes and source offsets; validate restored image with offline parsers. Android APK backup does not include application data and is not a full Android rollback. Do not claim rollback verified without a physical restore test.
3. **Prepare:** verify exact device identity, target compatibility, build SHA, signature and partition bounds; stage immutable artifacts locally; produce a dry-run plan and warnings.
4. **Execute (owner confirmation):** install signed APK retaining app data when possible; write MINI OTA only to the validated inactive application partition, with independent readback and recovery checks. Low-level recovery USB flashing needs separate explicit approval. Destructive erases and factory reset always require distinct confirmation, even in MAX mode.
5. **Verify:** post-write SHA, running OTA slot/version, 30 BLE reconnects, STT/TTS and STOP VOIX, Wi-Fi coexistence, and recovery trial as appropriate. Fail closed on missing evidence.

## Stable named actions to implement
- `mini.maintenance.inventory`, `mini.maintenance.audit`, `mini.maintenance.backup`, `mini.maintenance.backup.verify`
- `mini.maintenance.plan`, `mini.maintenance.flash.ota`, `mini.maintenance.flash.usb.recovery`, `mini.maintenance.rollback`
- `mini.maintenance.erase.selected` (only explicit named regions after independent review; NVS and identity keys protected by default)
- `android.maintenance.audit`, `android.maintenance.stage`, `android.maintenance.install`, `android.maintenance.backup.inspect`
- `android.maintenance.uninstall` (explicit app-data deletion consent) and `android.maintenance.clean.cache` (explicit local-only scope)
- `companion.self.audit`, `companion.self.update`, `companion.self.rollback`, `companion.self.clean.cache`
These are roadmap action names, **not** an assertion that routes or handlers exist.

## Security and operational contracts
- Owner identity + per-device local consent + strict action-specific allowlist. Never accept caller-controlled shell strings or paths for destructive actions.
- Scope each request to hardware ID and, where possible, chip/board fingerprint; bind to immutable SHA256 payload and single-use operation ID.
- Separate read-only, stage, install/flash, rollback and erase scopes. No bulk permission granting.
- Persistent append-only audit with before/after state, hashes, exit code, redacted logs and timeouts.
- USB backup read/security probes can reset an ESP32; clearly mark and obtain permission if required.
- Halt/kill switch respected locally even if server says MAX 100%.
- Refuse flash when current slot, partition map, backup or recovery path are unverified. Never erase NVS automatically.
- Quarantine incompatible APK signer rather than uninstall existing application.
- No chat-to-local-PC live command channel is available until a separately verified, owner-authorized connector/relay is deployed and observed end-to-end.

## Present verified software implementation
- PR #1277: read-only MINI assessment; staged firmware; guarded Android APK install; flashing blocked.
- PR #1291: Companion 2.3.13 ADB Wi-Fi monitor integration.
- PR #1294: candidate read-only BLE diagnostic channel; not deployed.
- MINI flash and arbitrary delete are not implemented/approved; do not present them as DONE_VERIFIED.
