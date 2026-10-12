import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('existing LoRA recovery never submits Kaggle GPU, deploys, or activates', () => {
  const text = readFileSync('.github/workflows/recover-existing-kaggle-lora.yml', 'utf8');
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /kernel_version:/);
  assert.match(text, /RECOVERY_KERNEL_VERSION_INVALID/);
  assert.doesNotMatch(text, /kaggle kernels push|--accelerator|wrangler deploy|gh release create|--activate true/);
  assert.match(text, /kaggle kernels output/);
  assert.match(text, /verify-existing-kaggle-lora-bundle\.py/);
  assert.match(text, /if-no-files-found: error/);
  assert.match(text, /retention-days: 30/);
});

test('recovery verifier rejects tampered weights and unexpected archive paths', () => {
  const fixture = `
import hashlib, io, json, os, runpy, sys, tarfile, tempfile
script=sys.argv[1]
ns=runpy.run_path(script, run_name='offline_fixture')
verify=ns['verify']
g=verify.__globals__
weights=b'fixture-only-weights'
config=b'{"peft_type":"LORA"}'
hash_w=hashlib.sha256(weights).hexdigest()
hash_c=hashlib.sha256(config).hexdigest()
g.update(ADAPTER_SHA=hash_w, CONFIG_SHA=hash_c, ADAPTER_SIZE=len(weights), CONFIG_SIZE=len(config))
source=g['SOURCE_SHA']
docs={
 'adapter_model.safetensors':weights,
 'adapter_config.json':config,
 'training-evidence.json': json.dumps({'plan_id':'p','promotion':{'approved':False},'artifacts':{
   'adapter_model':{'digest':'sha256:'+hash_w,'size_bytes':len(weights)},
   'adapter_config':{'digest':'sha256:'+hash_c,'size_bytes':len(config)}}}).encode(),
 'artifact-evidence.json':json.dumps({'digest':'sha256:'+hash_w,'size_bytes':len(weights)}).encode(),
 'kaggle-run.json':json.dumps({'status':'TRAINED_UNBENCHMARKED','source_sha':source,'cycle':0,'global_step':32,
   'local_uncensored_gate':False,'offline_kernel':True,'artifact_digest':'sha256:'+hash_w}).encode(),
 'lora-plan.json':b'{"id":"p"}',
}
for name in g['FILES']:
 docs.setdefault(name,b'{}')
def make(path, payload):
 with tarfile.open(path, 'w:gz') as archive:
  for name, data in payload.items():
   entry=tarfile.TarInfo(name)
   entry.size=len(data)
   archive.addfile(entry, io.BytesIO(data))
with tempfile.TemporaryDirectory() as td:
 path=os.path.join(td,'bundle.tar.gz')
 make(path,docs)
 assert verify(path)['status']=='CHECKPOINT_BYTES_RECOVERED_UNBENCHMARKED'
 modified=dict(docs)
 modified['adapter_model.safetensors']=b'tampered-weights'
 make(path,modified)
 try:
  verify(path)
  raise AssertionError('tampered adapter unexpectedly passed')
 except ValueError as exc:
  assert 'HASH_MISMATCH' in str(exc)
 modified=dict(docs)
 modified['../adapter_model.safetensors']=modified.pop('adapter_model.safetensors')
 make(path,modified)
 try:
  verify(path)
  raise AssertionError('unsafe archive unexpectedly passed')
 except ValueError as exc:
  assert 'ARCHIVE_MEMBERS' in str(exc) or 'UNSAFE_ARCHIVE' in str(exc)
print('RECOVERY_POSITIVE_AND_NEGATIVE_FIXTURES_PASS')
`;
  const r = spawnSync('python3', ['-c', fixture, 'scripts/verify-existing-kaggle-lora-bundle.py'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /RECOVERY_POSITIVE_AND_NEGATIVE_FIXTURES_PASS/);
});
