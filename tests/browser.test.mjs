import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {chromium} from '@playwright/test';

const origin='http://127.0.0.1:15050', fixtureOrigin='http://127.0.0.1:15051', auditOrigin='http://127.0.0.1:15054', nicknameOrigin='http://127.0.0.1:15055';
let browser, temp, errors=[];
const processes=[];
async function createRoom(page,name,roomName='Sala de teste',visibility='private') {
  await page.getByLabel('Nome da sala',{exact:true}).fill(roomName);
  await page.getByRole('radio',{name:visibility==='public'?'Público':'Privado',exact:true}).check();
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill(name);
  await page.getByRole('dialog').getByRole('button',{name:'Jogar',exact:true}).click();
  await page.waitForURL(/\/[A-Z]{4}$/);
  await page.getByText('Ao vivo',{exact:true}).waitFor();
}
async function saveNickname(page,name) {
  const menu=page.getByRole('button',{name:'Abrir navegação',exact:true});
  if(await menu.isVisible()) await menu.click();
  await page.getByRole('button',{name:'Alterar nome do usuário',exact:true}).click();
  const popup=page.locator('#profile-dialog');
  await popup.getByLabel('Seu nome',{exact:true}).fill(name);
  await popup.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await popup.waitFor({state:'hidden'});
}
before(async()=>{
  temp=await mkdtemp(join(tmpdir(),'fun-browser-'));
  const python=process.env.FUN_TEST_PYTHON || (process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
  for(const [i,url] of [origin,fixtureOrigin,auditOrigin,nicknameOrigin].entries()) {
    try { await fetch(`${url}/health`); throw new Error(`Porta de teste já ocupada: ${url}`); } catch(error) { if(error.message.startsWith('Porta')) throw error; }
    const processHandle=spawn(python,['-m','tests.browser_server'],{env:{...process.env,FUN_PORT:new URL(url).port,FUN_ORIGINS:url,FUN_DATABASE:join(temp,`test${i}.sqlite3`),FUN_MEDIA:join(temp,'media'),FUN_TEST_FIXTURES:i===1?'1':'0',FUN_TEST_ANSWERS:join(temp,'answers.json'),FUN_ADMIN_USERNAME:'browser-admin',FUN_ADMIN_PASSWORD:'browser-admin-password',FUN_ADMIN_USERS_FILE:join(temp,`admins${i}.json`),FUN_TEST_MULTI_ADMIN:i===1?'1':'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
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

test('perfil: popup no topo, validação, cancelamento e nome persistido na criação',async()=>{
  const context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();
  try {
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(auditOrigin);
    const profile=page.getByRole('button',{name:'Alterar nome do usuário',exact:true});
    const popup=page.locator('#profile-dialog');
    await profile.click();
    await popup.getByLabel('Seu nome',{exact:true}).fill('   ');
    await popup.getByRole('button',{name:'Salvar nome',exact:true}).click();
    await popup.getByRole('alert').filter({hasText:'Digite seu nome'}).waitFor();
    await popup.getByLabel('Seu nome',{exact:true}).fill('  Ana <b>BR</b>  ');
    await popup.getByLabel('Seu nome',{exact:true}).press('Enter');
    await popup.waitFor({state:'hidden'});
    assert.equal(await page.locator('#profile-name-label').textContent(),'Ana <b>BR</b>');
    assert.equal(await profile.locator('b').count(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('fun:player-name')),'Ana <b>BR</b>');
    await profile.click();
    await popup.getByLabel('Seu nome',{exact:true}).fill('Descartar');
    await page.keyboard.press('Escape');
    assert.equal(await profile.evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('#profile-name-label').textContent(),'Ana <b>BR</b>');
    await page.reload();
    assert.equal(await page.locator('#profile-name-label').textContent(),'Ana <b>BR</b>');
    await page.getByRole('button',{name:'Recolher navegação',exact:true}).click();
    assert.equal(await profile.isVisible(),true);
    await profile.click();
    await page.screenshot({path:'artifacts/profile-popup-desktop.png',fullPage:true});
    await popup.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await profile.click();
    await page.screenshot({path:'artifacts/profile-popup-light.png',fullPage:true});
    await popup.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await page.getByRole('button',{name:'Jogar',exact:true}).click();
    await page.waitForURL(/\/[A-Z]{4}$/);
    assert.equal(await page.locator('#identity-dialog').evaluate(el=>el.open),false);
    await page.getByRole('heading',{name:'Sala do Ana <b>BR</b>',exact:true}).waitFor();
    await page.getByText('Ana <b>BR</b> (você)',{exact:true}).waitFor();
    await page.screenshot({path:'artifacts/profile-sidebar-desktop.png',fullPage:true});
  } finally { await context.close(); }
});

test('perfil: celular reutiliza nickname na entrada e altera nome na partida sem perder pontos',async()=>{
  const hostContext=await browser.newContext(),guestContext=await browser.newContext({viewport:{width:320,height:720},reducedMotion:'reduce'});
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  try {
    for(const page of [host,guest]) page.on('pageerror',error=>errors.push(error.message));
    await host.goto(fixtureOrigin);
    await createRoom(host,'Ana');
    await guest.goto(host.url());
    const menu=guest.getByRole('button',{name:'Abrir navegação',exact:true});
    const popup=guest.locator('#profile-dialog');
    await menu.click();
    await guest.getByRole('button',{name:'Alterar nome do usuário',exact:true}).focus();
    await guest.keyboard.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'),'false');
    await popup.getByLabel('Seu nome',{exact:true}).fill('Bia');
    await popup.getByRole('button',{name:'Salvar nome',exact:true}).click();
    assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
    assert.equal(await guest.locator('#join-name-field').isVisible(),false);
    assert.equal(await guest.locator('#known-identity strong').textContent(),'Bia');
    await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await guest.getByText('Ao vivo',{exact:true}).waitFor();
    const identity=await guest.evaluate(code=>JSON.parse(localStorage.getItem(`fun:${code}`)),new URL(guest.url()).pathname.slice(1));
    const tab=await guestContext.newPage();
    await tab.goto(guest.url());
    await tab.getByText('Ao vivo',{exact:true}).waitFor();
    await guest.bringToFront();
    await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
    await guest.getByLabel('Sua resposta').waitFor();
    const index=(await guest.locator('.prompt').textContent()).match(/\d+/)[0];
    await guest.getByLabel('Sua resposta').fill(`Resposta sintética ${index}`);
    await guest.getByRole('button',{name:'Responder',exact:true}).click();
    await guest.getByText('Você acertou! Aguarde os demais.').waitFor();
    const score=await guest.locator('.scoreboard li').filter({hasText:'Bia'}).locator('.score').textContent();
    assert.ok(Number(score)>0);
    await menu.click();
    await guest.screenshot({path:'artifacts/profile-sidebar-mobile.png',fullPage:true});
    await guest.getByRole('button',{name:'Alterar nome do usuário',exact:true}).click();
    await popup.getByLabel('Seu nome',{exact:true}).fill('Beatriz');
    await guest.screenshot({path:'artifacts/profile-popup-mobile.png',fullPage:true});
    await popup.getByLabel('Seu nome',{exact:true}).press('Enter');
    await popup.waitFor({state:'hidden'});
    await host.getByText('Beatriz',{exact:true}).waitFor();
    for(const page of [guest,tab]) {
      await page.getByText('Beatriz (você)',{exact:true}).waitFor();
      assert.equal(await page.locator('#profile-name-label').textContent(),'Beatriz');
      assert.equal(await page.locator('.scoreboard li').count(),2);
      assert.equal(await page.locator('.scoreboard li').filter({hasText:'Beatriz'}).locator('.score').textContent(),score);
    }
    assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await guest.reload();
    await guest.getByText('Beatriz (você)',{exact:true}).waitFor();
    assert.deepEqual(await guest.evaluate(code=>JSON.parse(localStorage.getItem(`fun:${code}`)),identity.code),identity);
    assert.equal(await guest.evaluate(()=>localStorage.getItem('fun:player-name')),'Beatriz');
  } finally { await hostContext.close(); await guestContext.close(); }
});

test('perfil: armazenamento bloqueado mantém popup recuperável e nome anterior',async()=>{
  const context=await browser.newContext();
  try {
    await context.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});
    const page=await context.newPage();
    await page.goto(auditOrigin);
    await page.getByRole('button',{name:'Alterar nome do usuário',exact:true}).click();
    const popup=page.locator('#profile-dialog');
    await popup.getByLabel('Seu nome',{exact:true}).fill('Ana');
    await popup.getByRole('button',{name:'Salvar nome',exact:true}).click();
    await popup.getByRole('alert').filter({hasText:'Permita o armazenamento'}).waitFor();
    assert.equal(await popup.getByLabel('Seu nome',{exact:true}).inputValue(),'Ana');
    assert.equal(await popup.getByRole('button',{name:'Salvar nome',exact:true}).isEnabled(),true);
    assert.equal(await page.locator('#profile-name-label').textContent(),'Adicione seu nickname');
    await popup.getByRole('button',{name:'Cancelar',exact:true}).click();
    await popup.waitFor({state:'hidden'});
  } finally { await context.close(); }
});

test('perfil: recusa do servidor permite corrigir e confirmação perdida é retomada com o mesmo evento',async()=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  page.setDefaultTimeout(6000);
  try {
    let rejectFirst=true,holdAck=false,ackSeen,reconnect;
    const events=[];
    const ackArrived=new Promise(resolve=>{ackSeen=resolve;});
    await page.routeWebSocket('**/ws/*',route=>{
      const server=route.connectToServer();
      let closed=false;
      route.onMessage(message=>{
        const parsed=JSON.parse(String(message));
        if(parsed.action==='rename_player') {
          events.push(parsed);
          if(rejectFirst) {rejectFirst=false;server.send(JSON.stringify({...parsed,name:'   '}));return;}
        }
        server.send(message);
      });
      server.onMessage(message=>{
        if(closed) return;
        const parsed=JSON.parse(String(message));
        if(holdAck&&parsed.type==='ack') {
          holdAck=false;
          reconnect=async()=>{closed=true;await route.close({code:1012});await server.close();};
          ackSeen();return;
        }
        route.send(message);
      });
    });
    await page.goto(auditOrigin);
    await createRoom(page,'Ana');
    await page.getByRole('button',{name:'Alterar nome do usuário',exact:true}).click();
    const popup=page.locator('#profile-dialog');
    await popup.getByLabel('Seu nome',{exact:true}).fill('Aninha');
    await popup.getByRole('button',{name:'Salvar nome',exact:true}).click();
    await popup.getByRole('alert').filter({hasText:'Use um nome de 1 a 24 caracteres'}).waitFor();
    assert.equal(await popup.getByLabel('Seu nome',{exact:true}).inputValue(),'Aninha');
    assert.equal(await popup.getByRole('button',{name:'Salvar nome',exact:true}).isEnabled(),true);
    assert.equal(await page.locator('#profile-name-label').textContent(),'Ana');
    holdAck=true;
    await popup.getByRole('button',{name:'Salvar nome',exact:true}).click();
    await ackArrived;
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await popup.evaluate(el=>el.open),true);
    assert.equal(await page.locator('#profile-submit').isDisabled(),true);
    assert.equal(events.length,2);
    await reconnect();
    await popup.waitFor({state:'hidden'});
    await page.getByText('Aninha (você)',{exact:true}).waitFor();
    assert.equal(events.length,3);
    assert.deepEqual(events[2],events[1]);
    assert.equal(await page.locator('.scoreboard li').count(),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem('fun:player-name')),'Aninha');
  } finally { await context.close(); }
});

for(const entry of ['código','lista pública','link']) test(`nickname salvo: entra por ${entry} sem pedir identificação e retoma a sessão`,async()=>{
  const hostContext=await browser.newContext(),guestContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  try {
    for(const page of [host,guest]) page.on('pageerror',error=>errors.push(error.message));
    await host.goto(nicknameOrigin);
    const roomName=`Entrada por ${entry}`;
    await createRoom(host,'Ana',roomName,'public');
    const roomURL=host.url(),roomCode=new URL(roomURL).pathname.slice(1);
    await guest.goto(nicknameOrigin);
    await saveNickname(guest,'Bia');
    await guest.reload();
    let joins=0;
    guest.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith(`/api/rooms/${roomCode}/join`)) joins++;});
    if(entry==='código') {
      await guest.getByLabel('Código da sala',{exact:true}).fill(roomCode.toLowerCase());
      await guest.locator('#join-code-form').getByRole('button',{name:'Entrar',exact:true}).click();
    } else if(entry==='lista pública') {
      await guest.locator('.directory-list li').filter({hasText:roomName}).getByRole('button',{name:`Entrar na sala ${roomName}`,exact:true}).click();
    } else await guest.goto(roomURL);
    await guest.waitForURL(roomURL);
    await guest.getByText('Bia (você)',{exact:true}).waitFor();
    await host.getByText('Bia',{exact:true}).waitFor();
    assert.equal(await guest.locator('#identity-dialog').evaluate(el=>el.open),false);
    assert.equal(joins,1);
    const identity=await guest.evaluate(code=>JSON.parse(localStorage.getItem(`fun:${code}`)),roomCode);
    await guest.reload();
    await guest.getByText('Bia (você)',{exact:true}).waitFor();
    assert.deepEqual(await guest.evaluate(code=>JSON.parse(localStorage.getItem(`fun:${code}`)),roomCode),identity);
    assert.equal(joins,1);
    assert.equal(await host.locator('.scoreboard li').count(),2);
  } finally { await Promise.all([hostContext.close(),guestContext.close()]); }
});

