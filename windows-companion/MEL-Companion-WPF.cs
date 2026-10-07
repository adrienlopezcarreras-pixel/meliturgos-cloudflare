using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

static class WpfMelUi
{
    public static readonly Brush Bg = Brush(5,10,22);
    public static readonly Brush Panel = Brush(13,24,45);
    public static readonly Brush Card = Brush(18,31,49);
    public static readonly Brush Cyan = Brush(103,214,239);
    public static readonly Brush Text = Brush(241,247,255);
    public static readonly Brush Muted = Brush(154,174,205);
    public static readonly Brush Green = Brush(91,210,158);
    public static readonly Brush Red = Brush(239,103,116);
    public static readonly Brush Violet = Brush(111,78,163);
    public static readonly Brush Line = Brush(48,78,112);

    static SolidColorBrush Brush(byte r, byte g, byte b)
    {
        var brush = new SolidColorBrush(Color.FromRgb(r,g,b));
        brush.Freeze();
        return brush;
    }

    public static BitmapSource Avatar()
    {
        using (var ms = new MemoryStream(MelApp.AvatarBytes()))
        {
            var decoder = BitmapDecoder.Create(ms, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            var frame = decoder.Frames[0];
            frame.Freeze();
            return frame;
        }
    }

    public static ImageSource WindowIcon()
    {
        using (var ms = new MemoryStream(MelApp.IconBytes()))
        {
            var decoder = BitmapDecoder.Create(ms, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            var frame = decoder.Frames[0];
            frame.Freeze();
            return frame;
        }
    }

    public static Image AvatarImage(double size)
    {
        return new Image {
            Source = Avatar(),
            Width = size,
            Height = size,
            Stretch = Stretch.UniformToFill,
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0,0,18,0)
        };
    }

    public static TextBlock TextBlock(string text, double size, Brush color, FontWeight weight)
    {
        return new TextBlock {
            Text = text,
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = size,
            FontWeight = weight,
            Foreground = color,
            TextWrapping = TextWrapping.Wrap,
            VerticalAlignment = VerticalAlignment.Center
        };
    }

    public static Button Button(string text, bool primary)
    {
        var b = new Button {
            Content = text,
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = 16,
            FontWeight = FontWeights.SemiBold,
            Padding = new Thickness(18,10,18,10),
            Margin = new Thickness(6,4,0,4),
            MinHeight = 44,
            MinWidth = 110,
            Cursor = System.Windows.Input.Cursors.Hand,
            Background = primary ? Cyan : Card,
            Foreground = primary ? Brushes.Black : Text,
            BorderBrush = primary ? Cyan : Line,
            BorderThickness = new Thickness(1)
        };
        return b;
    }

    public static Border CardBorder()
    {
        return new Border {
            Background = Card,
            BorderBrush = Line,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(20),
            Margin = new Thickness(0,0,0,14),
            HorizontalAlignment = HorizontalAlignment.Stretch
        };
    }

    public static Border Badge(string text, Brush background)
    {
        var label = TextBlock(text, 14, Text, FontWeights.Bold);
        label.HorizontalAlignment = HorizontalAlignment.Center;
        label.TextAlignment = TextAlignment.Center;
        return new Border {
            Background = background,
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(12,6,12,6),
            Margin = new Thickness(6,2,0,2),
            MinWidth = 86,
            Child = label,
            VerticalAlignment = VerticalAlignment.Center
        };
    }

    public static string Get(Dictionary<string,object> d, string key)
    {
        object value;
        return d != null && d.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
    }

    public static bool Bool(Dictionary<string,object> d, string key)
    {
        object value;
        if (d == null || !d.TryGetValue(key, out value) || value == null) return false;
        try { return Convert.ToBoolean(value); } catch { return false; }
    }
}

class SetupForm : Window
{
    TextBox server = new TextBox();
    TextBox user = new TextBox();
    PasswordBox pass = new PasswordBox();
    CheckBox startup = new CheckBox();
    TextBlock status;

