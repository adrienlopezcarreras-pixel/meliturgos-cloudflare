import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProviderNeutralSystemBundle,
  parseProviderNeutralSystemBundle,
  portabilityRuntimeDescriptor,
  serializeProviderNeutralSystemBundle,
  verifyProviderNeutralSystemBundle,
} from '../../src/portability/system-bundle.js';
import { createPortableMemoryExport } from '../../src/memory/portable-export.js';

function components() {
  return [
    {
      id:'memory',
      contract:{
        id:'memory.export',
        version:'1.0.0',
        required:true,
        description:'Portable memory records',
      },
      format:'application/json',
      export:async()=>createPortableMemoryExport([
        {id:'m1',content:'Remember durable state',source:'memory'},
        {id:'m2',content:'Avoid provider lock-in',source:'memory'},
      ],{
        generatedAt:'2026-09-25T09:00:00.000Z',
        source:'system-bundle-test',
      }),
    },
    {
      id:'skills',
      contract:{
        id:'skills.registry',
        version:'1',
        required:true,
        description:'Portable skill registry snapshot',
      },
      format:'application/json',
      export:async()=>({
        schema:'mel.skill-registry/v1',
        entries:[
          {skill_id:'skill.memory',version:'1.0.0',state:'verified'},
        ],
      }),
    },
  ];
}

async function bundle() {
  return createProviderNeutralSystemBundle({
    generated_at:'2026-09-25T09:00:00.000Z',
    source:{
      branch:'candidate/mel-clean-autonomy',
      commit:'a'.repeat(40),
    },
    components:components(),
    adapters:[
      {
        id:'storage.cloudflare',
        contract_id:'memory.export',
        provider:'cloudflare',
        optional:true,
      },
      {
        id:'storage.local',
        contract_id:'memory.export',
        provider:'local',
        optional:true,
      },
    ],
    metadata:{purpose:'disaster-recovery'},
  });
}

test('GEN2-49 builds a verifiable multi-component system bundle',async()=>{
  const value=await bundle();
  assert.equal(value.schema,'mel.provider-neutral-system-bundle.v1');
  assert.equal(value.manifest.schema,'mel.provider-neutral-bundle.v1');
  assert.deepEqual(value.artifacts.map(row=>row.id),['memory','skills']);
  assert.ok(value.artifacts.every(row=>/^sha256:[0-9a-f]{64}$/.test(row.checksum)));
  assert.match(value.integrity.manifest_sha256,/^sha256:[0-9a-f]{64}$/);
  assert.match(value.integrity.bundle_sha256,/^sha256:[0-9a-f]{64}$/);

  const verification=await verifyProviderNeutralSystemBundle(value);
  assert.equal(verification.ok,true,JSON.stringify(verification.issues));
  assert.equal(verification.summary.artifacts,2);

  const descriptor=portabilityRuntimeDescriptor(value);
  assert.deepEqual(descriptor.required_contracts,['memory.export','skills.registry']);
  assert.deepEqual(descriptor.optional_providers,['cloudflare','local']);
});

test('GEN2-49 bundle is deterministic for identical sources and generated_at',async()=>{
  const first=await bundle();
  const second=await bundle();
  assert.equal(first.integrity.bundle_sha256,second.integrity.bundle_sha256);
  assert.equal(first.integrity.manifest_sha256,second.integrity.manifest_sha256);
  assert.deepEqual(
    first.artifacts.map(row=>row.checksum),
    second.artifacts.map(row=>row.checksum),
  );
});

test('GEN2-49 detects artifact payload tampering and global digest mismatch',async()=>{
  const value=structuredClone(await bundle());
  value.artifacts[0].payload.records[0].memory.content='tampered';

  const verification=await verifyProviderNeutralSystemBundle(value);
  assert.equal(verification.ok,false);
  const types=new Set(verification.issues.map(issue=>issue.type));
  assert.ok(types.has('ARTIFACT_CHECKSUM_MISMATCH'));
  assert.ok(types.has('BUNDLE_CHECKSUM_MISMATCH'));
});

