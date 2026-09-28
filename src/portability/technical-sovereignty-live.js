import { evaluateTechnicalSovereignty } from './technical-sovereignty.js';
import { CURRENT_SOVEREIGNTY_INVENTORY } from './technical-sovereignty-inventory.js';

export function liveTechnicalSovereigntyReport(registry,{maxAutonomy=false}={}){
  const layers={};
  for(const [layer,base] of Object.entries(CURRENT_SOVEREIGNTY_INVENTORY)){
    const alternatives=(registry?.layers?.[layer]||[])
      .filter(row=>row?.prevalidated===true)
      .map(row=>row.adapter_id||row.id)
      .filter(Boolean);
    layers[layer]={
      ...base,
      alternative_adapters:[...new Set(alternatives)],
    };
  }
  return evaluateTechnicalSovereignty({layers,maxAutonomy});
}
