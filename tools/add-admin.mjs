import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {root,loadLocalEnv} from './local-env.mjs';

loadLocalEnv();
const python=process.env.FUN_PYTHON || join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const child=spawn(python,['-m','tools.add_admin',...process.argv.slice(2)],{
  cwd:root,env:{...process.env,PYTHONUTF8:'1'},stdio:'inherit',windowsHide:true
});
child.once('error',()=>{console.error('Não foi possível iniciar o cadastro. Confira a pasta .venv.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
