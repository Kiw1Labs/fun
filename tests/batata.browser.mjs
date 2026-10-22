import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';

const origin='http://127.0.0.1:15056';
async function actualMotion(page) {
  return page.evaluate(async()=>{
    const points=[],transforms=new Set();
    for(let i=0;i<30;i++) {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const group=document.querySelector('.potato-motion');
      points.push(new DOMPoint(80,158).matrixTransform(group.getScreenCTM()));
      transforms.add(getComputedStyle(group).transform);
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    return {poses:transforms.size,rise:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};
  });
}
test('Batata Quente real: desktop + celular, palavras, queima, revanche, F5, transferência e remoção confirmada', {timeout:240000}, async()=>{
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
    // Exercita o mesmo SVG/CSS/relógio visual sem alterar o tempo nem as regras da partida.
    const animationContext=await browser.newContext({viewport:{width:640,height:640},reducedMotion:'no-preference',recordVideo:{dir:folder,size:{width:640,height:640}}});
    const demo=await animationContext.newPage(),video=demo.video();
    const artSource=await readFile('frontend/batata.js','utf8');
    const mascot=artSource.match(/const mascot = `([\s\S]+?)`;/)[1];
    await demo.setContent(`<html><body><div class="potato-arena is-playing"><div class="potato-token">${mascot}</div></div></body></html>`);
    await demo.addStyleTag({content:await readFile('frontend/batata.css','utf8')});
    await demo.addStyleTag({content:'html,body{margin:0;background:#151515;color:#fff}body{display:grid;place-items:center;height:100vh}.potato-arena{width:400px;margin:0;display:grid;place-items:center}.potato-token{width:200px;height:225px;margin:0}'});
    await demo.addScriptTag({content:artSource});
    const stages=[];
    for(const now of [0,9,14.4,19]) {
      stages.push(await demo.evaluate(now=>{
        window.Batata.timer({phase:'playing',code:'DEMO',started:0,deadline:20,potato:{cycle:1}},now);
        const art=document.querySelector('.potato-art');
        return {mood:art.dataset.heat,color:getComputedStyle(art.querySelector('.potato-skin-dark')).stopColor,mouth:art.querySelector('.potato-mouth').getAttribute('d'),eye:Number(art.querySelector('.potato-eye').getAttribute('ry'))};
      },now));
      await demo.screenshot({path:resolve(folder,`heat-${now}.png`)});
      await demo.waitForTimeout(650);
    }
    assert.deepEqual(stages.map(stage=>stage.mood),['calm','warm','serious','stressed']);
    assert.equal(new Set(stages.map(stage=>stage.color)).size,4);
    assert.notEqual(stages[0].mouth,stages[2].mouth);
    assert.ok(stages[3].eye<stages[0].eye);
    const movement=await demo.evaluate(()=>{
      const token=document.querySelector('.potato-token'),motion=document.querySelector('.potato-motion');
      const before=token.getBoundingClientRect().toJSON(),animation=motion.getAnimations()[0];
      animation.pause();animation.currentTime=250;
      const left=new DOMMatrix(getComputedStyle(motion).transform);
      animation.currentTime=750;
      const right=new DOMMatrix(getComputedStyle(motion).transform);
      const art=document.querySelector('.potato-art'),hot=art.style.getPropertyValue('--potato-dark');
      window.Batata.timer({phase:'playing',code:'DEMO',started:0,deadline:40,potato:{cycle:1}},19);
      const passKeptHeat=art.style.getPropertyValue('--potato-dark')===hot;
      window.Batata.timer({phase:'playing',code:'DEMO',started:20,deadline:40,potato:{cycle:2}},20);
      animation.play();
      return {left:left.b<0,right:right.b>0,fixed:JSON.stringify(before)===JSON.stringify(token.getBoundingClientRect().toJSON()),passKeptHeat,reset:art.dataset.heat==='calm'};
    });
    assert.deepEqual(movement,{left:true,right:true,fixed:true,passKeptHeat:true,reset:true});
    await demo.emulateMedia({reducedMotion:'reduce'});
    await demo.waitForFunction(()=>{
      const motion=document.querySelector('.potato-motion');
      return getComputedStyle(motion).animationName==='none'&&motion.getAnimations().length===0;
    });
    assert.equal(await demo.locator('.potato-motion').evaluate(motion=>motion.getAnimations().length),0);
    await animationContext.close();
    await video.saveAs(resolve(folder,'potato-heat-preview.webm'));
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
    const biaSeat=host.getByRole('button',{name:'Abrir confirmação para remover Bia',exact:true});
    await biaSeat.click();
    await host.locator('#kick-dialog').waitFor({state:'visible'});
    await host.screenshot({path:resolve(folder,'remove-popup-desktop.png'),fullPage:true});
    await host.locator('#kick-dialog').evaluate(dialog=>{
      window.kickCancellation=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(),{once:true}));
    });
    await host.locator('#kick-dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
    await host.evaluate(()=>window.kickCancellation);
    assert.equal(await biaSeat.count(),1);
    assert.equal(await guest.locator('[data-kick-target]').count(),0);
    assert.equal(await host.locator('.seat-kick').count(),0);
    assert.equal(await host.locator('#potato-settings').count(),0);
    const roomDetails=host.getByRole('complementary',{name:'Sala e controles',exact:true});
    await roomDetails.getByRole('button',{name:'Copiar link da sala',exact:true}).waitFor();
    await roomDetails.getByRole('button',{name:'Alterar nome',exact:true}).waitFor();
    assert.equal(await host.evaluate(()=>{
      const table=document.querySelector('.potato-table').getBoundingClientRect();
      const details=document.querySelector('.potato-sidebar').getBoundingClientRect();
      return details.left>=table.right && Math.abs(details.top-table.top)<2;
    }),true);
    assert.equal(await guest.evaluate(()=>{
      const table=document.querySelector('.potato-table').getBoundingClientRect();
      const details=document.querySelector('.potato-sidebar').getBoundingClientRect();
      return details.top>=table.bottom && document.documentElement.scrollWidth<=innerWidth;
    }),true);
    await host.screenshot({path:resolve(folder,'lobby-desktop.png'),fullPage:true});
    await guest.screenshot({path:resolve(folder,'lobby-mobile.png'),fullPage:true});
    await host.getByRole('button',{name:/Começar a esquentar/}).click();
    await host.locator('#answer:not([disabled])').waitFor();
    await host.getByText('Em partida',{exact:true}).waitFor();
    await host.emulateMedia({reducedMotion:'no-preference'});
    for(const width of [1440,390,320]) {
      await host.setViewportSize({width,height:1000});
      const motion=await actualMotion(host);
      assert.ok(motion.poses>10,`Batata parada durante a partida em ${width}px`);
      assert.ok(motion.rise>(width===1440?12:width===390?6:3),`Pulo pouco visível em ${width}px: ${motion.rise}px`);
    }
    await host.setViewportSize({width:1440,height:1000});
    await host.emulateMedia({reducedMotion:'reduce'});
    await host.getByRole('button',{name:'Ativar pulos',exact:true}).waitFor();
    await host.getByRole('button',{name:'Ativar pulos',exact:true}).click();
    assert.ok((await actualMotion(host)).rise>12,'Ativação manual deve liberar os pulos com movimento reduzido.');
    await host.reload();
    await host.getByRole('button',{name:'Pulos ligados',exact:true}).waitFor();
    assert.ok((await actualMotion(host)).rise>12,'A preferência de pulos deve sobreviver ao F5.');
    await host.getByRole('button',{name:'Pulos ligados',exact:true}).click();
    await host.waitForFunction(()=>document.querySelector('.potato-motion').getAnimations().length===0);
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
    await guest.locator('#answer:not([disabled])').waitFor();
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
    await host.locator('#answer:not([disabled])').waitFor();
    assert.equal(await currentFragment(),heldFragment);
    await guest.evaluate(()=>scrollTo(0,0));
    await host.screenshot({path:resolve(folder,'held-desktop.png'),fullPage:true});
    await guest.screenshot({path:resolve(folder,'held-mobile.png'),fullPage:true});
    await host.getByRole('textbox',{name:'Qual é a palavra?',exact:true}).fill(wordFor(heldFragment.toLowerCase()));
    await host.getByRole('button',{name:'Enviar palavra',exact:true}).click();
    await guest.locator('#answer:not([disabled])').waitFor();
    await host.waitForFunction(previous=>{
      const fragment=document.querySelector('.fragment');
      return fragment&&fragment.textContent!==previous;
    },heldFragment);
    assert.notEqual(await currentFragment(),heldFragment);
    for(let remaining=0;remaining<3;remaining++)await burn();
    await host.getByRole('heading',{name:'Você venceu!',exact:true}).waitFor();
    await guest.getByRole('heading',{name:'Ana venceu!',exact:true}).waitFor();
    await host.screenshot({path:resolve(folder,'results-desktop.png'),fullPage:true});
    await host.getByRole('button',{name:'Jogar novamente',exact:true}).click();
    await host.locator('#answer:not([disabled])').waitFor();
    await host.getByText('0 palavras na roda',{exact:true}).waitFor();
    await host.getByText('Em partida',{exact:true}).waitFor();
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
    await host.locator('#answer:not([disabled])').waitFor();
    assert.equal(await host.locator('.potato-seat').count(),8);
    await guest.goto(origin);
    await guest.getByText('Batata Quente · Em partida · entre para acompanhar',{exact:true}).waitFor();
    await guest.screenshot({path:resolve(folder,'public-mobile.png'),fullPage:true});
    // A seta deve ficar livre em todas as oito posições, inclusive na roda estreita.
    for(let turnIndex=0;turnIndex<8;turnIndex++) {
      if(turnIndex)await burn();
      for(const width of [1440,1201,1101,390,320]) {
        await host.setViewportSize({width,height:900});
        await host.waitForTimeout(150);
        assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const geometry=await host.locator('.potato-arena').evaluate(arena=>{
          const bounds=arena.getBoundingClientRect();
          const orbit=arena.querySelector('.potato-orbit').getBoundingClientRect();
          const pointer=arena.querySelector('.turn-pointer').getBoundingClientRect();
          const overlaps=r=>pointer.left<r.right&&pointer.right>r.left&&pointer.top<r.bottom&&pointer.bottom>r.top;
          const fragment=arena.querySelector('.fragment'),original=fragment.textContent;
          fragment.textContent='MMM';
          const letters=document.createRange();letters.selectNodeContents(fragment);
          const center=[letters.getBoundingClientRect(),arena.querySelector('.potato-token').getBoundingClientRect()];
          const centerClear=[...arena.querySelectorAll('.potato-seat')].every(seat=>{
            const r=seat.getBoundingClientRect();
            return center.every(c=>c.right<=r.left||c.left>=r.right||c.bottom<=r.top||c.top>=r.bottom);
          });
          fragment.textContent=original;
          return {
            circle:Math.abs(orbit.width-orbit.height)<1,
            inside:[...arena.querySelectorAll('.potato-seat')].every(seat=>{const r=seat.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1;}),
            pointerClear:[...arena.querySelectorAll('.fragment,.potato-token,.seat-avatar,.potato-seat strong,.potato-seat small,.seat-hearts')].every(node=>{
              const range=document.createRange();range.selectNodeContents(node);
              return !overlaps(node.matches('.fragment')?range.getBoundingClientRect():node.getBoundingClientRect());
            }),
            centralTurnAbsent:!arena.querySelector('#potato-turn'),centerClear
          };
        });
        assert.deepEqual(geometry,{circle:true,inside:true,pointerClear:true,centralTurnAbsent:true,centerClear:true},`Roda/indicação na posição ${turnIndex}, ${width}px`);
        if(!turnIndex||width===320)await host.screenshot({path:resolve(folder,turnIndex?`turn-${turnIndex}-${width}.png`:`eight-${width}.png`),fullPage:true});
      }
    }
    await host.getByRole('button',{name:'Abrir navegação',exact:true}).click();
    await host.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await host.getByRole('button',{name:'Abrir navegação',exact:true}).click();
    await host.screenshot({path:resolve(folder,'eight-light-mobile.png'),fullPage:true});
    const removable=host.getByRole('button',{name:'Abrir confirmação para remover Bia',exact:true});
    await removable.focus();
    await removable.press('Enter');
    await host.locator('#kick-dialog').waitFor({state:'visible'});
    await host.screenshot({path:resolve(folder,'remove-popup-mobile.png'),fullPage:true});
    await host.locator('#kick-dialog').getByRole('button',{name:'Remover jogador',exact:true}).click();
    await host.locator('.potato-seat').filter({hasText:'Bia'}).getByText('Saiu',{exact:true}).waitFor();
    assert.equal(await removable.count(),0);
    assert.deepEqual(errors,[]);
    await writeFile(resolve(folder,'result.json'),JSON.stringify({ok:true,errors,word,fragment},null,2));
    console.log(`Evidências: ${folder}`);
  } finally {
    if(browser)await browser.close();
    child.kill();
  }
});
