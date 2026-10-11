import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('LoRA parent bundle extraction is flat, bounded, link-free and exclusive', () => {
  const py = String.raw`
import io
import shutil
import tarfile
import tempfile
from pathlib import Path

source=Path('kaggle/mel-lora-uncensored/run.py').read_text(encoding='utf-8')
start=source.index('def unpack_parent_archive(')
end=source.index('def extract_parent(',start)
env={'tarfile':tarfile,'shutil':shutil,'Path':Path}
exec(compile(source[start:end],'<isolated parent bundle extractor>','exec'),env)
unpack=env['unpack_parent_archive']

with tempfile.TemporaryDirectory() as temp:
    root=Path(temp)
    def make(name,entries):
        path=root/name
        with tarfile.open(path,'w:gz') as tar:
            for spec in entries:
                filename=spec[0]
                kind=spec[1] if len(spec)>1 else 'regular'
                info=tarfile.TarInfo(filename)
                if kind == 'symlink':
                    info.type=tarfile.SYMTYPE
                    info.linkname='../outside'
                    tar.addfile(info)
                elif kind == 'hardlink':
                    info.type=tarfile.LNKTYPE
                    info.linkname='adapter_model.safetensors'
                    tar.addfile(info)
                else:
                    data=spec[2] if len(spec)>2 else b'x'
                    info.size=len(data)
                    tar.addfile(info,io.BytesIO(data))
        return path
    good=make('good.tar.gz',[
        ('adapter_model.safetensors','regular',b'weights'),
        ('adapter_config.json','regular',b'{"model_type":"mistral"}'),
    ])
    destination=root/'good-output'
    unpack(good,destination)
    assert (destination/'adapter_model.safetensors').read_bytes()==b'weights'
    assert (destination/'adapter_config.json').is_file()
    try:
        unpack(good,destination)
        raise AssertionError('Allowed overwriting extracted parent artifacts')
    except FileExistsError:
        pass

    cases={
      'traversal':[('../outside','regular',b'evil')],
      'absolute':[('/tmp/forbidden','regular',b'evil')],
      'unknown':[('backdoor.py','regular',b'evil')],
      'symlink':[('adapter_config.json','symlink')],
      'hardlink':[('adapter_model.safetensors','hardlink')],
      'duplicate':[('adapter_config.json','regular',b'one'),('adapter_config.json','regular',b'two')],
    }
    for label,entries in cases.items():
        tar_path=make(label+'.tar.gz',entries)
        dest=root/('blocked-'+label)
        try:
            unpack(tar_path,dest)
            raise AssertionError(label+' was unexpectedly accepted')
        except SystemExit as error:
            assert str(error).startswith('KAGGLE_PARENT_ARCHIVE_'),(label,str(error))
        assert not dest.exists() or not any(dest.iterdir()),label+' wrote files despite failed preflight'
    assert not (root/'outside').exists()
print('SAFE_LORA_PARENT_EXTRACTION_OK')
`;
  const r=spawnSync('python3',['-c',py],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,[r.stderr,r.stdout].join('\n'));
  assert.match(r.stdout,/SAFE_LORA_PARENT_EXTRACTION_OK/);
});
