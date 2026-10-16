import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../inapp-browser.js',import.meta.url),'utf8');
function shell(href='https://app.test/sub/index.html', extras={}) {
  const navigations=[]; const events={}; const popups=[];
  const document={baseURI:href,addEventListener:(name,fn)=>events[name]=fn};
  const window={location:{href,assign:url=>navigations.push(url)},document,
    open:(...args)=>popups.push(args),...extras};
  window.parent ??= window;
  vm.runInNewContext(source,{window,document,URL,console});
  return {window,navigations,events,popups};
}
test('Gecko receives object URL and preserves shell',async()=>{
  const calls=[];
  const s=shell(undefined,{Capacitor:{Plugins:{GeckoView:{open:async arg=>calls.push(arg)}}}});
  assert.equal(await s.window.GFDInAppBrowser.open('https://example.org/'),'https://example.org/');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{url:'https://example.org/'}]);
  assert.equal(s.navigations.length,0);
});
test('late injection and parent Gecko take priority over generic Electron',async()=>{
  const s=shell(); const calls=[];
  s.window.parent={document:{},Capacitor:{Plugins:{GeckoView:{open:async()=>calls.push('gecko')}}}};
  s.window.GoldFireNative={inAppOpen:async()=>calls.push('electron')};
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(calls,['gecko']);
});
test('native rejection falls through to another adapter',async()=>{
  const s=shell(undefined,{Capacitor:{Plugins:{GeckoView:{open:async()=>{throw Error('unavailable');}}}},GoldFireNative:{inAppOpen:async()=>({opened:true})}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.equal(s.navigations.length,0);
});
test('failed native result navigates accessible top shell, not iframe',async()=>{
  const moved=[];
  const s=shell(undefined,{GoldFireNative:{inAppOpen:async()=>({opened:false})},parent:{document:{},location:{assign:url=>moved.push(url)}}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(moved,['https://example.org/']);
  assert.equal(s.navigations.length,0);
});
test('invalid and non-web targets do not throw or enter native bridge',async()=>{
  const s=shell();
  for(const value of ['',null,{},'http://[','javascript:alert(1)','file:///secret']) assert.equal(await s.window.GFDInAppBrowser.open(value),null);
  assert.equal(s.navigations.length,0);
});
test('file APK local popup remains local, named web frames retain native semantics',()=>{
  const s=shell('file:///android_asset/index.html');
  s.window.open('GoldFireDragonBrowser.html','_blank');
  assert.deepEqual(s.navigations,['file:///android_asset/GoldFireDragonBrowser.html']);
  s.window.open('https://example.org','preview');
  assert.equal(s.popups.length,1);
});
test('downloads and modified link clicks retain default behavior',()=>{
  const s=shell();
  const anchor={hasAttribute:()=>true};
  s.events.click({target:{closest:()=>anchor},preventDefault:()=>assert.fail('download intercepted')});
  s.events.click({ctrlKey:true,preventDefault:()=>assert.fail('modified click intercepted')});
});
test('both entrypoints load classic adapter early and hard search delegates',()=>{
  for (const name of ['index.html','GoldFireDragonBrowser.html']) {
    const html=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
    assert.equal(html.split('src="./inapp-browser.js"').length-1,1);
    assert.ok(html.indexOf('src="./inapp-browser.js"')<html.indexOf('</head>'));
    assert.ok(!html.includes('type="module" src="./inapp-browser.js"'));
  }
  const browser=fs.readFileSync(new URL('../GoldFireDragonBrowser.html',import.meta.url),'utf8');
  assert.ok(browser.slice(browser.indexOf('id="gfd-hard-search-router"')).includes('await window.GFDInAppBrowser.open(target)'));
});

test('Chromium Electron uses inAppOpen without requiring a Gecko bridge',async()=>{
  const calls=[];
  const s=shell('file:///C:/app/index.html',{GoldFireNative:{inAppOpen:async url=>{calls.push(url);return {opened:true};}}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(calls,['https://example.org/']);
  assert.equal(s.navigations.length,0);
});
test('Android Chromium uses standard Capacitor Browser with object options',async()=>{
  const calls=[];
  const s=shell('https://localhost/index.html',{Capacitor:{Plugins:{Browser:{open:async options=>calls.push(options)}}}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{url:'https://example.org/'}]);
  assert.equal(s.navigations.length,0);
});
test('parent embedded adapter precedes child system browser',async()=>{
  const calls=[];
  const s=shell(undefined,{Capacitor:{Plugins:{Browser:{open:async()=>calls.push('system')}}},parent:{document:{},GoldFireNative:{inAppOpen:async()=>{calls.push('embedded');return {opened:true};}}}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(calls,['embedded']);
});
test('failed Gecko and custom adapters fall through to standard Browser',async()=>{
  const calls=[];
  const s=shell(undefined,{Capacitor:{Plugins:{
    GeckoView:{open:async()=>{throw Error('not implemented');}},
    GoldFireInAppBrowser:{open:async()=>({opened:false})},
    Browser:{open:async()=>calls.push('browser')}
  }}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(calls,['browser']);
  assert.equal(s.navigations.length,0);
});
test('standard Browser rejection falls back to current Chromium window',async()=>{
  const s=shell(undefined,{Capacitor:{Plugins:{Browser:{open:async()=>{throw Error('unavailable');}}}}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(s.navigations,['https://example.org/']);
});
test('plain Chrome blank popup navigates current window without native plugins',async()=>{
  const s=shell();
  assert.equal(s.window.open('https://example.org','_blank'),null);
  await Promise.resolve();
  assert.deepEqual(s.navigations,['https://example.org/']);
  assert.equal(s.popups.length,0);
});
test('standard Browser can be injected late in the accessible parent',async()=>{
  const calls=[];const s=shell();
  s.window.parent={document:{},Capacitor:{Plugins:{Browser:{open:async()=>calls.push('parent-browser')}}}};
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(calls,['parent-browser']);
});
