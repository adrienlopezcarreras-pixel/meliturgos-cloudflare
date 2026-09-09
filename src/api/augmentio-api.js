import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { buildTeacherEscalation } from '../augmentio/teacher-escalation.js';

export default async function handleAugmentio(request, env) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }

  const body = await request.json().catch(() => ({}));
  const input = body.input ?? body.prompt ?? body.messages;
  if (!input) {
    return Response.json({ error: 'input required', code: 'MISSING_INPUT' }, { status: 400 });
  }

  const capability = String(body.capability || 'GENERAL').toUpperCase();
  const maxCandidates = Math.min(12, Math.max(1, Number(body.maxCandidates || 4)));
  const pool = createDefaultAugmentioPool(env);
  const augmentio = new Augmentio({ pool });
  const result = await augmentio.fanOut({
    capability,
    input,
    context: body.context || {},
    maxCandidates,
  });

  const response = {
    ok: true,
    mode: 'augmentio',
    capability,
    best: result.best,
    candidates: result.candidates,
    failures: result.failures,
    providersAttempted: result.providersAttempted,
    cacheHit: result.cacheHit,
  };

  if (body.teacherReview === true) {
    response.teacherRequest = buildTeacherEscalation({
      input,
      capability,
      result,
    });
  }

  return Response.json(response);
}
