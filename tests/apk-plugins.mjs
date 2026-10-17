// Real-browser plugin checks against file:// assets, with network unavailable.
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const { chromium } = await import(process.env.GFD_PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.GFD_STATIC_ROOT || fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({headless:true,...(process.env.GFD_BROWSER_CHANNEL?{channel:process.env.GFD_BROWSER_CHANNEL}:{})});
try {
  for(const blockedStorage of [false,true]) {
    const context=await browser.newContext({viewport:{width:375,height:812},offline:true});
    if(blockedStorage) await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Storage disabled');}}));
    const page=await context.newPage();
    for(const entry of ['index.html','GoldFireDragonBrowser.html']) {
      await page.goto(pathToFileURL(path.join(root,entry)).href,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GFDPluginsReady);
      await page.evaluate(()=>GFDPluginsReady);
      assert.equal(await page.evaluate(()=>GFDPlugins.list().length),3);
      await page.locator('#gfd-plugin-controls .menu > summary').click();
      const visible=await page.evaluate(()=>{
        const r=document.querySelector('#gfd-plugin-controls').shadowRoot;
        const bounds=r.querySelector('.plugin-list').getBoundingClientRect();
        return [...r.querySelectorAll('strong')].every(e=>e.getBoundingClientRect().top>=bounds.top && e.getBoundingClientRect().bottom<=bounds.bottom);
      });
      assert.equal(visible,true);
      const controls=page.locator('#gfd-plugin-controls input');
      for(let index=0;index<3;index++) {
        await controls.nth(index).check();
        assert.equal(await page.evaluate(i=>GFDPlugins.list()[i].enabled,index),true);
      }
      assert.equal(await page.evaluate(()=>(GFDPlugins.extendInstructions('Original').match(/\[Website plugin:/g)||[]).length),3);
      if(!blockedStorage) {
        await page.reload({waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.GFDPluginsReady);
        await page.evaluate(()=>GFDPluginsReady);
        assert.equal(await page.evaluate(()=>GFDPlugins.list().every(p=>p.enabled)),true);
        await page.locator('#gfd-plugin-controls .menu > summary').click();
      }
      for(let index=0;index<3;index++) await controls.nth(index).uncheck();
      assert.equal(await page.evaluate(()=>GFDPlugins.extendInstructions('Original')),'Original');
    }
    await context.close();
  }
  console.log('PASS: offline file:// both entrypoints; 3 visible plugins; toggles, all contexts, persistence and blocked storage');
} finally {await browser.close();}
