#!/usr/bin/env python3
"""Read-only target planning/compatibility report; does not build apps."""
import argparse,json,pathlib
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--config",default="custom/inapp_browser/targets.json")
 p.add_argument("--target",choices=["windows-x86_64","android-arm64"])
 a=p.parse_args()
 cfg=json.loads(pathlib.Path(a.config).read_text(encoding="utf-8"))
 targets=[x for x in cfg["primary"] if not a.target or x["id"]==a.target]
 print(json.dumps({"targets":targets,"deferred":cfg["deferred"],"build_performed":False,"compatibility_verified":False,"note":"Profiles only; native dependencies, model runner, WebView engine and signing need actual builds/tests."},ensure_ascii=False,indent=2))
if __name__=="__main__":main()