for(const entry of ['código','link']) test(`nickname salvo: falha de rede por ${entry} permite tentar novamente sem repetir nome ou duplicar pessoa`,async()=>{
  const hostContext=await browser.newContext(),guestContext=await browser.newContext({viewport:{width:320,height:720},reducedMotion:'reduce'});
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  const nickname=entry==='link'?'W'.repeat(24):'Bia';
  let release;
  const barrier=new Promise(resolve=>{release=resolve;});
  try {
    await host.goto(nicknameOrigin);
    await createRoom(host,'Ana','Entrada recuperável','public');
    const roomURL=host.url(),roomCode=new URL(roomURL).pathname.slice(1);
    await guest.goto(nicknameOrigin);
    await saveNickname(guest,nickname);
    let fail=true,joins=0,started;
    const requested=new Promise(resolve=>{started=resolve;});
    await guest.route('**/api/rooms/*/join',async route=>{
      joins++;
      if(fail) {started();await barrier;await route.abort('failed');}
      else await route.continue();
    });
    if(entry==='código') {
      await guest.getByLabel('Código da sala',{exact:true}).fill(roomCode);
      await guest.locator('#join-code-form').getByRole('button',{name:'Entrar',exact:true}).click();
    } else await guest.goto(roomURL);
    await requested;
    const form=guest.locator(entry==='código'?'#join-code-form':'#room-form');
    await form.evaluate(form=>form.requestSubmit());
    if(entry==='código') {
      await guest.locator('.directory-list li').filter({hasText:'Entrada recuperável'}).getByRole('button').click();
    } else {
      assert.equal(await guest.locator('#join-name-field').isVisible(),false);
      assert.equal(await guest.locator('#known-identity strong').textContent(),nickname);
    }
    assert.equal(joins,1);
    release();
    await guest.locator('#notice').filter({hasText:'Verifique sua conexão'}).waitFor();
    assert.equal(await guest.locator('#identity-dialog').evaluate(el=>el.open),false);
    assert.equal(await guest.evaluate(()=>localStorage.getItem('fun:player-name')),nickname);
    assert.equal(await form.getByRole('button').isEnabled(),true);
    assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(entry==='link') await guest.screenshot({path:'artifacts/saved-nickname-link-retry-mobile.png',fullPage:true});
    fail=false;
    await form.getByRole('button').click();
    await guest.waitForURL(roomURL);
    await guest.getByText(`${nickname} (você)`,{exact:true}).waitFor();
    await host.getByText(nickname,{exact:true}).waitFor();
    assert.equal(joins,2);
    assert.equal(await host.locator('.scoreboard li').count(),2);
  } finally { release();await Promise.all([hostContext.close(),guestContext.close()]); }
});

