// Retrieval, creation and discussion are distinct. Uploaded/private assets
// stay in the existing attachment pipeline.
export function inferChatMediaCapability(text) {
  const value=String(text||'').trim();
  if(!value||value.length>2000)return null;
  const normalized=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/\b(?:pourquoi|comment|exemple|syntaxe|bug|ci[- ]jointe?|envoye|televerse|mon fichier|ma video|mon audio)\b/.test(normalized))return null;
  if(/https?:\/\//i.test(value))return null;
  const speak=value.match(/^(?:lis|prononce|dis)\s+(?:ceci\s+)?(?:[àa]\s+voix\s+haute|oralement)\s*[:：]\s*([\s\S]+)$/i);
  if(speak)return {id:'media.audio.synthesize',input:{text:speak[1].slice(0,4000)}};
  const create=/^(?:peux[- ]tu\s+)?(?:genere|cree|compose|dessine|fabrique)\b/.test(normalized);
  const music=/\b(?:musique|melodie|composition musicale|jingle)\b/.test(normalized);
  const video=/\b(?:videos?|clips?|animation)\b/.test(normalized);
  const audio=/\b(?:sons?|audio|bruitage|enregistrement)\b/.test(normalized);
  const image=/\b(?:images?|photos?|dessin|illustration)\b/.test(normalized);
  if(create&&(music||video||audio||image)) {
    const kind=music?'music':video?'video':audio?'audio':'image';
    return {id:'media.'+kind+'.generate',input:{prompt:value}};
  }
  if(!video&&!audio&&!music)return null;
  if(!/^(?:peux[- ]tu\s+)?(?:montre(?:[- ]moi)?|affiche|cherche|recherche|trouve|donne[- ]moi|fais[- ]moi\s+ecouter|fais\s+ecouter)\b/.test(normalized))return null;
  const count=normalized.match(/\b([1-6])\s+(?:videos?|clips?|sons?|enregistrements?)\b/);
  return {id:'web.media.search',input:{query:value,type:video?'video':'audio',max_results:count?Number(count[1]):1}};
}
