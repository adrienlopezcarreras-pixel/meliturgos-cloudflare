// Quand une demande du chat doit être exécutée sur le PC d'Adrien par
// l'agent (plusieurs actions, ou une action à vérifier), plutôt que par une
// commande unique. Les demandes simples d'état ou de capture restent sur leur
// chemin rapide existant.

const PC_TARGET = /\b(?:sur\s+(?:mon|le)\s+(?:pc|ordinateur|ordi)|(?:mon|le)\s+(?:pc|ordinateur|ordi)\b|bloc[- ]?notes|notepad|calculatrice|explorateur(?:\s+de\s+fichiers)?|firefox|chrome|edge)\b/i;
const ACTION = /\b(?:ouvre|ouvrir|lance|lancer|d[ée]marre|[ée]cris|[ée]crire|tape|taper|saisis|remplis|clique|cliquer|va\s+sur|aller\s+sur|cherche|recherche|calcule|enregistre|sauvegarde|ferme|fermer|navigue|copie|colle|s[ée]lectionne|fais|faire|prends\s+le\s+contr[ôo]le)\b/i;
const STATUS_ONLY = /^(?:(?:quel\s+est\s+)?l['’]?[ée]tat|statut|est[- ]il\s+(?:connect[ée]|en\s+ligne)|mon\s+pc\s+est[- ]il)/i;
const SCREENSHOT_ONLY = /^(?:fais|prends|montre)(?:[- ]moi)?\s+(?:une\s+)?(?:capture|photo|screenshot)\b[^.!?]*$/i;

export function inferComputerAgentGoal(text) {
  const value = String(text || '').trim();
  if (!value || value.length > 2000) return null;
  if (!PC_TARGET.test(value) || !ACTION.test(value)) return null;
  if (STATUS_ONLY.test(value) || SCREENSHOT_ONLY.test(value)) return null;
  // Questions about the PC are conversation, not control (« comment ouvrir le bloc-notes ? »).
  if (/^(?:comment|pourquoi|est-ce\s+que\s+tu\s+peux\s+m['’]expliquer|explique)/i.test(value)) return null;
  return value;
}
