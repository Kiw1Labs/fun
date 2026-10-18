import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {chromium} from '@playwright/test';

const origin='http://127.0.0.1:15050', fixtureOrigin='http://127.0.0.1:15051';
let browser, temp, errors=[];
const processes=[];
before(async()=>{
  temp=await mkdtemp(join(tmpdir(),'fun-browser-'));
  const python=process.env.FUN_TEST_PYTHON || (process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
  for(const [i,url] of [origin,fixtureOrigin].entries()) {
    try { await fetch(`${url}/health`); throw new Error(`Porta de teste já ocupada: ${url}`); } catch(error) { if(error.message.startsWith('Porta')) throw error; }
    const processHandle=spawn(python,['-m','tests.browser_server'],{env:{...process.env,FUN_PORT:String(15050+i),FUN_ORIGINS:url,FUN_DATABASE:join(temp,`test${i}.sqlite3`),FUN_TEST_FIXTURES:String(i),FUN_TEST_ANSWERS:join(temp,'answers.json')},stdio:['ignore','pipe','pipe'],windowsHide:true});
    processes.push(processHandle);
    let logs=''; processHandle.stderr.on('data', chunk=>{logs+=chunk;});
    let ready=false;
    for(let attempt=0;attempt<100;attempt++) {
      if(processHandle.exitCode!==null) throw new Error(logs);
      try { if((await fetch(`${url}/health`)).ok) {ready=true;break;} } catch {}
      await new Promise(r=>setTimeout(r,100));
    }
    if(!ready) throw new Error(`Backend não iniciou: ${logs}`);
  }
  browser=await chromium.launch({headless:true});
  await mkdir('artifacts',{recursive:true});
});
after(async()=>{
  if(browser) await browser.close();
  for(const processHandle of processes) {
    if(processHandle.exitCode!==null) continue;
    if(process.platform==='win32') {
      assert.ok(Number.isInteger(processHandle.pid));
      const stop=spawn('taskkill',['/PID',String(processHandle.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      await new Promise(r=>stop.once('exit',r));
    } else processHandle.kill();
    if(processHandle.exitCode===null) await new Promise(r=>processHandle.once('exit',r));
  }
  if(temp) { assert.equal(dirname(temp),tmpdir()); await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
});

test('partida sintética em navegador: resposta, cooldown, reconexão e revelação',async()=>{
  const answers=JSON.parse(await readFile(join(temp,'answers.json'),'utf8'));
  const a=await browser.newContext({viewport:{width:1366,height:900}});
  const b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const host=await a.newPage(), guest=await b.newPage();
  for(const p of [host,guest]) p.on('pageerror', error=>errors.push(error.message));
  await host.goto(fixtureOrigin);
  await host.getByRole('button',{name:/Sabe Essa\? Reconheça/}).click();
  await host.getByLabel('Como podemos chamar você?').fill('Host sintético');
  await host.getByRole('button',{name:'Criar sala',exact:true}).click();
  await host.waitForURL(/\/[A-Z]{4}$/);
  await host.getByText('Ao vivo',{exact:true}).waitFor();
  await guest.goto(host.url());
  await guest.getByLabel('Como podemos chamar você?').fill('Convidado sintético');
  await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await guest.getByText('Ao vivo',{exact:true}).waitFor();
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  await host.getByLabel('Sua resposta').waitFor();
  await guest.getByLabel('Sua resposta').waitFor();
  const image=await host.locator('.challenge-image').getAttribute('src');
  const index=Number(image.match(/test_(\d+)\.png/)[1]);
  const answer=`Resposta sintética ${index}`;
  assert.ok(Object.values(answers).includes(answer));
  await host.getByLabel('Sua resposta').fill('errado');
  await host.getByRole('button',{name:'Responder',exact:true}).click();
  await host.getByText(/Ainda não/).waitFor();
  await new Promise(r=>setTimeout(r,550));
  await host.getByLabel('Sua resposta').fill(answer);
  await host.getByRole('button',{name:'Responder',exact:true}).click();
  await host.getByText('Você acertou! Aguarde os demais.').waitFor();
  await guest.reload();
  await guest.getByLabel('Sua resposta').waitFor();
  await guest.screenshot({path:'artifacts/challenge-mobile.png',fullPage:true});
  await guest.getByLabel('Sua resposta').fill(answer);
  await guest.getByRole('button',{name:'Responder',exact:true}).click();
  await host.getByText('A resposta é',{exact:true}).waitFor();
  await host.screenshot({path:'artifacts/reveal-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await a.close(); await b.close();
});

test('portal, home em /, sala, F5, nova aba, entrada e controles do anfitrião',async()=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  page.on('pageerror', error=>errors.push(error.message));
  page.on('console', msg=>{if(msg.type()==='error'&&msg.text().includes('Content Security Policy')) errors.push(msg.text());});
  await page.goto(origin);
  await page.screenshot({path:'artifacts/portal-desktop.png',fullPage:true});
  await page.getByRole('button',{name:/Sabe Essa\? Reconheça/}).click();
  assert.equal(new URL(page.url()).pathname,'/');
  await page.getByLabel('Como podemos chamar você?').fill('Ana');
  await page.getByRole('button',{name:'Criar sala',exact:true}).click();
  await page.waitForURL(/\/[A-Z]{4}$/);
  const roomURL=page.url();
  await page.getByText('Ao vivo',{exact:true}).waitFor();
  await page.getByText('O catálogo ainda está sendo preparado.').waitFor();
  await page.screenshot({path:'artifacts/lobby-desktop.png',fullPage:true});
  await page.reload();
  await page.getByText('Ana (você)').waitFor();
  const tab=await context.newPage();
  await tab.goto(roomURL);
  await tab.getByText('Ana (você)').waitFor();
  const other=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile=await other.newPage();
  mobile.on('pageerror', error=>errors.push(error.message));
  await mobile.goto(roomURL);
  await mobile.getByLabel('Como podemos chamar você?').fill('<b>Bia</b>');
  await mobile.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await mobile.getByText('<b>Bia</b> (você)',{exact:true}).waitFor();
  assert.equal(await mobile.locator('.scoreboard b').count(),0);
  assert.equal(await mobile.getByRole('button',{name:'Encerrar sala',exact:true}).count(),0);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mobile.screenshot({path:'artifacts/lobby-mobile.png',fullPage:true});
  await mobile.getByRole('button',{name:'Abrir navegação'}).click();
  await mobile.getByRole('button',{name:'Alternar tema'}).click();
  await mobile.getByRole('button',{name:'Abrir navegação'}).click();
  await mobile.screenshot({path:'artifacts/lobby-mobile-dark.png',fullPage:true});
  await page.getByRole('button',{name:'Sair da sala',exact:true}).click();
  await page.getByText('Você saiu da sala.',{exact:true}).waitFor();
  await mobile.getByRole('button',{name:'Encerrar sala',exact:true}).waitFor();
  await mobile.getByRole('button',{name:'Encerrar sala',exact:true}).click();
  await mobile.getByRole('button',{name:'Manter sala',exact:true}).click();
  await mobile.getByRole('button',{name:'Encerrar sala',exact:true}).click();
  await mobile.getByRole('dialog').getByRole('button',{name:'Encerrar sala',exact:true}).click();
  await mobile.getByText('Até a próxima.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await other.close(); await context.close();
});
