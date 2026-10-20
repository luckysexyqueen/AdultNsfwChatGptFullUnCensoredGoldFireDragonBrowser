import test from 'node:test';import assert from 'node:assert/strict';import {isAllowedPageUrl} from '../scripts/firecrawl-url.mjs';
test('allows public HTTPS domain',()=>assert.equal(isAllowedPageUrl('https://example.org/article'),true));
test('rejects HTTP and private hostnames',()=>{for(const u of ['http://example.org','https://localhost','https://127.0.0.1','https://[::1]','https://intranet.local','https://user:pass@example.org'])assert.equal(isAllowedPageUrl(u),false,u);});
