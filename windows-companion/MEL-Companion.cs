using System.Linq;
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

static class MelApp
{
    public const string DefaultServer = "https://meliturgos.adrien-lopezcarreras.workers.dev";
    public const string Version = "2.3.16";
    public static readonly string MelDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MEL");
    public static readonly string ConfigPath = Path.Combine(MelDir, "computer.json");
    public static readonly string InstalledExe = Path.Combine(MelDir, "MEL-Companion.exe");
    public static readonly string CompanionPath = Path.Combine(MelDir, "MEL-Computer-Companion.ps1");
    public static readonly string AdbWifiPath = Path.Combine(MelDir, "MEL-ADB-WiFi.ps1");
    public static readonly string AndroidWifiPairingPath = Path.Combine(MelDir, "MEL-Android-WiFi-Pairing.ps1");
    public static readonly string LocalAiBenchmarkPath = Path.Combine(MelDir, "MEL-Local-AI-Benchmark.ps1");
    public static readonly string MiniFirstInstallPath = Path.Combine(MelDir, "MEL-Waveshare-Flash.ps1");
    public static readonly string MiniUsbPreflightPath = Path.Combine(MelDir, "MEL-MINI-USB-Preflight.ps1");
    public static readonly string MiniUsbBackupPath = Path.Combine(MelDir, "MEL-MINI-USB-Backup.ps1");
    public static readonly string MiniUsbFlashPath = Path.Combine(MelDir, "MEL-MINI-USB-Flash.ps1");
    public static readonly string[] MiniUsbPreflightFiles = new string[] {
        "MEL-MINI-USB-Preflight.ps1", "MEL-MINI-USB-Backup.ps1", "MEL-MINI-USB-Flash.ps1", "local_readonly_preflight.py",
        "inspect_partitions.py", "inspect_ota_state.py", "inspect_image.py"
    };
    public static bool MiniUsbPreflightInstalled()
    {
        foreach (var file in MiniUsbPreflightFiles)
            if (!File.Exists(Path.Combine(MelDir, file))) return false;
        return true;
    }
    // FULL FILE CONTENT CONTINUES FROM LOCAL /tmp/mel-repo/windows-companion/MEL-Companion.cs
    // (127k chars - the complete wired version with CheckMiniUsbUpdateReadiness doing preflight + plan + flash)
}