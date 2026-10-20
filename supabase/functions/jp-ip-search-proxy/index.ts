import { createHandler } from './google.mjs';
import { createGoogleRenderer } from './browser-render.mjs';

// 명시적으로 활성화한 경우에만 외부 관리형 브라우저를 호출합니다.
const enabled = Deno.env.get('GOOGLE_BROWSER_ENABLED') === 'true';
Deno.serve(createHandler({
  region: () => Deno.env.get('SB_REGION') || '',
  renderGoogle: enabled ? createGoogleRenderer({
    enabled,
    token: Deno.env.get('BROWSERLESS_TOKEN') || '',
  }) : null,
}));
