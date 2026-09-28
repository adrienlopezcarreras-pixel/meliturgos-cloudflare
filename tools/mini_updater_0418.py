from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

import esptool
from serial.tools import list_ports

VERSION = "0.4.18-truthful-mobile-status"
EXPECTED_FIRMWARE_SHA256 = "fa46543cc39152f932cd7423242837f151db57e83895a88193d44f407c0fe6b4"
NVS_OFFSET = "0x9000"
NVS_SIZE = "0x6000"
FLASH_OFFSET = "0x0"


def resource_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def choose_port() -> str:
    ports = list(list_ports.comports())
    if not ports:
        raise RuntimeError(
            "Aucun port serie detecte. Branche la MINI en USB, attends quelques secondes puis relance."
        )

    print("\nPorts serie detectes :")
    for idx, port in enumerate(ports, start=1):
        desc = port.description or "Peripherique serie"
        hwid = port.hwid or ""
        print(f"  {idx}. {port.device}  -  {desc}  {hwid}")

    likely = [
        p for p in ports
        if any(token in ((p.description or "") + " " + (p.hwid or "")).lower()
               for token in ("esp32", "usb jtag", "usb serial", "cp210", "ch340", "wch", "silicon labs"))
    ]

    if len(ports) == 1:
        selected = ports[0]
        print(f"\nPort selectionne automatiquement : {selected.device}")
        return selected.device

    if len(likely) == 1:
        selected = likely[0]
        print(f"\nPort MINI probable selectionne automatiquement : {selected.device}")
        return selected.device

    while True:
        answer = input("\nNumero du port de la MINI : ").strip()
        try:
            n = int(answer)
            if 1 <= n <= len(ports):
                return ports[n - 1].device
        except ValueError:
            pass
        print("Choix invalide.")


def esptool_call(port: str, command: list[str], baud: int = 460800) -> None:
    args = [
        "--chip", "esp32s3",
        "--port", port,
        "--baud", str(baud),
        *command,
    ]
    try:
        esptool.main(args)
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        if code != 0:
            raise RuntimeError(f"esptool a retourne le code {code}") from exc


def esptool_with_retry(port: str, command: list[str], label: str) -> None:
    try:
        esptool_call(port, command, 460800)
    except Exception as first:
        print(f"\n{label}: echec a 460800 bauds ({first}).")
        print("Nouvelle tentative a 115200 bauds...")
        esptool_call(port, command, 115200)


def copy_backup_for_recovery(backup: Path) -> Path | None:
    if not backup.exists():
        return None
    candidates = [Path.home() / "Desktop", Path.home()]
    for directory in candidates:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            target = directory / "MEL_MINI_NVS_BACKUP_0.4.18.bin"
            shutil.copy2(backup, target)
            return target
        except Exception:
            continue
    return None


def main() -> int:
    print("=" * 62)
    print(" MEL MINI UPDATER 0.4.18")
    print(" Affichage mobile fiable + appairage conserve")
    print("=" * 62)
    print()
    print("Cet outil :")
    print("  1. sauvegarde la NVS (Wi-Fi, token MEL, appairage),")
    print("  2. installe le firmware MINI 0.4.18 valide par la CI,")
    print("  3. restaure la NVS,")
    print("  4. verifie le flash puis redemarre la MINI.")
    print()
    print("Le stockage interne MEDIA n'est pas efface.")
    print()

    firmware = resource_path("mini-first-install.bin")
    if not firmware.exists():
        raise RuntimeError("Firmware embarque introuvable dans l'executable.")

    actual_sha = sha256_file(firmware)
    if actual_sha.lower() != EXPECTED_FIRMWARE_SHA256.lower():
        raise RuntimeError(
            "Controle d'integrite firmware echoue. "
            f"Attendu {EXPECTED_FIRMWARE_SHA256}, obtenu {actual_sha}."
        )

    print(f"Firmware : {VERSION}")
    print(f"SHA-256 : {actual_sha}")
    port = choose_port()

    answer = input(
        f"\nMINI detectee sur {port}. Lancer la mise a jour ? [O/n] "
    ).strip().lower()
    if answer not in ("", "o", "oui", "y", "yes"):
        print("Mise a jour annulee.")
        return 0

    with tempfile.TemporaryDirectory(prefix="mel-mini-0418-") as tmp:
        tmpdir = Path(tmp)
        backup = tmpdir / "nvs-backup.bin"
        backup_done = False
        flash_started = False

        try:
            print("\n[1/4] Sauvegarde NVS...")
            esptool_with_retry(
                port,
                ["read_flash", NVS_OFFSET, NVS_SIZE, str(backup)],
                "Sauvegarde NVS",
            )
            if not backup.exists() or backup.stat().st_size != int(NVS_SIZE, 16):
                raise RuntimeError("La sauvegarde NVS n'a pas la taille attendue.")
            backup_done = True
            print("NVS sauvegardee.")

            print("\n[2/4] Flash firmware MINI 0.4.18...")
            flash_started = True
            esptool_with_retry(
                port,
                ["write_flash", "-z", FLASH_OFFSET, str(firmware)],
                "Flash firmware",
            )
            print("Firmware ecrit.")

            print("\n[3/4] Restauration NVS...")
            esptool_with_retry(
                port,
                ["write_flash", NVS_OFFSET, str(backup)],
                "Restauration NVS",
            )
            print("NVS restauree.")

            print("\n[4/4] Verification du firmware...")
            esptool_with_retry(
                port,
                ["verify_flash", FLASH_OFFSET, str(firmware)],
                "Verification firmware",
            )

            print("\nRedemarrage de la MINI...")
            try:
                esptool_with_retry(port, ["run"], "Redemarrage")
            except Exception:
                # write/verify normally hard-reset the device already.
                pass

            print("\n" + "=" * 62)
            print(" MISE A JOUR TERMINEE AVEC SUCCES")
            print("=" * 62)
            print("Version installee : 0.4.18-truthful-mobile-status")
            print("Wi-Fi et appairage MEL ont ete conserves via la sauvegarde NVS.")
            print("Apres redemarrage, la MINI doit afficher MOBILE CONNECTE")
            print("des que le canal BLE reel avec le telephone est actif.")
            return 0

        except Exception as exc:
            print("\nERREUR :", exc)
            if backup_done:
                saved = copy_backup_for_recovery(backup)
                if saved:
                    print(f"Sauvegarde NVS de secours conservee ici : {saved}")

                if flash_started:
                    print("\nTentative de restauration NVS avant sortie...")
                    try:
                        esptool_with_retry(
                            port,
                            ["write_flash", NVS_OFFSET, str(backup)],
                            "Restauration NVS de secours",
                        )
                        print("NVS restauree.")
                    except Exception as restore_exc:
                        print("Impossible de restaurer automatiquement la NVS :", restore_exc)
            return 1


if __name__ == "__main__":
    try:
        code = main()
    except Exception as exc:
        print("\nERREUR FATALE :", exc)
        code = 1
    input("\nAppuie sur Entree pour fermer...")
    raise SystemExit(code)
