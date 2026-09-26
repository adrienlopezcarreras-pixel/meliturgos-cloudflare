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
    public const string Version = "2.3.3";
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
    public static NotifyIcon Tray;
    public static HotKeyWindow HotKey;
    public const string HotKeyLabel = "Ctrl+Alt+M";
    public static MainForm Main;
    public static bool Exiting;
    const string CompanionB64 = "__COMPANION_B64__";

    public static Color Bg = Color.FromArgb(7, 12, 25);
    public static Color Panel = Color.FromArgb(16, 25, 47);
    public static Color Cyan = Color.FromArgb(68, 232, 255);
    public static Color Text = Color.FromArgb(232, 240, 252);
    public static Color Muted = Color.FromArgb(154, 174, 205);
    public static Color Green = Color.FromArgb(72, 220, 170);
    public static Color Red = Color.FromArgb(255, 110, 135);

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
            var body = Json.Serialize(new Dictionary<string, object> {
                {"version",Version},{"hostname",Environment.MachineName},{"user",Environment.UserName}
            });
            var o = Obj(Http(Server + "/api/computer/v1/heartbeat", "POST", body, DeviceHeaders()));
            object ok; return o.TryGetValue("ok", out ok) && Convert.ToBoolean(ok);
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
        var bmp = new Bitmap(32,32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using (var b = new SolidBrush(Cyan)) g.FillEllipse(b, 1, 1, 30, 30);
            using (var f = new Font("Segoe UI", 14, FontStyle.Bold))
            using (var b = new SolidBrush(Color.FromArgb(4,18,27))) g.DrawString("M", f, b, 7, 5);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    public static Button TechButton(string text, int x, int y, int w, int h, bool primary)
    {
        var b = new Button(); b.Text = text; b.SetBounds(x,y,w,h);
        b.FlatStyle = FlatStyle.Flat; b.FlatAppearance.BorderSize = primary ? 0 : 1;
        b.BackColor = primary ? Cyan : Color.FromArgb(27,38,65);
        b.ForeColor = primary ? Color.FromArgb(3,18,27) : Text;
        if (!primary) b.FlatAppearance.BorderColor = Color.FromArgb(70,90,125);
        b.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold); b.Cursor = Cursors.Hand; return b;
    }

    public static Label Label(string text, int x, int y, int w, int h, float size, Color color, FontStyle style)
    {
        var l = new Label(); l.Text = text; l.SetBounds(x,y,w,h); l.ForeColor = color; l.BackColor = Color.Transparent;
        l.Font = new Font("Segoe UI", size, style); return l;
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
        menu.Items.Add("-"); var quit = menu.Items.Add("Quitter MEL Companion");
        open.Click += delegate { OpenMel(); }; show.Click += delegate { ShowMain(); }; quit.Click += delegate { Exit(); };
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
        Text = "MEL Companion — installation"; ClientSize = new Size(690, 500);
        StartPosition = FormStartPosition.CenterScreen; FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; BackColor = MelApp.Bg; ForeColor = MelApp.Text;
        Controls.Add(MelApp.Label("MEL",30,24,100,50,28,MelApp.Cyan,FontStyle.Bold));
        Controls.Add(MelApp.Label("COMPANION PC",135,32,250,34,17,MelApp.Text,FontStyle.Bold));
        Controls.Add(MelApp.Label("Connexion sécurisée de cet ordinateur à MEL",138,69,450,25,10,MelApp.Muted,FontStyle.Regular));
        var p = new Panel(); p.SetBounds(38,120,614,250); p.BackColor = MelApp.Panel; Controls.Add(p);
        p.Controls.Add(MelApp.Label("APPAIRAGE",24,18,180,24,9,MelApp.Cyan,FontStyle.Bold));
        p.Controls.Add(MelApp.Label("Adresse MEL",24,56,160,22,9,MelApp.Muted,FontStyle.Regular));
        server.SetBounds(24,80,566,30); server.Text = MelApp.DefaultServer; p.Controls.Add(server);
        p.Controls.Add(MelApp.Label("Utilisateur",24,120,160,22,9,MelApp.Muted,FontStyle.Regular));
        user.SetBounds(24,144,260,30); user.Text = "adrien"; p.Controls.Add(user);
        p.Controls.Add(MelApp.Label("Mot de passe",306,120,160,22,9,MelApp.Muted,FontStyle.Regular));
        pass.SetBounds(306,144,284,30); pass.UseSystemPasswordChar = true; p.Controls.Add(pass);
        startup.Text = "Lancer MEL Companion avec Windows"; startup.Checked = true;
        startup.ForeColor = MelApp.Text; startup.BackColor = Color.Transparent; startup.AutoSize = true; startup.SetBounds(24,195,350,30); p.Controls.Add(startup);
        status = MelApp.Label("Prêt à appairer ce PC.",42,390,420,30,9.5f,MelApp.Muted,FontStyle.Regular); Controls.Add(status);
        var quit = MelApp.TechButton("QUITTER",440,426,95,38,false); quit.Click += delegate { Close(); }; Controls.Add(quit);
        var go = MelApp.TechButton("CONNECTER",545,426,110,38,true); go.Click += Connect; Controls.Add(go); AcceptButton = go;
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

class MainForm : Form
{
    Label state, pcLine; Panel devicePanel; CheckBox startup; System.Windows.Forms.Timer timer;

    public MainForm()
    {
        Text="MEL Companion"; ClientSize=new Size(760,560); StartPosition=FormStartPosition.CenterScreen;
        BackColor=MelApp.Bg; ForeColor=MelApp.Text; MinimumSize=new Size(776,599);
        Controls.Add(MelApp.Label("MEL",28,22,95,48,27,MelApp.Cyan,FontStyle.Bold));
        Controls.Add(MelApp.Label("COMPANION PC",128,28,280,34,17,MelApp.Text,FontStyle.Bold));
        state=MelApp.Label("● Vérification…",132,65,350,25,9.5f,MelApp.Muted,FontStyle.Bold); Controls.Add(state);
        var open=MelApp.TechButton("OUVRIR MEL",592,26,130,38,true); open.Click+=delegate{MelApp.OpenMel();}; Controls.Add(open);

        var pc = new Panel(); pc.SetBounds(28,105,704,100); pc.BackColor=MelApp.Panel; Controls.Add(pc);
        pc.Controls.Add(MelApp.Label("CE PC",20,14,120,24,9,MelApp.Cyan,FontStyle.Bold));
        pcLine=MelApp.Label(Environment.MachineName+"  •  "+MelApp.ComputerId,20,42,650,30,11,MelApp.Text,FontStyle.Bold); pc.Controls.Add(pcLine);
        pc.Controls.Add(MelApp.Label("Contrôle autorisé, captures et commandes MEL en arrière-plan.",20,70,650,22,9,MelApp.Muted,FontStyle.Regular));

        Controls.Add(MelApp.Label("APPAREILS MEL",28,225,250,26,10,MelApp.Cyan,FontStyle.Bold));
        var refresh=MelApp.TechButton("ACTUALISER",612,216,120,34,false); refresh.Click+=delegate{RefreshAll();}; Controls.Add(refresh);
        devicePanel=new Panel(); devicePanel.SetBounds(28,260,704,170); devicePanel.BackColor=MelApp.Panel; devicePanel.AutoScroll=true; Controls.Add(devicePanel);

        startup=new CheckBox(); startup.Text="Lancer MEL Companion avec Windows"; startup.Checked=MelApp.StartupEnabled();
        startup.ForeColor=MelApp.Text; startup.BackColor=Color.Transparent; startup.AutoSize=true; startup.SetBounds(32,452,330,28);
        startup.CheckedChanged+=delegate{MelApp.ConfigureStartup(startup.Checked);}; Controls.Add(startup);

        var repair=MelApp.TechButton("RÉPARER",370,445,100,34,false); repair.Click+=delegate{MelApp.InstallFiles(startup.Checked); MelApp.StartCompanion(); MessageBox.Show("Installation réparée.","MEL Companion");}; Controls.Add(repair);
        var rePair=MelApp.TechButton("RÉAPPAIRER",480,445,110,34,false); rePair.Click+=RePair; Controls.Add(rePair);
        var uninstall=MelApp.TechButton("DÉSINSTALLER",600,445,120,34,false); uninstall.Click+=delegate{MelApp.Uninstall();}; Controls.Add(uninstall);

        Controls.Add(MelApp.Label("Icône MEL près de l’horloge · Ctrl+Alt+M pour ouvrir instantanément.",30,510,680,25,9,MelApp.Muted,FontStyle.Regular));
        FormClosing += delegate(object s, FormClosingEventArgs e){ if (!MelApp.Exiting && e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();} };
        timer=new System.Windows.Forms.Timer(); timer.Interval=15000; timer.Tick+=delegate{RefreshAll();}; timer.Start(); Shown+=delegate{RefreshAll();};
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
        var ok=MelApp.Heartbeat(); state.Text=ok?"● Connecté à MEL":"● Reconnexion…"; state.ForeColor=ok?MelApp.Green:MelApp.Red;
        MelApp.Tray.Text=ok?"MEL Companion — connecté":"MEL Companion — reconnexion";
        devicePanel.Controls.Clear(); var devices=MelApp.Devices();
        if (devices.Count==0)
        {
            devicePanel.Controls.Add(MelApp.Label("Aucun MINI/Android visible pour le moment.",20,28,622,30,10,MelApp.Muted,FontStyle.Regular));
            devicePanel.Controls.Add(MelApp.Label("Les flux live apparaîtront ici uniquement quand l’appareil publiera un vrai endpoint vidéo.",20,62,650,45,9,MelApp.Muted,FontStyle.Regular));
            return;
        }
        int y=12;
        foreach(var d in devices)
        {
            var row=new Panel(); row.SetBounds(12,y,660,64); row.BackColor=Color.FromArgb(22,33,58); devicePanel.Controls.Add(row);
            var name=Get(d,"name"); var kind=Get(d,"kind"); var online=Bool(d,"online"); var camera=Bool(d,"camera"); var live=Bool(d,"live_stream");
            row.Controls.Add(MelApp.Label((kind=="android"?"ANDROID":"MINI")+"  •  "+name,14,9,340,24,10,MelApp.Text,FontStyle.Bold));
            row.Controls.Add(MelApp.Label(online?"● EN LIGNE":"● HORS LIGNE",14,34,150,20,8.5f,online?MelApp.Green:MelApp.Red,FontStyle.Bold));
            row.Controls.Add(MelApp.Label(camera?"Caméra ✓":"Caméra —",170,34,110,20,8.5f,camera?MelApp.Cyan:MelApp.Muted,FontStyle.Regular));
            var cam=MelApp.TechButton(live?"OUVRIR FLUX":"CAMÉRA",520,14,120,34,live); cam.Enabled=camera;
            cam.Click+=delegate {
                if (live) MelApp.OpenMel();
                else MessageBox.Show("La caméra est détectée, mais aucun flux vidéo live réel n’est encore publié par cet appareil.\n\nLe bouton passera automatiquement à « OUVRIR FLUX » dès qu’un endpoint live sera disponible.", "MEL — caméra");
            };
            row.Controls.Add(cam); y+=72;
        }
    }
}

class Program
{
    static Mutex mutex;
    [STAThread]
    static void Main(string[] args)
    {
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
        MelApp.InstallFiles(MelApp.StartupEnabled()); MelApp.StartCompanion(); MelApp.BuildTray();
        MelApp.HotKey=new HotKeyWindow();
        MelApp.Main=new MainForm(); if(!background) MelApp.Main.Show(); Application.Run();
        try { if (MelApp.HotKey != null) MelApp.HotKey.Dispose(); } catch { }
        mutex.ReleaseMutex();
    }
}