test('nickname ausente ou inválido continua pedindo identificação antes de entrar por link',async()=>{
  const hostContext=await browser.newContext(),guestContext=await browser.newContext();
  try {
    const host=await hostContext.newPage(),guest=await guestContext.newPage();
    await host.goto(nicknameOrigin);
    await createRoom(host,'Ana');
    await guest.addInitScript(()=>localStorage.setItem('fun:player-name','   '));
    let joins=0;
    guest.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/join')) joins++;});
    await guest.goto(host.url());
    const name=guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true});
    await name.waitFor();
    assert.equal(joins,0);
    await name.fill('Bia');
    await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await guest.getByText('Bia (você)',{exact:true}).waitFor();
    assert.equal(joins,1);
  } finally { await Promise.all([hostContext.close(),guestContext.close()]); }
});

test('auditoria: nome padrão, Enter no formulário e reentrada sem duplicar pessoa',async()=>{
  const context=await browser.newContext({reducedMotion:'reduce'});
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(auditOrigin);
  await page.getByLabel('Nome da sala',{exact:true}).fill('   ');
  await page.getByRole('radio',{name:'Público',exact:true}).check();
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('kiwi');
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).press('Enter');
  await page.waitForURL(/\/[A-Z]{4}$/);
  await page.getByRole('heading',{name:'Sala do kiwi',exact:true}).waitFor();
  const roomURL=page.url(), roomCode=new URL(roomURL).pathname.slice(1);
  const initial=await page.evaluate(code=>JSON.parse(localStorage.getItem(`fun:${code}`)).participant,roomCode);
  await page.goto(auditOrigin);
  await page.getByLabel('Código da sala',{exact:true}).fill(roomCode.toLowerCase());
  await page.locator('#join-code-form').getByRole('button',{name:'Entrar',exact:true}).click();
  await page.waitForURL(roomURL,{timeout:5000});
  await page.getByText('kiwi (você)',{exact:true}).waitFor();
  const resumed=await page.evaluate(code=>JSON.parse(localStorage.getItem(`fun:${code}`)).participant,roomCode);
  assert.equal(resumed,initial);
  assert.equal(await page.locator('.scoreboard li').count(),1);
  await page.screenshot({path:'artifacts/audit-default-room.png',fullPage:true});
  await context.close();
});

test('auditoria: API antiga explica incompatibilidade e não envia criação',async()=>{
  const context=await browser.newContext({reducedMotion:'reduce'});
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  let creations=0;
  await page.route('**/health',route=>route.fulfill({json:{status:'ok',game:'sabe-essa'}}));
  await page.route('**/api/rooms',route=>{
    if(route.request().method()==='POST') { creations++; return route.fulfill({status:400,json:{error:'Informe apenas o nome.'}}); }
    return route.fulfill({status:404,body:'Página não encontrada.'});
  });
  await page.goto(auditOrigin);
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('kiwi');
  await page.getByRole('dialog').getByRole('button',{name:'Jogar',exact:true}).click();
  await page.locator('#identity-error').filter({hasText:'Reinicie o servidor local'}).waitFor();
  assert.equal(creations,0);
  assert.equal(await page.locator('#identity-submit').isEnabled(),true);
  assert.equal(await page.locator('#identity-cancel').isEnabled(),true);
  await context.close();
});

