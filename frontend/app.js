const main = document.querySelector('main');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#close-dialog');
const identityDialog = document.querySelector('#identity-dialog');
const profileDialog = document.querySelector('#profile-dialog');
const renameDialog = document.querySelector('#rename-room-dialog');
const kickDialog = document.querySelector('#kick-dialog');
let kickTarget = null;
let roomIntent = null;
let directoryRequest = 0;
let playerName = '', profileEventId = null;
let enteringRoom = false;
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
function requireStorage(message = 'Permita o armazenamento neste navegador para criar ou entrar em uma sala.') {
  try { localStorage.setItem('fun:storage-check','1'); localStorage.removeItem('fun:storage-check'); }
  catch { throw new ApiError(message); }
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
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  const button=document.querySelector('#sidebar-toggle');
  button.setAttribute('aria-expanded',String(!collapsed));
  button.setAttribute('aria-label',collapsed?'Expandir navegação':'Recolher navegação');
  button.title=button.getAttribute('aria-label');
}
document.querySelector('#sidebar').addEventListener('click',()=>{
  if(document.body.classList.contains('sidebar-collapsed')) setSidebarCollapsed(false);
});
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
function knownPlayerName() {
  const name = playerName.trim();
  return name && [...name].length <= 24 && !/[\u0000-\u001f\u007f]/.test(name) ? name : '';
}
function syncJoinIdentity() {
  const field = document.querySelector('#join-name-field');
  if (!field) return;
  const name = knownPlayerName();
  field.hidden = Boolean(name);
  field.querySelector('input').disabled = Boolean(name);
  const identity = document.querySelector('#known-identity');
  identity.hidden = !name;
  identity.querySelector('strong').textContent = name;
}
function setPlayerName(name, persist = true) {
  const previous = playerName;
  playerName = name;
  document.querySelector('#profile-name-label').textContent = name || 'Adicione seu nickname';
  document.querySelector('#profile-open').title = name ? `${name} · Alterar nome` : 'Alterar nome do usuário';
  const input = document.querySelector('#name');
  if (input && (!input.value || input.value === previous)) input.value = name;
  syncJoinIdentity();
  if (persist) stored('fun:player-name', name);
}
function profileBusy(busy) {
  for (const id of ['profile-name', 'profile-submit', 'profile-cancel']) document.getElementById(id).disabled = busy;
  document.querySelector('#profile-submit').textContent = busy ? 'Salvando…' : 'Salvar nome';
  document.querySelector('#profile-form').setAttribute('aria-busy', String(busy));
}
function finishProfileSave(error = '') {
  profileEventId = null;
  profileBusy(false);
  document.querySelector('#profile-error').textContent = error;
  if (!error) { profileDialog.close(); toast('Nome atualizado.'); }
}
function openProfile() {
  if (mobileLayout.matches) menu(false);
  document.querySelector('#profile-error').textContent = '';
  document.querySelector('#profile-name').value = playerName;
  profileDialog.showModal();
  document.querySelector('#profile-name').focus();
  document.querySelector('#profile-name').select();
}
function saveProfile(name) {
  if (profileEventId) return;
  try {
    if (!name) throw new ApiError('Digite seu nome para continuar.');
    if ([...name].length > 24 || /[\u0000-\u001f\u007f]/.test(name)) throw new ApiError('Use um nome de 1 a 24 caracteres.');
    requireStorage('Permita o armazenamento neste navegador para salvar seu nome.');
    if (code && session() && !stopped) {
      if (!online || !state?.people.some(p => p.id === state.you && p.active)) throw new ApiError('Aguarde a reconexão para alterar seu nome na sala.');
      profileEventId = send('rename_player', {name});
      if (profileEventId) { document.querySelector('#profile-error').textContent = ''; profileBusy(true); }
    } else {
      if (!stored('fun:player-name', name)) throw new ApiError('Não foi possível salvar seu nome. Libere espaço no armazenamento do navegador.');
      setPlayerName(name, false);
      finishProfileSave();
    }
  } catch (error) {
    document.querySelector('#profile-error').textContent = userError(error, 'Não foi possível salvar seu nome. Tente novamente.');
  }
}
const session = () => sessionFor(code);
function status() { return `<span class="connection ${online ? 'connected' : ''}">${online ? 'Ao vivo' : 'Reconectando…'}</span>`; }
function portal() {
  activeNav('portal-nav');
  main.innerHTML = `<section class="portal workspace"><header class="portal-heading"><h1>Vamos jogar?</h1><p>Escolha um jogo e junte a turma.</p></header><div class="portal-panels"><section class="portal-panel create-panel" aria-labelledby="create-title"><h2 id="create-title">Criar uma nova sala</h2><form id="create-room-form"><label class="game-tile"><input type="radio" name="game" value="sabe-essa" checked><span class="game-icon">${gameIcon}</span><strong>Sabe Essa?</strong><span class="game-tagline">Reconheça.<br>Responda.<br>Surpreenda.</span><span class="selected-game">Selecionado <span aria-hidden="true">✓</span></span></label><div class="create-controls"><div class="room-name-field"><label class="sr-only" for="room-name">Nome da sala</label><input id="room-name" name="room_name" maxlength="48" autocomplete="off" placeholder="Nome da sala"></div><fieldset class="visibility"><legend class="sr-only">Visibilidade da sala</legend><label><input type="radio" name="visibility" value="public"><span>Público</span></label><label><input type="radio" name="visibility" value="private" checked><span>Privado</span></label></fieldset><button type="submit">Jogar<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div><p class="panel-note"></p></form></section><section class="portal-panel join-panel" aria-labelledby="join-title"><h2 id="join-title">Entrar em sala privada</h2><p>Já tem um convite?</p><form id="join-code-form"><label for="join-code">Código da sala</label><div class="code-entry"><input id="join-code" name="code" maxlength="4" minlength="4" pattern="[A-Za-z]{4}" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" aria-describedby="join-help" required><button type="submit">Entrar</button></div><p id="join-help" class="panel-note">Use as quatro letras do código.</p></form></section></div><section class="public-rooms" aria-labelledby="public-title"><header><div><h2 id="public-title">Salas públicas</h2><p>Encontre uma turma para jogar.</p></div><button id="refresh-rooms" class="quiet" aria-label="Atualizar salas públicas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"/></svg><span>Atualizar</span></button></header><div id="public-room-list" aria-live="polite"><p class="directory-message" role="status">Buscando salas…</p></div></section></section>`;
  loadPublicRooms();
}
function home(joinCode = '') {
  if (!joinCode) { portal(); return; }
  activeNav(null);
  main.innerHTML = `<section class="welcome game-home"><span class="eyebrow">Sala ${esc(joinCode)}</span><h1>Sabe Essa?</h1><p>15 desafios. 20 segundos para cada resposta.</p><form id="room-form"><div id="join-name-field"><label for="name">Como podemos chamar você?</label><input id="name" name="name" maxlength="24" autocomplete="nickname" required placeholder="Seu nome"></div><p id="known-identity" hidden>Você vai entrar como <strong></strong>.</p><div class="join-fields"><label for="code">Código da sala</label><input id="code" name="code" maxlength="4" pattern="[A-Za-z]{4}" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" value="${esc(joinCode)}" required></div><div class="actions"><button type="submit" name="mode" value="join" class="secondary">Entrar na sala</button></div></form></section>`;
  document.querySelector('#name').value = playerName;
  syncJoinIdentity();
}
function openRoomEntry(joinCode) {
  home(joinCode);
  const name = knownPlayerName();
  if (name) enterRoom({mode:'join',code:joinCode}, name, document.querySelector('#room-form button[type="submit"]'));
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
  if (!document.hidden && !identityDialog.open && !enteringRoom && !list?.contains(document.activeElement)) loadPublicRooms();
}, 15000);
function requestIdentity(intent, button) {
  if (enteringRoom) return;
  if (intent.mode==='join' && sessionFor(intent.code)) { location.assign(`/${intent.code}`); return; }
  const name = knownPlayerName();
  if (name) { enterRoom(intent, name, button); return; }
  roomIntent = intent;
  document.querySelector('#identity-description').textContent = intent.mode==='create' ? `Criar ${intent.room_name || 'uma sala de Sabe Essa?'} · ${intent.visibility==='public' ? 'Pública' : 'Privada'}` : `Entrar na sala ${intent.code}`;
  document.querySelector('#identity-submit').textContent = intent.mode==='create' ? 'Jogar' : 'Entrar';
  document.querySelector('#identity-error').textContent = '';
  document.querySelector('#player-name').value = playerName;
  identityDialog.showModal();
  document.querySelector('#player-name').focus();
}
async function enterRoom(intent, name, button) {
  if (enteringRoom || !button || button.disabled) return;
  enteringRoom = true;
  let navigating = false;
  button.disabled = true;
  button.setAttribute('aria-busy','true');
  if (identityDialog.open) document.querySelector('#identity-cancel').disabled = true;
  toast(intent.mode==='create' ? 'Criando sala…' : 'Entrando na sala…');
  try {
    if (!name) throw new ApiError('Digite seu nome para continuar.');
    requireStorage();
    await requireCurrentAPI();
    const body = intent.mode==='create' ? {name,room_name:intent.room_name,visibility:intent.visibility} : {name};
    const result = await requestJSON(intent.mode==='create'?'/api/rooms':`/api/rooms/${intent.code}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if (!stored(`fun:${result.code}`,JSON.stringify(result))) throw new ApiError('Não foi possível salvar sua sessão. Libere espaço no armazenamento do navegador.');
    code = result.code;
    setPlayerName(name);
    location.assign(`/${code}`);
    navigating = true;
  } catch (error) {
    const message = userError(error,'Não foi possível entrar. Verifique sua conexão e tente novamente.');
    if (identityDialog.open) { toast(''); document.querySelector('#identity-error').textContent = message; } else toast(message);
  } finally {
    if (!navigating) {
      enteringRoom = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      document.querySelector('#identity-cancel').disabled = false;
    }
  }
}
function render() {
  if (!state) return;
  activeNav(null);
  const focus = document.activeElement?.id;
  const previousAnswer = document.querySelector('#answer')?.value || '';
  const selection = document.querySelector('#answer')?.selectionStart;
  const me = state.people.find(p => p.id === state.you);
  if (me?.active && me.name !== playerName) setPlayerName(me.name);
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
  center = center.replace(/<p>Imagens e textos intercalados\.[^<]+<\/p>/, '');
  main.innerHTML = `<section class="room"><header class="room-header"><div><span class="eyebrow">SABE ESSA? · SALA ${esc(code)} · ${state.visibility==='public' ? 'Pública' : 'Privada'}</span><h1>${title}</h1></div>${status()}</header>${state.warning ? '<div class="presence" role="alert"><p>A sala ficou inativa. Confirme sua presença em até 2 minutos para mantê-la aberta.</p><button data-action="presence">Estou aqui</button></div>' : ''}<div class="room-grid"><section class="play-area" aria-label="Partida">${center}</section><section class="scoreboard" aria-label="Participantes e pontuação"><div class="board-title"><h2>${state.phase==='lobby' ? 'Na sala' : 'Pontuação'}</h2><span>${state.people.filter(p=>p.active).length}/16</span></div><ol>${state.people.map(p=>`<li class="${!p.active ? 'departed' : ''}"><span class="rank">${p.rank ?? '—'}</span><div><strong>${esc(p.name)}${p.id===state.you ? ' (você)' : ''}</strong><small>${p.host ? 'Anfitrião · ' : ''}${!p.active ? 'Saiu da partida' : !p.online ? 'Reconectando' : p.spectator ? 'Espectador' : playing&&p.answered ? 'Acertou' : 'Na sala'}</small></div><span class="score">${p.score}</span>${host&&p.active&&p.id!==state.you ? `<button class="kick quiet" data-action="kick" data-target="${esc(p.id)}" aria-label="Expulsar ${esc(p.name)}">×</button>` : ''}</li>`).join('')}</ol></section></div><footer class="room-footer"><button class="quiet" data-action="leave">Sair da sala</button>${host ? '<button class="quiet danger-text" id="close-room">Encerrar sala</button>' : ''}</footer></section>`;
  if (playing && challenge?.reference) {
    const reference = document.createElement('blockquote'); reference.className = 'challenge-reference'; reference.textContent = challenge.reference;
    main.querySelector('.prompt').after(reference);
  }
  const rows = main.querySelectorAll('.scoreboard li');
  rows.forEach((row, index) => {
    row.querySelector('button.kick')?.remove();
    const player = state.people[index];
    row.querySelector('.rank').textContent = player?.rank ?? '';
    const subtitle = row.querySelector('small');
    if (subtitle && player) {
      subtitle.textContent = !player.active ? 'Saiu da partida'
        : !player.online ? 'Reconectando'
        : player.spectator ? 'Espectador'
        : player.last_wrong_answer || (playing && player.answered ? 'Acertou' : '');
      subtitle.title = player.last_wrong_answer || '';
    }
    if (host && player?.active && player.id !== state.you) {
      row.dataset.kickTarget = player.id;
      row.tabIndex = 0; row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Abrir confirmação para remover ${player.name}`);
    }
  });
  const heading = main.querySelector('.room-header h1');
  const titleLine = document.createElement('div'); titleLine.className = 'room-title-line';
  const share = document.createElement('button'); share.id = 'copy-room-link';
  share.className = 'quiet icon-button room-share'; share.type = 'button';
  share.setAttribute('aria-label', 'Copiar link da sala'); share.title = 'Copiar link da sala';
  share.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 2.93l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.71-1.71"/></svg>';
  heading.before(titleLine); titleLine.append(heading, share);
  if (host && state.phase === 'lobby') {
    const edit = document.createElement('button');
    edit.id = 'edit-room-name'; edit.className = 'quiet room-name-edit';
    edit.type = 'button'; edit.textContent = 'Alterar nome'; edit.setAttribute('aria-label', 'Alterar nome da sala');
    titleLine.after(edit);
  }
  if (focus && main.contains(document.getElementById(focus))) {
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
  return event.id;
}
async function copyRoomLink() {
  const link = `${location.origin}/${code}`;
  try {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(link); toast('Link copiado para compartilhar.'); return; }
      catch { /* Use the browser fallback when clipboard permission is unavailable. */ }
    }
    const input = document.createElement('textarea');
    input.value = link; input.setAttribute('readonly', '');
    input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.append(input); input.select();
    const copied = document.execCommand('copy'); input.remove();
    if (!copied) throw new Error('copy failed');
    toast('Link copiado para compartilhar.');
  } catch {
    toast('Não foi possível copiar o link. Copie o endereço da barra do navegador.');
  }
}
function openKickConfirmation(target) {
  if (!state || state.host !== state.you) return;
  const player = state.people.find(person => person.id === target && person.active && person.id !== state.you);
  if (!player) return;
  kickTarget = player.id;
  document.querySelector('#kick-description').textContent = `Você está removendo ${player.name} da sala. Confirma a remoção?`;
  kickDialog.showModal();
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
      if (event?.action==='rename_player') {
        if (msg.ok) setPlayerName(event.name.trim());
        finishProfileSave(msg.ok ? '' : msg.error || 'Não foi possível alterar seu nome. Tente novamente.');
      }
      else if (!msg.ok) toast(msg.error);
      else if(event?.action==='rename') renameDialog.close();
      else if(event?.action==='answer') {
        feedback=msg.correct ? `Acertou! +${msg.points} pontos.` : '';
        const input=document.querySelector('#answer'); if(input && input.value===event.answer) input.value='';
        const el=document.querySelector('#answer-feedback'); if(el) el.textContent=feedback;
      }
    }
  };
  ws.onclose = event => {
    online=false; clearInterval(ping);
    if (event.code===4001) {
      if (profileEventId) finishProfileSave('Sua sessão na sala foi encerrada. Tente salvar seu nome novamente.');
      stopped=true; pending.clear(); stored(`fun:${code}`,null);
      const player=state?.people.find(person=>person.id===state.you);
      if(player) player.active=false;
      render();
      return;
    }
    if (event.code===1008) {
      if (profileEventId) finishProfileSave('Não foi possível retomar a sala. Entre novamente para alterar seu nome.');
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
  if(event.target.id==='profile-form') {
    event.preventDefault();
    saveProfile(event.target.elements.name.value.trim()); return;
  }
  if(event.target.id==='answer-form') {
    event.preventDefault();
    send('answer',{answer:document.querySelector('#answer').value, round_id:state.round_id}); return;
  }
  if(event.target.id==='create-room-form') {
    event.preventDefault();
    const form=event.target;
    requestIdentity({mode:'create',room_name:form.elements.room_name.value.trim(),visibility:form.elements.visibility.value},event.submitter || form.querySelector('button[type="submit"]'));
    return;
  }
  if(event.target.id==='join-code-form') {
    event.preventDefault();
    requestIdentity({mode:'join',code:event.target.elements.code.value.trim().toUpperCase()},event.submitter || event.target.querySelector('button[type="submit"]'));
    return;
  }
  if(event.target.id==='identity-form') {
    event.preventDefault();
    if(roomIntent && !document.querySelector('#identity-submit').disabled) await enterRoom(roomIntent,event.target.elements.name.value.trim(),document.querySelector('#identity-submit'));
    return;
  }
  if(event.target.id==='rename-room-form') {
    event.preventDefault();
    send('rename',{room_name:event.target.elements.room_name.value});
    return;
  }
  if(event.target.id!=='room-form') return;
  event.preventDefault();
  const form=event.target, mode=event.submitter?.value || 'join';
  const name=knownPlayerName() || form.elements.name.value.trim(), inputCode=form.elements.code.value.trim().toUpperCase();
  if(mode==='join'&&!/^[A-Z]{4}$/.test(inputCode)) { toast('Digite as quatro letras da sala.'); return; }
  await enterRoom({mode,code:inputCode},name,event.submitter || form.querySelector('button[type="submit"]'));
});
document.addEventListener('click', event => {
  const row=event.target.closest('li[data-kick-target]');
  if(row && main.contains(row)) { openKickConfirmation(row.dataset.kickTarget); return; }
  const button=event.target.closest('button'); if(!button) return;
  if(button.id==='portal-nav') {
    if(code) { location.assign('/'); return; }
    menu(false);
    portal();
    main.focus({preventScroll:true});
    toast('');
  }
  if(button.id==='menu') menu(button.getAttribute('aria-expanded')!=='true');
  if(button.id==='menu-backdrop') menu(false,true);
  if(button.id==='sidebar-toggle') {
    setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  }
  if(button.id==='theme') { const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'; applyTheme(theme); stored('fun:theme',theme); }
  if(button.id==='profile-open') openProfile();
  if(button.id==='profile-cancel' && !profileEventId) profileDialog.close();
  if(button.id==='close-room') dialog.showModal();
  if(button.id==='copy-room-link') copyRoomLink();
  if(button.id==='edit-room-name' && state?.phase==='lobby' && state.host===state.you) {
    const input=document.querySelector('#new-room-name');
    input.value=state.room_name || '';
    renameDialog.showModal(); input.focus(); input.select();
  }
  if(button.id==='rename-room-cancel') renameDialog.close();
  if(button.id==='refresh-rooms') loadPublicRooms();
  if(button.id==='identity-cancel') identityDialog.close();
  if(button.dataset.joinCode) requestIdentity({mode:'join',code:button.dataset.joinCode},button);
  if(button.id==='retry-session') { stopped=false; connect(); }
  if(button.id==='new-session') { stored(`fun:${code}`,null); state=null; openRoomEntry(code); }
  if(button.dataset.action) send(button.dataset.action,button.dataset.target?{target:button.dataset.target}:{});
});
dialog.addEventListener('close',()=>{ if(dialog.returnValue==='close') send('close'); });
kickDialog.addEventListener('close',()=>{
  if(kickDialog.returnValue==='remove' && kickTarget) send('kick',{target:kickTarget});
  kickTarget = null;
});
identityDialog.addEventListener('close',()=>{ roomIntent=null; });
identityDialog.addEventListener('cancel',event=>{ if(document.querySelector('#identity-submit').disabled) event.preventDefault(); });
profileDialog.addEventListener('cancel',event=>{ if(profileEventId) event.preventDefault(); });
profileDialog.addEventListener('close',()=>{
  document.querySelector(mobileLayout.matches ? '#menu' : '#profile-open').focus();
});
window.addEventListener('storage',event=>{
  if (event.key==='fun:player-name' && !state?.people.some(p=>p.id===state.you&&p.active)) setPlayerName(event.newValue || '', false);
});
document.addEventListener('keydown', event => {
  const row=event.target.closest?.('li[data-kick-target]');
  if(row && (event.key==='Enter'||event.key===' ')) {
    event.preventDefault(); openKickConfirmation(row.dataset.kickTarget); return;
  }
});
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.key==='Escape') { event.preventDefault(); menu(false,true); }
  if (event.key==='Tab') {
    const controls=[document.querySelector('#menu'),...document.querySelectorAll('#profile-open, #sidebar .sidebar-body button, #theme')];
    const first=controls[0], last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first) { event.preventDefault(); last.focus(); }
    else if(!event.shiftKey&&document.activeElement===last) { event.preventDefault(); first.focus(); }
  }
});
mobileLayout.addEventListener('change', () => menu(false));
const theme=stored('fun:theme');
applyTheme(theme==='light'?'light':'dark');
setPlayerName(stored('fun:player-name') || '', false);
if(code) {
  if(session()) { main.innerHTML='<section class="welcome"><p role="status">Retomando sua sala…</p></section>'; connect(); }
  else openRoomEntry(code);
} else if(location.pathname==='/') portal();
else main.innerHTML='<section class="welcome"><h1>Página não encontrada.</h1><a href="/">Voltar ao início</a></section>';
