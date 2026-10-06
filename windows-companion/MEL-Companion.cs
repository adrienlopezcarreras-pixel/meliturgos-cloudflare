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

    public static Color Bg = Color.FromArgb(5, 11, 20);
    public static Color Panel = Color.FromArgb(10, 20, 33);
    public static Color Glass = Color.FromArgb(14, 29, 45);
    public static Color Cyan = Color.FromArgb(74, 210, 242);
    public static Color Blue = Color.FromArgb(73, 146, 224);
    public static Color Violet = Color.FromArgb(116, 122, 196);
    public static Color Text = Color.FromArgb(236, 244, 250);
    public static Color Muted = Color.FromArgb(151, 173, 190);
    public static Color Green = Color.FromArgb(77, 199, 137);
    public static Color Red = Color.FromArgb(224, 103, 112);
    public static Color Line = Color.FromArgb(34, 70, 92);

    public static Bitmap MakeMelTechnoFace(int size)
    {
        // Render MEL at high internal resolution, then downsample. This keeps the
        // techno face crisp on HiDPI displays without shipping an external font
        // or image asset.
        const int canvas = 512;
        var hi = new Bitmap(canvas, canvas, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
        using (var g = Graphics.FromImage(hi))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
            g.Clear(Color.Transparent);

            using (var halo = new System.Drawing.Drawing2D.PathGradientBrush(new Point[] {
                new Point(256,28), new Point(474,256), new Point(256,484), new Point(38,256)
            }))
            {
                halo.CenterColor = Color.FromArgb(82, 96, 204, 255);
                halo.SurroundColors = new Color[] {
                    Color.FromArgb(0,96,204,255),
                    Color.FromArgb(0,96,204,255),
                    Color.FromArgb(0,96,204,255),
                    Color.FromArgb(0,96,204,255)
                };
                halo.CenterPoint = new PointF(256,256);
                g.FillEllipse(halo, 34,34,444,444);
            }

            using (var ringWide = new Pen(Color.FromArgb(34, 102, 181, 235), 34f))
            using (var ring = new Pen(Color.FromArgb(180, 92, 170, 220), 8f))
            using (var ringFine = new Pen(Color.FromArgb(130, 188, 226, 248), 2.5f))
            {
                g.DrawArc(ringWide, 62,62,388,388, 192, 300);
                g.DrawArc(ring, 66,66,380,380, 198, 288);
                g.DrawArc(ringFine, 82,82,348,348, 10, 145);
                g.DrawArc(ringFine, 82,82,348,348, 190, 105);
            }

            var head = new PointF[] {
                new PointF(256,78),
                new PointF(337,98),
                new PointF(397,151),
                new PointF(423,235),
                new PointF(410,322),
                new PointF(363,391),
                new PointF(307,432),
                new PointF(256,448),
                new PointF(205,432),
                new PointF(149,391),
                new PointF(102,322),
                new PointF(89,235),
                new PointF(115,151),
                new PointF(175,98)
            };

            using (var headPath = new System.Drawing.Drawing2D.GraphicsPath())
            {
                headPath.AddPolygon(head);
                using (var fill = new System.Drawing.Drawing2D.LinearGradientBrush(
                    new Rectangle(90,78,334,370),
                    Color.FromArgb(245, 25, 31, 40),
                    Color.FromArgb(245, 10, 15, 22),
                    90f))
                using (var edgeGlow = new Pen(Color.FromArgb(115, 92,170,220), 18f))
                using (var edge = new Pen(Color.FromArgb(238, 150,218,245), 5f))
                {
                    g.DrawPath(edgeGlow, headPath);
                    g.FillPath(fill, headPath);
                    g.DrawPath(edge, headPath);
                }
            }

            // Temple / cheek armor panels.
            using (var panelFill = new SolidBrush(Color.FromArgb(150, 48,58,70)))
            using (var panelLine = new Pen(Color.FromArgb(165, 111,184,222), 3f))
            {
                var leftPanel = new PointF[] {
                    new PointF(112,186), new PointF(166,142), new PointF(174,330),
                    new PointF(139,363), new PointF(108,302)
                };
                var rightPanel = new PointF[] {
                    new PointF(400,186), new PointF(346,142), new PointF(338,330),
                    new PointF(373,363), new PointF(404,302)
                };
                g.FillPolygon(panelFill,leftPanel); g.DrawPolygon(panelLine,leftPanel);
                g.FillPolygon(panelFill,rightPanel); g.DrawPolygon(panelLine,rightPanel);
            }

            // Brow structures.
            using (var brow = new Pen(Color.FromArgb(210, 119,195,232), 6f))
            using (var browCore = new Pen(Color.FromArgb(235, 214,241,255), 2f))
            {
                g.DrawLine(brow, 150,192,228,176);
                g.DrawLine(brow, 284,176,362,192);
                g.DrawLine(browCore, 154,190,225,178);
                g.DrawLine(browCore, 287,178,358,190);
            }

            // Eyes: layered luminous cyan lenses.
            using (var eyeGlow = new SolidBrush(Color.FromArgb(72, 101,220,255)))
            using (var eye = new SolidBrush(Color.FromArgb(225, 98,215,246)))
            using (var eyeCore = new SolidBrush(Color.White))
            using (var eyeLine = new Pen(Color.FromArgb(235, 180,238,255), 3f))
            {
                var left = new PointF[] {
                    new PointF(145,213), new PointF(227,196), new PointF(215,241), new PointF(153,249)
                };
                var right = new PointF[] {
                    new PointF(367,213), new PointF(285,196), new PointF(297,241), new PointF(359,249)
                };
                g.FillEllipse(eyeGlow, 135,190,104,76);
                g.FillEllipse(eyeGlow, 273,190,104,76);
                g.FillPolygon(eye,left); g.DrawPolygon(eyeLine,left);
                g.FillPolygon(eye,right); g.DrawPolygon(eyeLine,right);
                g.FillEllipse(eyeCore, 186,211,16,16);
                g.FillEllipse(eyeCore, 310,211,16,16);
                g.FillEllipse(new SolidBrush(Color.FromArgb(210,18,47,68)),190,215,8,8);
                g.FillEllipse(new SolidBrush(Color.FromArgb(210,18,47,68)),314,215,8,8);
            }

            // Central nose bridge / processor spine.
            using (var spine = new Pen(Color.FromArgb(180, 104,183,220), 4f))
            using (var spineCore = new Pen(Color.FromArgb(220, 183,230,249), 2f))
            {
                g.DrawLine(spine,256,185,256,319);
                g.DrawLine(spineCore,256,191,256,313);
                g.DrawLine(spine,237,311,256,326);
                g.DrawLine(spine,275,311,256,326);
            }

            // Mouth / voice interface.
            using (var mouthGlow = new Pen(Color.FromArgb(85, 97,184,238), 18f))
            using (var mouth = new Pen(Color.FromArgb(215, 127,203,239), 4f))
            using (var mouthCore = new Pen(Color.FromArgb(240, 215,244,255), 1.8f))
            {
                g.DrawLines(mouthGlow,new PointF[] {
                    new PointF(184,350), new PointF(224,365), new PointF(288,365), new PointF(328,350)
                });
                g.DrawLines(mouth,new PointF[] {
                    new PointF(184,350), new PointF(224,365), new PointF(288,365), new PointF(328,350)
                });
                g.DrawLine(mouthCore,224,365,288,365);
            }

            // Fine circuit traces.
            using (var trace = new Pen(Color.FromArgb(130, 92,170,220), 2.5f))
            using (var node = new SolidBrush(Color.FromArgb(220, 144,213,244)))
            {
                g.DrawLine(trace,132,274,96,274);
                g.DrawLine(trace,380,274,416,274);
                g.DrawLine(trace,161,370,126,407);
                g.DrawLine(trace,351,370,386,407);
                g.DrawLine(trace,216,113,205,79);
                g.DrawLine(trace,296,113,307,79);
                g.FillEllipse(node,90,268,12,12);
                g.FillEllipse(node,410,268,12,12);
                g.FillEllipse(node,199,72,12,12);
                g.FillEllipse(node,301,72,12,12);
            }

            // Small lower status light.
            using (var statusGlow = new SolidBrush(Color.FromArgb(90, 87,180,125)))
            using (var status = new SolidBrush(Color.FromArgb(235, 111,220,151)))
            {
                g.FillEllipse(statusGlow,239,409,34,34);
                g.FillEllipse(status,248,418,16,16);
            }
        }

        var bmp = new Bitmap(size,size,System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(hi, new Rectangle(0,0,size,size));
        }
        hi.Dispose();
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
        b.Font = new Font("Segoe UI Semibold", 9.25f, FontStyle.Regular);
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
        p.ForeColor = Text; p.Font = new Font("Segoe UI Semibold", 8.5f, FontStyle.Regular);
        p.TextAlign = ContentAlignment.MiddleCenter;
        return p;
    }

    public static void StyleTextBox(TextBox box)
    {
        box.BackColor = Color.FromArgb(8,18,34);
        box.ForeColor = Text;
        box.BorderStyle = BorderStyle.FixedSingle;
        box.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
    }

    public static void PaintBackdrop(Graphics g, int width, int height)
    {
        using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
            new Rectangle(0,0,width,height),
            Color.FromArgb(26,28,32),
            Color.FromArgb(21,23,27),
            90f))
        {
            g.FillRectangle(brush,0,0,width,height);
        }
        using (var separator = new Pen(Color.FromArgb(44,48,55),1f))
            g.DrawLine(separator,0,76,width,76);
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
    public int Radius = 12;
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
        using (var fill = new SolidBrush(MelApp.Panel))
        using (var border = new Pen(MelApp.Line,1f))
        {
            e.Graphics.FillPath(fill,path);
            e.Graphics.DrawPath(border,path);
        }
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
                ? (hover ? Color.FromArgb(105,157,229) : MelApp.Blue)
                : (hover ? Color.FromArgb(47,51,58) : MelApp.Glass);
            using (var fill = new SolidBrush(bg)) e.Graphics.FillPath(fill,path);
            using (var pen = new Pen(Primary ? Color.FromArgb(110,150,190,240) : MelApp.Line,1f))
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
        Text = "MEL Companion — installation";
        ClientSize = new Size(720, 500);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = MelApp.Bg;
        ForeColor = MelApp.Text;
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 9.25f, FontStyle.Regular);
        DoubleBuffered = true;
        Paint += delegate(object sender, PaintEventArgs e){ MelApp.PaintBackdrop(e.Graphics, ClientSize.Width, ClientSize.Height); };

        Controls.Add(MelApp.MelFace(28,18,56));
        Controls.Add(MelApp.Label("MEL Companion",100,20,300,28,14,MelApp.Text,FontStyle.Bold));
        Controls.Add(MelApp.Label("Connexion sécurisée de cet ordinateur à MEL",100,49,430,22,9.25f,MelApp.Muted,FontStyle.Regular));
        Controls.Add(MelApp.Pill("Windows",574,25,112,24,MelApp.Blue));

        var p = MelApp.Card(28,96,664,306,MelApp.Blue); Controls.Add(p);
        p.Controls.Add(MelApp.Label("Connexion",22,18,180,24,11,MelApp.Text,FontStyle.Bold));
        p.Controls.Add(MelApp.Label("Les identifiants servent uniquement à l’appairage et ne sont pas conservés.",22,46,610,22,9,MelApp.Muted,FontStyle.Regular));

        p.Controls.Add(MelApp.Label("Adresse MEL",22,84,150,20,9,MelApp.Muted,FontStyle.Regular));
        server.SetBounds(22,106,620,32); server.Text = MelApp.DefaultServer; MelApp.StyleTextBox(server); p.Controls.Add(server);

        p.Controls.Add(MelApp.Label("Utilisateur",22,154,150,20,9,MelApp.Muted,FontStyle.Regular));
        user.SetBounds(22,176,292,32); user.Text = "adrien"; MelApp.StyleTextBox(user); p.Controls.Add(user);

        p.Controls.Add(MelApp.Label("Mot de passe",350,154,150,20,9,MelApp.Muted,FontStyle.Regular));
        pass.SetBounds(350,176,292,32); pass.UseSystemPasswordChar = true; MelApp.StyleTextBox(pass); p.Controls.Add(pass);

        startup.Text = "Lancer MEL Companion avec Windows";
        startup.Checked = true;
        startup.ForeColor = MelApp.Text; startup.BackColor = Color.Transparent; startup.AutoSize = true;
        startup.Font = new Font("Segoe UI",9.25f,FontStyle.Regular);
        startup.SetBounds(22,232,360,28); p.Controls.Add(startup);

        status = MelApp.Label("Prêt à connecter ce PC.",32,424,410,28,9.25f,MelApp.Muted,FontStyle.Regular); Controls.Add(status);
        var quit = MelApp.TechButton("Annuler",490,420,92,36,false); quit.Click += delegate { Close(); }; Controls.Add(quit);
        var go = MelApp.TechButton("Connecter",594,420,98,36,true); go.Click += Connect; Controls.Add(go); AcceptButton = go;
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
        ClientSize = new Size(680, 560);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = MelApp.Bg;
        ForeColor = MelApp.Text;
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 9.25f, FontStyle.Regular);
        DoubleBuffered = true;
        Paint += delegate(object sender, PaintEventArgs e){ MelApp.PaintBackdrop(e.Graphics, ClientSize.Width, ClientSize.Height); };

        Controls.Add(MelApp.MelFace(24,16,50));
        Controls.Add(MelApp.Label("Autorisations locales",90,18,360,28,13.5f,MelApp.Text,FontStyle.Bold));
        Controls.Add(MelApp.Label("MEL n’utilise que les applications et dossiers autorisés ici.",90,47,500,22,9.25f,MelApp.Muted,FontStyle.Regular));

        var currentApps = MelApp.ConfigList("allowed_apps");
        var currentPaths = MelApp.ConfigList("allowed_paths");

        var appsPanel = MelApp.Card(24,92,632,184,MelApp.Blue); Controls.Add(appsPanel);
        appsPanel.Controls.Add(MelApp.Label("Applications",18,14,180,22,10.5f,MelApp.Text,FontStyle.Bold));
        for (int i=0;i<MelApp.PermissionApps.Length;i++)
        {
            var box = new CheckBox();
            box.Text = MelApp.PermissionAppLabels[i];
            box.Tag = MelApp.PermissionApps[i];
            box.Checked = MelApp.ContainsIgnoreCase(currentApps, MelApp.PermissionApps[i]);
            box.ForeColor = MelApp.Text; box.BackColor = Color.Transparent; box.AutoSize = true;
            box.Font = new Font("Segoe UI",9.25f,FontStyle.Regular);
            int col = i < 3 ? 0 : 1, row = i < 3 ? i : i-3;
            box.SetBounds(20 + col*294, 52 + row*36, 270, 28);
            appsPanel.Controls.Add(box); appBoxes.Add(box);
        }

        var pathsPanel = MelApp.Card(24,292,632,150,MelApp.Blue); Controls.Add(pathsPanel);
        pathsPanel.Controls.Add(MelApp.Label("Dossiers",18,14,180,22,10.5f,MelApp.Text,FontStyle.Bold));
        for (int i=0;i<paths.Length;i++)
        {
            var box = new CheckBox();
            box.Text = paths[i];
            box.Tag = paths[i];
            box.Checked = MelApp.ContainsIgnoreCase(currentPaths, paths[i]);
            box.ForeColor = MelApp.Text; box.BackColor = Color.Transparent; box.AutoSize = false;
            box.Font = new Font("Segoe UI",9f,FontStyle.Regular);
            box.SetBounds(20, 46 + i*30, 590, 25);
            pathsPanel.Controls.Add(box); pathBoxes.Add(box);
        }

        Controls.Add(MelApp.Label("Les changements sont appliqués immédiatement au moteur local.",28,462,430,24,9,MelApp.Muted,FontStyle.Regular));
        var cancel = MelApp.TechButton("Annuler",454,502,92,36,false); cancel.Click += delegate { Close(); }; Controls.Add(cancel);
        var save = MelApp.TechButton("Appliquer",558,502,98,36,true); save.Click += Apply; Controls.Add(save);
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

