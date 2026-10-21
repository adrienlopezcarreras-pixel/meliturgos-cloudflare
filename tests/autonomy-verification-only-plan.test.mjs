import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyImplementationDecision } from '../src/evolution/autonomy-implementation-planner.js';

test('[GPT] explicitly classified verification does not imply a patch', () => {
  assert.equal(classifyImplementationDecision('DECISION: VERIFY_EXISTING\nFICHIERS: none\nTESTS: live required'), 'VERIFY_EXISTING');
});

test('[GPT] normal and ambiguous plans must remain implementation plans', () => {
  assert.equal(classifyImplementationDecision('DECISION: IMPLEMENT\nCHANGEMENTS: fix bug'), 'IMPLEMENT');
  assert.equal(classifyImplementationDecision('We should verify existing functionality first.'), 'IMPLEMENT');
  assert.equal(classifyImplementationDecision('DECISION: VERIFY_EXISTING_NOT_YET'), 'IMPLEMENT');
});