test('auditoria: armazenamento bloqueado não cria uma sala sem sessão',async()=>{
  const context=await browser.newContext();
  await context.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});
  const page=await context.newPage();
  let posts=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/rooms'))posts++;});
  await page.goto(auditOrigin);
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('kiwi');
  await page.getByRole('dialog').getByRole('button',{name:'Jogar',exact:true}).click();
  await page.locator('#identity-error').filter({hasText:'Permita o armazenamento'}).waitFor();
  assert.equal(posts,0);
  assert.equal(await page.locator('#identity-cancel').isEnabled(),true);
  await context.close();
});

test('auditoria: falha de rede permite corrigir e tentar novamente sem perder nome',async()=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  let fail=true;
  await page.route('**/api/rooms',route=>route.request().method()==='POST'&&fail?route.abort('failed'):route.continue());
  await page.goto(auditOrigin);
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('kiwi');
  await page.getByRole('dialog').getByRole('button',{name:'Jogar',exact:true}).click();
  await page.locator('#identity-error').filter({hasText:'Verifique sua conexão'}).waitFor();
  assert.equal(await page.locator('#player-name').inputValue(),'kiwi');
  assert.equal(await page.locator('#identity-submit').isEnabled(),true);
  fail=false;
  await page.locator('#identity-submit').click();
  await page.waitForURL(/\/[A-Z]{4}$/);
  await page.getByRole('heading',{name:'Sala do kiwi',exact:true}).waitFor();
  await context.close();
});

test('auditoria: envio repetido e Escape durante criação não duplicam a sala',async()=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  let release,started,posts=0;
  const barrier=new Promise(resolve=>{release=resolve;});
  const requested=new Promise(resolve=>{started=resolve;});
  await page.route('**/api/rooms',async route=>{
    if(route.request().method()==='POST') {posts++;started();await barrier;}
    await route.continue();
  });
  await page.goto(auditOrigin);
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('Ana');
  await page.locator('#identity-submit').click();
  await requested;
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#identity-dialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#identity-cancel').isDisabled(),true);
  assert.equal(posts,1);
  release();
  await page.waitForURL(/\/[A-Z]{4}$/);
  await page.getByText('Ana (você)',{exact:true}).waitFor();
  assert.equal(await page.locator('.scoreboard li').count(),1);
  await context.close();
});

test('auditoria: sala cheia bloqueia entrada e mantém a identificação recuperável',async()=>{
  const hostContext=await browser.newContext(), guestContext=await browser.newContext();
  const host=await hostContext.newPage(), guest=await guestContext.newPage();
  await host.goto(auditOrigin);
  await createRoom(host,'Anfitrião','Sala lotada','public');
  const code=new URL(host.url()).pathname.slice(1);
  for(let i=0;i<15;i++) {
    const result=await host.request.post(`${auditOrigin}/api/rooms/${code}/join`,{headers:{Origin:auditOrigin},data:{name:`Teste ${i}`}});
    assert.equal(result.status(),201);
  }
  await guest.goto(auditOrigin);
  const row=guest.locator('.directory-list li').filter({hasText:'Sala lotada'});
  await row.getByRole('button',{name:'Entrar na sala Sala lotada'}).waitFor();
  assert.equal(await row.getByRole('button').isDisabled(),true);
  await guest.getByLabel('Código da sala',{exact:true}).fill(code);
  await guest.locator('#join-code-form').getByRole('button',{name:'Entrar',exact:true}).click();
  await guest.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('Extra');
  await guest.locator('#identity-submit').click();
  await guest.locator('#identity-error').filter({hasText:'Sala cheia'}).waitFor();
  assert.equal(await guest.locator('#identity-submit').isEnabled(),true);
  assert.equal(await guest.locator('#player-name').inputValue(),'Extra');
  await guest.locator('#identity-cancel').click();
  assert.equal(new URL(guest.url()).pathname,'/');
  await guestContext.close();await hostContext.close();
});

test('auditoria: resposta em edição, transição perdida e resultado com só um competidor',async()=>{
  const hostContext=await browser.newContext(), guestContext=await browser.newContext();
  const host=await hostContext.newPage(), guest=await guestContext.newPage();
  host.setDefaultTimeout(6000);
  let holdAck=false,deliverAck,ackSeen,hideReveal=false,sawReveal;
  const ackArrived=new Promise(resolve=>{ackSeen=resolve;});
  const revealArrived=new Promise(resolve=>{sawReveal=resolve;});
  await host.routeWebSocket('**/ws/*',route=>{
    const server=route.connectToServer();
    server.onMessage(message=>{
      const parsed=JSON.parse(String(message));
      if(holdAck&&parsed.type==='ack') {deliverAck=()=>route.send(message);ackSeen();return;}
      if(hideReveal&&parsed.type==='state'&&parsed.phase==='reveal') {sawReveal();return;}
      route.send(message);
    });
  });
  await host.goto(fixtureOrigin);
  await createRoom(host,'Ana');
  await guest.goto(host.url());
  await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Bia');
  await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await guest.getByText('Ao vivo',{exact:true}).waitFor();
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  await host.getByLabel('Sua resposta').fill('errado');
  holdAck=true;
  await host.getByRole('button',{name:'Responder',exact:true}).click();
  await ackArrived;
  await host.getByLabel('Sua resposta').fill('nova tentativa em edição');
  deliverAck();holdAck=false;
  await host.waitForFunction(()=>document.querySelector('#answer-feedback')?.textContent==='');
  assert.equal(await host.getByLabel('Sua resposta').inputValue(),'nova tentativa em edição');
  hideReveal=true;
  await host.request.post(`${fixtureOrigin}/_fixture/advance`,{headers:{Origin:fixtureOrigin},data:{seconds:20.1}});
  await revealArrived;
  await host.request.post(`${fixtureOrigin}/_fixture/advance`,{headers:{Origin:fixtureOrigin},data:{seconds:4.1}});
  await host.getByRole('heading',{name:/Desafio 2/}).waitFor();
  assert.equal(await host.getByLabel('Sua resposta').inputValue(),'');
  await guest.getByRole('button',{name:'Sair da sala',exact:true}).click();
  await host.getByText('Ana venceu por permanência.',{exact:true}).waitFor();
  assert.equal(await host.getByRole('button',{name:'Iniciar nova partida',exact:true}).isDisabled(),true);
  await hostContext.close();await guestContext.close();
});

