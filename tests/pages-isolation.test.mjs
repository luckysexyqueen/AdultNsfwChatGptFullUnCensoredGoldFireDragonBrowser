import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-gateway/pages-worker.mjs';
test('static assets receive WebContainer isolation headers in advanced Pages Worker mode', async()=>{
 const response=await worker.fetch(new Request('https://example.pages.dev/BrowserNativeWebTerminal.html'),{ASSETS:{fetch:async()=>new Response('<html>terminal</html>',{headers:{'Content-Type':'text/html'}})}});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cross-Origin-Opener-Policy'),'same-origin');
 assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
 assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
});
