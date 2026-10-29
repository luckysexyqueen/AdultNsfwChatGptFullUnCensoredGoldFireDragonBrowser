# Google-only Japan IP proxy

This is a dedicated authenticated HTTP service for a **Japan-hosted** VPS. Deploying this source to Cloudflare Workers or a non-Japanese machine **does not** give it a Japanese IP.

## Japan VPS setup (Node.js 20+)
```bash
cd japan-ip-proxy
export JP_PROXY_TOKEN="$(openssl rand -hex 32)"
export PORT=8080
node server.mjs
```
Put a TLS reverse proxy (e.g. Caddy) in front of port 8080, using a domain that resolves to your Japanese VPS. Do not expose port 8080 publicly; firewall it or bind it to localhost behind a reverse proxy.

Example Caddyfile:
```
jp-proxy.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Configure the existing Cloudflare Worker secrets and variables:
```bash
cd cloudflare-gateway
npx wrangler secret put JP_PROXY_TOKEN
npx wrangler secret put JP_SERVER_ORIGIN
# JP_SERVER_ORIGIN value example: https://jp-proxy.example.com
npx wrangler deploy
```
Use the **same token** on the VPS and in the Worker. `JP_SERVER_ORIGIN` must be the public HTTPS origin of the Japanese VPS, not localhost and not the Cloudflare Worker URL.

## Verification
1. On the Japan VPS, run `curl -4 https://api.ipify.org` and verify its IP geolocation with your hosting provider or independent lookup. The proxy itself cannot prove geolocation.
2. `curl https://jp-proxy.example.com/health` must return `ok:true`.
3. From a trusted shell: `curl -i -H "Authorization: Bearer $JP_PROXY_TOKEN" "https://jp-proxy.example.com/search?q=Tokyo"`.
4. Test the Worker route: `curl -i "https://goldfiredragon-jp-web-gateway.choluckyhexsexyqueen.workers.dev/api/jp/search-html?q=Tokyo"`.
5. Google may still rate-limit or challenge VPS traffic. A Japan IP does not guarantee scraping access.

No Google alternatives are used. If the upstream proxy is unavailable, the Worker redirects the browser to Google Japan directly.
