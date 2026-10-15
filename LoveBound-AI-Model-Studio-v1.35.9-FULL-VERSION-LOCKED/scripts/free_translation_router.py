#!/usr/bin/env python3
"""Zero-billing translation router. No paid API, no model auto-download.

Optional providers: preinstalled Argos Translate (offline), unofficial Google web
via deep-translator (free but fragile), and a user-supplied free Papago adapter.
Papago does not have a guaranteed free official automation API.
"""
import argparse, importlib, json, os, re, sys
from pathlib import Path

ALLOWED = ('ko', 'en')

def detect(text):
    try:
        from langdetect import detect as language_detect
        return language_detect(text)
    except (ImportError, Exception):
        if re.search(r'[가-힣ㄱ-ㅎㅏ-ㅣ]', text): return 'ko'
        if text.isascii() and re.search('[A-Za-z]',text): return 'en'
        return 'und'

def argos(text, source, target):
    from argostranslate import translate
    languages=translate.get_installed_languages()
    src=next((l for l in languages if l.code==source),None)
    dst=next((l for l in languages if l.code==target),None)
    if not src or not dst: raise RuntimeError('Argos language package not installed')
    translator=src.get_translation(dst)
    if not translator: raise RuntimeError('Argos language pair unavailable')
    return translator.translate(text)

def google_free(text, source, target):
    from deep_translator import GoogleTranslator
    return GoogleTranslator(source=source if source!='und' else 'auto',target=target).translate(text)

def papago_free_adapter(text, source, target, adapter):
    if not adapter: raise RuntimeError('No verified free Papago adapter configured')
    module,sep,attr=adapter.partition(':')
    if not sep or not module or not attr: raise ValueError('Papago adapter must be MODULE:FUNCTION')
    fn=getattr(importlib.import_module(module),attr)
    return fn(text,source,target)

def run(text, target='ko', mode='fallback', allow_web=False, papago_adapter=None, state_file=None):
    source=detect(text)
    result={'source':source,'target':target,'mode':mode,'status':'deferred','provider':None,'text':None,'attempts':[],'billing':'paid APIs disabled'}
    if source in ALLOWED:
        result.update(status='allowed',text=text)
        return result
    if source=='und':
        result['reason']='language uncertain; defer instead of guessing'
        return result
    providers=['argos','google','papago']
    if mode=='google': providers=['google']
    elif mode=='papago': providers=['papago']
    elif mode=='offline': providers=['argos']
    elif mode=='alternate':
        state=Path(state_file) if state_file else None
        index=0
        if state and state.exists():
            try: index=int(state.read_text().strip())%len(providers)
            except (ValueError,OSError): pass
        providers=providers[index:]+providers[:index]
        if state:
            state.parent.mkdir(parents=True,exist_ok=True)
            state.write_text(str((index+1)%len(providers)))
    elif mode not in ('fallback','compare'):
        raise ValueError('invalid mode')
    candidates=[]
    for name in providers:
        try:
            if name=='argos': output=argos(text,source,target)
            elif name=='google':
                if not allow_web: raise RuntimeError('free web access not approved')
                output=google_free(text,source,target)
            else:
                if not allow_web: raise RuntimeError('Papago adapter access not approved')
                output=papago_free_adapter(text,source,target,papago_adapter)
            if not isinstance(output,str) or not output.strip(): raise RuntimeError('empty translation')
            candidates.append((name,output))
            result['attempts'].append({'provider':name,'status':'ok'})
            if mode!='compare': break
        except Exception as e:
            result['attempts'].append({'provider':name,'status':'unavailable','reason':str(e)})
    if not candidates:
        result['reason']='no free translation provider available; queued for later'
    elif mode=='compare' and len({t for _,t in candidates})>1:
        result['reason']='translations disagree; deferred for review'
        result['candidate_providers']=[n for n,_ in candidates]
    else:
        result.update(status='translated_unverified',provider=candidates[0][0],text=candidates[0][1])
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--text',required=True)
    ap.add_argument('--target',choices=['ko','en'],default='ko')
    ap.add_argument('--mode',choices=['offline','fallback','alternate','compare','google','papago'],default='fallback')
    ap.add_argument('--allow-free-web',action='store_true')
    ap.add_argument('--papago-adapter',help='Trusted user-supplied no-charge MODULE:FUNCTION')
    ap.add_argument('--state-file')
    ap.add_argument('--queue',default='translation_deferred.jsonl')
    a=ap.parse_args()
    result=run(a.text,a.target,a.mode,a.allow_free_web,a.papago_adapter,a.state_file)
    if result['status']=='deferred':
        with Path(a.queue).open('a',encoding='utf-8') as f:
            f.write(json.dumps({'original':a.text,**result},ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if result['status']=='deferred': sys.exit(2)

if __name__=='__main__': main()
