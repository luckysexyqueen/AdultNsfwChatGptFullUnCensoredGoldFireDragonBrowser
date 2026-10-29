#!/usr/bin/env bash
# GoldFireDragon Linux OpenVPN 24/7 supervisor. Install on an owned Linux host.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${GFD_OVPN_PROFILE:-}"
CHECK_INTERVAL="${GFD_VPN_CHECK_INTERVAL:-30}"
START_TIMEOUT="${GFD_VPN_START_TIMEOUT:-90}"
case "${1:-run}" in
  install)
    [[ "$EUID" -eq 0 ]] || { echo "Run install as root (sudo)." >&2; exit 1; }
    command -v systemctl >/dev/null
    for bin in openvpn ip curl python3; do command -v "$bin" >/dev/null || { echo "Missing: $bin" >&2; exit 1; }; done
    [[ -c /dev/net/tun ]] || { echo "Missing /dev/net/tun" >&2; exit 1; }
    cat >/etc/systemd/system/goldfiredragon-vpn.service <<EOF
[Unit]
Description=GoldFireDragon 24/7 Japan OpenVPN with egress watchdog
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=/bin/bash $ROOT/scripts/vpn-24x7.sh run
Restart=always
RestartSec=10
TimeoutStopSec=20
KillMode=control-group
Environment=GFD_VPN_CHECK_INTERVAL=30

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable goldfiredragon-vpn.service
    systemctl restart goldfiredragon-vpn.service
    echo "Installed. Check: systemctl status goldfiredragon-vpn.service"
    ;;
  run)
    command -v openvpn >/dev/null
    command -v ip >/dev/null
    command -v curl >/dev/null
    command -v python3 >/dev/null
    [[ -c /dev/net/tun ]] || { echo "TUN device missing" >&2; exit 1; }
    if [[ -z "$PROFILE" ]]; then
      PROFILE="$(find "$ROOT/Japan/Configs" -maxdepth 3 -type f -name '*.ovpn' ! -path '*/Private/*' | LC_ALL=C sort | head -n 1)"
    fi
    [[ -n "$PROFILE" ]] || { echo "No OVPN profile in Japan/Configs" >&2; exit 1; }
    [[ "$PROFILE" = /* ]] || PROFILE="$ROOT/$PROFILE"
    [[ -f "$PROFILE" ]] || { echo "OVPN profile not found" >&2; exit 1; }
    # No credentials or profile contents are printed to logs.
    LOG="$(mktemp)"
    openvpn --config "$PROFILE" --script-security 1 >"$LOG" 2>&1 &
    VPN_PID=$!
    cleanup() { kill "$VPN_PID" 2>/dev/null || true; wait "$VPN_PID" 2>/dev/null || true; rm -f "$LOG"; }
    trap cleanup EXIT
    trap 'exit 143' TERM INT
    ready=0
    for ((i=0; i<START_TIMEOUT; i++)); do
      kill -0 "$VPN_PID" 2>/dev/null || { echo "OpenVPN terminated before initialization" >&2; exit 1; }
      if grep -q 'Initialization Sequence Completed' "$LOG"; then ready=1; break; fi
      sleep 1
    done
    [[ "$ready" -eq 1 ]] || { echo "OpenVPN initialization timeout" >&2; exit 1; }
    while kill -0 "$VPN_PID" 2>/dev/null; do
      route="$(ip -4 route get 1.1.1.1)" || exit 1
      [[ "$route" =~ dev[[:space:]]+(tun[0-9]+|tap[0-9]+) ]] || { echo "VPN tunnel is not the IPv4 outbound route" >&2; exit 1; }
      ipaddr="$(curl -4fsS --max-time 12 https://api.ipify.org)" || exit 1
      [[ "$ipaddr" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
      country="$(curl -4fsS --max-time 12 "https://ipwho.is/$ipaddr" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("country_code","") if d.get("success") else "")')" || exit 1
      [[ "$country" == JP ]] || { echo "VPN egress is not verified as Japan" >&2; exit 1; }
      echo "VPN healthy: Japanese IPv4 egress verified via tunnel"
      sleep "$CHECK_INTERVAL" &
      wait $! || true
    done
    echo "OpenVPN process exited" >&2
    exit 1
    ;;
  *)
    echo "Usage: sudo bash scripts/vpn-24x7.sh install | bash scripts/vpn-24x7.sh run" >&2
    exit 2
    ;;
esac
