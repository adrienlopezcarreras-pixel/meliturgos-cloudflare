import { evaluateTechnicalSovereignty } from './technical-sovereignty.js';
import { CURRENT_SOVEREIGNTY_INVENTORY } from './technical-sovereignty-inventory.js';
import { eligibleAlternatives } from './prevalidated-alternative-registry.js';

const CAPABILITIES=Object.freeze(['export','import','isolated_test','activate','smoke','rollback']);

export function liveTechnicalSovereigntyReport(registry,{maxAutonomy=false,now=Date.now()}={}){
  const layers={};
  for(const [layer,base] of Object.entries(CURRENT_SOVEREIGNTY_INVENTORY)){
    const alternatives=eligibleAlternatives(registry,layer,{maxAddedCostEur:0,now});
    const adapterIds=alternatives
      .map(row=>row.adapter_id||row.id)
      .filter(Boolean);
    const liveCapabilities=Object.fromEntries(
      CAPABILITIES.map(name=>[
        name,
        base?.[name]===true || alternatives.some(row=>row?.proof?.[name]===true),
      ]),
    );
    layers[layer]={
      ...base,
      ...liveCapabilities,
      alternative_adapters:[...new Set(adapterIds)],
    };
  }
  return evaluateTechnicalSovereignty({layers,maxAutonomy});
}
