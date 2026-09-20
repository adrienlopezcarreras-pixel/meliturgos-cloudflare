import { createConversationService } from '../conversations/conversation-service.js';

const STOPWORDS = new Set(['alors','avec','avant','avoir','cela','cette','comme','dans','depuis','elle','elles','encore','entre','etre','faire','faut','mais','meme','nous','pour','plus','quand','sans','sera','sont','tout','toute','toutes','tous','vous','votre','vos','quel','quelle','quoi','comment','peux','peut','dois','doit','vais','fait','dire','moi','mon','mes','ton','tes','notre','leur','leurs','une','des','les','aux','sur','est','pas']);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function tokens(value) {
  return [...new Set((normalize(value).match(/[a-z0-9]{4,}/g) || []).filter(x => !STOPWORDS.has(x)))];
}
function excerpt(value, limit = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}
function capabilities(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}
function overlapRatio(a, b) {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (!ta.length) return 1;
  return ta.filter(x => tb.has(x)).length / ta.length;
}
function accessClaim(text) {
  const n = normalize(text);
  if (/je (?:n ai pas|ne peux pas).*acces.*(?:code|depot|repo)/.test(n)) return 'NO_CODE_ACCESS';
  if (/j ai acces.*(?:code|depot|repo)|je peux.*(?:lire|inspecter).*(?:code|depot|repo)/.test(n)) return 'HAS_CODE_ACCESS';
  return null;
}
function completionClaim(text) {
  const n = normalize(text);
  if (/(?:c est fait|termine|fini|deployee? en prod|en production)/.test(n)) return 'CLAIMS_DONE';
  if (/(?:pas encore|en cours|non termine|n est pas termine|pas deploye)/.test(n)) return 'CLAIMS_NOT_DONE';
  return null;
}

