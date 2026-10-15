"""Opt-in, bounded MCP service supervisor. No arbitrary self-modifying code."""
import argparse, collections, json, os, signal, subprocess, sys, time, urllib.request
from pathlib import Path

DEFAULT = [sys.executable, '-m', 'uvicorn', 'server.mcp_server:mcp.streamable_http_app', '--host', '127.0.0.1', '--port', '8080']

def safe_health(url, timeout=3):
    if not url:
        return True
    from urllib.parse import urlsplit
    parsed = urlsplit(url)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('Health probe restricted to local HTTP loopback')
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return 200 <= response.status < 400
    except Exception:
        return False

def spec_snapshot(spec_dir):
    import hashlib
    entries=[]
    if spec_dir.is_dir():
        for path in sorted(spec_dir.iterdir()):
            if path.is_file() and path.suffix.lower() in ('.yaml','.yml','.json'):
                try:
                    stat=path.stat()
                    entries.append((path.name, stat.st_size, stat.st_mtime_ns))
                except OSError:
                    continue
    return hashlib.sha256(repr(entries).encode()).hexdigest()[:16]

def write_event(path, event, **fields):
    if not path:
        return
    path.parent.mkdir(parents=True,exist_ok=True)
    # Rotate at 2 MiB, keep only one previous log.
    if path.exists() and path.stat().st_size > 2_000_000:
        path.replace(path.with_suffix(path.suffix+'.1'))
    with path.open('a',encoding='utf-8') as out:
        out.write(json.dumps({'time':round(time.time(),3),'event':event,**fields},ensure_ascii=False)+'\n')

def main(argv=None):
    parser=argparse.ArgumentParser(description='Opt-in monitored MCP service runner')
    parser.add_argument('--command', nargs=argparse.REMAINDER, help='Trusted command after --command (no shell)')
    parser.add_argument('--interval',type=float,default=5)
    parser.add_argument('--max-restarts',type=int,default=3)
    parser.add_argument('--window',type=int,default=300)
    parser.add_argument('--health-url',default='')
    parser.add_argument('--spec-dir',type=Path,default=Path(__file__).resolve().parents[1]/'specs')
    parser.add_argument('--event-log',type=Path,default=Path('runtime/self-runner.jsonl'))
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args(argv)
    if args.interval < 1 or args.max_restarts < 0 or args.window < 10: parser.error('Invalid supervision limits')
    command=args.command or [sys.executable,'-m','server.mcp_server']
    if command and command[0]=='--': command=command[1:]
    if not command: parser.error('Empty command')
    if args.health_url: safe_health(args.health_url)  # validate target before launching
    if args.dry_run:
        print(json.dumps({'command':command,'health_url':args.health_url,'interval':args.interval,'max_restarts':args.max_restarts,'mode':'preview'},ensure_ascii=False))
        return 0
    recent=collections.deque()
    proc=None
    stopping=False
    last_spec=spec_snapshot(args.spec_dir)
    def stop(_sig,_frame):
        nonlocal stopping
        stopping=True
        if proc and proc.poll() is None: proc.terminate()
    signal.signal(signal.SIGINT,stop)
    signal.signal(signal.SIGTERM,stop)
    while not stopping:
        now=time.monotonic()
        while recent and now-recent[0]>args.window: recent.popleft()
        if len(recent)>args.max_restarts:
            write_event(args.event_log,'circuit_open',restarts=len(recent))
            return 2
        try:
            proc=subprocess.Popen(command,stdin=subprocess.DEVNULL, shell=False)
        except OSError as exc:
            write_event(args.event_log,'launch_failed',error=type(exc).__name__)
            return 1
        write_event(args.event_log,'started',pid=proc.pid)
        failures=0
        while not stopping and proc.poll() is None:
            time.sleep(args.interval)
            new_spec=spec_snapshot(args.spec_dir)
            if new_spec!=last_spec:
                last_spec=new_spec
                write_event(args.event_log,'specs_changed',fingerprint=new_spec)
                # MCP registry reloads per tool invocation; no restart required.
            if args.health_url:
                failures = 0 if safe_health(args.health_url) else failures+1
                if failures>=3:
                    write_event(args.event_log,'unhealthy',failures=failures)
                    proc.terminate()
                    break
        if stopping: break
        try: proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill();proc.wait()
        write_event(args.event_log,'exited',returncode=proc.returncode)
        recent.append(time.monotonic())
        if len(recent)>args.max_restarts:
            write_event(args.event_log,'circuit_open',restarts=len(recent))
            return 2
        time.sleep(min(args.interval*len(recent),30))
    if proc and proc.poll() is None:
        try: proc.wait(timeout=8)
        except subprocess.TimeoutExpired: proc.kill();proc.wait()
    write_event(args.event_log,'stopped')
    return 0

if __name__=='__main__': raise SystemExit(main())