class MelHeroPanel : Panel
{
    public MelHeroPanel()
    {
        DoubleBuffered = true;
        BackColor = Color.Transparent;
        Resize += delegate { ApplyRegion(); };
    }

    void ApplyRegion()
    {
        if (Width <= 0 || Height <= 0) return;
        var r = new Rectangle(0,0,Width-1,Height-1);
        int radius = 18, d = radius*2;
        using (var p = new System.Drawing.Drawing2D.GraphicsPath())
        {
            p.AddArc(r.Left,r.Top,d,d,180,90);
            p.AddArc(r.Right-d,r.Top,d,d,270,90);
            p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);
            p.AddArc(r.Left,r.Bottom-d,d,d,90,90);
            p.CloseFigure();
            Region = new Region(p);
        }
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        var r = new Rectangle(0,0,Width-1,Height-1);
        using (var bg = new System.Drawing.Drawing2D.LinearGradientBrush(
            r,
            Color.FromArgb(16,31,48),
            Color.FromArgb(7,15,25),
            0f))
        {
            e.Graphics.FillRectangle(bg,r);
        }

        using (var glow = new SolidBrush(Color.FromArgb(24,74,210,242)))
            e.Graphics.FillEllipse(glow, 28, -80, 310, 310);

        using (var border = new Pen(Color.FromArgb(120,74,210,242),1.2f))
            e.Graphics.DrawRectangle(border,0,0,Width-1,Height-1);