    public SetupForm()
    {
        Title = "MEL Techno Companion — installation";
        Icon = WpfMelUi.WindowIcon();
        Width = 900;
        Height = 690;
        MinWidth = 720;
        MinHeight = 560;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = WpfMelUi.Bg;
        Foreground = WpfMelUi.Text;
        FontFamily = new FontFamily("Segoe UI");

        var root = new Grid { Margin = new Thickness(30) };
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        Content = root;

        var header = new Grid { Margin = new Thickness(0,0,0,20) };
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        header.Children.Add(WpfMelUi.AvatarImage(104));
        var heads = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        heads.Children.Add(WpfMelUi.TextBlock("MEL TECHNO COMPANION", 28, WpfMelUi.Cyan, FontWeights.Bold));
        heads.Children.Add(WpfMelUi.TextBlock("Installation Windows · liaison sécurisée", 17, WpfMelUi.Text, FontWeights.SemiBold));
        heads.Children.Add(WpfMelUi.TextBlock("Associe ce PC à MEL. Les identifiants ne sont jamais conservés.", 14, WpfMelUi.Muted, FontWeights.Normal));
        Grid.SetColumn(heads,1);
        header.Children.Add(heads);
        Grid.SetRow(header,0);
        root.Children.Add(header);

        var card = WpfMelUi.CardBorder();
        var form = new Grid();
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        form.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        form.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var title = WpfMelUi.TextBlock("APPAIRAGE MEL", 18, WpfMelUi.Cyan, FontWeights.Bold);
        Grid.SetColumnSpan(title,2);
        form.Children.Add(title);

        var serverLabel = WpfMelUi.TextBlock("Adresse MEL",14,WpfMelUi.Muted,FontWeights.Normal);
        serverLabel.Margin = new Thickness(0,20,0,6);
        Grid.SetRow(serverLabel,1); Grid.SetColumnSpan(serverLabel,2); form.Children.Add(serverLabel);
        StyleText(server); server.Text = MelApp.DefaultServer; server.Margin = new Thickness(0,0,0,14);
        Grid.SetRow(server,2); Grid.SetColumnSpan(server,2); form.Children.Add(server);

        var userLabel = WpfMelUi.TextBlock("Utilisateur",14,WpfMelUi.Muted,FontWeights.Normal);
        userLabel.Margin = new Thickness(0,6,10,6);
        Grid.SetRow(userLabel,3); Grid.SetColumn(userLabel,0); form.Children.Add(userLabel);
        var passLabel = WpfMelUi.TextBlock("Mot de passe",14,WpfMelUi.Muted,FontWeights.Normal);
        passLabel.Margin = new Thickness(10,6,0,6);
        Grid.SetRow(passLabel,3); Grid.SetColumn(passLabel,1); form.Children.Add(passLabel);

        StyleText(user); user.Text = "adrien"; user.Margin = new Thickness(0,0,10,14);
        Grid.SetRow(user,4); Grid.SetColumn(user,0); form.Children.Add(user);
        StylePassword(pass); pass.Margin = new Thickness(10,0,0,14);
        Grid.SetRow(pass,4); Grid.SetColumn(pass,1); form.Children.Add(pass);

        startup.Content = "Lancer MEL Companion avec Windows";
        startup.IsChecked = true;
        startup.FontSize = 15;
        startup.Foreground = WpfMelUi.Text;
        startup.Margin = new Thickness(0,12,0,0);
        Grid.SetRow(startup,5); Grid.SetColumnSpan(startup,2); form.Children.Add(startup);

        card.Child = form;
        Grid.SetRow(card,1);
        root.Children.Add(card);

        var footer = new Grid { Margin = new Thickness(0,12,0,0) };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1,GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        status = WpfMelUi.TextBlock("Prêt à appairer ce PC.",14,WpfMelUi.Muted,FontWeights.SemiBold);
        footer.Children.Add(status);
        var actions = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Right };
        var cancel = WpfMelUi.Button("ANNULER",false);
        cancel.Click += delegate { DialogResult = false; Close(); };
        var connect = WpfMelUi.Button("CONNECTER",true);
        connect.Click += Connect;
        actions.Children.Add(cancel); actions.Children.Add(connect);
        Grid.SetColumn(actions,1); footer.Children.Add(actions);
        Grid.SetRow(footer,2); root.Children.Add(footer);
    }

