#!/usr/bin/env python3
"""Language gate for training datasets and chat; ambiguous translations go to review queue.

Offline by default. Supply trusted detector/translator callables to enable multilingual
translation. Never selects/downloads a model or modifies original data.
"""
import argparse
import importlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

ALLOWED = ('ko-KR', 'en-US')

def normalize(code):
    code = str(code or '').strip().replace('_', '-').lower()
    if code == 'ko' or code.startswith('ko-'): return 'ko-KR'
    if code == 'en' or code.startswith('en-'): return 'en-US'
    return code or 'und'

def conservative_detect(text):
    if re.search(r'[가-힣ㄱ-ㅎㅏ-ㅣ]', text):
        if re.search(r'[\u3040-\u30ff\u3400-\u9fff\u0400-\u04ff]', text):
            return 'und', 0.0
        return 'ko-KR', 0.9
    if re.fullmatch(r'[\x00-\x7f]*', text) and re.search('[A-Za-z]', text):
        return 'en-US', 0.6
    return 'und', 0.0

def load_adapter(spec):
    module, sep, name = spec.partition(':')
    if not sep or not module or not name: raise ValueError('Expected MODULE:FUNCTION')
    fn = getattr(importlib.import_module(module), name)
    if not callable(fn): raise TypeError('Adapter is not callable')
    return fn

def gate(text, stage, detector=None, translator=None, target='ko-KR', threshold=0.85):
    if stage not in ('training', 'chat_input', 'chat_output'):
        raise ValueError('Unsupported stage')
    if target not in ALLOWED: raise ValueError('Unsupported target')
    if not isinstance(text, str) or not text.strip():
        return {'status':'deferred','reason':'empty_or_invalid_text','text':None}
    try:
        raw = detector(text) if detector else conservative_detect(text)
        if isinstance(raw, (tuple, list)) and len(raw) == 2:
            language, confidence = raw
        elif isinstance(raw, dict):
            language, confidence = raw.get('language'), raw.get('confidence', 0)
        else:
            language, confidence = raw, 0
        language, confidence = normalize(language), float(confidence)
    except Exception as exc:
        return {'status':'deferred','reason':'detection_failed','detail':str(exc),'text':None}
    common={'stage':stage,'source_language':language,'confidence':confidence,'target_language':target}
    if language in ALLOWED and confidence >= threshold:
        return dict(common, status='accepted', text=text)
    if language in ALLOWED:
        return dict(common, status='deferred', reason='uncertain_language_detection', text=None)
    if language == 'und' or confidence < threshold:
        return dict(common, status='deferred', reason='unknown_or_ambiguous_language', text=None)
    if not translator:
        return dict(common, status='deferred', reason='translator_not_configured', text=None)
    try:
        translated = translator(text, language, target)
        if isinstance(translated, dict):
            confidence_out = float(translated.get('confidence', 0))
            value = translated.get('text')
        else:
            confidence_out, value = 0.0, translated
        if not isinstance(value, str) or not value.strip() or confidence_out < threshold:
            return dict(common, status='deferred', reason='translation_unverified_or_low_confidence', text=None)
        # Verify output language with detector; no silent acceptance of an unverified translation.
        verify = detector(value) if detector else conservative_detect(value)
        if isinstance(verify, dict): vlang, vconf = verify.get('language'), verify.get('confidence', 0)
        elif isinstance(verify, (tuple, list)) and len(verify)==2: vlang, vconf = verify
        else: vlang, vconf = verify, 0
        if normalize(vlang) != target or float(vconf) < threshold:
            return dict(common, status='deferred', reason='translated_output_not_verified', text=None)
        return dict(common, status='translated', text=value, translation_confidence=confidence_out)
    except Exception as exc:
        return dict(common, status='deferred', reason='translation_failed', detail=str(exc), text=None)

def process_jsonl(source, accepted, deferred, stage, detector=None, translator=None, target='ko-KR', threshold=0.85):
    if source.resolve() in (accepted.resolve(), deferred.resolve()) or accepted.resolve() == deferred.resolve():
        raise ValueError('Input and output paths must be distinct')
    if accepted.exists() or deferred.exists():
        raise FileExistsError('Refusing to overwrite existing outputs')
    accepted.parent.mkdir(parents=True, exist_ok=True)
    deferred.parent.mkdir(parents=True, exist_ok=True)
    counts={'accepted':0,'translated':0,'deferred':0}
    with source.open(encoding='utf-8') as inp, accepted.open('x',encoding='utf-8') as good, deferred.open('x',encoding='utf-8') as queue:
        for line_number, line in enumerate(inp, 1):
            if not line.strip(): continue
            try:
                record=json.loads(line)
                if not isinstance(record, dict) or not isinstance(record.get('text'), str):
                    raise ValueError('Expected JSON object with text string')
                result=gate(record['text'],stage,detector,translator,target,threshold)
            except Exception as exc:
                record={'raw_line':line.rstrip('\n')}
                result={'status':'deferred','reason':'invalid_record','detail':str(exc),'text':None}
            status=result['status']
            counts[status]+=1
            if status=='deferred':
                queue.write(json.dumps({'id':str(uuid.uuid4()),'line':line_number,'created_at':datetime.now(timezone.utc).isoformat(),
                    'review_status':'pending','source_record':record,'analysis':result},ensure_ascii=False)+'\n')
            else:
                output=dict(record)
                output['text']=result['text']
                output['language_gate']={k:v for k,v in result.items() if k!='text'}
                good.write(json.dumps(output,ensure_ascii=False)+'\n')
    return counts

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input',required=True,help='UTF-8 JSONL, each record has a text field')
    p.add_argument('--accepted',required=True)
    p.add_argument('--deferred',required=True)
    p.add_argument('--stage',choices=['training','chat_input','chat_output'],required=True)
    p.add_argument('--target',choices=ALLOWED,default='ko-KR')
    p.add_argument('--detector',help='Trusted MODULE:FUNCTION; returns (language, confidence)')
    p.add_argument('--translator',help='Trusted MODULE:FUNCTION; returns {text, confidence}')
    p.add_argument('--threshold',type=float,default=0.85)
    a=p.parse_args()
    if not 0 <= a.threshold <= 1: p.error('threshold must be between 0 and 1')
    stats=process_jsonl(Path(a.input),Path(a.accepted),Path(a.deferred),a.stage,
        load_adapter(a.detector) if a.detector else None,
        load_adapter(a.translator) if a.translator else None,a.target,a.threshold)
    print(json.dumps(stats,ensure_ascii=False))
if __name__=='__main__': main()
