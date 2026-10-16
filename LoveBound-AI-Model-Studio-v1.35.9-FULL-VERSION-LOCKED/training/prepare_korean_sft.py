#!/usr/bin/env python3
"""Build reviewable Korean-first SFT JSONL from user-supplied approved translation pairs.
No online translation, training, or automatic rewriting of user prompts.
Input JSONL rows: {"source_lang":"ja","source":"...","english":"...","korean":"..."}.
en-US rows may omit english and use source as English.
"""
import argparse, hashlib, json, pathlib, re, sys

def prepare(rows, prompt, approved_sha, output):
    if not prompt.strip(): raise ValueError("Empty user system prompt")
    sha=hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    if sha != approved_sha: raise ValueError("System prompt hash approval mismatch")
    if output.exists(): raise FileExistsError("Refusing to overwrite existing output")
    output.parent.mkdir(parents=True,exist_ok=True)
    generated=[]; held=[]
    for line_no,line in enumerate(rows.splitlines(),1):
        if not line.strip(): continue
        row=json.loads(line)
        lang=row.get("source_lang","").strip()
        source=row.get("source","").strip()
        english=row.get("english","").strip()
        korean=row.get("korean","").strip()
        if not source or not lang: held.append({"line":line_no,"reason":"missing source/language"});continue
        if lang=="ko-KR":
            korean=korean or source
        elif lang=="en-US":
            english=english or source
            if not korean: held.append({"line":line_no,"reason":"missing approved en-US -> ko-KR translation"});continue
        else:
            if not english or not korean:
                held.append({"line":line_no,"reason":"requires approved foreign -> en-US -> ko-KR pair"});continue
        if not korean: held.append({"line":line_no,"reason":"missing Korean target"});continue
        # The user's prompt is inserted as SFT context, not a guarantee of learned obedience.
        context=f"[SYSTEM]\\n{prompt}\\n[/SYSTEM]\\n"
        if lang not in ("ko-KR","en-US"):
            context+=f"[USER {lang}]\\n{source}\\n[/USER]\\n[EN-US INTERMEDIATE]\\n{english}\\n[/EN-US INTERMEDIATE]\\n"
        elif lang=="en-US":
            context+=f"[USER en-US]\\n{english}\\n[/USER]\\n"
        else:
            context+=f"[USER ko-KR]\\n{source}\\n[/USER]\\n"
        generated.append({"text":context+f"[ASSISTANT ko-KR]\\n{korean}\\n[/ASSISTANT]"})
    if not generated: raise ValueError("No complete approved training pairs; nothing generated")
    with output.open("x",encoding="utf-8") as f:
        for item in generated: f.write(json.dumps(item,ensure_ascii=False)+"\\n")
    return {"version":"1.35.9","primary":"ko-KR","secondary":"en-US","system_prompt_sha256":sha,"created":len(generated),"held":held,"output":str(output)}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--pairs",required=True)
    p.add_argument("--prompt",default="training/system_prompt.txt")
    p.add_argument("--approved-sha256",required=True)
    p.add_argument("--output",required=True)
    a=p.parse_args()
    prompt=pathlib.Path(a.prompt).read_text(encoding="utf-8")
    rows=pathlib.Path(a.pairs).read_text(encoding="utf-8")
    print(json.dumps(prepare(rows,prompt,a.approved_sha256,pathlib.Path(a.output)),ensure_ascii=False,indent=2))
if __name__=="__main__":main()