test('GEN2-49 detects manifest tampering independently of artifact bytes',async()=>{
  const value=structuredClone(await bundle());
  value.manifest.contracts[0].description='changed after export';

  const verification=await verifyProviderNeutralSystemBundle(value);
  assert.equal(verification.ok,false);
  assert.ok(verification.issues.some(issue=>issue.type==='MANIFEST_CHECKSUM_MISMATCH'));
  assert.ok(verification.issues.some(issue=>issue.type==='BUNDLE_CHECKSUM_MISMATCH'));
});

test('GEN2-49 rejects required contract without an artifact during verification',async()=>{
  const value=structuredClone(await bundle());
  value.manifest.contracts.push({
    id:'projects.export',
    version:'1',
    required:true,
    description:'Projects',
  });

  const verification=await verifyProviderNeutralSystemBundle(value);
  assert.equal(verification.ok,false);
  assert.ok(verification.issues.some(issue=>
    issue.type==='REQUIRED_CONTRACT_UNCOVERED'
      && issue.contract_id==='projects.export'
  ));
});

test('GEN2-49 refuses secret-bearing artifact payloads before bundle creation',async()=>{
  await assert.rejects(
    ()=>createProviderNeutralSystemBundle({
      generated_at:'2026-09-25T09:00:00.000Z',
      components:[
        {
          id:'unsafe',
          contract:{id:'unsafe.export'},
          export:async()=>({
            safe:'ok',
            api_token:'must-not-export',
            nested:{password:'must-not-export'},
          }),
        },
      ],
    }),
    error=>{
      assert.equal(error?.code,'SYSTEM_BUNDLE_SECRET_FIELDS_FORBIDDEN');
      assert.ok(error.issues.some(issue=>issue.path.includes('api_token')));
      assert.ok(error.issues.some(issue=>issue.path.includes('password')));
      return true;
    },
  );
});

test('GEN2-49 refuses mandatory provider adapter in portable bundle',async()=>{
  await assert.rejects(
    ()=>createProviderNeutralSystemBundle({
      generated_at:'2026-09-25T09:00:00.000Z',
      components:[
        {
          id:'memory',
          contract:{id:'memory.export'},
          export:async()=>({records:[]}),
        },
      ],
      adapters:[
        {
          id:'only-cloudflare',
          contract_id:'memory.export',
          provider:'cloudflare',
          optional:false,
        },
      ],
    }),
    error=>{
      assert.equal(error?.code,'SYSTEM_BUNDLE_MANIFEST_INVALID');
      assert.ok(error.issues.some(issue=>issue.type==='PROVIDER_ADAPTER_MUST_BE_OPTIONAL'));
      return true;
    },
  );
});

test('GEN2-49 serialize/parse round-trip verifies before accepting bundle',async()=>{
  const value=await bundle();
  const encoded=serializeProviderNeutralSystemBundle(value);
  const parsed=await parseProviderNeutralSystemBundle(encoded);
  assert.equal(parsed.integrity.bundle_sha256,value.integrity.bundle_sha256);

  const bad=JSON.parse(encoded);
  bad.artifacts[1].payload.entries[0].state='candidate';
  await assert.rejects(
    ()=>parseProviderNeutralSystemBundle(JSON.stringify(bad)),
    error=>error?.code==='SYSTEM_BUNDLE_VERIFICATION_FAILED',
  );
});

test('GEN2-49 rejects conflicting definitions for one logical contract',async()=>{
  await assert.rejects(
    ()=>createProviderNeutralSystemBundle({
      generated_at:'2026-09-25T09:00:00.000Z',
      components:[
        {
          id:'a',
          contract:{id:'same.contract',version:'1',required:true},
          export:async()=>({a:1}),
        },
        {
          id:'b',
          contract:{id:'same.contract',version:'2',required:true},
          export:async()=>({b:2}),
        },
      ],
    }),
    error=>error?.code==='SYSTEM_BUNDLE_CONTRACT_CONFLICT',
  );
});
