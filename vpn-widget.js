// GoldFireDragonBrowser Tokyo status panel. No native VPN or browser traffic routing is performed.
const panel=document.getElementById('gfd-pia-widget');
const toggle=document.getElementById('gfd-vpn-widget-toggle');
const status=document.getElementById('gfd-vpn-kernel-status');
const log=document.getElementById('gfd-vpn-terminal-box');
const button=document.getElementById('gfd-vpn-btn-connect');
if(panel&&toggle&&status&&log&&button){
  toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;panel.style.setProperty('display',panel.hidden?'none':'block','important');toggle.setAttribute('aria-expanded',String(!panel.hidden));});
  panel.style.setProperty('display',panel.hidden?'none':'block','important');
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent='확인 중';log.textContent='일본 게이트웨이 상태 API 조회 중...';
    try{
      const response=await fetch('./api/vpn/public-status',{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      const verified=data.connected===true&&data.egressVerified===true&&data.egressCountry==='JP';
      status.textContent=verified?'일본 출구 검증됨':'연결 미확인';
      log.textContent=verified?'서버가 일본 출구 검증 상태를 보고했습니다. 현재 브라우저 트래픽의 VPN 라우팅은 별도 확인이 필요합니다.':'일본 VPN 연결이 검증되지 않았습니다.';
    }catch(error){status.textContent='상태 조회 불가';log.textContent='상태 API 오류: '+error.message;}
    finally{button.disabled=false;}
  });
}
