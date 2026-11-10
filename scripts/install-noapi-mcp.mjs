import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolvePython,pythonExecutable} from './noapi-common.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),venv=path.join(root,'.noapi-venv');
function run(bin,args){const r=spawnSync(bin,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw Error(bin+' exited '+r.status);}
try{const [bin,...args]=resolvePython();run(bin,[...args,'-m','venv',venv]);const py=pythonExecutable(venv);run(py,['-m','pip','install','--upgrade','pip']);run(py,['-m','pip','install','git+https://github.com/engram-ae/noapi-google-search-mcp.git']);run(py,['-m','playwright','install','chromium']);console.log('Installed. Run npm run mcp:start');}catch(e){console.error(e.message,'Install Python 3.10+ and Git first.');process.exitCode=1;}
