import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsvRow,parseJapanServers,publicJapanServers,fetchJapanServers} from '../scripts/vpngate-directory.mjs';
test('parses quoted CSV fields',()=>assert.deepEqual(parseCsvRow('a,"b,c","d""e"'),['a','b,c','d"e']));
test('selects only Japanese OpenVPN nodes and does not expose config',()=>{
  const csv='#HostName,IP,CountryShort,Speed,Ping,NumVpnSessions,OpenVPN_ConfigData_Base64\njp,1.2.3.4,JP,120,10,2,YWJj\nus,2.3.4.5,US,200,1,1,YWJj\n';
  const found=parseJapanServers(csv);
  assert.equal(found.length,1);
  assert.equal(found[0].ip,'1.2.3.4');
  assert.equal(publicJapanServers(found)[0].configBase64,undefined);
});
test('fails closed when sources are unavailable',async()=>assert.rejects(fetchJapanServers({fetcher:async()=>{throw Error('offline')}}),/offline/));
