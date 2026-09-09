export const SURVIVAL_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  DEGRADED: 'DEGRADED',
  READ_ONLY: 'READ_ONLY',
  RECOVERY: 'RECOVERY',
  HALTED: 'HALTED',
});

export class SurvivalMode {
  constructor({ now = () => Date.now(), maxRecentFailures = 3, failureWindowMs = 60_000 } = {}) {
    this.now = now;
    this.maxRecentFailures = maxRecentFailures;
    this.failureWindowMs = failureWindowMs;
    this.state = SURVIVAL_STATES.NORMAL;
    this.failures = [];
    this.incidents = [];
  }

  recordFailure(event = {}) {
    const at = Number(event.at ?? this.now());
    this.failures.push({ ...event, at });
    this.failures = this.failures.filter((item) => at - item.at <= this.failureWindowMs);
    if (this.failures.length >= this.maxRecentFailures && this.state === SURVIVAL_STATES.NORMAL) {
      this.enterDegraded('failure_threshold');
    }
    return this.state;
  }

  enterDegraded(reason = 'unknown') {
    this.state = SURVIVAL_STATES.DEGRADED;
    this.incidents.push({ at: this.now(), state: this.state, reason });
    return this.state;
  }

  enterReadOnly(reason = 'integrity_uncertain') {
    this.state = SURVIVAL_STATES.READ_ONLY;
    this.incidents.push({ at: this.now(), state: this.state, reason });
    return this.state;
  }

  enterRecovery(reason = 'restore_requested') {
    this.state = SURVIVAL_STATES.RECOVERY;
    this.incidents.push({ at: this.now(), state: this.state, reason });
    return this.state;
  }

  halt(reason = 'owner_or_operator_shutdown') {
    this.state = SURVIVAL_STATES.HALTED;
    this.incidents.push({ at: this.now(), state: this.state, reason });
    return this.state;
  }

  canWrite() {
    return this.state === SURVIVAL_STATES.NORMAL || this.state === SURVIVAL_STATES.DEGRADED;
  }

  canDeploy() {
    return this.state === SURVIVAL_STATES.NORMAL;
  }

  canUseExternalActions() {
    return this.state === SURVIVAL_STATES.NORMAL || this.state === SURVIVAL_STATES.DEGRADED;
  }

  snapshot() {
    return {
      state: this.state,
      recentFailures: this.failures.length,
      incidents: [...this.incidents],
      policy: {
        ownerShutdownAlwaysWins: true,
        noSelfReplication: true,
        noSecretHarvesting: true,
        noUnauthorizedPersistence: true,
      },
    };
  }
}
