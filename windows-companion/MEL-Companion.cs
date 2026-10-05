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
    public const string Version = "2.4.0";
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

    static Image CanonicalAvatarCache;

    public static Image CanonicalAvatar()
    {
        if (CanonicalAvatarCache != null) return CanonicalAvatarCache;
        try
        {
            var asm = typeof(MelApp).Assembly;
            using (var stream = asm.GetManifestResourceStream("MelAvatar.png"))
            {
                if (stream != null)
                {
                    using (var source = Image.FromStream(stream))
                        CanonicalAvatarCache = new Bitmap(source);
                }
            }
        }
        catch { CanonicalAvatarCache = null; }

        if (CanonicalAvatarCache == null) CanonicalAvatarCache = MakeMelTechnoFace(512);
        return CanonicalAvatarCache;
    }

    public static PictureBox MelFace(int x, int y, int size)
    {
        var box = new PictureBox();
        box.SetBounds(x, y, size, size);
        box.BackColor = Color.Transparent;
        box.SizeMode = PictureBoxSizeMode.Zoom;
        box.Image = CanonicalAvatar();
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
                now.Subtract(LastEngineRefreshUtc).TotalMinutes < 10) return false;
            LastEngineRefreshUtc = now;
            if (Server == null || Server.Length == 0 || Token == null || Token.Length < 20 || ComputerId == null || ComputerId.Length == 0)
                return false;

            var latest = Http(Server + "/api/computer/v1/companion", "GET", null, DeviceHeaders());
            if (string.IsNullOrWhiteSpace(latest) || latest.Length < 10000) return false;
            if (!latest.Contains("function Send-Heartbeat") || !latest.Contains("function Perform-Step")) return false;

            var latestBytes = new UTF8Encoding(false).GetBytes(latest);
            var latestHash = Sha256Hex(latestBytes);
            var currentHash = File.Exists(CompanionPath) ? Sha256Hex(File.ReadAllBytes(CompanionPath)) : "";
            if (string.Equals(latestHash, currentHash, StringComparison.OrdinalIgnoreCase)) return false;

            Directory.CreateDirectory(MelDir);
            var temp = CompanionPath + ".update-" + Guid.NewGuid().ToString("N") + ".ps1";
            var backup = CompanionPath + ".previous";
            File.WriteAllBytes(temp, latestBytes);
            if (!ValidatePowerShellFile(temp))
            {
                try { File.Delete(temp); } catch { }
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
            return true;
        }
        catch { return false; }
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
                {"version",Version},{"hostname",Environment.MachineName},{"user",Environment.UserName},{"screen",screen}
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

// MEL visual controls shared by the desktop Companion.
class MelHeroPanel : Control
{
    public string Header = "MEL";
    public string SubHeader = "PERSONAL INTELLIGENCE SYSTEM";
    public MelHeroPanel()
    {
        DoubleBuffered = true;
        BackColor = MelApp.Bg;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
        e.Graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        e.Graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        e.Graphics.Clear(MelApp.Bg);

        var img = MelApp.CanonicalAvatar();
        if (img != null)
        {
            float scale = Math.Max((float)Width / img.Width, (float)Height / img.Height);
            int dw = (int)Math.Ceiling(img.Width * scale);
            int dh = (int)Math.Ceiling(img.Height * scale);
            int dx = (Width - dw) / 2;
            int dy = (Height - dh) / 2;
            e.Graphics.DrawImage(img, new Rectangle(dx,dy,dw,dh));
        }

        using (var overlay = new System.Drawing.Drawing2D.LinearGradientBrush(
            new Rectangle(0,0,Math.Max(1,Width),Math.Max(1,Height)),
            Color.FromArgb(55,0,5,10),
            Color.FromArgb(225,0,5,10),
            90f))
        {
            e.Graphics.FillRectangle(overlay,0,0,Width,Height);
        }

        using (var top = new SolidBrush(Color.FromArgb(155,0,4,10)))
            e.Graphics.FillRectangle(top,0,0,Width,42);

        using (var line = new Pen(Color.FromArgb(120,MelApp.Cyan),1f))
            e.Graphics.DrawLine(line,0,Height-1,Width,Height-1);

        TextRenderer.DrawText(e.Graphics, Header,
            new Font("Segoe UI Semibold",15f,FontStyle.Bold),
            new Rectangle(18,8,190,28), Color.White,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter);

        TextRenderer.DrawText(e.Graphics, SubHeader,
            new Font("Segoe UI Semibold",7.5f,FontStyle.Bold),
            new Rectangle(18,Height-34,280,22), MelApp.Cyan,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
    }
}

class MelOrb : Control
{
    public string MainText = "OUVRIR";
    public string Caption = "MEL";
    public Color Accent = MelApp.Cyan;
    bool hover;

