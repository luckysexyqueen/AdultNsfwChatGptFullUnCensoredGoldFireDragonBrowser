import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,googleResults} from './google.mjs';

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
test('구글만 호출하고 실패해도 다른 검색엔진으로 전환하지 않음',async()=>{
  const calls=[];
  const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>{
    calls.push(url);
    return url.includes('cloudflare.com') ? trace('JP') : new Response('확인 화면',{status:429});
  }});
  const r=await h(request('q=Tokyo&url=https://untrusted.test/'));
  const d=await r.json();
  assert.equal(r.status,502);assert.equal(d.engine,'google');assert.equal(d.fallback,false);
  assert.deepEqual(calls.map(v=>new URL(v).hostname),['www.cloudflare.com','www.google.com','www.google.com']);
});
test('표준 구글 도메인에서 일본 지역 결과를 반환함',async()=>{
  const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>{
    if(url.includes('cloudflare.com'))return trace('JP');
    const u=new URL(url);assert.equal(u.searchParams.get('gl'),'jp');assert.equal(u.searchParams.get('hl'),'ko');
    return new Response('<a href="https://example.org/"><h3>도쿄</h3></a>');
  }});
  const d=await (await h(request('q=Tokyo'))).json();
  assert.equal(d.engine,'google');assert.equal(d.results[0].title,'도쿄');
});
test('검색 결과의 스크립트 주소 및 중복 링크를 제외함',()=>{
  const html='<a href="javascript:alert(1)"><h3>실행</h3></a><a href="/url?q=https%3A%2F%2Fexample.org%2F"><h3>제목 &amp; 이름</h3></a><a href="https://example.org/"><h3>중복</h3></a>';
  assert.deepEqual(googleResults(html),[{title:'제목 & 이름',url:'https://example.org/',snippet:''}]);
});
test('사전 요청 및 잘못된 입력에는 외부 요청을 보내지 않음',async()=>{
  const h=createHandler({fetcher:async()=>{throw Error('외부 요청 금지');}});
  const r=await h(new Request('https://example.test/',{method:'OPTIONS'}));
  assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/authorization/);
  assert.equal((await h(request('q='))).status,400);
  assert.equal((await h(request('action=fetch&url=https://example.org'))).status,400);
});
test('널·배열·객체 검색어를 명확한 입력 오류로 반환함',async()=>{
 const h=createHandler({fetcher:async()=>{throw Error('호출 금지');}});
 for(const body of ['null','[]','{"query":{}}','{"query":123}']) {
  const r=await h(new Request('https://example.test/',{method:'POST',body}));
  assert.equal(r.status,400);
 }
});
test('표준 구글 리디렉션 링크와 모바일 제목을 읽음',()=>{
 const html='<a href="https://www.google.com/url?q=https%3A%2F%2Fexample.org%2F%3Fx%3D1%26y%3D2&amp;sa=U"><div class="BNeawe vvjwJb AP7Wnd">&#xB3C4;&#xCFC4;</div></a>';
 assert.equal(googleResults(html)[0]?.title,'도쿄');
 assert.equal(googleResults(html)[0]?.url,'https://example.org/?x=1&y=2');
});
test('구글 도메인 내부의 표준 검색 리디렉션만 따라감',async()=>{
 const calls=[];
 const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>{
  calls.push(String(url));
  if(String(url).includes('cloudflare.com'))return trace('JP');
  if(calls.length===2)return new Response(null,{status:302,headers:{location:'https://www.google.co.jp/search?q=Tokyo'}});
  return new Response('<a href="https://example.org/"><h3>도쿄</h3></a>');
 }});
 const r=await h(request('q=Tokyo'));assert.equal(r.status,200);
 assert.equal(new URL(calls[2]).hostname,'www.google.co.jp');
});
test('외부 주소로 향하는 리디렉션은 요청하지 않음',async()=>{
 const hosts=[];
 const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>{
  hosts.push(new URL(url).hostname);
  if(url.includes('cloudflare.com'))return trace('JP');
  return new Response(null,{status:302,headers:{location:'https://untrusted.test/search'}});
 }});
 assert.equal((await h(request('q=Tokyo'))).status,502);
 assert.ok(!hosts.includes('untrusted.test'));
});
test('일본 출구 검사 실패를 다음 요청에 재사용하지 않음',async()=>{
 let probes=0;
 const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async()=>trace(++probes===1?'KR':'JP')});
 assert.equal((await (await h(request('action=status'))).json()).japanEgressVerified,false);
 assert.equal((await (await h(request('action=status'))).json()).japanEgressVerified,true);
 assert.equal(probes,2);
});
test('큰 요청을 제한하고 구글의 실행 요구 화면을 명확히 구분함',async()=>{
 const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async url=>url.includes('cloudflare.com')?trace('JP'):new Response('<a href="/httpservice/retry/enablejs">Enable JavaScript</a>')});
 const large=await h(new Request('https://example.test/',{method:'POST',body:JSON.stringify({query:'x'.repeat(9000)})}));
 assert.equal(large.status,400);
 const r=await h(request('q=Tokyo'));assert.equal(r.status,502);
 assert.equal((await r.json()).code,'GOOGLE_JAVASCRIPT_REQUIRED');
});

