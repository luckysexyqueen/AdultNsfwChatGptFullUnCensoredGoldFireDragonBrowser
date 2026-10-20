const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region, x-supabase-api-version, x-client-platform, x-client-platform-version, x-client-runtime, x-client-runtime-version, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-sb-edge-region',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};
const GOOGLE_HOSTS = new Set(['www.google.com','www.google.co.jp']);
const MAX_HTML = 3000000;
export async function boundedText(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel(); throw Error('응답 크기 제한 초과');
  }
  if (!response.body) return '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size=0, text='';
  try {
    while (true) {
      const {done,value}=await reader.read(); if(done)break;
      size+=value.byteLength;
      if(size>limit) { await reader.cancel(); throw Error('응답 크기 제한 초과'); }
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  } finally { reader.releaseLock(); }
}
export function plain(value = '') {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, v => {
      const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
      if(named[v.toLowerCase()])return named[v.toLowerCase()];
      const n=v.toLowerCase().startsWith('&#x') ? parseInt(v.slice(3,-1),16) : parseInt(v.slice(2,-1),10);
      return n>0 && n<=0x10ffff && !(n>=0xd800 && n<=0xdfff) ? String.fromCodePoint(n) : '';
    }).replace(/\s+/g,' ').trim();
}
function safeLink(value) {
  try {
    const u = new URL(plain(value), 'https://www.google.com');
    const link = u.pathname === '/url' && GOOGLE_HOSTS.has(u.hostname)
      ? new URL(u.searchParams.get('q') || u.searchParams.get('url') || '') : u;
    if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) return null;
    if (/(^|\.)(google\.(com|co\.jp)|gstatic\.com)$/.test(link.hostname)) return null;
    return link.href;
  } catch { return null; }
}
export function googleResults(html) {
  const results = [], seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const heading = m[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)
      || m[2].match(/<div\b[^>]*class=["'][^"']*\bvvjwJb\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const url = safeLink(m[1]), title = heading && plain(heading[1]);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url); results.push({title:title.slice(0,500),url,snippet:''});
    if (results.length === 10) break;
  }
  return results;
}
async function fetchGoogle(fetcher, target, headers) {
  const signal=AbortSignal.timeout(10000);
  for(let redirects=0;redirects<=2;redirects++) {
    const u=new URL(target);
    if(u.protocol!=='https:' || !GOOGLE_HOSTS.has(u.hostname) || u.port || u.username || u.password || u.pathname!=='/search') throw Error('허용되지 않은 구글 리디렉션');
    const r=await fetcher(u.href,{headers,redirect:'manual',signal});
    if(![301,302,303,307,308].includes(r.status))return r;
    const location=r.headers.get('location');
    await r.body?.cancel();
    if(!location)throw Error('리디렉션 주소 누락');
    const next=new URL(location,u);
    // 리디렉션 후에도 검색어와 지역·언어 설정을 유지합니다.
    for(const [key,value] of u.searchParams)next.searchParams.set(key,value);
    target=next.href;
  }
  throw Error('구글 리디렉션 횟수 초과');
}
export function createHandler({fetcher = fetch, region = () => '', now = Date.now, renderGoogle = null} = {}) {
  let pendingProbe = null;
  async function egress() {
    if(pendingProbe)return pendingProbe;
    // 동시 검사만 합치며 이전 출구 IP를 다음 검색에 재사용하지 않습니다.
    pendingProbe=(async()=>{
      const info={executionRegion:region(),egressIp:null,egressCountry:null,japanEgressVerified:false,checkedAt:now()};
      try {
        const r=await fetcher('https://www.cloudflare.com/cdn-cgi/trace',{redirect:'error',signal:AbortSignal.timeout(6000)});
        if(!r.ok)throw Error('검사 실패');
        const trace=Object.fromEntries((await boundedText(r,16384)).trim().split('\n').filter(v=>v.includes('=')).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1).trim()];}));
        info.egressIp=trace.ip || null; info.egressCountry=trace.loc || null;
        info.japanEgressVerified=info.executionRegion==='ap-northeast-1' && trace.loc==='JP' && Boolean(trace.ip);
      } catch {info.error='출구 IP 검사에 실패했습니다.';}
      return info;
    })();
    try{return await pendingProbe;}finally{pendingProbe=null;}
  }
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:CORS});
  return async function handler(req) {
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
    if (!['GET','POST'].includes(req.method)) return json({error:'GET 또는 POST 요청을 사용하세요.'},405);
    let body = {};
    if (req.method === 'POST') {
      try { body = JSON.parse(await boundedText(req,8192)); } catch { return json({error:'8KB 이하의 올바른 JSON이 필요합니다.'},400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'JSON 객체가 필요합니다.'},400);
    }
    const u = new URL(req.url), action = u.searchParams.get('action') || body.action || 'search';
    if (!['status','search'].includes(action)) return json({error:'지원하지 않는 동작입니다.'},400);
    const input = u.searchParams.get('q') ?? body.query ?? body.q ?? '';
    if (typeof input !== 'string') return json({error:'검색어는 문자열이어야 합니다.'},400);
    const q = input.trim();
    if (action === 'search' && (!q || q.length > 300)) return json({error:'검색어는 1~300자로 입력하세요.'},400);
    const status = await egress();
    if (action === 'status') return json({...status,mode:renderGoogle?'managed-browser':'supabase-search',browserRenderingEnabled:Boolean(renderGoogle),vpnConnected:false});
    const searchUrl = 'https://www.google.co.jp/search?' + new URLSearchParams({q,gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0'});
    if (renderGoogle) {
      let rendered;
      try { rendered=await renderGoogle(q); } catch { rendered={error:'브라우저 검색 처리 실패',code:'GOOGLE_RENDER_SERVICE_ERROR'}; }
      if(rendered.error)return json({...status,egressIp:null,egressCountry:null,japanEgressVerified:false,edgeEgressIp:status.egressIp,engine:'google',fallback:false,query:q,searchUrl,...rendered},rendered.code==='GOOGLE_RENDER_NOT_CONFIGURED'?503:502);
      return json({...status,...rendered,query:q,searchUrl,vpnConnected:false});
    }
    if (!status.japanEgressVerified) return json({...status,error:'일본 출구 IP를 확인하지 못해 일본 IP 검색을 실행하지 않았습니다.',searchUrl},503);
    const headers = {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36','Accept-Language':'ko-KR,ko;q=0.9'};
    const failures = [];
    // 구글의 국가 도메인 통합에 대응해 표준 도메인을 먼저 사용합니다.
    const targets = [
      'https://www.google.com/search?' + new URLSearchParams({q,gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0',gbv:'1'}),
      'https://www.google.com/search?' + new URLSearchParams({q,gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0',gbv:'1',udm:'14',client:'firefox-b-d'}),
    ];
    for (const [attempt, target] of targets.entries()) {
      try {
        const requestHeaders = attempt === 1 ? {...headers, 'User-Agent':'Lynx/2.9.2 libwww-FM/2.14 SSL-MM/1.4.1'} : headers;
        const r = await fetchGoogle(fetcher,target,requestHeaders);
        if (!r.ok) { await r.body?.cancel(); failures.push({host:new URL(target).hostname,status:r.status}); continue; }
        const text = await boundedText(r,MAX_HTML);
        const results = googleResults(text);
        if (!results.length) {
          const reason = /captcha|\/sorry\/|unusual traffic/i.test(text) ? '구글 자동화 요청 확인 화면' : /enablejs|enable javascript/i.test(text) ? '구글 자바스크립트 실행 요구' : '검색 결과 없음 또는 지원하지 않는 구글 응답 형식';
          failures.push({host:new URL(target).hostname,status:r.status,reason}); continue;
        }
        return json({...status,query:q,engine:'google',results,searchUrl,fallback:false,vpnConnected:false});
      } catch { failures.push({host:new URL(target).hostname,reason:'구글 연결 실패·시간 초과·지원하지 않는 리디렉션 또는 응답 크기 초과'}); }
    }
    return json({...status,query:q,engine:'google',fallback:false,results:[],searchUrl,error:'구글 검색 결과를 받지 못했습니다.',code:failures.some(f=>f.reason==='구글 자바스크립트 실행 요구')?'GOOGLE_JAVASCRIPT_REQUIRED':'GOOGLE_UPSTREAM_UNAVAILABLE',upstreamFailures:failures},502);
  };
}
