#!/usr/bin/env python3
"""Opt-in Hugging Face causal LM SFT with PEFT LoRA / QLoRA / full fine-tuning."""
import argparse,json,pathlib,hashlib,torch
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments, Trainer, DataCollatorForLanguageModeling

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--model',required=True);p.add_argument('--dataset',required=True);p.add_argument('--output',required=True)
    p.add_argument('--full-finetune',action='store_true');p.add_argument('--qlora',action='store_true')
    p.add_argument('--epochs',type=float,default=1.0);p.add_argument('--batch-size',type=int,default=1)
    p.add_argument('--max-length',type=int,default=512);p.add_argument('--learning-rate',type=float,default=2e-4)
    p.add_argument('--trust-remote-code',action='store_true')
    p.add_argument('--korean-policy',action='store_true')
    p.add_argument('--system-prompt')
    p.add_argument('--approved-sha256')
    a=p.parse_args()
    if a.full_finetune and a.qlora:raise ValueError('Full fine-tune and QLoRA cannot be combined')
    if a.qlora and not torch.cuda.is_available():raise RuntimeError('QLoRA requires compatible CUDA GPU and bitsandbytes')
    if a.epochs<=0 or a.max_length<=0 or a.batch_size<=0:raise ValueError('Training values must be positive')
    path=pathlib.Path(a.dataset)
    if not path.is_file():raise FileNotFoundError(path)
    if a.korean_policy:
        if not a.system_prompt or not a.approved_sha256:
            raise ValueError('Korean policy requires user prompt and approved SHA256')
        prompt_path=pathlib.Path(a.system_prompt)
        if not prompt_path.is_file(): raise FileNotFoundError(prompt_path)
        prompt=prompt_path.read_text(encoding='utf-8')
        digest=hashlib.sha256(prompt_path.read_bytes()).hexdigest()
        if not prompt.strip() or digest != a.approved_sha256:
            raise ValueError('System prompt missing or SHA256 approval mismatch')
        if not path.is_file(): raise FileNotFoundError(path)
        with path.open(encoding='utf-8') as source:
            count=0
            for line in source:
                if not line.strip():continue
                row=json.loads(line)
                text=row.get('text','')
                if not text.startswith('[SYSTEM]\\n'+prompt+'\\n[/SYSTEM]'):
                    raise ValueError('Dataset sample missing exact approved system prompt')
                if '[ASSISTANT ko-KR]' not in text:
                    raise ValueError('Dataset sample missing Korean target')
                count+=1
            if count==0: raise ValueError('No Korean training samples')
    ds=load_dataset('json',data_files=str(path),split='train')
    if 'text' not in ds.column_names:raise ValueError('JSONL must have a text field')
    tok=AutoTokenizer.from_pretrained(a.model,trust_remote_code=a.trust_remote_code)
    if tok.pad_token is None:tok.pad_token=tok.eos_token
    kwargs={'trust_remote_code':a.trust_remote_code}
    if a.qlora:
        from transformers import BitsAndBytesConfig
        kwargs['quantization_config']=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_compute_dtype=torch.float16)
        kwargs['device_map']='auto'
    model=AutoModelForCausalLM.from_pretrained(a.model,**kwargs)
    model.config.use_cache=False
    if not a.full_finetune:
        from peft import LoraConfig,get_peft_model,prepare_model_for_kbit_training
        if a.qlora:model=prepare_model_for_kbit_training(model)
        model=get_peft_model(model,LoraConfig(r=16,lora_alpha=32,lora_dropout=0.05,bias='none',task_type='CAUSAL_LM',target_modules='all-linear'))
    ds=ds.map(lambda batch:tok(batch['text'],truncation=True,max_length=a.max_length),batched=True,remove_columns=ds.column_names)
    args=TrainingArguments(output_dir=a.output,per_device_train_batch_size=a.batch_size,num_train_epochs=a.epochs,learning_rate=a.learning_rate,logging_steps=10,save_strategy='epoch',report_to='none',fp16=torch.cuda.is_available(),overwrite_output_dir=False)
    trainer=Trainer(model=model,args=args,train_dataset=ds,data_collator=DataCollatorForLanguageModeling(tok,mlm=False))
    trainer.train();trainer.save_model(a.output);tok.save_pretrained(a.output)
if __name__=='__main__':main()
