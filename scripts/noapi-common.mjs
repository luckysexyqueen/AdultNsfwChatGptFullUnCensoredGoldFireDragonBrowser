import path from 'node:path';
export const resolvePython=(env=process.env,platform=process.platform)=>env.NOAPI_PYTHON?[env.NOAPI_PYTHON]:platform==='win32'?['py','-3']:['python3'];
export const pythonExecutable=(venv,platform=process.platform)=>path.join(venv,platform==='win32'?'Scripts':'bin',platform==='win32'?'python.exe':'python');
