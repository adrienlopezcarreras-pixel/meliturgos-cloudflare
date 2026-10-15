import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REPO = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const RELEASE_BRANCH = 'release/mel-hardware-v0.1.0';
const WORKFLOW = 'deploy-cloudflare-release';

export function releaseOutcomeComment(payload, repository = REPO) {
 if (repository !== REPO || !payload || typeof payload !== 'object') throw new Error('RELEASE_LEDGER_REPOSITORY_INVALID');
 const w = payload.workflow_run;
 if (!w || typeof w !== 'object' || payload.action !== 'completed') throw new Error('RELEASE_LEDGER_EVENT_INVALID');
 if (w.name !== WORKFLOW || w.repository?.full_name !== REPO || w.head_repository?.full_name !== REPO) throw new Error('RELEASE_LEDGER_WORKFLOW_UNTRUSTED');
 const allowedBranch = (w.event === 'push' && w.head_branch === RELEASE_BRANCH)
  || (w.event === 'workflow_dispatch' && [RELEASE_BRANCH,'main'].includes(w.head_branch));
 if (!allowedBranch) throw new Error('RELEASE_LEDGER_SCOPE_INVALID');
 const id = w.id;
 const sha = w.head_sha;
 const conclusion = w.conclusion;
 if (!Number.isSafeInteger(id) || id <= 0 || typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('RELEASE_LEDGER_IDENTITY_INVALID');
 if (!['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale'].includes(conclusion)) throw new Error('RELEASE_LEDGER_CONCLUSION_INVALID');
 const status = conclusion === 'success' ? 'WORKFLOW_SUCCESS' : 'WORKFLOW_NOT_SUCCESS';
 const url = `https://github.com/${REPO}/actions/runs/${id}`;
 return [
  '### MEL — Trace automatique de release canonique',
  '',
  `- **Exécution :** [#${id}](${url})`,
  `- **SHA exact :** \`${sha}\``,
  `- **Branche d'exécution :** \`${w.head_branch}\``,
  `- **Événement :** \`${w.event}\``,
  `- **Conclusion GitHub Actions :** \`${conclusion}\``,
  `- **État de la release :** \`${status}\``,
  '- **Portée de la preuve :** conclusion du workflow de déploiement et de ses gates, pas une vérification indépendante de la disponibilité ultérieure.',
  '- **D1, HTTP et rollback :** consulter les étapes du run exact et les preuves post-release ; ne pas déduire leur succès de ce commentaire seul.',
  '',
  'Trace générée depuis l’événement GitHub Actions `workflow_run.completed` ; aucune action de déploiement déclenchée par cette trace.',
 ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const path = process.env.GITHUB_EVENT_PATH;
 if (!path) throw new Error('RELEASE_LEDGER_EVENT_PATH_REQUIRED');
 const event = JSON.parse(readFileSync(path, 'utf8'));
 process.stdout.write(releaseOutcomeComment(event, process.env.GITHUB_REPOSITORY) + '\n');
}
