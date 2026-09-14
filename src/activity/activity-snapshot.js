function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function at(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function explainJob(job) {
  const status = String(job?.status || '').toUpperCase();
  const map = {
    QUEUED: 'Travail enregistré et en attente d’un cycle exécutable.',
    CLAIMED: 'Travail pris en charge par le runtime MEL.',
    COUNCIL_COMPLETE: 'Consultation multi-IA terminée ; préparation du contrôle Teacher.',
    WAITING_TEACHER: 'Demande transmise au Teacher ; MEL peut poursuivre d’autres travaux compatibles.',
    TEACHER_APPROVED: 'Plan validé par le Teacher ; implémentation candidate autorisée.',
    READY_FOR_REVIEW: 'Implémentation candidate produite ; preuves de tests/CI en cours de réconciliation.',
    COMPLETED: 'Travail terminé avec preuve de completion corrélée.',
    COMMITTED: 'Travail terminé et commit identifié.',
    FAILED: 'Travail en échec ; voir le diagnostic associé.',
  };
  return map[status] || `État runtime observé : ${status || 'INCONNU'}.`;
}

export function classifyAuditAction(action = '') {
  const a = String(action).toLowerCase();
  if (/deploy|release|cloudflare|publish|promotion/.test(a)) return 'deployment';
  if (/backup|drive|checkpoint|snapshot/.test(a)) return 'backup';
  if (/test|ci|smoke|benchmark|regression/.test(a)) return 'test';
  if (/learn|train|lora|mentor|lesson/.test(a)) return 'learning';
  if (/memory|remember|rag|knowledge/.test(a)) return 'memory';
  if (/error|fail|exception/.test(a)) return 'error';
  if (/dev|code|commit|patch|teacher|review|roadmap|autonomy/.test(a)) return 'development';
  return 'system';
}

export function buildActivitySnapshot({ jobs = [], audits = [], lessons = [], backups = [], deployment = null, limit = 60 } = {}) {
  const events = [];

  for (const job of jobs || []) {
    const ts = at(job.updated_at || job.created_at);
    const result = parseJson(job.result_json, {}) || {};
    const tests = parseJson(job.tests_json, null);
    events.push({
      id: `job:${job.id}`,
      category: 'development',
      timestamp: ts,
      status: String(job.status || ''),
      title: job.goal || job.id,
      explanation: explainJob(job),
      evidence: { job_id: job.id, requested_by: job.requested_by || null, candidate_branch: job.candidate_branch || null },
    });

    if (tests && (Array.isArray(tests) ? tests.length : Object.keys(tests).length)) {
      events.push({
        id: `tests:${job.id}`,
        category: 'test',
        timestamp: ts,
        status: result?.dev_bridge?.needs_repair === true ? 'FAILED' : 'RECORDED',
        title: `Tests · ${job.id}`,
        explanation: result?.dev_bridge?.needs_repair === true
          ? 'Le résultat de test enregistré demande une réparation avant validation.'
          : 'Des résultats de tests sont enregistrés pour ce travail ; aucun pourcentage n’est extrapolé.',
        evidence: { job_id: job.id, tests },
      });
    }

    if (job.error) {
      events.push({
        id: `error:${job.id}`,
        category: 'error',
        timestamp: ts,
        status: 'ERROR',
        title: `Erreur · ${job.id}`,
        explanation: String(job.error).slice(0, 500),
        evidence: { job_id: job.id },
      });
    }
  }

  for (const row of audits || []) {
    const details = parseJson(row.details_json, {}) || {};
    const category = classifyAuditAction(row.action);
    events.push({
      id: `audit:${row.id}`,
      category,
      timestamp: at(row.timestamp || row.created_at),
      status: row.error_message ? 'ERROR' : 'RECORDED',
      title: String(row.action || 'activité'),
      explanation: row.error_message
        ? String(row.error_message).slice(0, 500)
        : `Action réellement journalisée${row.path ? ` sur ${row.path}` : ''}.`,
      evidence: { audit_id: row.id, path: row.path || null, method: row.request_method || null, details },
    });
  }

  for (const lesson of lessons || []) {
    events.push({
      id: `lesson:${lesson.id}`,
      category: 'learning',
      timestamp: at(lesson.created_at),
      status: lesson.outcome || 'RECORDED',
      title: lesson.goal || lesson.kind || 'Apprentissage',
      explanation: String(lesson.lesson || '').slice(0, 700) || 'Leçon enregistrée dans la mémoire d’apprentissage.',
      evidence: { lesson_id: lesson.id, job_id: lesson.job_id || null, score: Number(lesson.score || 0) },
    });
  }

  for (const backup of backups || []) {
    events.push({
      id: `backup:${backup.id}`,
      category: 'backup',
      timestamp: at(backup.created_at),
      status: 'RECORDED',
      title: `Sauvegarde · ${backup.object_key || backup.id}`,
      explanation: 'Objet de sauvegarde réellement enregistré dans le dépôt de sauvegardes MEL.',
      evidence: { backup_id: backup.id, object_key: backup.object_key || null, metadata: parseJson(backup.metadata_json, {}) || {} },
    });
  }

  events.sort((a, b) => b.timestamp - a.timestamp || String(a.id).localeCompare(String(b.id)));
  return {
    generated_at: Date.now(),
    deployment: deployment || null,
    counts: {
      jobs: (jobs || []).length,
      audits: (audits || []).length,
      lessons: (lessons || []).length,
      backups: (backups || []).length,
      events: events.length,
    },
    events: events.slice(0, Math.max(1, Math.min(200, Number(limit) || 60))),
  };
}
