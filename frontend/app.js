const main = document.querySelector('main');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#close-dialog');
const identityDialog = document.querySelector('#identity-dialog');
let roomIntent = null;
let directoryRequest = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mediaCredits(challenge) {
  const credits=challenge?.credits;
  if(!credits) return '';
  const link=(url,label)=>/^https:\/\/[^\s<>"\u0000-\u001f]+$/.test(url||'') ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);
  return `<details class="media-credits"><summary>Fontes e créditos</summary><p>${esc(credits.attribution)}</p><p>${link(credits.media_source_url,'Arquivo original')} · ${link(credits.license_url,credits.license)} · ${link(credits.source_url,'Referência')}</p></details>`;
}
const codeFromPath = () => /^\/[A-Z]{4}$/.test(location.pathname) ? location.pathname.slice(1) : null;
let code = codeFromPath(), state = null, ws = null, online = false, stopped = false;
let reconnect = 0, ping = null, serverAt = 0, receivedAt = 0, feedback = '';
const pending = new Map();
const API_VERSION = 2;
const versionMessage = ['localhost','127.0.0.1'].includes(location.hostname)
  ? 'O Fun foi atualizado. Reinicie o servidor local e atualize esta página para continuar.'
  : 'O Fun foi atualizado. Atualize esta página e tente novamente.';
class ApiError extends Error {}
const userError = (error, fallback) => error instanceof ApiError ? error.message : fallback;
async function requestJSON(url, options = {}) {
  const response = await fetch(url, {...options, signal:AbortSignal.timeout(10000)});
  let result;
  try { result = await response.json(); }
  catch { throw new ApiError(response.status===404 || response.status===405 ? versionMessage : 'O Fun não conseguiu concluir o pedido. Tente novamente.'); }
  if (!response.ok) throw new ApiError(result.error || 'Não foi possível concluir o pedido. Tente novamente.');
  return result;
}
async function requireCurrentAPI() {
  const health = await requestJSON('/health', {cache:'no-store'});
  if (health.api_version!==API_VERSION) throw new ApiError(versionMessage);
}
function sessionFor(roomCode) {
  try {
    const identity=JSON.parse(stored(`fun:${roomCode}`));
    return identity?.code===roomCode && typeof identity.token==='string' && typeof identity.participant==='string' ? identity : null;
  } catch { return null; }
}
function requireStorage() {
  try { localStorage.setItem('fun:storage-check','1'); localStorage.removeItem('fun:storage-check'); }
  catch { throw new ApiError('Permita o armazenamento neste navegador para criar ou entrar em uma sala.'); }
}
const gameIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 2M12 16h.01"/></svg>';
const mobileLayout = matchMedia('(max-width: 760px)');
function activeNav(id) {
  for (const button of document.querySelectorAll('.sidebar-body button')) {
    if (button.id === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
function menu(open, restoreFocus = false) {
  document.querySelector('#sidebar').classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  document.querySelector('#menu-backdrop').hidden = !open;
  document.querySelector('#menu').setAttribute('aria-expanded', String(open));
  main.inert = open;
  if (restoreFocus) document.querySelector('#menu').focus();
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('#theme-label').textContent = theme === 'light' ? 'claro' : 'escuro';
}
function stored(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    return true;
  } catch { toast('Habilite o armazenamento do navegador para retomar sua sessão após F5.'); return null; }
}
function toast(message) { notice.textContent = message; }
const session = () => sessionFor(code);
function status() { return `<span class="connection ${online ? 'connected' : ''}">${online ? 'Ao vivo' : 'Reconectando…'}</span>`; }
function portal(gameSelected = false) {
  activeNav(gameSelected ? 'game-nav' : 'portal-nav');
  main.innerHTML = `<section class="portal workspace"><header class="portal-heading"><h1>${gameSelected ? 'Sabe Essa?' : 'Vamos jogar?'}</h1><p>Escolha um jogo e junte a turma.</p></header><div class="portal-panels"><section class="portal-panel create-panel" aria-labelledby="create-title"><h2 id="create-title">Criar uma nova sala</h2><form id="create-room-form"><label class="game-tile"><input type="radio" name="game" value="sabe-essa" checked><span class="game-icon">${gameIcon}</span><strong>Sabe Essa?</strong><span class="game-tagline">Reconheça.<br>Responda.<br>Surpreenda.</span><span class="selected-game">Selecionado <span aria-hidden="true">✓</span></span></label><div class="create-controls"><div class="room-name-field"><label class="sr-only" for="room-name">Nome da sala</label><input id="room-name" name="room_name" maxlength="48" autocomplete="off" placeholder="Nome da sala"></div><fieldset class="visibility"><legend class="sr-only">Visibilidade da sala</legend><label><input type="radio" name="visibility" value="public"><span>Público</span></label><label><input type="radio" name="visibility" value="private" checked><span>Privado</span></label></fieldset><button type="submit">Jogar<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div><p class="panel-note"></p></form></section><section class="portal-panel join-panel" aria-labelledby="join-title"><h2 id="join-title">Entrar em sala privada</h2><p>Já tem um convite?</p><form id="join-code-form"><label for="join-code">Código da sala</label><div class="code-entry"><input id="join-code" name="code" maxlength="4" minlength="4" pattern="[A-Za-z]{4}" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" aria-describedby="join-help" required><button type="submit">Entrar</button></div><p id="join-help" class="panel-note">Use as quatro letras do código.</p></form></section></div><section class="public-rooms" aria-labelledby="public-title"><header><div><h2 id="public-title">Salas públicas</h2><p>Encontre uma turma para jogar.</p></div><button id="refresh-rooms" class="quiet" aria-label="Atualizar salas públicas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/></svg><span>Atualizar</span></button></header><div id="public-room-list" aria-live="polite"><p class="directory-message" role="status">Buscando salas…</p></div></section></section>`;
  loadPublicRooms();
}
function home(joinCode = '') {
  if (!joinCode) { portal(true); return; }
  activeNav('game-nav');
  main.innerHTML = `<section class="welcome game-home"><span class="eyebrow">${joinCode ? `Sala ${esc(joinCode)}` : 'Fun / Jogos'}</span><h1>Sabe Essa?</h1><p>15 desafios. 20 segundos para cada resposta.</p><form id="room-form"><label for="name">Como podemos chamar você?</label><input id="name" name="name" maxlength="24" autocomplete="nickname" required placeholder="Seu nome"><div class="join-fields"><label for="code">Código da sala${joinCode ? '' : ' <span class="optional">· para entrar</span>'}</label><input id="code" name="code" maxlength="4" pattern="[A-Za-z]{4}" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-describedby="code-help" placeholder="ABCD" value="${esc(joinCode)}" ${joinCode ? 'required' : ''}></div><p id="code-help" class="fine">${joinCode ? 'Você vai entrar nesta sala.' : 'Para criar uma sala, basta preencher seu nome.'}</p><div class="actions">${joinCode ? '' : '<button type="submit" name="mode" value="create">Criar sala</button>'}<button type="submit" name="mode" value="join" class="secondary">Entrar na sala</button></div></form><p class="fine">Mínimo de 2 competidores, até 16 pessoas na sala.<br>Chegou durante a partida? Acompanhe como espectador.</p></section>`;
}
async function loadPublicRooms() {
  const list = document.querySelector('#public-room-list');
  if (!list) return;
  const request = ++directoryRequest;
  const refresh = document.querySelector('#refresh-rooms');
  refresh.disabled = true;
  try {
    await requireCurrentAPI();
    const result = await requestJSON('/api/rooms', {cache:'no-store'});
    if (!Array.isArray(result.rooms)) throw new ApiError(versionMessage);
    if (request !== directoryRequest || !list.isConnected || identityDialog.open) return;
    list.innerHTML = result.rooms.length ? `<ul class="directory-list">${result.rooms.map(room => `<li><span class="directory-icon">${gameIcon}</span><div><strong>${esc(room.room_name)}</strong><span>Sabe Essa? · ${['question','reveal'].includes(room.phase) ? 'Em partida · entre para acompanhar' : room.phase==='results' ? 'Nos resultados' : 'No lobby'}</span></div><span class="room-count">${room.people}/16</span><button class="secondary" data-join-code="${esc(room.code)}" aria-label="Entrar na sala ${esc(room.room_name)}" ${room.people>=16 ? 'disabled' : ''}>${room.people>=16 ? 'Lotada' : 'Entrar'}</button></li>`).join('')}</ul>` : '<p class="directory-message">Nenhuma sala pública por aqui ainda.<br>Crie uma e convide a turma.</p>';
  } catch (error) {
    const message = userError(error,'Não foi possível carregar as salas. Verifique sua conexão e tente atualizar.');
    if (request === directoryRequest && list.isConnected) list.innerHTML = `<p class="directory-message" role="status">${esc(message)}</p>`;
  } finally { if (request === directoryRequest) refresh.disabled = false; }
}
setInterval(() => {
  const list=document.querySelector('#public-room-list');
  if (!document.hidden && !identityDialog.open && !list?.contains(document.activeElement)) loadPublicRooms();
}, 15000);
function requestIdentity(intent) {
  if (intent.mode==='join' && sessionFor(intent.code)) { location.assign(`/${intent.code}`); return; }
  roomIntent = intent;
  document.querySelector('#identity-description').textContent = intent.mode==='create' ? `Criar ${intent.room_name || 'uma sala de Sabe Essa?'} · ${intent.visibility==='public' ? 'Pública' : 'Privada'}` : `Entrar na sala ${intent.code}`;
  document.querySelector('#identity-submit').textContent = intent.mode==='create' ? 'Jogar' : 'Entrar';
  document.querySelector('#identity-error').textContent = '';
  document.querySelector('#player-name').value = stored('fun:player-name') || '';
  identityDialog.showModal();
  document.querySelector('#player-name').focus();
}
async function enterRoom(intent, name, button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  if (identityDialog.open) document.querySelector('#identity-cancel').disabled = true;
  try {
    if (!name) throw new ApiError('Digite seu nome para continuar.');
    requireStorage();
    await requireCurrentAPI();
    const body = intent.mode==='create' ? {name,room_name:intent.room_name,visibility:intent.visibility} : {name};
    const result = await requestJSON(intent.mode==='create'?'/api/rooms':`/api/rooms/${intent.code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    code = result.code;
    if (!stored(`fun:${code}`,JSON.stringify(result))) throw new ApiError('Não foi possível salvar sua sessão. Libere espaço no armazenamento do navegador.');
    stored('fun:player-name',name);
    location.assign(`/${code}`);
  } catch (error) {
    const message = userError(error,'Não foi possível entrar. Verifique sua conexão e tente novamente.');
    if (identityDialog.open) document.querySelector('#identity-error').textContent = message; else toast(message);
  } finally {
    button.disabled = false;
    document.querySelector('#identity-cancel').disabled = false;
  }
}
function render() {
  if (!state) return;
  activeNav('game-nav');
  const focus = document.activeElement?.id;
  const previousAnswer = document.querySelector('#answer')?.value || '';
  const selection = document.querySelector('#answer')?.selectionStart;
  const me = state.people.find(p => p.id === state.you);
  if (!me?.active || state.phase === 'closed') {
    stopped = true;
    stored(`fun:${code}`, null);
    main.innerHTML = `<section class="welcome"><span class="eyebrow">SALA ${esc(code)}</span><h1>${state.phase === 'closed' ? 'Até a próxima.' : 'Você saiu da sala.'}</h1><p>A sessão foi encerrada.</p><a class="button" href="/">Voltar ao início</a></section>`;
    return;
  }
  const host = state.host === state.you;
  const canStart = online && state.catalog_available && state.people.filter(p=>p.active&&p.online).length>=2;
  const playing = ['question','reveal'].includes(state.phase);
  const title = state.phase === 'lobby' ? esc(state.room_name || 'A turma está chegando.') : state.phase === 'results' ? 'Essa foi boa.' : `Desafio ${state.number}<span class="muted"> / 15</span>`;
  const challenge = state.challenge;
  let center = '';
  if (state.phase === 'lobby') {
    center = `<div class="lobby-symbol">${gameIcon}</div><h2>Todo mundo pronto?</h2><p>Compartilhe o código <strong>${esc(code)}</strong> ou o endereço desta sala.</p>${!state.catalog_available ? '<div class="empty-catalog"><strong>O catálogo ainda está sendo preparado.</strong><p>Não há desafios suficientes para esta composição e o histórico da sala. A partida fica disponível após a publicação de conteúdo.</p></div>' : '<p>Imagens e textos intercalados. Sem dicas. Vale tentar até acertar.</p>'}${host ? `<button data-action="start" ${!canStart ? 'disabled' : ''}>Iniciar partida</button><p class="fine">É preciso ter pelo menos dois competidores conectados.</p>` : '<p class="fine">O anfitrião inicia a partida.</p>'}`;
  } else if (playing) {
    center = `<div class="round-heading"><span>${me.spectator ? 'Você está acompanhando' : 'Mostre que sabe'}</span><strong id="timer" aria-label="Tempo restante">20s</strong></div><div class="timer-track"><div id="timer-progress"></div></div><h2 class="prompt">${esc(challenge.prompt)}</h2>${challenge.image ? `<img class="challenge-image" src="${esc(challenge.image)}" alt="Imagem do desafio: ${esc(challenge.prompt)}">` : ''}${state.phase === 'reveal' ? `<div class="reveal"><span>A resposta é</span><strong>${esc(challenge.answer)}</strong></div><p class="fine">${state.number===15 ? 'Resultado a seguir.' : 'Próximo desafio em instantes.'}</p>` : me.spectator ? '<p>Você poderá competir na próxima partida.</p>' : me.answered ? '<div class="correct">Você acertou! Aguarde os demais.</div>' : `<form id="answer-form"><label for="answer">Sua resposta</label><div class="answer-row"><input id="answer" maxlength="200" autocomplete="off" required placeholder="Essa eu sei…" value="${esc(previousAnswer)}" ${!online ? 'disabled' : ''}><button ${!online ? 'disabled' : ''}>Responder</button></div></form><p id="answer-feedback" role="status">${esc(feedback)}</p>`}`;
    if(state.phase==='reveal') center+=mediaCredits(challenge);
  } else {
    const winner = state.people.find(p=>p.id===state.winner);
    center = `<div class="lobby-symbol">${gameIcon}</div><h2>${state.result==='cancelled' ? 'Partida cancelada, sem vencedor.' : state.result==='automatic' ? `${esc(winner?.name)} venceu por permanência.` : '15 desafios. Muitas descobertas.'}</h2><p>Confira os pontos da partida na mesma lista ao lado.</p>${host ? `<div class="actions"><button data-action="start" ${!canStart ? 'disabled' : ''}>Iniciar nova partida</button><button data-action="lobby" class="secondary">Retornar todos ao lobby</button></div>${!state.catalog_available ? '<p class="empty-catalog">Catálogo insuficiente para outra partida sem repetir as três anteriores.</p>' : ''}` : '<p>O anfitrião decide quando voltar ao lobby ou começar outra partida.</p>'}`;
  }
  main.innerHTML = `<section class="room"><header class="room-header"><div><span class="eyebrow">SABE ESSA? · SALA ${esc(code)} · ${state.visibility==='public' ? 'Pública' : 'Privada'}</span><h1>${title}</h1></div>${status()}</header>${state.warning ? '<div class="presence" role="alert"><p>A sala ficou inativa. Confirme sua presença em até 2 minutos para mantê-la aberta.</p><button data-action="presence">Estou aqui</button></div>' : ''}<div class="room-grid"><section class="play-area" aria-label="Partida">${center}</section><section class="scoreboard" aria-label="Participantes e pontuação"><div class="board-title"><h2>${state.phase==='lobby' ? 'Na sala' : 'Pontuação'}</h2><span>${state.people.filter(p=>p.active).length}/16</span></div><ol>${state.people.map(p=>`<li class="${!p.active ? 'departed' : ''}"><span class="rank">${p.rank ?? '—'}</span><div><strong>${esc(p.name)}${p.id===state.you ? ' (você)' : ''}</strong><small>${p.host ? 'Anfitrião · ' : ''}${!p.active ? 'Saiu da partida' : !p.online ? 'Reconectando' : p.spectator ? 'Espectador' : playing&&p.answered ? 'Acertou' : 'Na sala'}</small></div><span class="score">${p.score}</span>${host&&p.active&&p.id!==state.you ? `<button class="kick quiet" data-action="kick" data-target="${esc(p.id)}" aria-label="Expulsar ${esc(p.name)}">×</button>` : ''}</li>`).join('')}</ol></section></div><footer class="room-footer"><button class="quiet" data-action="leave">Sair da sala</button>${host ? '<button class="quiet danger-text" id="close-room">Encerrar sala</button>' : ''}</footer></section>`;
  if (focus && document.getElementById(focus)) {
    const input = document.getElementById(focus);
    input.focus({preventScroll:true});
    if (selection !== null && input.setSelectionRange) input.setSelectionRange(selection, selection);
  }
  updateTimer();
}
function updateTimer() {
  const timer = document.querySelector('#timer');
  if (!timer || !state) return;
  const now = serverAt + (performance.now()-receivedAt)/1000;
  const left = state.phase==='question' ? Math.max(0,state.deadline-now) : 0;
  timer.textContent = state.phase==='reveal' ? 'Resposta' : `${Math.ceil(left)}s`;
  const progress = document.querySelector('#timer-progress');
  if (progress) progress.style.width = `${left/20*100}%`;
}
setInterval(updateTimer, 100);
function send(action, extras={}) {
  if (!online || ws?.readyState!==WebSocket.OPEN) { toast('Aguarde a reconexão para continuar.'); return; }
  const event = {id:crypto.randomUUID(), action, ...extras};
  pending.set(event.id,event);
  ws.send(JSON.stringify(event));
}
function connect() {
  const identity = session();
  if (!identity || stopped) return;
  clearTimeout(reconnect);
  ws = new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws/${code}`);
  ws.onopen = () => { ws.send(JSON.stringify({token:identity.token})); };
  ws.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    if (msg.type==='state') {
      const wasOnline=online;
      if(state?.round_id!==msg.round_id) {
        feedback='';
        const input=document.querySelector('#answer');
        if(input) input.value='';
      }
      state=msg; online=true; serverAt=msg.server_now; receivedAt=performance.now();
      if (!wasOnline) {
        for(const event of pending.values()) ws.send(JSON.stringify(event));
        clearInterval(ping); ping=setInterval(()=>{ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'ping'})); },10000);
      }
      render();
    } else if (msg.type==='ack') {
      const event=pending.get(msg.id); pending.delete(msg.id);
      if (!msg.ok) toast(msg.error);
      else if(event?.action==='answer') {
        feedback=msg.correct ? `Acertou! +${msg.points} pontos.` : 'Ainda não. Aguarde 0,5 segundo e tente outra vez.';
        const input=document.querySelector('#answer'); if(input && input.value===event.answer) input.value='';
        const el=document.querySelector('#answer-feedback'); if(el) el.textContent=feedback;
      }
    }
  };
  ws.onclose = event => {
    online=false; clearInterval(ping);
    if (event.code===1008) {
      stopped=true; pending.clear();
      toast('Conexão recusada. Feche abas extras ou tente retomar sua sessão.');
      main.innerHTML='<section class="welcome"><h1>Vamos reconectar?</h1><p>A sessão pode ter expirado ou atingido o limite de conexões.</p><div class="actions"><button id="retry-session">Retomar sessão</button><button id="new-session" class="secondary">Entrar novamente</button></div></section>';
      return;
    }
    if(!stopped) { if(state) render(); reconnect=setTimeout(connect,1500); }
  };
  ws.onerror = () => toast('Conexão interrompida. Tentando retomar sua sessão.');
}
document.addEventListener('submit', async event => {
  if(event.target.id==='answer-form') {
    event.preventDefault();
    send('answer',{answer:document.querySelector('#answer').value, round_id:state.round_id}); return;
  }
  if(event.target.id==='create-room-form') {
    event.preventDefault();
    const form=event.target;
    requestIdentity({mode:'create',room_name:form.elements.room_name.value.trim(),visibility:form.elements.visibility.value});
    return;
  }
  if(event.target.id==='join-code-form') {
    event.preventDefault();
    requestIdentity({mode:'join',code:event.target.elements.code.value.trim().toUpperCase()});
    return;
  }
  if(event.target.id==='identity-form') {
    event.preventDefault();
    if(roomIntent && !document.querySelector('#identity-submit').disabled) await enterRoom(roomIntent,event.target.elements.name.value.trim(),document.querySelector('#identity-submit'));
    return;
  }
  if(event.target.id!=='room-form') return;
  event.preventDefault();
  const form=event.target, mode=event.submitter?.value || 'join';
  const name=form.elements.name.value.trim(), inputCode=form.elements.code.value.trim().toUpperCase();
  if(mode==='join'&&!/^[A-Z]{4}$/.test(inputCode)) { toast('Digite as quatro letras da sala.'); return; }
  await enterRoom({mode,code:inputCode},name,event.submitter || form.querySelector('button[type="submit"]'));
});
document.addEventListener('click', event => {
  const button=event.target.closest('button'); if(!button) return;
  if(['game-nav','portal-nav'].includes(button.id)) {
    if(code) { location.assign('/'); return; }
    menu(false);
    if(button.id==='portal-nav') portal(); else home();
    main.focus({preventScroll:true});
    toast('');
  }
  if(button.id==='menu') menu(button.getAttribute('aria-expanded')!=='true');
  if(button.id==='menu-backdrop') menu(false,true);
  if(button.id==='sidebar-toggle') {
    const collapsed=document.body.classList.toggle('sidebar-collapsed');
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-label',collapsed?'Expandir navegação':'Recolher navegação');
    button.title=button.getAttribute('aria-label');
  }
  if(button.id==='theme') { const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'; applyTheme(theme); stored('fun:theme',theme); }
  if(button.id==='close-room') dialog.showModal();
  if(button.id==='refresh-rooms') loadPublicRooms();
  if(button.id==='identity-cancel') identityDialog.close();
  if(button.dataset.joinCode) requestIdentity({mode:'join',code:button.dataset.joinCode});
  if(button.id==='retry-session') { stopped=false; connect(); }
  if(button.id==='new-session') { stored(`fun:${code}`,null); state=null; home(code); }
  if(button.dataset.action) send(button.dataset.action,button.dataset.target?{target:button.dataset.target}:{});
});
dialog.addEventListener('close',()=>{ if(dialog.returnValue==='close') send('close'); });
identityDialog.addEventListener('close',()=>{ roomIntent=null; });
identityDialog.addEventListener('cancel',event=>{ if(document.querySelector('#identity-submit').disabled) event.preventDefault(); });
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (event.key==='Escape') { event.preventDefault(); menu(false,true); }
  if (event.key==='Tab') {
    const controls=[document.querySelector('#menu'),...document.querySelectorAll('#sidebar .sidebar-body button, #theme')];
    const first=controls[0], last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first) { event.preventDefault(); last.focus(); }
    else if(!event.shiftKey&&document.activeElement===last) { event.preventDefault(); first.focus(); }
  }
});
mobileLayout.addEventListener('change', () => menu(false));
const theme=stored('fun:theme');
applyTheme(theme==='light'?'light':'dark');
if(code) {
  if(session()) { main.innerHTML='<section class="welcome"><p role="status">Retomando sua sala…</p></section>'; connect(); }
  else home(code);
} else if(location.pathname==='/') portal();
else main.innerHTML='<section class="welcome"><h1>Página não encontrada.</h1><a href="/">Voltar ao início</a></section>';
