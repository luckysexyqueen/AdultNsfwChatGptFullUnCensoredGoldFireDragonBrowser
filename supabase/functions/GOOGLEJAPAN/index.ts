// [CORS 및 크레덴셜 허용 헤더 기본 구성]
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Credentials': 'true',
}

// 외부 import 오류를 방지한 최신 Deno.serve 표준 규격 가동
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const currentUrl = new URL(req.url)
    const proxyBaseUrl = `${currentUrl.origin}${currentUrl.pathname}`
    
    // 오직 'target' 파라미터 하나로 단어와 주소를 모두 수용
    let rawTarget = currentUrl.searchParams.get('target')

    // 1. target 파라미터가 없으면 UI 게이트웨이 화면(HTML) 로드
    // [안내] 사용자의 개인 외부 HTML에서 정상적으로 target을 주입해서 호출하면 이 섹션은 완벽하게 무시(스킵)됩니다.
    if (!rawTarget) {
      const htmlUI = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>초통합 일본 무검열 프록시 게이트웨이</title>
    <style>
        body { background-color: #202124; color: #e8eaed; font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { text-align: center; width: 100%; max-width: 650px; padding: 20px; }
        h1 { font-size: 2.3rem; margin-bottom: 8px; font-weight: 500; }
        h1 span:nth-child(1) { color: #4285F4; } h1 span:nth-child(2) { color: #EA4335; } h1 span:nth-child(3) { color: #FBBC05; } h1 span:nth-child(4) { color: #4285F4; } h1 span:nth-child(5) { color: #34A853; } h1 span:nth-child(6) { color: #EA4335; }
        .subtitle { color: #9aa0a6; font-size: 14px; margin-bottom: 30px; }
        .search-box { position: relative; width: 100%; }
        input[type="text"] { width: 100%; padding: 16px 25px; font-size: 16px; border: 1px solid #5f6368; border-radius: 30px; background-color: #303134; color: #e8eaed; outline: none; box-sizing: border-box; }
        .buttons { margin-top: 25px; }
        button { background-color: #303134; color: #e8eaed; border: 1px solid #303134; border-radius: 4px; padding: 12px 24px; font-size: 14px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
        button:hover { border: 1px solid #8ab4f8; color: #8ab4f8; }
        .info { margin-top: 40px; font-size: 12px; color: #9aa0a6; line-height: 1.6; }
    </style>
</head>
<body>
<div class="container">
    <h1><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span> <span>J</span><span>P</span></h1>
    <div class="subtitle">일본 초정밀 무검열 완벽 우회 게이트웨이 (Verbatim 적용)</div>
    <div class="search-box">
        <input type="text" id="search-input" placeholder="검색어 또는 우회할 웹사이트 주소(URL) 입력..." autofocus>
    </div>
    <div class="buttons">
        <button id="search-btn">무검열 프록시 가동</button>
    </div>
    <div class="info">
        단어 입력 시 <b>15개 결과 출력 + 도쿄 지역 강제 + 완전일치 검색</b> 연동 / 주소 입력 시 <b>차단 웹사이트 직접 우회</b>
    </div>
</div>
<script>
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    function doAction() {
        const value = searchInput.value.trim();
        if (!value) return;
        window.location.href = window.location.origin + window.location.pathname + "?target=" + encodeURIComponent(value);
    }
    searchBtn.addEventListener('click', doAction);
    searchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') doAction(); });
</script>
</body>
</html>
      `;
      return new Response(htmlUI, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } })
    }

    // 2. 입력값이 도메인 주소(URL)인지 판단하는 지능형 정규식 필터링
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?(\s*|\?.*)?\$/i;
    let finalTargetUrl = "";

    if (urlPattern.test(rawTarget) || rawTarget.startsWith('http://') || rawTarget.startsWith('https://')) {
      // [A] 주소 형태 -> 일반 웹사이트 직통 우회 서핑 모드 전환 (차단 사이트 접속)
      if (!rawTarget.startsWith('http://') && !rawTarget.startsWith('https://')) {
        rawTarget = 'https://' + rawTarget
      }
      finalTargetUrl = rawTarget
    } else {
      // [B] 일반 검색어 -> 🇯🇵 모든 무검열, 성인인증 우회, 초정밀 파라미터 세트 올인원 주입
      const googleUrl = new URL('https://google.co.jp')
      googleUrl.searchParams.append('q', rawTarget)
      
      // 초정밀 우회 및 출력 최적화 옵션
      googleUrl.searchParams.append('num', '15')          // 한 페이지에 결과 15개 노출
      googleUrl.searchParams.append('gl', 'jp')           // 지역: 일본 고정
      googleUrl.searchParams.append('hl', 'ko')           // 출력 언어: 한국어 메뉴 표기
      googleUrl.searchParams.append('safe', 'off')        // 세이프서치: 완전 해제
      googleUrl.searchParams.append('nfpr', '1')          // 자동 검색어 맞춤법 교정 차단
      googleUrl.searchParams.append('filter', '0')        // 유사/중복 검색 결과 생략 숨김 해제
      googleUrl.searchParams.append('pws', '0')           // 개인 검색 기록에 의한 결과 왜곡 방지
      googleUrl.searchParams.append('tbs', 'li:1')        // 완전 일치(Verbatim) 검색 모드 강제
      googleUrl.searchParams.append('near', 'Tokyo')      // 검색 가상 위치 기준: 일본 도쿄
      googleUrl.searchParams.append('gcr', 'jp')          // 국가 리다이렉션 방지 강제 고정
      
      // 성인 인증 및 연령 제한 무력화 옵션
      googleUrl.searchParams.append('desktop', 'true')    // 데스크톱 페이지 모드 고정
      googleUrl.searchParams.append('adult', 'true')      // 성인 콘텐츠 필터 오픈
      googleUrl.searchParams.append('age', '19')          // 가상 나이 19세 고정 전달
      googleUrl.searchParams.append('is_adult', 'Y')      // 성인 인증 여부 참(Y) 값 전달
      googleUrl.searchParams.append('adult_auth', 'true') // 성인 인증 완료 상태 세션 위장 주입
      
      finalTargetUrl = googleUrl.toString()
    }

    const targetUrl = new URL(finalTargetUrl)

    // 세션 유지 및 헤더 변조 우회를 위한 통합 Request 헤더 변환 조립
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('Host', targetUrl.host)
    
    // 💥 [패치 핵심] 사용자가 지정한 GoldFirefDragon 브라우저 식별자(User-Agent) 주입
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 GoldFirefDragon/135.0')
    requestHeaders.set('Accept-Language', 'ko-KR,ko;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6')

    // Supabase 해외 가상망 인프라 노드를 이용해 중계 배달 호출 실행
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: requestHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.blob() : undefined,
    })

    const contentType = response.headers.get('content-type') || ''
    const responseHeaders = new Headers(corsHeaders)
    
    // 타겟 사이트 및 구글 측이 발급한 동적 로그인 쿠키값 백업 복사 (세션 유지)
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      responseHeaders.set('Set-Cookie', setCookie)
    }
    if (contentType) {
      responseHeaders.set('Content-Type', contentType)
    }

    // 3. HTML 웹페이지 응답 수집 시 무한 서핑을 위한 내부 자원 주소 강제 재매핑 엔진 가동
    if (contentType.includes('text/html')) {
      let html = await response.text()

      const absoluteUrl = (urlStr: string) => {
        try { return new URL(urlStr, targetUrl.origin).toString() } catch { return urlStr }
      }

      // 페이지 내부 모든 href 및 src 속성값 가로채서 ?target= 주소로 결합
      html = html.replace(/(href|src)=["'](.*?)["']/g, (match, attribute, path) => {
        if (path.startsWith('javascript:') || path.startsWith('data:') || path.startsWith('#') || path === '') return match
        return `${attribute}="${proxyBaseUrl}?target=${encodeURIComponent(absoluteUrl(path))}"`
      })

      // 비동기 자바스크립트 네트워크 트래픽(Fetch/XHR) 강제 가로채기 커스텀 코어 인젝션
      const injectScript = `
        <script>
          (function() {
            const PROXY_URL = "${proxyBaseUrl}?target=";
            
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              if (typeof input === 'string' && !input.startsWith('data:') && !input.startsWith(PROXY_URL)) {
                input = PROXY_URL + encodeURIComponent(new URL(input, window.location.href).href);
              }
              return originalFetch(input, init);
            };

            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
              if (typeof url === 'string' && !url.startsWith('data:') && !url.startsWith(PROXY_URL)) {
                url = PROXY_URL + encodeURIComponent(new URL(url, window.location.href).href);
              }
              return originalOpen.apply(this, [method, url, ...args]);
            };
          })();
        </script>
      `
      html = html.replace('<head>', `<head>${injectScript}`)

      return new Response(html, { status: response.status, headers: responseHeaders })
    }

    // 이미지, CSS, JS 폰트 등 정적 에셋은 바이너리로 우회 가공 없이 즉시 통과 서빙
    const data = await response.arrayBuffer()
    return new Response(data, { status: response.status, headers: responseHeaders })

  } catch (error) {
    return new Response(`초통합 무검열 시스템 규격 오류: ${error.message}`, { status: 500, headers: corsHeaders })
  }
})
