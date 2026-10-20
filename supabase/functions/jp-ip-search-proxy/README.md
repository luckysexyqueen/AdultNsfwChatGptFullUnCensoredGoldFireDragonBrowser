# 일본 검색 프록시

추가 서버나 VPN 앱 없이 Supabase 함수에서 검색합니다. 기존 화면과 검색 버튼은 변경하지 않습니다.

배포된 프로젝트: `unublyqlstbetykelfmg`

요청 주소:

```text
https://unublyqlstbetykelfmg.supabase.co/functions/v1/jp-ip-search-proxy?forceFunctionRegion=ap-northeast-1&q=검색어
```

`Authorization: Bearer <프로젝트의 anon 키 또는 사용자 JWT>` 헤더가 필요합니다. 비밀키나 서비스 역할 키는 브라우저에 넣지 마세요.

- 상태 검사: 같은 주소에서 `q` 대신 `action=status`를 사용합니다.
- 검색: `GET`의 `q` 또는 `POST`의 JSON `{"query":"검색어"}`를 사용합니다.
- 도쿄 실행 지역과 실제 출구 국가가 모두 일본인 경우에만 검색합니다. 각 요청마다 출구 IP를 재검증하며, 동시에 진행하는 검사만 공유합니다.
- 응답의 `results`에 제목, 링크, 설명을 반환합니다. 원격 HTML이나 스크립트는 실행하지 않습니다.
- 구글 검색만 사용합니다. 구글 오류나 확인 화면이 발생하면 오류를 반환하고 다른 검색엔진으로 전환하지 않습니다.
- 허용된 검색 서비스에만 요청합니다. 임의 주소를 전달하는 범용 프록시는 제공하지 않습니다.
- 검색 결과 링크를 여는 트래픽과 기기 전체의 IP는 바뀌지 않습니다. `.ovpn` 연결 기능이 아닙니다.

재배포:

```sh
supabase functions deploy jp-ip-search-proxy --project-ref unublyqlstbetykelfmg
```

검증:

```sh
node --test supabase/functions/jp-ip-search-proxy/core.test.mjs
```

오류 코드 `GOOGLE_JAVASCRIPT_REQUIRED`는 구글이 검색 결과 대신 자바스크립트 실행 화면을 반환했다는 뜻입니다. HTTP 200인 확인 화면을 검색 성공으로 처리하지 않습니다. 이 경우 Supabase의 일반 HTTP 요청만으로는 검색 결과를 보장할 수 없습니다.
