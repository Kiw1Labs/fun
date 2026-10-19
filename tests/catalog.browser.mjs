import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {chromium} from '@playwright/test';

const origin='http://127.0.0.1:15056';
const temporary=await mkdtemp(join(tmpdir(),'fun-real-catalog-'));
const python=process.env.FUN_TEST_PYTHON || '.venv/Scripts/python.exe';
let child,browser;
const errors=[], snapshots=[], mediaResponses=[];
const catalog=JSON.parse(await readFile('content/questions/catalog.json','utf8'));
const answers=new Map(catalog.map(c=>[c.id,c]));
try {
  try {await fetch(`${origin}/health`);throw new Error('Porta de teste ocupada');} catch(e) {if(e.message==='Porta de teste ocupada')throw e;}
  child=spawn(python,['-m','tests.catalog_server'],{env:{...process.env,FUN_ORIGINS:origin,FUN_DATABASE:join(temporary,'fun.sqlite3'),FUN_MEDIA:join(temporary,'media')},stdio:['ignore','ignore','pipe'],windowsHide:true});
  let logs='';child.stderr.on('data',data=>{logs+=data;});
  let ready=false;
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null)throw new Error(logs);
    try {if((await fetch(`${origin}/health`)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,logs);
  browser=await chromium.launch({headless:true});
  const desktop=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const host=await desktop.newPage(),guest=await mobile.newPage();
  for(const page of [host,guest]) {
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().includes('/media/'))mediaResponses.push(r.status());});
  }
  host.on('websocket',socket=>socket.on('framereceived',frame=>{
    const message=JSON.parse(frame.payload);
    if(message.type==='state')snapshots.push(message);
  }));
  await host.goto(origin);
  await host.getByLabel('Nome da sala',{exact:true}).fill('Catálogo real');
  await host.getByRole('button',{name:'Jogar',exact:true}).click();
  await host.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('Revisão A');
  await host.getByRole('dialog').getByRole('button',{name:'Jogar',exact:true}).click();
  await host.waitForURL(/\/[A-Z]{4}$/);
  await host.getByText('Ao vivo',{exact:true}).waitFor();
  await guest.goto(host.url());
  await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Revisão B');
  await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await guest.getByText('Ao vivo',{exact:true}).waitFor();
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  await mkdir('artifacts',{recursive:true});
  const used=[];
  for(let round=1;round<=15;round++) {
    await host.getByRole('heading',{name:`Desafio ${round} / 15`,exact:true}).waitFor();
    await host.getByLabel('Sua resposta',{exact:true}).waitFor();
    const state=snapshots.at(-1);
    assert.equal(state.phase,'question');
    assert.deepEqual(Object.keys(state.challenge).sort(),['id','image','kind','prompt']);
    const challenge=answers.get(state.challenge.id);
    used.push(challenge.id);
    if(challenge.kind==='image') {
      await guest.locator('.challenge-image').waitFor();
      await guest.locator('.challenge-image').evaluate(img=>img.decode());
      assert.ok(await guest.locator('.challenge-image').evaluate(img=>img.complete&&img.naturalWidth>0));
      if(round===1)await guest.screenshot({path:'artifacts/real-question-mobile.png',fullPage:true});
    }
    assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await host.getByLabel('Sua resposta',{exact:true}).fill(challenge.aliases[0]||challenge.answer);
    await host.getByRole('button',{name:'Responder',exact:true}).click();
    await guest.getByLabel('Sua resposta',{exact:true}).fill(challenge.answer);
    await guest.getByRole('button',{name:'Responder',exact:true}).click();
    await host.getByText('A resposta é',{exact:true}).waitFor();
    assert.equal(await host.locator('.reveal strong').textContent(),challenge.answer);
    await host.getByText('Fontes e créditos',{exact:true}).waitFor();
    if(round===1)await host.screenshot({path:'artifacts/real-reveal-desktop.png',fullPage:true});
    await host.request.post(`${origin}/_catalog_test/advance`,{headers:{Origin:origin},data:{seconds:4.1}});
  }
  await host.getByText('15 desafios. Muitas descobertas.',{exact:true}).waitFor();
  await host.getByRole('button',{name:'Créditos',exact:true}).click();
  const dialog=host.locator('#credits-dialog');
  assert.equal(await dialog.locator('article').count(),15);
  await dialog.locator('article').first().getByText('Fontes e créditos',{exact:true}).click();
  assert.ok(await dialog.locator('a').count()>=15);
  await host.screenshot({path:'artifacts/real-credits-desktop.png',fullPage:true});
  assert.equal(new Set(used).size,15);
  assert.ok(mediaResponses.length>=16&&mediaResponses.every(s=>s===200));
  assert.deepEqual(errors,[]);
  const result={complete_match:15,unique_questions:15,images:8,texts:7,desktop_and_mobile:true,server_privacy:true,credits_after_reveal:true,browser_errors:errors};
  await writeFile('artifacts/real-browser-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {
  if(browser)await browser.close();
  if(child&&child.exitCode===null) {
    if(process.platform==='win32') {
    const stopping=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    const code=await new Promise(resolve=>stopping.once('exit',resolve));
    if(code!==0&&child.exitCode===null)throw new Error('O Windows bloqueou a limpeza do servidor temporário do teste; repetir com permissão de encerramento.');
    } else child.kill('SIGTERM');
    if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
  }
  assert.equal(dirname(temporary),tmpdir());
  await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
