const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-sb-edge-region',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};
export function plain(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g,
    v => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '})[v]).trim();
}
function safeLink(value) {
  try {
    const u = new URL(plain(value), 'https://www.google.co.jp');
    const link = u.pathname === '/url' && u.hostname === 'www.google.co.jp'
      ? new URL(u.searchParams.get('q') || u.searchParams.get('url') || '') : u;
    if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) return null;
    if (/(^|\.)(google\.(com|co\.jp)|gstatic\.com|bing\.com)$/.test(link.hostname)) return null;
    return link.href;
  } catch { return null; }
}
export function googleResults(html) {
  const results = [], seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const heading = m[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    const url = safeLink(m[1]);
    if (!heading || !url || seen.has(url)) continue;
    seen.add(url); results.push({title:plain(heading[1]),url,snippet:''});
    if (results.length === 10) break;
  }
  return results;
}
export function createHandler({fetcher = fetch, region = () => '', now = Date.now} = {}) {
  let cached = null;
  async function egress() {
    if (cached && now() - cached.checkedAt < 30000) return cached;
    const info = {executionRegion:region(),egressIp:null,egressCountry:null,japanEgressVerified:false,checkedAt:now()};
    try {
      const r = await fetcher('https://www.cloudflare.com/cdn-cgi/trace', {redirect:'error',signal:AbortSignal.timeout(6000)});
      if (!r.ok) throw Error('검사 실패');
      const trace = Object.fromEntries((await r.text()).trim().split('\n').map(v => {const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
      info.egressIp = trace.ip || null;
      info.egressCountry = trace.loc || null;
      info.japanEgressVerified = info.executionRegion === 'ap-northeast-1' && trace.loc === 'JP' && Boolean(trace.ip);
    } catch { info.error = '출구 IP 검사에 실패했습니다.'; }
    cached = info;
    return info;
  }
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:CORS});
  return async function handler(req) {
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
    if (!['GET','POST'].includes(req.method)) return json({error:'GET 또는 POST 요청을 사용하세요.'},405);
    let body = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { return json({error:'올바른 JSON이 필요합니다.'},400); }
    }
    const u = new URL(req.url), action = u.searchParams.get('action') || body.action || 'search';
    if (!['status','search'].includes(action)) return json({error:'지원하지 않는 동작입니다.'},400);
    const q = String(u.searchParams.get('q') || body.query || body.q || '').trim();
    if (action === 'search' && (!q || q.length > 300)) return json({error:'검색어는 1~300자로 입력하세요.'},400);
    const status = await egress();
    if (action === 'status') return json({...status,mode:'supabase-search',vpnConnected:false});
    const searchUrl = 'https://www.google.co.jp/search?' + new URLSearchParams({q,gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0'});
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
        const r = await fetcher(target,{headers:requestHeaders,redirect:'error',signal:AbortSignal.timeout(9000)});
        if (!r.ok) { failures.push({host:new URL(target).hostname,status:r.status}); continue; }
        const text = await r.text();
        if (text.length > 3000000) throw Error('응답이 너무 큽니다.');
        const results = googleResults(text);
        if (!results.length) {
          const reason = /captcha|\/sorry\/|unusual traffic/i.test(text) ? '구글 자동화 요청 확인 화면' : /enablejs|enable javascript/i.test(text) ? '구글 자바스크립트 실행 요구' : '검색 결과 없음 또는 지원하지 않는 구글 응답 형식';
          failures.push({host:new URL(target).hostname,status:r.status,reason}); continue;
        }
        return json({...status,query:q,engine:'google',results,searchUrl,fallback:false,vpnConnected:false});
      } catch { failures.push({host:new URL(target).hostname,reason:'구글 요청 실패 또는 리디렉션'}); }
    }
    return json({...status,query:q,engine:'google',fallback:false,results:[],searchUrl,error:'구글 검색 결과를 받지 못했습니다.',upstreamFailures:failures},502);
  };
}
