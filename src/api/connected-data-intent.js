// Demandes portant sur les données personnelles connectées d'Adrien
// (mails, agenda, tâches, fichiers). Elles doivent aller vers ses connecteurs,
// jamais vers une recherche web ou une recherche de connaissances publique.
export function privateConnectedDataRequest(value) {
  const raw = String(value || '');
  // Owner data must be recognised even with words in between
  // (« mes derniers mails », « mes prochains rendez-vous », « mon agenda de demain »).
  if (/\b(?:mes|mon|ma)\s+(?:[\wàâçéèêëîïôûùüÿœ'’-]+\s+){0,2}(?:mails?|e-?mails?|courriels?|messages?|fichiers?|documents?|photos?|contacts?|calendriers?|agendas?|t[âa]ches?|rendez[- ]?vous|rdv|r[ée]unions?|[ée]v[ée]nements?|planning|journ[ée]e|bo[iî]te\s+(?:mail|de\s+r[ée]ception)|messagerie|drive)\b/i.test(raw)) return true;
  if (/\b(?:gmail|outlook|hotmail|onedrive|google\s+drive|google\s+tasks|google\s+agenda|google\s+calendar|sharepoint)\b/i.test(raw)) return true;
  // « ai-je des rendez-vous demain ? », « qu'est-ce que j'ai demain ? »
  return /\b(?:ai[- ]je|j['’]ai|est[- ]ce\s+que\s+j['’]ai)\b[\s\S]{0,40}\b(?:rendez[- ]?vous|rdv|r[ée]unions?|[ée]v[ée]nements?|de\s+pr[ée]vu|au\s+programme|mails?|messages?)\b/i.test(raw);
}
