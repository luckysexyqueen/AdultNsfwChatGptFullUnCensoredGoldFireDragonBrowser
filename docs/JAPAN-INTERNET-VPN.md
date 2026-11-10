# GoldFireDragon Browser — Japan Internet VPN + Node.js web gateway

The web gateway is an HTTPS allowlist proxy, **not** an operating-system VPN. To route its outgoing traffic via a Japan VPN, install and connect WireGuard or OpenVPN **on the machine running Node.js**, using credentials/configuration from a trusted VPN provider.

## 1. Connect a Japan VPN on the Node.js host

Use your VPN provider's official application or a valid Japan exit-node WireGuard/OpenVPN profile. Do not commit VPN keys, .ovpn credentials, or WireGuard private keys to GitHub.

Verify the host's public egress IP and geolocation **before** relying on Japan routing. A configured region label does not prove a Japanese IP. DNS routing and IPv6 leakage should also be tested using your provider's recommended tools.

## 2. Start the web gateway

Linux/macOS:

```sh
GFD_PROXY_ALLOWED_ORIGINS="https://www.google.co.jp,https://example.com" \
GFD_DEPLOYMENT_REGION="JP" \
node scripts/web-gateway.mjs
```

PowerShell:

```powershell
$env:GFD_PROXY_ALLOWED_ORIGINS = "https://www.google.co.jp,https://example.com"
$env:GFD_DEPLOYMENT_REGION = "JP"
node scripts/web-gateway.mjs
```

Visit http://127.0.0.1:8787/ and check the VPN dialog's web gateway status. The API `/api/gateway/fetch?url=https%3A%2F%2Fwww.google.co.jp%2F` forwards only allowlisted HTTPS GET requests; it does **not** transparently tunnel arbitrary browser traffic, render proxied third-party websites, or guarantee Japanese IP.

## 3. Security and deployment

The server binds to localhost by default. Do not expose the gateway to the public Internet without TLS, authentication, rate limits, network egress restrictions, and SSRF protection. `GFD_GATEWAY_TOKEN` can require an API token for fetch requests but is not a substitute for a complete production security setup. Keep the gateway behind a trusted authenticated reverse proxy.

For all-device VPN on Android/Windows, use native OS VPN permission and a native VPN client. The static GitHub Pages site cannot start a VPN tunnel.
