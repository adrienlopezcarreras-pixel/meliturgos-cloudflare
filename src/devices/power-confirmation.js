// Owner power actions are confirmed by an exact phrase, never by a free shell.
export function requiredPowerConfirmation(action) {
  if (action === 'power.off') return 'POWER_OFF_APPROVED';
  if (action === 'power.restart') return 'POWER_RESTART_APPROVED';
  return null;
}
