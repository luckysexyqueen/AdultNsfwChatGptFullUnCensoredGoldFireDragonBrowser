// VPN Gate Japan directory discovery. No VPN execution or exposure of OVPN configs to browsers.
export function parseCsvRow(line) {
  const cells=[]; let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}
    else if(c==='"') quoted=!quoted;
    else if(c===','&&!quoted){cells.push(value);value='';}
    else value+=c;
  }
  cells.push(value);return cells;
}
export function parseJapanServers(csv) {
  const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const header=lines.find(x=>x.startsWith('#HostName,'));
  if(!header) throw Error('VPN Gate CSV header missing');
  const keys=parseCsvRow(header.slice(1));const result=[];
  for(const line of lines){
    if(line.startsWith('#')||line.startsWith('*'))continue;
    const fields=parseCsvRow(line);
    if(fields.length!==keys.length)continue;
    const item=Object.fromEntries(keys.map((k,i)=>[k,fields[i]]));
    if(item.CountryShort!=='JP'||!item.OpenVPN_ConfigData_Base64)continue;
    const ip=item.IP||'';
    if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)||ip.split('.').some(x=>Number(x)>255))continue;
    result.push({host:item.HostName,ip,country:'JP',speed:Number(item.Speed)||0,ping:Number(item.Ping)||9999,sessions:Number(item.NumVpnSessions)||0,configBase64:item.OpenVPN_ConfigData_Base64});
  }
  return result.sort((a,b)=>(b.speed-a.speed)||(a.ping-b.ping));
}
export async function fetchJapanServers({fetcher=fetch}={}){
  let lastError;
  for(const source of ['https://www.vpngate.net/api/iphone/','https://www.vpngate.net/api/iphone']){
    try{
      const response=await fetcher(source,{signal:AbortSignal.timeout(12000),headers:{Accept:'text/plain'}});
      if(!response.ok)throw Error('VPN Gate directory HTTP '+response.status);
      const data=await response.text();
      if(data.length>12_000_000)throw Error('VPN Gate directory too large');
      return parseJapanServers(data);
    }catch(error){lastError=error;}
  }
  throw lastError;
}
export function publicJapanServers(servers){
  return servers.map(({host,ip,country,speed,ping,sessions})=>({host,ip,country,speed,ping,sessions}));
}