test('auditoria: 15 desafios completos, resultados, nova partida e retorno ao lobby',async()=>{
  const a=await browser.newContext(),b=await browser.newContext({viewport:{width:390,height:844}});
  const host=await a.newPage(),guest=await b.newPage();
  await host.goto(fixtureOrigin);
  await createRoom(host,'Ana');
  await guest.goto(host.url());
  await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Bia');
  await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await guest.getByText('Ao vivo',{exact:true}).waitFor();
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  for(let round=1;round<=15;round++) {
    await host.getByLabel('Sua resposta').waitFor();
    const index=(await host.locator('.prompt').textContent()).match(/\d+/)[0];
    for(const page of [host,guest]) {
      await page.getByLabel('Sua resposta').fill(`Resposta sintética ${index}`);
      await page.getByRole('button',{name:'Responder',exact:true}).click();
    }
    await host.getByText('A resposta é',{exact:true}).waitFor();
    assert.equal(await host.locator('.reveal strong').textContent(),`Resposta sintética ${index}`);
    await host.request.post(`${fixtureOrigin}/_fixture/advance`,{headers:{Origin:fixtureOrigin},data:{seconds:4.1}});
    if(round<15) await host.getByRole('heading',{name:new RegExp(`Desafio ${round+1} / 15`)}).waitFor();
  }
  await host.getByText('15 desafios. Muitas descobertas.',{exact:true}).waitFor();
  assert.equal(await host.getByRole('button',{name:'Retornar todos ao lobby',exact:true}).isVisible(),true);
  await host.screenshot({path:'artifacts/audit-results-desktop.png',fullPage:true});
  await host.getByRole('button',{name:'Iniciar nova partida',exact:true}).click();
  await host.getByRole('heading',{name:'Desafio 1 / 15',exact:true}).waitFor();
  assert.deepEqual(await host.locator('.scoreboard .score').allTextContents(),['0','0']);
  await guest.getByRole('button',{name:'Sair da sala',exact:true}).click();
  await host.getByText('Ana venceu por permanência.',{exact:true}).waitFor();
  await host.getByRole('button',{name:'Retornar todos ao lobby',exact:true}).click();
  await host.getByRole('heading',{name:'Sala de teste',exact:true}).waitFor();
  assert.equal(await host.getByRole('button',{name:'Iniciar partida',exact:true}).isDisabled(),true);
  await a.close();await b.close();
});

test('lobby: anfitrião altera nome da sala e remove a descrição antiga',async()=>{
  const a=await browser.newContext(),b=await browser.newContext();
  const host=await a.newPage(),guest=await b.newPage();
  try {
  await host.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedRoomLink=text;}}});});
  await host.goto(fixtureOrigin);
  await createRoom(host,'Ana');
  await guest.goto(host.url());
  await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Bia');
  await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
  await guest.getByText('Ao vivo',{exact:true}).waitFor();
  assert.equal(await host.getByText(/Imagens e textos intercalados/, {exact:false}).count(),0);
  assert.deepEqual(await host.locator('.scoreboard .rank').allTextContents(),['','']);
  await host.getByRole('button',{name:'Copiar link da sala',exact:true}).click();
  await host.getByRole('status').filter({hasText:'Link copiado para compartilhar.'}).waitFor();
  assert.equal(await host.evaluate(()=>window.copiedRoomLink),host.url());
  await host.getByRole('button',{name:'Alterar nome da sala',exact:true}).click();
  await host.getByLabel('Novo nome da sala',{exact:true}).fill('Noite de jogos');
  await host.getByRole('button',{name:'Salvar nome',exact:true}).click();
  await host.getByRole('heading',{name:'Noite de jogos',exact:true}).waitFor();
  await guest.getByRole('heading',{name:'Noite de jogos',exact:true}).waitFor();
  assert.equal(await guest.getByRole('button',{name:'Alterar nome da sala',exact:true}).count(),0);
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  await host.getByRole('heading',{name:/Desafio 1/}).waitFor();
  assert.equal(await host.getByRole('button',{name:'Alterar nome da sala',exact:true}).count(),0);
  } finally { await a.close();await b.close(); }
});