    public MelOrb()
    {
        DoubleBuffered = true;
        BackColor = Color.Transparent;
        Cursor = Cursors.Hand;
        MouseEnter += delegate { hover=true; Invalidate(); };
        MouseLeave += delegate { hover=false; Invalidate(); };
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        e.Graphics.Clear(Color.Transparent);
        int pad = 8;
        var outer = new Rectangle(pad,pad,Width-pad*2-1,Height-pad*2-1);
        var inner = new Rectangle(pad+10,pad+10,Width-(pad+10)*2-1,Height-(pad+10)*2-1);

        using (var glow = new Pen(Color.FromArgb(hover?160:100,Accent), hover?6f:4f))
            e.Graphics.DrawEllipse(glow,outer);
        using (var ring = new Pen(Color.FromArgb(220,Accent),2f))
            e.Graphics.DrawEllipse(ring,inner);
        using (var fill = new SolidBrush(Color.FromArgb(hover?35:18,Accent)))
            e.Graphics.FillEllipse(fill,inner);

        int cx=Width/2, cy=Height/2-12;
        using (var mic = new Pen(Color.FromArgb(225,Accent),4f))
        {
            e.Graphics.DrawArc(mic,cx-15,cy-24,30,42,0,180);
            e.Graphics.DrawLine(mic,cx-15,cy-3,cx-15,cy+7);
            e.Graphics.DrawLine(mic,cx+15,cy-3,cx+15,cy+7);
            e.Graphics.DrawArc(mic,cx-15,cy-5,30,24,0,180);
            e.Graphics.DrawLine(mic,cx,cy+18,cx,cy+31);
            e.Graphics.DrawLine(mic,cx-10,cy+31,cx+10,cy+31);
        }

        TextRenderer.DrawText(e.Graphics, MainText,
            new Font("Segoe UI Semibold",13f,FontStyle.Bold),
            new Rectangle(20,Height/2+35,Width-40,28), Color.FromArgb(225,240,246,255),
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

        TextRenderer.DrawText(e.Graphics, Caption,
            new Font("Segoe UI",8.5f,FontStyle.Regular),
            new Rectangle(20,Height/2+64,Width-40,22), Color.FromArgb(145,166,197),
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }
}

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
        Text = "MEL — connexion";
        ClientSize = new Size(430, 720);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        BackColor = Color.FromArgb(1,6,12);
        ForeColor = MelApp.Text;
        AutoScaleMode = AutoScaleMode.None;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        DoubleBuffered = true;

        var hero = new MelHeroPanel();
        hero.SetBounds(0,0,430,220);
        hero.Header = "MEL";
        hero.SubHeader = "PERSONAL INTELLIGENCE SYSTEM";
        Controls.Add(hero);

        var mel = MelApp.Label("MEL",0,236,430,52,26,Color.FromArgb(225,235,242,250),FontStyle.Bold);
        mel.TextAlign = ContentAlignment.MiddleCenter; Controls.Add(mel);
        var sub = MelApp.Label("PERSONAL INTELLIGENCE SYSTEM",0,286,430,24,9,MelApp.Cyan,FontStyle.Bold);
        sub.TextAlign = ContentAlignment.MiddleCenter; Controls.Add(sub);
        var mobile = MelApp.Label("Companion Windows sécurisé",0,312,430,24,9.5f,MelApp.Muted,FontStyle.Regular);
        mobile.TextAlign = ContentAlignment.MiddleCenter; Controls.Add(mobile);

        var card = MelApp.Card(24,350,382,300,MelApp.Cyan); Controls.Add(card);
        card.Controls.Add(MelApp.Label("MEL // LINK",22,18,160,24,10,MelApp.Cyan,FontStyle.Bold));
        card.Controls.Add(MelApp.Pill("CHIFFRÉ",258,16,98,24,MelApp.Green));
        card.Controls.Add(MelApp.Label("Connexion à MEL",22,52,300,34,16,MelApp.Text,FontStyle.Bold));

        server.SetBounds(22,96,338,34); server.Text = MelApp.DefaultServer; MelApp.StyleTextBox(server); card.Controls.Add(server);
        user.SetBounds(22,142,338,38); user.Text = "adrien"; MelApp.StyleTextBox(user); card.Controls.Add(user);
        pass.SetBounds(22,192,338,38); pass.UseSystemPasswordChar = true; MelApp.StyleTextBox(pass); card.Controls.Add(pass);

        var go = MelApp.TechButton("ENTRER DANS MEL",22,242,338,42,true);
        go.Click += Connect; card.Controls.Add(go); AcceptButton = go;

        startup.Checked = true; startup.Visible = false;
        status = MelApp.Label("Jeton local protégé par Windows",24,668,382,28,8.5f,MelApp.Muted,FontStyle.Regular);
        status.TextAlign = ContentAlignment.MiddleCenter; Controls.Add(status);
    }

