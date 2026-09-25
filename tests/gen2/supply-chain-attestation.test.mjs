import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSupplyChainReleaseEligible,
  createSupplyChainAttestation,
  serializeSupplyChainAttestation,
  verifySupplyChainAttestation,
} from '../../src/security/supply-chain-attestation.js';

const SHA='a'.repeat(40);

function fixture(){
  const packageJson={
    name:'mel-test',
    version:'1.0.0',
    dependencies:{a:'^1.0.0'},
  };
  const packageLock={
    name:'mel-test',
    version:'1.0.0',
    lockfileVersion:3,
    requires:true,
    packages:{
      '':{
        name:'mel-test',
        version:'1.0.0',
        dependencies:{a:'^1.0.0'},
      },
      'node_modules/a':{
        version:'1.2.0',
        resolved:'https://registry.npmjs.org/a/-/a-1.2.0.tgz',
        integrity:'sha512-a',
        license:'MIT',
      },
    },
  };
  const packageLockText=JSON.stringify(packageLock,null,2)+'\n';
  return {packageJson,packageLock,packageLockText};
}

function audit(overrides={}){
  return {
    verified:true,
    source:'npm-audit-runtime-ci',
    status:'VERIFIED',
    vulnerabilities:{low:0,moderate:0,high:0,critical:0},
    ...overrides,
  };
}

async function attestation(overrides={}){
  const f=fixture();
  return createSupplyChainAttestation({
    commit:SHA,
    branch:'candidate/mel-clean-autonomy',
    ...f,
    audit:audit(),
    generatedAt:'2026-09-25T09:30:00.000Z',
    schemaVersion:'13',
    configVersion:'cfg-v1',
    ci:{
      run_id:'36100000000',
      workflow:'full-candidate-ci',
      repository:'adrienlopezcarreras-pixel/meliturgos-cloudflare',
      event:'push',
    },
    ...overrides,
  });
}

test('MEL-SEC-03 creates exact-SHA release-eligible supply-chain attestation',async()=>{
  const value=await attestation();
  assert.equal(value.schema,'mel.security.supply-chain-attestation/v1');
  assert.equal(value.source.commit,SHA);
  assert.equal(value.source.exact_sha,true);
  assert.equal(value.release_eligible,true);
  assert.deepEqual(value.gate.blockers,[]);
  assert.equal(value.sbom.component_count,1);
  assert.match(value.sbom_sha256,/^[0-9a-f]{64}$/);
  assert.match(value.lockfile.sha256,/^[0-9a-f]{64}$/);
  assert.equal(value.release_manifest.commit,SHA);
  assert.equal(value.release_manifest.lockfileHash,value.lockfile.sha256);
  assert.equal(value.release_manifest.artifacts[0].sha256,value.sbom_sha256);
  assert.match(value.integrity.attestation_sha256,/^[0-9a-f]{64}$/);

  const verification=await verifySupplyChainAttestation(value,{
    packageLockText:fixture().packageLockText,
  });
  assert.equal(verification.ok,true,JSON.stringify(verification.issues));
  assert.equal(verification.release_eligible,true);
  assert.equal((await assertSupplyChainReleaseEligible(value)).release_eligible,true);
});

test('MEL-SEC-03 audit unavailable remains attestable but blocks release eligibility',async()=>{
  const value=await attestation({
    audit:{
      verified:false,
      source:'npm-audit-runtime-ci',
      status:'AUDIT_REGISTRY_UNAVAILABLE',
      vulnerabilities:{low:0,moderate:0,high:0,critical:0},
      note:'registry endpoint unavailable',
    },
  });

  assert.equal(value.release_eligible,false);
  assert.ok(value.gate.blockers.includes('SUPPLY_CHAIN_AUDIT_UNVERIFIED'));

  const verification=await verifySupplyChainAttestation(value);
  assert.equal(verification.ok,true);
  assert.equal(verification.release_eligible,false);
  await assert.rejects(
    ()=>assertSupplyChainReleaseEligible(value),
    error=>error?.code==='SUPPLY_CHAIN_AUDIT_UNVERIFIED',
  );
});

test('MEL-SEC-03 high runtime vulnerability is recorded and blocks release',async()=>{
  const value=await attestation({
    audit:audit({
      vulnerabilities:{low:0,moderate:0,high:1,critical:0},
    }),
  });

  assert.equal(value.release_eligible,false);
  assert.deepEqual(value.gate.blockers,['SUPPLY_CHAIN_HIGH_VULNERABILITIES']);
  assert.equal((await verifySupplyChainAttestation(value)).ok,true);
});

test('MEL-SEC-03 non-exact source SHA is preserved as evidence but blocks release',async()=>{
  const value=await attestation({commit:'unknown'});
  assert.equal(value.source.exact_sha,false);
  assert.equal(value.release_eligible,false);
  assert.ok(value.gate.blockers.includes('SUPPLY_CHAIN_SOURCE_SHA_UNVERIFIED'));
  const verification=await verifySupplyChainAttestation(value);
  assert.equal(verification.ok,true);
  assert.equal(verification.release_eligible,false);
});

test('MEL-SEC-03 detects SBOM payload tampering',async()=>{
  const value=structuredClone(await attestation());
  value.sbom.components[0].version='9.9.9';

  const verification=await verifySupplyChainAttestation(value);
  assert.equal(verification.ok,false);
  assert.ok(verification.issues.includes('ATTESTATION_DIGEST_MISMATCH'));
  assert.ok(verification.issues.includes('SBOM_DIGEST_MISMATCH'));
});

test('MEL-SEC-03 detects release manifest tampering independently',async()=>{
  const value=structuredClone(await attestation());
  value.release_manifest.commit='b'.repeat(40);

  const verification=await verifySupplyChainAttestation(value);
  assert.equal(verification.ok,false);
  assert.ok(verification.issues.includes('ATTESTATION_DIGEST_MISMATCH'));
  assert.ok(
    verification.issues.includes('MANIFEST_TAMPERED')
      || verification.issues.includes('RELEASE_MANIFEST_COMMIT_MISMATCH')
  );
});

test('MEL-SEC-03 detects exact lockfile byte drift',async()=>{
  const value=await attestation();
  const changed=fixture().packageLockText+' ';

  const verification=await verifySupplyChainAttestation(value,{
    packageLockText:changed,
  });
  assert.equal(verification.ok,false);
  assert.ok(verification.issues.includes('LOCKFILE_DIGEST_MISMATCH'));
});

test('MEL-SEC-03 serialization is stable for same attestation object',async()=>{
  const value=await attestation();
  const first=serializeSupplyChainAttestation(value);
  const second=serializeSupplyChainAttestation(structuredClone(value));
  assert.equal(first,second);
});
