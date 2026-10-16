# Gecko / Chromium 공존을 위한 패키징 호환성

하나의 프로젝트 안에서 엔진별 웹 어댑터를 분리하고 공통 탐색 API로 호출합니다. 이번 변경은 웹 코드와 호스트 연결 계약이며 APK/EXE 빌드, 네이티브 엔진 설치·구현은 포함하지 않습니다.

## 폴더 구조

```text
webviews/
  gecko/adapter.js      # GeckoView 및 커스텀 Gecko 호스트 연결
  chromium/adapter.js   # Chromium WebView 및 식별된 Electron 호스트 연결
  custom/adapter.js     # 두 엔진을 묶는 커스텀 네이티브 호스트 연결
  custom/README.md      # 커스텀 호스트 구현 계약·사용 예제
inapp-browser.js        # 공통 엔진 선택·세션 전달·자동 탐색
index.html
GoldFireDragonBrowser.html
```

두 HTML은 엔진 어댑터 두 개, 커스텀 어댑터, 공통 라우터 순서로 classic script를 로드합니다. `npm run build:static`도 webviews 폴더를 포함합니다. ZIP→APK에는 HTML만 넣지 말고 전체 정적 산출물의 폴더 구조를 유지해야 합니다.

## 공통 API

```javascript
// 기존 호출은 자동 모드로 계속 동작합니다.
await GFDInAppBrowser.open('https://example.org');

// 기본 엔진 선택: 이 문서의 검색/새 창/공통 open 호출에 적용합니다.
// 접근 가능한 자식 브라우저 문서도 부모 설정을 상속합니다.
GFDInAppBrowser.setEngine('chromium'); // 'auto' | 'gecko' | 'chromium'
GFDInAppBrowser.getEngine();

// 호출별 지정은 기본 설정을 변경하지 않습니다.
// 두 엔진 요청을 동시에 전달할 수 있습니다.
await Promise.all([
  GFDInAppBrowser.open('https://example.org', {
    engine: 'gecko', sessionId: 'gecko-tab-1'
  }),
  GFDInAppBrowser.open('https://example.com', {
    engine: 'chromium', sessionId: 'chromium-tab-1'
  })
]);
```

HTTP(S) URL만 네이티브 탐색에 전달합니다. 정상 처리 시 정규화된 URL, 잘못된 URL이면 null을 반환합니다. sessionId는 1~128자의 영문·숫자·밑줄·하이픈입니다.

명시한 엔진의 연결이 없거나 모두 실패하면 `code: 'ENGINE_UNAVAILABLE'` 오류를 반환합니다. 다른 엔진이나 현재 셸 화면으로 임의 전환하지 않습니다. sessionId를 지정했을 때도 일반 셸 이동이나 세션을 받지 않는 자동 대안으로 전환하지 않습니다.

자동 모드: Gecko 어댑터 → Chromium 어댑터 → 커스텀 호스트 → 기존 비지정 GoldFireNative/GoldFireInAppBrowser → 표준 Capacitor Browser → 접근 가능한 최상위 앱 문서 이동. 마지막 이동은 셸 화면을 대체할 수 있습니다.

## 커스텀 인앱웹뷰 호스트 연결 계약

네이티브 호스트가 신뢰할 수 있는 로컬 셸에 아래 두 객체를 제공하면 됩니다. 어댑터는 매 호출마다 조회하므로 늦은 주입도 지원합니다.

```text
GoldFireWebViews.gecko.open({ url, sessionId? })
GoldFireWebViews.chromium.open({ url, sessionId? })
```

두 함수는 Promise를 반환하며, 성공 시 void 또는 `{opened:true}`, 실패 시 예외 또는 `{opened:false}`/`{error:...}`를 반환합니다. sessionId는 선택한 엔진에 그대로 전달됩니다. 실제 세션 저장·조회·분리·폐기와 쿠키/스토리지 격리는 네이티브 호스트가 구현해야 합니다. 웹 코드가 GeckoView 인스턴스나 Android WebView를 생성하는 것은 아닙니다.

기존 연결도 지원합니다.

- Gecko: `Capacitor.Plugins.GeckoView.open({url, sessionId?})`
- Chromium: `Capacitor.Plugins.ChromiumWebView.open({url, sessionId?})`
- 엔진을 명시한 Electron 호스트: `GoldFireNative.engine = 'chromium'` 및 `inAppOpen(url, options)`. engine 표기가 없는 기존 Electron 브리지는 자동 모드에서 계속 사용할 수 있습니다.

호스트는 URL·호출자 검증과 원격 페이지의 네이티브 접근 격리를 담당해야 합니다. 원격 문서에 이 제어 객체를 노출하지 마십시오.

## 플랫폼별 후속 작업

- Android ARM64: GeckoView와 Android System WebView를 각각 호스트에 포함하고 엔진별 화면·세션 생명주기와 뒤로가기·새 창·권한·파일 선택·다운로드를 구현합니다. Capacitor 기본 WebView 자체가 GeckoView로 전환되지는 않습니다.
- Windows x86_64: Electron은 기본적으로 Chromium을 사용합니다. Windows의 Gecko 경로는 별도 Gecko 호스트가 필요합니다. Android GeckoView 라이브러리를 Windows Electron에 그대로 사용하는 구조는 아닙니다.
- 표준 Capacitor Browser는 자동 모드의 대안입니다. Android Custom Tabs의 엔진을 이 코드가 지정하지 않으므로 명시적 chromium 요청을 처리하는 엔진으로 취급하지 않습니다. 참고: https://capacitorjs.com/docs/apis/browser
- 파일 URL에서 classic 어댑터는 로드할 수 있지만 앱 전체의 ES module/fetch/WASM에는 추가 제약이 있습니다. 전체 앱 자산은 로컬 HTTP(S) origin으로 제공하는 구성을 권장합니다.

## 검증 범위

`node --test tests/navigation-compat.test.mjs`는 엔진 선택·동시 요청·세션 전달·실패 시 엔진 보존·부모 설정 상속·기존 탐색을 검사합니다. 기존 정적 빌드 검사도 두 엔진 어댑터의 포함과 원본 바이트 일치를 확인합니다.

브라우저 검사는 실제 Chrome에서 실행하되 네이티브 엔진 연결은 모의 객체입니다. Android의 두 엔진 동시 실행, Windows Gecko 호스트, 로그인·미디어·다운로드·VPN·DRM·모델 실행은 아직 기기에서 검증하지 않았습니다.

## 커스텀 웹뷰 확장

`webviews/custom/`에 통합 어댑터와 호스트 구현 안내를 제공합니다. `GoldFireWebViews.custom.open({url, engine, sessionId?})`를 구현하면 하나의 커스텀 호스트에서 두 엔진을 제어할 수 있습니다. 명시적 엔진 요청은 커스텀 호스트를 먼저 시도하고, 실패하면 요청한 엔진의 전용 어댑터를 시도합니다. 자동 모드에서는 기존 Gecko·Chromium 우선순위를 유지합니다. 자세한 계약과 예제는 `webviews/custom/README.md`를 참조하십시오.
