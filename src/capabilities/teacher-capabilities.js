import { GitHubTeacherBridge } from '../teachers/github-teacher-bridge.js';

const objectSchema = { type: 'object', additionalProperties: true };

export function registerTeacherCapabilities(bus, options = {}) {
  const bridge = new GitHubTeacherBridge(options);

  bus.discover({
    id: 'teacher.ask', name: 'Ask Assistant Teacher', category: 'learning', version: '1.0.0', provider: 'github-teacher-bridge',
    description: 'Append one structured MEL_REQUEST to the supervised GitHub Teacher Bridge without using the Professor UI.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', minLength: 1, maxLength: 200 }, area: { type: 'string', maxLength: 100 }, priority: { type: 'string', maxLength: 50 },
        goal: { type: 'string', minLength: 1, maxLength: 4000 }, current_state: { type: 'string', maxLength: 12000 }, evidence: { type: 'string', maxLength: 16000 },
        blocker_or_question: { type: 'string', minLength: 1, maxLength: 8000 }, proposed_next_step: { type: 'string', maxLength: 8000 }
      },
      required: ['goal','blocker_or_question'], additionalProperties: false
    },
    output_schema: objectSchema, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true
  }, input => bridge.ask(input), () => bridge.health());

  bus.discover({
    id: 'teacher.poll', name: 'Poll Assistant Teacher', category: 'learning', version: '1.0.0', provider: 'github-teacher-bridge',
    description: 'Retrieve the matching TEACHER_REPLY for a MEL request from the supervised GitHub Teacher Bridge.',
    input_schema: { type: 'object', properties: { request_id: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['request_id'], additionalProperties: false },
    output_schema: objectSchema, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true
  }, input => bridge.poll(input.request_id), () => bridge.health());

  return bridge;
}
