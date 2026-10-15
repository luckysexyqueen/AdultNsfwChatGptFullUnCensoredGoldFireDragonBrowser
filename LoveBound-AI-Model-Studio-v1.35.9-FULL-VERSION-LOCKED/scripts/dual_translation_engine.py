#!/usr/bin/env python3
"""Google Cloud Translation + NAVER Cloud Papago orchestrator. No API calls unless explicitly enabled."""
import argparse, datetime, hashlib, html, json, os, pathlib, urllib.parse, urllib.request, urllib.error

GOOGLE='https://translation.googleapis.com/language/translate/v2'
PAPAGO='https://papago.apigw.ntruss.com/nmt/v1/translation'

def request(url, data, headers):
    req=urllib.request.Request(url, data=urllib.parse.urlencode(data).encode('utf-8'), headers=headers, method='POST')
    with urllib.request.urlopen(req,timeout=15) as r:
        return json.load(r)

def google(text,source,target):
    key=os.environ.get('GOOGLE_TRANSLATE_API_KEY')
    if not key: raise ValueError('Google API key missing')
    body={'q':text,'target':target,'format':'text','key':key}
    if source!='auto': body['source']=source
    res=request(GOOGLE,body,{'Content-Type':'application/x-www-form-urlencoded'})
    return html.unescape(res['data']['translations'][0]['translatedText'])

def papago(text,source,target):
    cid=os.environ.get('PAPAGO_CLIENT_ID'); secret=os.environ.get('PAPAGO_CLIENT_SECRET')
    if not cid or not secret: raise ValueError('Papago credentials missing')
    res=request(PAPAGO,{'text':text,'source':source,'target':target},{'X-NCP-APIGW-API-KEY-ID':cid,'X-NCP-APIGW-API-KEY':secret,'Content-Type':'application/x-www-form-urlencoded'})
    return res['message']['result']['translatedText']

PROVIDERS={'google':google,'papago':papago}

def translate(text,target='ko',source='auto',mode='fallback',state=None,enabled=False,allow_paid=False,queue=None):
    if target not in ('ko','en'): raise ValueError('Only Korean or US-English target permitted')
    if not isinstance(text,str) or not text.strip(): raise ValueError('Nonempty text required')
    if len(text)>4500: return defer(text,target,source,'request_too_long',queue)
    if not enabled or not allow_paid:
        return defer(text,target,source,'external_apis_not_authorized',queue)
    if mode not in ('fallback','alternate','compare','google','papago'): raise ValueError('Unknown mode')
    order=['google','papago']
    if mode=='papago':order=['papago']
    elif mode=='google':order=['google']
    elif mode=='alternate':
        index=state.get('next',0) if state is not None else 0
        order=['google','papago'] if index%2==0 else ['papago','google']
        if state is not None: state['next']=index+1
    results=[]; errors=[]
    for name in order:
        try:
            value=PROVIDERS[name](text,source,target)
            if not isinstance(value,str) or not value.strip(): raise ValueError('Empty translation')
            results.append({'provider':name,'text':value})
            if mode!='compare':break
        except Exception as e:
            errors.append({'provider':name,'error':str(e)[:180]})
    if not results:return defer(text,target,source,'providers_failed',queue,errors)
    if mode=='compare' and len(results)==2 and results[0]['text']!=results[1]['text']:
        return defer(text,target,source,'provider_disagreement',queue,errors,results)
    return {'status':'translated_unverified','translation':results[0]['text'],'provider':results[0]['provider'],'alternatives':results[1:],'errors':errors,'target_locale':'ko-KR' if target=='ko' else 'en-US'}

def defer(text,target,source,reason,queue,errors=None,alternatives=None):
    item={'status':'deferred','reason':reason,'target_locale':'ko-KR' if target=='ko' else 'en-US','source_language':source,'text':text,'errors':errors or [],'alternatives':alternatives or []}
    if queue:
        dest=pathlib.Path(queue);dest.parent.mkdir(parents=True,exist_ok=True)
        with dest.open('a',encoding='utf-8') as f:f.write(json.dumps(item,ensure_ascii=False)+'\n')
    return item

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--text',required=True);ap.add_argument('--source',default='auto')
    ap.add_argument('--target',choices=['ko','en'],default='ko')
    ap.add_argument('--mode',choices=['fallback','alternate','compare','google','papago'],default='fallback')
    ap.add_argument('--enable-external',action='store_true');ap.add_argument('--allow-billable',action='store_true')
    ap.add_argument('--queue',default='translation_deferred.jsonl');ap.add_argument('--state-file')
    args=ap.parse_args();state={}
    if args.state_file:
        try:state=json.loads(pathlib.Path(args.state_file).read_text(encoding='utf-8'))
        except FileNotFoundError:pass
    result=translate(args.text,args.target,args.source,args.mode,state,args.enable_external,args.allow_billable,args.queue)
    if args.state_file and args.mode=='alternate' and args.enable_external and args.allow_billable:
        pathlib.Path(args.state_file).write_text(json.dumps(state),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
