import json, tempfile, subprocess, sys, pathlib
from training.model_error_doctor import scan, audit_config
def test_rules():
    assert any(f['code']=='cuda_oom' for f in scan('RuntimeError: CUDA out of memory'))
    assert any(f['code']=='model_architecture' for f in scan('size mismatch for lm_head'))
def test_patch_copy():
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d)/'config.json';p.write_text('\u007b"per_device_train_batch_size":"2","learning_rate":"0.0001"\u007d')
        original=p.read_bytes();before,after,changes=audit_config(p)
        assert after['per_device_train_batch_size']==2
        assert p.read_bytes()==original
