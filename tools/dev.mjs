// Desenvolvimento no PC: build e Python atualizados juntos; nunca usado pelo supervisor.
import {spawn,spawnSync} from 'node:child_process';
import {watch} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import net from 'node:net';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.FUN_PORT || 5050);
const python=process.env.FUN_PYTHON || join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
try {
  await new Promise((resolve,reject)=>{
    const probe=net.createServer();
    probe.once('error',reject);
    probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
  });
} catch {
  console.error(`A porta ${port} já está ocupada ou indisponível. Pare o Fun antigo com Ctrl+C no terminal dele e execute npm run dev novamente.`);
  process.exit(1);
}
function build() {
  return spawnSync(process.execPath,['tools/build.mjs'],{cwd:root,stdio:'inherit',windowsHide:true}).status===0;
}
if (!build()) process.exit(1);
let child,timer,pythonTimer,stopping=false,restarting=false;
function startBackend() {
  child=spawn(python,['-m','fun'],{
    cwd:root,stdio:'inherit',windowsHide:true,
    env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',FUN_ORIGINS:process.env.FUN_ORIGINS || `http://127.0.0.1:${port},http://localhost:${port}`}
  });
  child.once('error',()=>{closeWatchers();console.error('Não foi possível iniciar o Python do projeto. Confira a pasta .venv.');process.exitCode=1;});
  child.once('exit',code=>{
    if(restarting&&!stopping) {restarting=false;startBackend();}
    else {closeWatchers();process.exitCode=stopping?0:(code??1);}
  });
}
const watcher=watch(join(root,'frontend'),(_,filename)=>{
  if (!filename || !/\.(html|css|js)$/.test(filename)) return;
  clearTimeout(timer);
  timer=setTimeout(()=>{if(build()) console.log('Interface atualizada. Recarregue a página no navegador.');},150);
});
const pythonWatcher=watch(join(root,'fun'),{recursive:true},(_,filename)=>{
  if(!filename || !filename.endsWith('.py') || stopping) return;
  clearTimeout(pythonTimer);
  pythonTimer=setTimeout(()=>{
    if(restarting||stopping||child.exitCode!==null) return;
    restarting=true;
    console.log('Atualizando o Python do Fun. Uma partida ativa será cancelada conforme a regra de reinício.');
    terminateOwnedBackend();
  },150);
});
function closeWatchers() { clearTimeout(timer);clearTimeout(pythonTimer);watcher.close();pythonWatcher.close(); }
function terminateOwnedBackend() {
  if(!Number.isInteger(child.pid)||child.exitCode!==null) return;
  if(process.platform==='win32') {
    const result=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    if(result.status!==0) {restarting=false;closeWatchers();console.error('Não foi possível encerrar o Python local. Pare este terminal e reinicie o Fun.');process.exitCode=1;}
  } else child.kill('SIGTERM');
}
function stop() {
  if(stopping) return;
  stopping=true;
  closeWatchers();
  terminateOwnedBackend();
}
process.once('SIGINT',stop);
process.once('SIGTERM',stop);
startBackend();
console.log(`Fun local em http://127.0.0.1:${port}. Python recarrega automaticamente; Ctrl+C encerra.`);
