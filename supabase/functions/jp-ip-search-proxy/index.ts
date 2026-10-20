import { createHandler } from './google.mjs';

// 함수 실행 지역과 실제 출구 국가를 모두 확인합니다.
Deno.serve(createHandler({ region: () => Deno.env.get('SB_REGION') || '' }));
