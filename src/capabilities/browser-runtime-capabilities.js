import {
  createBrowserController,
  classifyBrowserAction,
  BROWSER_RISK,
} from '../devices/browser-capability.js';
import { createBrowserCompanionAdapter, isBrowserCompanionBinding } from '../devices/browser-companion-adapter.js';

const browserInputSchema = { type: 'object', additionalProperties: true };
const browserOutputSchema = { type: 'object', additionalProperties: true };

function browserNeedsExplicitApproval(input = {}) {
  return (Array.isArray(input?.steps) ? input.steps : []).some(step => {
    const action = String(step?.action || '');
    const risk = classifyBrowserAction(action);
    return risk === BROWSER_RISK.SENSITIVE || action === 'browser.click';
  });
}

function centralApproval(context) {
  return context?.explicitApprovalVerified?.capability === 'browser.execute';
}

function approvedBrowserInput(input = {}, approved = false) {
  const clean = { ...input, approvals: [] };
  if (!approved) return clean;
  const sessionId = String(input?.session_id || '');
  clean.approvals = (Array.isArray(input?.steps) ? input.steps : [])
    .filter(step => classifyBrowserAction(step?.action) === BROWSER_RISK.SENSITIVE)
    .map((step, index) => ({
      approved: true,
      session_id: sessionId,
      step_id: String(step?.id || `step-${index + 1}`),
      action: String(step?.action || ''),
    }));
  return clean;
}

/** Registers the single runtime entry point for real browser execution. */
export function registerBrowserRuntimeCapabilities(bus, { binding } = {}) {
  const available = isBrowserCompanionBinding(binding);
  const adapter = available ? createBrowserCompanionAdapter({ binding }) : null;
  const controller = adapter ? createBrowserController({
    adapter,
    authorize: async (permission, context = {}) => permission === 'browser:control'
      && Boolean(context.owner)
      && context.permissions?.includes('browser.control') === true,
    audit: async event => bus.audit({ capability: 'browser.execute', ...event }),
  }) : null;

  return bus.discover({
    id: 'browser.execute',
    name: 'Navigateur compagnon contrôlé',
    category: 'device',
    version: '1.1.0',
    provider: 'mel',
    description: 'Executes a browser plan through the MEL companion. Click/type/submit/download require a current-request explicit approval verified by CapabilityBus.',
    input_schema: browserInputSchema,
    output_schema: browserOutputSchema,
    risk: 'HIGH',
    permissions: ['browser.control'],
    health: available ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
    approval: { mode: 'EXPLICIT_CURRENT_REQUEST', reason: 'BROWSER_INTERACTIVE_ACTION' },
    approvalcheck: input => ({ required: browserNeedsExplicitApproval(input) }),
  }, async (input, context) => controller.execute(
    approvedBrowserInput(input, centralApproval(context)),
    context,
  ), available ? async () => adapter.health() : null);
}
