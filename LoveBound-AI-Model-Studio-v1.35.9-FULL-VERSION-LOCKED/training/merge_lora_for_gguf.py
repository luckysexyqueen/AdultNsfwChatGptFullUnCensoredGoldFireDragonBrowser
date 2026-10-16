#!/usr/bin/env python3
"""Explicit PEFT LoRA merge into new Transformers directory. Requires GPU/RAM."""
import argparse
from pathlib import Path
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--base",required=True)
    p.add_argument("--adapter",required=True)
    p.add_argument("--output",required=True)
    a=p.parse_args()
    base,adapter,out=map(lambda x:Path(x).resolve(),(a.base,a.adapter,a.output))
    if out.exists():raise FileExistsError("Refusing to overwrite merge directory")
    if not (adapter/"adapter_config.json").is_file():raise ValueError("Missing adapter_config.json")
    from transformers import AutoModelForCausalLM,AutoTokenizer
    from peft import PeftModel
    model=AutoModelForCausalLM.from_pretrained(str(base),device_map="auto",torch_dtype="auto",trust_remote_code=False)
    model=PeftModel.from_pretrained(model,str(adapter),is_trainable=False)
    model=model.merge_and_unload()
    out.mkdir(parents=True,exist_ok=False)
    model.save_pretrained(str(out),safe_serialization=True)
    tokenizer=AutoTokenizer.from_pretrained(str(base),trust_remote_code=False)
    tokenizer.save_pretrained(str(out))
    print("Merged LoRA into",out)
if __name__=="__main__":main()
