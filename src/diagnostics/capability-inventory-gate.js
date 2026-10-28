/**
 * Zero-inference, read-only structural validation of every registered skill/tool.
 * This deliberately does not refresh health or execute the CapabilityBus:
 * HEALTHY, a registered handler, or a passing schema is NOT a live proof.
 * Incomplete capabilities produce independent, technical next actions and
 * cannot block unrelated MAX objectives.
 */
export function validateCapabilityInventory(bus) {
  if (typeof bus?.list !== 'function' || typeof bus?.contract !== 'function') {
    throw Object.assign(new Error('CAPABILITY_BUS_CONTRACT_REQUIRED'),
      { code: 'CAPABILITY_BUS_CONTRACT_REQUIRED' });
  }
  const records = bus.list();
  const visited = new Set();
  const capabilities = records.map(record => {
    const id = String(record?.id || '').trim();
    const duplicate = visited.has(id);
    visited.add(id);
    let contract;
    try { contract = id ? bus.contract(id) : null; }
    catch { contract = null; }
    const valid = Boolean(id && !duplicate && contract?.valid === true
      && contract?.handler_registered === true);
    const declared = String(record?.implementation_status || '').toUpperCase();
    const unimplemented = ['STUB','NOT_IMPLEMENTED'].includes(declared);
    const partial = declared === 'PARTIAL';
    const enabled = record?.enabled === true;
    const available = String(record?.health || '').toUpperCase() !== 'UNAVAILABLE';
    const status = !valid ? 'INVALID_CONTRACT'
      : unimplemented ? 'NOT_IMPLEMENTED'
      : partial ? 'PARTIAL_IMPLEMENTATION'
      : !enabled ? 'DISABLED'
      : !available ? 'BLOCKED_EXTERNAL'
      : 'CONTRACT_VERIFIED_RUNTIME_UNPROVEN';
    const next = !valid ? 'FIX_CONTRACT_AND_HANDLER'
      : unimplemented ? 'IMPLEMENT_WITH_EXECUTABLE_TESTS'
      : partial ? 'COMPLETE_IMPLEMENTATION_AND_RUN_TESTS'
      : !enabled ? 'VERIFY_ENABLEMENT_AND_APPROVAL'
      : !available ? 'VERIFY_PROVIDER_OR_DEVICE_INTEGRATION'
      : 'EXECUTE_BOUNDED_TEST_AND_COLLECT_EXACT_SHA_EVIDENCE';
    return {
      id, status, next,
      risk: String(record?.risk || 'UNKNOWN').toUpperCase(),
      contract_valid: valid,
      handler_registered: contract?.handler_registered === true,
      health: String(record?.health || 'UNKNOWN'),
      enabled,
      // Always false: runtime proof belongs to the separately instrumented
      // live truth audit, not the static inventory check.
      runtime_verified: false,
      execution_performed: false,
    };
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const counts = capabilities.reduce((acc,row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const invalid = capabilities.filter(row => !row.contract_valid
    || ['NOT_IMPLEMENTED','PARTIAL_IMPLEMENTATION'].includes(row.status));
  return {
    schema: 'mel.capability-contract-inventory.v1',
    total: capabilities.length,
    inspected: capabilities.length,
    contracts_valid: capabilities.length - capabilities.filter(row=>!row.contract_valid).length,
    contracts_invalid: capabilities.filter(row=>!row.contract_valid).length,
    unimplemented: capabilities.filter(row=>row.status === 'NOT_IMPLEMENTED').length,
    partial: capabilities.filter(row=>row.status === 'PARTIAL_IMPLEMENTATION').length,
    runtime_verified: 0,
    structural_ok: invalid.length === 0,
    all_validated: false, // static contracts never certify live execution
    execution_performed: false,
    counts,
    capabilities,
  };
}
