import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';

test('dev: build, recarga do Python, atualização da interface e recusa de JavaScript inválido',{timeout:30000},async()=>{
  const temp=await mkdtemp(join(tmpdir(),'fun-dev-audit-'));
  const python=process.env.FUN_TEST_PYTHON || resolve(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
  const origin='http://127.0.0.1:15055';
  let child,logs='';
  async function until(check) {
    const deadline=Date.now()+10000;
    while(Date.now()<deadline) {
      if(await check().catch(()=>false)) return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.fail(`A atualização local não ficou pronta em 10 segundos.\n${logs}`);
  }
  try {
    for(const directory of ['fun','frontend','tools']) await cp(directory,join(temp,directory),{recursive:true,filter:source=>!source.includes('__pycache__')});
    child=spawn(process.execPath,['tools/dev.mjs'],{cwd:temp,env:{...process.env,FUN_PORT:'15055',FUN_PYTHON:python,FUN_DATABASE:join(temp,'audit.sqlite3'),FUN_CATALOG:join(temp,'empty.json'),FUN_STATIC:join(temp,'dist'),FUN_LOG:'',FUN_ORIGINS:origin},stdio:['ignore','pipe','pipe'],windowsHide:true});
    child.stderr.on('data',data=>{logs+=data;});
    child.stdout.on('data',data=>{logs+=data;});
    await until(async()=>{if(child.exitCode!==null)assert.fail(logs);return (await(await fetch(`${origin}/health`)).json()).api_version===2;});
    const identity=await(await fetch(`${origin}/api/rooms`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Teste local'})})).json();
    assert.ok(identity.code);
    // Um segundo launcher não toma a porta nem substitui o servidor em execução.
    const duplicate=spawnSync(process.execPath,['tools/dev.mjs'],{cwd:temp,env:{...process.env,FUN_PORT:'15055'},encoding:'utf8',windowsHide:true});
    assert.equal(duplicate.status,1);
    assert.match(duplicate.stderr,/porta 15055/);
    const init=join(temp,'fun/__init__.py');
    await writeFile(init,(await readFile(init,'utf8')).replace('API_VERSION = 2','API_VERSION = 3'));
    await until(async()=>(await(await fetch(`${origin}/health`)).json()).api_version===3);
    const joined=await fetch(`${origin}/api/rooms/${identity.code}/join`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Outra pessoa'})});
    assert.equal(joined.status,201);
    const app=join(temp,'frontend/app.js');
    const source=await readFile(app,'utf8');
    await writeFile(app,source.replace('Vamos jogar?','Interface de teste atualizada'));
    await until(async()=>{
      const html=await(await fetch(origin)).text();
      const script=html.match(/src="([^"]+app\.[^"]+\.js)"/)[1];
      return (await(await fetch(origin+script)).text()).includes('Interface de teste atualizada');
    });
    const htmlBefore=await readFile(join(temp,'dist/index.html'),'utf8');
    await writeFile(app,'const = broken');
    await until(async()=>logs.includes('Build interrompido'));
    assert.equal(await readFile(join(temp,'dist/index.html'),'utf8'),htmlBefore);
  } finally {
    if(child && child.exitCode===null) {
      const exited=new Promise(resolve=>child.once('exit',resolve));
      if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');
      await exited;
    }
    assert.equal(dirname(temp),tmpdir());
    await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
