// Retrieval, creation and discussion are distinct. Uploaded/private assets
// and contextual media references require the existing attachment/context path.
const CREATE_MEDIA = /^(?:(?:peux|pourrais)[- ]tu\s+(?:me\s+)?)?(?:genere(?:r)?|cree(?:r)?|compose(?:r)?|dessine(?:r)?|fabrique(?:r)?)(?:[- ](?:moi|nous))?\s+(?:(?:un|une|des|du|de la)\s+)?(?:(?:petit|petite|court|courte|nouveau|nouvelle)\s+)?(musique|melodie|composition musicale|jingle|videos?|clips?|animation|sons?|audio|bruitage|enregistrement|images?|photos?|dessin|illustration)\b/;
// The requested noun must follow the command, not appear anywhere in its
// topic: “montre le code pour afficher une vidéo” requests code, not a video.
const FIND_MEDIA = /^(?:(?:peux|pourrais)[- ]tu\s+(?:me\s+)?)?(?:montre(?:r)?|affiche(?:r)?|cherche(?:r)?|recherche(?:r)?|trouve(?:r)?|donne(?:r)?|fais[- ]moi\s+ecouter|fais\s+ecouter|faire\s+ecouter|j['’]aimerais\s+(?:voir|ecouter))(?:(?:[- ]moi)\b)?\s+(?:sur\s+(?:internet|le web)\s+)?(?:(?:un|une|des|du|de la|le|la|les|quelques)\s+|l[\x27’])?(?:(\d{1,3}|deux|trois|quatre|cinq|six)\s+)?(?:(?:belle?s?|jolie?s?|petite?s?|courte?s?|vraie?s?|reelle?s?)\s+)?(videos?|clips?|sons?|audios?|enregistrements?|musique|melodie|images?|photos?|portraits?)\b/;
const COUNTS = {deux:2,trois:3,quatre:4,cinq:5,six:6};

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
  // Speech quotes are literal content, not a request to fetch a referenced URL
  // or open a named file. A colon keeps an absent attachment from being guessed.
  const speak=value.match(/^(?:(?:peux|pourrais)[- ]tu\s+(?:me\s+)?)?(?:lis|prononce|dis|lire|prononcer|dire)\s+(?:ceci\s+)?(?:[àa]\s+voix\s+haute|oralement)\s*[:：]\s*([\s\S]+)$/i);
  if(speak)return {id:'media.audio.synthesize',input:{text:speak[1].slice(0,4000)}};
  if(/^(?:pourquoi|comment)\b|\bne\s+(?:me\s+)?(?:montre|cherche|recherche|affiche)\b|\b(?:exemple|syntaxe|bug|ci[- ]jointe?s?|jointe?s?|envoyee?s?|televersee?s?|uploadee?s?|mon fichier|ma video|mon audio|ma photo|mon image|mes fichiers|mes videos|mes audios|mes photos|mes images|capture d['’]ecran|(?:cette|ces)\s+(?:videos?|images?|photos?)|(?:cet|ces)\s+audios?)\b/.test(normalized))return null;
  if(/https?:\/\//i.test(value))return null;
  // Classify the requested object, never a media noun in its subject/purpose.
  const create=normalized.match(CREATE_MEDIA);
  if(create)return {id:'media.'+mediaKind(create[1])+'.generate',input:{prompt:value}};
  const find=normalized.match(FIND_MEDIA);
  if(!find)return null;
  const kind=mediaKind(find[2]);
  const count=Math.max(1,Math.min(6,COUNTS[find[1]]||Number(find[1])||1));
  if(kind==='image')return {id:'web.images.search',input:{query:value.slice(0,240),max_images:count}};
  return {id:'web.media.search',input:{query:value,type:kind==='video'?'video':'audio',max_results:count}};
}