    static void StyleText(TextBox box)
    {
        box.FontSize=16; box.Padding=new Thickness(10); box.MinHeight=42;
        box.Background=WpfMelUi.Card; box.Foreground=WpfMelUi.Text; box.BorderBrush=WpfMelUi.Line;
    }

    static void StylePassword(PasswordBox box)
    {
        box.FontSize=16; box.Padding=new Thickness(10); box.MinHeight=42;
        box.Background=WpfMelUi.Card; box.Foreground=WpfMelUi.Text; box.BorderBrush=WpfMelUi.Line;
    }

    void Connect(object sender, RoutedEventArgs e)
    {
        if (pass.Password.Length == 0) { status.Text="Mot de passe requis."; status.Foreground=WpfMelUi.Red; return; }
        status.Text="Appairage sécurisé en cours…"; status.Foreground=WpfMelUi.Cyan;
        string error;
        if (!MelApp.Pair(server.Text, string.IsNullOrWhiteSpace(user.Text) ? "adrien" : user.Text.Trim(), pass.Password, out error))
        {
            pass.Clear(); status.Text="Échec : " + error; status.Foreground=WpfMelUi.Red; return;
        }
        pass.Clear();
        MelApp.InstallFiles(startup.IsChecked == true);
        status.Text="Ordinateur connecté ✓"; status.Foreground=WpfMelUi.Green;
        DialogResult=true;
        Close();
    }
}

class PermissionsForm : Window
{
    readonly List<CheckBox> appBoxes = new List<CheckBox>();
    readonly List<CheckBox> pathBoxes = new List<CheckBox>();

    public PermissionsForm()
    {
        Title = "MEL Companion — autorisations";
        Icon = WpfMelUi.WindowIcon();
        Width = 900; Height = 720; MinWidth = 700; MinHeight = 560;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = WpfMelUi.Bg; Foreground = WpfMelUi.Text;
        FontFamily = new FontFamily("Segoe UI");

        var root = new Grid { Margin = new Thickness(28) };
        root.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height=new GridLength(1,GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        Content = root;

        var header = new Grid { Margin=new Thickness(0,0,0,18) };
        header.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width=new GridLength(1,GridUnitType.Star) });
        header.Children.Add(WpfMelUi.AvatarImage(86));
        var hs=new StackPanel { VerticalAlignment=VerticalAlignment.Center };
        hs.Children.Add(WpfMelUi.TextBlock("AUTORISATIONS LOCALES",25,WpfMelUi.Cyan,FontWeights.Bold));
        hs.Children.Add(WpfMelUi.TextBlock("MEL ne dépassera jamais les droits activés ici.",14,WpfMelUi.Muted,FontWeights.Normal));
        Grid.SetColumn(hs,1); header.Children.Add(hs);
        root.Children.Add(header);

        var scroll = new ScrollViewer { VerticalScrollBarVisibility=ScrollBarVisibility.Auto, HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled };
        var content = new StackPanel();
        scroll.Content=content;

        var appsCard=WpfMelUi.CardBorder();
        var apps=new StackPanel();
        apps.Children.Add(WpfMelUi.TextBlock("APPLICATIONS",18,WpfMelUi.Cyan,FontWeights.Bold));
        apps.Children.Add(WpfMelUi.TextBlock("Accès autorisé au moteur local",14,WpfMelUi.Muted,FontWeights.Normal));
        var appWrap=new WrapPanel { Margin=new Thickness(0,14,0,0) };
        var currentApps=MelApp.ConfigList("allowed_apps");
        for(int i=0;i<MelApp.PermissionApps.Length;i++)
        {
            var cb=new CheckBox {
                Content=MelApp.PermissionAppLabels[i], Tag=MelApp.PermissionApps[i],
                IsChecked=MelApp.ContainsIgnoreCase(currentApps,MelApp.PermissionApps[i]),
                Foreground=WpfMelUi.Text, FontSize=15, Margin=new Thickness(0,6,28,6),
                MinWidth=200
            };
            appBoxes.Add(cb); appWrap.Children.Add(cb);
        }
        apps.Children.Add(appWrap); appsCard.Child=apps; content.Children.Add(appsCard);

