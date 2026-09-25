import { auditDataIntegrity } from './data-integrity.js';
import { validateRoadmap } from '../roadmap/master-roadmap.js';

function maturityError(code) {
  return Object.assign(new Error(code), { code });
}

export async function auditFinalMaturity({ bus, db } = {}) {
  if (!bus || typeof bus.list !== 'function' || typeof bus.contract !== 'function') {
    throw maturityError('FINAL_MATURITY_BUS_REQUIRED');
  }
  if (!db) throw maturityError('FINAL_MATURITY_DB_REQUIRED');

  const startedAt = Date.now();
  const roadmap = validateRoadmap();
  const capabilities = bus.list();
  const invalidCapabilities = [];

  for (const descriptor of capabilities) {
    let contract;
    try {
      contract = bus.contract(descriptor.id);
    } catch (error) {
      invalidCapabilities.push({
        id:String(descriptor?.id || '').slice(0,160) || null,
        reason:String(error?.code || error?.message || 'CONTRACT_READ_FAILED').slice(0,120),
      });
      continue;
    }
    if (!contract.valid) {
      invalidCapabilities.push({
        id:String(descriptor.id).slice(0,160),
        reason:'INVALID_CONTRACT',
        gates:{
          handler_registered:contract.handler_registered===true,
          input_schema_valid:contract.input_schema_valid===true,
          output_schema_valid:contract.output_schema_valid===true,
          permissions_valid:contract.permissions_valid===true,
          risk_valid:contract.risk_valid===true,
          health_valid:contract.health_valid===true,
          enabled_boolean:contract.enabled_boolean===true,
          healthcheck_valid:contract.healthcheck_valid===true,
          approval_policy_valid:contract.approval_policy_valid===true,
        },
      });
    }
  }

  const data = await auditDataIntegrity(db);
  const checks = {
    data_integrity:data.ok === true,
    capability_contracts:invalidCapabilities.length === 0,
    roadmap_structure:roadmap.ok === true,
  };
  const failed = Object.entries(checks).filter(([,ok])=>!ok).map(([id])=>id);

  return {
    schema:'mel.final-maturity-audit',
    version:1,
    ok:failed.length===0,
    state:failed.length===0?'PASS':'FAIL',
    generated_at:new Date().toISOString(),
    duration_ms:Math.max(0,Date.now()-startedAt),
    checks,
    summary:{
      failed_domains:failed,
      capability_count:capabilities.length,
      invalid_capability_count:invalidCapabilities.length,
      roadmap_issue_count:Array.isArray(roadmap.issues)?roadmap.issues.length:0,
      data_anomaly_count:Number(data?.summary?.anomaly_count || 0),
    },
    capability_contracts:{
      ok:invalidCapabilities.length===0,
      invalid:invalidCapabilities.slice(0,50),
    },
    roadmap:{
      ok:roadmap.ok===true,
      issues:(roadmap.issues || []).slice(0,50),
    },
    data_integrity:data,
    invariants:{
      read_only:true,
      network_calls:false,
      capability_execution:false,
      automatic_repair:false,
      user_content_exposed:false,
    },
  };
}
