export function renderPrivacyPolicyPage() {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Politique de confidentialité — MEL</title>
  <meta name="description" content="Politique de confidentialité de MEL, assistant personnel connecté à Google Gmail et à d'autres services.">
  <style>
    :root{color-scheme:light dark;--bg:#08111e;--card:#111d2d;--text:#f5f7fb;--muted:#b5c1d2;--line:#2b3c52;--link:#8ec5ff}
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.62}
    main{max-width:900px;margin:0 auto;padding:48px 22px 72px}article{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:clamp(22px,4vw,42px)}
    h1{font-size:clamp(2rem,5vw,3rem);line-height:1.05;margin:0 0 10px}h2{margin-top:30px;font-size:1.28rem}p,li{color:var(--muted)}
    a{color:var(--link)}.meta{font-size:.95rem;margin-bottom:28px}.brand{font-weight:750;letter-spacing:.02em}
  </style>
</head>
<body>
<main>
<article>
  <div class="brand">MEL</div>
  <h1>Politique de confidentialité</h1>
  <p class="meta">Dernière mise à jour : 28 septembre 2026</p>

  <p>MEL est un assistant personnel. Cette page explique comment les données sont utilisées lorsque l'utilisateur connecte un service tiers, notamment Google Gmail.</p>

  <h2>1. Données accessibles</h2>
  <p>Lorsque l'utilisateur autorise Gmail, MEL peut accéder uniquement aux données et actions correspondant aux autorisations accordées, par exemple lire ou rechercher des messages, préparer des brouillons et envoyer des messages à la demande de l'utilisateur.</p>

  <h2>2. Finalité de l'utilisation</h2>
  <p>Les données issues de Gmail et des autres services connectés sont utilisées uniquement pour fournir les fonctions demandées par l'utilisateur dans MEL. Elles ne sont pas utilisées à des fins de publicité ciblée et ne sont pas vendues.</p>

  <h2>3. Stockage et sécurité</h2>
  <p>Les identifiants d'application, jetons OAuth et autres secrets de connexion nécessaires au maintien de la session sont stockés côté serveur sous forme chiffrée. Les données peuvent également être traitées temporairement pour exécuter une action demandée par l'utilisateur. Toute autre conservation dépend des fonctions de MEL que l'utilisateur choisit d'utiliser.</p>

  <h2>4. Partage avec des tiers</h2>
  <p>MEL ne partage pas les données Gmail avec des tiers à des fins publicitaires. Des traitements techniques peuvent être effectués par les fournisseurs d'infrastructure strictement nécessaires au fonctionnement du service.</p>

  <h2>5. Contrôle par l'utilisateur</h2>
  <p>L'utilisateur peut retirer l'accès de MEL à son compte Google depuis les paramètres de sécurité de son compte Google. Une nouvelle autorisation peut alors être nécessaire pour reconnecter le service.</p>

  <h2>6. Données Google et usage limité</h2>
  <p>L'utilisation et le transfert par MEL des informations reçues des API Google respectent la <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">Google API Services User Data Policy</a>, y compris les exigences de Limited Use.</p>

  <h2>7. Évolution de cette politique</h2>
  <p>Cette politique peut être mise à jour si les fonctions ou les intégrations de MEL évoluent. La date de dernière mise à jour est indiquée en haut de cette page.</p>

  <h2>8. Contact</h2>
  <p>Pour toute question relative à cette politique ou à l'utilisation des données, utilisez l'adresse de contact développeur indiquée sur l'écran de consentement Google de l'application MEL.</p>

  <p><a href="/">Retour à MEL</a></p>
</article>
</main>
</body>
</html>`;
}
