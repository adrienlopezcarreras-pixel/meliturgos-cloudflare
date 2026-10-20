// src/tools/google-client.js
const { google } = require('googleapis');

/**
 * Erreur personnalisée pour les problèmes d'authentification Google.
 * Le champ `code` expose une valeur déterministe utilisable par le runtime
 * (ex. 'AUTH_MISSING' ou 'AUTH_INVALID').
 */
class GoogleAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

/**
 * Construit un client OAuth2 à partir des variables d'environnement.
 * Variables requises : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
 * Lance GoogleAuthError avec le code 'AUTH_MISSING' si l'une d'elles est absente.
 */
function buildOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new GoogleAuthError('Missing Google OAuth credentials', 'AUTH_MISSING');
  }
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

/**
 * Wrapper générique qui capture les erreurs HTTP 401 et les transforme en
 * GoogleAuthError avec le code 'AUTH_INVALID'. Les autres erreurs sont propagées.
 */
async function safeRequest(promise) {
  try {
    const res = await promise;
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 401) {
      throw new GoogleAuthError('Invalid or expired Google OAuth token', 'AUTH_INVALID');
    }
    throw err;
  }
}

/**
 * Lit les 10 premiers messages de la boîte Gmail de l'utilisateur.
 */
async function readGmail() {
  const auth = buildOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });
  return safeRequest(gmail.users.messages.list({ userId: 'me', maxResults: 10 }));
}

/**
 * Liste les 10 prochains événements du calendrier principal.
 */
async function readCalendar() {
  const auth = buildOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });
  return safeRequest(
    calendar.events.list({
      calendarId: 'primary',
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    })
  );
}

/**
 * Liste les 10 premiers fichiers du Drive de l'utilisateur.
 */
async function readDrive() {
  const auth = buildOAuth2Client();
  const drive = google.drive({ version: 'v3', auth });
  return safeRequest(
    drive.files.list({
      pageSize: 10,
      fields: 'files(id,name,mimeType)',
    })
  );
}

/**
 * Exécute le service Google demandé et renvoie la réponse brute.
 * @param {'gmail'|'calendar'|'drive'} service
 * @returns {Promise<any>} Résultat de l'API Google.
 * @throws {GoogleAuthError} Si les credentials sont manquantes ou invalides.
 */
async function executeGoogleTool(service) {
  switch (service) {
    case 'gmail':
      return readGmail();
    case 'calendar':
      return readCalendar();
    case 'drive':
      return readDrive();
    default:
      throw new Error(`Unsupported Google service: ${service}`);
  }
}

module.exports = {
  executeGoogleTool,
  GoogleAuthError,
};
