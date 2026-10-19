#!/usr/bin/env node
// Install the OpenVPN userspace binary where system package management is available.
// A TUN device is a kernel resource; npm cannot create it in a restricted host.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const run=(cmd,args)=>spawnSync(cmd,args,{stdio:'inherit'});
if(process.platform!=='linux'){console.error('Linux only: use the native VPN integration on other platforms.');process.exitCode=2;}
else{
 const found=run('sh',['-c','command -v openvpn >/dev/null 2>&1']);
 if(found.status!==0){
   if(process.env.GFD_VPN_INSTALL_SYSTEM!=='1'){
     console.error('OpenVPN not installed. Run GFD_VPN_INSTALL_SYSTEM=1 npm run vpn:install on an authorized Linux host.');
     process.exitCode=2;
   }else{
     const root=process.getuid?.()===0;
     const prefix=root?[]:['-n'];
     const cmd=root?'apt-get':'sudo';
     const invoke=(args)=>root?run('apt-get',args):run('sudo',['-n','apt-get',...args]);
     if(invoke(['update']).status!==0 || invoke(['install','-y','openvpn','iproute2']).status!==0) process.exitCode=2;
   }
 }
 if(!existsSync('/dev/net/tun')){console.error('TUN unavailable: host must expose /dev/net/tun and grant NET_ADMIN.');process.exitCode=2;}
 else console.log('TUN device exists; VPN handshake and routing still require live verification.');
}
