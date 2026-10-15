"""Consent-gated wrapper around existing local installer; no remote account changes."""
import argparse,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--workspace');p.add_argument('--targets',default='claude,cursor,vscode,cursor-workspace,grok,manus');p.add_argument('--apply',action='store_true');a=p.parse_args()
script=Path(__file__).with_name('auto_mcp_integration.py')
cmd=[sys.executable,str(script),'--url',a.url,'--targets',a.targets]
if a.workspace:cmd+=['--workspace',a.workspace]
if a.apply:
 print('Review all target changes before continuing.');confirm=input('Type APPLY to change local configuration: ')
 if confirm!='APPLY':sys.exit('Cancelled')
 cmd+=['--apply']
sys.exit(subprocess.call(cmd))
