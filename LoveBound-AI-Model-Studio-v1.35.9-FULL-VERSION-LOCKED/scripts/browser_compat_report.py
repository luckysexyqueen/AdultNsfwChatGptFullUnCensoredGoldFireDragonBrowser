#!/usr/bin/env python3
"""Generate a non-invasive browser compatibility checklist. No browser execution."""
import argparse,json,pathlib
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--targets",default="custom/browser_compat/targets.json")
 p.add_argument("--output",required=True)
 a=p.parse_args()
 cfg=json.loads(pathlib.Path(a.targets).read_text(encoding="utf-8"))
 out=pathlib.Path(a.output)
 if out.exists(): raise SystemExit("Refusing to overwrite report")
 out.parent.mkdir(parents=True,exist_ok=True)
 out.write_text(json.dumps({"version":cfg["version"],"tested":False,"targets":[{"name":t["name"],"platforms":t["platforms"],"required_checks":cfg["checks"],"status":"not_tested"} for t in cfg["browser_targets"]],"connectivity":cfg["connectivity"]},ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__":main()
