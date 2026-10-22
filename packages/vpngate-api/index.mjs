// npm-installable local VPN Gate API adapter. Read-only server directory, no VPN tunnel.
import { fetchJapanServers, publicJapanServers } from '../../scripts/vpngate-directory.mjs';
let cache = null, cachedAt = 0, pending = null;
export async function listJapanServers({fetcher=fetch,now=Date.now(),ttlMs=300000}={}){
  if(cache && now-cachedAt>=0 && now-cachedAt<ttlMs)return {servers:publicJapanServers(cache),cached:true,updatedAt:new Date(cachedAt).toISOString()};
  if(!pending)pending=fetchJapanServers({fetcher}).then(servers=>{cache=servers;cachedAt=now;return servers;}).finally(()=>{pending=null;});
  const servers=await pending;
  return {servers:publicJapanServers(servers),cached:false,updatedAt:new Date(cachedAt).toISOString()};
}
