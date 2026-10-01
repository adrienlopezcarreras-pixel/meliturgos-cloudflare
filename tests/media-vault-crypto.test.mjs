import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MEDIA_VAULT_SCHEMA,
  MEDIA_VAULT_ALGORITHM,
  createMediaVaultCodec,
  createEnvMediaVaultCodec,
} from '../src/media/media-vault-crypto.js';

const keyBytes = new Uint8Array(32).fill(7);
const aad = {
  schema:'MEL_MEDIA_UPLOAD_AAD_V1',
  id:'file-1',
  owner:'adrien',
  original_name:'evidence.bin',
  mime:'application/octet-stream',
  plaintext_sha256:'ignored-by-codec-aad-binding',
};

test('Media Vault AES-GCM encrypts bytes and verifies integrity on open', async () => {
  const codec=createMediaVaultCodec({
    keyBytes,
    keyId:'media-v1',
    randomBytes:()=>new Uint8Array(12).fill(3),
  });
  const plain=new TextEncoder().encode('private evidence');
  const sealed=await codec.seal(plain,aad);

  assert.equal(codec.schema,MEDIA_VAULT_SCHEMA);
  assert.equal(codec.algorithm,MEDIA_VAULT_ALGORITHM);
  assert.equal(sealed.metadata.mediaSchema,MEDIA_VAULT_SCHEMA);
  assert.equal(sealed.metadata.mediaAlgorithm,MEDIA_VAULT_ALGORITHM);
  assert.equal(sealed.metadata.mediaKeyId,'media-v1');
  assert.notDeepEqual([...sealed.ciphertext],[...plain]);

  const opened=await codec.open({ciphertext:sealed.ciphertext,metadata:sealed.metadata,aad});
  assert.equal(new TextDecoder().decode(opened),'private evidence');
});

test('Media Vault rejects ciphertext tampering', async () => {
  const codec=createMediaVaultCodec({
    keyBytes,
    keyId:'media-v1',
    randomBytes:()=>new Uint8Array(12).fill(4),
  });
  const sealed=await codec.seal(new TextEncoder().encode('private evidence'),aad);
  const tampered=new Uint8Array(sealed.ciphertext);
  tampered[0]^=1;
  await assert.rejects(
    codec.open({ciphertext:tampered,metadata:sealed.metadata,aad}),
    error=>error?.code==='MEDIA_VAULT_CIPHERTEXT_INTEGRITY_MISMATCH',
  );
});

test('persisted media fails closed when encryption secret is absent', () => {
  assert.throws(
    ()=>createEnvMediaVaultCodec({MEL_MEDIA_ENCRYPTION_KEY_ID:'media-v1'}),
    error=>error?.code==='MEDIA_VAULT_KEY_REQUIRED' && error?.status===503,
  );
});


test('production release provisions a domain-separated Media Vault Worker secret', async () => {
  const source=await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml',import.meta.url),'utf8');
  assert.match(source,/Configure encrypted Media Vault key/);
  assert.match(source,/crypto\.hkdfSync\(/);
  assert.match(source,/MEL_MEDIA_VAULT_V1/);
  assert.match(source,/wrangler secret put MEL_MEDIA_ENCRYPTION_KEY_B64/);
  assert.match(source,/wrangler secret put MEL_MEDIA_ENCRYPTION_KEY_ID/);
  assert.doesNotMatch(source,/echo "\$\{MEDIA_KEY_B64\}"/);
});
