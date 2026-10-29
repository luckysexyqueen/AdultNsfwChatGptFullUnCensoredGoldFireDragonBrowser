import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyVpnEgress } from '../scripts/vpn-egress.mjs';
test('rejects direct outbound route even with Japanese IP', async () => {
 const state = await verifyVpnEgress({ route: async () => '1.1.1.1 via 10.0.0.1 dev eth0', lookup: async () => ({success:true,country_code:'JP'}) });
 assert.equal(state.verified,false);
});
test('rejects tunnel with non-Japan exit', async () => {
 const state = await verifyVpnEgress({ route: async () => '1.1.1.1 dev tun0', lookup: async () => ({success:true,country_code:'US'}) });
 assert.equal(state.verified,false);
});
test('accepts tunnel and verified Japan exit', async () => {
 const state = await verifyVpnEgress({ route: async () => '1.1.1.1 dev tun0', lookup: async () => ({success:true,country_code:'JP',ip:'203.0.113.1'}) });
 assert.equal(state.verified,true);
});
