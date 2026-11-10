#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="${GFD_VPN_ROOT:-/opt/gfd-vpn}"
INTERVAL="${GFD_VPN_CHECK_INTERVAL:-30}"
TIMEOUT="${GFD_VPN_START_TIMEOUT:-90}"
child=''
cleanup() { if [[ -n "$child" ]]; then kill "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi; }
trap 'cleanup; exit 0' TERM INT
while true; do
  profiles=()
  if [[ -n "${GFD_OVPN_PROFILE:-}" ]]; then
    preferred="$GFD_OVPN_PROFILE"
    [[ "$preferred" = /* ]] || preferred="$ROOT/$preferred"
    [[ -f "$preferred" ]] && profiles+=("$preferred")
  fi
  while IFS= read -r -d '' p; do
    [[ "$p" == "${profiles[0]:-}" ]] || profiles+=("$p")
  done < <(find "$ROOT/Japan/Configs" -maxdepth 5 -type f -name '*.ovpn' -print0 | sort -z)
  if (( ${#profiles[@]} == 0 )); then echo 'No OVPN profiles available' >&2; sleep 15; continue; fi
  for profile in "${profiles[@]}"; do
    log="$(mktemp)"
    echo "Connecting profile $(basename "$profile")"
    (cd "$(dirname "$profile")" && exec openvpn --config "$(basename "$profile")" --script-security 1) >"$log" 2>&1 &
    child=$!
    ready=0
    for ((i=0;i<TIMEOUT;i++)); do
      kill -0 "$child" 2>/dev/null || break
      if grep -q 'Initialization Sequence Completed' "$log"; then ready=1; break; fi
      sleep 1
    done
    if (( ready )); then
      while kill -0 "$child" 2>/dev/null; do
        route="$(ip -4 route get 1.1.1.1 || :)"
        [[ "$route" =~ dev[[:space:]]+(tun[0-9]+|tap[0-9]+) ]] || break
        ip="$(curl -4fsS --max-time 12 https://api.ipify.org || :)"
        [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || break
        country="$(curl -4fsS --max-time 12 "https://ipwho.is/$ip" | python3 -c 'import json,sys; x=json.load(sys.stdin); print(x.get("country_code","") if x.get("success") else "")' || :)"
        [[ "$country" == JP ]] || break
        echo 'PASS: Japan egress verified'
        sleep "$INTERVAL" & wait $! || :
      done
    fi
    echo 'VPN failed validation; rotating profile' >&2
    cleanup; child=''
    rm -f "$log"
    sleep 5
  done
done
