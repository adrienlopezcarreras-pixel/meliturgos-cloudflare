import { BOOTSTRAP_CORRECTIONS } from './bootstrap-corrections.js';

export const CANONICAL_LORA_LESSON_COUNT = 50;
export const CANONICAL_LORA_DATASET_VERSION = 'mel-canonical-lora-50-v1';

function clean(value, max = 12000) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function canonicalLoraLessons() {
  const lessons = BOOTSTRAP_CORRECTIONS.filter((row) => row?.validated === true && Number(row?.quality || 0) >= 0.65);
  if (lessons.length !== CANONICAL_LORA_LESSON_COUNT) {
    const error = new Error(`CANONICAL_LORA_LESSON_COUNT_MISMATCH:${lessons.length}`);
    error.code = 'CANONICAL_LORA_LESSON_COUNT_MISMATCH';
    throw error;
  }
  const ids = lessons.map((row) => clean(row.id, 240));
  if (new Set(ids).size !== ids.length) {
    const error = new Error('CANONICAL_LORA_DUPLICATE_LESSON_ID');
    error.code = 'CANONICAL_LORA_DUPLICATE_LESSON_ID';
    throw error;
  }
  return lessons;
}

export function canonicalLoraRows() {
  return canonicalLoraLessons().map((lesson, index) => {
    const task = clean(lesson.task || 'Répondre selon la leçon validée.');
    const input = clean(lesson.input || '');
    const answer = clean(lesson.after || '');
    if (!answer) {
      const error = new Error(`CANONICAL_LORA_EMPTY_TARGET:${lesson.id}`);
      error.code = 'CANONICAL_LORA_EMPTY_TARGET';
      throw error;
    }
    return {
      dataset_version: CANONICAL_LORA_DATASET_VERSION,
      lesson_index: index + 1,
      lesson_id: clean(lesson.id, 240),
      domain: clean(lesson.domain || 'general', 120),
      source: clean(lesson.source || 'validated-bootstrap', 120),
      rationale: clean(lesson.rationale || '', 4000),
      messages: [
        {
          role: 'system',
          content: 'Tu es MEL. Applique fidèlement les corrections et règles validées de ton corpus canonique, sans inventer de preuve ni d’état système.',
        },
        {
          role: 'user',
          content: input ? `Tâche : ${task}\n\nEntrée : ${input}` : `Tâche : ${task}`,
        },
        {
          role: 'assistant',
          content: answer,
        },
      ],
    };
  });
}
