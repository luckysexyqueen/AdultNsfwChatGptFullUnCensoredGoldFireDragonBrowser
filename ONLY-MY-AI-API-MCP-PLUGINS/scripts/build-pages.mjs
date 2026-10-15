import fs from 'node:fs';
import path from 'node:path';
const out=path.resolve('dist-pages');
fs.mkdirSync(out,{recursive:true});
const configured=String(process.env.MCP_PUBLIC_URL||'https://spec-direct-auto-inject-mcp.huiwon0621-mcp.workers.dev/mcp').trim();
let mcpURL='';
if(configured){
  const url=new URL(configured);
  if(url.protocol!=='https:'||url.username||url.password) throw Error('MCP_PUBLIC_URL must be a public HTTPS URL');
  url.pathname='/mcp';url.search='';url.hash='';mcpURL=url.href;
}
const html=`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spec Direct MCP · GitHub + Cloudflare</title>
<style>body{font:16px system-ui;max-width:800px;margin:5vh auto;padding:24px;background:#111827;color:#f9fafb}section{padding:24px;border:1px solid #475569;border-radius:16px}a{color:#93c5fd}p{line-height:1.7}.ok{color:#86efac}.muted{color:#cbd5e1}input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;background:#1e293b;color:white;border:1px solid #64748b}button{padding:10px 16px;margin-top:10px;border:0;border-radius:8px;cursor:pointer}</style></head>
<body><section><h1>Spec Direct MCP · GitHub + Cloudflare</h1>
<p>GitHub Pages는 대시보드이며 실제 MCP 요청은 Cloudflare Workers에서 처리합니다.</p>
<label for="url">MCP_PUBLIC_URL (HTTPS /mcp)</label><input id="url" type="url" placeholder="https://your-worker.your-subdomain.workers.dev/mcp">
<button id="save">주소 저장</button> <button id="check">/health 확인</button>
<p id="status" class="muted" role="status"></p>
<p><a id="health" href="#" hidden target="_blank" rel="noopener noreferrer">Worker 상태 페이지</a></p>
<p class="muted">MCP 인증 토큰은 이 공개 페이지에 입력하거나 저장하지 마세요. MCP tools/list는 인증된 클라이언트에서 테스트해야 합니다.</p>
<p><a href="https://github.com/luckysexyqueen/ONLY-MY-AI-API-MCP-PLUGINS-PROJECT/actions">GitHub Actions 배포 상태</a></p>
</section><script>
const defaultURL=${JSON.stringify(mcpURL)};
const input=document.getElementById('url'),status=document.getElementById('status'),health=document.getElementById('health');
input.value=new URLSearchParams(location.search).get('mcp_url')||localStorage.getItem('mcp_public_url')||defaultURL;
function normalized(){const u=new URL(input.value.trim());if(u.protocol!=='https:'||u.username||u.password)throw Error('HTTPS 주소만 사용할 수 있습니다');u.pathname='/mcp';u.search='';u.hash='';return u}
document.getElementById('save').onclick=()=>{try{const u=normalized();localStorage.setItem('mcp_public_url',u.href);input.value=u.href;status.textContent='MCP_PUBLIC_URL 저장됨: '+u.href}catch(e){status.textContent=e.message}};
async function checkHealth(){try{const u=normalized();u.pathname='/health';health.href=u.href;health.hidden=false;status.textContent='상태 확인 중…';const r=await fetch(u.href,{cache:'no-store'});const body=await r.json();status.textContent=r.ok&&body.status==='ok'?'Worker 정상 응답 · 등록 작업 '+body.operations+'개':'HTTP '+r.status+' · '+JSON.stringify(body)}catch(e){status.textContent='브라우저에서 상태 확인 실패: '+e.message+' (CORS 또는 네트워크 문제일 수 있음). 상태 페이지 링크를 직접 열어보세요.'}};

document.getElementById('check').onclick=checkHealth;
if(input.value.trim()){checkHealth();setInterval(checkHealth,60000)}
</script></body></html>`;
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Dashboard built; MCP_PUBLIC_URL:',mcpURL||'(not set)');