import {createGoogleRenderer} from './browser-render.mjs';
test('브라우저 서비스는 활성화 설정과 토큰 없이 호출하지 않음',async()=>{
 let called=false;
 for(const config of [{enabled:false,token:'test'},{enabled:true,token:''}]){
  const render=createGoogleRenderer({...config,fetcher:async()=>{called=true;}});
  assert.equal((await render('도쿄')).code,'GOOGLE_RENDER_NOT_CONFIGURED');
 }
 assert.equal(called,false);
});
test('브라우저에는 일본의 고정 세션과 검색어를 분리해서 전달함',async()=>{
 const query='도쿄 "</script>"';
 const render=createGoogleRenderer({enabled:true,token:'test-token',fetcher:async(url,options)=>{
  const u=new URL(url),body=JSON.parse(options.body);
  assert.equal(u.hostname,'production-sfo.browserless.io');
  assert.equal(u.searchParams.get('proxyCountry'),'jp');assert.equal(u.searchParams.get('proxySticky'),'true');
  assert.equal(body.context.query,query);assert.equal(body.code.includes(query),false);
  return Response.json({egressIp:'203.0.113.1',egressCountry:'JP',japanEgressVerified:true,results:[{title:'도쿄',url:'https://example.org/'},{title:'잘못된 주소',url:'javascript:alert(1)'}]});
 }});
 const data=await render(query);assert.equal(data.results.length,1);assert.equal(data.engine,'google');assert.equal(data.egressSource,'browser-session');
});
test('브라우저의 일본 출구가 검증되지 않으면 성공으로 처리하지 않음',async()=>{
 const render=createGoogleRenderer({enabled:true,token:'test',fetcher:async()=>Response.json({egressIp:'203.0.113.1',egressCountry:'US',japanEgressVerified:true,results:[{title:'도쿄',url:'https://example.org/'}]})});
 assert.equal((await render('도쿄')).code,'BROWSER_EGRESS_NOT_JP');
});
test('브라우저 오류에는 토큰이나 서비스 내부 응답을 노출하지 않음',async()=>{
 const render=createGoogleRenderer({enabled:true,token:'test-secret',fetcher:async()=>new Response('test-secret',{status:401})});
 const data=await render('도쿄');assert.equal(data.code,'GOOGLE_RENDER_SERVICE_ERROR');assert.ok(!JSON.stringify(data).includes('test-secret'));
});
test('브라우저 모드의 결과에는 브라우저 출구를 사용함',async()=>{
 const h=createHandler({region:()=> 'ap-northeast-1',fetcher:async()=>trace('JP'),renderGoogle:async()=>({egressIp:'203.0.113.2',egressCountry:'JP',japanEgressVerified:true,engine:'google',results:[{title:'도쿄',url:'https://example.org/'}]})});
 const data=await (await h(request('q=도쿄'))).json();assert.equal(data.egressIp,'203.0.113.2');assert.equal(data.engine,'google');
});
