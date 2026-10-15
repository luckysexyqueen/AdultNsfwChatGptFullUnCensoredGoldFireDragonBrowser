#!/usr/bin/env python3
"""Report optional command presence without executing or installing programs."""
import argparse,json,pathlib,shutil
COMMANDS={"git":"git","node":"node","npm":"npm","pnpm":"pnpm","yarn":"yarn","python":"python","pip":"pip","java":"java","javac":"javac","gradle":"gradle","adb":"adb","electron":"electron","cordova":"cordova","capacitor":"cap","apktool":"apktool"}
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--catalog",default="custom/toolchains/catalog.json")
 p.add_argument("--output",required=True)
 a=p.parse_args()
 catalog=json.loads(pathlib.Path(a.catalog).read_text(encoding="utf-8"))
 dest=pathlib.Path(a.output)
 if dest.exists(): p.error("Output already exists; refusing overwrite")
 dest.parent.mkdir(parents=True,exist_ok=True)
 results=[{"name":e["name"],"group":e["group"],"id":e["id"],"path_command":COMMANDS.get(e["id"]),"found_on_path":bool(shutil.which(COMMANDS[e["id"]])) if e["id"] in COMMANDS else None} for e in catalog["entries"]]
 dest.write_text(json.dumps({"inventory_only":True,"executed_programs":False,"entries":results},ensure_ascii=False,indent=2),encoding="utf-8")
 print(dest)
if __name__=="__main__":main()
