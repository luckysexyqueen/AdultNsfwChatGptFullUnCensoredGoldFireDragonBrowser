import argparse,json,os,platform,shutil
from pathlib import Path
from datetime import datetime
from urllib.parse import urlsplit
p=argparse.ArgumentParser()
p.add_argument('--url',required=True);p.add_argument('--workspace');p.add_argument('--targets',default='claude,cursor');p.add_argument('--apply',action='store_true');p.add_argument('--output-dir',default='mcp-connection-guides')
a=p.parse_args();u=urlsplit(a.url)
if u.scheme!='https' or not u.hostname or u.username or u.password: p.error('HTTPS URL required')
h=Path.home();sysname=platform.system()
claude=(Path(os.environ.get('APPDATA',str(h/'AppData/Roaming')))/'Claude' if sysname=='Windows' else h/'Library/Application Support/Claude' if sysname=='Darwin' else Path(os.environ.get('XDG_CONFIG_HOME',str(h/'.config')))/'Claude')/'claude_desktop_config.json'
t={'claude':(claude,'mcpServers'),'cursor':(h/'.cursor/mcp.json','mcpServers')}
if a.workspace:
 w=Path(a.workspace).expanduser().resolve();t.update({'vscode':(w/'.vscode/mcp.json','servers'),'cursor-workspace':(w/'.cursor/mcp.json','mcpServers')})
# Use local stdio proxy with token inherited from client environment.
entry={'command':'python','args':[str(Path(__file__).resolve().parent/'stdio_bridge.py'),'--url',a.url]}
for name in a.targets.split(','):
 if name in ('grok','manus'):
  # Web-hosted account connectors cannot be installed by editing local files.
  guide={'name':'spec-direct-auto-inject','server_url':a.url,'authentication':'Configure the supported authentication method in the service UI; never paste secrets into shared files','instructions':('Grok: https://grok.com/connectors -> New Connector -> Custom -> server URL -> authenticate/approve' if name=='grok' else 'Manus: Connectors -> Create -> Add MCP by URL -> server URL -> authenticate/approve') }
  dest=Path(a.output_dir).expanduser()/('spec-direct-'+name+'.json')
  print(('EXPORT' if a.apply else 'PREVIEW'),name,guide['instructions'])
  if a.apply:
   dest.parent.mkdir(parents=True,exist_ok=True)
   if dest.exists():
    print('SKIP existing guide (no overwrite)',dest)
   else:
    dest.write_text(json.dumps(guide,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  continue
 if name not in t: print('SKIP unsupported target',name);continue
 path,key=t[name]
 if not path.parent.is_dir(): print('SKIP app directory not detected',name);continue
 try: obj=json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}
 except (ValueError,OSError) as e: print('SKIP invalid config',name,e);continue
 if not isinstance(obj,dict) or not isinstance(obj.get(key,{}),dict):print('SKIP invalid config shape',name);continue
 old=obj.get(key,{}).get('spec-direct-auto-inject')
 if old and old!=entry:print('SKIP conflicting existing entry',name);continue
 if old==entry:print('UNCHANGED',name);continue
 print('APPLY' if a.apply else 'PREVIEW',name,path)
 if a.apply:
  if path.exists():shutil.copy2(path,path.with_name(path.name+'.backup-'+datetime.now().strftime('%Y%m%d%H%M%S')))
  obj.setdefault(key,{})['spec-direct-auto-inject']=entry
  temp=path.with_name(path.name+'.tmp');temp.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n',encoding='utf-8');temp.replace(path)
print('ChatGPT, Grok, and Manus account connectors require explicit authorization in their own UIs; no automatic account modifications.')
