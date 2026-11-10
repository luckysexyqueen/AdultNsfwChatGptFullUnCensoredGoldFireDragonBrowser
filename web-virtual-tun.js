// Browser-only virtual network adapter. This is NOT a kernel TUN or VPN.
// Only explicitly requested HTTP(S) requests can be routed through a trusted gateway.
export class WebVirtualTun {
  #endpoint;
  #enabled=false;
  constructor(endpoint='/api/jp/search') {
    const url=new URL(endpoint,location.href);
    if(url.origin!==location.origin) throw new Error('Gateway must be same-origin');
    this.#endpoint=url.pathname;
  }
  get status(){return {mode:'web-http-adapter',enabled:this.#enabled,osTunnel:false,ipProtected:false};}
  async check(){
    const response=await fetch('/api/jp/status',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('Gateway unavailable: '+response.status);
    const data=await response.json();
    return {available:!!data.configured,verifiedJapaneseExit:false};
  }
  async enable(){
    const state=await this.check();
    if(!state.available)throw new Error('Japanese HTTPS gateway is not configured');
    this.#enabled=true;
    return this.status;
  }
  disable(){this.#enabled=false;return this.status;}
  async search(query){
    if(!this.#enabled)throw new Error('Web adapter disabled');
    const q=String(query).trim();
    if(!q)throw new Error('Search query required');
    const url=this.#endpoint+'?q='+encodeURIComponent(q);
    const response=await fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Gateway request failed: '+response.status);
    return response;
  }
}
export const webVirtualTun=new WebVirtualTun();
