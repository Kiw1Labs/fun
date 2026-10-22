import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';

const origin='http://127.0.0.1:15058';
const catalog=JSON.parse(await readFile('content/pokerush/catalog.json','utf8')).pokemon;
test('PokéRush: multiplayer desktop/celular, foco estável, sugestões, sequência, espectadores, F5 e revanche', {timeout:180000},async()=>{
  const folder=resolve(`artifacts/pokerush/browser-${Date.now()}`);await mkdir(folder,{recursive:true});
  try {await fetch(`${origin}/health`);throw Error('Porta 15058 já ocupada.');}catch(error){if(error.message.includes('ocupada'))throw error;}
  const python=process.env.FUN_TEST_PYTHON||(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
  const child=spawn(python,['-m','tests.browser_server'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,FUN_PORT:'15058',FUN_ORIGINS:origin,FUN_DATABASE:resolve(folder,'test.db'),FUN_MEDIA:resolve(folder,'media'),FUN_TEST_FIXTURES:'1',FUN_TEST_FROZEN_CLOCK:'1',FUN_TEST_ANSWERS:resolve(folder,'answers.json'),FUN_ADMIN_USERNAME:'',FUN_ADMIN_PASSWORD:''}});
  let logs='',browser;const errors=[],external=[],states=new Map(),sent=new Map(),used=new Set();child.stderr.on('data',data=>{logs+=data;});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function until(predicate,label) {for(let i=0;i<100;i++){if(await predicate())return;await pause(100);}throw Error(label);}
  function observe(page) {
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Content Security Policy'))errors.push(message.text());});
    page.on('request',request=>{if(!request.url().startsWith(origin)&&/^https?:/.test(request.url()))external.push(request.url());});
    page.on('websocket',socket=>{
      socket.on('framereceived',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='state')states.set(page,message);});
      socket.on('framesent',frame=>{const message=JSON.parse(String(frame.payload));if(message.action==='answer')sent.set(page,(sent.get(page)||0)+1);});
    });
  }
  const answerFor=page=>catalog.find(p=>p.types.join(',')===states.get(page).pokerush.types.join(',')&&!used.has(p.id));
  async function hit(page) {
    const pokemon=answerFor(page),old=states.get(page).round_id;
    await page.locator('#answer').fill(pokemon.name);
    await page.locator('#answer').press('Enter');
    await until(()=>states.get(page).round_id!==old,'Acerto não trocou o desafio');used.add(pokemon.id);
    return pokemon;
  }
  async function advance(page,seconds) {
    await page.evaluate(seconds=>fetch('/_fixture/advance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds})}),seconds);
  }
  async function desktopFits(page,label) {
    for(const size of [{width:1024,height:600},{width:1024,height:768},{width:1280,height:720},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}]) {
      await page.setViewportSize(size);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const geometry=await page.evaluate(()=>{
        const nodes=[...document.querySelectorAll('.rush-center,.rush-orbit,.rush-seat,.rush-success:not([hidden]),#answer,.rush-timer,.rush-room > .room-footer,#rush-suggestions:not([hidden]),.rush-ranking,.rush-winners,.rush-pokedex,.rush-dex-grid li')].filter(node=>node.getClientRects().length);
        const ring=document.querySelector('.rush-orbit')?.getBoundingClientRect(),seats=[...document.querySelectorAll('.rush-seat')];
        const radii=ring&&seats.length<=4?seats.map(seat=>{const r=seat.getBoundingClientRect();return Math.hypot(r.x+r.width/2-ring.x-ring.width/2,r.y+r.height/2-ring.y-ring.height/2);}):[];
        const dex=document.querySelector('.rush-pokedex').getBoundingClientRect(),rules=document.querySelector('.rush-rules').getBoundingClientRect();
        const list=document.querySelector('#rush-suggestions:not([hidden])')?.getBoundingClientRect(),input=document.querySelector('#answer')?.getBoundingClientRect();
        const clear=(a,b)=>a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5;
        const seatsClear=seats.every((seat,i)=>seats.slice(i+1).every(other=>clear(seat.getBoundingClientRect(),other.getBoundingClientRect())));
        const cardsClear=[...document.querySelectorAll('.rush-success:not([hidden])')].every(card=>seats.filter(seat=>seat!==card.parentElement).every(seat=>clear(card.getBoundingClientRect(),seat.getBoundingClientRect())));
        return {pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,width:innerWidth,height:innerHeight,circle:!ring||Math.abs(ring.width-ring.height)<.5,radiusSpread:radii.length?Math.max(...radii)-Math.min(...radii):0,dexAfterRules:dex.top>=rules.bottom-.5&&dex.top-rules.bottom<=10,suggestionsBelowInput:!list||(list.top>=input.bottom&&list.top-input.bottom<=10),seatsClear,cardsClear,outside:nodes.filter(node=>{const r=node.getBoundingClientRect();return r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5;}).map(node=>({class:node.className,id:node.id,rect:node.getBoundingClientRect().toJSON()}))};
      });
      assert.ok(geometry.pageHeight<=geometry.height&&geometry.pageWidth<=geometry.width,`${label} ${size.width}×${size.height}: ${JSON.stringify(geometry)}`);
      assert.deepEqual(geometry.outside,[],`${label} ${size.width}×${size.height}: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.circle&&geometry.radiusSpread<.75,`Roda circular em ${label}: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.dexAfterRules&&geometry.suggestionsBelowInput,`Posição dos componentes em ${label}: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.seatsClear&&geometry.cardsClear,`Jogadores e acertos em ${label}: ${JSON.stringify(geometry)}`);
      if(size.width===1366)await page.screenshot({path:resolve(folder,`desktop-fit-${label}.png`)});
    }
    await page.setViewportSize({width:1440,height:1000});
  }
  try {
    await until(async()=>{if(child.exitCode!==null)throw Error(logs);try{return(await fetch(`${origin}/health`)).ok;}catch{return false;}},'Servidor indisponível');
    browser=await chromium.launch({headless:true});
    const desktop=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const host=await desktop.newPage(),guest=await mobile.newPage();observe(host);observe(guest);
    await host.goto(origin);
    await host.getByRole('radio',{name:/PokéRush/}).check();
    await host.getByLabel('Nome da sala',{exact:true}).fill('O rush de Kanto');
    await host.screenshot({path:resolve(folder,'portal-desktop.png'),fullPage:true});
    await host.getByRole('button',{name:'Jogar',exact:true}).click();
    await host.locator('#identity-dialog').getByLabel('Seu nome',{exact:true}).fill('Ana');
    await host.locator('#identity-dialog').getByRole('button',{name:'Jogar',exact:true}).click();
    await host.waitForURL(/\/[A-Z]{4}$/);await host.getByRole('heading',{name:'Prontos para o rush?',exact:true}).waitFor();
    await guest.goto(host.url());
    await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Bia');
    await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await guest.getByText('O anfitrião inicia a partida.',{exact:true}).waitFor();
    await host.getByRole('button',{name:'Iniciar PokéRush',exact:true}).waitFor({state:'visible'});
    await until(()=>states.get(host)?.people.filter(p=>p.online).length===2,'Duas conexões esperadas');
    assert.equal(await host.locator('.rush-dex-grid li').count(),151);
    assert.deepEqual(await host.locator('.rush-dex-grid li').allTextContents(),Array.from({length:151},(_,i)=>String(i+1).padStart(3,'0')));
    assert.equal(await host.locator('.rush-dex-grid img').count(),0);
    await host.screenshot({path:resolve(folder,'lobby-desktop.png'),fullPage:true});
    await desktopFits(host,'lobby-2');
    await guest.screenshot({path:resolve(folder,'lobby-mobile.png'),fullPage:true});
    await host.getByRole('button',{name:'Iniciar PokéRush',exact:true}).click();
    await host.locator('#answer').waitFor();await guest.locator('#answer').waitFor();
    await host.locator('#answer').fill('an');await host.locator('#rush-suggestions li').first().waitFor();
    await desktopFits(host,'playing-2-suggestions');
    assert.equal(await host.locator('.rush-compose-bar #rush-suggestions').count(),1);
    assert.equal(await host.locator('.rush-sidebar #rush-suggestions').count(),0);
    assert.equal(await host.locator('#rush-suggestions').evaluate(list=>getComputedStyle(list).gridTemplateColumns.split(' ').length),3);
    await guest.locator('#answer').fill('p');assert.equal(await guest.locator('#rush-suggestions li').count(),0);
    await guest.locator('#answer').fill('an');await guest.locator('#rush-suggestions li').first().waitFor();
    assert.ok(await guest.locator('#rush-suggestions li').count()>5);
    assert.equal(await guest.locator('#rush-suggestions').evaluate(list=>list.clientHeight<=200&&list.scrollHeight>list.clientHeight),true);
    assert.equal(await guest.locator('#rush-suggestions .rush-type').count(),0);
    const attempts=sent.get(guest)||0;
    await guest.locator('#answer').fill('ni');
    await guest.locator('#rush-suggestions').getByText('Nidoran ♀',{exact:true}).click();
    assert.equal(await guest.locator('#answer').inputValue(),'ni');assert.equal(sent.get(guest)||0,attempts);
    assert.equal(await guest.locator('#answer').evaluate(node=>node===document.activeElement),true);
    await guest.locator('#rush-suggestions').getByText('Nidoran ♂',{exact:true}).waitFor();
    // O adversário acerta enquanto o usuário escreve: o mesmo elemento, seleção e texto devem permanecer.
    await host.locator('#answer').fill('rascunho em edição');
    await host.locator('#answer').evaluate(node=>{window.qaInput=node;node.focus();node.setSelectionRange(5,8);});
    const first=await hit(guest);
    await host.locator('.rush-success').getByText(first.name,{exact:true}).waitFor();
    for(const page of [host,guest]) {
      const cell=page.locator(`.rush-dex-grid [data-pokemon-id="${first.id}"]`);
      await cell.locator('img').waitFor();assert.equal(await cell.getAttribute('class'),'is-caught');
      assert.equal(await cell.locator('img').getAttribute('src'),first.image);
      assert.match(await cell.getAttribute('aria-label'),new RegExp(first.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      assert.equal(await cell.locator('span:not(.rush-dex-check)').count(),0);
    }
    assert.equal(await host.locator('#answer').inputValue(),'rascunho em edição');
    assert.deepEqual(await host.locator('#answer').evaluate(node=>[node===window.qaInput,node===document.activeElement,node.selectionStart,node.selectionEnd]),[true,true,5,8]);
    await guest.locator('#answer').fill(first.name.slice(0,2));
    await guest.locator('#rush-suggestions').getByText(first.name,{exact:true}).waitFor();
    await guest.waitForFunction(()=>[...document.querySelectorAll('#rush-suggestions img')].every(img=>img.complete&&img.naturalWidth===96));
    const second=await hit(guest);
    await host.getByText('🔥 ×2',{exact:true}).waitFor();
    await host.locator('.rush-success').getByText(second.name,{exact:true}).waitFor();
    assert.equal(states.get(host).people.find(p=>p.name==='Bia').score,120);
    assert.equal(await host.locator('.rush-success').getByText(first.name,{exact:true}).count(),0);
    await guest.locator('#answer').fill('nome inválido');
    const wrongRound=states.get(guest).round_id,wrongDeadline=states.get(guest).deadline;
    await guest.locator('#answer').press('Enter');
    await until(()=>states.get(guest).cooldown>states.get(guest).server_now,'Cooldown do servidor ausente');
    assert.equal(states.get(guest).round_id,wrongRound);assert.equal(states.get(guest).deadline,wrongDeadline);
    assert.equal(await guest.locator('.rush-dex-grid .is-caught').count(),2);
    assert.equal(await guest.locator('#answer-feedback').count(),0);assert.equal(states.get(guest).people.find(p=>p.name==='Bia').streak,2);
    await host.screenshot({path:resolve(folder,'playing-desktop.png'),fullPage:true});
    await guest.screenshot({path:resolve(folder,'playing-mobile.png'),fullPage:true});
    await hit(host);await until(()=>!states.get(guest).people.find(p=>p.name==='Bia').streak,'Sequência antiga permanece');
    assert.equal(await guest.locator('.rush-center').evaluate(center=>{
      const c=center.getBoundingClientRect();return [...document.querySelectorAll('.rush-success:not([hidden])')].every(card=>{const r=card.getBoundingClientRect();return r.right<=c.left||c.right<=r.left||r.bottom<=c.top||c.bottom<=r.top;});
    }),true);
    await guest.reload();await guest.locator('#answer').waitFor();
    await guest.locator(`.rush-dex-grid [data-pokemon-id="${first.id}"] img`).waitFor();
    assert.equal(await guest.locator('.rush-dex-grid .is-caught').count(),3);
    assert.equal(states.get(guest).people.filter(p=>!p.spectator).length,2);
    assert.equal(states.get(guest).people.find(p=>p.id===states.get(guest).you).score,120);
    const watcherContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const watcher=await watcherContext.newPage();observe(watcher);await watcher.goto(host.url());
    await watcher.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Caio');
    await watcher.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await watcher.getByText('Você está acompanhando. Jogue na próxima partida.',{exact:true}).waitFor();
    assert.equal(await watcher.locator('#answer').count(),0);
    await watcher.locator(`.rush-dex-grid [data-pokemon-id="${first.id}"] img`).waitFor();
    for(const size of [{width:320,height:720},{width:390,height:430},{width:390,height:844}]) {
      await guest.setViewportSize(size);await guest.locator('#answer').fill('an');
      await guest.locator('#answer').scrollIntoViewIfNeeded();
      assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.ok((await guest.locator('#answer').boundingBox()).width>=100);
      if(size.height<540) {
        await guest.locator('.rush-input-context').waitFor({state:'visible'});
        assert.equal(await guest.locator('.rush-input-types .rush-type').count(),states.get(guest).pokerush.types.length);
        await guest.screenshot({path:resolve(folder,'keyboard-viewport.png')});
      }
      await guest.screenshot({path:resolve(folder,`input-${size.width}-${size.height}.png`),fullPage:true});
    }
    const sound=guest.getByRole('button',{name:'Som ligado',exact:true});await sound.click();
    await guest.reload();await guest.getByRole('button',{name:'Som desligado',exact:true}).waitFor();
    await advance(host,31);await host.getByRole('heading',{name:'Bia venceu!',exact:true}).waitFor();
    await guest.getByRole('heading',{name:'Você venceu!',exact:true}).waitFor();
    assert.equal(await host.getByRole('table').locator('tbody tr').count(),2);
    assert.equal(await host.locator('.rush-dex-grid .is-caught').count(),3);
    await host.screenshot({path:resolve(folder,'results-desktop.png'),fullPage:true});
    await desktopFits(host,'results-2');
    await guest.screenshot({path:resolve(folder,'results-mobile.png'),fullPage:true});
    await host.getByRole('button',{name:'Jogar novamente',exact:true}).click();
    await watcher.locator('#answer').waitFor();used.clear();
    await until(()=>states.get(host)?.phase==='playing'&&states.get(host).pokerush.used_count===0,'O anfitrião ainda não recebeu o estado da revanche');
    assert.equal(states.get(host).pokerush.used_count,0);assert.ok(states.get(host).people.every(p=>p.score===0));
    assert.equal(await host.locator('.rush-dex-grid .is-caught').count(),0);
    assert.equal(await host.locator('.rush-dex-grid li').first().textContent(),'001');
    await desktopFits(host,'playing-3');
    await advance(host,31);await host.getByRole('heading',{name:'Vitória compartilhada!',exact:true}).waitFor();
    assert.equal(await host.locator('.rush-winners > div').count(),3);
    // Quatro pessoas mantêm o mesmo raio e deixam livres os tipos centrais.
    await host.evaluate(async()=>{
      const code=location.pathname.slice(1),identity=await(await fetch(`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Quarto treinador'})})).json();
      await new Promise((resolve,reject)=>{const socket=new WebSocket(`ws://${location.host}/ws/${code}`);window.qaCircleSocket=socket;socket.onopen=()=>socket.send(JSON.stringify({token:identity.token}));socket.onmessage=()=>resolve();socket.onerror=reject;});
    });
    await until(()=>states.get(host)?.people.filter(p=>p.active&&p.online).length===4,'Quarta conexão pendente');
    await host.getByRole('button',{name:'Jogar novamente',exact:true}).click();await host.locator('#answer').waitFor();
    await host.locator('#answer').fill('an');await host.locator('#rush-suggestions li').first().waitFor();
    await desktopFits(host,'playing-4');
    await advance(host,31);await host.getByRole('heading',{name:'Vitória compartilhada!',exact:true}).waitFor();
    await host.evaluate(()=>window.qaCircleSocket.send(JSON.stringify({id:crypto.randomUUID(),action:'leave'})));
    await until(()=>states.get(host)?.people.filter(p=>p.active).length===3,'Saída da quarta pessoa pendente');
    await host.evaluate(()=>window.qaCircleSocket.close());
    await host.getByRole('button',{name:'Voltar à sala',exact:true}).click();
    await host.getByRole('heading',{name:'Prontos para o rush?',exact:true}).waitFor();
    // Dezesseis pessoas: os demais sockets são clientes reais do mesmo transporte.
    await host.evaluate(async()=>{
      const code=location.pathname.slice(1);window.qaSockets=[];
      for(let i=0;i<13;i++) {
        const identity=await(await fetch(`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Treinador ${i}`})})).json();
        await new Promise((resolve,reject)=>{const socket=new WebSocket(`ws://${location.host}/ws/${code}`);window.qaSockets.push(socket);socket.onopen=()=>socket.send(JSON.stringify({token:identity.token}));socket.onmessage=()=>resolve();socket.onerror=reject;});
      }
      window.qaHeartbeat=setInterval(()=>{for(const socket of window.qaSockets)if(socket.readyState===1)socket.send(JSON.stringify({type:'ping'}));},10000);
    });
    await until(()=>states.get(host).people.length===16,'Faltam participantes');
    await host.getByRole('button',{name:'Iniciar PokéRush',exact:true}).click();
    await host.locator('#answer').waitFor();
    await hit(host);
    await host.locator('#answer').fill('an');await host.locator('#rush-suggestions li').first().waitFor();
    await desktopFits(host,'playing-16');
    const seatSuccess=host.locator('.rush-seat').filter({hasText:'Ana'}).locator('.rush-success');
    await seatSuccess.waitFor();
    for(const width of [1440,390,320]) {
      await host.setViewportSize({width,height:1000});await pause(100);
      assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await host.locator('.rush-seat').count(),16);
      assert.equal(await host.locator('.rush-seat').evaluateAll(seats=>seats.every((a,i)=>seats.slice(i+1).every(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.right<=y.left+.5||y.right<=x.left+.5||x.bottom<=y.top+.5||y.bottom<=x.top+.5;}))),true);
      const successGeometry=await host.locator('.rush-success').evaluate(card=>{
        const x=card.getBoundingClientRect();return {bounds:x.toJSON(),overlaps:[...document.querySelectorAll('.rush-seat')].filter(seat=>seat!==card.parentElement).filter(seat=>{const y=seat.getBoundingClientRect();return x.right>y.left&&y.right>x.left&&x.bottom>y.top&&y.bottom>x.top;}).map(seat=>({name:seat.innerText,bounds:seat.getBoundingClientRect().toJSON()}))};
      });
      assert.deepEqual(successGeometry.overlaps,[],`Acerto sobre jogador em ${width}px: ${JSON.stringify(successGeometry)}`);
      await host.screenshot({path:resolve(folder,`sixteen-${width}.png`),fullPage:true});
    }
    await host.setViewportSize({width:1440,height:1000});
    await advance(host,31);await until(()=>states.get(host)?.phase==='results','Resultado de 16 pessoas pendente');
    await desktopFits(host,'results-16');
    await host.getByRole('button',{name:'Jogar novamente',exact:true}).click();
    await until(()=>states.get(host)?.phase==='playing','Nova partida de 16 pessoas pendente');used.clear();
    await advance(host,31);await host.getByRole('heading',{name:'Vitória compartilhada!',exact:true}).waitFor();
    assert.equal(await host.locator('.rush-winners > div').count(),16);
    await desktopFits(host,'tie-16');
    await host.getByRole('button',{name:'Jogar novamente',exact:true}).click();
    await until(()=>states.get(host)?.phase==='playing','Retomada de 16 pessoas pendente');used.clear();
    await host.setViewportSize({width:320,height:1000});
    await host.getByRole('button',{name:'Abrir navegação',exact:true}).click();
    await host.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await host.getByRole('button',{name:'Abrir navegação',exact:true}).click();
    await host.screenshot({path:resolve(folder,'sixteen-light-mobile.png'),fullPage:true});
    await host.getByRole('button',{name:'Abrir confirmação para remover Bia',exact:true}).press('Enter');
    await host.locator('#kick-dialog').getByRole('button',{name:'Remover jogador',exact:true}).click();
    await guest.getByRole('heading',{name:'Você saiu da sala.',exact:true}).waitFor();
    await host.getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await host.locator('#close-dialog').getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await watcher.getByRole('heading',{name:'Até a próxima.',exact:true}).waitFor();
    // Oito pessoas também precisam de espaço para o acerto sem encobrir os tipos centrais.
    await host.goto(origin);
    const eightCode=await host.evaluate(async()=>{
      const identity=await(await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Ana',game:'pokerush'})})).json();
      localStorage.setItem(`fun:${identity.code}`,JSON.stringify(identity));return identity.code;
    });
    await host.goto(`${origin}/${eightCode}`);await host.getByRole('heading',{name:'Prontos para o rush?',exact:true}).waitFor();
    await host.evaluate(async()=>{
      const code=location.pathname.slice(1);window.qaSockets=[];
      for(let i=0;i<7;i++) {
        const identity=await(await fetch(`/api/rooms/${code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Treinador ${i}`})})).json();
        await new Promise((resolve,reject)=>{const socket=new WebSocket(`ws://${location.host}/ws/${code}`);window.qaSockets.push(socket);socket.onopen=()=>socket.send(JSON.stringify({token:identity.token}));socket.onmessage=()=>resolve();socket.onerror=reject;});
      }
      window.qaHeartbeat=setInterval(()=>{for(const socket of window.qaSockets)if(socket.readyState===1)socket.send(JSON.stringify({type:'ping'}));},10000);
    });
    await until(()=>states.get(host)?.code===eightCode&&states.get(host).people.filter(p=>p.online).length===8,'Oito conexões esperadas');
    await host.getByRole('button',{name:'Iniciar PokéRush',exact:true}).click();await host.locator('#answer').waitFor();used.clear();
    await hit(host);
    for(const width of [1440,390,320]) {
      await host.setViewportSize({width,height:1000});await pause(100);
      const geometry=await host.locator('.rush-center').evaluate(center=>{
        const c=center.getBoundingClientRect(),seats=[...document.querySelectorAll('.rush-seat')],cards=[...document.querySelectorAll('.rush-success:not([hidden])')];
        const clear=(a,b)=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;
        return {centerClear:[...seats,...cards].every(node=>clear(c,node.getBoundingClientRect())),seatsClear:seats.every((seat,i)=>seats.slice(i+1).every(other=>clear(seat.getBoundingClientRect(),other.getBoundingClientRect()))),cardsClear:cards.every(card=>seats.filter(seat=>seat!==card.parentElement).every(seat=>clear(card.getBoundingClientRect(),seat.getBoundingClientRect()))),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.deepEqual(geometry,{centerClear:true,seatsClear:true,cardsClear:true,overflow:false},`Mesa de oito em ${width}px`);
      await host.screenshot({path:resolve(folder,`eight-${width}.png`),fullPage:true});
    }
    await host.getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await host.locator('#close-dialog').getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await host.getByRole('heading',{name:'Até a próxima.',exact:true}).waitFor();
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await writeFile(resolve(folder,'result.json'),JSON.stringify({ok:true,errors,external,first:first.name,second:second.name},null,2));
    console.log(`Evidências PokéRush: ${folder}`);
  } finally {if(browser)await browser.close();child.kill();}
});
