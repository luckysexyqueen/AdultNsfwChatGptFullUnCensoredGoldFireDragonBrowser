import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateVpnServer } from '../private-vpn-server/server.mjs';
test('status API requires token and fails closed',async()=>{
 const app=createPrivateVpnServer({token:'secret',verify:async()=>({verified:false,reason:'no tun'})});
 const srv=app.listen(0,'127.0.0.1');
 try{
  const base='http://127.0.0.1:'+srv.address().port;
  assert.equal((await fetch(base+'/api/vpn/status')).status,401);
  const response=await fetch(base+'/api/vpn/status',{headers:{Authorization:'Bearer secret'}});
  const data=await response.json();
  assert.equal(data.connected,false);
  assert.equal(data.egressVerified,false);
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
test('only verified JP route reports connected',async()=>{
 const app=createPrivateVpnServer({token:'secret',verify:async()=>({verified:true,country:'JP',ip:'1.2.3.4'})});
 const srv=app.listen(0,'127.0.0.1');
 try{
  const r=await fetch('http://127.0.0.1:'+srv.address().port+'/api/vpn/status',{headers:{Authorization:'Bearer secret'}});
  assert.equal((await r.json()).connected,true);
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
