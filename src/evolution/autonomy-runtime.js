import { runAutonomyRuntimeTick as runCoreAutonomyRuntimeTick } from './autonomy-runtime-core.js';
import { getAutonomyControl } from './autonomy-control.js';

export * from './autonomy-runtime-core.js';

export async function runAutonomyRuntimeTick(env, options = {}) {
  const control = await getAutonomyControl(env?.DB);
  if (control.paused) {
    return {
      status: 'PAUSED',
      paused: true,
      advanced: false,
      control,
    };
  }
  return runCoreAutonomyRuntimeTick(env, options);
}
