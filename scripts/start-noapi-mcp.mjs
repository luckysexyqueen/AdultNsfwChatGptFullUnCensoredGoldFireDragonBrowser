import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pythonExecutable} from './noapi-common.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(pythonExecutable(path.join(root,'.noapi-venv')),['-m','google_search_mcp'],{stdio:'inherit'});
child.on('error',e=>{console.error(e.message,'Run npm run mcp:install first.');process.exitCode=1;});
child.on('exit',(code)=>{process.exitCode=code??1;});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));
