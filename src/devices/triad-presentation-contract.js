// Shared UI presentation contract for MINI / Android / Windows.
// Pure functions: no device I/O, microphone activation, or remote commands.
const LABELS = Object.freeze({
  IDLE:["Au repos","Prêt pour OK MEL"],
  WAKE_DETECTED:["OK MEL reconnu","Ouverture de la conversation"],
  CAPTURING:["Je vous écoute","Microphone actif"],
  TRANSCRIBING:["Transcription","Compréhension de votre demande"],
  THINKING:["Réflexion","Préparation de la réponse"],
  RESPONDING:["MEL répond","Lecture de la réponse"],
  HALTED:["Arrêt demandé","Opérations interrompues"],
  PERMISSION_REVOKED:["Autorisation retirée","Vérifier les permissions"],
  LINK_LOST:["Connexion interrompue","Reconnexion nécessaire"],
  EXPIRED:["Session expirée","Nouvelle activation nécessaire"],
  ERROR:["Erreur","Réessayer après vérification"]
});
const ICON_STATES = Object.freeze({
  IDLE:"idle", WAKE_DETECTED:"wake", CAPTURING:"listening",
  TRANSCRIBING:"processing", THINKING:"processing", RESPONDING:"speaking",
  HALTED:"stopped", PERMISSION_REVOKED:"blocked", LINK_LOST:"offline",
  EXPIRED:"offline", ERROR:"error"
});
const READINESS = Object.freeze({
  UNAVAILABLE:["Indisponible","Connexion absente"],
  CONNECTED:["Connecté","Vérification non terminée"],
  VERIFIED:["Vérifié","Session et autorisation confirmées"],
  DEGRADED:["Dégradé","Fonctionnement limité"]
});
export function triadConversationPresentation(state) {
  const item=LABELS[state];
  if (!item) throw new Error("TRIAD_PRESENTATION_UNKNOWN_STATE");
  return Object.freeze({state,title:item[0],detail:item[1],avatarMotion:ICON_STATES[state],
    microphoneShownActive:state==="CAPTURING",isTerminal:["HALTED","PERMISSION_REVOKED","LINK_LOST","EXPIRED","ERROR"].includes(state)});
}
export function triadReadinessPresentation(stage) {
  const item=READINESS[stage];
  if (!item) throw new Error("TRIAD_READINESS_UNKNOWN_STAGE");
  return Object.freeze({stage,title:item[0],detail:item[1],verified:stage==="VERIFIED"});
}
