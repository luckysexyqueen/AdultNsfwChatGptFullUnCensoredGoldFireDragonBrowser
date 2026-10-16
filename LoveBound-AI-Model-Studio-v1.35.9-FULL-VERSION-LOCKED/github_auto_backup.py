#!/usr/bin/env python3
"""Explicit GitHub private-repository provisioning + versioned Vault backup.
Uses Git CLI and Git LFS for large files. Tokens never written to git remotes.
"""
import argparse, base64, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile, urllib.error, urllib.request
from urllib.parse import quote
def git(*args,cwd=None,env=None):
    result=subprocess.run(["git",*args],cwd=cwd,env=env,capture_output=True,text=True,timeout=900)
    if result.returncode:raise RuntimeError("git operation failed: "+result.stderr[-1200:])
    return result.stdout.strip()
def github(method,path,token,data=None):
    url="https://api.github.com"+path
    req=urllib.request.Request(url,method=method,headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"LoveBound-Vault-v1.35.9"},data=None if data is None else json.dumps(data).encode())
    if data is not None:req.add_header("Content-Type","application/json")
    try:
        with urllib.request.urlopen(req,timeout=45) as res:return json.load(res)
    except urllib.error.HTTPError as e:
        body=e.read(1200).decode("utf-8","replace")
        raise RuntimeError(f"GitHub API {e.code}: {body}") from None
def validate_name(s):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}",s):raise ValueError("Invalid repo name")
def plan(args):
    archive=pathlib.Path(args.archive).resolve()
    if not archive.is_file():raise FileNotFoundError(archive)
    if not zipfile_valid(archive):raise ValueError("Archive must be valid ZIP")
    if archive.stat().st_size>2*1024**3:raise ValueError("Archive too large for this workflow (2 GiB cap)")
    return archive
def zipfile_valid(path):
    import zipfile
    return zipfile.is_zipfile(path)
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--archive",required=True,help="Vault snapshot ZIP from persistent_vault.py export")
    p.add_argument("--repo-name",default="LoveBound-AI-Model-Studio-Private-Vault")
    p.add_argument("--branch",default="main")
    p.add_argument("--apply",action="store_true",help="Create private GitHub repo if needed and push")
    p.add_argument("--approve",action="store_true")
    p.add_argument("--repo-owner",help="Optional GitHub account login; must match authenticated user")
    p.add_argument("--allow-existing-repo",action="store_true",help="Explicitly permit adding commits to an existing repo")
    a=p.parse_args()
    validate_name(a.repo_name)
    if a.branch!="main":raise ValueError("Only main branch supported")
    archive=plan(a)
    result={"version":"1.35.9","mode":"apply" if a.apply else "plan_only","archive":archive.name,"size":archive.stat().st_size,
            "repo_name":a.repo_name,"requires_git_lfs":archive.stat().st_size>50*1024*1024}
    if not a.apply:
        print(json.dumps(result,ensure_ascii=False,indent=2));return
    if not a.approve:raise ValueError("--apply requires --approve")
    token=os.environ.get("GITHUB_TOKEN")
    if not token:raise ValueError("Set GITHUB_TOKEN in Space Secrets")
    if shutil.which("git") is None:raise RuntimeError("git executable required")
    if result["requires_git_lfs"]:
        if shutil.which("git-lfs") is None:raise RuntimeError("git-lfs required for archives >50 MiB; install in Docker Space")
        git("lfs","version")
    me=github("GET","/user",token)
    owner=me["login"]
    if a.repo_owner and a.repo_owner.lower()!=owner.lower():raise ValueError("Repo owner must be authenticated user")
    try:
        repo=github("GET",f"/repos/{quote(owner)}/{quote(a.repo_name)}",token)
        if not a.allow_existing_repo:raise ValueError("Repository exists: explicit --allow-existing-repo required")
        if not repo.get("private"):raise ValueError("Refusing to upload backups to public repo")
    except RuntimeError as e:
        if "GitHub API 404:" not in str(e):raise
        repo=github("POST","/user/repos",token,{"name":a.repo_name,"private":True,"auto_init":False,"description":"Private LoveBound AI Model Studio snapshot backups"})
    if not repo.get("private"):raise ValueError("Private repository required")
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    # Keep snapshot names unique. No destructive force pushes.
    with tempfile.TemporaryDirectory(prefix="lovebound-git-") as td:
        root=pathlib.Path(td)
        git("init","-b","main",cwd=root)
        git("config","user.name","LoveBound Backup Bot",cwd=root)
        git("config","user.email","lovebound-backup@users.noreply.github.com",cwd=root)
        env=dict(os.environ)
        # Use an ephemeral askpass script so no token is persisted in git config/remote.
        ask=root.parent/(root.name+"-askpass.sh")
        try:
            ask.write_text('#!/bin/sh\ncase "$1" in *Username*) echo "x-access-token";; *) printf "%s" "$GITHUB_TOKEN";; esac\n')
            ask.chmod(0o700)
            env.update({"GIT_ASKPASS":str(ask),"GIT_TERMINAL_PROMPT":"0"})
            url=f"https://github.com/{owner}/{a.repo_name}.git"
            git("remote","add","origin",url,cwd=root)
            # fetch existing history, then add a new commit on top.
            default_branch=repo.get("default_branch") or "main"
            if repo.get("size",0)>0:
                git("fetch","origin",default_branch,cwd=root,env=env)
                git("checkout","-B","main","FETCH_HEAD",cwd=root)
            if result["requires_git_lfs"]:
                git("lfs","install","--local",cwd=root)
                git("lfs","track","backups/*.zip",cwd=root)
            backups=root/"backups";backups.mkdir(exist_ok=True)
            name=digest+".zip"
            target=backups/name
            if target.exists():
                if hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise ValueError("Existing archive hash mismatch")
            else:shutil.copy2(archive,target)
            index=root/"backups"/(digest+".json")
            index.write_text(json.dumps({"version":"1.35.9","archive":name,"sha256":digest,"size":archive.stat().st_size},indent=2)+"\n")
            git("add","-A",cwd=root)
            changes=git("status","--porcelain",cwd=root)
            if changes:
                git("commit","-m","Backup LoveBound vault snapshot "+digest[:12],cwd=root)
                git("push","origin","HEAD:refs/heads/main",cwd=root,env=env)
            result.update({"status":"UPLOADED" if changes else "ALREADY_PRESENT","repository":f"https://github.com/{owner}/{a.repo_name}","sha256":digest})
        finally:
            ask.unlink(missing_ok=True)
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
