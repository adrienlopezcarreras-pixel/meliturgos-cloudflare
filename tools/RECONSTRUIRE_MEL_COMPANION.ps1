$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$MelDir = Join-Path $env:LOCALAPPDATA "MEL"
$Work = Join-Path $env:TEMP ("mel-companion-rebuild-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $MelDir,$Work | Out-Null

function Fail([string]$s) {
    [System.Windows.Forms.MessageBox]::Show(
        $s,
        "MEL Companion",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

try {
    $MelSvg = Join-Path $MelDir "mel-icon-final.svg"
@'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<rect width="128" height="128" rx="28" fill="#06101d"/>
<circle cx="64" cy="64" r="57" fill="#0d304a" stroke="#22d3ee" stroke-width="5"/>
<path fill="#17110f" d="M34 54c0-26 13-37 30-37 19 0 31 14 30 40-1 20-5 30-6 34H40c-2-7-6-19-6-37z"/>
<path fill="#3b241b" d="M38 51c1-20 11-29 26-29 17 0 26 13 25 32-4-9-11-15-21-18-10 6-20 8-29 7z"/>
<path fill="#d7a382" d="M43 48c0-13 9-20 21-20s21 8 21 21l-1 15c-1 12-9 22-20 22S45 76 44 64z"/>
<path fill="#2b1a14" d="M43 46c4-7 12-9 22-15 7 6 15 8 20 17l1-9c-4-11-11-17-22-17-13 0-21 8-23 19zM40 48c-6 13-3 32 3 43l6-12c-5-6-7-17-6-28zm48 0c6 15 3 32-3 43l-6-12c5-7 7-18 6-28z"/>
<path fill="#3a2721" d="M50 55h9v3h-9zm19 0h9v3h-9z"/>
<circle cx="53" cy="57" r="2" fill="#14212a"/><circle cx="73" cy="57" r="2" fill="#14212a"/>
<path fill="#b87867" d="M57 76c5 3 10 3 15 0-4 7-11 8-16 2z"/>
<path fill="#d7a382" d="M55 82h18v16H55z"/>
<path fill="#0b2238" d="M25 124c4-23 17-33 30-35 4 5 14 5 18 0 14 2 27 13 30 35z"/>
<path fill="#22d3ee" d="m45 96 13 12 6-7 6 7 14-12 7 28H37z"/>
<path fill="#071523" d="m49 97 15 15 15-15 6 27H43z"/>
<path stroke="#60a5fa" stroke-width="3" d="M17 102h16m62 0h16M13 109h24m54 0h24"/>
</svg>
'@ | Set-Content -LiteralPath $MelSvg -Encoding UTF8

    $MelHtml = Join-Path $MelDir "mel-icon-final.html"
@'
<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:256px;height:256px;overflow:hidden;background:transparent}
img{display:block;width:256px;height:256px}
</style></head><body><img src="mel-icon-final.svg"></body></html>
'@ | Set-Content -LiteralPath $MelHtml -Encoding UTF8

    $Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
    if (-not (Test-Path $Chrome)) { Fail "Google Chrome est requis pour recréer l'icône MEL finale." }

    $MelPng = Join-Path $MelDir "mel-icon-final.png"
    $MelIco = Join-Path $MelDir "mel-icon-final.ico"
    $uri = "file:///" + (($MelHtml -replace "\\","/") -replace " ","%20")
    & $Chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=256,256 --screenshot="$MelPng" $uri | Out-Null
    Start-Sleep -Milliseconds 900
    if (-not (Test-Path $MelPng)) { Fail "Impossible de générer l'icône MEL." }

    python -c "import PIL" 2>$null
    if ($LASTEXITCODE -ne 0) { python -m pip install --user pillow | Out-Null }
    & python -c "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGBA'); im.save(sys.argv[2],sizes=[(16,16),(20,20),(24,24),(32,32),(40,40),(48,48),(64,64),(128,128),(256,256)])" $MelPng $MelIco
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $MelIco)) { Fail "Impossible de créer mel-icon-final.ico." }

    $Source = Join-Path $Work "MEL-Companion.cs"
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/windows-companion/MEL-Companion.cs" -OutFile $Source
    $text = [IO.File]::ReadAllText($Source,[Text.Encoding]::UTF8)

    $text = [regex]::Replace(
        $text,
        'public static Icon MakeIcon\(\)\s*\{\s*var bmp = new Bitmap\(32,32\);',
@'
public static Icon MakeIcon()
    {
        try
        {
            var p = Path.Combine(MelDir, "mel-icon-final.ico");
            if (File.Exists(p)) return new Icon(p);
        }
        catch { }
        var bmp = new Bitmap(32,32);
'@,
        1
    )

    $text = [regex]::Replace(
        $text,
        'public SetupForm\(\)\s*\{\s*Text = "MEL Companion — installation";',
        'public SetupForm() { Icon=MelApp.MakeIcon(); ShowIcon=true; AutoScaleMode=AutoScaleMode.None; Text = "MEL Companion — installation";',
        1
    )
    $text = [regex]::Replace(
        $text,
        'public PermissionsForm\(\)\s*\{\s*Text = "MEL Companion — autorisations";',
        'public PermissionsForm() { Icon=MelApp.MakeIcon(); ShowIcon=true; AutoScaleMode=AutoScaleMode.None; Text = "MEL Companion — autorisations";',
        1
    )
    $text = [regex]::Replace(
        $text,
        'public MainForm\(\)\s*\{\s*Text="MEL Companion";',
        'public MainForm() { Icon=MelApp.MakeIcon(); ShowIcon=true; Text="MEL Companion";',
        1
    )

    $text = $text.Replace(
        'Text="MEL Companion"; ClientSize=new Size(760,560); StartPosition=FormStartPosition.CenterScreen;',
        'Text="MEL Companion"; ClientSize=new Size(760,610); StartPosition=FormStartPosition.CenterScreen; AutoScaleMode=AutoScaleMode.None;'
    )
    $text = $text.Replace(
        'startup.ForeColor=MelApp.Text; startup.BackColor=Color.Transparent; startup.AutoSize=true; startup.SetBounds(32,452,330,28);',
        'startup.ForeColor=MelApp.Text; startup.BackColor=Color.Transparent; startup.Font=new Font("Segoe UI",10.0f,FontStyle.Regular); startup.AutoSize=true; startup.SetBounds(32,462,330,30);'
    )
    $text = $text.Replace(
        'var repair=MelApp.TechButton("RÉPARER",370,445,100,34,false);',
        'var repair=MelApp.TechButton("RÉPARER",360,455,105,38,false);'
    )
    $text = $text.Replace(
        'var rePair=MelApp.TechButton("RÉAPPAIRER",480,445,110,34,false);',
        'var rePair=MelApp.TechButton("RÉAPPAIRER",475,455,115,38,false);'
    )
    $text = $text.Replace(
        'var uninstall=MelApp.TechButton("DÉSINSTALLER",600,445,120,34,false);',
        'var uninstall=MelApp.TechButton("DÉSINSTALLER",600,455,122,38,false);'
    )
    $text = [regex]::Replace(
        $text,
        'MelApp\.Label\("Icône MEL près de l’horloge · Ctrl\+Alt\+M pour ouvrir instantanément\.",30,510,680,25,9,MelApp\.Muted,FontStyle\.Regular\)',
        'MelApp.Label("Icône MEL près de l’horloge · Ctrl+Alt+M pour ouvrir instantanément.",30,535,690,30,10,MelApp.Muted,FontStyle.Regular)',
        1
    )

    $Engine = Join-Path $MelDir "MEL-Computer-Companion.ps1"
    if (-not (Test-Path $Engine)) {
        Fail "Le moteur MEL-Computer-Companion.ps1 n'est pas présent dans %LOCALAPPDATA%\MEL. Dis-moi ce message et je te fournis la récupération complète."
    }

    $B64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Engine))
    $text = $text.Replace("__COMPANION_B64__",$B64)

    $unicodeEscape = [Text.RegularExpressions.MatchEvaluator]{
        param($m)
        return ('\u{0:X4}' -f [int][char]$m.Value[0])
    }
    $ascii = [regex]::Replace($text,'[^\x00-\x7F]',$unicodeEscape)
    $BuildCs = Join-Path $Work "MEL-Companion.build.cs"
    [IO.File]::WriteAllText($BuildCs,$ascii,[Text.Encoding]::ASCII)

    $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe" }
    if (-not (Test-Path $csc)) { Fail "Le compilateur .NET Framework Windows est introuvable." }

    $Built = Join-Path $Work "MEL-Companion.exe"
    & $csc /nologo /target:winexe /optimize+ /out:$Built /win32icon:"$MelIco" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Security.dll $BuildCs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Built)) { Fail "La compilation de MEL Companion a échoué." }

    $Installed = Join-Path $MelDir "MEL-Companion.exe"
    Get-Process -Name "MEL-Companion" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 600
    if (Test-Path $Installed) {
        Copy-Item $Installed (Join-Path $MelDir "MEL-Companion.backup-before-rebuild.exe") -Force
    }
    Copy-Item $Built $Installed -Force

    $Startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\MEL-Companion.cmd"
    "@echo off`r`nstart `"`" `"$Installed`" --background`r`n" | Set-Content -LiteralPath $Startup -Encoding ASCII

    & (Join-Path $env:WINDIR "System32\ie4uinit.exe") -ClearIconCache
    & (Join-Path $env:WINDIR "System32\ie4uinit.exe") -show
    Start-Process -FilePath $Installed

    [System.Windows.Forms.MessageBox]::Show(
        "MEL Companion a été reconstruit et lancé.`r`n`r`nLogo MEL : restauré.`r`nTailles de texte : restaurées.`r`nDémarrage Windows : activé.`r`n`r`nFichier : $Installed",
        "MEL Companion — prêt",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
}
catch {
    Fail $_.Exception.Message
}
