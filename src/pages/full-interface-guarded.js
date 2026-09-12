import { onRequestGet as renderV4 } from './full-interface-v4.js';

const REPLACEMENTS = [
  ['Mentor · OpenAI', 'Mentor contrôlé'],
  ['Mentor OpenAI synchrone désactivé en mode zéro-euro. MEL reste disponible ici et le Teacher autonome gratuit poursuit la roadmap séparément sans nouveau prompt.', 'Mentor contrôlé : conseil uniquement, aucune dépense et aucune action irréversible. MEL reste disponible ici et le Teacher autonome gratuit poursuit la roadmap séparément.'],
  ['Le Mentor OpenAI synchrone reste optionnel et n’est jamais requis pour que MEL ou la boucle autonome gratuite continuent.', 'Le Mentor contrôlé fonctionne sans API OpenAI payante par défaut. Il conseille seulement ; MEL et la boucle autonome restent indépendants.'],
  ['@Mentor synchrone si dispo', '@Mentor contrôlé'],
  ['Mentor si disponible', 'Mentor contrôlé'],
  ['MEL + Mentor si dispo', 'MEL + Mentor contrôlé'],
];

export async function onRequestGet(context) {
  const response = await renderV4(context);
  let body = await response.text();
  for (const [from, to] of REPLACEMENTS) body = body.split(from).join(to);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-mel-mentor-mode', 'guarded-zero-euro');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
