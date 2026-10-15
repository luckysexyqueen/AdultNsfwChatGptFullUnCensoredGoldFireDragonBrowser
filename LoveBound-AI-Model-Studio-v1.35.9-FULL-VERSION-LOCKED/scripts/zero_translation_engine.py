#!/usr/bin/env python3
"""Dependency-free, offline, extensible phrase translator. Not a neural MT system."""
import argparse
import json
import re
from pathlib import Path

PHRASES = {
    'en-US': {'hello':'안녕하세요','hello.':'안녕하세요.','thank you':'감사합니다','thank you.':'감사합니다.','good morning':'좋은 아침입니다','goodbye':'안녕히 가세요','how are you?':'어떻게 지내세요?','yes':'네','no':'아니요','i love you':'사랑해요'},
    'ja': {'こんにちは':'안녕하세요','ありがとう':'감사합니다','おはようございます':'좋은 아침입니다','さようなら':'안녕히 가세요','はい':'네','いいえ':'아니요'},
    'zh': {'你好':'안녕하세요','谢谢':'감사합니다','早上好':'좋은 아침입니다','再见':'안녕히 가세요','是':'네','不是':'아니요'},
    'fr': {'bonjour':'안녕하세요','merci':'감사합니다','au revoir':'안녕히 가세요'},
    'es': {'hola':'안녕하세요','gracias':'감사합니다','adiós':'안녕히 가세요'},
    'de': {'hallo':'안녕하세요','danke':'감사합니다','auf wiedersehen':'안녕히 가세요'}
}
KO_EN = {'안녕하세요':'Hello','감사합니다':'Thank you','좋은 아침입니다':'Good morning','안녕히 가세요':'Goodbye','어떻게 지내세요?':'How are you?','네':'Yes','아니요':'No','사랑해요':'I love you'}

def detect(text):
    if re.search(r'[가-힣ㄱ-ㅎㅏ-ㅣ]',text): return 'ko-KR'
    if re.search(r'[ぁ-ゟ゠-ヿ]',text): return 'ja'
    if re.search(r'[一-鿿]',text): return 'zh'  # ambiguous with Japanese kanji; caller can override
    if re.fullmatch(r'[\x00-\x7f]*',text) and re.search(r'[A-Za-z]',text): return 'und' # ASCII is not proof of English
    return 'und'

def translate(text, source='auto', target='ko-KR', dictionary=None):
    if target not in ('ko-KR','en-US'): raise ValueError('target must be ko-KR or en-US')
    source = detect(text) if source == 'auto' else source
    if source == target: return {'status':'pass','text':text,'source':source,'target':target}
    if source == 'ko-KR' and target == 'en-US': candidate=KO_EN.get(text.strip())
    else:
        phrases=dict(PHRASES.get(source,{}))
        if dictionary: phrases.update(dictionary.get(source,{}))
        candidate=phrases.get(text.strip().lower() if source in ('en-US','fr','es','de') else text.strip())
        if candidate and target=='en-US': candidate=KO_EN.get(candidate)
    if candidate:
        return {'status':'translated_phrase_only','text':candidate,'source':source,'target':target,'quality':'dictionary_exact_match_unverified'}
    return {'status':'deferred','text':None,'source':source,'target':target,'reason':'unknown_language_or_phrase'}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--text',required=True)
    p.add_argument('--source',default='auto')
    p.add_argument('--target',choices=['ko-KR','en-US'],default='ko-KR')
    p.add_argument('--dictionary',help='optional local JSON mapping source language to exact phrases')
    p.add_argument('--queue',help='append deferred work as JSONL')
    a=p.parse_args()
    dic=json.loads(Path(a.dictionary).read_text(encoding='utf-8')) if a.dictionary else None
    result=translate(a.text,a.source,a.target,dic)
    if result['status']=='deferred' and a.queue:
        path=Path(a.queue);path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('a',encoding='utf-8') as f:f.write(json.dumps({'original':a.text,**result},ensure_ascii=False)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
