import sys
from pathlib import Path

VERSION = "0.4.37-diagnostic-live"

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
    # No writes until chip identity, partition table and image hash are verified.
    raise RuntimeError("MINI_FLASH_BLOCKED_UNVERIFIED_PARTITION_LAYOUT")

def main():
    banner()
    firmware = asset_path("mel-terminal.bin")
    if not firmware.exists() or firmware.stat().st_size < 1_000_000:
        print("ERREUR : firmware 0.4.37 integre introuvable ou invalide.")
        return 20

    if "--self-test" in sys.argv:
        print(f"SELF-TEST OK - {VERSION} - {firmware.stat().st_size} octets")
        return 0

    # Refuse any flash attempt until an authenticated physical preflight can
    # establish exact offsets, chip identity and the approved firmware digest.
    print("FLASH BLOQUE : table de partitions MINI non verifiee.")
    print("Ne pas ecrire aux offsets historiques sans preuve materielle.")
    return 22


if __name__ == "__main__":
    raise SystemExit(main())
