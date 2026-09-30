import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNTIME_SBOM_SCHEMA,
  assertRuntimeSupplyChain,
  buildRuntimeSbom,
  evaluateRuntimeSupplyChain
} from '../../src/security/supply-chain.js';

function fixture({ host = 'registry.npmjs.org' } = {}) {
  const packageJson = {
    name: 'mel-test',
    version: '1.0.0',
    dependencies: { a: '^1.0.0' },
    devDependencies: { devonly: '^9.0.0' }
  };
  const packageLock = {
    name: 'mel-test',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'mel-test',
        version: '1.0.0',
        dependencies: { a: '^1.0.0' },
        devDependencies: { devonly: '^9.0.0' }
      },
      'node_modules/a': {
        version: '1.2.0',
        resolved: `https://${host}/a/-/a-1.2.0.tgz`,
        integrity: 'sha512-a',
        license: 'MIT',
        dependencies: { b: '^2.0.0' },
        optionalDependencies: { c: '^3.0.0' }
      },
      'node_modules/b': {
        version: '2.1.0',
        resolved: `https://${host}/b/-/b-2.1.0.tgz`,
        integrity: 'sha512-b',
        license: 'Apache-2.0'
      },
      'node_modules/c': {
        version: '3.0.0',
        resolved: `https://${host}/c/-/c-3.0.0.tgz`,
        integrity: 'sha512-c',
        optional: true
      },
      'node_modules/devonly': {
        version: '9.0.0',
        resolved: `https://${host}/devonly/-/devonly-9.0.0.tgz`,
        integrity: 'sha512-dev',
        dev: true
      }
    }
  };
  return { packageJson, packageLock };
}

function cleanAudit(overrides = {}) {
  return {
    verified: true,
    source: 'npm-audit-runtime-ci',
    vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0, ...(overrides.vulnerabilities || {}) },
    ...overrides
  };
}

test('runtime SBOM walks only the transitive runtime closure and excludes unrelated dev packages', () => {
  const { packageJson, packageLock } = fixture();
  const sbom = buildRuntimeSbom({ packageJson, packageLock });

  assert.equal(sbom.schema, RUNTIME_SBOM_SCHEMA);
  assert.equal(sbom.component_count, 3);
  assert.deepEqual(sbom.direct_runtime_dependencies, ['a']);
  assert.deepEqual(sbom.components.map(row => row.name), ['a', 'b', 'c']);
  assert.equal(sbom.components.some(row => row.name === 'devonly'), false);
  assert.equal(sbom.components.find(row => row.name === 'a').direct, true);
  assert.equal(sbom.components.find(row => row.name === 'c').optional, true);
});

test('lockfile identity and direct dependency specs must exactly match package.json', () => {
  const { packageJson, packageLock } = fixture();
  const wrongVersion = structuredClone(packageLock);
  wrongVersion.version = '2.0.0';
  assert.throws(() => buildRuntimeSbom({ packageJson, packageLock: wrongVersion }), /SUPPLY_CHAIN_ROOT_IDENTITY_MISMATCH/);

  const wrongSpec = structuredClone(packageLock);
  wrongSpec.packages[''].dependencies.a = '^9.0.0';
  assert.throws(() => buildRuntimeSbom({ packageJson, packageLock: wrongSpec }), /SUPPLY_CHAIN_DIRECT_DEPENDENCY_SPEC_MISMATCH/);
});

test('missing runtime lock entries or integrity fail closed', () => {
  const { packageJson, packageLock } = fixture();
  const missing = structuredClone(packageLock);
  delete missing.packages['node_modules/b'];
  assert.throws(() => buildRuntimeSbom({ packageJson, packageLock: missing }), /SUPPLY_CHAIN_LOCK_ENTRY_MISSING/);

  const noIntegrity = structuredClone(packageLock);
  delete noIntegrity.packages['node_modules/a'].integrity;
  assert.throws(() => buildRuntimeSbom({ packageJson, packageLock: noIntegrity }), /SUPPLY_CHAIN_INTEGRITY_REQUIRED/);
});

test('registry provenance is HTTPS, allowlisted and credential-free', () => {
  const custom = fixture({ host: 'mirror.example' });
  assert.throws(() => buildRuntimeSbom(custom), /SUPPLY_CHAIN_REGISTRY_NOT_ALLOWED/);

  const sbom = buildRuntimeSbom({
    ...custom,
    policy: { allowedRegistryHosts: ['mirror.example'] }
  });
  assert.equal(sbom.components[0].source.host, 'mirror.example');

  const withQuery = fixture();
  withQuery.packageLock.packages['node_modules/a'].resolved += '?token=secret';
  assert.throws(() => buildRuntimeSbom(withQuery), /SUPPLY_CHAIN_SOURCE_CREDENTIALS_FORBIDDEN/);
});

test('audit evidence is mandatory and unverified evidence is rejected', () => {
  const { packageJson, packageLock } = fixture();
  assert.throws(() => evaluateRuntimeSupplyChain({ packageJson, packageLock }), /SUPPLY_CHAIN_AUDIT_EVIDENCE_REQUIRED/);
  assert.throws(() => evaluateRuntimeSupplyChain({
    packageJson,
    packageLock,
    audit: { ...cleanAudit(), verified: false }
  }), /SUPPLY_CHAIN_AUDIT_NOT_VERIFIED/);
});

test('default policy blocks high and critical runtime vulnerabilities', () => {
  const { packageJson, packageLock } = fixture();
  const high = evaluateRuntimeSupplyChain({
    packageJson,
    packageLock,
    audit: cleanAudit({ vulnerabilities: { high: 1 } })
  });
  assert.equal(high.ok, false);
  assert.deepEqual(high.blockers, ['SUPPLY_CHAIN_HIGH_VULNERABILITIES']);
  assert.throws(() => assertRuntimeSupplyChain({
    packageJson,
    packageLock,
    audit: cleanAudit({ vulnerabilities: { critical: 1 } })
  }), /SUPPLY_CHAIN_CRITICAL_VULNERABILITIES/);
});

test('explicit risk policy can raise a bounded threshold without weakening provenance checks', () => {
  const custom = fixture({ host: 'mirror.example' });
  const result = assertRuntimeSupplyChain({
    ...custom,
    audit: cleanAudit({ vulnerabilities: { high: 1 } }),
    policy: {
      maxHigh: 1,
      maxCritical: 0,
      allowedRegistryHosts: ['mirror.example']
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.policy.max_high, 1);
  assert.deepEqual(result.policy.allowed_registry_hosts, ['mirror.example']);
  assert.equal(result.sbom.components.every(row => row.source.host === 'mirror.example'), true);
});

test('clean verified runtime evidence produces a portable deterministic gate result', () => {
  const { packageJson, packageLock } = fixture();
  const first = assertRuntimeSupplyChain({ packageJson, packageLock, audit: cleanAudit() });
  const second = assertRuntimeSupplyChain({ packageJson, packageLock, audit: cleanAudit() });

  assert.deepEqual(second, first);
  assert.equal(first.ok, true);
  assert.deepEqual(first.blockers, []);
  assert.equal(first.sbom.root.name, 'mel-test');
});
