(() => {
  // Improved VPN modal and native bridge handling
  const DEFAULT_PROFILES_PATH = './vpn-profiles.json';

  function getNative() {
    const cap = window.Capacitor?.Plugins?.GoldFireVpnPlugin;
    // window.GoldFireNative may be provided by older in-app bridge
    const native = window.GoldFireNative || null;
    if (cap) {
      return {
        getOvpnList: () => cap.getOvpnList(),
        getVpnStatus: () => cap.getStatus(),
        installOpenVpn: () => cap.install(),
        startVpn: (name) => cap.start({ configName: name }),
        stopVpn: () => cap.stop(),
      };
    }
    if (native) return native;
    return null;
  }

  function createModal() {
    document.getElementById('gfd-vpn-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'gfd-vpn-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:20px;color:#fff;font-family:system-ui';
    modal.innerHTML = `
      <div style="width:min(640px,100%);background:#202124;border:1px solid #666;border-radius:14px;padding:18px;max-height:90vh;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong>VPN 설정</strong>
          <button id="gfd-vpn-x" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button>
        </div>
        <div style="margin-bottom:12px;color:#cfe7ff" id="gfd-vpn-status">상태: 로딩 중...</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <select id="gfd-vpn-select" style="flex:1;padding:8px;border-radius:8px;background:#111;border:1px solid #333;color:#fff"></select>
          <button id="gfd-vpn-download" style="padding:8px 10px;border-radius:8px;background:#0b84ff;border:none;cursor:pointer">프로필 다운로드</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="gfd-vpn-install" style="flex:1;padding:8px;border-radius:8px;background:#10a37f;border:none;cursor:pointer">설치(앱)</button>
          <button id="gfd-vpn-start" style="flex:1;padding:8px;border-radius:8px;background:#0d6efd;border:none;cursor:pointer">시작</button>
          <button id="gfd-vpn-stop" style="flex:1;padding:8px;border-radius:8px;background:#ef4444;border:none;cursor:pointer">중지</button>
        </div>
        <div style="font-size:13px;color:#cfe7ff">설명: 모바일 앱에서만 '시작/중지/설치' 기능이 작동합니다. 브라우저에서는 프로필을 다운로드하여 선호 VPN 클라이언트에 가져오세요.</div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  async function fetchProfiles(native) {
    if (native && typeof native.getOvpnList === 'function') {
      try {
        const profiles = await native.getOvpnList();
        // If function returns a promise that resolves to an object, accept it
        if (profiles && typeof profiles === 'object') return profiles;
      } catch (e) { console.warn('native.getOvpnList failed', e); }
    }

    // Fallback to fetching local json
    try {
      const r = await fetch(DEFAULT_PROFILES_PATH, { cache: 'no-store' });
      if (!r.ok) throw new Error('profiles fetch failed ' + r.status);
      const json = await r.json();
      return json;
    } catch (e) {
      console.warn('fetch profiles failed', e);
      return {};
    }
  }

  async function updateStatus(native, statusEl) {
    if (!native || typeof native.getVpnStatus !== 'function') {
      statusEl.textContent = '상태: 브라우저 모드 (VPN 제어 불가)';
      return;
    }
    try {
      const s = await native.getVpnStatus();
      // normalize
      const text = s?.status || (typeof s === 'string' ? s : 'UNKNOWN');
      statusEl.textContent = `상태: ${text}`;
    } catch (e) {
      console.warn('getVpnStatus failed', e);
      statusEl.textContent = `상태: 오류 (${e && e.message ? e.message : String(e)})`;
    }
  }

  function downloadProfile(profiles, select) {
    const name = select.value;
    const obj = profiles && profiles[name];
    if (!obj) {
      alert('선택된 프로필이 없습니다.');
      return;
    }
    // assume obj contains { filename, content } or URL
    if (obj.url) {
      // download remote file
      const a = document.createElement('a');
      a.href = obj.url;
      a.download = obj.filename || (name + '.ovpn');
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    const content = obj.content || obj.ovpn || '';
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = obj.filename || (name + '.ovpn');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function startVpn(native, name, statusEl, timeout = 30000) {
    if (!native || typeof native.startVpn !== 'function') {
      statusEl.textContent = '브라우저에서는 VPN을 시작할 수 없습니다. 앱에서 시작하세요.';
      return { ok: false, reason: 'no-native' };
    }
    statusEl.textContent = '상태: 시작 시도 중...';
    try {
      const res = await native.startVpn(name);
      // Some native plugins return immediate status, others promise. Normalize.
      if (res && res.error) throw new Error(res.error);
    } catch (e) {
      statusEl.textContent = `상태: 시작 실패 (${e && e.message ? e.message : e})`;
      return { ok: false, reason: 'start-failed', error: e };
    }

    // Poll status until connected or timeout
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, 800));
      try {
        const s = await native.getVpnStatus();
        const state = s?.status || (typeof s === 'string' ? s : 'UNKNOWN');
        statusEl.textContent = `상태: ${state}`;
        if (/connected|connected/i.test(state)) return { ok: true };
        if (/error|failed|terminated|disconnected/i.test(state)) return { ok: false, reason: state };
      } catch (e) {
        console.warn('getVpnStatus during poll failed', e);
      }
    }
    statusEl.textContent = '상태: 연결 시간 초과';
    return { ok: false, reason: 'timeout' };
  }

  async function stopVpn(native, statusEl) {
    if (!native || typeof native.stopVpn !== 'function') {
      statusEl.textContent = '브라우저에서는 VPN을 중지할 수 없습니다. 앱에서 중지하세요.';
      return { ok: false, reason: 'no-native' };
    }
    statusEl.textContent = '상태: 중지 시도 중...';
    try {
      const res = await native.stopVpn();
      if (res && res.error) throw new Error(res.error);
      // update status once
      await new Promise(r => setTimeout(r, 500));
      await updateStatus(native, statusEl);
      return { ok: true };
    } catch (e) {
      statusEl.textContent = `상태: 중지 실패 (${e && e.message ? e.message : e})`;
      return { ok: false, reason: 'stop-failed', error: e };
    }
  }

  async function openVpn() {
    const native = getNative();
    const modal = createModal();
    const statusEl = modal.querySelector('#gfd-vpn-status');
    const select = modal.querySelector('#gfd-vpn-select');
    const btnInstall = modal.querySelector('#gfd-vpn-install');
    const btnStart = modal.querySelector('#gfd-vpn-start');
    const btnStop = modal.querySelector('#gfd-vpn-stop');
    const btnDownload = modal.querySelector('#gfd-vpn-download');
    modal.querySelector('#gfd-vpn-x').onclick = () => modal.remove();

    // Load profiles
    const profiles = await fetchProfiles(native);
    const names = Object.keys(profiles || {});
    if (!names.length) {
      select.innerHTML = '<option value="">(프로필 없음)</option>';
    } else {
      select.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    // initial status
    await updateStatus(native, statusEl);

    // If no native, guide the user
    if (!native) {
      btnInstall.onclick = () => { statusEl.textContent = '브라우저에서는 설치 기능을 지원하지 않습니다. 프로필을 다운로드하여 VPN 앱에 불러오세요.'; };
      btnStart.onclick = () => { statusEl.textContent = '브라우저에서는 VPN을 시작할 수 없습니다. 모바일 앱에서 사용하세요.'; };
      btnStop.onclick = () => { statusEl.textContent = '브라우저에서는 VPN을 중지할 수 없습니다.'; };
    } else {
      btnInstall.onclick = async () => {
        try {
          statusEl.textContent = '설치: 네이티브 설치를 시도합니다...';
          const res = await native.installOpenVpn();
          if (res && res.error) throw new Error(res.error);
          statusEl.textContent = '설치 요청을 보냈습니다.';
        } catch (e) {
          statusEl.textContent = `설치 실패: ${e && e.message ? e.message : e}`;
        }
      };

      btnStart.onclick = async () => {
        if (!select.value) { statusEl.textContent = 'VPN 프로필을 먼저 선택하세요.'; return; }
        btnStart.disabled = true; btnStop.disabled = true;
        const r = await startVpn(native, select.value, statusEl, 45000);
        btnStart.disabled = false; btnStop.disabled = false;
        if (r.ok) statusEl.textContent = '상태: CONNECTED';
      };

      btnStop.onclick = async () => {
        btnStart.disabled = true; btnStop.disabled = true;
        const r = await stopVpn(native, statusEl);
        btnStart.disabled = false; btnStop.disabled = false;
        if (r.ok) statusEl.textContent = '상태: DISCONNECTED';
      };
    }

    btnDownload.onclick = () => downloadProfile(profiles, select);

    // Periodically refresh native status while modal open
    let poll = true;
    (async function pollStatus() {
      while (poll && document.getElementById('gfd-vpn-modal')) {
        await new Promise(r => setTimeout(r, 2000));
        try { await updateStatus(native, statusEl); } catch (e) { /* ignore */ }
      }
    })();
    modal.addEventListener('remove', () => { poll = false; });
  }

  window.__gfdOpenVpn = openVpn;
  function bind() { document.getElementById('vpn-settings-btn')?.addEventListener('click', openVpn); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
