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
    public const string Version = "2.3.10";
    public static readonly string MelDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MEL");
    public static readonly string ConfigPath = Path.Combine(MelDir, "computer.json");
    public static readonly string InstalledExe = Path.Combine(MelDir, "MEL-Companion.exe");
    public static readonly string CompanionPath = Path.Combine(MelDir, "MEL-Computer-Companion.ps1");
    public static readonly string StartupCmd = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "MEL-Companion.cmd");
    public static readonly string LegacyStartupCmd = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "MEL-Computer-Companion.cmd");
    public static readonly string SelfTestPath = Path.Combine(MelDir, "self-test.json");
    public static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    public static Dictionary<string, object> Config;
    public static string Token;
    public static string Server;
    public static string ComputerId;
    public static Process CompanionProcess;
    public static DateTime LastEngineRefreshUtc = DateTime.MinValue;
    public static string LastEngineRefreshStatus = "NOT_RUN";
    public static string LastEngineRefreshError = "";
    public static NotifyIcon Tray;
    public static HotKeyWindow HotKey;
    public const string HotKeyLabel = "Ctrl+Alt+M";
    public static MainForm Main;
    public static bool Exiting;
    const string CompanionB64 = "__COMPANION_B64__";

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

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
        d["installed_at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        File.WriteAllText(ConfigPath, Json.Serialize(d), new UTF8Encoding(false));
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

    public static void SavePermissions(List<string> apps, List<string> paths)
    {
        if (Config == null && !LoadConfig()) throw new InvalidOperationException("Configuration MEL indisponible.");
        Config["allowed_apps"] = apps.ToArray();
        Config["allowed_paths"] = paths.ToArray();
        File.WriteAllText(ConfigPath, Json.Serialize(Config), new UTF8Encoding(false));
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
                {"engine_refresh_error",LastEngineRefreshError}
            };
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
        using (var bmp = MakeMelTechnoFace(32))
            return Icon.FromHandle(bmp.GetHicon());
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
    readonly string[] paths = MelApp.PermissionPaths();

    public PermissionsForm()
    {
        Text = "MEL Companion — autorisations";
        ClientSize = new Size(720, 610);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = MelApp.Bg;
        ForeColor = MelApp.Text;
        AutoScaleMode = AutoScaleMode.None;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        DoubleBuffered = true;
        Paint += delegate(object s, PaintEventArgs e){ MelApp.PaintBackdrop(e.Graphics, ClientSize.Width, ClientSize.Height); };

        Controls.Add(MelApp.MelFace(28,20,78));
        Controls.Add(MelApp.Label("AUTORISATIONS LOCALES",126,28,380,34,15,MelApp.Cyan,FontStyle.Bold));
        Controls.Add(MelApp.Label("MEL ne dépassera jamais les droits activés ici.",126,62,500,24,9.5f,MelApp.Muted,FontStyle.Regular));
        Controls.Add(MelApp.Pill("LOCAL ONLY",552,30,132,24,MelApp.Violet));

        var currentApps = MelApp.ConfigList("allowed_apps");
        var currentPaths = MelApp.ConfigList("allowed_paths");

        var appsPanel = MelApp.Card(28,116,664,190,MelApp.Cyan); Controls.Add(appsPanel);
        appsPanel.Controls.Add(MelApp.Label("APPLICATIONS",20,14,180,24,9,MelApp.Cyan,FontStyle.Bold));
        appsPanel.Controls.Add(MelApp.Label("Accès autorisé au moteur local",20,36,260,20,8,MelApp.Muted,FontStyle.Regular));
        for (int i=0;i<MelApp.PermissionApps.Length;i++)
        {
            var box = new CheckBox();
            box.Text = MelApp.PermissionAppLabels[i];
            box.Tag = MelApp.PermissionApps[i];
            box.Checked = MelApp.ContainsIgnoreCase(currentApps, MelApp.PermissionApps[i]);
            box.ForeColor = MelApp.Text; box.BackColor = Color.Transparent; box.AutoSize = true;
            box.Font = new Font("Segoe UI",9f,FontStyle.Regular);
            int col = i < 3 ? 0 : 1, row = i < 3 ? i : i-3;
            box.SetBounds(22 + col*306, 70 + row*34, 280, 28);
            appsPanel.Controls.Add(box); appBoxes.Add(box);
        }

        var pathsPanel = MelApp.Card(28,324,664,158,MelApp.Violet); Controls.Add(pathsPanel);
        pathsPanel.Controls.Add(MelApp.Label("DOSSIERS",20,14,180,24,9,MelApp.Violet,FontStyle.Bold));
        for (int i=0;i<paths.Length;i++)
        {
            var box = new CheckBox();
            box.Text = paths[i];
            box.Tag = paths[i];
            box.Checked = MelApp.ContainsIgnoreCase(currentPaths, paths[i]);
            box.ForeColor = MelApp.Text; box.BackColor = Color.Transparent; box.AutoSize = false;
            box.SetBounds(22, 48 + i*30, 610, 25);
            pathsPanel.Controls.Add(box); pathBoxes.Add(box);
        }

        Controls.Add(MelApp.Label("Toute désactivation est immédiate. Une réactivation reste limitée aux droits accordés lors de l’appairage.",32,500,640,40,8.5f,MelApp.Muted,FontStyle.Regular));
        var cancel = MelApp.TechButton("ANNULER",472,548,100,38,false); cancel.Click += delegate { Close(); }; Controls.Add(cancel);
        var save = MelApp.TechButton("APPLIQUER",584,548,108,38,true); save.Click += Apply; Controls.Add(save);
    }

    void Apply(object sender, EventArgs e)
    {
        var apps = new List<string>();
        foreach (var box in appBoxes) if (box.Checked) apps.Add(Convert.ToString(box.Tag));
        var allowedPaths = new List<string>();
        foreach (var box in pathBoxes) if (box.Checked) allowedPaths.Add(Convert.ToString(box.Tag));
        try
        {
            MelApp.SavePermissions(apps, allowedPaths);
            MessageBox.Show("Autorisations appliquées. Le moteur MEL a été rechargé.", "MEL Companion", MessageBoxButtons.OK, MessageBoxIcon.Information);
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Impossible d’appliquer les autorisations : " + ex.Message, "MEL Companion", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

class MainForm : Form
{
    Label connection;
    Panel cards;
    CheckBox autostart;
    System.Windows.Forms.Timer poll;
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
            TextAlign=ContentAlignment.MiddleLeft,AutoEllipsis=true};
        parent.Controls.Add(label);return label;
    }
    Button ButtonAt(Control parent,string title,int x,int y,int w,EventHandler action)
    {
        var button=new Button {Text=title,Location=new Point(x,y),Size=new Size(w,42),
            FlatStyle=FlatStyle.System,Font=new Font("Segoe UI",10f),UseVisualStyleBackColor=true};
        button.Click+=action;parent.Controls.Add(button);return button;
    }
    Panel Card(Control parent,int y,int height)
    {
        var p=new Panel {Location=new Point(0,y),Size=new Size(Math.Max(610,parent.ClientSize.Width-8),height),
            BackColor=Color.White};
        p.Paint+=delegate(object sender,PaintEventArgs ev){
            using(var pen=new Pen(stroke))ev.Graphics.DrawRectangle(pen,0,0,p.Width-1,p.Height-1);
        };
        parent.Controls.Add(p);return p;
    }
    public MainForm()
    {
        Text="MEL Companion — Windows";
        ClientSize=new Size(1000,790);MinimumSize=new Size(790,650);
        StartPosition=FormStartPosition.CenterScreen;
        AutoScaleMode=AutoScaleMode.None;
        Font=new Font("Segoe UI",10f);BackColor=background;ForeColor=text;
        AutoScroll=false;
        LabelAt(this,"MEL Companion",28,22,620,49,22,true);
        connection=LabelAt(this,"Vérification de la connexion…",28,75,670,30,11,false,gray);
        ButtonAt(this,"Ouvrir MEL",0,29,160,delegate{MelApp.OpenMel();}).Anchor=AnchorStyles.Top|AnchorStyles.Right;
        var open=Controls.OfType<Button>().Last();
        open.Left=ClientSize.Width-190;
        var pc=Card(this,122,132);pc.Left=22;pc.Width=ClientSize.Width-44;
        pc.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
        LabelAt(pc,"CET ORDINATEUR",20,12,310,35,11,true,blue);
        LabelAt(pc,Environment.MachineName,20,48,pc.Width-40,36,15,true).Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
        LabelAt(pc,"Moteur local · Autorisations · Connexion MEL",20,89,pc.Width-40,27,10,false,gray)
            .Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right;
        LabelAt(this,"Appareils MEL",28,277,390,46,17,true);
        var permissions=ButtonAt(this,"Autorisations",0,276,150,delegate{using(var dlg=new PermissionsForm())dlg.ShowDialog(this);});
        var refresh=ButtonAt(this,"Actualiser",0,276,130,delegate{RefreshAll();});
        permissions.Anchor=AnchorStyles.Right|AnchorStyles.Top;refresh.Anchor=AnchorStyles.Right|AnchorStyles.Top;
        permissions.Left=ClientSize.Width-322;refresh.Left=ClientSize.Width-160;
        LabelAt(this,"Appareils détectés et état transmis au serveur MEL",28,324,700,28,10,false,gray);
        cards=new Panel {Left=22,Top=365,Width=ClientSize.Width-44,Height=ClientSize.Height-490,
            BackColor=background,AutoScroll=true,Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right};
        Controls.Add(cards);
        var repair=ButtonAt(this,"Réparer",22,0,120,delegate{
            try{MelApp.InstallFiles(autostart.Checked);MelApp.StartCompanion();MessageBox.Show("Moteur relancé.","MEL Companion");}
            catch(Exception ex){MessageBox.Show(ex.Message,"Erreur de réparation");}
        });
        var rep=ButtonAt(this,"Réappairer",154,0,145,RePair);
        var uninstall=ButtonAt(this,"Désinstaller",311,0,145,delegate{MelApp.Uninstall();});
        foreach(var btn in new[]{repair,rep,uninstall})btn.Anchor=AnchorStyles.Bottom|AnchorStyles.Left;
        autostart=new CheckBox{Text="Lancer MEL Companion avec Windows",Left=26,Width=380,Height=32,
            Checked=MelApp.StartupEnabled(),Font=new Font("Segoe UI",10f),Anchor=AnchorStyles.Bottom|AnchorStyles.Left};
        autostart.CheckedChanged+=delegate{MelApp.ConfigureStartup(autostart.Checked);};
        Controls.Add(autostart);
        Resize+=delegate {PositionFooter();};
        PositionFooter();
        FormClosing+=delegate(object sender,FormClosingEventArgs ev){
            if(!MelApp.Exiting&&ev.CloseReason==CloseReason.UserClosing){ev.Cancel=true;Hide();}
        };
        poll=new System.Windows.Forms.Timer{Interval=30000};
        poll.Tick+=delegate{RefreshAll();};poll.Start();
        Shown+=delegate{BeginInvoke((MethodInvoker)delegate{RefreshAll();});};
    }
    void PositionFooter()
    {
        var buttons=Controls.OfType<Button>().Where(b=>b.Text=="Réparer"||b.Text=="Réappairer"||b.Text=="Désinstaller").ToArray();
        foreach(var b in buttons)b.Top=ClientSize.Height-103;
        if(autostart!=null)autostart.Top=ClientSize.Height-53;
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
            var devices=MelApp.Devices();
            cards.SuspendLayout();cards.Controls.Clear();
            if(devices.Count==0){
                var p=Card(cards,4,104);
                LabelAt(p,"Aucun appareil détecté pour le moment",22,15,p.Width-44,38,12,true);
                LabelAt(p,"La MINI ou Android apparaîtront dès réception de leur état.",22,55,p.Width-44,32,10,false,gray);
            }else{
                int y=4;
                foreach(var d in devices){
                    var p=Card(cards,y,146);
                    var kind=Get(d,"kind")=="android"?"Android":"MINI";
                    LabelAt(p,kind+" — "+Get(d,"name"),22,12,p.Width-235,42,14,true)
                        .Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right;
                    var onlineDevice=Bool(d,"online");
                    var status=LabelAt(p,onlineDevice?"En ligne":"Hors ligne",p.Width-175,16,145,34,10,true,
                        onlineDevice?Color.FromArgb(25,125,85):gray);
                    status.Anchor=AnchorStyles.Right|AnchorStyles.Top;
                    LabelAt(p,Get(d,"phase")+"  ·  "+Get(d,"firmware"),22,58,p.Width-44,32,10,false,gray)
                        .Anchor=AnchorStyles.Left|AnchorStyles.Top|AnchorStyles.Right;
                    var cam=ButtonAt(p,"Caméra",22,98,120,delegate{
                        if(Bool(d,"live_stream"))MelApp.OpenMel();
                        else MessageBox.Show("Aucun flux vidéo live n'est disponible pour cet appareil.","MEL Companion");
                    });
                    cam.Enabled=Bool(d,"camera");
                    y+=162;
                }
            }
            cards.ResumeLayout();
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
            // Engine refresh and heartbeat are handled after the UI is visible.
            Application.Run();
        }
        catch (Exception ex)
        {
            StartupError("fatal", ex);
            MessageBox.Show("Le Companion n'a pas pu demarrer. Consultez le journal dans %LOCALAPPDATA%\\MEL\\companion-startup.log", "MEL Companion", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            try { if (MelApp.HotKey != null) MelApp.HotKey.Dispose(); } catch { }
            mutex.ReleaseMutex();
        }
    }
}