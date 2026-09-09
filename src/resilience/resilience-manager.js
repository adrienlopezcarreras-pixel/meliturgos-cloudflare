import { SurvivalMode, SURVIVAL_STATES } from './survival-mode.js';

export class ResilienceManager {
  constructor({
    survival = new SurvivalMode(),
    checkpoint,
    verifyIntegrity,
    restoreLastKnownGood,
    pauseDeployments,
    freezeSensitiveWrites,
    notify,
  } = {}) {
    this.survival = survival;
    this.checkpoint = checkpoint;
    this.verifyIntegrity = verifyIntegrity;
    this.restoreLastKnownGood = restoreLastKnownGood;
    this.pauseDeployments = pauseDeployments;
    this.freezeSensitiveWrites = freezeSensitiveWrites;
    this.notify = notify;
  }

  async handleIncident(event = {}) {
    const severity = String(event.severity || 'medium').toLowerCase();
    if (severity === 'critical' || event.integrityUncertain === true) {
      this.survival.enterReadOnly(event.reason || 'critical_incident');
      await this.pauseDeployments?.(event);
      await this.freezeSensitiveWrites?.(event);
    } else {
      this.survival.recordFailure(event);
    }

    const checkpoint = await this.checkpoint?.({
      reason: event.reason || 'incident',
      state: this.survival.snapshot(),
      excludeSecrets: true,
    });

    const integrity = await this.verifyIntegrity?.({ event, checkpoint });
    const report = {
      type: 'MEL_RESILIENCE_INCIDENT',
      at: new Date().toISOString(),
      event: sanitizeEvent(event),
      survival: this.survival.snapshot(),
      checkpoint: checkpoint ? sanitizeCheckpoint(checkpoint) : null,
      integrity: integrity ?? 'UNKNOWN',
      autoRestoreEligible: integrity === false && event.allowAuthorizedRollback === true,
    };

    await this.notify?.(report);
    return report;
  }

  async recover({ approved = false, reason = 'recovery' } = {}) {
    if (!approved) {
      return { ok: false, code: 'RECOVERY_APPROVAL_REQUIRED', state: this.survival.state };
    }
    if (this.survival.state === SURVIVAL_STATES.HALTED) {
      return { ok: false, code: 'OWNER_HALT_ACTIVE', state: this.survival.state };
    }
    this.survival.enterRecovery(reason);
    const result = await this.restoreLastKnownGood?.({ reason });
    const integrity = await this.verifyIntegrity?.({ reason: 'post_restore', result });
    if (integrity === true) {
      this.survival.state = SURVIVAL_STATES.NORMAL;
      return { ok: true, state: this.survival.state, restored: true };
    }
    this.survival.enterReadOnly('post_restore_integrity_failed');
    return { ok: false, code: 'POST_RESTORE_INTEGRITY_FAILED', state: this.survival.state };
  }

  ownerHalt(reason = 'owner_requested_shutdown') {
    return this.survival.halt(reason);
  }
}

function sanitizeEvent(event) {
  const clone = { ...event };
  delete clone.secret;
  delete clone.token;
  delete clone.password;
  delete clone.authorization;
  return clone;
}

function sanitizeCheckpoint(checkpoint) {
  if (typeof checkpoint !== 'object' || checkpoint === null) return checkpoint;
  const clone = { ...checkpoint };
  delete clone.secret;
  delete clone.token;
  delete clone.password;
  delete clone.authorization;
  return clone;
}
