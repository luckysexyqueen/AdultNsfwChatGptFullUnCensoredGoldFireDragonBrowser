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
    if (!native) { status.textContent = 'Windows 포터블 앱에서만 VPN 연결 기능을 사용할 수 있습니다.'; return; }
    try {
      const profiles = await native.getOvpnList();
      const names = Object.keys(profiles || {});
      select.innerHTML = names.length ? names.map((name) => `<option value="${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}">${name}</option>`).join('') : '<option value="">내장 VPN 프로필 없음</option>';
      const state = await native.getVpnStatus();
      status.textContent = `상태: ${state?.status || 'DISCONNECTED'}`;
    } catch (error) { status.textContent = `VPN 프로필 오류: ${error.message}`; }
    modal.querySelector('#gfd-vpn-install').onclick = async () => { const r = await native.installOpenVpn(); status.textContent = r.message || r.error || '설치 요청 완료'; };
    modal.querySelector('#gfd-vpn-start').onclick = async () => { if (!select.value) { status.textContent = 'VPN 프로필을 먼저 선택하세요.'; return; } const r = await native.startVpn(select.value); status.textContent = r.status || r.error || '연결 요청 완료'; };
    modal.querySelector('#gfd-vpn-stop').onclick = async () => { const r = await native.stopVpn(); status.textContent = r.status || r.error || '해제 요청 완료'; };
  }
  window.__gfdOpenVpn = openVpn;
  function bind() { document.getElementById('vpn-settings-btn')?.addEventListener('click', openVpn); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