        using (var line = new Pen(Color.FromArgb(90,74,210,242),2f))
        {
            // restrained HUD corner marks inspired by the supplied MEL reference
            int m=18, l=42;
            e.Graphics.DrawLine(line,m,m,m+l,m);
            e.Graphics.DrawLine(line,m,m,m,m+l);
            e.Graphics.DrawLine(line,Width-m-l,m,Width-m,m);
            e.Graphics.DrawLine(line,Width-m,m,Width-m,m+l);
            e.Graphics.DrawLine(line,m,Height-m,m+l,Height-m);
            e.Graphics.DrawLine(line,m,Height-m-l,m,Height-m);
            e.Graphics.DrawLine(line,Width-m-l,Height-m,Width-m,Height-m);
            e.Graphics.DrawLine(line,Width-m,Height-m-l,Width-m,Height-m);
        }

        using (var fine = new Pen(Color.FromArgb(30,128,205,236),1f))
        {
            for (int y=38; y<Height; y+=34)
                e.Graphics.DrawLine(fine, 360, y, Width-22, y);
        }
    }
}

class MainForm : Form
{
    Label state, pcLine; Panel devicePanel; CheckBox startup; System.Windows.Forms.Timer timer;

    public MainForm()
    {
        Text="MEL Companion";
        ClientSize=new Size(920,650);
        StartPosition=FormStartPosition.CenterScreen;
        BackColor=MelApp.Bg;
        ForeColor=MelApp.Text;
        MinimumSize=new Size(936,689);
        AutoScaleMode=AutoScaleMode.Dpi;
        Font=new Font("Segoe UI",9.25f,FontStyle.Regular);
        DoubleBuffered=true;
        Paint += delegate(object sender, PaintEventArgs e){ MelApp.PaintBackdrop(e.Graphics, ClientSize.Width, ClientSize.Height); };

        Controls.Add(MelApp.Label("MEL Companion",24,18,260,26,13.5f,MelApp.Text,FontStyle.Bold));
        Controls.Add(MelApp.Label("Assistant local et passerelle matérielle",24,45,330,20,9f,MelApp.Muted,FontStyle.Regular));
        state=MelApp.Label("Vérification…",660,29,120,20,9.25f,MelApp.Muted,FontStyle.Regular); Controls.Add(state);
        var open=MelApp.TechButton("Ouvrir MEL",790,21,106,34,true); open.Click+=delegate{MelApp.OpenMel();}; Controls.Add(open);

        var hero = new MelHeroPanel(); hero.SetBounds(24,86,872,214); Controls.Add(hero);
        hero.Controls.Add(MelApp.MelFace(38,26,158));
        hero.Controls.Add(MelApp.Label("MEL TECHNO",224,34,290,30,15.5f,MelApp.Text,FontStyle.Bold));
        hero.Controls.Add(MelApp.Label("Intelligence locale connectée",224,67,310,22,10,MelApp.Cyan,FontStyle.Regular));
        hero.Controls.Add(MelApp.Label("Le Companion maintient le moteur local, la liaison sécurisée et les appareils MEL.",224,101,410,44,9.25f,MelApp.Muted,FontStyle.Regular));

        pcLine=MelApp.Label(Environment.MachineName+"  •  "+MelApp.ComputerId,224,154,420,22,9.25f,MelApp.Text,FontStyle.Regular); hero.Controls.Add(pcLine);
        hero.Controls.Add(MelApp.Pill("Moteur local",676,36,148,26,MelApp.Cyan));
        hero.Controls.Add(MelApp.Pill("Ctrl + Alt + M",676,74,148,26,MelApp.Violet));
        hero.Controls.Add(MelApp.Pill("Liaison chiffrée",676,112,148,26,MelApp.Blue));

        Controls.Add(MelApp.Label("Appareils MEL",26,326,220,24,11f,MelApp.Text,FontStyle.Bold));
        Controls.Add(MelApp.Label("État de la MINI et de l’APK",26,351,300,20,9f,MelApp.Muted,FontStyle.Regular));
        var permissions=MelApp.TechButton("Autorisations",630,326,126,34,false); permissions.Click+=delegate{using(var form=new PermissionsForm()) form.ShowDialog(this);}; Controls.Add(permissions);
        var refresh=MelApp.TechButton("Actualiser",768,326,128,34,false); refresh.Click+=delegate{RefreshAll();}; Controls.Add(refresh);

        devicePanel=new Panel();
        devicePanel.SetBounds(24,382,872,174);
        devicePanel.BackColor=Color.Transparent;
        devicePanel.AutoScroll=true;
        Controls.Add(devicePanel);

        startup=new CheckBox();
        startup.Text="Lancer avec Windows";
        startup.Checked=MelApp.StartupEnabled();
        startup.ForeColor=MelApp.Text;
        startup.BackColor=Color.Transparent;
        startup.AutoSize=true;
        startup.Font=new Font("Segoe UI",9.25f,FontStyle.Regular);
        startup.SetBounds(28,580,220,26);
        startup.CheckedChanged+=delegate{MelApp.ConfigureStartup(startup.Checked);};
        Controls.Add(startup);

        var repair=MelApp.TechButton("Réparer",520,574,102,34,false);
        repair.Click+=delegate{MelApp.InstallFiles(startup.Checked); MelApp.StartCompanion(); MessageBox.Show("Installation réparée.","MEL Companion");};
        Controls.Add(repair);

        var rePair=MelApp.TechButton("Réappairer",634,574,116,34,false);
        rePair.Click+=RePair;
        Controls.Add(rePair);

        var uninstall=MelApp.TechButton("Désinstaller",762,574,134,34,false);
        uninstall.Click+=delegate{MelApp.Uninstall();};
        Controls.Add(uninstall);

        Controls.Add(MelApp.Label("MEL reste actif dans la zone de notification lorsque cette fenêtre est fermée.",28,618,760,20,9f,MelApp.Muted,FontStyle.Regular));

        FormClosing += delegate(object sender, FormClosingEventArgs e){
            if (!MelApp.Exiting && e.CloseReason==CloseReason.UserClosing){
                e.Cancel=true;
                Hide();
            }
        };
        timer=new System.Windows.Forms.Timer();
        timer.Interval=10000;
        timer.Tick+=delegate{RefreshAll();};
        timer.Start();
        Shown+=delegate{RefreshAll();};
    }

