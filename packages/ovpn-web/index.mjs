// Browser-side OVPN gateway client. Browser JS cannot create a TUN/OpenVPN tunnel.
const normalizeBase = value => {
  const url = new URL(value, 'https://example.invalid');
  if (!['http:','https:'].includes(url.protocol)) throw new TypeError('HTTP(S) gateway required');
  if (url.username || url.password) throw new TypeError('Credentials in URL forbidden');
  return url.origin === 'https://example.invalid' ? '' : url.origin;
};
export function createOvpnWeb({baseUrl='',fetcher=globalThis.fetch}={}){
  const base=normalizeBase(baseUrl);
  async function request(path){
    const response=await fetcher(base+path,{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('OVPN gateway HTTP '+response.status);
    return response.json();
  }
  return Object.freeze({
    listJapanServers:()=>request('/api/vpngate'),
    vpnStatus:()=>request('/api/vpn/status'),
    gatewayStatus:()=>request('/api/gateway/status'),
    async fetchThroughVerifiedVpn(url){
      const target=new URL(url);
      if(!['http:','https:'].includes(target.protocol))throw new TypeError('HTTP(S) URL required');
      const status=await request('/api/vpn/status');
      if(status.egressVerified!==true||status.trafficForwardingVerified!==true)throw new Error('Verified VPN forwarding unavailable');
      return fetcher(base+'/api/gateway/fetch?url='+encodeURIComponent(target.href),{method:'GET',credentials:'same-origin',redirect:'error'});
    }
  });
}
