import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../android-companion/',import.meta.url);

test('Android client forbids cleartext transport and requests only required network/microphone permissions',async()=>{
  const manifest=await readFile(new URL('app/src/main/AndroidManifest.xml',root),'utf8');
  assert.match(manifest,/android\.permission\.INTERNET/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
  assert.match(manifest,/android:usesCleartextTraffic="false"/);
  assert.match(manifest,/android:allowBackup="false"/);
});

test('Android token is encrypted with Android Keystore and owner password is absent from client sources',async()=>{
  const vault=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/TokenVault.kt',root),'utf8');
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  assert.match(vault,/AndroidKeyStore/);
  assert.match(vault,/AES\/GCM\/NoPadding/);
  assert.match(vault,/PURPOSE_ENCRYPT/);
  assert.match(api,/require\(baseUrl\.startsWith\("https:\/\/"\)\)/);
  assert.match(api,/Authorization", "Bearer \$token"/);
  assert.doesNotMatch(api,/Basic\s/i);
  assert.doesNotMatch(api,/password/i);
  assert.doesNotMatch(vault,/password/i);
});

test('Android native client exposes pairing chat sync ACK and voice transports',async()=>{
  const api=await readFile(new URL('app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8');
  const routes=[
    '/api/android/v1/pair',
    '/api/android/v1/heartbeat',
    '/api/android/v1/chat',
    '/api/android/v1/sync?conversation_id=',
    '/api/android/v1/sync/ack',
    '/api/android/v1/voice/transcribe'
  ];
  for(const route of routes) assert.ok(api.includes(route),route);
});
