function clean(value, limit=4000){
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);
}
function normalize(value){
  return clean(value,8000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function stripResearchInstruction(value){
  let q=clean(value,2000);
  q=q.replace(/^(?:peux[- ]?tu\s+|tu\s+peux\s+)?(?:cherche|chercher|recherche|rechercher|trouve|trouver|v[eé]rifie|v[eé]rifier|confirme|confirmer|documente|documenter|enqu[eê]te|renseigne[- ]?toi)\s+(?:sur\s+|des\s+informations?\s+sur\s+)?/i,'');
  q=q.split(/\s+(?:et|puis|ensuite)\s+(?=(?:cr[eé]e|cree|sauvegarde|enregistre|m[eé]morise|garde|classe|range|archive)\b)/i)[0];
  return clean(q.replace(/[.!?]+$/g,''),1200)||clean(value,1200);
}
function searchQuery(value){
  let q=clean(value,1000)
    .replace(/^(?:retrouve|cherche|recherche|utilise|reprends|rappelle[- ]?toi|sers[- ]?toi)\s+/i,'')
    .replace(/\b(?:dans|parmi)\s+(?:tes|mes|les)\s+(?:fichiers|dossiers|recherches|notes|informations?)\b/ig,'')
    .replace(/\b(?:ce\s+que\s+tu\s+as\s+(?:trouv[eé]|sauvegard[eé]|enregistr[eé]|class[eé]))\b/ig,'');
  return clean(q.replace(/[.!?]+$/g,''),800)||clean(value,800);
}
function fileCreate(value){
  const m=String(value||'').match(/\b(?:cr[eé]e|cree|cr[eé]er|fais|faire)\s+(?:moi\s+)?(?:un\s+)?fichier(?:\s+(?:nomm[eé]|appel[eé])\s+([^,:]{1,120}))?\s*(?:contenant|avec|:)\s*([\s\S]{2,250000})$/i);
  if(!m)return null;
  const title=clean(m[1],180)||'Note MEL';
  const content=String(m[2]||'').trim();
  if(!content)return null;
  return {id:'knowledge.file.create',input:{title,filename:/\.[a-z0-9]{1,8}$/i.test(title)?title:undefined,content,remember:/\b(?:m[eé]morise|souviens|garde\s+en\s+m[eé]moire|enregistre\s+dans\s+ta\s+m[eé]moire)\b/i.test(value)}};
}

export function inferKnowledgeCapability(text){
  const value=clean(text,4000);
  if(!value)return null;
  const normalized=normalize(value);

  const explicitFile=fileCreate(value);
  if(explicitFile)return explicitFile;

  const readMatch=value.match(/\b(?:lis|lire|ouvre|ouvrir|relis|v[eé]rifie)\s+(?:le\s+|la\s+)?fichier\s+([A-Za-z0-9_. -]{2,180}\.[A-Za-z0-9]{1,8})\b/i);
  if(readMatch&&!/\b(?:internet|web|source|recherche)\b/i.test(value)){
    return {id:'knowledge.file.read',input:{filename:clean(readMatch[1],180)}};
  }

  const storedContext=/\b(?:dans|parmi)\s+(?:tes|les)\s+(?:fichiers|dossiers|recherches|notes|informations?)\b/i.test(value)
    ||/\bce\s+que\s+tu\s+as\s+(?:trouv[eé]|sauvegard[eé]|enregistr[eé]|class[eé]|m[eé]moris[eé])\b/i.test(value)
    ||/\b(?:utilise|reprends|sers[- ]?toi)\b.*\b(?:dossier|recherche|fichier|information|note)\b/i.test(value);
  if(storedContext){
    return {id:'knowledge.search',input:{query:searchQuery(value),limit:10}};
  }

  const research=/\b(?:cherche|chercher|recherche|rechercher|trouve|trouver|v[eé]rifie|v[eé]rifier|confirme|confirmer|documente|documenter|enqu[eê]te|renseigne[- ]?toi)\b/i.test(value)
    ||/\b(?:sur\s+internet|sur\s+le\s+web|sources?\s+(?:fiables|officielles?|r[eé]centes?))\b/i.test(value);
  if(!research)return null;

  const persist=/\b(?:fichier|dossier|sauvegarde|sauvegarder|enregistre|enregistrer|m[eé]morise|m[eé]moriser|souviens|garde\s+en\s+m[eé]moire|classe|classer|range|ranger|archive|archiver)\b/i.test(value);
  const remember=/\b(?:m[eé]morise|m[eé]moriser|souviens|garde\s+en\s+m[eé]moire|enregistre\s+(?:ça|cela|les\s+informations?)?\s*dans\s+(?:ta|la)\s+m[eé]moire)\b/i.test(value);
  const verify=/\b(?:v[eé]rifie|v[eé]rifier|confirme|confirmer|recoupe|recouper|fact[- ]?check|sources?\s+(?:fiables|officielles?|multiples))\b/i.test(value);
  const classify=/\b(?:classe|classer|range|ranger|cat[eé]gorise|cat[eé]goriser)\b/i.test(value);
  return {
    id:'knowledge.research',
    input:{
      query:stripResearchInstruction(value),
      depth:verify?3:2,
      save_file:persist,
      remember:remember||classify||/\bdossier\b/i.test(value),
    }
  };
}
