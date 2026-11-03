export const SHARD_MAP_DRIVE_NAME = 'MEL-SHARD-MAP.json';

export const EMBEDDED_DISCOVERY_INDEX = {"format":"MEL-ShardVault-DiscoveryIndex","version":3,"updated_at":"2026-09-19T17:48:00Z","seed_leads":[{"name":"/TMP/FILES","url":"https://tmpfiles.org","summary":"Première exploration manuelle : hébergement temporaire anonyme, API signalée, rétention courte. Piste seulement ; politique d'automatisation à vérifier."},{"name":"Gofile","url":"https://gofile.io","summary":"Première exploration manuelle : hébergement de fichiers avec usage invité et API documentée par plusieurs catalogues. Piste seulement ; conditions et autorisation à vérifier."},{"name":"1fichier","url":"https://1fichier.com","summary":"Première exploration manuelle : upload invité et prise en charge API signalés par PolyUploader. Piste seulement ; conditions à vérifier."},{"name":"TempFile.org","url":"https://tempfile.org","summary":"Première exploration manuelle : API REST publique documentée pour fichiers temporaires. Piste seulement ; politique d'automatisation à vérifier."},{"name":"FileDitch","url":"https://fileditch.com","summary":"Première exploration manuelle : service anonyme avec backend API mentionné publiquement. Piste seulement ; politique d'automatisation à vérifier."},{"name":"Pastebin.ai","url":"https://pastebin.ai","summary":"API anonyme documentée, automatisation raisonnable permise, expiration jusqu'à 1 an/never. Candidat prioritaire; validation uniquement par round-trip MEL."},{"name":"dpaste.com","url":"https://dpaste.com","summary":"API anonyme documentée, expiration jusqu'à 365 jours; User-Agent et <=1 requête/s. Candidat prioritaire à sonder."},{"name":"PasteMyst","url":"https://paste.myst.rs","summary":"API ouverte/gratuite, accès anonyme et expirations 1y/never. Candidat prioritaire à sonder."},{"name":"1C3","url":"https://1c3.ir","summary":"Upload anonyme texte/fichier, jusqu'à 365 jours; respecter strictement les limites et l'interdiction des uploads massifs."},{"name":"paste.c-net.org","url":"https://paste.c-net.org","summary":"Paste binaire console, rétention annoncée 180 jours renouvelée par accès; vérifier TLS/DNS et round-trip depuis MEL."},{"name":"MSK Paste","url":"https://paste.msk-scripts.de","summary":"API JSON publique sans authentification, expiration 1 an, 1 MB; candidat prioritaire à sonder."}],"catalogs":[{"id":"awesome-file-hosts","kind":"file-host-directory","url":"https://raw.githubusercontent.com/FahadBinHussain/awesome-file-hosts/main/README.md","note":"Catalogue public, structuré et sourcé. Génère uniquement des pistes."},{"id":"awesome-free-file-hosting","kind":"file-host-directory","url":"https://raw.githubusercontent.com/Nick088Official/awesome-free-file-hosting/main/README.md","note":"Deuxième catalogue public de services d'hébergement gratuits."},{"id":"polyuploader","kind":"host-capability-directory","url":"https://raw.githubusercontent.com/spel987/PolyUploader/main/README.md","note":"Liste d'hébergeurs et capacités API/anonymes utilisées uniquement comme pistes."},{"id":"awesome-public-free-apis","kind":"public-api-directory","url":"https://raw.githubusercontent.com/gunjanjaswal/Awesome-Public-Free-Apis/main/README.md","note":"Catalogue d'API publiques utilisé uniquement pour découverte."}],"native_feeds":["https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/shardvault/feed.json"],"github_repository_search":true,"github_catalog_search":true,"experience_playbooks":["https://raw.githubusercontent.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/main/shardvault/qualification-playbook.json"]};

export function shardMapDocument(index = EMBEDDED_DISCOVERY_INDEX) {
  if (index?.format !== 'MEL-ShardVault-DiscoveryIndex') {
    throw Object.assign(new Error('SHARD_MAP_FORMAT_INVALID'), { code: 'SHARD_MAP_FORMAT_INVALID' });
  }
  return {
    schema: 'mel.shard-map/v1',
    name: SHARD_MAP_DRIVE_NAME,
    readable_without_github: true,
    readable_without_cloudflare: true,
    notice: 'Carte des morceaux de code. Ouvrir ce fichier depuis Google Drive si GitHub et Cloudflare sont arrêtés.',
    index,
  };
}

export function shardMapText(index) {
  return JSON.stringify(shardMapDocument(index));
}

export function parseShardMap(text) {
  const parsed = JSON.parse(String(text || ''));
  if (parsed?.schema !== 'mel.shard-map/v1' || parsed?.index?.format !== 'MEL-ShardVault-DiscoveryIndex') {
    throw Object.assign(new Error('SHARD_MAP_DOCUMENT_INVALID'), { code: 'SHARD_MAP_DOCUMENT_INVALID' });
  }
  return parsed;
}
