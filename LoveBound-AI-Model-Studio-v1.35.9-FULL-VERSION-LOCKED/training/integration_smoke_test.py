#!/usr/bin/env python3
"""Offline functional smoke tests for integrated LoveBound modules."""
import ast,hashlib,json,pathlib,subprocess,sys,tempfile,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(*args):
    p=subprocess.run([sys.executable,"-S",*map(str,args)],capture_output=True,text=True,timeout=60)
    if p.returncode:raise RuntimeError(f"exit={p.returncode} stderr={p.stderr[-600:]} stdout={p.stdout[-600:]}")
    return json.loads(p.stdout)
def main():
    tests={}
    for n in ("app.py","training/gguf_pipeline.py","training/train_peft.py","training/prepare_korean_sft.py","training/self_heal.py","training/requirements_memory.py","training/persistent_vault.py","training/github_auto_backup.py"):
        ast.parse((ROOT/n).read_text(encoding="utf-8"))
    tests["python_syntax"]="PASS"
    req=run(ROOT/"training/requirements_memory.py","--workspace",ROOT,"verify")
    if req["status"]!="PASS":raise RuntimeError("Requirements check failed: "+str(req))
    tests["requirements_memory"]="PASS"
    with tempfile.TemporaryDirectory() as td:
        t=pathlib.Path(td)
        source=t/"models";source.mkdir()
        (source/"model.txt").write_text("한국어 데이터",encoding="utf-8")
        vault=t/"vault";cmd=[ROOT/"training/persistent_vault.py","--vault",vault]
        snap=run(*cmd,"snapshot","--source",source,"--category","models")["snapshot_id"]
        assert run(*cmd,"verify","--snapshot",snap)["status"]=="PASS"
        archive=t/"export.zip";run(*cmd,"export","--snapshot",snap,"--output",archive)
        restore=t/"restore";run(*cmd,"restore","--snapshot",snap,"--output",restore)
        assert (restore/"model.txt").read_bytes()==(source/"model.txt").read_bytes()
        vault2=t/"vault2"
        assert run(ROOT/"training/persistent_vault.py","--vault",vault2,"import","--archive",archive)["snapshot_id"]==snap
        tests["vault_snapshot_export_import_restore"]="PASS"
        plan=run(ROOT/"training/github_auto_backup.py","--archive",archive)
        assert plan["mode"]=="plan_only"
        tests["github_backup_dry_run"]="PASS"
        try:run(ROOT/"training/github_auto_backup.py","--archive",archive,"--apply")
        except RuntimeError:tests["github_approval_gate"]="PASS"
        else:raise RuntimeError("GitHub backup executed without approval")
    archives=list((ROOT/"assets").glob("*.zip"))
    assert len(archives)==24
    tests["original_archives"]="PASS"
    print(json.dumps({"version":"1.35.10","status":"PASS","tests":tests,"external_gpu_and_network":"NOT_RUN"},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
