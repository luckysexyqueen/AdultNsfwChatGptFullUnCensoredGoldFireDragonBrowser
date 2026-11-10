import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateVpnServer} from '../private-vpn-server/server.mjs';
test('passwordless public status is read-only and redacted',async()=>{
 const app=createPrivateVpnServer({token:'secret',verify:async()=>({verified:true,country:'JP',ip:'1.2.3.4'})});
 const srv=app.listen(0,'127.0.0.1');
 try{
  const base='http://127.0.0.1:'+srv.address().port;
  const response=await fetch(base+'/api/vpn/public-status');
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.connected,true);
  assert.equal(body.egressIp,undefined);
  assert.equal((await fetch(base+'/api/vpn/status')).status,401);
  assert.equal((await fetch(base+'/api/vpn/control/start',{method:'POST'})).status,404);
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
test('internal status still requires server token and fails closed',async()=>{
 const app=createPrivateVpnServer({token:'secret',verify:async()=>({verified:false,reason:'no tun'})});
 const srv=app.listen(0,'127.0.0.1');
 try{
  const base='http://127.0.0.1:'+srv.address().port;
  assert.equal((await fetch(base+'/api/vpn/status')).status,401);
  const response=await fetch(base+'/api/vpn/status',{headers:{Authorization:'Bearer secret'}});
  const data=await response.json();
  assert.equal(data.connected,false);
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