        var pathsCard=WpfMelUi.CardBorder();
        var pathsStack=new StackPanel();
        pathsStack.Children.Add(WpfMelUi.TextBlock("DOSSIERS",18,WpfMelUi.Cyan,FontWeights.Bold));
        var paths=MelApp.PermissionPaths();
        var currentPaths=MelApp.ConfigList("allowed_paths");
        for(int i=0;i<paths.Length;i++)
        {
            var cb=new CheckBox {
                Content=paths[i], Tag=paths[i],
                IsChecked=MelApp.ContainsIgnoreCase(currentPaths,paths[i]),
                Foreground=WpfMelUi.Text, FontSize=14, Margin=new Thickness(0,9,0,0)
            };
            pathBoxes.Add(cb); pathsStack.Children.Add(cb);
        }
        pathsCard.Child=pathsStack; content.Children.Add(pathsCard);
        content.Children.Add(WpfMelUi.TextBlock("Toute désactivation est immédiate. Une réactivation reste limitée aux droits accordés lors de l’appairage.",13,WpfMelUi.Muted,FontWeights.Normal));

        Grid.SetRow(scroll,1); root.Children.Add(scroll);

        var footer=new WrapPanel { HorizontalAlignment=HorizontalAlignment.Right, Margin=new Thickness(0,14,0,0) };
        var cancel=WpfMelUi.Button("ANNULER",false); cancel.Click += delegate { Close(); };
        var save=WpfMelUi.Button("APPLIQUER",true); save.Click += Apply;
        footer.Children.Add(cancel); footer.Children.Add(save);
        Grid.SetRow(footer,2); root.Children.Add(footer);
    }

    void Apply(object sender, RoutedEventArgs e)
    {
        var apps=new List<string>();
        foreach(var box in appBoxes) if(box.IsChecked==true) apps.Add(Convert.ToString(box.Tag));
        var paths=new List<string>();
        foreach(var box in pathBoxes) if(box.IsChecked==true) paths.Add(Convert.ToString(box.Tag));
        try {
            MelApp.SavePermissions(apps,paths);
            MessageBox.Show(this,"Autorisations appliquées. Le moteur MEL a été rechargé.","MEL Companion",MessageBoxButton.OK,MessageBoxImage.Information);
            DialogResult=true; Close();
        } catch(Exception ex) {
            MessageBox.Show(this,"Impossible d’appliquer les autorisations : "+ex.Message,"MEL Companion",MessageBoxButton.OK,MessageBoxImage.Error);
        }
    }
}

class MainForm : Window
{
    TextBlock state;
    TextBlock pcLine;
    TextBlock pcSubline;
    TextBlock devicesTitle;
    StackPanel deviceStack;
    CheckBox startup;
    DispatcherTimer timer;
    bool refreshing;

