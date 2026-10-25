import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMentorCodeContract } from '../src/learning/mentor-code-contract.js';

test('a syntax rejection carries the parser message and the offending line', () => {
  assert.throws(() => assertMentorCodeContract('src/a.js', 'export const a = 1;\n', 'export const a = 1;\nconst b = ;\n'), error =>
    error.code === 'MENTOR_CODE_SYNTAX_INVALID' && /Unexpected token/.test(error.syntax) && /const b = ;/.test(error.syntax));
});
