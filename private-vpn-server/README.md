# GoldFireDragon private VPN node
Install: `npm install`. Start: `npm start`.
By default the server listens on 127.0.0.1:8790, not the public internet.
GET /health and GET /api/vpn/public-status require no password or token. Public status is read-only, exposes no VPN IP or configuration, and cannot start/stop a VPN.
GET /api/vpn/status is an internal endpoint requiring Authorization: Bearer <GFD_VPN_NODE_TOKEN>.
For the existing web gateway, configure GFD_VPN_NODE_URL with an HTTPS URL and GFD_VPN_NODE_TOKEN with the matching server secret. This is server-to-server authentication, not a user password.
Do not publicly expose /api/vpn/status without access controls. This service does not create an OpenVPN tunnel or proxy traffic.
