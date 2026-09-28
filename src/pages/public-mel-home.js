export function renderPublicMelHomePage() {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MEL — Assistant personnel</title>
  <meta name="description" content="MEL est un assistant personnel qui peut se connecter à Gmail et à d'autres services avec l'autorisation explicite de l'utilisateur.">
  <style>
    :root{color-scheme:light dark;--bg:#08111e;--card:#111d2d;--text:#f5f7fb;--muted:#b5c1d2;--line:#2b3c52;--link:#8ec5ff;--accent:#60a5fa}
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.62}
    main{max-width:920px;margin:0 auto;padding:48px 22px 72px}.hero{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:clamp(24px,4vw,44px)}
    h1{font-size:clamp(2.2rem,6vw,3.7rem);line-height:1.04;margin:0 0 14px}h2{margin-top:30px;font-size:1.3rem}p,li{color:var(--muted)}
    a{color:var(--link)}.eyebrow{font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-size:.82rem}
    .cta{display:inline-block;margin-top:10px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--text)}
  </style>
</head>
<body>
<main>
<section class="hero">
  <div class="eyebrow">MEL</div>
  <h1>Assistant personnel connecté, sous le contrôle de son utilisateur</h1>
  <p>MEL aide son utilisateur à consulter et organiser ses informations, préparer des actions et interagir avec des services connectés. Les connexions à des services tiers ne sont utilisées qu'après autorisation explicite de l'utilisateur.</p>

  <h2>Connexion à Gmail</h2>
  <p>Lorsque Gmail est connecté, MEL peut utiliser les autorisations accordées pour rechercher et lire des messages, préparer des brouillons et envoyer des messages à la demande de l'utilisateur. MEL ne vend pas les données Gmail et ne les utilise pas pour de la publicité ciblée.</p>

  <h2>Contrôle et sécurité</h2>
  <p>Les secrets de connexion et jetons nécessaires au maintien des sessions sont conservés côté serveur sous forme chiffrée. L'utilisateur peut révoquer l'accès à tout moment depuis son compte Google ou en supprimant la connexion dans MEL.</p>

  <h2>Confidentialité</h2>
  <p>Les détails sur l'accès, l'utilisation, le stockage et le partage des données sont décrits dans la <a href="/privacy">politique de confidentialité de MEL</a>.</p>

  <p><a class="cta" href="/privacy">Lire la politique de confidentialité</a></p>
</section>
</main>
</body>
</html>`;
}
