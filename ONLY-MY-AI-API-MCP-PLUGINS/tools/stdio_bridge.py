import argparse,os,json
import httpx
from mcp.server.fastmcp import FastMCP
p=argparse.ArgumentParser();p.add_argument('--url',required=True);a=p.parse_args()
server=FastMCP('spec-direct-auto-inject')
async def invoke(name,args):
 token=os.environ.get('SPEC_DIRECT_MCP_TOKEN')
 if not token:raise RuntimeError('Set SPEC_DIRECT_MCP_TOKEN in the client process environment')
 async with httpx.AsyncClient(timeout=40,follow_redirects=False) as client:
  r=await client.post(a.url,json={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}},headers={'Authorization':'Bearer '+token});r.raise_for_status();return r.json()
@server.tool()
async def list_api_operations()->str:
 """List available operations."""
 return json.dumps(await invoke('list_api_operations',{}),ensure_ascii=False)
@server.tool()
async def call_api_operation(operation:str,path_params:dict|None=None,query:dict|None=None,body:dict|str|None=None,confirm_write:bool=False)->str:
 """Call an API operation; writes require user authorization."""
 return json.dumps(await invoke('call_api_operation',{'operation':operation,'path_params':path_params or {},'query':query or {},'body':body,'confirm_write':confirm_write}),ensure_ascii=False)
if __name__=='__main__':server.run(transport='stdio')
