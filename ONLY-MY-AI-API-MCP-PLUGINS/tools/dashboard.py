"""Loopback-only dashboard with copyable MCP URL once a real origin is supplied."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import html
import json
import os
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.engine import registry
from tools.mcp_url import endpoint

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/', '/status'):
            self.send_error(404)
            return
        ops, errors, version = registry()
        configured = os.getenv('PUBLIC_MCP_ORIGIN', '')
        try:
            url = endpoint(configured) if configured else None
            url_error = None
        except ValueError as exc:
            url = None
            url_error = str(exc)
        status = {'operations': len(ops), 'errors': errors, 'spec_version': version,
                  'operation_names': list(ops), 'mcp_url': url, 'url_error': url_error,
                  'deployment_verified': False}
        if self.path == '/status':
            body = json.dumps(status, ensure_ascii=False, indent=2).encode()
            kind = 'application/json; charset=utf-8'
        else:
            display = html.escape(url or 'No deployed MCP URL configured')
            note = 'A URL is shown only after PUBLIC_MCP_ORIGIN is set. This does not verify that a server is live.'
            safe_status = html.escape(json.dumps(status, ensure_ascii=False, indent=2))
            body = ('''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spec Direct MCP</title><style>body{font:16px system-ui;max-width:850px;margin:40px auto;padding:0 20px}input{width:75%;padding:12px}button{padding:12px;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:16px;border-radius:8px}</style><h1>Spec Direct MCP URL</h1><p>''' + html.escape(note) + '''</p><input id="url" readonly aria-label="MCP URL" value="''' + display.replace('"','&quot;') + '''"><button id="copy" type="button" ''' + ('disabled' if not url else '') + '''>Copy MCP URL</button><p id="message" role="status"></p><h2>OpenAPI Registry</h2><pre>''' + safe_status + '''</pre><script>document.getElementById('copy').addEventListener('click',async()=>{const value=document.getElementById('url').value;try{await navigator.clipboard.writeText(value);document.getElementById('message').textContent='Copied';}catch(e){document.getElementById('url').select();document.getElementById('message').textContent='Select and copy the URL manually';}});</script></html>''').encode()
            kind = 'text/html; charset=utf-8'
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    print('Local dashboard: http://127.0.0.1:8765')
    ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
