#!/usr/bin/env python3
"""Local-only website integration mock; DOES NOT run or load an AI model."""
import argparse, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404); return
        length=int(self.headers.get("Content-Length","0"))
        if length<1 or length>16384:
            self.send_error(413); return
        try:
            payload=json.loads(self.rfile.read(length))
            if not isinstance(payload.get("message"),str): raise ValueError()
        except (ValueError,UnicodeError):
            self.send_error(400); return
        body=json.dumps({"error":"model_not_connected","message":"Connect a user-approved local model runner to this backend first."}).encode()
        self.send_response(501); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body))); self.end_headers(); self.wfile.write(body)
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--port",type=int,default=8765)
    a=p.parse_args()
    print("Mock backend on 127.0.0.1; no model inference, no public exposure.")
    ThreadingHTTPServer(("127.0.0.1",a.port),Handler).serve_forever()
