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
  for (const name of ['gecko','chromium','custom']) {
    const adapter=fs.readFileSync(new URL('../webviews/'+name+'/adapter.js',import.meta.url),'utf8');
    vm.runInNewContext(adapter,{window});
  }
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

test('explicit engines coexist with independent session routing',async()=>{
  const calls=[];
  const s=shell(undefined,{GoldFireWebViews:{
    gecko:{open:async options=>{await Promise.resolve();calls.push(['gecko',options]);}},
    chromium:{open:async options=>calls.push(['chromium',options])}
  }});
  await Promise.all([
    s.window.GFDInAppBrowser.open('https://gecko.example',{engine:'gecko',sessionId:'gecko-tab-1'}),
    s.window.GFDInAppBrowser.open('https://chrome.example',{engine:'chromium',sessionId:'chrome-tab-1'})
  ]);
  const result=JSON.parse(JSON.stringify(calls)).sort((a,b)=>a[0].localeCompare(b[0]));
  assert.deepEqual(result,[
    ['chromium',{url:'https://chrome.example/',sessionId:'chrome-tab-1'}],
    ['gecko',{url:'https://gecko.example/',sessionId:'gecko-tab-1'}]
  ]);
  assert.equal(s.window.GFDInAppBrowser.getEngine(),'auto');
  assert.equal(s.navigations.length,0);
});
test('explicit engine failure does not silently swap engines or navigate shell',async()=>{
  let otherCalls=0;
  const s=shell(undefined,{GoldFireWebViews:{gecko:{open:async()=>({opened:false})},chromium:{open:async()=>otherCalls++}}});
  await assert.rejects(s.window.GFDInAppBrowser.open('https://example.org',{engine:'gecko'}),{code:'ENGINE_UNAVAILABLE'});
  assert.equal(otherCalls,0);assert.equal(s.navigations.length,0);
});
test('Chromium mode cannot be satisfied by system Custom Tabs or untyped bridges',async()=>{
  const s=shell(undefined,{GoldFireNative:{isElectron:true,inAppOpen:async()=>assert.fail('untyped engine')},Capacitor:{Plugins:{Browser:{open:async()=>assert.fail('system browser')}}}});
  await assert.rejects(s.window.GFDInAppBrowser.open('https://example.org',{engine:'chromium'}),{code:'ENGINE_UNAVAILABLE'});
});
test('explicit Chromium plugin and identified Electron receive session options',async()=>{
  for(const type of ['plugin','electron']) {
    let received;
    const extras=type==='plugin'?{Capacitor:{Plugins:{ChromiumWebView:{open:async value=>received=value}}}}:
      {GoldFireNative:{engine:'chromium',inAppOpen:async(url,options)=>{assert.equal(url,options.url);received=options;}}};
    const s=shell(undefined,extras);
    await s.window.GFDInAppBrowser.open('https://example.org',{engine:'chromium',sessionId:'c1'});
    assert.deepEqual(JSON.parse(JSON.stringify(received)),{url:'https://example.org/',sessionId:'c1'});
  }
});
test('default engine selection and per-request overrides stay independent',async()=>{
  const calls=[];
  const s=shell(undefined,{GoldFireWebViews:{gecko:{open:async()=>calls.push('g')},chromium:{open:async()=>calls.push('c')}}});
  s.window.GFDInAppBrowser.setEngine('chromium');
  await s.window.GFDInAppBrowser.open('https://example.org');
  await s.window.GFDInAppBrowser.open('https://example.org',{engine:'gecko'});
  assert.deepEqual(calls,['c','g']);assert.equal(s.window.GFDInAppBrowser.getEngine(),'chromium');
});
test('child browser inherits shell engine selection without requiring duplicate state',async()=>{
  const calls=[];
  const s=shell(undefined,{parent:{document:{},GFDInAppBrowser:{getEngine:()=> 'chromium'},GoldFireWebViews:{chromium:{open:async()=>calls.push('c')},gecko:{open:async()=>assert.fail('wrong engine')}}}});
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(calls,['c']);
});
test('invalid engine/session input fails before dispatch',async()=>{
  const s=shell();
  assert.throws(()=>s.window.GFDInAppBrowser.setEngine('other'),/Unknown browser engine/);
  await assert.rejects(s.window.GFDInAppBrowser.open('https://example.org',{engine:'other'}),/Unknown browser engine/);
  await assert.rejects(s.window.GFDInAppBrowser.open('https://example.org',{sessionId:'../../other'}),/Invalid browser sessionId/);
  assert.equal(s.navigations.length,0);
});
test('both entrypoints load separate engine adapters before the shared router',()=>{
  for(const file of ['index.html','GoldFireDragonBrowser.html']) {
    const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    const gecko=html.indexOf('src="./webviews/gecko/adapter.js"');
    const chromium=html.indexOf('src="./webviews/chromium/adapter.js"');
    assert.ok(gecko>=0 && chromium>gecko && html.indexOf('src="./inapp-browser.js"')>chromium);
  }
});

test('custom facade receives engine/session options for both engines',async()=>{
  const calls=[];
  const s=shell(undefined,{GoldFireWebViews:{custom:{open:async options=>{calls.push(options);return {opened:true,engine:options.engine};}}}});
  await Promise.all([
    s.window.GFDInAppBrowser.open('https://example.org',{engine:'gecko',sessionId:'g1'}),
    s.window.GFDInAppBrowser.open('https://example.com',{engine:'chromium',sessionId:'c1'})
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
    {url:'https://example.org/',engine:'gecko',sessionId:'g1'},
    {url:'https://example.com/',engine:'chromium',sessionId:'c1'}
  ]);
  assert.equal(s.navigations.length,0);
});
test('custom wrong-engine result is rejected without shell navigation',async()=>{
  const s=shell(undefined,{GoldFireWebViews:{custom:{open:async()=>({opened:true,engine:'chromium'})}}});
  await assert.rejects(s.window.GFDInAppBrowser.open('https://example.org',{engine:'gecko'}),{code:'ENGINE_UNAVAILABLE'});
  assert.equal(s.navigations.length,0);
});
test('custom rejection falls through only to requested native engine',async()=>{
  const calls=[];
  const s=shell(undefined,{GoldFireWebViews:{custom:{open:async()=>{throw Error('not implemented');}},gecko:{open:async()=>calls.push('gecko')},chromium:{open:async()=>assert.fail('wrong engine')}}});
  await s.window.GFDInAppBrowser.open('https://example.org',{engine:'gecko'});
  assert.deepEqual(calls,['gecko']);
});
test('custom bridge can be injected late on parent and handle auto mode',async()=>{
  let received;
  const s=shell();
  s.window.parent={document:{},GoldFireWebViews:{custom:{open:async options=>received=options}}};
  await s.window.GFDInAppBrowser.open('https://example.org');
  assert.deepEqual(JSON.parse(JSON.stringify(received)),{url:'https://example.org/',engine:'auto'});
  assert.equal(s.navigations.length,0);
});
test('entrypoints load custom adapter once before common router',()=>{
  for(const file of ['index.html','GoldFireDragonBrowser.html']){
    const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.equal(html.split('src="./webviews/custom/adapter.js"').length-1,1);
    assert.ok(html.indexOf('src="./webviews/custom/adapter.js"')<html.indexOf('src="./inapp-browser.js"'));
  }
});
