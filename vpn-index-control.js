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
      // Browse public repository OVPN filenames without exposing configuration
      // contents or private key material in the page.
      const repoProfiles = document.createElement('button');
      repoProfiles.textContent = 'GitHub 일본 OVPN 목록 보기';
      repoProfiles.style.cssText = 'margin-top:10px;padding:9px;width:100%';
      repoProfiles.onclick = () => window.open(
        'https://github.com/luckysexyqueen/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser/tree/fix/free-api-local-gguf-engine-20261018/Japan/Configs',
        '_blank','noopener,noreferrer');
      info.after(repoProfiles);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ovpn';
      input.style.cssText = 'display:block;margin-top:12px;max-width:100%';
      input.setAttribute('aria-label','로컬 OpenVPN 설정 파일 가져오기');
      info.after(input);
      input.addEventListener('change', async () => {
        localProfile = input.files?.[0] || null;
        if (!localProfile) return;
        if (!/\\.ovpn$/i.test(localProfile.name) || localProfile.size > 256 * 1024) {
          localProfile = null;
          status.textContent = '256KB 이하의 .ovpn 파일만 선택할 수 있습니다.';
          return;
        }
        try {
          const contents = await localProfile.text();
          if (!/^\\s*(?:client|remote|dev|proto|#|;)/m.test(contents) || !/^\\s*remote\\s+\\S+/m.test(contents)) {
            throw new Error('remote 서버 주소가 없는 OVPN 설정입니다.');
          }
          const remote = contents.match(/^\\s*remote\\s+(\\S+)(?:\\s+(\\d+))?/m);
          status.textContent = 'OVPN 읽기 완료: ' + localProfile.name + ' · 서버: ' + remote[1] + ' · 서버 연결은 별도 호스팅이 필요합니다.';
        } catch (error) {
          localProfile = null;
          status.textContent = 'OVPN 확인 실패: ' + error.message;
        }
      });
      const remoteCatalog = document.createElement('button');
      remoteCatalog.textContent = '🇯🇵 GitHub OVPN 자동 목록 불러오기';
      remoteCatalog.style.cssText = 'display:block;margin-top:10px;padding:9px;width:100%';
      remoteCatalog.onclick = async () => {
        status.textContent = '기존 GitHub OVPN 목록 확인 중…';
        try {
          const response = await fetch('https://goldfiredragon-web-gateway.onrender.com/api/vpn/profiles', {signal:AbortSignal.timeout(15000)});
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const data = await response.json();
          select.replaceChildren();
          for (const p of data.profiles || []) {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name + ' (' + p.host + ':' + p.port + '/' + p.protocol + ')';
            select.append(opt);
          }
          status.textContent = select.options.length
            ? select.options.length + '개 OVPN 프로필 확인됨 · 서버 터널 연결 여부는 별도 확인'
            : '서버에 사용 가능한 공개 OVPN 프로필이 없습니다.';
        } catch(e) { status.textContent = 'OVPN 목록 조회 실패: ' + e.message; }
      };
      input.after(remoteCatalog);
      const check = document.createElement('button');
      check.textContent = '웹 게이트웨이 상태 확인';
      check.style.cssText = 'margin-top:10px;padding:9px;width:100%';
      input.after(check);
      const virtualBtn = document.createElement('button');
      virtualBtn.textContent = '🌐 웹 가상 네트워크 어댑터 활성화';
      virtualBtn.style.cssText = 'margin-top:10px;padding:9px;width:100%';
      virtualBtn.onclick = async () => {
        try {
          const {webVirtualTun} = await import('./web-virtual-tun.js');
          if (webVirtualTun.status.enabled) {
            webVirtualTun.disable();
            status.textContent = '웹 HTTP 어댑터 비활성화 · OS VPN 터널 아님';
          } else {
            await webVirtualTun.enable();
            status.textContent = '웹 HTTP 어댑터 활성화 · 검색 요청 전용 · 전체 트래픽 VPN 아님';
          }
        } catch (e) { status.textContent = '웹 어댑터 연결 실패: ' + e.message; }
      };
      check.after(virtualBtn);
      const jpPanel = document.createElement('div');
      jpPanel.style.cssText = 'display:grid;gap:8px;margin-top:12px';
      const jpStatus = document.createElement('button');
      jpStatus.textContent = '🇯🇵 일본 프록시 연결 확인';
      jpStatus.style.cssText = 'padding:10px;background:#374151;color:white;border:1px solid #6b7280;border-radius:6px';
      const jpSearch = document.createElement('input');
      jpSearch.type = 'search';
      jpSearch.placeholder = '일본 Google 검색어';
      jpSearch.style.cssText = 'padding:10px;background:#303134;color:white;border:1px solid #777;border-radius:6px';
      const jpGo = document.createElement('button');
      jpGo.textContent = '🇯🇵 일본 검색 실행';
      jpGo.style.cssText = 'padding:10px;background:#0f766e;color:white;border:0;border-radius:6px';
      jpPanel.append(jpStatus,jpSearch,jpGo);
      check.after(jpPanel);
      jpStatus.onclick = async () => {
        try {
          const r = await fetch('./api/jp/status', {cache:'no-store',signal:AbortSignal.timeout(7000)});
          if (!r.ok) throw Error('HTTP '+r.status);
          const d = await r.json();
          status.textContent = d.configured
            ? '일본 HTTPS 프록시 설정됨 · 실제 일본 출구 IP는 별도 검증 필요'
            : '일본 검색은 사용 가능 · 일본 IP 프록시는 서버 연결 설정(JP_SERVER_ORIGIN)이 필요';
        } catch (e) { status.textContent = '일본 프록시 상태 확인 실패: '+e.message; }
      };
      jpGo.onclick = () => {
        const q = jpSearch.value.trim();
        if (!q) { status.textContent = '검색어를 입력하세요.'; return; }
        window.open('./api/jp/search?q='+encodeURIComponent(q),'_blank','noopener,noreferrer');
      };
      jpSearch.addEventListener('keydown', e => { if (e.key === 'Enter') jpGo.click(); });
      check.onclick = async () => {
        try {
          const response = await fetch('./api/gateway/status', {cache:'no-store',signal:AbortSignal.timeout(5000)});
          if (!response.ok) throw Error('HTTP ' + response.status);
          const data = await response.json();
          status.textContent = data.available ? '웹 게이트웨이 응답 정상 · 일본 VPN IP 연결은 별도 확인 필요' : '웹 게이트웨이 사용 불가';
        } catch { status.textContent = '웹 게이트웨이 연결 안 됨'; }
      };
      modal.querySelector('#gfd-vpn-install').textContent = '서버 상태 확인';
      modal.querySelector('#gfd-vpn-start').textContent = 'OVPN 연결 요청';
      modal.querySelector('#gfd-vpn-stop').textContent = '연결 해제 요청';
    }
    try {
      const profiles = native ? await native.getOvpnList() : await fetch('./vpn-profiles.json').then((response) => response.ok ? response.json() : {});
      const names = Array.isArray(profiles) ? profiles.map(p => typeof p === 'string' ? p : p?.name).filter(Boolean) : Object.keys(profiles || {});
      select.replaceChildren();
      for (const name of names) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); }
      if (!names.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'VPN 프로필 없음'; select.append(option); }
      const state = native ? await native.getVpnStatus() : await (async () => {
        const apiUrl = window.GFD_VPN_API_BASE
          ? new URL('/api/vpn/status', window.GFD_VPN_API_BASE).href
          : (location.hostname.endsWith('github.io') ? 'https://goldfiredragon-web-gateway.onrender.com/api/vpn/status' : './api/vpn/status');
        try {
          const response = await fetch(apiUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
          if (!response.ok) return { status: '서버 VPN 상태 조회 실패 (HTTP ' + response.status + ')' };
          const data = await response.json();
          return { status: data.connected === true && data.egressVerified === true
            ? '일본 VPN 연결 확인됨' : '서버 VPN 연결 대기 또는 일본 IP 미검증' };
        } catch (error) {
          return { status: '서버 VPN 상태 확인 불가: ' + error.message };
        }
      })();
      status.textContent = `상태: ${state?.status || 'DISCONNECTED'}`;
    } catch (error) { status.textContent = `VPN 프로필 오류: ${error.message}`; }
    modal.querySelector('#gfd-vpn-install').onclick = async () => {
      if (!native) { check.click(); return; }
      const r = await native.installOpenVpn(); status.textContent = r.message || r.error || '설치 요청 완료';
    };
    modal.querySelector('#gfd-vpn-start').onclick = async () => {
      if (!native) {
        status.textContent = '웹사이트 서버 VPN 연결 상태 확인 중…';
        try {
          const vpnStatusUrl = window.GFD_VPN_API_BASE ? new URL('/api/vpn/status', window.GFD_VPN_API_BASE).href : (location.hostname.endsWith('github.io') ? 'https://goldfiredragon-web-gateway.onrender.com/api/vpn/status' : './api/vpn/status');
          const response = await fetch(vpnStatusUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw Error('VPN 상태 조회 HTTP ' + response.status + ' · VPN API 서버 배포 및 주소를 확인하세요.');
          const state = await response.json();
          status.textContent = state.connected === true && state.egressVerified === true
            ? '웹사이트 서버 VPN 연결 완료 · 일본 출구 IP 검증됨'
            : '웹사이트 서버 VPN 미연결 또는 일본 출구 IP 미검증 · 서버에서 VPN 자동 연결 설정이 필요합니다.';
        } catch (error) { status.textContent = 'VPN 서버 연결 실패: ' + error.message; }
        return;
      }
      if (!select.value) { status.textContent = 'VPN 프로필을 먼저 선택하세요.'; return; }
      const button = modal.querySelector('#gfd-vpn-start');
      button.disabled = true;
      status.textContent = 'OVPN 연결 요청 중…';
      try {
        const r = await native.startVpn(select.value);
        if (r?.error || r?.success === false) throw new Error(r.error || r.message || 'VPN 시작 실패');
        const state = await native.getVpnStatus();
        const connected = state?.connected === true || /^(connected|active)$/i.test(String(state?.status || ''));
        status.textContent = connected
          ? 'VPN 연결됨: ' + select.value
          : 'VPN 연결 요청 전달됨 · 상태: ' + (state?.status || r?.status || '확인 중');
      } catch (error) {
        status.textContent = 'OVPN 연결 실패: ' + (error?.message || String(error));
      } finally {
        button.disabled = false;
      }
    };
    modal.querySelector('#gfd-vpn-stop').onclick = async () => {
      if (!native) {
        status.textContent = '웹사이트 서버 VPN은 서버에서 관리됩니다. 이 버튼은 서버 VPN을 임의로 종료하지 않습니다.';
        return;
      }
      const r = await native.stopVpn(); status.textContent = r.status || r.error || '해제 요청 완료';
    };
  }
  window.__gfdOpenVpn = openVpn;
  function bind() { document.getElementById('vpn-settings-btn')?.addEventListener('click', openVpn); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
