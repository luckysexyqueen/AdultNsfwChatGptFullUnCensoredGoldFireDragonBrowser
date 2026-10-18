(() => {
  function getNative() {
    const cap = window.Capacitor?.Plugins?.GoldFireVpnPlugin;
    return window.GoldFireNative || (cap ? {
      getOvpnList: () => cap.getOvpnList(),
      getVpnStatus: () => cap.getStatus(),
      installOpenVpn: async () => ({ error: 'Android에서는 시스템 VPN 권한 화면을 사용하세요.' }),
      startVpn: (name) => cap.start({ configName: name }),
      stopVpn: () => cap.stop(),
    } : null);
  }
  async function openVpn() {
    document.getElementById('gfd-vpn-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'gfd-vpn-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:20px;color:#fff;font-family:system-ui';
    modal.innerHTML = '<div style="width:min(460px,100%);background:#202124;border:1px solid #666;border-radius:14px;padding:20px"><div style="display:flex;justify-content:space-between;align-items:center"><b>VPN 설정</b><button id="gfd-vpn-x" style="background:none;border:0;color:#fff;font-size:24px">×</button></div><p id="gfd-vpn-status" style="color:#bbb;font-size:13px">프로필을 불러오는 중…</p><select id="gfd-vpn-select" style="width:100%;padding:10px;background:#303134;color:#fff;border:1px solid #777;border-radius:8"><option value="">프로필 없음</option></select><div style="display:flex;gap:8px;margin-top:16px"><button id="gfd-vpn-install" style="flex:1;padding:10px">OpenVPN 설치</button><button id="gfd-vpn-start" style="flex:1;padding:10px;background:#10a37f;color:#fff;border:0;border-radius:7px">연결</button><button id="gfd-vpn-stop" style="flex:1;padding:10px;background:#b33;color:#fff;border:0;border-radius:7px">해제</button></div><small style="display:block;color:#999;margin-top:12px">Windows 포터블 앱의 내장 OpenVPN 프로필을 선택합니다.</small></div>';
    document.body.appendChild(modal);
    const native = getNative();
    const status = modal.querySelector('#gfd-vpn-status');
    const select = modal.querySelector('#gfd-vpn-select');
    modal.querySelector('#gfd-vpn-x').onclick = () => modal.remove();
    let localProfile = null;
    if (!native) {
      const info = document.createElement('div');
      info.style.cssText = 'margin-top:12px;font-size:12px;line-height:1.5;color:#ddd';
      info.textContent = '웹에서는 OpenVPN 터널을 직접 시작할 수 없습니다. 기존 일본 OVPN 프로필을 선택하거나 로컬 파일을 가져온 뒤 VPN 앱에서 연결하세요. 웹 게이트웨이 상태는 실제 일본 IP 연결을 의미하지 않습니다.';
      modal.querySelector('small')?.replaceWith(info);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ovpn';
      input.style.cssText = 'display:block;margin-top:12px;max-width:100%';
      input.setAttribute('aria-label','로컬 OpenVPN 설정 파일 가져오기');
      info.after(input);
      input.addEventListener('change', () => {
        localProfile = input.files?.[0] || null;
        if (localProfile) status.textContent = '선택된 로컬 프로필: ' + localProfile.name + ' (VPN 앱에서 연결 필요)';
      });
      const check = document.createElement('button');
      check.textContent = '웹 게이트웨이 상태 확인';
      check.style.cssText = 'margin-top:10px;padding:9px;width:100%';
      input.after(check);
      check.onclick = async () => {
        try {
          const response = await fetch('./api/gateway/status', {cache:'no-store',signal:AbortSignal.timeout(5000)});
          if (!response.ok) throw Error('HTTP ' + response.status);
          const data = await response.json();
          status.textContent = data.available ? '웹 게이트웨이 응답 정상 · 일본 VPN IP 연결은 별도 확인 필요' : '웹 게이트웨이 사용 불가';
        } catch { status.textContent = '웹 게이트웨이 연결 안 됨'; }
      };
      modal.querySelector('#gfd-vpn-install').textContent = 'OpenVPN 앱 안내';
      modal.querySelector('#gfd-vpn-start').textContent = 'OVPN 파일 받기';
      modal.querySelector('#gfd-vpn-stop').textContent = 'VPN 연결 안내';
    }
    try {
      const profiles = native ? await native.getOvpnList() : await fetch('./vpn-profiles.json').then((response) => response.ok ? response.json() : {});
      const names = Array.isArray(profiles) ? profiles.map(p => typeof p === 'string' ? p : p?.name).filter(Boolean) : Object.keys(profiles || {});
      select.replaceChildren();
      for (const name of names) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
      if (!names.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'VPN 프로필 없음'; select.append(option); }
      const state = native ? await native.getVpnStatus() : { status: '웹에서는 OS VPN 터널을 직접 연결할 수 없습니다' };
      status.textContent = `상태: ${state?.status || 'DISCONNECTED'}`;
    } catch (error) { status.textContent = `VPN 프로필 오류: ${error.message}`; }
    modal.querySelector('#gfd-vpn-install').onclick = async () => {
      if (!native) { window.open('https://openvpn.net/client/', '_blank', 'noopener,noreferrer'); status.textContent = 'OpenVPN 공식 클라이언트 안내를 열었습니다.'; return; }
      const r = await native.installOpenVpn(); status.textContent = r.message || r.error || '설치 요청 완료';
    };
    modal.querySelector('#gfd-vpn-start').onclick = async () => {
      if (!native) {
        if (localProfile) {
          const link = document.createElement('a');
          const blobUrl = URL.createObjectURL(localProfile);
          link.href = blobUrl; link.download = localProfile.name; link.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
          status.textContent = 'OVPN 파일을 준비했습니다. VPN 앱에 가져와 연결하세요.';
        } else {
          status.textContent = '기존 목록의 파일은 서버에 공개하지 않습니다. 로컬 .ovpn 파일을 선택해 주세요.';
        }
        return;
      }
      if (!select.value) { status.textContent = 'VPN 프로필을 먼저 선택하세요.'; return; }
      const r = await native.startVpn(select.value); status.textContent = r.status || r.error || '연결 요청 완료';
    };
    modal.querySelector('#gfd-vpn-stop').onclick = async () => {
      if (!native) { status.textContent = '웹에서는 VPN 연결을 해제할 수 없습니다. OpenVPN 앱에서 해제하세요.'; return; }
      const r = await native.stopVpn(); status.textContent = r.status || r.error || '해제 요청 완료';
    };
  }
  window.__gfdOpenVpn = openVpn;
  function bind() { document.getElementById('vpn-settings-btn')?.addEventListener('click', openVpn); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
