#!/usr/bin/env python3
"""Read-only release version lock validation. No network, no mutations."""
import json, pathlib, sys
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else ".")
fixed="1.35.9"
for name in ("plugin.json",".codex-plugin/plugin.json"):
    path=root/name
    try:
        actual=json.loads(path.read_text(encoding="utf-8"))["version"]
    except Exception as e:
        print(f"FAIL {name}: {e}",file=sys.stderr);sys.exit(2)
    if actual!=fixed:
        print(f"FAIL {name}: {actual} != {fixed}",file=sys.stderr);sys.exit(1)
print("PASS: both manifests pinned to 1.35.9 (policy validation only)")
