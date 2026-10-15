"""Generate a copyable MCP endpoint from an actual deployment origin.
A spec file alone is not a hosted MCP URL.
"""
import argparse
import json
import os
from urllib.parse import urlsplit, urlunsplit


def endpoint(origin: str) -> str:
    p = urlsplit(origin.strip())
    if p.scheme != 'https' or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError('A deployed HTTPS origin is required, without credentials, query or fragment')
    if p.port not in (None, 443):
        raise ValueError('A public HTTPS endpoint must use port 443')
    if p.hostname.lower() in {'localhost', '127.0.0.1', 'example.com', 'your-host'}:
        raise ValueError('Provide your real deployed hostname, not a placeholder')
    path = p.path.rstrip('/')
    if not path.endswith('/mcp'):
        path += '/mcp'
    return urlunsplit(('https', p.netloc, path, '', ''))


def registration(url: str) -> dict:
    return {'name': 'spec-direct-auto-inject', 'url': url, 'transport': 'streamable-http',
            'note': 'Requires a running server and explicit account authorization. Configure credentials in the client, not this JSON.'}


def main():
    parser = argparse.ArgumentParser(description='Prepare a copyable MCP URL from your real cloud deployment')
    parser.add_argument('--origin', default=os.getenv('PUBLIC_MCP_ORIGIN'))
    parser.add_argument('--json', action='store_true', help='Print connector registration JSON')
    args = parser.parse_args()
    if not args.origin:
        parser.error('Set --origin https://your-real-deployment or PUBLIC_MCP_ORIGIN')
    try:
        url = endpoint(args.origin)
    except ValueError as e:
        parser.error(str(e))
    print(json.dumps(registration(url), ensure_ascii=False, indent=2) if args.json else url)

if __name__ == '__main__':
    main()
