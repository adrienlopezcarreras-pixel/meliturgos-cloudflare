// Relance automatique des pages MEL (mode complet).
//
// Ce que le module fait :
// - lectures (GET) : une erreur transitoire (délai, réseau, 502/503/504) est
//   relancée automatiquement, deux fois au plus, avec un délai croissant ;
// - panneaux : un panneau dont le chargement a échoué est rechargé tout seul,
//   puis à nouveau quand le réseau revient ou que l'onglet redevient visible ;
// - chat : après une erreur transitoire, la page va chercher dans la
//   conversation enregistrée la réponse que le serveur a pu terminer. Si elle
//   existe, elle s'affiche ; sinon un bouton « Renvoyer » est proposé.
//
// Ce que le module ne fait jamais : renvoyer automatiquement un message du
// chat ou une autre requête POST. Une demande déjà traitée par le serveur
// (commande sur le PC, tâche Work…) pourrait sinon s'exécuter deux fois.
//
// Les fonctions pures ci-dessous sont testées dans Node puis injectées telles
// quelles dans la page (Function.prototype.toString).

export function melIsTransientFailure(message) {
  const text = String(message || '');
  return /Réponse serveur trop lente|Failed to fetch|NetworkError|Load failed|network connection was lost|HTTP 50[234]\b|CHAT_DEADLINE_EXCEEDED/i.test(text);
}

export function melRelaunchDelays(kind) {
  if (kind === 'get') return [2000, 5000];
  if (kind === 'panel') return [5000, 15000];
  if (kind === 'chat') return [4000, 10000, 20000];
  return [];
}

// Retrouve la réponse de MEL enregistrée après le dernier message envoyé.
export function melFindRecoveredReply(rows, sentText) {
  const list = Array.isArray(rows) ? rows : [];
  const needle = String(sentText || '').trim().slice(0, 200);
  if (!needle) return null;
  let userIndex = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const role = String(list[i]?.role || '').toLowerCase();
    if (role === 'user') { userIndex = i; break; }
  }
  // Only the latest user turn counts: an older identical question must never
  // supply its stale answer when the new message was not saved.
  if (userIndex < 0 || !String(list[userIndex]?.content || list[userIndex]?.text || '').includes(needle)) return null;
  for (let i = userIndex + 1; i < list.length; i += 1) {
    const role = String(list[i]?.role || '').toLowerCase();
    if (role === 'user') return null;
    if (role === 'assistant' || role === 'mel') {
      const content = String(list[i]?.content || list[i]?.text || '').trim();
      if (content && !/^Erreur\s*:/i.test(content)) return content;
    }
  }
  return null;
}

// Relance une lecture GET sur erreur transitoire. Jamais utilisé pour un POST.
export async function melRetryGet(load, { delays = melRelaunchDelays('get'), sleep = ms => new Promise(r => setTimeout(r, ms)), isTransient = melIsTransientFailure } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt >= delays.length || !isTransient(error?.message)) throw error;
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
}

function melInstallAutoRelaunch() {
  if (window.__melAutoRelaunchInstalled) return;
  window.__melAutoRelaunchInstalled = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const setStatus = text => { const el = document.getElementById('chatStatus'); if (el) el.textContent = text; };

  // 1. Lectures GET : relance transparente.
  if (typeof jfetch === 'function') {
    const baseFetch = jfetch;
    jfetch = function (url, opts = {}) {
      const method = String(opts?.method || 'GET').toUpperCase();
      if (method !== 'GET') return baseFetch(url, opts);
      return melRetryGet(() => baseFetch(url, opts));
    };
  }

  // 2. Panneaux : rechargement après échec, retour réseau ou retour d'onglet.
  const failedPanels = new Set();
  if (typeof loadPanel === 'function') {
    const baseLoadPanel = loadPanel;
    loadPanel = async function (name, force = false) {
      try {
        const result = await baseLoadPanel(name, force);
        failedPanels.delete(name);
        return result;
      } catch (error) {
        if (!failedPanels.has(name) && melIsTransientFailure(error?.message)) {
          failedPanels.add(name);
          (async () => {
            for (const delay of melRelaunchDelays('panel')) {
              await sleep(delay);
              if (!failedPanels.has(name)) return;
              try { await baseLoadPanel(name, true); failedPanels.delete(name); return; } catch {}
            }
          })();
        }
        throw error;
      }
    };
  }
  const reloadFailedPanels = () => {
    const active = document.querySelector('.view.active')?.dataset?.panel;
    if (active && failedPanels.has(active)) loadPanel(active, true).catch(() => {});
  };
  window.addEventListener('online', reloadFailedPanels);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadFailedPanels(); });

  // 3. Chat : récupérer la réponse enregistrée, ne jamais renvoyer seul.
  if (typeof addMsg === 'function') {
    const baseAddMsg = addMsg;
    let lastUserText = '';
    let recovering = false;
    addMsg = function (role, text) {
      const returned = baseAddMsg(role, text);
      const node = document.getElementById('chatlog')?.lastElementChild || null;
      if (role === 'user') lastUserText = String(text || '');
      const value = String(text || '');
      if (role === 'mel' && /^Erreur\s*:/.test(value) && melIsTransientFailure(value) && lastUserText && !recovering) {
        recoverChat(lastUserText, node);
      }
      return returned;
    };
    async function recoverChat(sentText, errorNode) {
      recovering = true;
      const expectedConversation = typeof conversationId === 'string' ? conversationId : null;
      try {
        const delays = melRelaunchDelays('chat');
        for (let i = 0; i < delays.length; i += 1) {
          setStatus('Relance automatique ' + (i + 1) + '/' + delays.length + ' : recherche de la réponse de MEL…');
          await sleep(delays[i]);
          try {
            const d = await jfetch('/api/mel/conversations/latest');
            if (expectedConversation && String(d?.conversation?.id || '') !== expectedConversation) continue;
            const reply = melFindRecoveredReply(d?.messages, sentText);
            if (reply) {
              if (errorNode && errorNode.parentNode) errorNode.remove();
              baseAddMsg('mel', reply);
              setStatus('Réponse récupérée automatiquement.');
              return;
            }
          } catch {}
        }
        setStatus('Aucune réponse enregistrée pour ce message.');
        const log = document.getElementById('chatlog');
        if (log && typeof sendChat === 'function') {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ghost';
          button.textContent = 'Renvoyer le message';
          button.onclick = () => { button.remove(); sendChat(sentText); };
          log.appendChild(button);
          log.scrollTop = log.scrollHeight;
        }
      } finally {
        recovering = false;
      }
    }
  }
}

export const MEL_AUTO_RELAUNCH_SOURCE = [
  melIsTransientFailure,
  melRelaunchDelays,
  melFindRecoveredReply,
  melRetryGet,
  melInstallAutoRelaunch,
].map(fn => fn.toString()).join('\n') + '\nmelInstallAutoRelaunch();\n';