    public MainForm()
    {
        Title="MEL Techno Companion";
        Icon=WpfMelUi.WindowIcon();
        Width=1320; Height=860; MinWidth=900; MinHeight=620;
        WindowStartupLocation=WindowStartupLocation.CenterScreen;
        WindowState=WindowState.Maximized;
        Background=WpfMelUi.Bg; Foreground=WpfMelUi.Text;
        FontFamily=new FontFamily("Segoe UI");

        var root=new Grid { Margin=new Thickness(30) };
        root.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height=new GridLength(1,GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        Content=root;

        var header=new Grid { Margin=new Thickness(0,0,0,18) };
        header.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width=new GridLength(1,GridUnitType.Star) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        header.Children.Add(WpfMelUi.AvatarImage(100));

        var hs=new StackPanel { VerticalAlignment=VerticalAlignment.Center };
        hs.Children.Add(WpfMelUi.TextBlock("MEL TECHNO COMPANION",30,WpfMelUi.Cyan,FontWeights.Bold));
        hs.Children.Add(WpfMelUi.TextBlock("Windows · contrôle local sécurisé",18,WpfMelUi.Text,FontWeights.SemiBold));
        hs.Children.Add(WpfMelUi.TextBlock("Même identité MEL que l’APK et la MINI",14,WpfMelUi.Muted,FontWeights.Normal));
        Grid.SetColumn(hs,1); header.Children.Add(hs);

        var ha=new StackPanel { VerticalAlignment=VerticalAlignment.Center, HorizontalAlignment=HorizontalAlignment.Right };
        var open=WpfMelUi.Button("OUVRIR MEL",true); open.Click += delegate { MelApp.OpenMel(); };
        state=WpfMelUi.TextBlock("● Vérification…",15,WpfMelUi.Muted,FontWeights.SemiBold);
        state.HorizontalAlignment=HorizontalAlignment.Right;
        ha.Children.Add(open); ha.Children.Add(state);
        Grid.SetColumn(ha,2); header.Children.Add(ha);
        root.Children.Add(header);

        var pc=WpfMelUi.CardBorder();
        var pcGrid=new Grid();
        pcGrid.ColumnDefinitions.Add(new ColumnDefinition { Width=new GridLength(1,GridUnitType.Star) });
        pcGrid.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        var pcTexts=new StackPanel();
        pcTexts.Children.Add(WpfMelUi.TextBlock("CE PC",15,WpfMelUi.Cyan,FontWeights.Bold));
        pcLine=WpfMelUi.TextBlock(Environment.MachineName+"  ·  "+MelApp.ComputerId,20,WpfMelUi.Text,FontWeights.Bold);
        pcTexts.Children.Add(pcLine);
        pcSubline=WpfMelUi.TextBlock("Contrôle autorisé · captures · commandes MEL en arrière-plan · liaison chiffrée",14,WpfMelUi.Muted,FontWeights.Normal);
        pcTexts.Children.Add(pcSubline);
        pcGrid.Children.Add(pcTexts);
        var motor=WpfMelUi.Badge("MOTEUR",WpfMelUi.Violet); Grid.SetColumn(motor,1); pcGrid.Children.Add(motor);
        pc.Child=pcGrid; Grid.SetRow(pc,1); root.Children.Add(pc);

        var section=new Grid { Margin=new Thickness(0,0,0,10) };
        section.ColumnDefinitions.Add(new ColumnDefinition { Width=new GridLength(1,GridUnitType.Star) });
        section.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        devicesTitle=WpfMelUi.TextBlock("APPAREILS MEL",20,WpfMelUi.Cyan,FontWeights.Bold);
        section.Children.Add(devicesTitle);
        var sectionActions=new WrapPanel { HorizontalAlignment=HorizontalAlignment.Right };
        var permissions=WpfMelUi.Button("AUTORISATIONS",false);
        permissions.Click += delegate { var dlg=new PermissionsForm { Owner=this }; dlg.ShowDialog(); };
        var refresh=WpfMelUi.Button("ACTUALISER",false); refresh.Click += delegate { RefreshAll(); };
        sectionActions.Children.Add(permissions); sectionActions.Children.Add(refresh);
        Grid.SetColumn(sectionActions,1); section.Children.Add(sectionActions);
        Grid.SetRow(section,2); root.Children.Add(section);

        deviceStack=new StackPanel { HorizontalAlignment=HorizontalAlignment.Stretch };
        var scroll=new ScrollViewer {
            Content=deviceStack,
            VerticalScrollBarVisibility=ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,
            HorizontalContentAlignment=HorizontalAlignment.Stretch
        };
        Grid.SetRow(scroll,3); root.Children.Add(scroll);

        var footer=new Grid { Margin=new Thickness(0,16,0,0) };
        footer.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        footer.RowDefinitions.Add(new RowDefinition { Height=GridLength.Auto });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width=new GridLength(1,GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        startup=new CheckBox {
            Content="Lancer MEL Companion avec Windows", Foreground=WpfMelUi.Text,
            FontSize=15, IsChecked=MelApp.StartupEnabled(), VerticalAlignment=VerticalAlignment.Center
        };
        startup.Checked += delegate { MelApp.ConfigureStartup(true); };
        startup.Unchecked += delegate { MelApp.ConfigureStartup(false); };
        footer.Children.Add(startup);
        var fa=new WrapPanel { HorizontalAlignment=HorizontalAlignment.Right };
        var repair=WpfMelUi.Button("RÉPARER",false);
        repair.Click += delegate { MelApp.InstallFiles(startup.IsChecked==true); MelApp.StartCompanion(); RefreshAll(); };
        var rePair=WpfMelUi.Button("RÉAPPAIRER",false); rePair.Click += RePair;
        var uninstall=WpfMelUi.Button("DÉSINSTALLER",false); uninstall.Click += delegate { MelApp.Uninstall(); };
        fa.Children.Add(repair); fa.Children.Add(rePair); fa.Children.Add(uninstall);
        Grid.SetColumn(fa,1); footer.Children.Add(fa);
        var note=WpfMelUi.TextBlock("Le Companion reste actif dans la zone de notification quand cette fenêtre est fermée. Raccourci : Ctrl+Alt+M.",13,WpfMelUi.Muted,FontWeights.Normal);
        note.Margin=new Thickness(0,8,0,0); Grid.SetRow(note,1); Grid.SetColumnSpan(note,2); footer.Children.Add(note);
        Grid.SetRow(footer,4); root.Children.Add(footer);

        Closing += OnClosing;
        Loaded += delegate { RefreshAll(); };
        timer=new DispatcherTimer { Interval=TimeSpan.FromSeconds(10) };
        timer.Tick += delegate { RefreshAll(); };
        timer.Start();
    }

    void OnClosing(object sender, CancelEventArgs e)
    {
        if(!MelApp.Exiting) { e.Cancel=true; Hide(); }
    }

    void RePair(object sender, RoutedEventArgs e)
    {
        if(MessageBox.Show(this,"Réappairer ce PC à MEL ?","MEL Companion",MessageBoxButton.YesNo,MessageBoxImage.Question)!=MessageBoxResult.Yes) return;
        try { File.Delete(MelApp.ConfigPath); } catch {}
        Hide();
        var setup=new SetupForm { Owner=this };
        var result=setup.ShowDialog();
        if(result==true && MelApp.LoadConfig()) {
            MelApp.InstallFiles(startup.IsChecked==true);
            MelApp.StartCompanion();
            pcLine.Text=Environment.MachineName+"  ·  "+MelApp.ComputerId;
        }
        Show(); RefreshAll();
    }

    Border BuildDevice(Dictionary<string,object> d)
    {
        var name=WpfMelUi.Get(d,"name");
        var kind=WpfMelUi.Get(d,"kind");
        var online=WpfMelUi.Bool(d,"online");
        var camera=WpfMelUi.Bool(d,"camera");
        var mic=WpfMelUi.Bool(d,"microphone");
        var live=WpfMelUi.Bool(d,"live_stream");
        var firmware=WpfMelUi.Get(d,"firmware");
        var phase=WpfMelUi.Get(d,"phase");

        var card=WpfMelUi.CardBorder();
        var grid=new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width=new GridLength(1,GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width=GridLength.Auto });
        grid.Children.Add(WpfMelUi.AvatarImage(68));

        var center=new StackPanel { Margin=new Thickness(0,0,16,0), VerticalAlignment=VerticalAlignment.Center };
        var title=WpfMelUi.TextBlock((kind=="android"?"ANDROID · ":"MINI · ")+(string.IsNullOrEmpty(name)?"Appareil MEL":name),19,WpfMelUi.Text,FontWeights.Bold);
        center.Children.Add(title);
        center.Children.Add(WpfMelUi.TextBlock((string.IsNullOrEmpty(phase)?"MEL DEVICE":phase)+(string.IsNullOrEmpty(firmware)?"":"  ·  "+firmware),14,WpfMelUi.Muted,FontWeights.Normal));
        var caps=new WrapPanel { Margin=new Thickness(0,8,0,0) };
        caps.Children.Add(WpfMelUi.Badge(camera?"CAM OK":"CAM —",camera?WpfMelUi.Cyan:WpfMelUi.Line));
        caps.Children.Add(WpfMelUi.Badge(mic?"MIC OK":"MIC —",mic?WpfMelUi.Green:WpfMelUi.Line));
        center.Children.Add(caps);
        Grid.SetColumn(center,1); grid.Children.Add(center);

        var onlineBadge=WpfMelUi.Badge(online?"ONLINE":"OFFLINE",online?WpfMelUi.Green:WpfMelUi.Red);
        Grid.SetColumn(onlineBadge,2); grid.Children.Add(onlineBadge);

        var cameraButton=WpfMelUi.Button(live?"OUVRIR FLUX":"CAMÉRA",live);
        cameraButton.IsEnabled=camera;
        cameraButton.Margin=new Thickness(12,4,0,4);
        cameraButton.Click += delegate {
            if(live) MelApp.OpenMel();
            else MessageBox.Show(this,"La caméra est détectée, mais aucun flux vidéo live réel n’est publié par cet appareil.","MEL — caméra");
        };
        Grid.SetColumn(cameraButton,3); grid.Children.Add(cameraButton);
        card.Child=grid;
        return card;
    }

    void RenderState(bool ok, List<Dictionary<string,object>> devices)
    {
        state.Text=ok?"● Connecté à MEL":"● Reconnexion…";
        state.Foreground=ok?WpfMelUi.Green:WpfMelUi.Red;
        if(MelApp.Tray!=null) MelApp.Tray.Text=ok?"MEL Companion — connecté":"MEL Companion — reconnexion";
        devicesTitle.Text=devices.Count==0?"APPAREILS MEL · aucun appareil":"APPAREILS MEL · "+devices.Count;
        deviceStack.Children.Clear();
        if(devices.Count==0) {
            var empty=WpfMelUi.CardBorder();
            empty.Child=WpfMelUi.TextBlock("Aucun appareil MEL visible. La MINI ou l’APK apparaîtront ici au prochain heartbeat.",15,WpfMelUi.Muted,FontWeights.Normal);
            deviceStack.Children.Add(empty);
        } else {
            foreach(var d in devices) deviceStack.Children.Add(BuildDevice(d));
        }
    }

    void RefreshAll()
    {
        if(refreshing) return;
        refreshing=true;
        state.Text="● Actualisation…"; state.Foreground=WpfMelUi.Muted;
        ThreadPool.QueueUserWorkItem(delegate {
            bool ok=false;
            var devices=new List<Dictionary<string,object>>();
            try {
                MelApp.EnsureCompanion();
                MelApp.MaybeRefreshCompanionEngine(false);
                ok=MelApp.Heartbeat();
                devices=MelApp.Devices();
            } catch {}
            Dispatcher.BeginInvoke(new Action(delegate {
                refreshing=false;
                RenderState(ok,devices);
            }));
        });
    }
}

class Program
{
    static Mutex mutex;

