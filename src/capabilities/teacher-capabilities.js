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

  const deploymentFields = {
    request_id: { type: 'string', minLength: 1, maxLength: 200 }, candidate_branch: { type: 'string', minLength: 1, maxLength: 300 }, candidate_commit: { type: 'string', minLength: 7, maxLength: 40 },
    change_summary: { type: 'string', minLength: 1, maxLength: 8000 }, files_components_affected: { type: 'string', minLength: 1, maxLength: 12000 }, user_visible_impact: { type: 'string', minLength: 1, maxLength: 8000 },
    tests_ci_results: { type: 'string', minLength: 1, maxLength: 16000 }, benchmark_regression_results: { type: 'string', minLength: 1, maxLength: 16000 }, security_privacy_impact: { type: 'string', minLength: 1, maxLength: 12000 },
    secrets_permissions_impact: { type: 'string', minLength: 1, maxLength: 12000 }, data_schema_migration_impact: { type: 'string', minLength: 1, maxLength: 12000 }, compatibility_risks: { type: 'string', minLength: 1, maxLength: 12000 },
    dependency_licensing_impact: { type: 'string', maxLength: 12000 }, rollout_plan: { type: 'string', minLength: 1, maxLength: 12000 }, health_checks: { type: 'string', minLength: 1, maxLength: 12000 },
    rollback_plan: { type: 'string', minLength: 1, maxLength: 12000 }, known_unknowns_blockers: { type: 'string', minLength: 1, maxLength: 12000 }
  };
  bus.discover({
    id: 'deployment.request_review', name: 'Request supervised production deployment review', category: 'deployment', version: '1.0.0', provider: 'github-teacher-bridge',
    description: 'Create a complete DEPLOYMENT_REQUEST for independent assistant review. This capability never deploys or merges.',
    input_schema: { type: 'object', properties: deploymentFields, required: ['candidate_branch','candidate_commit','change_summary','files_components_affected','user_visible_impact','tests_ci_results','benchmark_regression_results','security_privacy_impact','secrets_permissions_impact','data_schema_migration_impact','compatibility_risks','rollout_plan','health_checks','rollback_plan','known_unknowns_blockers'], additionalProperties: false },
    output_schema: objectSchema, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true
  }, input => bridge.requestDeployment(input), () => bridge.health());

  bus.discover({
    id: 'deployment.poll_review', name: 'Poll supervised deployment review', category: 'deployment', version: '1.0.0', provider: 'github-teacher-bridge',
    description: 'Read a DEPLOYMENT_REVIEW and authorize only an exact reviewed branch and commit when decision is DEPLOY_APPROVED.',
    input_schema: { type: 'object', properties: { request_id: deploymentFields.request_id, candidate_branch: deploymentFields.candidate_branch, candidate_commit: deploymentFields.candidate_commit }, required: ['request_id','candidate_branch','candidate_commit'], additionalProperties: false },
    output_schema: objectSchema, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true
  }, input => bridge.pollDeployment(input.request_id, input.candidate_branch, input.candidate_commit), () => bridge.health());

  return bridge;
}
