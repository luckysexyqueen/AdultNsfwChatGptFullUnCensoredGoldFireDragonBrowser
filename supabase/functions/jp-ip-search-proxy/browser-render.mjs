import { boundedText } from './google.mjs';

// 토큰과 명시적인 활성화 설정이 있을 때만 관리형 브라우저를 호출합니다.
export async function googleBrowserSession({page, context}) {
  const allowed = host => /(^|\.)(google\.com|google\.co\.jp|gstatic\.com|googleusercontent\.com)$/.test(host) || host === 'www.cloudflare.com';
  await page.setRequestInterception(true);
  page.on('request', request => {
    try {
      const url=new URL(request.url());
      if(url.protocol==='https:' && allowed(url.hostname) && !['image','media','font'].includes(request.resourceType()))void request.continue();
      else void request.abort();
    } catch {void request.abort();}
  });
  await page.setExtraHTTPHeaders({'Accept-Language':'ko-KR,ko;q=0.9'});
  const probe=await page.goto('https://www.cloudflare.com/cdn-cgi/trace',{waitUntil:'domcontentloaded',timeout:12000});
  if(!probe || !probe.ok())return {data:{error:'일본 출구 검사 실패',code:'BROWSER_EGRESS_UNAVAILABLE'},type:'application/json'};
  const trace=Object.fromEntries((await probe.text()).trim().split('\n').filter(line=>line.includes('=')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim()];}));
  const egress={egressIp:trace.ip || null,egressCountry:trace.loc || null,japanEgressVerified:trace.loc==='JP' && Boolean(trace.ip)};
  if(!egress.japanEgressVerified)return {data:{...egress,error:'브라우저 출구가 일본으로 확인되지 않았습니다.',code:'BROWSER_EGRESS_NOT_JP'},type:'application/json'};
  const url=new URL('https://www.google.com/search');
  url.search=new URLSearchParams({q:context.query,gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0',udm:'14'}).toString();
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForSelector('a h3',{timeout:12000}).catch(()=>{});
  const pageUrl=new URL(page.url());
  if(!['www.google.com','www.google.co.jp'].includes(pageUrl.hostname) || pageUrl.pathname!=='/search') {
    return {data:{...egress,error:'구글 확인 또는 동의 화면이 표시됐습니다.',code:'GOOGLE_MANUAL_VERIFICATION_REQUIRED'},type:'application/json'};
  }
  const results=await page.$$eval('a h3', nodes => {
    const results=[],seen=new Set();
    for(const node of nodes) {
      const anchor=node.closest('a'),title=(node.textContent || '').trim();
      try {
        const parsed=new URL(anchor.href);
        const target=parsed.pathname==='/url' && /(^|\.)google\.(com|co\.jp)$/.test(parsed.hostname)
          ? new URL(parsed.searchParams.get('q') || parsed.searchParams.get('url')) : parsed;
        if(!title || !['https:','http:'].includes(target.protocol) || target.username || target.password || /(^|\.)google\.(com|co\.jp)$/.test(target.hostname) || seen.has(target.href))continue;
        seen.add(target.href);results.push({title:title.slice(0,500),url:target.href,snippet:''});
        if(results.length===10)break;
      } catch {}
    }
    return results;
  });
  return {data:{...egress,results,engine:'google',fallback:false,...(!results.length?{error:'구글 검색 결과가 없거나 확인 화면이 표시됐습니다.',code:'GOOGLE_RENDER_EMPTY'}:{})},type:'application/json'};
}

export function createGoogleRenderer({enabled=false,token='',fetcher=fetch}={}) {
  return async function render(query) {
    if(!enabled || !token)return {error:'관리형 브라우저의 활성화 설정과 인증 토큰이 필요합니다.',code:'GOOGLE_RENDER_NOT_CONFIGURED'};
    const endpoint=new URL('https://production-sfo.browserless.io/function');
    endpoint.search=new URLSearchParams({token,proxy:'residential',proxyCountry:'jp',proxySticky:'true'}).toString();
    try {
      const response=await fetcher(endpoint.href,{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(65000),
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:'export default '+googleBrowserSession.toString(),context:{query}}),
      });
      if(!response.ok) {await response.body?.cancel();return {error:'관리형 브라우저 인증·할당량 또는 서비스 응답 오류',code:'GOOGLE_RENDER_SERVICE_ERROR'};}
      const text=await boundedText(response,100000);
      if(text.length>100000)return {error:'관리형 브라우저 응답 크기 초과',code:'GOOGLE_RENDER_INVALID_RESPONSE'};
      const payload=JSON.parse(text), data=payload.data && typeof payload.data==='object'?payload.data:payload;
      if(data.error)return {error:String(data.error).slice(0,300),code:String(data.code || 'GOOGLE_RENDER_FAILED')};
      if(data.japanEgressVerified!==true || data.egressCountry!=='JP' || typeof data.egressIp!=='string' || !data.egressIp)return {error:'관리형 브라우저의 일본 출구 검증 실패',code:'BROWSER_EGRESS_NOT_JP'};
      const results=[];
      for(const item of Array.isArray(data.results)?data.results.slice(0,10):[]) {
        try {
          const url=new URL(item.url);
          if(!['https:','http:'].includes(url.protocol) || url.username || url.password || typeof item.title!=='string')continue;
          results.push({title:item.title.slice(0,500),url:url.href,snippet:''});
        } catch {}
      }
      if(!results.length)return {error:'구글 검색 결과가 없습니다.',code:'GOOGLE_RENDER_EMPTY'};
      return {egressIp:data.egressIp,egressCountry:'JP',japanEgressVerified:true,engine:'google',fallback:false,results,egressSource:'browser-session'};
    } catch {return {error:'관리형 브라우저 연결 실패 또는 시간 초과',code:'GOOGLE_RENDER_SERVICE_ERROR'};}
  };
}
