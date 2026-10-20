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
 // Use a separate clean page for deterministic WebGL rendering assertions.
 const renderPage=await browser.newPage();
 await renderPage.goto(origin+'/GoldFireDragonBrowser.html',{waitUntil:'domcontentloaded'});
 await renderPage.setContent('<!doctype html><html><body></body></html>');
 await renderPage.evaluate(()=>{window.GFD_3D_TEST_SKIP_AI=true;});
 renderPage.on('console',msg=>{if(msg.type()==='error'||msg.type()==='warning')console.log('[browser]',msg.text());});
 renderPage.on('pageerror',error=>console.log('[browser error]',error.message));
 await renderPage.addScriptTag({content:text});
 assert.equal(await renderPage.evaluate(()=>typeof window.GFD3DEngine?.refresh),'function');
 assert.equal(errors.filter(e=>/SyntaxError/.test(e)).length,0,errors.join('\n'));
 // Verify real WebGL drawing on an existing DOM image, not just module registration.
 const result=await renderPage.evaluate(async()=>{
  const image=document.createElement('img');
  const sample=document.createElement('canvas');sample.width=sample.height=128;
  const ctx=sample.getContext('2d');ctx.fillStyle='#d33';ctx.fillRect(0,0,128,128);
  image.src=sample.toDataURL('image/png');
  image.style.cssText='display:block;width:128px;height:128px';
  document.body.appendChild(image);
  await image.decode();
  window.GFD3DEngine.refresh();
  const end=Date.now()+30000;
  while(Date.now()<end){
   const holder=image.closest('[data-gfd-3d-container]');
   if(holder?.dataset.gfd3dStatus==='rendered'){
    const canvas=holder.querySelector('canvas');
    return {status:'rendered',width:canvas.width,height:canvas.height};
   }
   if(holder?.dataset.gfd3dStatus==='failed')return {status:'failed',error:holder.dataset.gfd3dError};
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  return {status:'timeout',images:document.images.length,holder:!!image.closest('[data-gfd-3d-container]'),src:image.currentSrc.slice(0,80)};
 });
 assert.equal(result.status,'rendered','3D must produce a WebGL frame: '+JSON.stringify(result));
 assert.ok(result.width>0 && result.height>0,'WebGL canvas must have real dimensions');
 console.log('3D browser render test passed:',result);
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