test('auditoria: nome de sala longo no celular e nome do jogador só com espaços',async()=>{
  const context=await browser.newContext({viewport:{width:320,height:720},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(auditOrigin);
  await page.getByLabel('Nome da sala',{exact:true}).fill('S'.repeat(48));
  await page.getByRole('button',{name:'Jogar',exact:true}).click();
  await page.locator('#player-name').fill('   ');
  await page.locator('#identity-submit').click();
  await page.locator('#identity-error').filter({hasText:'Digite seu nome'}).waitFor();
  assert.equal(await page.locator('#player-name').isEnabled(),true);
  await page.locator('#player-name').fill('Á'.repeat(24));
  await page.locator('#identity-submit').click();
  await page.waitForURL(/\/[A-Z]{4}$/);
  await page.getByRole('heading',{name:'S'.repeat(48),exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/audit-long-name-mobile.png',fullPage:true});
  await context.close();
});

test('auditoria: espectador, expulsão durante partida e encerramento nos resultados',async()=>{
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  const [host,guest,viewer]=await Promise.all(contexts.map(context=>context.newPage()));
  await host.goto(fixtureOrigin);
  await createRoom(host,'Ana');
  async function join(page,name) {
    await page.goto(host.url());
    await page.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill(name);
    await page.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await page.getByText('Ao vivo',{exact:true}).waitFor();
  }
  await join(guest,'Bia');
  await host.getByRole('button',{name:'Iniciar partida',exact:true}).click();
  await host.getByLabel('Sua resposta').waitFor();
  await join(viewer,'Carol');
  await viewer.getByText('Você está acompanhando',{exact:true}).waitFor();
  assert.equal(await viewer.getByLabel('Sua resposta').count(),0);
  assert.equal(await viewer.locator('.scoreboard li[data-kick-target]').count(),0);
  const biaRow=host.locator('.scoreboard li').filter({hasText:'Bia'});
  assert.equal(await biaRow.locator('button').count(),0);
  assert.equal(await biaRow.getAttribute('role'),'button');
  await biaRow.click();
  await host.getByRole('dialog').getByText('Você está removendo Bia da sala. Confirma a remoção?',{exact:true}).waitFor();
  await host.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await host.locator('#kick-dialog').waitFor({state:'hidden'});
  await host.getByText('Bia',{exact:true}).waitFor();
  await biaRow.focus(); await biaRow.press('Enter');
  await host.getByRole('dialog').getByRole('button',{name:'Remover jogador',exact:true}).click();
  await guest.getByText('Você saiu da sala.',{exact:true}).waitFor();
  await host.getByText('Ana venceu por permanência.',{exact:true}).waitFor();
  const departed=host.locator('.scoreboard li.departed').filter({hasText:'Bia'});
  assert.equal(await departed.locator('.rank').textContent(),'');
  await host.getByRole('button',{name:'Encerrar sala',exact:true}).click();
  await host.locator('#close-dialog').getByRole('button',{name:'Encerrar sala',exact:true}).click();
  await viewer.getByText('Até a próxima.',{exact:true}).waitFor();
  await Promise.all(contexts.map(context=>context.close()));
});
after(async()=>{
  if(browser) await browser.close();
  for(const processHandle of processes) {
    if(processHandle.exitCode!==null || processHandle.signalCode!==null) continue;
    const exited=new Promise(r=>processHandle.once('exit',r));
    if(process.platform==='win32') {
      assert.ok(Number.isInteger(processHandle.pid));
      const stop=spawn('taskkill',['/PID',String(processHandle.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      const result=await new Promise(r=>stop.once('exit',r));
      if(result!==0 && processHandle.exitCode===null && processHandle.signalCode===null) throw new Error(`Não foi possível encerrar o servidor de teste ${processHandle.pid}: ${result}`);
    } else processHandle.kill();
    let timeout;
    try { await Promise.race([exited,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Servidor de teste não encerrou em 10 s.')),10000);})]); }
    finally { clearTimeout(timeout); }
  }
  if(temp) { assert.equal(dirname(temp),tmpdir()); await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
});

test('godmode mostra login próprio, opções e dados protegidos',async()=>{
  assert.equal((await fetch(`${fixtureOrigin}/api/godmode/rooms`)).status,401);
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto(`${fixtureOrigin}/godmode`);
  await page.getByRole('heading',{name:'Entrar no Godmode'}).waitFor();
  assert.equal(await page.locator('#dashboard').isVisible(),false);
  assert.ok(await page.locator('.brand img').evaluateAll(images=>images.length===2&&images.every(img=>img.complete&&img.naturalWidth>0)));
  await page.screenshot({path:'artifacts/godmode-login-desktop.png',fullPage:true});
  await page.locator('#login-username').fill('browser-admin');
  await page.locator('#login-password').fill('senha-incorreta');
  await page.getByRole('button',{name:'Entrar'}).click();
  await page.getByRole('alert').getByText(/Usuário ou senha incorretos/).waitFor();
  await page.locator('#login-password').fill('browser-admin-password');
  await page.getByRole('button',{name:'Entrar'}).click();
  await page.getByRole('heading',{name:'Godmode',exact:true}).waitFor();
  await page.getByText(/^Atualizado às/).waitFor();
  assert.equal(await page.locator('#login-view').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Sabe Essa?',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Salas abertas',exact:true}).getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#rooms-panel').isVisible(),false);
  assert.ok(await page.locator('#questions tr').count()>1);
  await page.getByLabel('Buscar no acervo',{exact:true}).fill('busca sem correspondência de teste');
  await page.getByText('Nenhuma pergunta encontrada.',{exact:true}).waitFor();
  await page.getByLabel('Buscar no acervo',{exact:true}).fill('');
  assert.ok(await page.locator('#questions tr').count()>1);
  await page.screenshot({path:'artifacts/godmode-dashboard-desktop.png'});
  await page.getByRole('button',{name:'Alternar tema',exact:true}).click();
  await page.screenshot({path:'artifacts/godmode-dashboard-light.png'});
  await page.getByRole('button',{name:'Sair'}).click();
  await page.getByRole('heading',{name:'Entrar no Godmode'}).waitFor();
  assert.equal(await page.locator('#dashboard').isVisible(),false);
  await context.close();
});

test('godmode: usuários adicionais entram com senhas próprias e não aceitam senha de outra conta',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  try {
    const page=await context.newPage();
    await page.goto(`${fixtureOrigin}/godmode`);
    await page.getByRole('heading',{name:'Entrar no Godmode',exact:true}).waitFor();
    await page.screenshot({path:'artifacts/godmode-login-mobile.png',fullPage:true});
    await page.getByLabel('Usuário',{exact:true}).fill('browser-second');
    await page.getByLabel('Senha',{exact:true}).fill('browser-third-password');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('alert').getByText(/Usuário ou senha incorretos/).waitFor();
    for(const username of ['browser-second','browser-third']) {
      await page.getByLabel('Usuário',{exact:true}).fill(username);
      await page.getByLabel('Senha',{exact:true}).fill(`${username}-password`);
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      await page.getByRole('heading',{name:'Godmode',exact:true}).waitFor();
      await page.getByText(/^Atualizado às/).waitFor();
      assert.equal(await page.locator('#login-view').isVisible(),false);
      assert.ok(await page.locator('#questions tr').count()>1);
      assert.equal(await page.locator('#questions-panel').isVisible(),true);
      for(const width of [320,390,768,1024]) {
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      }
      await page.setViewportSize({width:390,height:844});
      if(username==='browser-second') await page.screenshot({path:'artifacts/godmode-dashboard-mobile.png'});
      await page.getByRole('button',{name:'Sair',exact:true}).click();
      await page.getByRole('heading',{name:'Entrar no Godmode',exact:true}).waitFor();
      assert.equal(await page.locator('#dashboard').isVisible(),false);
      assert.equal(await page.getByLabel('Senha',{exact:true}).inputValue(),'');
    }
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>/admin|password|authorization/i.test(key))),false);
  } finally { await context.close(); }
});

test('godmode: tema compartilhado com o início e navegação móvel por teclado',async()=>{
  const context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  try {
    const page=await context.newPage();
    await page.goto(fixtureOrigin);
    await page.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await page.goto(`${fixtureOrigin}/godmode`);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.screenshot({path:'artifacts/godmode-login-light.png',fullPage:true});
    await page.getByRole('button',{name:'Alternar tema',exact:true}).click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.getByRole('button',{name:'Recolher navegação',exact:true}).click();
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
    await page.locator('#sidebar').click({position:{x:34,y:500}});
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'true');
    await page.setViewportSize({width:390,height:844});
    const menu=page.getByRole('button',{name:'Abrir navegação',exact:true});
    await menu.click();
    assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
    await page.getByRole('button',{name:'Alternar tema',exact:true}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#theme').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
    assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
    await menu.click();
    await page.locator('#menu-backdrop').click({position:{x:380,y:300}});
    assert.equal(await menu.getAttribute('aria-expanded'),'false');
    await menu.click();
    await page.setViewportSize({width:1366,height:900});
    await page.waitForFunction(()=>!document.querySelector('main').inert);
    assert.equal(await page.locator('#menu-backdrop').isVisible(),false);
    assert.equal(await page.locator('a[aria-current=page]').getAttribute('href'),'/godmode');
  } finally { await context.close(); }
});

test('godmode: opções mostram perguntas, links das salas, participantes e transferência do anfitrião',async()=>{
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})]);
  const [host,guest,admin]=await Promise.all(contexts.map(context=>context.newPage()));
  const roomName='Sala <b>da turma</b>', hostName='Ana <b>', guestName='<img>Bia</img>';
  try {
    await host.goto(fixtureOrigin);
    await createRoom(host,hostName,roomName);
    const roomURL=host.url();
    await guest.goto(roomURL);
    await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill(guestName);
    await guest.getByRole('button',{name:'Entrar na sala',exact:true}).click();
    await guest.getByText('Ao vivo',{exact:true}).waitFor();
    await admin.goto(`${fixtureOrigin}/godmode`);
    await admin.getByLabel('Usuário',{exact:true}).fill('browser-admin');
    await admin.getByLabel('Senha',{exact:true}).fill('browser-admin-password');
    await admin.getByRole('button',{name:'Entrar',exact:true}).click();
    await admin.getByText(/^Atualizado às/).waitFor();
    assert.equal(await admin.locator('#questions-panel').isVisible(),true);
    assert.ok(await admin.locator('#questions').getByText(/Resposta sintética/).count()>0);
    const roomsOption=admin.getByRole('button',{name:'Salas abertas',exact:true});
    await roomsOption.focus(); await roomsOption.press('Enter');
    const room=admin.locator('.admin-room').filter({hasText:roomName});
    await room.getByRole('heading',{name:roomName,exact:true}).waitFor();
    assert.equal(await admin.locator('#questions-panel').isVisible(),false);
    assert.equal(await roomsOption.getAttribute('aria-pressed'),'true');
    const link=room.getByRole('link',{name:`Abrir sala ${roomName}`,exact:true});
    assert.equal(await link.getAttribute('href'),roomURL);
    assert.equal(await link.getAttribute('target'),'_blank');
    assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
    assert.equal(await link.textContent(),roomURL);
    await room.locator('li').filter({hasText:hostName}).getByText('Anfitrião',{exact:true}).waitFor();
    await room.locator('li').filter({hasText:guestName}).getByText('Conectado',{exact:true}).waitFor();
    assert.equal(await room.locator('li').count(),2);
    assert.equal(await room.locator('b,img').count(),0);
    await admin.screenshot({path:'artifacts/godmode-opcoes-salas-desktop.png'});
    for(const width of [320,390,768,1024]) {
      await admin.setViewportSize({width,height:844});
      assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await admin.setViewportSize({width:390,height:844});
    await admin.screenshot({path:'artifacts/godmode-opcoes-salas-mobile.png',fullPage:true});
    await host.getByRole('button',{name:'Sair da sala',exact:true}).click();
    await host.getByText('Você saiu da sala.',{exact:true}).waitFor();
    await admin.getByRole('button',{name:'Atualizar',exact:true}).click();
    await room.locator('li').filter({hasText:guestName}).getByText('Anfitrião',{exact:true}).waitFor();
    assert.equal(await room.locator('li').count(),1);
    assert.equal(await room.getByText(hostName,{exact:true}).count(),0);
    await admin.getByRole('button',{name:'Sabe Essa?',exact:true}).click();
    assert.equal(await admin.locator('#questions-panel').isVisible(),true);
    assert.equal(await admin.locator('#rooms-panel').isVisible(),false);
    await guest.getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await guest.getByRole('dialog').getByRole('button',{name:'Encerrar sala',exact:true}).click();
    await guest.getByText('Até a próxima.',{exact:true}).waitFor();
  } finally { await Promise.all(contexts.map(context=>context.close())); }
});

test('partida sintética em navegador: resposta, cooldown, reconexão e revelação',async()=>{
  const answers=JSON.parse(await readFile(join(temp,'answers.json'),'utf8'));
  const a=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  const b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const host=await a.newPage(), guest=await b.newPage();
  for(const p of [host,guest]) p.on('pageerror', error=>errors.push(error.message));
  await host.goto(fixtureOrigin);
  await createRoom(host,'Host sintético');
  await guest.goto(host.url());
  await guest.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('Convidado sintético');
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
  await host.waitForFunction(()=>document.querySelector('#answer-feedback')?.textContent==='');
  const hostRow=host.locator('.scoreboard li').filter({hasText:'Host sintético'});
  await hostRow.locator('small').getByText('errado',{exact:true}).waitFor();
  const guestHostRow=guest.locator('.scoreboard li').filter({hasText:'Host sintético'});
  await guestHostRow.locator('small').getByText('errado',{exact:true}).waitFor();
  assert.equal(await host.getByText('Ainda não. Aguarde 0,5 segundo e tente outra vez.',{exact:true}).count(),0);
  await new Promise(r=>setTimeout(r,550));
  await host.getByLabel('Sua resposta').fill(answer);
  await host.getByRole('button',{name:'Responder',exact:true}).click();
  await host.getByText('Você acertou! Aguarde os demais.').waitFor();
  await hostRow.locator('small').getByText('errado',{exact:true}).waitFor();
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
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror', error=>errors.push(error.message));
  page.on('console', msg=>{if(msg.type()==='error'&&msg.text().includes('Content Security Policy')) errors.push(msg.text());});
  await page.goto(origin);
  assert.equal(await page.title(),'Fun');
  assert.equal(await page.locator('#credits-open').count(),0);
  assert.match(await page.locator('link[rel=icon]').getAttribute('href'),/^\/brand\/fun-favicon\.png\?v=/);
  assert.deepEqual(await page.locator('link[rel=icon]').evaluate(async link=>{
    const response=await fetch(link.href);
    return {type:response.headers.get('content-type'),signature:Array.from(new Uint8Array(await response.arrayBuffer()).slice(0,8))};
  }),{type:'image/png',signature:[137,80,78,71,13,10,26,10]});
  assert.ok(await page.locator('.brand img').evaluateAll(images=>images.length===2&&images.every(img=>img.complete&&img.naturalWidth>0)));
  await page.screenshot({path:'artifacts/portal-desktop.png',fullPage:true});
  assert.equal(await page.locator('#sidebar #game-nav, #sidebar .nav-heading').count(),0);
  assert.equal(new URL(page.url()).pathname,'/');
  await createRoom(page,'Ana');
  const roomURL=page.url();
  await page.getByText('Ao vivo',{exact:true}).waitFor();
  await page.getByText('O catálogo ainda está sendo preparado.').waitFor();
  await page.screenshot({path:'artifacts/lobby-desktop.png',fullPage:true});
  await page.reload();
  await page.getByText('Ana (você)').waitFor();
  const tab=await context.newPage();
  await tab.goto(roomURL);
  await tab.getByText('Ana (você)').waitFor();
  const other=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const mobile=await other.newPage();
  mobile.on('pageerror', error=>errors.push(error.message));
  await mobile.goto(roomURL);
  await mobile.getByRole('textbox',{name:'Como podemos chamar você?',exact:true}).fill('<b>Bia</b>');
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

test('navegação compacta, tema persistido e menu móvel por teclado',async()=>{
  const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto(origin);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:'artifacts/minimal-portal-desktop.png',fullPage:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:'artifacts/home-layout-desktop.png',fullPage:true});
  await page.setViewportSize({width:1366,height:768});
  await page.getByRole('button',{name:'Recolher navegação'}).click();
  assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#sidebar-toggle').isVisible(),false);
  await page.locator('#sidebar').click({position:{x:34,y:500}});
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-collapsed')),false);
  await page.getByRole('button',{name:'Recolher navegação'}).click();
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await page.getByLabel('Nome da sala',{exact:true}).waitFor();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('sidebar-collapsed')),false);
  assert.equal(await page.locator('#portal-nav').getAttribute('aria-current'),'page');
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await page.getByRole('heading',{name:'Vamos jogar?'}).waitFor();
  await page.getByRole('button',{name:'Recolher navegação'}).click();
  await page.getByRole('button',{name:'Alternar tema'}).click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.screenshot({path:'artifacts/minimal-portal-light.png',fullPage:true});
  await page.getByRole('button',{name:'Alternar tema'}).click();
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await page.screenshot({path:'artifacts/minimal-home-desktop.png',fullPage:true});
  for (const width of [320,390,768,1024]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/minimal-home-mobile.png',fullPage:true});
  const menu=page.getByRole('button',{name:'Abrir navegação',exact:true});
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
  await page.getByRole('button',{name:'Alternar tema'}).focus();
  await page.keyboard.press('Tab');
  assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#theme').evaluate(el=>el===document.activeElement),true);
  await page.screenshot({path:'artifacts/minimal-sidebar-mobile.png',fullPage:true});
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
  assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  await menu.click();
  await page.getByRole('button',{name:'Início',exact:true}).click();
  await page.getByRole('heading',{name:'Vamos jogar?'}).waitFor();
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await page.screenshot({path:'artifacts/minimal-portal-mobile.png',fullPage:true});
  await menu.click();
  await page.locator('#menu-backdrop').click({position:{x:380,y:300}});
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await menu.click();
  await page.setViewportSize({width:1366,height:768});
  await page.waitForFunction(()=>!document.querySelector('main').inert);
  assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
  assert.deepEqual(errors,[]);
  await context.close();
});

test('página principal: criar pública, listar, entrar por código e preservar sala privada',async()=>{
  const hostContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const guestContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const host=await hostContext.newPage(), guest=await guestContext.newPage();
  for(const page of [host,guest]) page.on('pageerror',error=>errors.push(error.message));
  await host.goto(origin);
  await host.getByLabel('Nome da sala',{exact:true}).fill('Turma <b>da noite</b>');
  await host.getByRole('radio',{name:'Público',exact:true}).check();
  await host.getByRole('radio',{name:'Público',exact:true}).focus();
  await host.keyboard.press('ArrowRight');
  assert.equal(await host.getByRole('radio',{name:'Privado',exact:true}).isChecked(),true);
  await host.keyboard.press('ArrowLeft');
  assert.equal(await host.getByRole('radio',{name:'Público',exact:true}).isChecked(),true);
  await host.getByRole('button',{name:'Jogar',exact:true}).click();
  await host.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await host.getByLabel('Nome da sala',{exact:true}).inputValue(),'Turma <b>da noite</b>');
  assert.equal(await host.getByRole('radio',{name:'Público',exact:true}).isChecked(),true);
  await createRoom(host,'Anfitriã','Turma <b>da noite</b>','public');
  await host.getByRole('heading',{name:'Turma <b>da noite</b>',exact:true}).waitFor();
  await guest.goto(origin);
  const publicRoom=guest.locator('.directory-list li').filter({hasText:'Turma <b>da noite</b>'});
  await publicRoom.waitFor();
  assert.equal(await publicRoom.locator('b').count(),0);
  await guest.screenshot({path:'artifacts/home-public-mobile.png',fullPage:true});
  const privateContext=await browser.newContext({reducedMotion:'reduce'});
  const privateHost=await privateContext.newPage();
  await privateHost.goto(origin);
  await createRoom(privateHost,'Caio','Sala só por convite');
  await guest.getByRole('button',{name:'Atualizar salas públicas'}).click();
  assert.equal(await guest.locator('.directory-list').getByText('Sala só por convite',{exact:true}).count(),0);
  await publicRoom.getByRole('button',{name:/Entrar na sala/}).click();
  await guest.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('Convidada');
  await guest.getByRole('dialog').getByRole('button',{name:'Entrar',exact:true}).click();
  await guest.waitForURL(host.url());
  await guest.getByText('Convidada (você)',{exact:true}).waitFor();
  await guest.reload();
  await guest.getByRole('heading',{name:'Turma <b>da noite</b>',exact:true}).waitFor();
  // Outra pessoa entra na sala privada pelo código na própria página principal.
  const invitedContext=await browser.newContext({viewport:{width:320,height:720},reducedMotion:'reduce'});
  const invited=await invitedContext.newPage();
  await invited.goto(origin);
  await invited.getByLabel('Código da sala',{exact:true}).fill(new URL(privateHost.url()).pathname.slice(1).toLowerCase());
  await invited.getByRole('button',{name:'Entrar',exact:true}).click();
  await invited.getByRole('dialog').getByLabel('Seu nome',{exact:true}).fill('Dani');
  await invited.getByRole('dialog').getByRole('button',{name:'Entrar',exact:true}).click();
  await invited.waitForURL(privateHost.url());
  await invited.getByText('Dani (você)',{exact:true}).waitFor();
  assert.equal(await invited.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  await invitedContext.close(); await privateContext.close(); await guestContext.close(); await hostContext.close();
});
