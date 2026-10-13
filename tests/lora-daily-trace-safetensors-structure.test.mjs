import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

test('LoRA c000 safetensors header passes exact layer/rank/offset checks without loading weights',()=>{
  const python = `
import runpy, copy
ns=runpy.run_path('scripts/verify-c000-lora-structure.py',run_name='fixture')
verify=ns['verify_header']
config=dict(ns['C000_CONFIG'])
header={'__metadata__':{'format':'pt'}}
cursor=0
for layer in range(32):
 for module in ('q_proj','v_proj'):
  width=4096 if module=='q_proj' else 1024
  for suffix in ('A','B'):
   dims=[8,4096] if suffix=='A' else [width,8]
   size=dims[0]*dims[1]*4
   key=f'base_model.model.model.layers.{layer}.self_attn.{module}.lora_{suffix}.weight'
   header[key]={'dtype':'F32','shape':dims,'data_offsets':[cursor,cursor+size]}
   cursor+=size
assert verify(header,config,cursor)['tensors']==128
def must_fail(h,c,body,code):
 try:
  verify(h,c,body)
  raise AssertionError(f'wrongly accepted {code}')
 except ValueError as e:
  assert code in str(e),(code,str(e))
modified=copy.deepcopy(header)
modified['base_model.model.model.layers.1.self_attn.q_proj.lora_A.weight']['shape']=[8,2048]
must_fail(modified,config,cursor,'TENSOR_SHAPE_INVALID')
modified=copy.deepcopy(header)
modified['base_model.model.model.layers.1.self_attn.q_proj.lora_A.weight']['data_offsets'][0]+=4
must_fail(modified,config,cursor,'TENSOR_SIZE_INVALID')
modified=copy.deepcopy(header)
del modified['base_model.model.model.layers.31.self_attn.v_proj.lora_B.weight']
must_fail(modified,config,cursor,'TENSOR_COUNT_INVALID')
modified=copy.deepcopy(config)
modified['r']=16
must_fail(header,modified,cursor,'CONFIG_MISMATCH')
must_fail(header,config,cursor+4,'BODY_SIZE_MISMATCH')
print('C000_SAFETENSORS_POSITIVE_AND_NEGATIVE_FIXTURES_PASS')
`;
  const out=spawnSync('python3',['-c',python],{encoding:'utf8',timeout:15000});
  assert.equal(out.status,0,out.stderr);
  assert.match(out.stdout,/C000_SAFETENSORS_POSITIVE_AND_NEGATIVE_FIXTURES_PASS/);
});
test('manual-only recovery checks safetensors structure before retaining checkpoint',()=>{
  const yaml=readFileSync('.github/workflows/recover-existing-kaggle-lora.yml','utf8');
  const verify=yaml.indexOf('verify-existing-kaggle-lora-bundle.py');
  const structural=yaml.indexOf('verify-c000-lora-structure.py');
  const upload=yaml.indexOf('Retain verified checkpoint (no activation)');
  assert.ok(verify>0 && structural>verify && upload>structural);
});
