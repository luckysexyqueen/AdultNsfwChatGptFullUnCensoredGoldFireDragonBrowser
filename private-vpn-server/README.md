# GoldFireDragon private VPN node
Run `npm install` then `GFD_VPN_NODE_TOKEN=... npm start` inside this folder.
The server listens on 127.0.0.1:8790 by default. Use an authenticated HTTPS reverse proxy to expose it; do not expose the raw port.
Configure the existing web gateway with GFD_VPN_NODE_URL (HTTPS) and GFD_VPN_NODE_TOKEN (same secret).
GET /health is public; GET /api/vpn/status requires Authorization: Bearer <token>.
This service does not start OpenVPN or proxy web traffic. A real host with an OpenVPN TUN route is required.
