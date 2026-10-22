// GPT-6 / LORA-C004-20261021: exercise the actual staging function offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Kaggle stages exactly the offline model files, preserves c003 and fails without disk space', () => {
  const script = String.raw`
import ast
import json
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

source = Path(sys.argv[1]).read_text(encoding="utf-8")
tree = ast.parse(source)
function = next(node for node in tree.body
                if isinstance(node, ast.FunctionDef) and node.name == "stage_base_model")
module = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))

with tempfile.TemporaryDirectory(prefix="mel-lora-stage-") as temp:
    root = Path(temp)
    source_dir = root / "dataset"
    source_dir.mkdir()
    working = root / "working"
    working.mkdir()
    (source_dir / "weights").mkdir()
    (source_dir / "weights" / "part.safetensors").write_bytes(b"legitimate-offline-weights")
    (source_dir / "config.json").write_text("{}")
    (source_dir / "tokenizer_config.json").write_text("{}")
    (source_dir / "tokenizer.model").write_bytes(b"tokenizer")
    (source_dir / "model.safetensors.index.json").write_text(
        json.dumps({"weight_map": {"model.layers.0.weight": "weights/part.safetensors"}})
    )
    (source_dir / "unneeded.bin").write_bytes(b"skip-me")
    (working / "parent-adapter").mkdir()
    parent = working / "parent-adapter" / "adapter_model.safetensors"
    parent.write_bytes(b"c003-preserved")
    namespace = {"Path": Path, "WORK": working, "shutil": shutil, "json": json}
    exec(compile(module, "<staging>", "exec"), namespace)
    stage = namespace["stage_base_model"]

    staged = stage(source_dir)
    assert staged.is_dir()
    assert (staged / "weights" / "part.safetensors").read_bytes() == b"legitimate-offline-weights"
    assert (staged / "tokenizer.model").read_bytes() == b"tokenizer"
    assert not (staged / "unneeded.bin").exists()
    assert parent.read_bytes() == b"c003-preserved"

    # The fail-closed disk check must occur before writing a new cache.
    with patch.object(shutil, "disk_usage", return_value=SimpleNamespace(free=42)):
        try:
            stage(source_dir)
        except SystemExit as exc:
            assert str(exc) == "KAGGLE_BASE_MODEL_STAGING_INSUFFICIENT_DISK", str(exc)
        else:
            raise AssertionError("insufficient disk was not rejected")
    assert parent.read_bytes() == b"c003-preserved"
    assert not (working / "mel-base-model-local").exists()
print("LORA_KAGGLE_LOCAL_STAGE_TEST_PASSED")
`;
  const file = fileURLToPath(new URL('../../kaggle/mel-lora-uncensored/run.py', import.meta.url));
  const result = spawnSync('python3', ['-c', script, file], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  assert.match(result.stdout, /LORA_KAGGLE_LOCAL_STAGE_TEST_PASSED/);
});
