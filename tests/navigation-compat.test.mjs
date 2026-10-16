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
