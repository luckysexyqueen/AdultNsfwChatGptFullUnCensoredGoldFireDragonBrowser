import test from 'node:test';import assert from 'node:assert/strict';import {validateTarget,handleFirecrawl} from '../lib/firecrawl-handler.mjs';
const dns=async()=>[{address:'8.8.8.8'}];
test('accepts public HTTPS',async()=>assert.equal(await validateTarget('https://example.com/',dns),'https://example.com/'));
test('rejects private DNS',async()=>assert.rejects(validateTarget('https://example.com/',async()=>[{address:'127.0.0.1'}])));
test('rejects localhost and HTTP',async()=>{await assert.rejects(validateTarget('http://example.com/',dns));await assert.rejects(validateTarget('https://localhost/',dns));});
test('search uses Firecrawl client',async()=>{const r=await handleFirecrawl({action:'search',query:'한국어'},{createClient:()=>({search:async()=>({web:[{title:'ok',url:'https://example.com'}]})})});assert.equal(r.results[0].title,'ok');});
test('scrape uses Firecrawl client',async()=>{const r=await handleFirecrawl({action:'scrape',url:'https://example.com'},{resolve:dns,createClient:()=>({scrape:async()=>({markdown:'hello'})})});assert.equal(r.markdown,'hello');});
