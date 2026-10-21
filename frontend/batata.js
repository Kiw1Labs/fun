/* Interface do Batata Quente. Regras, palavras e relógio pertencem ao servidor. */
(() => {
  const mascot = `<svg class="potato-art" viewBox="0 0 160 180" aria-hidden="true"><defs><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffdb92"/><stop offset="1" stop-color="#d58a3b"/></linearGradient></defs><path d="M40 36C48 10 100 10 118 34c19 25 8 35 20 61 17 38-9 68-43 69-40 2-74-11-76-43-2-28 14-50 21-85Z" fill="url(#skin)" stroke="#6a3c20" stroke-width="4"/><g fill="#ad6c32" opacity=".65"><ellipse cx="48" cy="55" rx="5" ry="3"/><ellipse cx="113" cy="63" rx="3" ry="5"/><ellipse cx="38" cy="120" rx="4" ry="3"/><ellipse cx="108" cy="142" rx="5" ry="3"/></g><g fill="#432c25"><ellipse cx="60" cy="87" rx="5" ry="7"/><ellipse cx="101" cy="84" rx="5" ry="7"/></g><g fill="#ff9772"><ellipse cx="48" cy="102" rx="10" ry="6"/><ellipse cx="113" cy="100" rx="10" ry="6"/></g><path d="M73 105q10 13 20-1" fill="none" stroke="#432c25" stroke-width="4" stroke-linecap="round"/><path d="M24 86 9 74m126 13 15-15M55 160l-5 11m51-10 5 10" stroke="#6a3c20" stroke-width="5" stroke-linecap="round"/></svg>`;
  let muted = false, audio, previousTurn, previousPosition, previousPhase, lastEvent, seenState=false, currentCycle, lastAlert=0;
  try { muted=localStorage.getItem('fun:potato-muted')==='1'; } catch {}
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function unlock() {
    if(muted) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(()=>{}); } catch {}
  }
  document.addEventListener('pointerdown',unlock);
  document.addEventListener('keydown',unlock);
  function tone(kind) {
    if(muted || !audio || audio.state!=='running') return;
    const notes=kind==='victory' ? [523,659,784,1047] : kind==='burn' ? [180,100,60] : kind==='alert' ? [880] : [392,587];
    notes.forEach((frequency,index)=>{
      const oscillator=audio.createOscillator(), gain=audio.createGain(), start=audio.currentTime+index*.1;
      oscillator.type=kind==='burn'?'triangle':'sine'; oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(.06,start+.01);
      gain.gain.exponentialRampToValueAtTime(.0001,start+.17);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start+.18);
    });
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('#potato-sound');
    if(!button) return;
    muted=!muted;
    try {localStorage.setItem('fun:potato-muted',muted?'1':'0');} catch {}
    button.textContent=muted?'Som desligado':'Som ligado'; button.setAttribute('aria-pressed',String(!muted));
    if(!muted) {unlock();tone('pass');}
  });
  function portal(main) {
    const original=main.querySelector('.game-tile');
    const games=document.createElement('fieldset'); games.className='game-picker';
    games.innerHTML='<legend class="sr-only">Escolha o jogo</legend>';
    original.before(games); games.append(original);
    const tile=document.createElement('label'); tile.className='game-tile potato-tile';
    tile.innerHTML=`<input type="radio" name="game" value="batata-quente"><span class="game-icon">${mascot}</span><strong>Batata Quente</strong><span class="game-tagline">Pense rápido.<br>Passe a palavra.</span><span class="selected-game">Selecionado <span aria-hidden="true">✓</span></span>`;
    games.append(tile);
  }
  function layoutArena(arena) {
    const seats=[...arena.querySelectorAll('[data-seat]')];
    let position={x:0,y:-40};
    for(const seat of seats) {
      const angle=Number(seat.dataset.seat)/Math.max(seats.length,2)*Math.PI*2-Math.PI/2;
      const radius=Math.min(.41,.5-(seat.offsetWidth/2+8)/arena.clientWidth);
      seat.style.left=`${50+Math.cos(angle)*radius*100}%`;seat.style.top=`${50+Math.sin(angle)*39}%`;
      if(seat.classList.contains('current-seat')) {
        position={x:Math.cos(angle)*arena.clientWidth*.18,y:Math.sin(angle)*arena.clientHeight*.06};
        arena.querySelector('.potato-token').style.setProperty('--pointer-angle',`${angle}rad`);
      }
    }
    return position;
  }
  window.addEventListener('resize',()=>{
    const arena=document.querySelector('.potato-arena');if(!arena)return;
    previousPosition=layoutArena(arena);
    arena.querySelector('.potato-token').style.transform=`translate(${previousPosition.x}px,${previousPosition.y}px)`;
  });
  function render({main,state,online,feedback,esc,status}) {
    const p=state.potato, playing=state.phase==='playing', lobby=state.phase==='lobby', host=state.host===state.you;
    const me=state.people.find(person=>person.id===state.you), turn=state.people.find(person=>person.id===p.turn);
    const yourTurn=playing&&p.turn===state.you;
    const focus=document.activeElement?.id, input=main.querySelector('#answer'), value=input?.value || '', selection=input?.selectionStart;
    const draft=main.querySelector('#potato-settings')?.contains(document.activeElement) ? Object.fromEntries(new FormData(main.querySelector('#potato-settings'))) : null;
    const winner=state.people.find(person=>person.id===state.winner);
    const roster=state.people.filter(person=>person.active || person.lives!==undefined).sort((a,b)=>a.joined-b.joined);
    let lead, controls;
    if(lobby) {
      lead='<span class="potato-eyebrow">AQUEÇA AS IDEIAS</span><h2>Quem vai ficar com<br>a batata?</h2><p>Uma palavra certa. Um suspiro a mais.<br>Chame de 2 a 8 pessoas e descubra.</p>';
      const c=p.settings;
      controls=`${host ? `<form id="potato-settings"><fieldset ${!online?'disabled':''}><legend>Do seu jeito</legend><div class="potato-settings-grid"><label>Vidas<input id="potato-lives" name="lives" type="number" min="1" max="5" value="${c.lives}" required></label><label>Dificuldade<select id="potato-difficulty" name="difficulty"><option value="easy" ${c.difficulty==='easy'?'selected':''}>Tranquila</option><option value="normal" ${c.difficulty==='normal'?'selected':''}>No ponto</option><option value="hard" ${c.difficulty==='hard'?'selected':''}>Fervendo</option></select></label><label>Mínimo (s)<input id="potato-min" name="min_seconds" type="number" min="5" max="60" value="${c.min_seconds}" required></label><label>Máximo (s)<input id="potato-max" name="max_seconds" type="number" min="5" max="60" value="${c.max_seconds}" required></label><label>Ao passar (s)<input id="potato-floor" name="floor_seconds" type="number" min="3" max="10" value="${c.floor_seconds}" required></label><button class="secondary" type="submit">Salvar ajustes</button></div></fieldset></form><button data-action="start" class="potato-start" ${!online || state.people.filter(x=>x.active&&x.online).length<2?'disabled':''}>Começar a esquentar <span aria-hidden="true">↗</span></button><p class="fine">São necessárias pelo menos 2 pessoas conectadas.</p>` : `<p>O anfitrião inicia quando a turma estiver pronta.</p><p class="fine">${c.lives} vidas · ciclos de ${c.min_seconds} a ${c.max_seconds}s</p>`}`;
    } else if(playing) {
      lead=`<p id="potato-turn" class="turn-message" role="status">${yourTurn?'Sua vez!':`Vez de ${esc(turn?.name)}`}</p><h2 class="fragment" aria-label="Trecho de letras">${esc(p.fragment)}</h2><p class="fragment-help">Use essas letras juntas, em qualquer parte da palavra.</p>`;
      controls=`<form id="answer-form" class="potato-answer"><label for="answer">${yourTurn?'Qual é a palavra?':me.spectator?'Você está acompanhando':me.lives===0?'Você foi eliminado. Continue acompanhando!':'Prepare sua próxima palavra'}</label><div class="answer-row"><input id="answer" name="answer" maxlength="32" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Pense rápido…" value="${esc(value)}" ${!yourTurn || !online?'disabled':''} required><button ${!yourTurn || !online?'disabled':''} aria-label="Enviar palavra">Enviar <span aria-hidden="true">↗</span></button></div><p id="answer-feedback" role="status">${esc(feedback)}</p></form>`;
    } else {
      lead=`<span class="potato-eyebrow">FIM DE JOGO</span><h2>${!state.winner?'Partida encerrada sem vencedor':state.you===state.winner?'Você venceu!':`${esc(winner?.name)} venceu!`}</h2><p>${state.result==='dictionary_exhausted'?'Todas as palavras disponíveis foram usadas. Comece outra partida.':state.result==='cancelled'?'A turma desconectou ou a partida foi interrompida.':'A última pessoa com vidas ficou com a vitória.'}</p>`;
      controls=host ? `<div class="actions"><button data-action="start" ${!online || state.people.filter(x=>x.active&&x.online).length<2?'disabled':''}>Jogar novamente</button><button data-action="lobby" class="secondary">Retornar todos ao lobby</button></div>` : '<p>O anfitrião pode começar uma nova partida.</p>';
    }
    const event=p.event;
    const burnt=event?.kind==='burn' ? state.people.find(person=>person.id===event.player) : null;
    const phaseLabel=lobby?'No lobby':playing?`Aquecimento ${p.cycle}`:'Resultado';
    main.innerHTML=`<section class="potato-room"><header class="room-header"><div><div class="potato-eyebrow">BATATA QUENTE <span>· SALA ${esc(state.code)}</span></div><div class="room-title-line"><h1>${esc(state.room_name)}</h1><button id="copy-room-link" class="quiet icon-button" aria-label="Copiar link da sala">↗</button></div><p class="potato-room-meta">${state.visibility==='private'?'Só por convite':'Sala pública'} · ${state.people.filter(x=>x.active).length}/8 pessoas ${host&&lobby?'<button id="edit-room-name" class="quiet">Alterar nome</button>':''}</p></div><div class="potato-tools">${status()}<button id="potato-sound" class="quiet" aria-pressed="${!muted}">${muted?'Som desligado':'Som ligado'}</button></div></header>${state.warning?'<div class="presence" role="alert"><p>Confirme sua presença para manter a sala aberta.</p><button data-action="presence">Estou aqui</button></div>':''}<div class="potato-layout"><section class="potato-table" aria-label="Mesa de jogo"><div class="table-caption"><span><i aria-hidden="true"></i>${phaseLabel}</span><span>${p.used_count} palavras na roda</span></div><div class="potato-arena ${playing?'is-playing':''}"><div class="potato-orbit" aria-hidden="true"></div><div class="potato-token">${mascot}<span class="turn-pointer" aria-hidden="true">➤</span></div><div class="potato-center">${lead}</div><ol class="potato-seats" aria-label="Jogadores">${roster.map((person,index)=>`<li data-seat="${index}" class="potato-seat ${person.id===p.turn&&playing?'current-seat':''} ${person.lives===0||!person.active?'out-seat':''}"><span class="seat-avatar" aria-hidden="true">${esc(person.name.slice(0,1).toUpperCase())}</span><strong>${esc(person.name)}${person.id===state.you?' (você)':''}</strong><small>${person.host?'♛ ':''}${!person.active?'Saiu':!person.online?'Reconectando':person.spectator?'Espectador':person.lives===0?'Eliminado':person.id===p.turn&&playing?'▶ Está com a batata':lobby?'Pronto pra jogar':'Na roda'}</small>${person.lives!=null?`<span class="seat-hearts" aria-label="${person.lives} vidas">${'♥'.repeat(person.lives)}${'♡'.repeat(p.settings.lives-person.lives)}</span>`:''}${host&&person.active&&person.id!==state.you?`<button class="quiet seat-kick" aria-label="Expulsar ${esc(person.name)}" data-action="kick" data-target="${esc(person.id)}">×</button>`:''}</li>`).join('')}</ol></div>${playing?'<div class="potato-clock"><span>Até queimar</span><strong id="timer" aria-label="Tempo restante"></strong><div class="heat-track"><div id="timer-progress"></div></div></div>':''}<div class="potato-input-area">${controls}</div>${burnt?`<p class="burn-message" role="status">A batata queimou! ${esc(burnt.name)} perdeu uma vida.</p>`:''}</section><aside class="potato-notes"><section><span class="potato-eyebrow">RÁPIDO DE APRENDER</span><h2>Palavra vai.<br>Batata vem.</h2><ol class="potato-rules"><li><span>01</span><p>Na sua vez, escreva uma palavra com o trecho em destaque.</p></li><li><span>02</span><p>Acertou? Passe a batata. O relógio continua correndo.</p></li><li><span>03</span><p>Queimou? Uma vida a menos. A última pessoa com vidas vence.</p></li></ol><p class="potato-dictionary">Acentos são opcionais. Palavras não se repetem. Sem nomes próprios, siglas, espaços ou hífens. Validação pelo VERO pt-BR.</p></section><section class="potato-history"><h3>Passou pela roda</h3>${p.recent.length?`<ol>${[...p.recent].reverse().map(item=>`<li><strong>${esc(item.word)}</strong><span>${esc(item.player)}</span></li>`).join('')}</ol>`:'<p>A primeira palavra pode ser sua.</p>'}</section></aside></div><footer class="room-footer"><span>Boa de palavra? Mostre na roda.</span><div><button class="quiet" data-action="leave">Sair da sala</button>${host?'<button id="close-room" class="quiet danger-text">Encerrar sala</button>':''}</div></footer></section>`;
    const arena=main.querySelector('.potato-arena'), token=main.querySelector('.potato-token');
    const position=layoutArena(arena);
    const transform=`translate(${position.x}px, ${position.y}px)`;
    token.style.transform=transform;
    if(playing && previousPosition && previousTurn!==p.turn && !reduced()) {
      token.animate([{transform:`translate(${previousPosition.x}px,${previousPosition.y}px) rotate(-12deg)`},{transform:`${transform} rotate(10deg)`,offset:.7},{transform}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    if(seenState&&event?.id!==lastEvent&&event) {
      tone(event.kind);
      if(event.kind==='burn'&&!reduced()) arena.animate([{filter:'brightness(1)'},{filter:'brightness(1.55)'},{filter:'brightness(1)'}],{duration:500});
    }
    if(previousPhase==='playing'&&state.phase==='results'&&state.winner) tone('victory');
    if(currentCycle!==p.cycle) lastAlert=0;
    lastEvent=event?.id; seenState=true; previousPhase=state.phase; currentCycle=p.cycle;
    if(draft) for(const [name,v] of Object.entries(draft)) {const field=main.querySelector(`#potato-settings [name="${name}"]`);if(field) field.value=v;}
    if(focus&&main.querySelector(`#${CSS.escape(focus)}`)&&!main.querySelector(`#${CSS.escape(focus)}`).disabled) {
      const target=main.querySelector(`#${CSS.escape(focus)}`);target.focus({preventScroll:true});
      if(target.type==='text'&&selection!=null) target.setSelectionRange(selection,selection);
    } else if(yourTurn&&previousTurn!==p.turn&&!matchMedia('(pointer: coarse)').matches) main.querySelector('#answer')?.focus({preventScroll:true});
    previousTurn=p.turn; previousPosition=position;
    timer(state,state.server_now);
  }
  function timer(state,now) {
    if(state.phase!=='playing') return;
    const left=Math.max(0,state.deadline-now), total=state.deadline-state.started;
    const label=document.querySelector('#timer'); if(label) label.textContent=`${Math.ceil(left)}s`;
    const progress=document.querySelector('#timer-progress');if(progress) progress.style.width=`${Math.min(100,left/total*100)}%`;
    document.querySelector('.potato-arena')?.classList.toggle('is-hot',left<=5);
    if(left>0&&left<=5&&Math.ceil(left)!==lastAlert) {lastAlert=Math.ceil(left);tone('alert');}
  }
  window.Batata={render,timer,portal};
})();
