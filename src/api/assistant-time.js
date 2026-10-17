// Fenêtres de temps en français, calculées dans le fuseau d'Adrien
// (Europe/Paris), pour les demandes d'agenda : « aujourd'hui », « demain »,
// « après-demain », « ce week-end », « cette semaine », « la semaine
// prochaine », un jour de la semaine (« mardi »). Sans indication : les 7
// prochains jours à partir de maintenant.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function parisParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', timeZoneName: 'longOffset',
  }).formatToParts(date).map(p => [p.type, p.value]));
  const offset = (parts.timeZoneName || 'GMT+00:00').replace('GMT', '') || '+00:00';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { y: parts.year, m: parts.month, d: parts.day, offset: offset === '' ? '+00:00' : offset, weekday };
}

// Minuit (heure de Paris) du jour situé `days` jours après la date de référence.
function parisMidnight(now, days) {
  const probe = new Date(now.getTime() + days * DAY_MS);
  const { y, m, d, offset } = parisParts(probe);
  return `${y}-${m}-${d}T00:00:00${offset}`;
}

export function parisTimeWindow(text, now = new Date()) {
  const value = String(text || '').toLowerCase();
  const today = parisParts(now).weekday;
  const range = (startDays, endDays) => ({ time_min: parisMidnight(now, startDays), time_max: parisMidnight(now, endDays) });
  if (/apr[eè]s[- ]demain/.test(value)) return range(2, 3);
  if (/\bdemain\b/.test(value)) return range(1, 2);
  if (/\baujourd['’]?hui\b|\bce\s+soir\b|\bcette\s+journ[ée]e\b|\bma\s+journ[ée]e\b/.test(value)) {
    return { time_min: now.toISOString(), time_max: parisMidnight(now, 1) };
  }
  if (/\bce\s+week[- ]?end\b/.test(value)) {
    const toSaturday = (6 - today + 7) % 7;
    return range(toSaturday, toSaturday + 2);
  }
  if (/\bsemaine\s+prochaine\b|\bla\s+semaine\s+qui\s+vient\b/.test(value)) {
    const toMonday = ((1 - today + 7) % 7) || 7;
    return range(toMonday, toMonday + 7);
  }
  if (/\bcette\s+semaine\b/.test(value)) {
    const toNextMonday = ((1 - today + 7) % 7) || 7;
    return { time_min: now.toISOString(), time_max: parisMidnight(now, toNextMonday) };
  }
  const named = WEEKDAYS.findIndex(day => new RegExp(`\\b${day}\\b`).test(value));
  if (named >= 0) {
    const ahead = ((named - today + 7) % 7) || 7;
    return range(ahead, ahead + 1);
  }
  return { time_min: now.toISOString(), time_max: new Date(now.getTime() + 7 * DAY_MS).toISOString() };
}