export async function auditOwnerCommunication(env = {}, input = {}) {
  if (!env?.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING' });
  const service = createConversationService(env);
  await service.migrate();

  const owner = String(env.MELITURGOS_USER || 'owner');
  const allConversations = input.allConversations === true;
  const conversationId = allConversations ? '' : String(input.conversationId || '').trim();
  const maxMessages = Math.max(100, Math.min(5000, Number(input.maxMessages) || 2500));
  let totalRow;
  let rows;

  if (conversationId) {
    totalRow = await env.DB.prepare("SELECT COUNT(*) count FROM archive_messages a JOIN conversations c ON c.id=a.conversation_id WHERE a.conversation_id=? AND (c.owner=? OR c.owner='')").bind(conversationId, owner).first();
    rows = (await env.DB.prepare("SELECT a.id,a.conversation_id,a.role,a.content,a.timestamp,a.capabilities_used_json FROM archive_messages a JOIN conversations c ON c.id=a.conversation_id WHERE a.conversation_id=? AND (c.owner=? OR c.owner='') ORDER BY a.timestamp DESC,a.id DESC LIMIT ?").bind(conversationId, owner, maxMessages).all()).results || [];
  } else {
    totalRow = await env.DB.prepare("SELECT COUNT(*) count FROM archive_messages a JOIN conversations c ON c.id=a.conversation_id WHERE c.owner=? OR c.owner=''").bind(owner).first();
    rows = (await env.DB.prepare("SELECT a.id,a.conversation_id,a.role,a.content,a.timestamp,a.capabilities_used_json FROM archive_messages a JOIN conversations c ON c.id=a.conversation_id WHERE c.owner=? OR c.owner='' ORDER BY a.timestamp DESC,a.id DESC LIMIT ?").bind(owner, maxMessages).all()).results || [];
  }

  rows = [...rows].reverse();
  const issues = [];
  const issueCounts = {};
  const push = (issue) => {
    if (issues.length >= 80) return;
    issues.push(issue);
    issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
  };

  const byConversation = new Map();
  for (const row of rows) {
    const key = String(row.conversation_id || '');
    if (!byConversation.has(key)) byConversation.set(key, []);
    byConversation.get(key).push(row);
  }

  for (const [conversationIdKey, messages] of byConversation) {
    let previousUser = null;
    let lastAccess = null;
    let lastCompletion = null;

    for (const row of messages) {
      const role = String(row.role || '').toLowerCase();
      const content = String(row.content || '');
      if (role === 'user') {
        previousUser = row;
        continue;
      }
      if (role !== 'assistant') continue;

      if (/\b(?:vous|votre|vos)\b/i.test(content)) {
        push({ type:'FORMAL_ADDRESS', conversation_id:conversationIdKey, message_id:row.id, assistant_excerpt:excerpt(content), summary:'MEL emploie un registre de vouvoiement dans une réponse à Adrien.' });
      }
      if (/^\s*(?:en tant qu['’](?:ia|intelligence artificielle)|je dois pr[ée]ciser que)/i.test(content)) {
        push({ type:'META_PREAMBLE', conversation_id:conversationIdKey, message_id:row.id, assistant_excerpt:excerpt(content), summary:'Préambule méta au lieu d’une réponse directe.' });
      }
      if (/\b(?:je n['’]?ai pas acc[eè]s|je ne peux pas acc[eè]der)\b/i.test(content)) {
        push({ type:'GLOBAL_INCAPACITY_CLAIM', conversation_id:conversationIdKey, message_id:row.id, assistant_excerpt:excerpt(content), summary:'Incapacité formulée globalement ; elle doit être reliée à une preuve runtime ponctuelle.' });
      }

      if (previousUser) {
        const userText = String(previousUser.content || '');
        const ratio = overlapRatio(userText, content);
        if (userText.length >= 45 && content.length >= 90 && tokens(userText).length >= 3 && ratio === 0) {
          push({ type:'POSSIBLE_OFF_TOPIC', conversation_id:conversationIdKey, user_message_id:previousUser.id, assistant_message_id:row.id, user_excerpt:excerpt(userText), assistant_excerpt:excerpt(content), summary:'Réponse possiblement hors sujet : aucun terme significatif partagé avec la demande immédiatement précédente.' });
        }
      }

      const used = capabilities(row.capabilities_used_json);
      if (/\b(?:c['’]est fait|termin[ée]|fini|d[ée]ploy[ée] en prod(?:uction)?|en production)\b/i.test(content) && !used.some(id => /^(?:evolution\.|code\.|autonomy\.|work\.)/.test(id))) {
        push({ type:'UNSUPPORTED_COMPLETION_CLAIM', conversation_id:conversationIdKey, message_id:row.id, assistant_excerpt:excerpt(content), summary:'Conclusion de fin/déploiement sans capability de travail/code enregistrée sur cette réponse.' });
      }

      const ac = accessClaim(content);
      if (ac) {
        if (lastAccess && lastAccess.claim !== ac && Math.abs(Number(row.timestamp || 0) - Number(lastAccess.timestamp || 0)) <= 86400000) {
          push({ type:'POSSIBLE_SELF_CONTRADICTION', conversation_id:conversationIdKey, message_id:row.id, assistant_excerpt:excerpt(content), summary:'Accès code contradictoire à moins de 24 h : ' + lastAccess.claim + ' puis ' + ac + '.' });
        }
        lastAccess = { claim:ac, timestamp:row.timestamp };
      }

      const cc = completionClaim(content);
      if (cc) {
        if (lastCompletion && lastCompletion.claim !== cc && Math.abs(Number(row.timestamp || 0) - Number(lastCompletion.timestamp || 0)) <= 21600000) {
          push({ type:'POSSIBLE_STATUS_CONTRADICTION', conversation_id:conversationIdKey, message_id:row.id, assistant_excerpt:excerpt(content), summary:'Statut contradictoire à moins de 6 h : ' + lastCompletion.claim + ' puis ' + cc + '.' });
        }
        lastCompletion = { claim:cc, timestamp:row.timestamp };
      }
    }
  }

  return {
    ok:true,
    audited_at:new Date().toISOString(),
    scope:conversationId ? 'single_conversation' : 'owner_recent_history',
    conversation_id:conversationId || null,
    total_messages:Number(totalRow?.count || 0),
    scanned_messages:rows.length,
    scanned_conversations:byConversation.size,
    truncated:Number(totalRow?.count || 0) > rows.length,
    issue_counts:issueCounts,
    issues,
  };
}


export async function readRecentCommunicationQuality(env = {}, input = {}) {
  if (!env?.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code:'DB_BINDING_MISSING' });
  const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
  const conversationId = String(input.conversationId || '').trim();
  try {
    const statement = conversationId
      ? env.DB.prepare('SELECT conversation_id,user_excerpt,response_excerpt,issues_json,relevance_json,created_at FROM mel_response_quality_events WHERE conversation_id=? ORDER BY created_at DESC LIMIT ?').bind(conversationId, limit)
      : env.DB.prepare('SELECT conversation_id,user_excerpt,response_excerpt,issues_json,relevance_json,created_at FROM mel_response_quality_events ORDER BY created_at DESC LIMIT ?').bind(limit);
    const result = await statement.all();
    const events = (result.results || []).map(row => {
      let issues = [];
      let relevance = {};
      try { issues = JSON.parse(row.issues_json || '[]'); } catch {}
      try { relevance = JSON.parse(row.relevance_json || '{}'); } catch {}
      return {
        conversation_id:String(row.conversation_id || ''),
        user_excerpt:String(row.user_excerpt || '').slice(0,500),
        response_excerpt:String(row.response_excerpt || '').slice(0,800),
        issues:Array.isArray(issues) ? issues.slice(0,12) : [],
        relevance,
        created_at:Number(row.created_at || 0),
      };
    });
    return { ok:true, count:events.length, events };
  } catch (error) {
    if (/no such table|does not exist/i.test(String(error?.message || ''))) return { ok:true, count:0, events:[] };
    throw error;
  }
}

export function registerCommunicationAuditCapability(bus, env = {}) {
  bus.discover({
    id:'conversation.audit',
    name:'Audit de cohérence des échanges MEL',
    category:'conversation',
    version:'1.0.0',
    provider:'mel',
    description:'Relit de façon bornée les échanges archivés avec Adrien et signale contradictions, hors-sujet possibles, oublis de style et affirmations de statut insuffisamment étayées.',
    input_schema:{
      type:'object',
      properties:{
        conversationId:{ type:'string', minLength:0, maxLength:200 },
        maxMessages:{ type:'integer', minimum:100, maximum:5000 },
        allConversations:{ type:'boolean' },
      },
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'LOW',
    permissions:[],
    health:env.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled:true,
  }, (input) => auditOwnerCommunication(env, input || {}));

  bus.discover({
    id:'conversation.quality.recent',
    name:'Incidents récents de qualité conversationnelle',
    category:'conversation',
    version:'1.0.0',
    provider:'mel',
    description:'Relit les incidents automatiquement détectés après génération afin que MEL puisse voir ses dérives récentes sans confondre signal heuristique et preuve absolue.',
    input_schema:{
      type:'object',
      properties:{
        conversationId:{ type:'string', minLength:0, maxLength:200 },
        limit:{ type:'integer', minimum:1, maximum:50 },
      },
      additionalProperties:false,
    },
    output_schema:{ type:'object', additionalProperties:true },
    risk:'LOW',
    permissions:[],
    health:env.DB ? 'HEALTHY' : 'UNAVAILABLE',
    enabled:true,
  }, input => readRecentCommunicationQuality(env, input || {}));

  return bus;
}
