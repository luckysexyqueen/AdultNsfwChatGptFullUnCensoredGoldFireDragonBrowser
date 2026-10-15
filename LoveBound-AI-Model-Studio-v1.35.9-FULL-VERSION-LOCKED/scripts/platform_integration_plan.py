#!/usr/bin/env python3
"""Offline, read-only platform integration plan generator."""
import argparse, json
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='custom/platform_integrations/platforms.json')
    parser.add_argument('--provider', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding='utf-8'))
    match = next((p for p in config['providers'] if p['id'] == args.provider), None)
    if match is None:
        parser.error('unknown provider')
    output = Path(args.output)
    if output.exists():
        parser.error('output already exists; original reports must not be overwritten')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({
        'provider':match, 'status':'not_connected_or_tested',
        'steps':['import user-approved files or exported ZIP', 'snapshot and hash originals',
                 'inspect dependencies and platform capabilities',
                 'stage adapter and configuration', 'run user-authorized tests',
                 'review changes before deployment'],
        'cautions':['do not bundle API keys', 'do not assume remote service access',
                    'a static site needs a separate model backend']
    }, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
