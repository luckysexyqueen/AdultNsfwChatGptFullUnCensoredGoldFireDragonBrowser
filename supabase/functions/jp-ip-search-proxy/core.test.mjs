import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,googleResults,bingResults} from './core.mjs';

const request = query => new Request('https://example.test/?'+query);
const trace = country => new Response('ip=203.0.113.1\nloc='+country+'\ncolo=NRT\n');
test('일본 출구를 확인하지 못하면 검색 요청을 보내지 않음',async()=>{
  const calls=[];
  const handler=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>{calls.push(url);return trace('KR');}});
  const r=await handler(request('q=test'));
  assert.equal(r.status,503);assert.equal(calls.length,1);
  assert.equal((await r.json()).japanEgressVerified,false);
});
test('일본 위치라도 실행 지역이 다르면 검증 성공으로 표시하지 않음',async()=>{
  const h=createHandler({region:()=> 'us-east-1',fetcher:async()=>trace('JP')});
  assert.equal((await (await h(request('action=status'))).json()).japanEgressVerified,false);
});
test('구글 실패 시 고정된 빙 검색 주소에서 결과를 가져옴',async()=>{
  const calls=[];
  const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>{
    calls.push(url);
    if(url.includes('cloudflare.com'))return trace('JP');
    if(url.includes('google.co.jp'))return new Response('확인 화면',{status:429});
    return new Response('<rss><channel><item><title>도쿄</title><link>https://example.org/</link><description>검색 결과</description></item></channel></rss>');
  }});
  const r=await h(request('q=Tokyo&url=https://untrusted.test/'));
  const d=await r.json();
  assert.equal(r.status,200);assert.equal(d.engine,'bing');assert.equal(d.fallback,true);
  assert.equal(d.results[0].title,'도쿄');
  assert.deepEqual(calls.map(v=>new URL(v).hostname),['www.cloudflare.com','www.google.co.jp','www.bing.com']);
});
test('검색 결과의 스크립트 주소 및 중복 링크를 제외함',()=>{
  const html='<a href="javascript:alert(1)"><h3>실행</h3></a><a href="/url?q=https%3A%2F%2Fexample.org%2F"><h3>제목 &amp; 이름</h3></a><a href="https://example.org/"><h3>중복</h3></a>';
  assert.deepEqual(googleResults(html),[{title:'제목 & 이름',url:'https://example.org/',snippet:''}]);
  assert.equal(bingResults('<item><title>실행</title><link>javascript:alert(1)</link></item>').length,0);
});
test('사전 요청 및 잘못된 입력에는 외부 요청을 보내지 않음',async()=>{
  const h=createHandler({fetcher:async()=>{throw Error('외부 요청 금지');}});
  const r=await h(new Request('https://example.test/',{method:'OPTIONS'}));
  assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/authorization/);
  assert.equal((await h(request('q='))).status,400);
  assert.equal((await h(request('action=fetch&url=https://example.org'))).status,400);
});