    void RePair(object sender, EventArgs e)
    {
        if (MessageBox.Show("Réappairer ce PC à MEL ?", "MEL Companion", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        try { File.Delete(MelApp.ConfigPath); } catch {}
        Hide(); var setup=new SetupForm();
        if (setup.ShowDialog()==DialogResult.OK && MelApp.LoadConfig())
        { MelApp.InstallFiles(startup.Checked); MelApp.StartCompanion(); pcLine.Text=Environment.MachineName+"  •  "+MelApp.ComputerId; Show(); RefreshAll(); }
        else Show();
    }

    string Get(Dictionary<string,object> d,string k) { object v; return d.TryGetValue(k,out v)&&v!=null?Convert.ToString(v):""; }
    bool Bool(Dictionary<string,object> d,string k) { object v; return d.TryGetValue(k,out v)&&v!=null&&Convert.ToBoolean(v); }

    void RefreshAll()
    {
        MelApp.EnsureCompanion();
        MelApp.MaybeRefreshCompanionEngine(false);
        var ok=MelApp.Heartbeat(); state.Text=ok?"Connecté":"Reconnexion…"; state.ForeColor=ok?MelApp.Green:MelApp.Red;
        MelApp.Tray.Text=ok?"MEL Companion — connecté":"MEL Companion — reconnexion";
        devicePanel.Controls.Clear(); var devices=MelApp.Devices();
        if (devices.Count==0)
        {
            var empty=MelApp.Card(4,4,844,96,MelApp.Cyan); devicePanel.Controls.Add(empty);
            empty.Controls.Add(MelApp.Label("Aucun appareil visible",20,18,360,24,10,MelApp.Text,FontStyle.Bold));
            empty.Controls.Add(MelApp.Label("La MINI ou l’APK apparaîtront ici à leur prochain contact avec MEL.",20,47,620,22,9,MelApp.Muted,FontStyle.Regular));
            empty.Controls.Add(MelApp.Pill("En attente",696,20,124,24,MelApp.Violet));
            return;
        }
        int y=8;
        foreach(var d in devices)
        {
            var name=Get(d,"name"); var kind=Get(d,"kind"); var online=Bool(d,"online");
            var camera=Bool(d,"camera"); var mic=Bool(d,"microphone"); var live=Bool(d,"live_stream");
            var firmware=Get(d,"firmware"); var phase=Get(d,"phase");
            var accent=online?MelApp.Green:MelApp.Violet;
            var row=MelApp.Card(4,y,844,88,accent); devicePanel.Controls.Add(row);
            row.Controls.Add(MelApp.Label((kind=="android"?"Android · ":"MINI · ")+name,18,14,500,23,10,MelApp.Text,FontStyle.Bold));
            row.Controls.Add(MelApp.Label((phase.Length>0?phase:"Appareil MEL")+(firmware.Length>0?"  ·  "+firmware:""),18,40,540,20,9,MelApp.Muted,FontStyle.Regular));
            row.Controls.Add(MelApp.Pill(online?"En ligne":"Hors ligne",694,12,126,24,online?MelApp.Green:MelApp.Red));
            row.Controls.Add(MelApp.Pill(camera?"Caméra":"Sans caméra",18,63,102,20,camera?MelApp.Cyan:MelApp.Muted));
            row.Controls.Add(MelApp.Pill(mic?"Micro":"Sans micro",128,63,102,20,mic?MelApp.Green:MelApp.Muted));
            var cam=MelApp.TechButton(live?"Ouvrir le flux":"Caméra",694,47,126,32,live); cam.Enabled=camera;
            cam.Click+=delegate {
                if (live) MelApp.OpenMel();
                else MessageBox.Show("La caméra est détectée, mais aucun flux vidéo live réel n’est encore publié par cet appareil.\n\nLe bouton passera automatiquement à « OUVRIR FLUX » dès qu’un endpoint live sera disponible.", "MEL — caméra");
            };
            row.Controls.Add(cam); y+=98;
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