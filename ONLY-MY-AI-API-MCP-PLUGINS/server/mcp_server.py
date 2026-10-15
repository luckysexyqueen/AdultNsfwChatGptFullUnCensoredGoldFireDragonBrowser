"""Official MCP SDK transport; prefer this over the legacy JSON-RPC shim."""
import os, json, time
from mcp.server.fastmcp import FastMCP
from server.engine import registry,execute

mcp=FastMCP('Spec Direct Auto Inject',json_response=True,stateless_http=True)
@mcp.tool()
def list_api_operations()->str:
    """List OpenAPI operations and spec validation errors; reloads specs each call."""
    ops,errors,version=registry()
    return json.dumps({'operations':ops,'errors':errors,'spec_version':version},ensure_ascii=False)

@mcp.tool()
async def call_api_operation(operation:str,path_params:dict|None=None,query:dict|None=None,headers:dict|None=None,body:dict|list|str|None=None,body_type:str='json',confirm_write:bool=False)->str:
    """Call a registered allowlisted API operation. User must authorize writes."""
    ops,errors,version=registry()
    if operation not in ops:return json.dumps({'error':'Unknown operation','spec_version':version})
    try:
        result=await execute(ops[operation],{'path_params':path_params,'query':query,'headers':headers,'body':body,'body_type':body_type,'confirm_write':confirm_write})
        return json.dumps(result,ensure_ascii=False)
    except Exception as exc:return json.dumps({'error':str(exc)[:500]},ensure_ascii=False)

@mcp.tool()
def connection_diagnostics()->str:
    """Return local MCP registry health without exposing credentials."""
    ops,errors,version=registry()
    return json.dumps({'status':'ready','operations':len(ops),'spec_errors':errors,'spec_version':version,'upstream_allowlist_configured':bool(os.getenv('ALLOWED_API_HOSTS'))},ensure_ascii=False)

if __name__=='__main__':
    mcp.run(transport=os.getenv('MCP_TRANSPORT','streamable-http'),host=os.getenv('HOST','0.0.0.0'),port=int(os.getenv('PORT','8080')))
