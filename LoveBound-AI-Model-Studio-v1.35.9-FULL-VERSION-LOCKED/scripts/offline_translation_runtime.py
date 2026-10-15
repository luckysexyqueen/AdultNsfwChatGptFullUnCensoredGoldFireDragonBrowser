#!/usr/bin/env python3
"""Offline exact-match translator using a previously approved local bundle; no network."""
import argparse,json,pathlib
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--bundle',required=True);p.add_argument('--text',required=True);p.add_argument('--source',required=True);p.add_argument('--target',choices=['ko-KR','en-US'],required=True)
a=p.parse_args()
rows=json.loads((pathlib.Path(a.bundle)/'translation_pairs.json').read_text(encoding='utf-8'))
found=[r['target'] for r in rows if r['source']==a.text and r['source_lang']==a.source and r['target_lang']==a.target]
print(json.dumps({'status':'translated' if len(set(found))==1 else 'deferred_for_review','translation':found[0] if len(set(found))==1 else None},ensure_ascii=False))
