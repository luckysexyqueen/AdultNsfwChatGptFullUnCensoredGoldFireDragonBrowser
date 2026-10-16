# Gecko / Chromium 기반 패키징 호환성

이 변경은 웹 호환성 패치입니다. APK/EXE 빌드, Capacitor/Electron 프로젝트 생성, Gecko 런타임 설치를 수행하지 않습니다.

## 탐색 계약

두 HTML 진입점은 공통 `inapp-browser.js`를 classic script로 일찍 로드합니다. `GFDInAppBrowser.open(url)`은 Promise를 반환하며 HTTP(S)만 네이티브 탐색에 전달합니다. 정상 처리 시 정규화된 URL, 잘못된 입력이면 null을 반환합니다.

탐색 순서: 현재 문서와 접근 가능한 부모의 `Capacitor.Plugins.GeckoView.open({url})`, 이어서 `GoldFireNative.inAppOpen(url)`, `Capacitor.Plugins.GoldFireInAppBrowser.open({url})`, 마지막 네이티브 대안으로 `Capacitor.Plugins.Browser.open({url})`. 브리지 객체는 호출 시점에 조회하므로 늦은 주입을 지원합니다. 네이티브 호출 실패 또는 `{opened:false}`/`{error:...}`이면 다음 경로를 시도합니다. 모두 없거나 실패하면 접근 가능한 최상위 앱 문서를 이동합니다. iframe 내부에 외부 검색 결과를 가두지 않습니다.

## 나중에 패키징할 때

- Android ARM64: 실제 GeckoView를 포함하는 네이티브 호스트가 위 GeckoView 계약을 구현해야 합니다. Capacitor 자체는 GeckoView 엔진을 제공하지 않습니다. Gecko 세션의 탐색/새 창/뒤로가기/권한/파일 선택/다운로드 처리는 호스트에서 구현하고 검증해야 합니다.
- ZIP → APK: index.html 하나뿐 아니라 HTML이 참조하는 JS·모델·플러그인·이미지 등 전체 정적 산출물을 유지해야 합니다. classic 탐색 어댑터의 file URL 호환성이 전체 앱의 ES module/fetch/WASM 제약까지 해결하지는 않습니다. 앱 전체에는 로컬 HTTP(S) origin으로 자산을 제공하는 구성이 권장됩니다.
- Windows x86_64: Electron의 기본 엔진은 Chromium입니다. Gecko를 유지하려면 별도의 Gecko 호스트를 `GoldFireNative.inAppOpen(url)`에 연결해야 합니다. 이 패치는 Chromium을 Gecko로 바꾸거나 외부 Firefox를 자동 실행하지 않습니다. 원격 페이지에는 Node 접근 권한을 주지 말고 호스트 IPC에서 URL·호출자 검증을 유지해야 합니다.
- 하나의 npm 프로젝트에서 Android/Windows 빌드를 구성해도 공통 어댑터를 그대로 사용할 수 있습니다. 기존 정적 빌드 스크립트가 해당 파일을 이미 포함합니다. 빌드 명령과 네이티브 종속성은 이번 변경에 추가하지 않았습니다.

## 확인 결과와 남은 검증

`node --test tests/navigation-compat.test.mjs`로 Gecko 우선순위, 부모 연결, 늦은 주입, 실패 대체, 잘못된 URL, 로컬 페이지 이동, 다운로드/수정키 클릭 보존, 진입점 로드를 검사합니다.

실제 Android ARM64 GeckoView / Windows Gecko 호스트 실행은 아직 검증하지 않았습니다. 검색·행운 검색·CroxyProxy·BlockAway·뒤로가기·새 창·로그인·미디어·다운로드·파일 선택·오프라인 재시작을 최종 호스트에서 확인해야 합니다. 사이트의 iframe/CORS 정책, VPN 인증, DRM, 모델별 native/WASM 실행은 이 탐색 패치로 보장되지 않습니다.

## Chromium 추가 호환성

- Chrome 웹 배포: 네이티브 브리지 없이 현재 창에서 HTTP(S) 탐색을 처리합니다. 일반 브라우저에서는 앱 전용 브라우저 창을 새로 생성하는 것이 아닙니다.
- Android System WebView / Capacitor: 기존 내장 브리지가 없으면 설치된 표준 Browser 플러그인을 사용합니다. Android에서 이 플러그인은 Custom Tabs를 사용하므로 앱 내부의 자체 WebView와 UI·세션 동작이 다를 수 있습니다. 플러그인을 실제로 설치하고 cap sync하는 작업은 향후 패키징 단계에 필요합니다.
- Electron Chromium: 기존 GoldFireNative.inAppOpen(url) 계약을 사용합니다. 네이티브 연결이 없으면 현재 창으로 이동하므로 셸 UI가 유지되지는 않습니다.
- Gecko 우선순위는 유지합니다. 엔진 선택은 제공된 네이티브 호스트가 결정하며, 사용자 에이전트 문자열로 엔진을 가장하지 않습니다.

참고: https://capacitorjs.com/docs/apis/browser
