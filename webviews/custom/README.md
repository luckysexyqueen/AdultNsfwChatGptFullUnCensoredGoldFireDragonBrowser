# 커스텀 인앱웹뷰

이 폴더는 Gecko와 Chromium을 하나의 네이티브 인터페이스로 묶는 확장 지점입니다. 엔진별 구현은 ../gecko/ 및 ../chromium/에 유지합니다.

## 파일

- adapter.js: 공통 라우터와 커스텀 네이티브 호스트 연결
- README.md: 호스트 구현 계약과 호출 예제

## 네이티브 호스트가 제공할 인터페이스

```text
window.GoldFireWebViews.custom.open({
  url: string,
  engine: 'auto' | 'gecko' | 'chromium',
  sessionId?: string
}) -> Promise<void | { opened: boolean, engine?: 'gecko' | 'chromium', error?: string }>
```

호스트는 지정한 engine의 실제 네이티브 뷰를 선택하고 sessionId를 해당 엔진의 세션에 연결해야 합니다. engine이 auto이면 호스트에서 선택할 수 있습니다. 특정 엔진을 지정하면 다른 엔진을 열지 말고 사용할 수 없을 때 오류 또는 실패 결과를 반환하십시오. 반환값에 engine이 있으면 공통 라우터가 요청 엔진과 일치하는지 확인합니다.

원격 문서에 이 제어 객체를 노출하지 말고, 신뢰할 수 있는 로컬 셸에서만 URL·호출자를 검증해 네이티브 동작을 수행하십시오. 쿠키·저장소·화면·뒤로가기·다운로드·권한·세션 폐기 관리는 호스트의 책임입니다.

## 앱의 공통 호출

```javascript
// 커스텀 브리지가 있으면 이 요청을 먼저 받습니다.
await GFDInAppBrowser.open('https://example.org', {
  engine: 'gecko', sessionId: 'g1'
});
await GFDInAppBrowser.open('https://example.com', {
  engine: 'chromium', sessionId: 'c1'
});
```

명시적 엔진: custom → 해당 엔진 전용 어댑터 → ENGINE_UNAVAILABLE.
자동 모드: Gecko → Chromium → custom → 기존 자동 대안.

커스텀 브리지는 나중에 주입해도 됩니다. 같은 origin의 접근 가능한 부모 셸에만 있어도 호출할 수 있습니다. engine이나 sessionId의 기본 검증은 공통 라우터에서 수행합니다.

이 폴더의 추가만으로 네이티브 WebView나 새 렌더링 엔진이 생성되지는 않습니다. APK/EXE 빌드 구성은 포함하지 않습니다. 통합 안내는 ../../PACKAGING-COMPATIBILITY.md를 참조하십시오.
