import fs from 'node:fs';
import path from 'node:path';
const c=JSON.parse(fs.readFileSync('runtime/mcp_connection.json','utf8'));
const token=process.env.SPEC_DIRECT_MCP_TOKEN;if(!token)throw Error('Missing SPEC_DIRECT_MCP_TOKEN');
const r=await fetch(c.url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});const j=await r.json();console.log(r.status,Array.isArray(j?.result?.tools)?j.result.tools.map(t=>t.name):j);if(!r.ok)process.exit(1);
