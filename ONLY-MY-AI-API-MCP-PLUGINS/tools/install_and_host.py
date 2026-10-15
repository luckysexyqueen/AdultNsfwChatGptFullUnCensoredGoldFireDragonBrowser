"""Opt-in Cloudflare bootstrap. ZIP installation alone cannot grant cloud hosting."""
import argparse,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CLOUD=ROOT/'cloudflare'
def main():
 p=argparse.ArgumentParser(description='One-command, consent-gated Cloudflare Workers deployment')
 p.add_argument('--apply',action='store_true',help='Authorize npm setup, Cloudflare login and deployment')
 p.add_argument('--skip-login',action='store_true',help='Use an already authorized Wrangler session')
 p.add_argument('--rollback-on-failure',action='store_true')
 a=p.parse_args()
 print('Will upload reviewed specs/ to Cloudflare, create/update Worker, set MCP bearer secret and verify HTTPS MCP endpoint.')
 print('Cloudflare account consent and a strong SPEC_DIRECT_MCP_TOKEN are required; ChatGPT plugin ZIP alone does not execute hosting.')
 if not a.apply:
  print('DRY RUN. To proceed locally: python tools/install_and_host.py --apply');return
 if not (ROOT/'specs').is_dir():p.error('Missing specs directory')
 if not os.getenv('SPEC_DIRECT_MCP_TOKEN'):p.error('Set SPEC_DIRECT_MCP_TOKEN securely in the local environment first')
 if not sys.stdin.isatty():p.error('Interactive confirmation required')
 if input('Type DEPLOY to authorize cloud changes: ').strip()!='DEPLOY':p.error('Not authorized')
 subprocess.run(['npm','install'],cwd=CLOUD,check=True)
 if not a.skip_login:subprocess.run(['npx','wrangler','login'],cwd=CLOUD,check=True)
 cmd=[sys.executable,str(ROOT/'tools/cloudflare_deploy.py'),'--apply','--auto-url','--set-secret']
 if a.rollback_on_failure:cmd.append('--rollback-on-failure')
 subprocess.run(cmd,cwd=ROOT,check=True)
if __name__=='__main__':main()
