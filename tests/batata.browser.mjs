import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';

const origin='http://127.0.0.1:15056';
test('Batata Quente real: desktop + celular, palavras, queima, revanche, F5 e transferência', {timeout:240000}, async()=>{
  const folder=resolve(`artifacts/batata-browser-${Date.now()}`);
  await mkdir(folder,{recursive:true});
  try {await fetch(`${origin}/health`);throw new Error('Porta 15056 já ocupada.');} catch(error) {if(error.message.startsWith('Porta'))throw error;}
  const python=process.env.FUN_TEST_PYTHON || (process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
  const child=spawn(python,['-m','tests.browser_server'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,FUN_PORT:'15056',FUN_ORIGINS:origin,FUN_DATABASE:resolve(folder,'test.db'),FUN_MEDIA:resolve(folder,'media'),FUN_TEST_FIXTURES:'1',FUN_TEST_FROZEN_CLOCK:'1',FUN_TEST_ANSWERS:resolve(folder,'answers.json'),FUN_ADMIN_USERNAME:'',FUN_ADMIN_PASSWORD:''}});
  let logs='',browser;
  child.stderr.on('data',chunk=>{logs+=chunk;});
  const errors=[];
  try {
    let ready=false;
    for(let i=0;i<600;i++) {
      if(child.exitCode!==null)throw new Error(logs);
      try {if((await fetch(`${origin}/health`)).ok){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(ready,logs);
    browser=await chromium.launch({headless:true});
    const desktop=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const host=await desktop.newPage(),guest=await mobile.newPage();
    for(const page of [host,guest]) {
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Content Security Policy'))errors.push(message.text());});
    }
    await host.goto(origin);
    await host.getByRole('radio',{name:/Batata Quente/}).check();
    await host.getByLabel('Nome da sala',{exact:true}).fill('A roda da batata');
    await host.screenshot({path:resolve(folder,'portal-desktop.png'),fullPage:true});
    await host.getByRole('button',{name:'Jogar',exact:true}).click();
    await host.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('Ana');
    await host.getByRole('dialog').getByRole('button',{name:'Jogar',exact:true}).click();
    await host.waitForURL(/\/[A-Z]{4}$/);
    await host.getByRole('heading',{name:/Quem vai ficar/}).waitFor();
    await guest.goto(host.url());
    await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Bia');
    await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await guest.getByText('Bia (você)',{exact:true}).waitFor();
    assert.equal(await host.locator('#potato-settings').count(),0);
    await host.screenshot({path:resolve(folder,'lobby-desktop.png'),fullPage:true});
    await guest.screenshot({path:resolve(folder,'lobby-mobile.png'),fullPage:true});
    await host.getByRole('button',{name:/Começar a esquentar/}).click();
    await host.getByText('Sua vez!',{exact:true}).waitFor();
    await host.getByText('Volta 1 · Fácil',{exact:true}).waitFor();
    await host.getByRole('textbox',{name:'Qual é a palavra?',exact:true}).fill('zzqqww');
    await host.getByRole('button',{name:'Enviar palavra',exact:true}).click();
    await host.locator('#answer-feedback').filter({hasText:'dicionário'}).waitFor();
    const fragment=(await host.getByRole('heading',{name:'Trecho de letras'}).textContent()).toLowerCase();
    const lexicon=gunzipSync(await readFile('content/dictionary/words.tsv.gz')).toString('utf8');
    const used=new Set();
    function wordFor(part) {
      let index=-1;
      while((index=lexicon.indexOf(part,index+1))>=0) {
        const start=lexicon.lastIndexOf('\n',index)+1,end=lexicon.indexOf('\n',index);
        const [key,spellings]=lexicon.slice(start,end).split('\t');
        if(key.includes(part)&&!used.has(key)) {used.add(key);return spellings.split('|')[0];}
      }
      throw new Error(`Sem palavra para ${part}`);
    }
    const word=wordFor(fragment);
    await host.getByRole('textbox',{name:'Qual é a palavra?',exact:true}).fill(word);
    await host.getByRole('button',{name:'Enviar palavra',exact:true}).click();
    await guest.getByText('Sua vez!',{exact:true}).waitFor();
    await guest.getByRole('textbox',{name:'Qual é a palavra?',exact:true}).fill(word);
    await guest.getByRole('button',{name:'Enviar palavra',exact:true}).click();
    await guest.locator('#answer-feedback').filter({hasText:'já foi usada'}).waitFor();
    await host.screenshot({path:resolve(folder,'playing-desktop.png'),fullPage:true});
    await guest.screenshot({path:resolve(folder,'playing-mobile.png'),fullPage:true});
    // F5 retoma a mesma pessoa e o prazo autoritativo.
    await guest.reload();
    await guest.getByText('Bia (você)',{exact:true}).waitFor();
    assert.equal(await guest.locator('.potato-seat').count(),2);
    for(const size of [{width:320,height:720},{width:390,height:430},{width:390,height:844}]) {
      await guest.setViewportSize(size);
      assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const answer=guest.locator('#answer');await answer.scrollIntoViewIfNeeded();
      assert.ok((await answer.boundingBox()).width>100);
    }
    const currentFragment=()=>host.getByRole('heading',{name:'Trecho de letras'}).textContent();
    const heldFragment=await currentFragment();
    async function burn() {
      const total=await host.locator('.seat-hearts').evaluateAll(seats=>seats.reduce((sum,seat)=>sum+Number.parseInt(seat.getAttribute('aria-label')),0));
      await host.evaluate(()=>fetch('/_fixture/advance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds:31})}));
      await host.waitForFunction(before=>[...document.querySelectorAll('.seat-hearts')].reduce((sum,seat)=>sum+Number.parseInt(seat.getAttribute('aria-label')),0)===before-1,total);
    }
    await burn();
    await host.getByText('Sua vez!',{exact:true}).waitFor();
    assert.equal(await currentFragment(),heldFragment);
    await host.getByText('A sílaba segue até a pessoa anterior a Bia, incluindo a vez dela. Bia recebe outra ao voltar.',{exact:true}).waitFor();
    await guest.evaluate(()=>scrollTo(0,0));
    await host.screenshot({path:resolve(folder,'held-desktop.png'),fullPage:true});
    await guest.screenshot({path:resolve(folder,'held-mobile.png'),fullPage:true});
    await host.getByRole('textbox',{name:'Qual é a palavra?',exact:true}).fill(wordFor(heldFragment.toLowerCase()));
    await host.getByRole('button',{name:'Enviar palavra',exact:true}).click();
    await guest.getByText('Sua vez!',{exact:true}).waitFor();
    await host.waitForFunction(previous=>{
      const fragment=document.querySelector('.fragment');
      return fragment&&fragment.textContent!==previous;
    },heldFragment);
    assert.notEqual(await currentFragment(),heldFragment);
    assert.equal(await host.locator('.fragment-retention').count(),0);
    await host.getByText('Volta 2 · Fácil',{exact:true}).waitFor();
    for(let remaining=0;remaining<3;remaining++)await burn();
    await host.getByRole('heading',{name:'Você venceu!',exact:true}).waitFor();
    await guest.getByRole('heading',{name:'Ana venceu!',exact:true}).waitFor();
    await host.getByText('A batata queimou!',{exact:false}).waitFor();
    await host.screenshot({path:resolve(folder,'results-desktop.png'),fullPage:true});
    await host.getByRole('button',{name:'Jogar novamente',exact:true}).click();
    await host.getByText('Sua vez!',{exact:true}).waitFor();
    await host.getByText('0 palavras na roda',{exact:true}).waitFor();
    await host.getByText('Volta 1 · Fácil',{exact:true}).waitFor();
    await host.getByRole('button',{name:'Sair da sala',exact:true}).click();
    await host.getByText('Você saiu da sala.',{exact:true}).waitFor();
    await guest.getByRole('heading',{name:'Você venceu!',exact:true}).waitFor();
    await guest.getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await guest.getByRole('dialog').getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await guest.getByText('Até a próxima.',{exact:true}).waitFor();
    // Oito participantes de verdade no mesmo backend; o viewport também precisa acomodar os extremos da roda.
    await host.goto(origin);
    const fullCode=await host.evaluate(async()=>{
      const identity=await (await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Ana',game:'batata-quente',room_name:'Oito na roda',visibility:'public'})})).json();
      localStorage.setItem(`fun:${identity.code}`,JSON.stringify(identity));
      return identity.code;
    });
    await host.goto(`${origin}/${fullCode}`);
    await host.getByText('Ana (você)',{exact:true}).waitFor();
    await host.evaluate(async code=>{
      window.qaSockets=[];
      for(const name of ['Bia','Caio','Dani','Eva','Fábio','Gabi','Hugo']) {
        const identity=await (await fetch(`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})})).json();
        await new Promise((resolve,reject)=>{
          const socket=new WebSocket(`ws://${location.host}/ws/${code}`);window.qaSockets.push(socket);
          socket.onopen=()=>socket.send(JSON.stringify({token:identity.token}));
          socket.onmessage=()=>resolve();socket.onerror=reject;
        });
      }
      window.qaHeartbeat=setInterval(()=>{for(const socket of window.qaSockets)if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping'}));},10000);
    },fullCode);
    await host.getByRole('button',{name:/Começar a esquentar/}).click();
    await host.getByText('Sua vez!',{exact:true}).waitFor();
    assert.equal(await host.locator('.potato-seat').count(),8);
    await guest.goto(origin);
    await guest.getByText('Batata Quente · Em partida · entre para acompanhar',{exact:true}).waitFor();
    await guest.screenshot({path:resolve(folder,'public-mobile.png'),fullPage:true});
    for(const width of [1440,390,320]) {
      await host.setViewportSize({width,height:900});
      await host.waitForTimeout(150);
      assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const inside=await host.locator('.potato-arena').evaluate(arena=>{
        const bounds=arena.getBoundingClientRect();
        return [...arena.querySelectorAll('.potato-seat')].every(seat=>{const r=seat.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1;});
      });
      assert.ok(inside,`Lugares cortados em ${width}px`);
      await host.screenshot({path:resolve(folder,`eight-${width}.png`),fullPage:true});
    }
    await host.getByRole('button',{name:'Abrir navegação',exact:true}).click();
    await host.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await host.getByRole('button',{name:'Abrir navegação',exact:true}).click();
    await host.screenshot({path:resolve(folder,'eight-light-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    await writeFile(resolve(folder,'result.json'),JSON.stringify({ok:true,errors,word,fragment},null,2));
    console.log(`Evidências: ${folder}`);
  } finally {
    if(browser)await browser.close();
    child.kill();
  }
});
