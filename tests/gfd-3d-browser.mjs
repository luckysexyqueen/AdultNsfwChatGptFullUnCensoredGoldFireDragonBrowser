import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('site-dist');
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const path=resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!path.startsWith(root+'/') && path!==root){res.writeHead(403).end();return;}
 try{
  const bytes=await readFile(path);
  res.setHeader('content-type',extname(path)==='.js'?'text/javascript':extname(path)==='.html'?'text/html':'application/octet-stream');
  res.end(bytes);
 }catch{res.writeHead(404).end('missing');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 const response=await page.goto(origin+'/GoldFireDragonBrowser.html',{waitUntil:'domcontentloaded'});
 assert.equal(response.status(),200);
 const script=await page.request.get(origin+'/gfd-3d-viewer.js');
 assert.equal(script.status(),200,'3D renderer must be packaged');
 const text=await script.text();
 assert.match(text,/window.GFD3DEngine/);
 assert.match(text,/inferDepth/);
 assert.match(text,/WebGLRenderer/);
 // Real browser verifies the shipped script parses and registers without requiring model CDN.
 await page.evaluate(async source=>{
  const script=document.createElement('script');
  script.textContent=source;
  document.body.appendChild(script);
 },text);
 assert.equal(await page.evaluate(()=>typeof window.GFD3DEngine?.refresh),'function');
 assert.equal(errors.filter(e=>/SyntaxError/.test(e)).length,0,errors.join('\n'));
 console.log('3D browser smoke test passed: HTML, script delivery, parsing, initialization');
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
