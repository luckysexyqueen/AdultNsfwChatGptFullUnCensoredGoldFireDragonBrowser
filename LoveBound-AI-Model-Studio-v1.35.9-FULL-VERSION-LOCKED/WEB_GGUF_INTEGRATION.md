# 기존 플러그인 통합 · 1.35.11

기존 폴더 이름과 plugin ID를 유지하여 RUNTIME-FIX-REGISTER ZIP을 병합했습니다. 273개 파일의 원본 SHA256을 확인했고, 기존 전용 파일 14개를 유지했습니다. 충돌 원본은 `.integration-originals/v1.35.9/`에 보관합니다. 기존 사용자 프롬프트/API 명세를 계속 사용하며 ZIP에 포함된 대체본은 `.integration-originals/incoming-v1.35.11/`에 보관합니다.

## 실제 GGUF 실행

사이트의 이 폴더 `index.html`을 HTTP로 여세요. 경량 한국어 모델 준비 → 메시지 입력 → 보내기 순서로 실행합니다. OpenAI 키가 필요하지 않습니다. 첫 준비에는 약 378MiB의 다운로드와 충분한 기기 메모리가 필요합니다. 로컬 GGUF 선택도 지원합니다. 모델 호환성은 Wllama 3.8.1 지원 범위에 따릅니다. 생성 중 중복 로드/전송은 잠깁니다.

공유 `../ai/` 및 `../vendor/` 엔진을 사용하므로 저장소의 기존 사이트와 함께 배포해야 합니다. 단독 폴더만 복사하면 실행되지 않습니다. Python app.py는 기존 진단/학습 계획 UI이며 GGUF 추론은 이 웹 화면에서 실행됩니다. GitHub Pages는 Python을 실행하지 않습니다. 안전한 정적 빌드에는 이 폴더의 index.html/web-chat.mjs만 포함하며 원본 모델 업로드·Python·백업·ZIP은 게시하지 않습니다.

## 검증

`npm run plugins:test` (17개), `python LoveBound-AI-Model-Studio-v1.35.9-FULL-VERSION-LOCKED/training/integration_smoke_test.py` (오프라인 복구/보관 기능), `node tests/studio-live.mjs` (명시적 실모델 브라우저 테스트). 브라우저 테스트는 GFD_PLAYWRIGHT_MODULE, GFD_BROWSER_CHANNEL, GFD_REPORT_PATH를 설정하며 GFD_STATIC_ROOT로 정적 빌드도 검사할 수 있습니다. 실제 한국어 응답과 외부 요청 0건을 검증합니다. GPU 학습/Cloudflare 또는 HF 신규 배포를 검증한 것은 아닙니다.
