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

## Owner-authorized Windows computer control
Companion must support interactive remote desktop assistance on the owner's computer when explicitly requested, while preserving the user's ability to revoke control immediately.
- **View only:** screen capture, diagnostics and foreground-window identification, with visible local session indicator.
- **Interactive:** mouse/keyboard input and scoped application/window control, only after explicit local approval for a time-limited session.
- **Maintenance:** fixed allowlisted workflows for filesystem inspection, services, logs, ADB Wi-Fi and MINI USB; potentially destructive steps require separate confirmation and verified backup.
- **Hard protections:** always-on local Stop control and emergency keyboard shortcut; automatic expiry; least privilege; authenticated owner, paired device identity and audit log. No silent access, covert persistence, arbitrary shell execution, password capture or unrestricted file deletion.
- **Transport:** use existing authenticated MEL computer-control and Companion command relay where technically compatible; prefer screen streaming with a bounded consented session over inventing a second unrestricted backdoor. Distinguish a cloud-side authorization from local Windows permission.
- **Success proof:** operator can request view, user sees an unmistakable approval prompt, a test window can be controlled, Stop instantly revokes keyboard/mouse/screen privileges, and log shows session boundaries. This is not DONE_VERIFIED until measured on the actual Windows Companion.

## Live relay acceptance checklist (pending, not executed)
1. Deploy only after CI on the exact integration commit is green, owner authorizes deployment, and the local Companion has remote diagnostics enabled.
2. Confirm Windows Companion is online and has a fresh heartbeat; identify only the owner's paired device.
3. Submit only `mini.android.ble.diagnose` through the existing authenticated relay. No generic `system.exec` payload from this workflow.
4. Wait for the same command ID to reach `SUCCEEDED` and verify `schema=mel.companion.ble.diagnostics.v1`, `read_only=true`, `serial_opened=false`, `flash_performed=false`, and `apk_install_performed=false`.
5. Confirm `com_present=true`, Android target model `M2103K19G`, and `adb_status=ADB_CONNECTED`; otherwise report a blocked or inconclusive test, not success.
6. Interpret BLE GATT / bonding / session signals only when logs contain relevant events. Absence of `SESSION_OK` in a bounded log is not proof the session never succeeded.
7. Maintain strict separation between server CI success, command relay success, local Windows execution, and true MINI BLE connectivity.
8. Stop on unexpected device identity, missing COM3, stale device heartbeat or no owner consent. No flash, erase or pair actions as part of this test.
