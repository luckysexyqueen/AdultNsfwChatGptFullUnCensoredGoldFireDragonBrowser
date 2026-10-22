#!/usr/bin/env node
// Host-side Linux OpenVPN setup. Requires pre-existing administrator authorization.
import {spawnSync} from 'node:child_process';
import {existsSync, statSync} from 'node:fs';
const install=process.env.GFD_VPN_INSTALL_SYSTEM==='1';
const configure=process.env.GFD_VPN_CONFIGURE_TUN==='1';
const exec=(cmd,args)=>spawnSync(cmd,args,{stdio:'inherit'});
const root=process.getuid?.()===0;
const privileged=(cmd,args)=>root?exec(cmd,args):exec('sudo',['-n',cmd,...args]);
function checkTun(){
 if(!existsSync('/dev/net/tun'))return false;
 try {const s=statSync('/dev/net/tun');return s.isCharacterDevice() && s.rdev===((10<<8)|200);}catch{return false;}
}
if(process.platform!=='linux'){console.error('Linux host required; browsers cannot create kernel TUN devices.');process.exit(2);}
if(install){
 if(privileged('apt-get',['update']).status!==0||privileged('apt-get',['install','-y','openvpn','iproute2','kmod']).status!==0)process.exit(2);
}
if(configure){
 // Only succeeds on a host that already grants root/sudo, module loading and device access.
 if(privileged('modprobe',['tun']).status!==0){console.error('TUN module loading denied by host.');process.exit(2);}
 if(privileged('mkdir',['-p','/dev/net']).status!==0)process.exit(2);
 if(!existsSync('/dev/net/tun')&&privileged('mknod',['/dev/net/tun','c','10','200']).status!==0)process.exit(2);
 if(privileged('chmod',['600','/dev/net/tun']).status!==0)process.exit(2);
}
const binary=exec('sh',['-c','command -v openvpn >/dev/null 2>&1']);
const tun=checkTun();
console.log(JSON.stringify({openvpnInstalled:binary.status===0,tunDeviceReady:tun,hostPrivilegeRequired:true,netAdminRequiredForTunnel:true}));
if(binary.status!==0||!tun)process.exitCode=2;
