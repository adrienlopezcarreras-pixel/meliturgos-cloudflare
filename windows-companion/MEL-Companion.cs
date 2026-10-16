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
    public const string Version = "2.3.14";
    public static readonly string MelDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MEL");
    public static readonly string ConfigPath = Path.Combine(MelDir, "computer.json");
    public static readonly string InstalledExe = Path.Combine(MelDir, "MEL-Companion.exe");
    public static readonly string CompanionPath = Path.Combine(MelDir, "MEL-Computer-Companion.ps1");
    public static readonly string AdbWifiPath = Path.Combine(MelDir, "MEL-ADB-WiFi.ps1");
    public static readonly string AndroidWifiPairingPath = Path.Combine(MelDir, "MEL-Android-WiFi-Pairing.ps1");
    public static readonly string LocalAiBenchmarkPath = Path.Combine(MelDir, "MEL-Local-AI-Benchmark.ps1");
    public static readonly string MiniUsbPreflightPath = Path.Combine(MelDir, "MEL-MINI-USB-Preflight.ps1");
    public static readonly string[] MiniUsbPreflightFiles = new string[] {
        "MEL-MINI-USB-Preflight.ps1", "local_readonly_preflight.py",
        "inspect_partitions.py", "inspect_ota_state.py", "inspect_image.py"
    };
    public static bool MiniUsbPreflightInstalled()
    {
        foreach (var file in MiniUsbPreflightFiles)
            if (!File.Exists(Path.Combine(MelDir, file))) return false;
        return true;
    }
    public static readonly string LocalAiBenchmarkReportPath = Path.Combine(MelDir, "diagnostics", "ollama-benchmark.json");
    public static readonly string StartupCmd = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "MEL-Companion.cmd");
    public static readonly string LegacyStartupCmd = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "MEL-Computer-Companion.cmd");
    public static readonly string SelfTestPath = Path.Combine(MelDir, "self-test.json");
    public static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    public static Dictionary<string, object> Config;
    public static string Token;
    public static string Server;
    public static string ComputerId;
    public static Process CompanionProcess;
    public static Process AdbWifiProcess;
    public static System.Threading.Timer SupervisorTimer;
    static int SupervisorBusy;
    public static DateTime LastEngineRefreshUtc = DateTime.MinValue;
    public static string LastEngineRefreshStatus = "NOT_RUN";
    public static string LastEngineRefreshError = "";
    public static NotifyIcon Tray;
    public static HotKeyWindow HotKey;
    public const string HotKeyLabel = "Ctrl+Alt+M";
    public static MainForm Main;
    public static bool Exiting;
    const string CompanionB64 = "__COMPANION_B64__";
    const string AdbWifiB64 = "__ADB_WIFI_B64__";

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    // Small Win32 probes; no subprocess, model download, or expensive GPU scan.
    [StructLayout(LayoutKind.Sequential)]
    struct MemoryStatus
    {
        public uint length, load;
        public ulong totalPhys, availPhys, totalPage, availPage, totalVirtual, availVirtual, availExtended;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct LastInputInfo { public uint size, tick; }
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LastInputInfo info);
    static long LastIdleTicks, LastKernelTicks, LastUserTicks;
    static bool HasCpuSample;

    public static Dictionary<string,object> GetLocalComputeTelemetry()
    {
        try
        {
            long idle, kernel, user;
            if (!GetSystemTimes(out idle, out kernel, out user)) return null;
            long previousTotal = LastKernelTicks + LastUserTicks;
            long total = (kernel + user) - previousTotal;
            long busyTicks = total - (idle - LastIdleTicks);
            bool sampled = HasCpuSample && total > 0 && busyTicks >= 0 && busyTicks <= total;
            LastIdleTicks = idle; LastKernelTicks = kernel; LastUserTicks = user; HasCpuSample = true;
            if (!sampled) return null; // First heartbeat cannot claim the PC is idle.
            var memory = new MemoryStatus();
            memory.length = (uint)Marshal.SizeOf(typeof(MemoryStatus));
            if (!GlobalMemoryStatusEx(ref memory)) return null;
            var activity = new LastInputInfo();
            activity.size = (uint)Marshal.SizeOf(typeof(LastInputInfo));
            // If activity/power status is unknown, prefer the PC owner's safety.
            bool busy = !GetLastInputInfo(ref activity) ||
                unchecked((uint)Environment.TickCount - activity.tick) < 60000U;
            var line = SystemInformation.PowerStatus.PowerLineStatus;
            bool onBattery = line != PowerLineStatus.Online;
            return new Dictionary<string,object> {
                {"cpu_percent",Math.Round(100.0 * busyTicks / total,1)},
                {"free_ram_mb",(double)(memory.availPhys / (1024UL * 1024UL))},
                {"on_battery",onBattery},
                {"user_busy",busy},
                {"gpu_available",false}, // Until a local GPU backend is verified.
                {"active_jobs",0} // No optional compute jobs are dispatched yet.
            };
        }
        catch { return null; }
    }



    public static void EnableDpiAwareness()
    {
        try
        {
            if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware();
        }
        catch
        {
            try { SetProcessDPIAware(); } catch { }
        }
    }

    public static Color Bg = Color.FromArgb(5, 10, 22);
    public static Color Panel = Color.FromArgb(13, 24, 45);
    public static Color Glass = Color.FromArgb(18, 33, 58);
    public static Color Cyan = Color.FromArgb(34, 211, 238);
    public static Color Blue = Color.FromArgb(74, 144, 255);
    public static Color Violet = Color.FromArgb(157, 110, 255);
    public static Color Text = Color.FromArgb(241, 247, 255);
    public static Color Muted = Color.FromArgb(145, 166, 197);
    public static Color Green = Color.FromArgb(52, 211, 153);
    public static Color Red = Color.FromArgb(251, 113, 133);
    public static Color Line = Color.FromArgb(48, 78, 112);

    public static Bitmap MakeMelTechnoFace(int size)
    {
        var bmp = new Bitmap(size, size);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            var scale = Math.Max(0.01f, size / 100f);
            g.ScaleTransform(scale, scale);

            using (var glow = new Pen(Color.FromArgb(70, 68, 232, 255), 9f))
            using (var outer = new Pen(Color.FromArgb(72, 120, 255), 4f))
            using (var cyan = new Pen(Cyan, 3f))
            using (var faceFill = new SolidBrush(Color.FromArgb(14, 29, 55)))
            using (var eyeFill = new SolidBrush(Color.FromArgb(74, 239, 255)))
            using (var eyeCore = new SolidBrush(Color.White))
            using (var mouth = new Pen(Color.FromArgb(112, 150, 255), 3f))
            {
                g.DrawEllipse(glow, 11, 11, 78, 78);
                g.DrawArc(outer, 8, 8, 84, 84, 204, 312);

                var head = new Point[] {
                    new Point(50,12), new Point(78,23), new Point(88,48),
                    new Point(80,74), new Point(63,89), new Point(50,94),
                    new Point(37,89), new Point(20,74), new Point(12,48),
                    new Point(22,23)
                };
                g.FillPolygon(faceFill, head);
                g.DrawPolygon(cyan, head);

                var leftEye = new Point[] {
                    new Point(24,43), new Point(43,38), new Point(39,51), new Point(25,54)
                };
                var rightEye = new Point[] {
                    new Point(76,43), new Point(57,38), new Point(61,51), new Point(75,54)
                };
                g.FillPolygon(eyeFill, leftEye);
                g.FillPolygon(eyeFill, rightEye);
                g.FillEllipse(eyeCore, 31, 43, 5, 5);
                g.FillEllipse(eyeCore, 64, 43, 5, 5);

                g.DrawLine(cyan, 24, 34, 43, 31);
                g.DrawLine(cyan, 57, 31, 76, 34);
                g.DrawLine(cyan, 50, 47, 50, 65);
                g.DrawLine(cyan, 46, 66, 54, 66);

                g.DrawLine(mouth, 34, 72, 43, 75);
                g.DrawLine(mouth, 43, 75, 57, 75);
                g.DrawLine(mouth, 57, 75, 66, 72);

                g.DrawLine(cyan, 8, 48, 2, 48);
                g.DrawLine(cyan, 92, 48, 98, 48);
                g.DrawLine(cyan, 17, 28, 8, 21);
                g.DrawLine(cyan, 83, 28, 92, 21);
                g.FillEllipse(eyeFill, 0, 46, 5, 5);
                g.FillEllipse(eyeFill, 95, 46, 5, 5);
            }
        }
        return bmp;
    }

    public static PictureBox MelFace(int x, int y, int size)
    {
        var box = new PictureBox();
        box.SetBounds(x, y, size, size);
        box.BackColor = Color.Transparent;
        box.SizeMode = PictureBoxSizeMode.Zoom;
        box.Image = MakeMelTechnoFace(size);
        box.TabStop = false;
        return box;
    }

    public static string Http(string url, string method, string body, Dictionary<string,string> headers)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        var req = (HttpWebRequest)WebRequest.Create(url);
        req.Method = method;
        req.Timeout = 15000;
        req.ReadWriteTimeout = 15000;
        req.Accept = "application/json";
        if (headers != null) foreach (var kv in headers) req.Headers[kv.Key] = kv.Value;
        if (body != null)
        {
            var bytes = Encoding.UTF8.GetBytes(body);
            req.ContentType = "application/json";
            req.ContentLength = bytes.Length;
            using (var s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length);
        }
        try
        {
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var sr = new StreamReader(resp.GetResponseStream()))
                return sr.ReadToEnd();
        }
        catch (WebException ex)
        {
            var resp = ex.Response as HttpWebResponse;
            if (resp != null)
            {
                using (resp)
                using (var sr = new StreamReader(resp.GetResponseStream()))
                    throw new Exception("HTTP " + (int)resp.StatusCode + " — " + sr.ReadToEnd());
            }
            throw;
        }
    }

    static string Sha256Hex(byte[] bytes)
    {
        using (var sha = SHA256.Create())
        {
            var hash = sha.ComputeHash(bytes);
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }
    }

    static bool ValidatePowerShellFile(string path)
    {
        try
        {
            var safe = path.Replace("'", "''");
            var psi = new ProcessStartInfo("powershell.exe");
            psi.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('" + safe + "',[ref]$tokens,[ref]$errors);if($errors.Count -gt 0){exit 41}\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            using (var process = Process.Start(psi))
            {
                if (process == null) return false;
                if (!process.WaitForExit(10000))
                {
                    try { process.Kill(); } catch { }
                    return false;
                }
                return process.ExitCode == 0;
            }
        }
        catch { return false; }
    }

    public static bool MaybeRefreshCompanionEngine(bool force)
    {
        try
        {
            var now = DateTime.UtcNow;
            if (!force && LastEngineRefreshUtc != DateTime.MinValue &&
                now.Subtract(LastEngineRefreshUtc).TotalSeconds < 30) return false;
            if (Server == null || Server.Length == 0 || Token == null || Token.Length < 20 || ComputerId == null || ComputerId.Length == 0)
            {
                LastEngineRefreshStatus = "NOT_CONFIGURED";
                return false;
            }
            LastEngineRefreshUtc = now;
            LastEngineRefreshStatus = "CHECKING";
            LastEngineRefreshError = "";

            var latest = Http(Server + "/api/computer/v1/companion", "GET", null, DeviceHeaders());
            if (string.IsNullOrWhiteSpace(latest) || latest.Length < 10000)
            {
                LastEngineRefreshStatus = "INVALID_REMOTE_PAYLOAD";
                return false;
            }
            if (!latest.Contains("function Send-Heartbeat") || !latest.Contains("function Perform-Step"))
            {
                LastEngineRefreshStatus = "INVALID_REMOTE_CONTRACT";
                return false;
            }

            var latestBytes = new UTF8Encoding(false).GetBytes(latest);
            var latestHash = Sha256Hex(latestBytes);
            var currentHash = File.Exists(CompanionPath) ? Sha256Hex(File.ReadAllBytes(CompanionPath)) : "";
            if (string.Equals(latestHash, currentHash, StringComparison.OrdinalIgnoreCase))
            {
                LastEngineRefreshStatus = "CURRENT";
                return false;
            }

            Directory.CreateDirectory(MelDir);
            var temp = CompanionPath + ".update-" + Guid.NewGuid().ToString("N") + ".ps1";
            var backup = CompanionPath + ".previous";
            File.WriteAllBytes(temp, latestBytes);
            if (!ValidatePowerShellFile(temp))
            {
                try { File.Delete(temp); } catch { }
                LastEngineRefreshStatus = "SYNTAX_REJECTED";
                return false;
            }

            if (File.Exists(CompanionPath))
            {
                try { if (File.Exists(backup)) File.Delete(backup); } catch { }
                File.Replace(temp, CompanionPath, backup, true);
                try { if (File.Exists(backup)) File.Delete(backup); } catch { }
            }
            else
            {
                File.Move(temp, CompanionPath);
            }

            RestartCompanion();
            LastEngineRefreshStatus = "UPDATED";
            return true;
        }
        catch (Exception ex)
        {
            LastEngineRefreshStatus = "FAILED";
            LastEngineRefreshError = ex.GetType().Name + ": " + (ex.Message ?? "");
            if (LastEngineRefreshError.Length > 180) LastEngineRefreshError = LastEngineRefreshError.Substring(0,180);
            return false;
        }
    }

    static Dictionary<string, object> Obj(string json) { return Json.Deserialize<Dictionary<string, object>>(json); }
    static string S(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : ""; }

    public static bool LoadConfig()
    {
        try
        {
            if (!File.Exists(ConfigPath)) return false;
            Config = Obj(File.ReadAllText(ConfigPath, Encoding.UTF8));
            Server = S(Config, "server_url").TrimEnd('/');
            ComputerId = S(Config, "computer_id");
            var cipher = Convert.FromBase64String(S(Config, "token_protected"));
            Token = Encoding.UTF8.GetString(ProtectedData.Unprotect(cipher, null, DataProtectionScope.CurrentUser));
            return Server.Length > 0 && ComputerId.Length > 0 && Token.Length > 0;
        }
        catch { return false; }
    }

    static string Protect(string token)
    {
        return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser));
    }

    // Keep local authorization readable at every instant. The PowerShell engine
    // rereads computer.json before *each* remote action; an in-place rewrite
    // could expose truncated JSON and cause a false local denial.
    public static void WriteConfigAtomically(Dictionary<string, object> snapshot)
    {
        Directory.CreateDirectory(MelDir);
        var temp = Path.Combine(MelDir, "computer.json." + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            File.WriteAllText(temp, Json.Serialize(snapshot), new UTF8Encoding(false));
            if (File.Exists(ConfigPath))
                File.Replace(temp, ConfigPath, null, true);
            else
                File.Move(temp, ConfigPath);
        }
        finally
        {
            try { if (File.Exists(temp)) File.Delete(temp); } catch { }
        }
    }

    public static void SaveConfig(string server, string computerId, string token)
    {
        Directory.CreateDirectory(MelDir);
        var d = new Dictionary<string, object>();
        d["server_url"] = server.TrimEnd('/');
        d["computer_id"] = computerId;
        d["token_protected"] = Protect(token);
        d["allowed_apps"] = new string[] { "notepad", "calculator", "explorer", "msedge", "firefox", "chrome" };
        d["allowed_paths"] = new string[] {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
        };
        d["remote_access_enabled"] = false;
        d["local_compute_enabled"] = false;
        d["local_compute_profile"] = "light";
        d["local_compute_gpu_enabled"] = false;
        d["installed_at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        WriteConfigAtomically(d);
    }

    public static List<string> ConfigList(string key)
    {
        var result = new List<string>();
        object value;
        if (Config == null || !Config.TryGetValue(key, out value) || value == null) return result;
        var arr = value as object[];
        if (arr != null)
        {
            foreach (var item in arr) if (item != null) result.Add(Convert.ToString(item));
            return result;
        }
        var list = value as System.Collections.ArrayList;
        if (list != null)
        {
            foreach (var item in list) if (item != null) result.Add(Convert.ToString(item));
        }
        return result;
    }

    public static bool ConfigBool(string key)
    {
        object value;
        if (Config == null || !Config.TryGetValue(key, out value) || value == null) return false;
        try { return Convert.ToBoolean(value); } catch { return false; }
    }

    public static string ConfigString(string key)
    {
        object value;
        return Config != null && Config.TryGetValue(key, out value) && value != null
            ? Convert.ToString(value) : "";
    }

    public static bool ContainsIgnoreCase(List<string> values, string candidate)
    {
        foreach (var value in values)
            if (string.Equals(value, candidate, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    public static readonly string[] PermissionApps = new string[] { "notepad", "calculator", "explorer", "msedge", "firefox", "chrome" };
    public static readonly string[] PermissionAppLabels = new string[] { "Bloc-notes", "Calculatrice", "Explorateur", "Microsoft Edge", "Firefox", "Google Chrome" };

    public static string[] PermissionPaths()
    {
        return new string[] {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")
        };
    }

    public static void SavePermissions(List<string> apps, List<string> paths, bool remoteAccessEnabled, bool localComputeEnabled, string localComputeProfile, bool localGpuEnabled)
    {
        if (Config == null && !LoadConfig()) throw new InvalidOperationException("Configuration MEL indisponible.");
        // Publish the new complete snapshot only after its atomic file replace succeeds.
        var next = new Dictionary<string, object>(Config);
        next["allowed_apps"] = apps.ToArray();
        next["allowed_paths"] = paths.ToArray();
        next["remote_access_enabled"] = remoteAccessEnabled;
        // This opt-in is independent of remote PC access. Unknown profiles fail closed.
        if (localComputeProfile != "light" && localComputeProfile != "balanced" && localComputeProfile != "performance") localComputeProfile = "off";
        next["local_compute_enabled"] = localComputeEnabled && localComputeProfile != "off";
        next["local_compute_gpu_enabled"] = localComputeEnabled && localComputeProfile != "off" && localGpuEnabled;
        next["local_compute_profile"] = localComputeProfile;
        WriteConfigAtomically(next);
        Config = next;
        RestartCompanion();
    }

    public static void RestartCompanion()
    {
        try
        {
            if (CompanionProcess != null && !CompanionProcess.HasExited)
            {
                CompanionProcess.Kill();
                CompanionProcess.WaitForExit(1500);
            }
        }
        catch { }
        CompanionProcess = null;
        StartCompanion();
    }

    public static void InstallFiles(bool startup)
    {
        Directory.CreateDirectory(MelDir);
        File.WriteAllBytes(CompanionPath, Convert.FromBase64String(CompanionB64));
        File.WriteAllBytes(AdbWifiPath, Convert.FromBase64String(AdbWifiB64));
        var packagedAndroidPairing = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "MEL-Android-WiFi-Pairing.ps1");
        if (File.Exists(packagedAndroidPairing) && !string.Equals(Path.GetFullPath(packagedAndroidPairing), Path.GetFullPath(AndroidWifiPairingPath), StringComparison.OrdinalIgnoreCase)) File.Copy(packagedAndroidPairing, AndroidWifiPairingPath, true);
        // Optional user-initiated benchmark shipped alongside the signed ZIP.
        // Installation COPIES this script; it never executes it automatically.
        var packagedBenchmark = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "MEL-Local-AI-Benchmark.ps1");
        if (File.Exists(packagedBenchmark) &&
            !string.Equals(Path.GetFullPath(packagedBenchmark), Path.GetFullPath(LocalAiBenchmarkPath), StringComparison.OrdinalIgnoreCase))
            File.Copy(packagedBenchmark, LocalAiBenchmarkPath, true);
        // The local USB helper is optional and never run on startup or by MEL's
        // remote command relay. Only install a COMPLETE set from the release ZIP.
        var packageDirectory = Path.GetDirectoryName(Application.ExecutablePath);
        bool miniUsbBundleComplete = true;
        foreach (var name in MiniUsbPreflightFiles)
            if (!File.Exists(Path.Combine(packageDirectory, name))) miniUsbBundleComplete = false;
        if (miniUsbBundleComplete)
            foreach (var name in MiniUsbPreflightFiles)
            {
                var from = Path.Combine(packageDirectory, name);
                var to = Path.Combine(MelDir, name);
                if (!string.Equals(Path.GetFullPath(from), Path.GetFullPath(to),
                    StringComparison.OrdinalIgnoreCase)) File.Copy(from, to, true);
            }
        var current = Application.ExecutablePath;
        if (!string.Equals(Path.GetFullPath(current), Path.GetFullPath(InstalledExe), StringComparison.OrdinalIgnoreCase))
            File.Copy(current, InstalledExe, true);
        ConfigureStartup(startup);
    }

    public static void ConfigureStartup(bool enabled)
    {
        if (enabled)
        {
            File.WriteAllText(StartupCmd, "@echo off\r\nstart \"\" \"" + InstalledExe + "\" --background\r\n", Encoding.ASCII);
            if (File.Exists(LegacyStartupCmd)) File.Delete(LegacyStartupCmd);
        }
        else
        {
            if (File.Exists(StartupCmd)) File.Delete(StartupCmd);
            if (File.Exists(LegacyStartupCmd)) File.Delete(LegacyStartupCmd);
        }
    }

    public static bool StartupEnabled() { return File.Exists(StartupCmd) || File.Exists(LegacyStartupCmd); }

    public static void StartCompanion()
    {
        try
        {
            if (CompanionProcess != null && !CompanionProcess.HasExited) return;
            var psi = new ProcessStartInfo("powershell.exe");
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + CompanionPath + "\" -Run";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.EnvironmentVariables["MEL_COMPANION_HEADLESS"] = "1";
            psi.EnvironmentVariables["MEL_COMPANION_PARENT_PID"] = Process.GetCurrentProcess().Id.ToString();
            CompanionProcess = Process.Start(psi);
        }
        catch { }
    }

    public static bool CompanionRunning()
    {
        try { return CompanionProcess != null && !CompanionProcess.HasExited; }
        catch { return false; }
    }

    public static void EnsureCompanion()
    {
        if (CompanionRunning()) return;
        CompanionProcess = null;
        StartCompanion();
    }

    public static void StartAdbWifiMonitor()
    {
        string failure = null;
        try
        {
            if (AdbWifiProcess != null)
            {
                try { if (!AdbWifiProcess.HasExited) return; }
                catch { }
                try { AdbWifiProcess.Dispose(); } catch { }
                AdbWifiProcess = null;
            }
            if (!File.Exists(AdbWifiPath))
            {
                failure = "ADB_MONITOR_SCRIPT_MISSING";
                throw new FileNotFoundException("ADB Wi-Fi monitor script is missing", AdbWifiPath);
            }
            var psi = new ProcessStartInfo("powershell.exe");
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + AdbWifiPath + "\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            AdbWifiProcess = Process.Start(psi);
            if (AdbWifiProcess == null) failure = "ADB_MONITOR_PROCESS_START_FAILED";
        }
        catch (Exception ex)
        {
            if (String.IsNullOrEmpty(failure)) failure = "ADB_MONITOR_START_FAILED: " + ex.GetType().Name;
            try
            {
                var dir = Path.GetDirectoryName(AdbWifiPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "android-adb-monitor-supervisor.log"),
                    DateTime.UtcNow.ToString("o") + " " + failure + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
        if (!String.IsNullOrEmpty(failure))
        {
            try
            {
                var report = Path.Combine(MelDir, "android-adb-wifi.json");
                var status = new Dictionary<string, object> {
                    {"schema","mel.adb-wifi-status.v1"},
                    {"observed_at_utc",DateTime.UtcNow.ToString("o")},
                    {"adb_available",false},{"connected",false},{"serial",null},
                    {"android_model",null},{"android_version",null},
                    {"mel_package","fr.veriteinterdite.mel"},{"mel_installed",false},
                    {"mel_version",null},{"mel_version_code",null},{"error",failure}
                };
                var json = Json.Serialize(status);
                var temp = report + "." + Guid.NewGuid().ToString("N") + ".tmp";
                File.WriteAllText(temp,json,new UTF8Encoding(false));
                if (File.Exists(report)) File.Replace(temp,report,null);
                else File.Move(temp,report);
            }
            catch { }
        }
    }

    public static void StopAdbWifiMonitor()
    {
        var process = AdbWifiProcess;
        AdbWifiProcess = null;
        if (process == null) return;
        try
        {
            if (!process.HasExited)
            {
                process.Kill();
                // Bound shutdown while allowing the child to release file/mutex handles.
                process.WaitForExit(2000);
            }
        }
        catch { }
        finally
        {
            try { process.Dispose(); } catch { }
        }
    }

    public static void StartBackgroundSupervisor()
    {
        if (SupervisorTimer != null) return;
        SupervisorTimer = new System.Threading.Timer(delegate
        {
            if (Interlocked.Exchange(ref SupervisorBusy, 1) != 0) return;
            try
            {
                EnsureCompanion();
                StartAdbWifiMonitor();
                Heartbeat();
            }
            catch { }
            finally
            {
                Interlocked.Exchange(ref SupervisorBusy, 0);
            }
        }, null, 1000, 10000);
    }

    public static void StopBackgroundSupervisor()
    {
        try
        {
            var timer = SupervisorTimer;
            SupervisorTimer = null;
            if (timer != null) timer.Dispose();
        }
        catch { }
        StopAdbWifiMonitor();
    }

    static Dictionary<string,string> DeviceHeaders()
    {
        var h = new Dictionary<string,string>();
        h["Authorization"] = "Bearer " + Token;
        h["X-MEL-Computer-ID"] = ComputerId;
        return h;
    }

    public static bool Heartbeat()
    {
        try
        {
            var bounds = SystemInformation.VirtualScreen;
            var screen = new Dictionary<string, object> {
                {"x",bounds.X},{"y",bounds.Y},{"width",bounds.Width},{"height",bounds.Height}
            };
            var heartbeat = new Dictionary<string, object> {
                {"version",Version},{"hostname",Environment.MachineName},{"user",Environment.UserName},{"screen",screen},
                {"engine_refresh_status",LastEngineRefreshStatus},
                {"engine_refresh_at",LastEngineRefreshUtc == DateTime.MinValue ? 0L : new DateTimeOffset(LastEngineRefreshUtc).ToUnixTimeMilliseconds()},
                {"engine_refresh_error",LastEngineRefreshError},
                {"remote_access_enabled",ConfigBool("remote_access_enabled")},
                {"local_compute_enabled",ConfigBool("local_compute_enabled")},
                {"local_compute_gpu_enabled",ConfigBool("local_compute_enabled")&&ConfigBool("local_compute_gpu_enabled")},
                {"local_compute_profile",ConfigString("local_compute_profile")}
            };
            // Optional telemetry is sampled only when explicitly enabled.
            // No valid sample means fail closed, never an invented 0% CPU.
            if (ConfigBool("local_compute_enabled"))
            {
                var measurement = GetLocalComputeTelemetry();
                if (measurement != null) heartbeat["local_compute_telemetry"] = measurement;
            }
            // The native shell owns and supervises the authenticated PowerShell
            // engine. If that child process is alive, attest its heartbeat too
            // so server-side sovereignty checks do not misclassify an open,
            // supervised Companion as offline between engine HTTP heartbeats.
            if (CompanionRunning())
                heartbeat["engine_heartbeat_at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var body = Json.Serialize(heartbeat);
            var o = Obj(Http(Server + "/api/computer/v1/heartbeat", "POST", body, DeviceHeaders()));
            object ok;
            var serverOk = o.TryGetValue("ok", out ok) && Convert.ToBoolean(ok);
            object updateRequired;
            if (o.TryGetValue("engine_update_required", out updateRequired) && updateRequired != null && Convert.ToBoolean(updateRequired))
                MaybeRefreshCompanionEngine(true);
            object engineOnline;
            if (o.TryGetValue("engine_online", out engineOnline) && engineOnline != null)
                return serverOk && Convert.ToBoolean(engineOnline);
            return serverOk && CompanionRunning();
        }
        catch { return false; }
    }

    // Authenticated, passive cross-device activity view. This is NOT an
    // authorization to act on Windows and contains no conversation content.
    public static string AndroidTriadActivityLabel()
    {
        const string unavailable = "Android : activité non vérifiée";
        try
        {
            if (string.IsNullOrWhiteSpace(Server) || string.IsNullOrWhiteSpace(Token) ||
                string.IsNullOrWhiteSpace(ComputerId)) return unavailable;
            var o = Obj(Http(Server + "/api/computer/v1/triad-activity", "GET", null, DeviceHeaders()));
            object schema, state, phase, expiry, verified;
            if (!o.TryGetValue("schema", out schema) ||
                Convert.ToString(schema) != "mel.triad.android-presence.v1" ||
                !o.TryGetValue("state", out state) || Convert.ToString(state) != "FRESH" ||
                !o.TryGetValue("phase", out phase) ||
                !o.TryGetValue("expires_at_ms", out expiry) ||
                !o.TryGetValue("owner_control_verified", out verified) ||
                Convert.ToBoolean(verified)) return unavailable;
            long end = Convert.ToInt64(expiry);
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (end <= now || end > now + 35000L) return unavailable;
            switch (Convert.ToString(phase))
            {
                case "IDLE": return "Android : prêt (observation récente)";
                case "CAPTURING": return "Android : écoute (observation récente)";
                case "TRANSCRIBING": return "Android : transcription (observation récente)";
                case "THINKING": return "Android : traitement (observation récente)";
                case "RESPONDING": return "Android : réponse vocale (observation récente)";
                case "OTHER_BUSY": return "Android : autre opération (observation récente)";
                case "ERROR": return "Android : erreur (observation récente)";
                default: return unavailable;
            }
        }
        catch { return unavailable; }
    }

    public static List<Dictionary<string, object>> Devices()
    {
        var list = new List<Dictionary<string, object>>();
        try
        {
            var o = Obj(Http(Server + "/api/computer/v1/companions", "GET", null, DeviceHeaders()));
            object devices;
            if (o.TryGetValue("devices", out devices))
            {
                var arr = devices as object[];
                if (arr != null) foreach (var item in arr)
                {
                    var d = item as Dictionary<string, object>; if (d != null) list.Add(d);
                }
                var al = devices as System.Collections.ArrayList;
                if (al != null) foreach (var item in al)
                {
                    var d = item as Dictionary<string, object>; if (d != null) list.Add(d);
                }
            }
        }
        catch { }
        return list;
    }

    public static void RunSelfTest()
    {
        Directory.CreateDirectory(MelDir);
        var report = new Dictionary<string, object>();
        report["schema"] = "mel.windows-companion-self-test.v1";
        report["version"] = Version;
        report["timestamp_utc"] = DateTime.UtcNow.ToString("o");
        report["config_loaded"] = LoadConfig();
        report["startup_enabled"] = StartupEnabled();
        report["installed_exe"] = File.Exists(InstalledExe);
        report["installed_engine"] = File.Exists(CompanionPath);
        report["global_hotkey"] = HotKeyLabel;
        report["allowed_app_count"] = ConfigList("allowed_apps").Count;
        report["allowed_path_count"] = ConfigList("allowed_paths").Count;
        report["remote_access_enabled"] = ConfigBool("remote_access_enabled");

        if ((bool)report["config_loaded"])
        {
            report["heartbeat_ok"] = Heartbeat();
            var cleanDevices = new List<Dictionary<string, object>>();
            foreach (var d in Devices())
            {
                var clean = new Dictionary<string, object>();
                foreach (var key in new [] {"device_id","name","kind","model","online","last_seen_at","phase","firmware","battery","wifi_rssi","camera","microphone","speaker","network","charging","live_stream"})
                {
                    object value;
                    if (d.TryGetValue(key, out value)) clean[key] = value;
                }
                cleanDevices.Add(clean);
            }
            report["devices"] = cleanDevices;
            report["device_count"] = cleanDevices.Count;
        }
        else
        {
            report["heartbeat_ok"] = false;
            report["devices"] = new List<Dictionary<string, object>>();
            report["device_count"] = 0;
        }

        File.WriteAllText(SelfTestPath, Json.Serialize(report), new UTF8Encoding(false));
    }

    public static void OpenMel() { try { Process.Start(Server); } catch { } }

    public static Icon MakeIcon()
    {
        // One high-contrast initial, intentionally legible at 16x16 in the Windows tray.
        using (var bmp = new Bitmap(32, 32))
        using (var g = Graphics.FromImage(bmp))
        using (var fill = new SolidBrush(Color.FromArgb(37, 91, 164)))
        using (var white = new SolidBrush(Color.White))
        using (var font = new Font("Segoe UI", 20f, FontStyle.Bold, GraphicsUnit.Pixel))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            g.Clear(Color.Transparent);
            g.FillEllipse(fill, 1, 1, 30, 30);
            var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("M", font, white, new RectangleF(1, 1, 30, 29), fmt);
            return Icon.FromHandle(bmp.GetHicon());
        }
    }

    public static Button TechButton(string text, int x, int y, int w, int h, bool primary)
    {
        var b = new MelRoundedButton();
        b.Text = text; b.SetBounds(x,y,w,h);
        b.Primary = primary;
        b.BackColor = primary ? Cyan : Color.FromArgb(18,33,58);
        b.ForeColor = primary ? Color.FromArgb(3,18,27) : Text;
        b.Font = new Font("Segoe UI Semibold", 8.5f, FontStyle.Bold);
        b.Cursor = Cursors.Hand;
        return b;
    }

    public static Label Label(string text, int x, int y, int w, int h, float size, Color color, FontStyle style)
    {
        var l = new Label(); l.Text = text; l.SetBounds(x,y,w,h); l.ForeColor = color; l.BackColor = Color.Transparent;
        l.Font = new Font("Segoe UI", size, style); l.AutoEllipsis = true; l.UseCompatibleTextRendering = false; return l;
    }

    public static MelCard Card(int x, int y, int w, int h, Color accent)
    {
        var p = new MelCard();
        p.SetBounds(x,y,w,h);
        p.Accent = accent;
        return p;
    }

    public static Label Pill(string text, int x, int y, int w, int h, Color color)
    {
        var p = new MelPill();
        p.Text = text; p.SetBounds(x,y,w,h); p.PillColor = color;
        p.ForeColor = Text; p.Font = new Font("Segoe UI Semibold", 8f, FontStyle.Bold);
        p.TextAlign = ContentAlignment.MiddleCenter;
        return p;
    }

    public static void StyleTextBox(TextBox box)
    {
        box.BackColor = Color.FromArgb(8,18,34);
        box.ForeColor = Text;
        box.BorderStyle = BorderStyle.FixedSingle;
        box.Font = new Font("Segoe UI", 10f, FontStyle.Regular);
    }

    public static void PaintBackdrop(Graphics g, int width, int height)
    {
        using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
            new Rectangle(0,0,width,height),
            Color.FromArgb(4,9,20),
            Color.FromArgb(8,22,39),
            90f))
        {
            g.FillRectangle(brush,0,0,width,height);
        }

        using (var grid = new Pen(Color.FromArgb(16,34,211,238),1f))
        {
            for (int x=0; x<width; x+=36) g.DrawLine(grid,x,0,x,height);
            for (int y=0; y<height; y+=36) g.DrawLine(grid,0,y,width,y);
        }

        using (var glow = new SolidBrush(Color.FromArgb(26,34,211,238)))
        {
            g.FillEllipse(glow, -90, -110, 360, 280);
        }
        using (var glow2 = new SolidBrush(Color.FromArgb(20,157,110,255)))
        {
            g.FillEllipse(glow2, width-260, height-220, 360, 320);
        }
    }

    public static bool Pair(string server, string user, string pass, out string error)
    {
        error = "";
        try
        {
            server = server.Trim().TrimEnd('/');
            var auth = Convert.ToBase64String(Encoding.UTF8.GetBytes(user + ":" + pass));
            var h = new Dictionary<string,string>(); h["Authorization"] = "Basic " + auth;
            var code = S(Obj(Http(server + "/api/computer/v1/pair-code", "POST", "{}", h)), "code");
            if (code.Length == 0) throw new Exception("Code d'appairage non reçu.");
            pass = null; auth = null;

            var computerId = Environment.MachineName + "-" + Guid.NewGuid().ToString("N").Substring(0,8);
            var body = new Dictionary<string, object>();
            body["pair_code"] = code; body["computer_id"] = computerId; body["name"] = "PC " + Environment.MachineName;
            body["platform"] = "windows"; body["version"] = Version;
            body["allowed_apps"] = new string[] { "notepad","calculator","explorer","msedge","firefox","chrome" };
            body["allowed_paths"] = new string[] {
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"Downloads")
            };
            var token = S(Obj(Http(server + "/api/computer/v1/pair", "POST", Json.Serialize(body), null)), "token");
            if (token.Length < 20) throw new Exception("Jeton d'appairage invalide.");
            SaveConfig(server, computerId, token);
            return LoadConfig();
        }
        catch (Exception ex) { error = ex.Message; return false; }
    }

    public static void BuildTray()
    {
        Tray = new NotifyIcon(); Tray.Icon = MakeIcon(); Tray.Text = "MEL Companion"; Tray.Visible = true;
        var menu = new ContextMenuStrip(); menu.BackColor = Panel; menu.ForeColor = Text; menu.Font = new Font("Segoe UI", 10);
        var open = menu.Items.Add("Ouvrir MEL"); var show = menu.Items.Add("Afficher le compagnon");
        var permissions = menu.Items.Add("Autorisations");
        menu.Items.Add("-"); var quit = menu.Items.Add("Quitter MEL Companion");
        open.Click += delegate { OpenMel(); }; show.Click += delegate { ShowMain(); };
        permissions.Click += delegate { using (var form = new PermissionsForm()) form.ShowDialog(); };
        quit.Click += delegate { Exit(); };
        Tray.ContextMenuStrip = menu;
        Tray.MouseClick += delegate(object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) ShowMain(); };
        Tray.DoubleClick += delegate { OpenMel(); };
    }

    public static void ShowMain()
    {
        if (Main == null || Main.IsDisposed) Main = new MainForm();
        if (!Main.Visible) Main.Show();
        if (Main.WindowState == FormWindowState.Minimized) Main.WindowState = FormWindowState.Normal;
        Main.BringToFront(); Main.Activate();
    }

    public static void Exit()
    {
        Exiting = true;
        if (Tray != null) { Tray.Visible = false; Tray.Dispose(); }
        try { if (HotKey != null) { HotKey.Dispose(); HotKey = null; } } catch { }
        try { if (CompanionProcess != null && !CompanionProcess.HasExited) CompanionProcess.Kill(); } catch { }
        Application.Exit();
    }

    public static void Uninstall()
    {
        if (MessageBox.Show("Retirer MEL Companion de cet ordinateur ?", "MEL Companion", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        ConfigureStartup(false); Exiting = true; if (Tray != null) Tray.Visible = false;
        try { if (CompanionProcess != null && !CompanionProcess.HasExited) CompanionProcess.Kill(); } catch { }
        var cmd = Path.Combine(Path.GetTempPath(), "mel-remove-" + Guid.NewGuid().ToString("N") + ".cmd");
        File.WriteAllText(cmd, "@echo off\r\ntimeout /t 2 /nobreak >nul\r\nrmdir /s /q \"" + MelDir + "\"\r\ndel \"%~f0\"\r\n", Encoding.ASCII);
        Process.Start(new ProcessStartInfo(cmd){UseShellExecute=true,WindowStyle=ProcessWindowStyle.Hidden}); Application.Exit();
    }
}

// MEL Techno face is generated entirely with GDI+ above: no external logo asset is required.
class MelCard : Panel
{
    public Color Accent = MelApp.Cyan;
    public int Radius = 22;
    public MelCard()
    {
        DoubleBuffered = true;
        BackColor = Color.Transparent;
        Resize += delegate { ApplyRegion(); };
    }
    void ApplyRegion()
    {
        if (Width <= 0 || Height <= 0) return;
        using (var path = Rounded(new Rectangle(0,0,Width,Height), Radius))
            Region = new Region(path);
    }
    static System.Drawing.Drawing2D.GraphicsPath Rounded(Rectangle r, int radius)
    {
        var path = new System.Drawing.Drawing2D.GraphicsPath();
        int d = Math.Max(2, radius * 2);
        path.AddArc(r.Left, r.Top, d, d, 180, 90);
        path.AddArc(r.Right-d, r.Top, d, d, 270, 90);
        path.AddArc(r.Right-d, r.Bottom-d, d, d, 0, 90);
        path.AddArc(r.Left, r.Bottom-d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using (var path = Rounded(new Rectangle(0,0,Width-1,Height-1), Radius))
        using (var fill = new SolidBrush(Color.FromArgb(232,13,24,45)))
        using (var border = new Pen(Color.FromArgb(90,Accent),1f))
        {
            e.Graphics.FillPath(fill,path);
            e.Graphics.DrawPath(border,path);
        }
        using (var top = new Pen(Color.FromArgb(155,Accent),2f))
            e.Graphics.DrawLine(top, Radius, 1, Math.Max(Radius,Width-Radius), 1);
    }
}

class MelRoundedButton : Button
{
    public bool Primary;
    bool hover;
    public MelRoundedButton()
    {
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        UseCompatibleTextRendering = false;
        DoubleBuffered = true;
        MouseEnter += delegate { hover=true; Invalidate(); };
        MouseLeave += delegate { hover=false; Invalidate(); };
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var r = new Rectangle(0,0,Width-1,Height-1);
        using (var path = new System.Drawing.Drawing2D.GraphicsPath())
        {
            int radius = Math.Min(15, Height/2);
            int d = radius*2;
            path.AddArc(r.Left,r.Top,d,d,180,90);
            path.AddArc(r.Right-d,r.Top,d,d,270,90);
            path.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
            path.AddArc(r.Left,r.Bottom-d,d,d,90,90);
            path.CloseFigure();
            Color bg = Primary
                ? (hover ? Color.FromArgb(94,238,255) : MelApp.Cyan)
                : (hover ? Color.FromArgb(31,51,79) : Color.FromArgb(18,33,58));
            using (var fill = new SolidBrush(bg)) e.Graphics.FillPath(fill,path);
            using (var pen = new Pen(Primary ? Color.FromArgb(130,255,255,255) : MelApp.Line,1f))
                e.Graphics.DrawPath(pen,path);
        }
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}

class MelPill : Label
{
    public Color PillColor = MelApp.Cyan;
    public MelPill()
    {
        BackColor = Color.Transparent;
        AutoEllipsis = true;
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var r = new Rectangle(0,0,Width-1,Height-1);
        using (var path = new System.Drawing.Drawing2D.GraphicsPath())
        {
            int radius = Math.Min(12, Height/2);
            int d=radius*2;
            path.AddArc(r.Left,r.Top,d,d,180,90);
            path.AddArc(r.Right-d,r.Top,d,d,270,90);
            path.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
            path.AddArc(r.Left,r.Bottom-d,d,d,90,90);
            path.CloseFigure();
            using (var fill = new SolidBrush(Color.FromArgb(36,PillColor))) e.Graphics.FillPath(fill,path);
            using (var pen = new Pen(Color.FromArgb(120,PillColor),1f)) e.Graphics.DrawPath(pen,path);
        }
        TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, ForeColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}

class HotKeyWindow : NativeWindow, IDisposable
{
    const int WM_HOTKEY = 0x0312;
    const int HOTKEY_ID = 0x4D45;
    const uint MOD_ALT = 0x0001;
    const uint MOD_CONTROL = 0x0002;
    const uint VK_M = 0x4D;

    [DllImport("user32.dll", SetLastError=true)]
    static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError=true)]
    static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public bool Registered { get; private set; }

    public HotKeyWindow()
    {
        CreateHandle(new CreateParams());
        Registered = RegisterHotKey(Handle, HOTKEY_ID, MOD_CONTROL | MOD_ALT, VK_M);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WM_HOTKEY && message.WParam.ToInt32() == HOTKEY_ID)
        {
            MelApp.ShowMain();
            return;
        }
        base.WndProc(ref message);
    }

    public void Dispose()
    {
        if (Registered)
        {
            try { UnregisterHotKey(Handle, HOTKEY_ID); } catch { }
            Registered = false;
        }
        try { DestroyHandle(); } catch { }
    }
}

class SetupForm : Form
{
    TextBox server = new TextBox(), user = new TextBox(), pass = new TextBox();
    CheckBox startup = new CheckBox(); Label status;

    public SetupForm()
    {
        Text = "MEL Techno Companion — installation"; ClientSize = new Size(800, 560);
        StartPosition = FormStartPosition.CenterScreen; FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; BackColor = MelApp.Bg; ForeColor = MelApp.Text;
        AutoScaleMode = AutoScaleMode.None; Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        DoubleBuffered = true;
        Paint += delegate(object s, PaintEventArgs e){ MelApp.PaintBackdrop(e.Graphics, ClientSize.Width, ClientSize.Height); };

        Controls.Add(MelApp.MelFace(32,24,96));
        Controls.Add(MelApp.Label("MEL TECHNO",148,30,300,36,18,MelApp.Cyan,FontStyle.Bold));
        Controls.Add(MelApp.Label("COMPAGNON // WINDOWS",148,66,320,26,10.5f,MelApp.Text,FontStyle.Bold));
        Controls.Add(MelApp.Label("Connexion locale sécurisée au même écosystème que MEL Mobile et MINI.",148,92,560,22,9,MelApp.Muted,FontStyle.Regular));
        Controls.Add(MelApp.Pill("LIAISON SÉCURISÉE",610,38,150,26,MelApp.Violet));

        var p = MelApp.Card(38,142,724,300,MelApp.Cyan); Controls.Add(p);
        p.Controls.Add(MelApp.Label("APPAIRAGE MEL",26,20,220,26,10,MelApp.Cyan,FontStyle.Bold));
        p.Controls.Add(MelApp.Label("Associe ce PC à ton compte MEL. Les identifiants ne sont jamais conservés.",26,48,650,24,9,MelApp.Muted,FontStyle.Regular));
        p.Controls.Add(MelApp.Label("Adresse MEL",26,88,180,22,9,MelApp.Muted,FontStyle.Regular));
        server.SetBounds(26,112,672,34); server.Text = MelApp.DefaultServer; MelApp.StyleTextBox(server); p.Controls.Add(server);
        p.Controls.Add(MelApp.Label("Utilisateur",26,158,180,22,9,MelApp.Muted,FontStyle.Regular));
        user.SetBounds(26,182,315,34); user.Text = "adrien"; MelApp.StyleTextBox(user); p.Controls.Add(user);
        p.Controls.Add(MelApp.Label("Mot de passe",383,158,180,22,9,MelApp.Muted,FontStyle.Regular));
        pass.SetBounds(383,182,315,34); pass.UseSystemPasswordChar = true; MelApp.StyleTextBox(pass); p.Controls.Add(pass);
        startup.Text = "Lancer MEL Companion avec Windows"; startup.Checked = true;
        startup.ForeColor = MelApp.Text; startup.BackColor = Color.Transparent; startup.AutoSize = true; startup.SetBounds(26,244,350,30); p.Controls.Add(startup);

        status = MelApp.Label("Prêt à appairer ce PC.",42,466,480,30,9.5f,MelApp.Muted,FontStyle.Bold); Controls.Add(status);
        var quit = MelApp.TechButton("ANNULER",548,462,98,40,false); quit.Click += delegate { Close(); }; Controls.Add(quit);
        var go = MelApp.TechButton("CONNECTER",658,462,104,40,true); go.Click += Connect; Controls.Add(go); AcceptButton = go;
    }

    void Connect(object sender, EventArgs e)
    {
        if (pass.Text.Length == 0) { status.Text="Mot de passe requis."; status.ForeColor=MelApp.Red; return; }
        status.Text="Appairage sécurisé en cours…"; status.ForeColor=MelApp.Cyan; Refresh();
        string err;
        if (!MelApp.Pair(server.Text, user.Text.Trim().Length>0?user.Text.Trim():"adrien", pass.Text, out err))
        { pass.Text=""; status.Text="Échec : " + err; status.ForeColor=MelApp.Red; return; }
        pass.Text=""; MelApp.InstallFiles(startup.Checked); status.Text="Ordinateur connecté ✓"; status.ForeColor=MelApp.Green; Refresh();
        Thread.Sleep(450); DialogResult=DialogResult.OK; Close();
    }
}

class PermissionsForm : Form
{
    readonly List<CheckBox> appBoxes = new List<CheckBox>();
    readonly List<CheckBox> pathBoxes = new List<CheckBox>();
    CheckBox remoteAccess;
    CheckBox localCompute;
    CheckBox gpuCompute;
    ComboBox computeProfile;
    readonly string[] paths = MelApp.PermissionPaths();
    readonly Color ink = Color.FromArgb(34,45,60);
    readonly Color muted = Color.FromArgb(88,102,118);

    Label Caption(string value, float size, bool strong)
    {
        return new Label { Text=value, Dock=DockStyle.Top, Height=strong?42:34,
            ForeColor=strong?ink:muted, BackColor=Color.Transparent,
            Font=new Font("Segoe UI",size,strong?FontStyle.Bold:FontStyle.Regular),
            AutoEllipsis=false, TextAlign=ContentAlignment.MiddleLeft };
    }
    Panel Section(string title, int height)
    {
        var section=new Panel { Dock=DockStyle.Top, Height=height, BackColor=Color.White, Padding=new Padding(18,12,18,8) };
        var head=Caption(title,11,true);head.Dock=DockStyle.Top;
        section.Controls.Add(head);
        return section;
    }
    public PermissionsForm()
    {
        Text="MEL Companion — Autorisations";
        ClientSize=new Size(820,700);
        MinimumSize=new Size(690,580);
        StartPosition=FormStartPosition.CenterParent;
        AutoScaleMode=AutoScaleMode.None;
        Font=new Font("Segoe UI",10f);
        BackColor=Color.FromArgb(245,247,250);
        ForeColor=ink;

        var footer=new Panel { Dock=DockStyle.Bottom,Height=112,Padding=new Padding(22,12,22,12),
            BackColor=Color.FromArgb(245,247,250) };
        var note=new Label { Text="Les modifications s'appliquent uniquement aux autorisations locales de MEL.",
            Dock=DockStyle.Top,Height=34,ForeColor=muted,Font=new Font("Segoe UI",9f),
            TextAlign=ContentAlignment.MiddleLeft };
        footer.Controls.Add(note);
        var actions=new FlowLayoutPanel { Dock=DockStyle.Bottom, Height=52,
            FlowDirection=FlowDirection.RightToLeft,WrapContents=false };
        var save=new Button {Text="Appliquer",Width=145,Height=42,Font=new Font("Segoe UI",10f)};
        save.Click+=Apply; actions.Controls.Add(save);
        var cancel=new Button {Text="Annuler",Width=125,Height=42,Font=new Font("Segoe UI",10f)};
        cancel.Click+=delegate{Close();}; actions.Controls.Add(cancel);
        footer.Controls.Add(actions);
        Controls.Add(footer);

        // Avoid AutoSize FlowLayoutPanel + Dock Fill: WinForms can collapse its
        // content to zero height before layout, leaving an empty dialog.
        var scroll=new Panel {Dock=DockStyle.Fill,AutoScroll=true,BackColor=Color.FromArgb(245,247,250)};
        Controls.Add(scroll);
        // Explicitly place the scroll area above the footer.
        scroll.BringToFront();
        footer.BringToFront();
        var content=new Panel {Location=new Point(0,0),Width=scroll.ClientSize.Width,Height=630,
            BackColor=Color.FromArgb(245,247,250)};
        scroll.Controls.Add(content);
        var header=Caption("Autorisations locales",15,true);
        header.Dock=DockStyle.None;header.SetBounds(22,18,700,50);content.Controls.Add(header);
        var subtitle=Caption("Applications et dossiers auxquels MEL peut accéder",10,false);
        subtitle.Dock=DockStyle.None;subtitle.SetBounds(22,72,700,40);content.Controls.Add(subtitle);

        var currentApps=MelApp.ConfigList("allowed_apps");
        var currentPaths=MelApp.ConfigList("allowed_paths");
        var appsTitle=Caption("APPLICATIONS",11,true);
        appsTitle.Dock=DockStyle.None;appsTitle.SetBounds(22,126,650,38);content.Controls.Add(appsTitle);
        for(int i=0;i<MelApp.PermissionApps.Length;i++)
        {
            int column=i<3?0:1, row=i<3?i:i-3;
            var cb=new CheckBox {Text=MelApp.PermissionAppLabels[i],Tag=MelApp.PermissionApps[i],
                Checked=MelApp.ContainsIgnoreCase(currentApps,MelApp.PermissionApps[i]),
                Font=new Font("Segoe UI",10f),ForeColor=ink,AutoSize=false,
                Size=new Size(320,38),Location=new Point(24+column*350,176+row*48)};
            content.Controls.Add(cb);appBoxes.Add(cb);
        }
        int pathHeadingY=588;
        remoteAccess=new CheckBox {
            Text="Autoriser MEL à accéder à ce PC en mon absence (écran, commandes, fichiers, processus)",
            Checked=MelApp.ConfigBool("remote_access_enabled"),
            Font=new Font("Segoe UI",10f,FontStyle.Bold),ForeColor=ink,AutoSize=false,
            Size=new Size(740,52),Location=new Point(24,320)
        };
        content.Controls.Add(remoteAccess);
        localCompute=new CheckBox {
            Text="Autoriser MEL a utiliser le calcul local de ce PC (facultatif)",
            Checked=MelApp.ConfigBool("local_compute_enabled"),
            Font=new Font("Segoe UI",10f,FontStyle.Bold),ForeColor=ink,AutoSize=false,
            Size=new Size(740,48),Location=new Point(24,377)
        };
        content.Controls.Add(localCompute);
        var computeLabel=Caption("Profil de charge cible : non encore applique aux ressources Windows",9,false);
        computeLabel.Dock=DockStyle.None;computeLabel.SetBounds(24,427,720,31);
        content.Controls.Add(computeLabel);
        computeProfile=new ComboBox {
            DropDownStyle=ComboBoxStyle.DropDownList,
            Font=new Font("Segoe UI",10f),Location=new Point(24,463),Width=250
        };
        computeProfile.Items.AddRange(new object[]{"Leger (CPU cible 15%)","Equilibre (CPU cible 35%)","Performances (CPU cible 60%)"});
        var savedProfile=MelApp.ConfigString("local_compute_profile");
        computeProfile.SelectedIndex=savedProfile=="balanced"?1:savedProfile=="performance"?2:0;
        content.Controls.Add(computeProfile);
        gpuCompute=new CheckBox {
            Text="Autoriser aussi le GPU (couches limitees, pas un plafond % garanti)",
            Checked=MelApp.ConfigBool("local_compute_gpu_enabled"),
            Font=new Font("Segoe UI",10f,FontStyle.Bold),ForeColor=ink,AutoSize=false,
            Size=new Size(740,48),Location=new Point(24,510),
            Enabled=localCompute.Checked
        };
        content.Controls.Add(gpuCompute);
        localCompute.CheckedChanged+=delegate {gpuCompute.Enabled=localCompute.Checked;};

        var folderTitle=Caption("DOSSIERS",11,true);
        folderTitle.Dock=DockStyle.None;folderTitle.SetBounds(22,pathHeadingY,650,40);
        content.Controls.Add(folderTitle);
        for(int i=0;i<paths.Length;i++)
        {
            var cb=new CheckBox {Text=paths[i],Tag=paths[i],
                Checked=MelApp.ContainsIgnoreCase(currentPaths,paths[i]),
                Font=new Font("Segoe UI",9f),ForeColor=ink,AutoSize=false,
                AutoEllipsis=true,Size=new Size(725,42),
                Location=new Point(24,pathHeadingY+48+i*48)};
            content.Controls.Add(cb);pathBoxes.Add(cb);
        }
        content.Height=Math.Max(795,pathHeadingY+75+paths.Length*48);
        scroll.Resize+=delegate {
            content.Width=Math.Max(620,scroll.ClientSize.Width-8);
            header.Width=content.Width-44;subtitle.Width=content.Width-44;
            appsTitle.Width=content.Width-44;folderTitle.Width=content.Width-44;
            foreach(var cb in pathBoxes)cb.Width=content.Width-48;
        };
        // Guarantee a nonzero extent and visible scroll range on first display.
        Shown+=delegate {scroll.AutoScrollMinSize=new Size(0,content.Height+12);};
    }
    void Apply(object sender,EventArgs e)
    {
        var apps=new List<string>();
        foreach(var cb in appBoxes)if(cb.Checked)apps.Add(Convert.ToString(cb.Tag));
        var allowedPaths=new List<string>();
        foreach(var cb in pathBoxes)if(cb.Checked)allowedPaths.Add(Convert.ToString(cb.Tag));
        try {
            var profile=computeProfile.SelectedIndex==1?"balanced":computeProfile.SelectedIndex==2?"performance":"light";
            MelApp.SavePermissions(apps,allowedPaths,remoteAccess!=null&&remoteAccess.Checked,
                localCompute!=null&&localCompute.Checked,profile,
                gpuCompute!=null&&gpuCompute.Checked);
            MessageBox.Show("Autorisations appliquées. Le moteur MEL a été rechargé.",
                "MEL Companion",MessageBoxButtons.OK,MessageBoxIcon.Information);
            DialogResult=DialogResult.OK;Close();
        }catch(Exception ex) {
            MessageBox.Show("Impossible d'appliquer les autorisations : "+ex.Message,
                "MEL Companion",MessageBoxButtons.OK,MessageBoxIcon.Error);
        }
    }
}

class MainForm : Form
{
    Label connection;
    Label adbWifiStatus;
    Label triadActivityStatus;
    Panel cards;
    CheckBox autostart;
    System.Windows.Forms.Timer poll;
    System.Windows.Forms.Timer triadPoll;
    int triadRefreshing;
    int adbRefreshBusy;
    bool refreshing;
    readonly Color text=Color.FromArgb(34,45,60);
    readonly Color gray=Color.FromArgb(88,102,118);
    readonly Color blue=Color.FromArgb(38,96,173);
    readonly Color background=Color.FromArgb(245,247,250);
    readonly Color stroke=Color.FromArgb(220,226,233);
    readonly List<Control> cardRows=new List<Control>();
    Label LabelAt(Control parent,string value,int x,int y,int w,int h,float font=11f,bool bold=false,Color? ink=null)
    {
        var label=new Label {Text=value,Location=new Point(x,y),Size=new Size(w,h),
            Font=new Font("Segoe UI",font,bold?FontStyle.Bold:FontStyle.Regular),
            ForeColor=ink??text,BackColor=Color.Transparent,AutoSize=false,
            TextAlign=ContentAlignment.TopLeft,AutoEllipsis=true};
        parent.Controls.Add(label);return label;
    }
    Button ButtonAt(Control parent,string title,int x,int y,int w,EventHandler action)
    {
        var primary=title=="Ouvrir MEL" || title=="Actualiser";
        var danger=title=="Désinstaller";
        var button=new Button {Text=title,Location=new Point(x,y),Size=new Size(w,44),
            FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",10f,FontStyle.Bold),
            UseVisualStyleBackColor=false,Cursor=Cursors.Hand,TabStop=true,
            BackColor=primary?blue:Color.White,
            ForeColor=primary?Color.White:(danger?Color.FromArgb(154,39,51):text)};
        button.FlatAppearance.BorderSize=1;
        button.FlatAppearance.BorderColor=primary?blue:(danger?Color.FromArgb(216,163,169):stroke);
        button.FlatAppearance.MouseOverBackColor=primary?Color.FromArgb(28,80,150):Color.FromArgb(234,240,248);
        button.FlatAppearance.MouseDownBackColor=primary?Color.FromArgb(23,67,125):Color.FromArgb(222,232,245);
        button.Click+=action;parent.Controls.Add(button);return button;
    }
    Panel Card(Control parent,int y,int height)
    {
        var p=new Panel {Location=new Point(0,y),Size=new Size(Math.Max(350,parent.ClientSize.Width-26),height),
            BackColor=Color.White};
        p.Paint+=delegate(object sender,PaintEventArgs ev){
            using(var pen=new Pen(stroke))ev.Graphics.DrawRectangle(pen,0,0,p.Width-1,p.Height-1);
        };
        parent.Controls.Add(p);return p;
    }
    public MainForm()
    {
        Text="MEL Companion — Windows";
        Icon=MelApp.MakeIcon();
        ClientSize=new Size(1000,790);MinimumSize=new Size(790,650);
        StartPosition=FormStartPosition.CenterScreen;
        AutoScaleMode=AutoScaleMode.None;
        Font=new Font("Segoe UI",10f);BackColor=background;ForeColor=text;
        AutoScroll=false;
        LabelAt(this,"MEL Companion",28,22,620,52,12,true);
        connection=LabelAt(this,"Vérification de la connexion…",28,78,670,30,9,false,gray);
        triadActivityStatus=LabelAt(this,"Android : activité non vérifiée",28,106,670,23,9,false,gray);
        triadActivityStatus.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
        ButtonAt(this,"Ouvrir MEL",0,29,160,delegate{MelApp.OpenMel();}).Anchor=AnchorStyles.Top|AnchorStyles.Right;
        var open=Controls.OfType<Button>().Last();
        open.Left=ClientSize.Width-190;
        var pc=Card(this,132,150);pc.Left=22;pc.Width=ClientSize.Width-44;
        pc.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
        LabelAt(pc,"CET ORDINATEUR",20,14,310,36,10,true,blue);
        var miniUsb=ButtonAt(pc,"Contrôle USB MINI",Math.Max(350,pc.Width-232),43,205,RunMiniUsbPreflight);
        miniUsb.Anchor=AnchorStyles.Top|AnchorStyles.Right;
        var androidPair=ButtonAt(pc,"Configurer ADB Wi-Fi",Math.Max(170,pc.Width-450),43,205,RunAndroidWifiPairing);
        androidPair.Anchor=AnchorStyles.Top|AnchorStyles.Right;
        LabelAt(pc,Environment.MachineName,20,57,Math.Max(240,pc.Width-480),40,12,true).Anchor=AnchorStyles.Top|AnchorStyles.Left;
        adbWifiStatus=LabelAt(pc,"ADB Wi-Fi : recherche du téléphone…",20,109,pc.Width-40,31,9,false,gray);
        adbWifiStatus.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
        LabelAt(this,"Appareils MEL",28,302,390,47,12,true);
        var permissions=ButtonAt(this,"Autorisations",0,302,170,delegate{using(var dlg=new PermissionsForm())dlg.ShowDialog(this);});
        var refresh=ButtonAt(this,"Actualiser",0,302,150,delegate{RefreshAll();RefreshAdbDiagnostics();});
        permissions.Anchor=AnchorStyles.Right|AnchorStyles.Top;refresh.Anchor=AnchorStyles.Right|AnchorStyles.Top;
        permissions.Left=ClientSize.Width-370;refresh.Left=ClientSize.Width-180;
        LabelAt(this,"Appareils détectés et état transmis au serveur MEL",28,353,700,34,9,false,gray);
        cards=new Panel {Left=22,Top=398,Width=ClientSize.Width-44,Height=ClientSize.Height-545,
            BackColor=background,AutoScroll=true,Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right};
        Controls.Add(cards);
        var repair=ButtonAt(this,"Réparer",22,0,120,delegate{
            try{MelApp.InstallFiles(autostart.Checked);MelApp.StartCompanion();MessageBox.Show("Moteur relancé.","MEL Companion");}
            catch(Exception ex){MessageBox.Show(ex.Message,"Erreur de réparation");}
        });
        var rep=ButtonAt(this,"Réappairer",154,0,145,RePair);
        var uninstall=ButtonAt(this,"Désinstaller",311,0,145,delegate{MelApp.Uninstall();});
        var aiTest=ButtonAt(this,"Tester IA locale",475,0,175,RunLocalAiBenchmark);
        foreach(var btn in new[]{repair,rep,uninstall,aiTest})btn.Anchor=AnchorStyles.Bottom|AnchorStyles.Left;
        autostart=new CheckBox{Text="Lancer MEL Companion avec Windows",Left=26,Width=520,Height=42,
            Checked=MelApp.StartupEnabled(),Font=new Font("Segoe UI",9f),Anchor=AnchorStyles.Bottom|AnchorStyles.Left};
        autostart.CheckedChanged+=delegate{MelApp.ConfigureStartup(autostart.Checked);};
        Controls.Add(autostart);
        Resize+=delegate {PositionFooter();ResizeCards();};
        cards.Resize+=delegate{ResizeCards();};
        PositionFooter();
        FormClosing+=delegate(object sender,FormClosingEventArgs ev){
            if(!MelApp.Exiting&&ev.CloseReason==CloseReason.UserClosing){ev.Cancel=true;Hide();}
        };
        poll=new System.Windows.Forms.Timer{Interval=30000};
        poll.Tick+=delegate{RefreshAll();};poll.Start();
        triadPoll=new System.Windows.Forms.Timer{Interval=10000};
        triadPoll.Tick+=delegate{RefreshTriadActivity();};triadPoll.Start();
        Shown+=delegate{BeginInvoke((MethodInvoker)delegate{RefreshAll();RefreshTriadActivity();});};
    }
    void RefreshAdbDiagnostics()
    {
        if (IsDisposed || Interlocked.Exchange(ref adbRefreshBusy, 1) != 0) return;
        ThreadPool.QueueUserWorkItem(delegate(object unused) {
            string message = "ADB Wi-Fi : diagnostic indisponible";
            Color color = gray;
            try
            {
                if (!File.Exists(MelApp.AdbWifiPath))
                    message = "ADB Wi-Fi : moniteur absent · réinstaller le Companion";
                else
                {
                    var psi = new ProcessStartInfo("powershell.exe");
                    psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + MelApp.AdbWifiPath + "\" -Once";
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = true;
                    // Do not redirect child pipes unless they are drained; ADB output can fill
                    // the pipe and hang before the timeout is observed.
                    psi.RedirectStandardError = false;
                    psi.RedirectStandardOutput = false;
                    using (var process = Process.Start(psi))
                    {
                        if (process == null)
                            message = "ADB Wi-Fi : impossible de démarrer le diagnostic";
                        else if (!process.WaitForExit(12000))
                        {
                            try { process.Kill(); } catch { }
                            message = "ADB Wi-Fi : diagnostic expiré · réessayez";
                        }
                        else if (process.ExitCode != 0)
                        {
                            message = "ADB Wi-Fi : le diagnostic s’est terminé en erreur";
                        }
                        else
                        {
                            string report = Path.Combine(MelApp.MelDir, "android-adb-wifi.json");
                            if (File.Exists(report))
                            {
                                var a = MelApp.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(report));
                                object connected, available, errorValue, errorDetailValue, model, installed, observed;
                                DateTime when;
                                bool fresh = a.TryGetValue("observed_at_utc", out observed)
                                    && DateTime.TryParse(Convert.ToString(observed), out when)
                                    && (DateTime.UtcNow - when.ToUniversalTime()).TotalSeconds >= -30
                        && (DateTime.UtcNow - when.ToUniversalTime()).TotalSeconds < 75;
                                bool adbAvailable = a.TryGetValue("adb_available", out available) && Convert.ToBoolean(available);
                                bool isConnected = a.TryGetValue("connected", out connected) && Convert.ToBoolean(connected);
                                string errorCode = a.TryGetValue("error", out errorValue) && errorValue != null ? Convert.ToString(errorValue) : "";
                                string errorDetail = a.TryGetValue("error_detail", out errorDetailValue) && errorDetailValue != null ? Convert.ToString(errorDetailValue) : "";
                                string name = a.TryGetValue("android_model", out model) ? Convert.ToString(model) : "";
                                bool hasMel = a.TryGetValue("mel_installed", out installed) && Convert.ToBoolean(installed);
                                message = !fresh ? "ADB Wi-Fi : diagnostic ancien"
                                    : !adbAvailable ? "ADB Wi-Fi : outils ADB introuvables"
                                    : !String.IsNullOrEmpty(errorCode) ? "ADB Wi-Fi : échec · " + errorCode + (String.IsNullOrEmpty(errorDetail) ? "" : " · " + errorDetail)
                                    : isConnected ? "ADB Wi-Fi : connecté · " + name + " · MEL " + (hasMel ? "installée" : "absente")
                                    : "ADB Wi-Fi : non appairé ou déconnecté · Configurer ADB Wi-Fi";
                                color = fresh && isConnected && String.IsNullOrEmpty(errorCode) ? Color.FromArgb(25,125,85) : gray;
                            }
                        }
                    }
                }
            }
            catch { message = "ADB Wi-Fi : échec du diagnostic · ouvrir le journal local"; }
            finally
            {
                try { if (!IsDisposed && IsHandleCreated) BeginInvoke((MethodInvoker)delegate {
                    if (!IsDisposed && adbWifiStatus != null) { adbWifiStatus.Text = message; adbWifiStatus.ForeColor = color; }
                }); } catch { }
                Interlocked.Exchange(ref adbRefreshBusy, 0);
            }
        });
    }

    void RefreshTriadActivity()
    {
        if (!Visible || IsDisposed || Interlocked.Exchange(ref triadRefreshing, 1) != 0) return;
        // Never block the Windows forms event loop on a remote API request.
        ThreadPool.QueueUserWorkItem(delegate(object unused) {
            try
            {
                var label=MelApp.AndroidTriadActivityLabel();
                if (!IsDisposed && IsHandleCreated)
                    BeginInvoke((MethodInvoker)delegate {
                        if (!IsDisposed && triadActivityStatus != null)
                            triadActivityStatus.Text=label;
                    });
            }
            catch { }
            finally { Interlocked.Exchange(ref triadRefreshing, 0); }
        });
    }

    void ResizeCards()
    {
        if(cards==null)return;
        foreach(Control c in cards.Controls)c.Width=Math.Max(350,cards.ClientSize.Width-36);
    }
    void PositionFooter()
    {
        var buttons=Controls.OfType<Button>().Where(b=>b.Text=="Réparer"||b.Text=="Réappairer"||b.Text=="Désinstaller"||b.Text=="Tester IA locale").ToArray();
        foreach(var b in buttons)b.Top=ClientSize.Height-145;
        if(autostart!=null)autostart.Top=ClientSize.Height-88;
    }
    void RunAndroidWifiPairing(object sender,EventArgs e)
    {
        if (!File.Exists(MelApp.AndroidWifiPairingPath))
        {
            MessageBox.Show(this,"Assistant ADB Wi-Fi absent. Réinstallez le package MEL Companion Windows complet.",
                "MEL — Android Wi-Fi",MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return;
        }
        if (MessageBox.Show(this,
            "Cela ouvre un terminal local pour associer ce téléphone à Windows. Le code d'appairage reste uniquement dans ce terminal et ne doit pas être communiqué à MEL. Le téléphone et le PC doivent être sur le même réseau Wi-Fi. Continuer ?",
            "Configurer ADB Wi-Fi",MessageBoxButtons.YesNo,MessageBoxIcon.Information)!=DialogResult.Yes)return;
        try
        {
            var psi=new ProcessStartInfo("powershell.exe");
            psi.UseShellExecute=true;psi.WindowStyle=ProcessWindowStyle.Normal;
            psi.WorkingDirectory=MelApp.MelDir;
            psi.Arguments="-NoProfile -ExecutionPolicy Bypass -NoExit -File \"" +
                MelApp.AndroidWifiPairingPath + "\" -Pair";
            Process.Start(psi);
        }
        catch(Exception ex)
        {
            MessageBox.Show(this,"Impossible d'ouvrir l'assistant ADB Wi-Fi : "+ex.Message,
                "MEL — Android Wi-Fi",MessageBoxButtons.OK,MessageBoxIcon.Error);
        }
    }
    void RunMiniUsbPreflight(object sender,EventArgs e)
    {
        // Never offer remote flashing: this starts a local, interactive,
        // read-only bootloader check requiring a second literal confirmation.
        if (!MelApp.MiniUsbPreflightInstalled())
        {
            MessageBox.Show(this,"Précontrôle MINI incomplet. Réinstallez le paquet Windows officiel.",
                "MEL — USB MINI",MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return;
        }
        string[] available = System.IO.Ports.SerialPort.GetPortNames();
        var ports = available.Where(p=>System.Text.RegularExpressions.Regex.IsMatch(
            p,@"^COM[0-9]{1,3}$",System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            .Select(p=>p.ToUpperInvariant()).Distinct().OrderBy(p=>p).ToArray();
        if (ports.Length==0)
        {
            MessageBox.Show(this,"Aucun port COM détecté. Connectez la MINI par USB et réessayez.",
                "MEL — USB MINI",MessageBoxButtons.OK,MessageBoxIcon.Information);
            return;
        }
        using (var dialog=new Form())
        {
            dialog.Text="Précontrôle local USB MINI";
            dialog.ClientSize=new Size(480,170);dialog.FormBorderStyle=FormBorderStyle.FixedDialog;
            dialog.StartPosition=FormStartPosition.CenterParent;dialog.MaximizeBox=false;dialog.MinimizeBox=false;
            var note=new Label {Text="Sélectionnez le port de la MINI. Lecture seule : la connexion au bootloader peut redémarrer l'appareil. Aucun flashage.",
                Left=16,Top=12,Width=445,Height=58};
            var portList=new ComboBox {Left=16,Top=76,Width=220,DropDownStyle=ComboBoxStyle.DropDownList};
            portList.Items.AddRange(ports.Cast<object>().ToArray());
            int miniPortIndex=Array.IndexOf(ports,"COM3");
            portList.SelectedIndex=miniPortIndex>=0?miniPortIndex:0;
            var cancel=new Button {Text="Annuler",Left=245,Top=118,Width=100,DialogResult=DialogResult.Cancel};
            var start=new Button {Text="Continuer",Left=356,Top=118,Width=108,DialogResult=DialogResult.OK};
            dialog.Controls.Add(note);dialog.Controls.Add(portList);
            dialog.Controls.Add(cancel);dialog.Controls.Add(start);
            dialog.AcceptButton=start;dialog.CancelButton=cancel;
            if (dialog.ShowDialog(this)!=DialogResult.OK)return;
            var port=Convert.ToString(portList.SelectedItem);
            if (!System.Text.RegularExpressions.Regex.IsMatch(port??"", @"^COM[0-9]{1,3}$"))
                throw new InvalidOperationException("Port MINI invalide.");
            if (MessageBox.Show(this,"Le précontrôle peut redémarrer la MINI. Confirmer l'ouverture du terminal local ? Une autorisation textuelle supplémentaire sera demandée.",
                "MEL — USB MINI",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            try
            {
                var psi=new ProcessStartInfo("powershell.exe");
                psi.UseShellExecute=true;psi.WindowStyle=ProcessWindowStyle.Normal;
                psi.WorkingDirectory=MelApp.MelDir;
                psi.Arguments="-NoProfile -ExecutionPolicy Bypass -NoExit -File \""+
                    MelApp.MiniUsbPreflightPath+"\" -Port "+port;
                Process.Start(psi);
            }
            catch(Exception ex)
            {
                MessageBox.Show(this,"Impossible d'ouvrir le précontrôle local : "+ex.Message,
                    "MEL — USB MINI",MessageBoxButtons.OK,MessageBoxIcon.Error);
            }
        }
    }
    void RunLocalAiBenchmark(object sender,EventArgs e)
    {
        var button=sender as Button;
        if(button==null||!button.Enabled)return;
        if(!MelApp.ConfigBool("local_compute_enabled"))
        {
            MessageBox.Show("Activez d'abord le calcul local dans Autorisations. Le GPU reste facultatif.",
                "MEL Companion",MessageBoxButtons.OK,MessageBoxIcon.Information);
            return;
        }
        if(!File.Exists(MelApp.LocalAiBenchmarkPath))
        {
            MessageBox.Show("Diagnostic absent. Réinstallez le Companion depuis l'archive Windows récente.",
                "MEL Companion",MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return;
        }
        if(MessageBox.Show(
            "Lancer un essai Ollama local sur un modèle déjà installé ? Le test peut utiliser le CPU/GPU autorisé et durer jusqu'à 25 secondes. Aucun dialogue n'est envoyé.",
            "Diagnostic IA locale",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        button.Enabled=false;
        ThreadPool.QueueUserWorkItem(delegate(object unused) {
            string message="Diagnostic non disponible.";
            try
            {
                var path=MelApp.LocalAiBenchmarkReportPath;
                try {if(File.Exists(path))File.Delete(path);}catch{}
                var psi=new ProcessStartInfo("powershell.exe");
                psi.Arguments="-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+
                    MelApp.LocalAiBenchmarkPath+"\" -ConfigPath \""+MelApp.ConfigPath+
                    "\" -OutputPath \""+path+"\" -AllowUserActivity";
                psi.UseShellExecute=false;
                psi.CreateNoWindow=true;
                psi.WindowStyle=ProcessWindowStyle.Hidden;
                using(var process=Process.Start(psi))
                {
                    if(process==null)throw new InvalidOperationException("Impossible de démarrer le diagnostic Windows.");
                    if(!process.WaitForExit(45000))
                    {
                        try{process.Kill();}catch{}
                        throw new TimeoutException("Diagnostic interrompu après expiration du délai.");
                    }
                }
                if(!File.Exists(path))throw new InvalidOperationException("Aucun rapport de diagnostic produit.");
                var data=MelApp.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(path));
                object value;
                var status=data.TryGetValue("status",out value)?Convert.ToString(value):"UNKNOWN";
                if(status=="MEASURED")
                {
                    string latency=data.TryGetValue("round_trip_latency_ms",out value)?Convert.ToString(value):"?";
                    string throughput=data.TryGetValue("tokens_per_second",out value)?Convert.ToString(value):"?";
                    message="Essai local effectué. Délai : "+latency+" ms ; débit : "+throughput+
                        " jetons/s. Gain GPU non prouvé. Rapport local : "+path;
                }
                else message="Diagnostic : "+status+". Aucun gain accélérateur présumé. Rapport local : "+path;
            }
            catch(Exception ex){message="Diagnostic indisponible : "+ex.Message;}
            if(!IsDisposed&&IsHandleCreated)
                BeginInvoke((MethodInvoker)delegate {
                    if(IsDisposed)return;
                    button.Enabled=true;
                    MessageBox.Show(this,message,"MEL — IA locale",MessageBoxButtons.OK,MessageBoxIcon.Information);
                });
        });
    }
    void RePair(object sender,EventArgs e)
    {
        if(MessageBox.Show("Réappairer ce PC à MEL ?","MEL Companion",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;
        try{File.Delete(MelApp.ConfigPath);}catch{}
        Hide();var setup=new SetupForm();
        if(setup.ShowDialog()==DialogResult.OK&&MelApp.LoadConfig()){
            MelApp.InstallFiles(autostart.Checked);MelApp.StartCompanion();Show();RefreshAll();
        }else Show();
    }
    string Get(Dictionary<string,object> d,string k)
    {
        object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null?Convert.ToString(v):"";
    }
    bool Bool(Dictionary<string,object> d,string k)
    {
        object v;return d!=null&&d.TryGetValue(k,out v)&&v!=null&&Convert.ToBoolean(v);
    }
    void RefreshAll()
    {
        if(refreshing)return;
        refreshing=true;
        try{
            MelApp.EnsureCompanion();
            var online=MelApp.Heartbeat();
            connection.Text=online?"Connecté à MEL":"Serveur indisponible — reconnexion automatique";
            connection.ForeColor=online?Color.FromArgb(25,125,85):gray;
            if(MelApp.Tray!=null)MelApp.Tray.Text=online?"MEL Companion — connecté":"MEL Companion — reconnexion";
            var adbReport = Path.Combine(MelApp.MelDir, "android-adb-wifi.json");
            adbWifiStatus.Text = "ADB Wi-Fi : en attente du premier diagnostic";
            if (File.Exists(adbReport))
            {
                try
                {
                    var a = MelApp.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(adbReport));
                    object observed, connected, model, installed, available, errorValue, errorDetailValue;
                    DateTime when;
                    bool fresh = a.TryGetValue("observed_at_utc", out observed)
                        && DateTime.TryParse(Convert.ToString(observed), out when)
                        && (DateTime.UtcNow - when.ToUniversalTime()).TotalSeconds >= -30
                        && (DateTime.UtcNow - when.ToUniversalTime()).TotalSeconds < 75;
                    bool isConnected = a.TryGetValue("connected", out connected) && Convert.ToBoolean(connected);
                    bool adbAvailable = a.TryGetValue("adb_available", out available) && Convert.ToBoolean(available);
                    string errorCode = a.TryGetValue("error", out errorValue) && errorValue != null ? Convert.ToString(errorValue) : "";
                    string errorDetail = a.TryGetValue("error_detail", out errorDetailValue) && errorDetailValue != null ? Convert.ToString(errorDetailValue) : "";
                    string name = a.TryGetValue("android_model", out model) ? Convert.ToString(model) : "";
                    bool hasMel = a.TryGetValue("mel_installed", out installed) && Convert.ToBoolean(installed);
                    adbWifiStatus.Text = !fresh ? "ADB Wi-Fi : diagnostic ancien · actualisez"
                        : !adbAvailable ? "ADB Wi-Fi : Android Platform Tools introuvables"
                        : !String.IsNullOrEmpty(errorCode) ? "ADB Wi-Fi : échec · " + errorCode + (String.IsNullOrEmpty(errorDetail) ? "" : " · " + errorDetail)
                        : isConnected ? "ADB Wi-Fi : connecté · " + name + " · MEL " + (hasMel ? "installée" : "absente")
                        : "ADB Wi-Fi : téléphone non appairé ou déconnecté · utilisez Configurer ADB Wi-Fi";
                    adbWifiStatus.ForeColor = fresh && isConnected ? Color.FromArgb(25,125,85) : gray;
                }
                catch { adbWifiStatus.Text = "ADB Wi-Fi : rapport indisponible"; }
            }

            var devices=MelApp.Devices();
            cards.SuspendLayout();cards.Controls.Clear();
            if(devices.Count==0){
                var p=Card(cards,4,104);
                LabelAt(p,"Aucun appareil détecté pour le moment",22,15,p.Width-44,38,12,true);
                LabelAt(p,"La MINI ou Android apparaîtront dès réception de leur état.",22,55,p.Width-44,32,10,false,gray);
            }else{
                int y=4;
                foreach(var d in devices){
                    var p=Card(cards,y,160);
                    var kind=Get(d,"kind")=="android"?"Android":"MINI";
                    LabelAt(p,kind+" — "+Get(d,"name"),22,16,p.Width-235,45,12,true)
                        .Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right;
                    var onlineDevice=Bool(d,"online");
                    var status=LabelAt(p,onlineDevice?"En ligne":"Hors ligne",p.Width-175,16,145,40,9,true,
                        onlineDevice?Color.FromArgb(25,125,85):gray);
                    status.Anchor=AnchorStyles.Right|AnchorStyles.Top;
                    var phase=Get(d,"phase");
                    var firmware=Get(d,"firmware");
                    // A stale phase can still say ONLINE after the current transport went offline.
                    // Keep the authoritative connection badge and explain the older reported phase.
                    var detail=!onlineDevice && string.Equals(phase,"ONLINE",StringComparison.OrdinalIgnoreCase)
                        ? "Dernier état reçu : ONLINE · connexion actuelle hors ligne · "+firmware
                        : phase+"  ·  "+firmware;
                    LabelAt(p,detail,22,68,p.Width-44,40,9,false,gray)
                        .Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right;
                    var cam=ButtonAt(p,"Caméra",22,110,140,delegate{
                        if(Bool(d,"live_stream"))MelApp.OpenMel();
                        else MessageBox.Show("Aucun flux vidéo live n'est disponible pour cet appareil.","MEL Companion");
                    });
                    cam.Enabled=Bool(d,"camera");
                    y+=178;
                }
            }
            cards.ResumeLayout();ResizeCards();
        }catch(Exception ex){
            connection.Text="Erreur : "+ex.GetType().Name;
            try{Directory.CreateDirectory(MelApp.MelDir);
                File.AppendAllText(Path.Combine(MelApp.MelDir,"companion-ui.log"),
                    DateTime.UtcNow.ToString("o")+" "+ex+Environment.NewLine);}catch{}
        }finally{refreshing=false;}
    }
}

class Program
{
    static Mutex mutex;
    static void StartupError(string stage, Exception ex)
    {
        try
        {
            Directory.CreateDirectory(MelApp.MelDir);
            File.AppendAllText(Path.Combine(MelApp.MelDir, "companion-startup.log"),
                DateTime.UtcNow.ToString("o") + " [" + stage + "] " + ex.ToString() + Environment.NewLine);
        }
        catch { }
    }

    [STAThread]
    static void Main(string[] args)
    {
        MelApp.EnableDpiAwareness();
        bool selfTest = args != null && Array.Exists(args, a => a == "--self-test");
        if (selfTest)
        {
            MelApp.RunSelfTest();
            return;
        }

        bool created; mutex=new Mutex(true,"MEL.Companion.Desktop.v2",out created);
        if (!created)
        {
            if (args == null || !Array.Exists(args, a => a == "--background"))
                MessageBox.Show("MEL Companion est deja lance dans cette session. Verifiez la zone de notification Windows.", "MEL Companion", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        bool background = args != null && Array.Exists(args, a => a == "--background");
        if (!MelApp.LoadConfig())
        {
            var setup=new SetupForm(); if(setup.ShowDialog()!=DialogResult.OK || !MelApp.LoadConfig()) return;
        }
        try
        {
            // Show the application before network access, script installation, or local engine startup.
            // None of these optional operations should prevent the main window from opening.
            MelApp.Main = new MainForm();
            if (!background) MelApp.Main.Show();
            try { MelApp.BuildTray(); } catch (Exception ex) { StartupError("tray", ex); }
            try { MelApp.HotKey = new HotKeyWindow(); } catch (Exception ex) { StartupError("hotkey", ex); }
            try { MelApp.InstallFiles(MelApp.StartupEnabled()); } catch (Exception ex) { StartupError("install", ex); }
            try { MelApp.StartCompanion(); } catch (Exception ex) { StartupError("engine", ex); }
            try { MelApp.StartBackgroundSupervisor(); } catch (Exception ex) { StartupError("supervisor", ex); }
            // Heartbeat supervision no longer depends on the window being visible.
            Application.Run();
        }
        catch (Exception ex)
        {
            StartupError("fatal", ex);
            MessageBox.Show("Le Companion n'a pas pu demarrer. Consultez le journal dans %LOCALAPPDATA%\\MEL\\companion-startup.log", "MEL Companion", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            try { MelApp.StopBackgroundSupervisor(); } catch { }
            try { if (MelApp.HotKey != null) MelApp.HotKey.Dispose(); } catch { }
            mutex.ReleaseMutex();
        }
    }
}