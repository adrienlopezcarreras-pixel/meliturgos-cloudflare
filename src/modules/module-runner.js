import { DomainError } from '../core/contracts.js';
/** Canonical execution path. No simulated storage success and no arbitrary fetch URL. */
export class ModuleRunner {
  constructor(env = {}, bus = env.CAPABILITY_BUS) { this.bus = bus; }
  async run(id, input = {}, context = {}) {
    if (!this.bus) throw new DomainError('MODULE_EXECUTOR_UNCONFIGURED',503);
    const output = await this.bus.execute(id,input,context);
    return {success:true,moduleId:id,output};
  }
}
