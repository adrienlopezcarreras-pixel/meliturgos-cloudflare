export function renderFidesGuestPage() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MEL FIDES — Mode invité</title>
<meta name="description" content="Présentation de MEL FIDES, prototype d'intelligence artificielle pour la foi catholique, la conversion des adultes et le dialogue catholique-orthodoxe.">
<style>
:root{color-scheme:dark;--bg:#07111f;--panel:#101d2f;--panel2:#15243a;--text:#f7f4ec;--muted:#bac5d4;--line:#31445f;--gold:#d6b35f;--blue:#60a5fa;--good:#6ee7b7}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:radial-gradient(circle at 82% 12%,rgba(214,179,95,.12),transparent 32%),linear-gradient(180deg,#06101d,#091525 48%,#06101d);color:var(--text)}
button,textarea{font:inherit}.shell{min-height:100vh;display:grid;grid-template-columns:270px minmax(0,1fr)}aside{border-right:1px solid var(--line);padding:22px 16px;background:rgba(3,9,18,.92);position:sticky;top:0;height:100vh}.brand{display:flex;align-items:center;gap:12px;padding:8px}.mark{width:54px;height:54px;border:1px solid rgba(214,179,95,.6);border-radius:18px;display:grid;place-items:center;font-size:30px;background:linear-gradient(145deg,rgba(214,179,95,.16),rgba(96,165,250,.08));box-shadow:0 0 38px rgba(214,179,95,.12)}.brand strong{display:block;font-size:1.05rem}.brand small{display:block;color:var(--muted);margin-top:3px}.guest{display:inline-flex;margin:18px 8px 12px;padding:7px 10px;border:1px solid rgba(110,231,183,.3);border-radius:999px;color:#b7f7df;background:rgba(16,185,129,.07);font-size:.78rem;font-weight:750;letter-spacing:.04em}.nav{display:grid;gap:7px;margin-top:8px}.nav button{border:1px solid transparent;border-radius:12px;background:transparent;color:#dbe5f3;text-align:left;padding:11px 12px;cursor:pointer}.nav button.active,.nav button:hover{background:rgba(255,255,255,.05);border-color:var(--line)}.privacy{position:absolute;bottom:22px;left:24px;right:24px;color:var(--muted);font-size:.75rem;line-height:1.45}.main{padding:clamp(18px,4vw,44px)}.top{max-width:1100px;margin:0 auto 22px}.eyebrow{color:var(--gold);font-size:.78rem;text-transform:uppercase;letter-spacing:.16em;font-weight:800}.top h1{font-size:clamp(2.2rem,6vw,4.7rem);line-height:1.02;margin:9px 0 14px;letter-spacing:-.045em}.top h1 span{color:var(--gold)}.lead{max-width:850px;color:#d9e0e9;font-size:clamp(1.02rem,2vw,1.23rem);line-height:1.65}.notice{max-width:1100px;margin:0 auto 20px;border:1px solid rgba(214,179,95,.28);background:rgba(214,179,95,.07);padding:13px 15px;border-radius:14px;color:#f5e8c6;font-size:.9rem}.view{display:none;max-width:1100px;margin:0 auto}.view.active{display:block}.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}.card{grid-column:span 6;background:linear-gradient(180deg,rgba(21,36,58,.96),rgba(10,23,40,.96));border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.18)}.card.third{grid-column:span 4}.card.wide{grid-column:1/-1}.card h2,.card h3{margin-top:0}.card p,.card li{color:var(--muted);line-height:1.62}.pill{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid rgba(214,179,95,.3);color:#f0d894;font-size:.75rem;margin-bottom:10px}.steps{counter-reset:s}.step{counter-increment:s;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.06)}.step:last-child{border-bottom:0}.step strong:before{content:counter(s) ". ";color:var(--gold)}.chat-card{padding:0;overflow:hidden}.chat-head{padding:18px 20px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.025)}.chat-head h2{margin:0}.chat-head p{margin:6px 0 0}.chatlog{min-height:360px;height:min(52vh,560px);overflow:auto;padding:18px}.msg{max-width:88%;padding:12px 14px;border-radius:15px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0}.msg.mel{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.04)}.msg.user{margin-left:auto;background:rgba(96,165,250,.13);border:1px solid rgba(96,165,250,.22)}.composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:16px;border-top:1px solid var(--line)}textarea{width:100%;min-height:84px;resize:vertical;border:1px solid var(--line);border-radius:14px;background:#07111f;color:white;padding:12px 13px;outline:none}textarea:focus{border-color:rgba(214,179,95,.65);box-shadow:0 0 0 3px rgba(214,179,95,.08)}.send{border:0;border-radius:14px;background:linear-gradient(135deg,#d6b35f,#ad8740);color:#09111c;font-weight:850;padding:0 20px;cursor:pointer;min-width:130px}.send:disabled{opacity:.55;cursor:wait}.suggestions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.suggestions button{border:1px solid var(--line);background:rgba(255,255,255,.03);color:#dce6f4;border-radius:999px;padding:8px 11px;cursor:pointer}.status{padding:0 18px 16px;color:var(--muted);font-size:.82rem}.tag-good{color:#a7f3d0}.footer{max-width:1100px;margin:22px auto 0;color:#8fa0b7;font-size:.78rem;line-height:1.5}
@media(max-width:860px){.shell{display:block}.main{padding-bottom:90px}aside{position:fixed;z-index:20;left:0;right:0;bottom:0;top:auto;height:auto;border-right:0;border-top:1px solid var(--line);padding:7px;background:rgba(3,9,18,.97)}.brand,.guest,.privacy{display:none}.nav{display:flex;margin:0;overflow-x:auto}.nav button{white-space:nowrap;flex:1;text-align:center;padding:10px 8px}.card,.card.third{grid-column:1/-1}.composer{grid-template-columns:1fr}.send{min-height:48px}}
</style>
</head>
<body>
<div class="shell">
<aside>
  <div class="brand"><div class="mark">✝</div><div><strong>MEL FIDES</strong><small>Foi &amp; conversion</small></div></div>
  <div class="guest">MODE INVITÉ · PRÉSENTATION</div>
  <nav class="nav" aria-label="Navigation MEL FIDES">
    <button class="active" data-view="presentation">Présentation</button>
    <button data-view="chat">Essayer MEL FIDES</button>
    <button data-view="method">Méthode & garanties</button>
  </nav>
  <div class="privacy">Cet espace invité est isolé de MEL personnel. Il n'expose ni mémoire privée, ni fichiers, ni messagerie, ni commandes système.</div>
</aside>
<main class="main">
  <header class="top">
    <div class="eyebrow">MEL · Modèle spécialisé</div>
    <h1>MEL <span>FIDES</span></h1>
    <p class="lead">Un prototype d'intelligence artificielle consacré à la foi catholique, à la découverte du christianisme et à l'accompagnement des adultes — conçu pour être sourcé, auditable et relu par des personnes compétentes de l'Église.</p>
  </header>
  <div class="notice"><strong>Prototype de présentation.</strong> MEL FIDES n'est pas à ce stade un outil officiellement approuvé par l'Église catholique. L'objectif est précisément de construire son cadre doctrinal et pastoral avec des relecteurs compétents.</div>

  <section class="view active" data-panel="presentation">
    <div class="grid">
      <article class="card wide">
        <span class="pill">Pourquoi MEL FIDES ?</span>
        <h2>Une IA qui sait distinguer ce qu'elle affirme</h2>
        <p>Le projet vise à éviter le mélange fréquent entre doctrine catholique, opinion personnelle, discipline, hypothèse historique et théologie ouverte. Une réponse importante doit pouvoir indiquer le statut de ce qu'elle présente et, lorsque le corpus définitif sera connecté, en donner la source vérifiable.</p>
      </article>
      <article class="card third"><h3>Conversion des adultes</h3><p>Répondre aux premières questions, proposer un chemin progressif et orienter vers une paroisse, un prêtre ou une équipe de catéchuménat lorsque la personne souhaite avancer.</p></article>
      <article class="card third"><h3>Doctrine auditable</h3><p>Corpus prévu : Écriture, Catéchisme, conciles, Magistère, Pères et docteurs de l'Église, droit canonique et travaux sélectionnés.</p></article>
      <article class="card third"><h3>Œcuménisme</h3><p>Une branche catholique–orthodoxe est envisagée en France, en distinguant clairement foi commune, disciplines propres et divergences réelles.</p></article>
      <article class="card wide">
        <h2>Parcours envisagé</h2>
        <div class="step"><strong>Découvrir</strong><div>Dieu, Jésus, Évangiles, Résurrection, prière, sens de la foi.</div></div>
        <div class="step"><strong>Comprendre</strong><div>Église, sacrements, Eucharistie, Marie, saints, morale, histoire.</div></div>
        <div class="step"><strong>Discerner</strong><div>Répondre aux objections, confronter foi, science et monde contemporain, sans masquer les difficultés.</div></div>
        <div class="step"><strong>Rencontrer</strong><div>Conduire de l'échange numérique vers une communauté chrétienne et un accompagnement humain réel.</div></div>
      </article>
    </div>
  </section>

  <section class="view" data-panel="chat">
    <article class="card wide chat-card">
      <div class="chat-head">
        <span class="pill">Démonstration isolée</span>
        <h2>Posez une question à MEL FIDES</h2>
        <p>Cette démonstration n'utilise aucune donnée personnelle de MEL.</p>
        <div class="suggestions">
          <button type="button">Pourquoi les catholiques croient-ils à la Résurrection ?</button>
          <button type="button">Je voudrais être baptisé adulte, par où commencer ?</button>
          <button type="button">Que partagent catholiques et orthodoxes ?</button>
          <button type="button">Comment concilier foi et science ?</button>
        </div>
      </div>
      <div class="chatlog" id="chatlog" aria-live="polite">
        <div class="msg mel">Bonjour. Je suis MEL FIDES en mode invité. Tu peux me poser une question sur la foi catholique, la conversion d'un adulte ou le dialogue avec les Églises orthodoxes. Je préciserai mes limites lorsque nécessaire.</div>
      </div>
      <form class="composer" id="chatForm">
        <textarea id="message" maxlength="1800" required placeholder="Votre question…"></textarea>
        <button class="send" id="send" type="submit">Envoyer</button>
      </form>
      <div class="status" id="status">Mode invité : <span class="tag-good">aucun accès aux données privées ni aux actions de MEL.</span></div>
    </article>
  </section>

  <section class="view" data-panel="method">
    <div class="grid">
      <article class="card"><h3>Sources avant affirmation</h3><p>Dans la version cible, les réponses doctrinales importantes doivent être reliées à des sources identifiables. Une référence exacte ne doit jamais être inventée.</p></article>
      <article class="card"><h3>Statut doctrinal explicite</h3><p>Le système doit pouvoir signaler : enseignement certain, discipline, opinion théologique, question ouverte, fait historique ou hypothèse.</p></article>
      <article class="card"><h3>Gouvernance humaine</h3><p>Les corrections doctrinales doivent être traçables et révisables par des personnes compétentes. L'IA ne se valide jamais elle-même.</p></article>
      <article class="card"><h3>Limites pastorales</h3><p>MEL FIDES ne remplace ni un prêtre, ni un catéchiste, ni un accompagnateur spirituel, ni la vie sacramentelle et communautaire.</p></article>
      <article class="card wide"><h3>Sécurité du mode invité</h3><p>Cette interface est volontairement séparée du centre de contrôle MEL : pas de mémoire personnelle, pas de courriels, pas de fichiers privés, pas de connecteurs, pas d'autonomie, pas de commandes techniques et pas de mutation du système.</p></article>
    </div>
  </section>

  <p class="footer">MEL FIDES · projet en développement par VI Éditions / Vérité Interdite · mode invité de présentation.</p>
</main>
</div>
<script>
(()=>{
  const nav=[...document.querySelectorAll('[data-view]')];
  const panels=[...document.querySelectorAll('[data-panel]')];
  function open(name){nav.forEach(b=>b.classList.toggle('active',b.dataset.view===name));panels.forEach(p=>p.classList.toggle('active',p.dataset.panel===name));}
  nav.forEach(b=>b.addEventListener('click',()=>open(b.dataset.view)));
  const input=document.getElementById('message'),form=document.getElementById('chatForm'),log=document.getElementById('chatlog'),send=document.getElementById('send'),status=document.getElementById('status');
  document.querySelectorAll('.suggestions button').forEach(b=>b.addEventListener('click',()=>{input.value=b.textContent;input.focus()}));
  function add(kind,text){const el=document.createElement('div');el.className='msg '+kind;el.textContent=text;log.appendChild(el);log.scrollTop=log.scrollHeight;}
  form.addEventListener('submit',async(e)=>{e.preventDefault();const message=String(input.value||'').trim();if(!message)return;add('user',message);input.value='';send.disabled=true;status.textContent='MEL FIDES prépare une réponse…';
    try{const r=await fetch('/api/public/fides/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message})});const p=await r.json().catch(()=>({}));if(!r.ok||!p.ok)throw new Error(p.error||'FIDES_CHAT_FAILED');add('mel',String(p.answer||''));status.textContent='Mode invité isolé · réponse de démonstration.'}
    catch{add('mel',"Je ne peux pas répondre pour le moment. Le mode invité reste disponible pour la présentation du projet.");status.textContent='Service de démonstration momentanément indisponible.'}
    finally{send.disabled=false;input.focus();}
  });
})();
</script>
</body>
</html>`;
}
