import { authorize } from '../security/permissions.js';
import { validate } from '../security/validation.js';
import { requireValue } from '../core/contracts.js';
/** Construct per composition root; adapters are trusted server code, never client JS. */
export class CapabilityBus {
  constructor({audit = async () => {}} = {}) { this.records = new Map(); this.audit = audit; }
  discover(record, execute) {
    for (const field of ['id','name','category','version','provider','description','input_schema','output_schema','risk','permissions','health','enabled']) requireValue(record[field] !== undefined, 'INVALID_CAPABILITY');
    requireValue(!this.records.has(record.id) && typeof execute === 'function' && Array.isArray(record.permissions) && typeof record.enabled === 'boolean', 'INVALID_CAPABILITY');
    this.records.set(record.id, {record: structuredClone(record), execute});
    return this.describe(record.id);
  }
  list() { return [...this.records.values()].map(x => structuredClone(x.record)); }
  search(query) { return this.list().filter(x => `${x.id} ${x.name} ${x.description}`.toLowerCase().includes(String(query).toLowerCase())); }
  describe(id) { const entry = this.records.get(id); requireValue(entry, 'CAPABILITY_NOT_FOUND', 404); return structuredClone(entry.record); }
  health(id) { return this.describe(id).health; }
  enable(id, context) { authorize(['capabilities.manage'],context); this.records.get(this.describe(id).id).record.enabled = true; }
  disable(id, context) { authorize(['capabilities.manage'],context); this.records.get(this.describe(id).id).record.enabled = false; }
  async execute(id, input, context) {
    const record = this.describe(id);
    requireValue(record.enabled, 'CAPABILITY_DISABLED', 409);
    authorize(record.permissions,context);
    validate(input,record.input_schema);
    const event = {id: crypto.randomUUID(), capability: id, owner: context.owner, requestId: context.requestId};
    await this.audit({...event,status:'STARTED'});
    try {
      const output = await this.records.get(id).execute(input,context);
      validate(output,record.output_schema);
      await this.audit({...event,status:'SUCCEEDED'});
      return output;
    } catch (error) { await this.audit({...event,status:'FAILED'}); throw error; }
  }
}