    void Connect(object sender, EventArgs e)
    {
        if (pass.Text.Length == 0) { status.Text="Mot de passe requis."; status.ForeColor=MelApp.Red; return; }
        status.Text="Connexion sécurisée à MEL…"; status.ForeColor=MelApp.Cyan; Refresh();
        string err;
        if (!MelApp.Pair(server.Text, user.Text.Trim().Length>0?user.Text.Trim():"adrien", pass.Text, out err))
        { pass.Text=""; status.Text="Échec : " + err; status.ForeColor=MelApp.Red; return; }
        pass.Text=""; MelApp.InstallFiles(startup.Checked); status.Text="PC associé à MEL"; status.ForeColor=MelApp.Green; Refresh();
        Thread.Sleep(350); DialogResult=DialogResult.OK; Close();
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
    Label state, pcLine, companionState;
    Panel devicePanel;
    CheckBox startup;
    System.Windows.Forms.Timer timer;
    MelOrb orb;

    public MainForm()
    {
        Text="MEL";
        ClientSize=new Size(430,720);
        StartPosition=FormStartPosition.CenterScreen;
        BackColor=Color.FromArgb(1,6,12);
        ForeColor=MelApp.Text;
        MinimumSize=new Size(446,759);
        MaximumSize=new Size(446,759);
        MaximizeBox=false;
        AutoScaleMode=AutoScaleMode.None;
        Font=new Font("Segoe UI",9f,FontStyle.Regular);
        DoubleBuffered=true;

        var hero=new MelHeroPanel();
        hero.SetBounds(0,0,430,292);
        hero.Header="MEL";
        hero.SubHeader="PERSONAL INTELLIGENCE SYSTEM";
        Controls.Add(hero);

        state=MelApp.Label("● Vérification…",0,304,430,26,10,MelApp.Muted,FontStyle.Bold);
        state.TextAlign=ContentAlignment.MiddleCenter; Controls.Add(state);

        pcLine=MelApp.Label(Environment.MachineName,20,332,390,24,8.5f,MelApp.Muted,FontStyle.Regular);
        pcLine.TextAlign=ContentAlignment.MiddleCenter; Controls.Add(pcLine);

        orb=new MelOrb();
        orb.SetBounds(110,364,210,210);
        orb.MainText="OUVRIR MEL";
        orb.Caption="COMPAGNON";
        orb.Click+=delegate{MelApp.OpenMel();};
        Controls.Add(orb);

        companionState=MelApp.Label("Companion prêt",0,578,430,24,9,MelApp.Muted,FontStyle.Regular);
        companionState.TextAlign=ContentAlignment.MiddleCenter; Controls.Add(companionState);

        devicePanel=new Panel();
        devicePanel.SetBounds(20,614,390,42);
        devicePanel.BackColor=Color.Transparent;
        Controls.Add(devicePanel);

        startup=new CheckBox();
        startup.Checked=MelApp.StartupEnabled();
        startup.Visible=false;
        Controls.Add(startup);

        var settings=MelApp.TechButton("RÉGLAGES",80,672,126,34,false);
        settings.Click+=ShowSettings; Controls.Add(settings);
        var refresh=MelApp.TechButton("ACTUALISER",224,672,126,34,false);
        refresh.Click+=delegate{RefreshAll();}; Controls.Add(refresh);

        FormClosing += delegate(object s, FormClosingEventArgs e){
            if (!MelApp.Exiting && e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();}
        };
        timer=new System.Windows.Forms.Timer();
        timer.Interval=10000;
        timer.Tick+=delegate{RefreshAll();};
        timer.Start();
        Shown+=delegate{RefreshAll();};
    }

    void ShowSettings(object sender, EventArgs e)
    {
        var menu=new ContextMenuStrip();
        menu.BackColor=Color.FromArgb(7,14,24);
        menu.ForeColor=MelApp.Text;
        menu.Font=new Font("Segoe UI",9.5f,FontStyle.Regular);
        menu.RenderMode=ToolStripRenderMode.System;

        var permissions=menu.Items.Add("Autorisations locales");
        permissions.Click+=delegate{using(var form=new PermissionsForm()) form.ShowDialog(this);};

        var startItem=new ToolStripMenuItem("Lancer avec Windows");
        startItem.Checked=MelApp.StartupEnabled();
        startItem.CheckOnClick=true;
        startItem.CheckedChanged+=delegate{
            startup.Checked=startItem.Checked;
            MelApp.ConfigureStartup(startup.Checked);
        };
        menu.Items.Add(startItem);

        var repair=menu.Items.Add("Réparer le moteur local");
        repair.Click+=delegate{
            MelApp.InstallFiles(startup.Checked);
            MelApp.StartCompanion();
            companionState.Text="Moteur local réparé";
            RefreshAll();
        };

        var pair=menu.Items.Add("RÉAPPAIRER CE PC");
        pair.Click+=RePair;

        menu.Items.Add(new ToolStripSeparator());
        var uninstall=menu.Items.Add("DÉSINSTALLER MEL COMPANION");
        uninstall.Click+=delegate{MelApp.Uninstall();};

        var control=sender as Control;
        if(control!=null) menu.Show(control,new Point(0,control.Height+4));
    }

    void RePair(object sender, EventArgs e)
    {
        if (MessageBox.Show("Réappairer ce PC à MEL ?", "MEL", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        try { File.Delete(MelApp.ConfigPath); } catch {}
        Hide();
        var setup=new SetupForm();
        if (setup.ShowDialog()==DialogResult.OK && MelApp.LoadConfig())
        {
            MelApp.InstallFiles(startup.Checked);
            MelApp.StartCompanion();
            Show();
            RefreshAll();
        }
        else Show();
    }

    string Get(Dictionary<string,object> d,string k) { object v; return d.TryGetValue(k,out v)&&v!=null?Convert.ToString(v):""; }
    bool Bool(Dictionary<string,object> d,string k) { object v; return d.TryGetValue(k,out v)&&v!=null&&Convert.ToBoolean(v); }

    void RefreshAll()
    {
        MelApp.EnsureCompanion();
        MelApp.MaybeRefreshCompanionEngine(false);
        var ok=MelApp.Heartbeat();

        state.Text=ok?"● CONNECTÉ À MEL":"● RECONNEXION…";
        state.ForeColor=ok?MelApp.Green:MelApp.Red;
        companionState.Text=ok?"Companion Windows prêt":"Recherche du moteur MEL…";
        pcLine.Text="CE PC  //  "+Environment.MachineName;
        MelApp.Tray.Text=ok?"MEL Companion — connecté":"MEL Companion — reconnexion";

        devicePanel.Controls.Clear();
        var devices=MelApp.Devices();

        int x=0;
        int shown=0;
        foreach(var d in devices)
        {
            if(shown>=3) break;
            var kind=Get(d,"kind");
            var online=Bool(d,"online");
            var label=(kind=="android"?"ANDROID":"MINI")+" "+(online?"ONLINE":"OFFLINE");
            var pill=MelApp.Pill(label,x,5,120,28,online?MelApp.Green:MelApp.Red);
            devicePanel.Controls.Add(pill);
            x+=132;
            shown++;
        }

        if(shown==0)
        {
            var none=MelApp.Pill("AUCUN APPAREIL",92,5,205,28,MelApp.Violet);
            devicePanel.Controls.Add(none);
        }
    }
}

class Program
{
    static Mutex mutex;
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

        bool created; mutex=new Mutex(true,"MEL.Companion.Desktop.v2",out created); if(!created) return;
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        bool background = args != null && Array.Exists(args, a => a == "--background");
        if (!MelApp.LoadConfig())
        {
            var setup=new SetupForm(); if(setup.ShowDialog()!=DialogResult.OK || !MelApp.LoadConfig()) return;
        }
        MelApp.InstallFiles(MelApp.StartupEnabled()); MelApp.StartCompanion(); MelApp.MaybeRefreshCompanionEngine(true); MelApp.BuildTray();
        MelApp.HotKey=new HotKeyWindow();
        MelApp.Main=new MainForm(); if(!background) MelApp.Main.Show(); Application.Run();
        try { if (MelApp.HotKey != null) MelApp.HotKey.Dispose(); } catch { }
        mutex.ReleaseMutex();
    }
}