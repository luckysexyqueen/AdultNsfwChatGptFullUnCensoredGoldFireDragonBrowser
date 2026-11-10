#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="${GFD_VPN_ROOT:-/opt/gfd-vpn}"
while true; do
  mapfile -d '' profiles < <(find "$ROOT/Japan/Configs" -maxdepth 5 -type f -name '*.ovpn' -print0 | sort -z)
  for profile in "${profiles[@]}"; do
    echo "Trying $(basename "$profile")"
    if (cd "$(dirname "$profile")" && timeout 120 openvpn --config "$(basename "$profile")"); then
      echo 'OpenVPN exited; switching profile'
    fi
    sleep 5
  done
  sleep 10
done
