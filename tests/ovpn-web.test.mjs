import test from 'node:test';
import assert from 'node:assert/strict';
import {createOvpnWeb} from '../packages/ovpn-web/index.mjs';
test('exposes VPN Gate directory through existing API',async()=>{
 const client=createOvpnWeb({fetcher:async url=>({ok:true,json:async()=>({url})})});
 assert.equal((await client.listJapanServers()).url,'/api/vpngate');
});
test('refuses navigation without verified VPN forwarding',async()=>{
 let calls=0;const client=createOvpnWeb({fetcher:async()=>{calls++;return {ok:true,json:async()=>({egressVerified:true,trafficForwardingVerified:false})}}});
 await assert.rejects(client.fetchThroughVerifiedVpn('https://example.org'),/unavailable/);assert.equal(calls,1);
});
test('rejects unsafe URL schemes',async()=>{
 const client=createOvpnWeb({fetcher:async()=>{throw Error('should not fetch')}});
 await assert.rejects(client.fetchThroughVerifiedVpn('file:///etc/passwd'),/HTTP/);
});
test('forwards only after verified status',async()=>{
 const urls=[];const client=createOvpnWeb({fetcher:async url=>{urls.push(url);return {ok:true,json:async()=>({egressVerified:true,trafficForwardingVerified:true})}}});
 await client.fetchThroughVerifiedVpn('https://example.org/a?x=1');
 assert.equal(urls[1],'/api/gateway/fetch?url='+encodeURIComponent('https://example.org/a?x=1'));
});
