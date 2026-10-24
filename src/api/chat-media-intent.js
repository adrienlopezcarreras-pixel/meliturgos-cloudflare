// Retrieval, creation and discussion are distinct. Uploaded/private assets
// stay in the existing attachment pipeline.
const CREATE_MEDIA = /^(?:(?:peux|pourrais)[- ]tu\s+(?:me\s+)?)?(?:genere(?:r)?|cree(?:r)?|compose(?:r)?|dessine(?:r)?|fabrique(?:r)?)\s+(?:(?:moi|nous)\s+)?(?:(?:un|une|des|du|de la)\s+)?(?:(?:petit|petite|court|courte|nouveau|nouvelle)\s+)?(musique|melodie|composition musicale|jingle|videos?|clips?|animation|sons?|audio|bruitage|enregistrement|images?|photos?|dessin|illustration)\b/;
const FIND_MEDIA = /^(?:(?:peux|pourrais)[- ]tu\s+(?:me\s+)?)?(?:montre(?:r)?(?:[- ]moi)?|affiche(?:r)?|cherche(?:r)?|recherche(?:r)?|trouve(?:r)?|donne(?:r)?(?:[- ]moi)?|fais[- ]moi\s+ecouter|fais\s+ecouter|faire\s+ecouter)\b[\s\S]{0,80}?\b(videos?|clips?|sons?|audios?|enregistrements?|musique|melodie|images?|photos?|portraits?)\b/;
function mediaKind(noun) {
  if (/^(?:musique|melodie|composition musicale|jingle)$/.test(noun)) return 'music';
  if (/^(?:videos?|clips?|animation)$/.test(noun)) return 'video';
  if (/^(?:sons?|audios?|bruitage|enregistrements?)$/.test(noun)) return 'audio';
  return 'image';
}

export function inferChatMediaCapability(text) {
  const value=String(text||'').trim();
  if(!value||value.length>2000)return null;
  const normalized=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/^(?:pourquoi|comment)\b|\b(?:exemple|syntaxe|bug|ci[- ]jointe?|envoye|televerse|mon fichier|ma video|mon audio)\b/.test(normalized))return null;
  if(/https?:\/\//i.test(value))return null;
  const speak=value.match(/^(?:lis|prononce|dis)\s+(?:ceci\s+)?(?:[àa]\s+voix\s+haute|oralement)\s*[:：]\s*([\s\S]+)$/i);
  if(speak)return {id:'media.audio.synthesize',input:{text:speak[1].slice(0,4000)}};
  // Classify the requested object, never a media noun in its subject/purpose.
  const create=normalized.match(CREATE_MEDIA);
  if(create)return {id:'media.'+mediaKind(create[1])+'.generate',input:{prompt:value}};
  const find=normalized.match(FIND_MEDIA);
  if(!find)return null;
  const kind=mediaKind(find[1]);
  // Image retrieval stays on the existing public-photo route in native chat.
  if(kind==='image')return null;
  const count=find[0].match(/\b([1-6])\s+(?:videos?|clips?|sons?|audios?|enregistrements?)\b/);
  return {id:'web.media.search',input:{query:value,type:kind==='video'?'video':'audio',max_results:count?Number(count[1]):1}};
}
