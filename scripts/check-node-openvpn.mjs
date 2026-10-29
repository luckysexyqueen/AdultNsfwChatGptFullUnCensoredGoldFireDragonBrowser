// node-openvpn is an optional, legacy management-interface client, not a tunnel engine.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
try{
 const path=require.resolve('node-openvpn');
 console.log('node-openvpn available:',path);
 console.log('OpenVPN binary and management interface must be configured separately.');
}catch(error){
 console.error('node-openvpn unavailable; optional dependency may have failed installation:',error.code||error.message);
 process.exitCode=1;
}
