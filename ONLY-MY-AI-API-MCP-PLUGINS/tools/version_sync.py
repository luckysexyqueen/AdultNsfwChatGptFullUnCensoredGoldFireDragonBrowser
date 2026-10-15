import json,hashlib,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'plugin.json').read_text())
files=sorted(p for p in (root/'specs').glob('*') if p.suffix.lower() in ('.yaml','.yml','.json'))
print(json.dumps({'plugin_version':manifest['version'],'spec_fingerprint':hashlib.sha256(b''.join(hashlib.sha256(p.read_bytes()).digest() for p in files)).hexdigest()[:16],'spec_count':len(files)},indent=2))
