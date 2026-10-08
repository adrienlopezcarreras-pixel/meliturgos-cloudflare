import os
import sys
import traceback
from pathlib import Path

VERSION = "CLEAN-LINKV2-5a0b951"
APP_OFFSETS = ("0x20000", "0x620000")

def asset_path(name: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return root / name

def banner():
    print("=" * 62)
    print(f" MEL MINI Updater {VERSION}")
    print(" Waveshare ESP32-S3 Touch LCD 3.5 C")
    print(" NVS / appairage / Wi-Fi conserves")
    print("=" * 62)
    print()

def choose_port():
    from serial.tools import list_ports
    ports = list(list_ports.comports())
    if not ports:
        print("Aucun port serie detecte.")
        print()
        print("Mode bootloader :")
        print("  1. Maintiens BOOT")
        print("  2. Appuie brievement sur RESET")
        print("  3. Relache BOOT")
        print("  4. Relance cet Updater")
        return None

    preferred = []
    others = []
    for p in ports:
        desc = (p.description or "").lower()
        hwid = (p.hwid or "").lower()
        if ("303a" in hwid or "esp32" in desc or "usb jtag" in desc or
            "wch" in desc or "ch34" in desc or "cp210" in desc):
            preferred.append(p)
        else:
            others.append(p)
    ordered = preferred + others

    if len(ordered) == 1:
        p = ordered[0]
        print(f"Port detecte : {p.device} - {p.description}")
        return p.device

    print("Ports detectes :")
    for idx, p in enumerate(ordered, 1):
        print(f"  {idx}. {p.device} - {p.description}")
    print()
    while True:
        raw = input("Numero du port de la MINI : ").strip()
        try:
            n = int(raw)
            if 1 <= n <= len(ordered):
                return ordered[n - 1].device
        except ValueError:
            pass
        print("Choix invalide.")

def flash(port: str, firmware: Path):
    import esptool
    args = [
        "--chip", "esp32s3",
        "--port", port,
        "--baud", "460800",
        "--before", "default_reset",
        "--after", "hard_reset",
        "write_flash",
        "-z",
        APP_OFFSETS[0], str(firmware),
        APP_OFFSETS[1], str(firmware),
    ]
    print()
    print("Flash de la MINI...")
    print("Ne debranche pas le cable USB.")
    print()
    esptool.main(args)

def main():
    banner()
    firmware = asset_path("mel-terminal.bin")
    if not firmware.exists() or firmware.stat().st_size < 1_000_000:
        print("ERREUR : firmware CLEAN LINK V2 integre introuvable ou invalide.")
        return 20

    if "--self-test" in sys.argv:
        print(f"SELF-TEST OK - {VERSION} - {firmware.stat().st_size} octets")
        return 0

    port = choose_port()
    if not port:
        input("\nAppuie sur Entree pour fermer...")
        return 21

    print()
    print(f"Firmware : {VERSION}")
    print(f"Port     : {port}")
    print("NVS      : conserve")
    print("Slots    : OTA_0 + OTA_1")
    print()
    input("Appuie sur Entree pour lancer le flash...")

    try:
        flash(port, firmware)
        print()
        print("=" * 62)
        print(" FLASH TERMINE AVEC SUCCES")
        print(" La MINI doit redemarrer automatiquement.")
        print("=" * 62)
        return 0
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        if code == 0:
            print("\nFLASH TERMINE AVEC SUCCES")
            return 0
        print(f"\nECHEC DU FLASH (code {code}).")
        print("Passe la MINI en bootloader : BOOT maintenu -> RESET bref -> relache BOOT.")
        return code
    except Exception:
        print("\nECHEC DU FLASH.")
        traceback.print_exc()
        print()
        print("Passe la MINI en bootloader : BOOT maintenu -> RESET bref -> relache BOOT.")
        return 1
    finally:
        if "--self-test" not in sys.argv:
            try:
                input("\nAppuie sur Entree pour fermer...")
            except EOFError:
                pass

if __name__ == "__main__":
    raise SystemExit(main())
