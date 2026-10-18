const main = document.querySelector('main');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('dialog');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codeFromPath = () => /^\/[A-Z]{4}$/.test(location.pathname) ? location.pathname.slice(1) : null;
let code = codeFromPath(), state = null, ws = null, online = false, stopped = false;
let reconnect = 0, ping = null, serverAt = 0, receivedAt = 0, feedback = '';
const pending = new Map();
function stored(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { toast('Habilite o armazenamento do navegador para retomar sua sessão após F5.'); }
}
function toast(message) { notice.textContent = message; }
const session = () => { try { return JSON.parse(stored(`fun:${code}`)); } catch { return null; } };
function status() { return `<span class="connection ${online ? 'connected' : ''}">${online ? 'Ao vivo' : 'Reconectando…'}</span>`; }
function portal() {
  main.innerHTML = `<section class="welcome"><span class="eyebrow">UM TEMPO BOM, EM BOA COMPANHIA</span><h1>O próximo assunto<br>começa aqui<span class="dot">.</span></h1><p>Jogos simples. Desafios ao vivo.<br>Uma boa desculpa para juntar todo mundo.</p><button class="game-card" id="select-game"><span class="game-icon" aria-hidden="true">✳</span><span><strong>Sabe Essa?</strong><small>Reconheça. Responda. Surpreenda.</small></span><span aria-hidden="true">↗</span></button></section>`;
}
function home(joinCode = '') {
  main.innerHTML = `<section class="welcome game-home"><span class="eyebrow">FUN / SABE ESSA?</span><h1>Você sabe.<br>Mas sabe a tempo?</h1><p>15 desafios de imagens e textos.<br>20 segundos para mostrar que essa você sabe.</p><form id="room-form"><label for="name">Como podemos chamar você?</label><input id="name" name="name" maxlength="24" autocomplete="nickname" required placeholder="Seu nome"><div class="join-fields"><label for="code">Código da sala</label><input id="code" name="code" maxlength="4" pattern="[A-Za-z]{4}" autocapitalize="characters" autocomplete="off" placeholder="ABCD" value="${esc(joinCode)}" ${joinCode ? 'required' : ''}></div><div class="actions">${joinCode ? '' : '<button type="submit" name="mode" value="create">Criar sala</button>'}<button type="submit" name="mode" value="join" class="secondary">Entrar na sala</button></div></form><p class="fine">De 2 competidores a 16 pessoas. Quem chega durante a partida acompanha como espectador.</p></section>`;
}
function render() {
  if (!state) return;
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
  const playing = ['question','reveal'].includes(state.phase);
  const title = state.phase === 'lobby' ? 'A turma está chegando.' : state.phase === 'results' ? 'Essa foi boa.' : `Desafio ${state.number}<span class="muted"> / 15</span>`;
  const challenge = state.challenge;
  let center = '';
  if (state.phase === 'lobby') {
    center = `<div class="lobby-symbol" aria-hidden="true">✳</div><h2>Todo mundo pronto?</h2><p>Compartilhe o código <strong>${esc(code)}</strong> ou o endereço desta sala.</p>${!state.catalog_available ? '<div class="empty-catalog"><strong>O catálogo ainda está sendo preparado.</strong><p>Não há desafios suficientes para esta composição e o histórico da sala. A partida fica disponível após a publicação de conteúdo.</p></div>' : '<p>Imagens e textos intercalados. Sem dicas. Vale tentar até acertar.</p>'}${host ? `<button data-action="start" ${!state.catalog_available || state.people.filter(p=>p.active&&p.online).length<2 ? 'disabled' : ''}>Iniciar partida</button><p class="fine">É preciso ter pelo menos dois competidores conectados.</p>` : '<p class="fine">O anfitrião inicia a partida.</p>'}`;
  } else if (playing) {
    center = `<div class="round-heading"><span>${me.spectator ? 'Você está acompanhando' : 'Mostre que sabe'}</span><strong id="timer" aria-label="Tempo restante">20s</strong></div><div class="timer-track"><div id="timer-progress"></div></div><h2 class="prompt">${esc(challenge.prompt)}</h2>${challenge.image ? `<img class="challenge-image" src="${esc(challenge.image)}" alt="Imagem do desafio: ${esc(challenge.prompt)}">` : ''}${state.phase === 'reveal' ? `<div class="reveal"><span>A resposta é</span><strong>${esc(challenge.answer)}</strong></div><p class="fine">${state.number===15 ? 'Resultado a seguir.' : 'Próximo desafio em instantes.'}</p>` : me.spectator ? '<p>Você poderá competir na próxima partida.</p>' : me.answered ? '<div class="correct">Você acertou! Aguarde os demais.</div>' : `<form id="answer-form"><label for="answer">Sua resposta</label><div class="answer-row"><input id="answer" maxlength="200" autocomplete="off" required placeholder="Essa eu sei…" value="${esc(previousAnswer)}" ${!online ? 'disabled' : ''}><button ${!online ? 'disabled' : ''}>Responder</button></div></form><p id="answer-feedback" role="status">${esc(feedback)}</p>`}`;
  } else {
    const winner = state.people.find(p=>p.id===state.winner);
    center = `<div class="lobby-symbol" aria-hidden="true">✳</div><h2>${state.result==='cancelled' ? 'Partida cancelada, sem vencedor.' : state.result==='automatic' ? `${esc(winner?.name)} venceu por permanência.` : '15 desafios. Muitas descobertas.'}</h2><p>Confira os pontos da partida na mesma lista ao lado.</p>${host ? `<div class="actions"><button data-action="start" ${!state.catalog_available ? 'disabled' : ''}>Iniciar nova partida</button><button data-action="lobby" class="secondary">Retornar todos ao lobby</button></div>${!state.catalog_available ? '<p class="empty-catalog">Catálogo insuficiente para outra partida sem repetir as três anteriores.</p>' : ''}` : '<p>O anfitrião decide quando voltar ao lobby ou começar outra partida.</p>'}`;
  }
  main.innerHTML = `<section class="room"><header class="room-header"><div><span class="eyebrow">SABE ESSA? · SALA ${esc(code)}</span><h1>${title}</h1></div>${status()}</header>${state.warning ? '<div class="presence" role="alert"><p>A sala ficou inativa. Confirme sua presença em até 2 minutos para mantê-la aberta.</p><button data-action="presence">Estou aqui</button></div>' : ''}<div class="room-grid"><section class="play-area" aria-label="Partida">${center}</section><section class="scoreboard" aria-label="Participantes e pontuação"><div class="board-title"><h2>${state.phase==='lobby' ? 'Na sala' : 'Pontuação'}</h2><span>${state.people.filter(p=>p.active).length}/16</span></div><ol>${state.people.map(p=>`<li class="${!p.active ? 'departed' : ''}"><span class="rank">${p.rank ?? '—'}</span><div><strong>${esc(p.name)}${p.id===state.you ? ' (você)' : ''}</strong><small>${p.host ? 'Anfitrião · ' : ''}${!p.active ? 'Saiu da partida' : !p.online ? 'Reconectando' : p.spectator ? 'Espectador' : playing&&p.answered ? 'Acertou' : 'Na sala'}</small></div><span class="score">${p.score}</span>${host&&p.active&&p.id!==state.you ? `<button class="kick quiet" data-action="kick" data-target="${esc(p.id)}" aria-label="Expulsar ${esc(p.name)}">×</button>` : ''}</li>`).join('')}</ol></section></div><footer class="room-footer"><button class="quiet" data-action="leave">Sair da sala</button>${host ? '<button class="quiet danger-text" id="close-room">Encerrar sala</button>' : ''}</footer></section>`;
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
      if(state?.round_id!==msg.round_id) feedback='';
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
        const input=document.querySelector('#answer'); if(input) input.value='';
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
  if(event.target.id!=='room-form') return;
  event.preventDefault();
  const form=event.target, mode=event.submitter?.value || 'join';
  const name=form.elements.name.value.trim(), inputCode=form.elements.code.value.trim().toUpperCase();
  if(mode==='join'&&!/^[A-Z]{4}$/.test(inputCode)) { toast('Digite as quatro letras da sala.'); return; }
  const button=event.submitter; if(button) button.disabled=true;
  try {
    const response=await fetch(mode==='create'?'/api/rooms':`/api/rooms/${inputCode}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    const result=await response.json(); if(!response.ok) throw new Error(result.error);
    code=result.code; stored(`fun:${code}`,JSON.stringify(result)); location.assign(`/${code}`);
  } catch(error) { toast(error.message || 'Não foi possível entrar. Tente novamente.'); if(button) button.disabled=false; }
});
document.addEventListener('click', event => {
  const button=event.target.closest('button'); if(!button) return;
  if(button.id==='select-game'||button.id==='game-nav') {
    if(code) { location.assign('/'); return; } home();
  }
  if(button.id==='menu') { const open=document.querySelector('aside').classList.toggle('open'); button.setAttribute('aria-expanded',String(open)); }
  if(button.id==='theme') { const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'; document.documentElement.dataset.theme=theme; stored('fun:theme',theme); }
  if(button.id==='close-room') dialog.showModal();
  if(button.id==='retry-session') { stopped=false; connect(); }
  if(button.id==='new-session') { stored(`fun:${code}`,null); state=null; home(code); }
  if(button.dataset.action) send(button.dataset.action,button.dataset.target?{target:button.dataset.target}:{});
});
dialog.addEventListener('close',()=>{ if(dialog.returnValue==='close') send('close'); });
const theme=stored('fun:theme');
if(theme) document.documentElement.dataset.theme=theme;
if(code) {
  if(session()) { main.innerHTML='<section class="welcome"><p role="status">Retomando sua sala…</p></section>'; connect(); }
  else home(code);
} else if(location.pathname==='/') portal();
else main.innerHTML='<section class="welcome"><h1>Página não encontrada.</h1><a href="/">Voltar ao início</a></section>';
