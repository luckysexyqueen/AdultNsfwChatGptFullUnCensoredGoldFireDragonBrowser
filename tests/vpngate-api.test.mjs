import test from 'node:test';
import assert from 'node:assert/strict';
import {listJapanServers} from '../packages/vpngate-api/index.mjs';
test('npm adapter returns only public Japan metadata and caches directory',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return {ok:true,text:async()=> '#HostName,IP,CountryShort,Speed,Ping,NumVpnSessions,OpenVPN_ConfigData_Base64\njp,1.2.3.4,JP,100,10,2,YWJj\nus,2.3.4.5,US,200,1,1,YWJj\n'};};
  const first=await listJapanServers({fetcher,now:1000000});
  const second=await listJapanServers({fetcher,now:1001000});
  assert.equal(calls,1);
  assert.equal(first.servers.length,1);
  assert.equal(first.servers[0].country,'JP');
  assert.equal(JSON.stringify(first).includes('YWJj'),false);
  assert.equal(second.cached,true);
});