    [STAThread]
    static void Main(string[] args)
    {
        MelApp.EnableDpiAwareness();
        bool selfTest=args!=null && Array.Exists(args,delegate(string a){return a=="--self-test";});
        if(selfTest) { MelApp.RunSelfTest(); return; }

        bool created;
        mutex=new Mutex(true,"MEL.Companion.Desktop.v2",out created);
        if(!created) return;

        var app=new System.Windows.Application();
        app.ShutdownMode=ShutdownMode.OnExplicitShutdown;
        bool background=args!=null && Array.Exists(args,delegate(string a){return a=="--background";});

        if(!MelApp.LoadConfig()) {
            var setup=new SetupForm();
            if(setup.ShowDialog()!=true || !MelApp.LoadConfig()) { mutex.ReleaseMutex(); return; }
        }

        MelApp.InstallFiles(MelApp.StartupEnabled());
        MelApp.StartCompanion();
        MelApp.MaybeRefreshCompanionEngine(true);
        MelApp.BuildTray();
        MelApp.HotKey=new HotKeyWindow();
        MelApp.Main=new MainForm();
        if(!background) MelApp.Main.Show();
        app.Run();

        try { if(MelApp.HotKey!=null) MelApp.HotKey.Dispose(); } catch {}
        try { mutex.ReleaseMutex(); } catch {}
    }
}
