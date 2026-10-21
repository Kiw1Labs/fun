/* Interface do Batata Quente. Regras, palavras e relógio pertencem ao servidor. */
(() => {
  const mascot = `<svg class="potato-art" viewBox="-24 -30 208 240" aria-hidden="true">
    <defs><linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop class="potato-skin-light"/><stop class="potato-skin-dark" offset="1"/></linearGradient></defs>
    <g class="potato-motion">
      <path class="potato-body" d="M40 36C48 10 100 10 118 34c19 25 8 35 20 61 17 38-9 68-43 69-40 2-74-11-76-43-2-28 14-50 21-85Z" fill="url(#skin)" stroke-width="4"/>
      <g class="potato-spots"><ellipse cx="48" cy="55" rx="5" ry="3"/><ellipse cx="113" cy="63" rx="3" ry="5"/><ellipse cx="38" cy="120" rx="4" ry="3"/><ellipse cx="108" cy="142" rx="5" ry="3"/></g>
      <g class="potato-char"><path d="M41 40q13-13 17 0t-15 17q-13-3-2-17M112 119q21-13 21 4t-20 16q-12-5-1-20M42 139q14-9 18 3t-14 12q-11-3-4-15"/></g>
      <g class="potato-cheeks"><ellipse cx="48" cy="102" rx="10" ry="6"/><ellipse cx="113" cy="100" rx="10" ry="6"/></g>
      <g class="potato-face"><ellipse class="potato-eye" cx="60" cy="87" rx="5" ry="7"/><ellipse class="potato-eye" cx="101" cy="84" rx="5" ry="7"/>
        <g class="potato-brows" fill="none" stroke-width="4" stroke-linecap="round"><path class="potato-brow-left" d="M51 73L68 73"/><path class="potato-brow-right" d="M93 70L110 70"/></g>
        <path class="potato-mouth" d="M70 105Q83 125 96 104" fill="none" stroke-width="4" stroke-linecap="round"/>
      </g>
      <g class="potato-sweat" fill="#bce5ed"><path d="M119 53q-9 13-2 15t2-15M130 73q-7 10-2 12t2-12"/></g>
      <path class="potato-limbs" d="M24 86 9 74m126 13 15-15M55 160l-5 11m51-10 5 10" fill="none" stroke-width="5" stroke-linecap="round"/>
    </g>
  </svg>`;
  let muted = false, audio, previousTurn, previousPhase, lastEvent, seenState=false, currentCycle, lastAlert=0, heatIdentity='', heatLevel=0;
  try { muted=localStorage.getItem('fun:potato-muted')==='1'; } catch {}
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{
    if(event.matches)for(const motion of document.querySelectorAll('.potato-motion'))for(const animation of motion.getAnimations())animation.cancel();
  });
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
    const size=Math.min(arena.clientWidth,arena.clientHeight);
    const halfSeat=Math.max(...seats.map(seat=>Math.max(seat.offsetWidth,seat.offsetHeight)/2),0);
    const radius=Math.max(0,Math.min(size*.39,size/2-halfSeat-8));
    arena.style.setProperty('--orbit-radius',`${radius}px`);
    for(const seat of seats) {
      const angle=Number(seat.dataset.seat)/Math.max(seats.length,2)*Math.PI*2-Math.PI/2;
      seat.classList.toggle('seat-right',Math.cos(angle)>.01);
      seat.style.left=`${arena.clientWidth/2+Math.cos(angle)*radius}px`;
      seat.style.top=`${arena.clientHeight/2+Math.sin(angle)*radius}px`;
    }
  }
  window.addEventListener('resize',()=>{
    const arena=document.querySelector('.potato-arena');if(arena)layoutArena(arena);
  });
  function render({main,state,online,feedback,esc,status}) {
    const p=state.potato, playing=state.phase==='playing', lobby=state.phase==='lobby', host=state.host===state.you;
    const me=state.people.find(person=>person.id===state.you);
    const yourTurn=playing&&p.turn===state.you;
    const motionTime=main.querySelector('.potato-motion')?.getAnimations()[0]?.currentTime;
    const focus=document.activeElement?.id, input=main.querySelector('#answer'), value=input?.value || '', selection=input?.selectionStart;
    const winner=state.people.find(person=>person.id===state.winner);
    const roster=state.people.filter(person=>person.active || person.lives!==undefined).sort((a,b)=>a.joined-b.joined);
    let lead, controls;
    if(lobby) {
      lead='<span class="potato-eyebrow">AQUEÇA AS IDEIAS</span><h2>Quem vai ficar com<br>a batata?</h2><p>Uma palavra certa. Um suspiro a mais.<br>Chame de 2 a 8 pessoas e descubra.</p>';
      controls=`${host ? `<button data-action="start" class="potato-start" ${!online || state.people.filter(x=>x.active&&x.online).length<2?'disabled':''}>Começar a esquentar <span aria-hidden="true">↗</span></button><p class="fine">São necessárias pelo menos 2 pessoas conectadas.</p>` : '<p>O anfitrião inicia quando a turma estiver pronta.</p>'}`;
    } else if(playing) {
      lead=`<h2 class="fragment" aria-label="Trecho de letras">${esc(p.fragment)}</h2>`;
      controls=`<form id="answer-form" class="potato-answer"><label for="answer">${yourTurn?'Qual é a palavra?':me.spectator?'Você está acompanhando':me.lives===0?'Você foi eliminado. Continue acompanhando!':'Prepare sua próxima palavra'}</label><div class="answer-row"><input id="answer" name="answer" maxlength="32" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Pense rápido…" value="${esc(value)}" ${!yourTurn || !online?'disabled':''} required><button ${!yourTurn || !online?'disabled':''} aria-label="Enviar palavra">Enviar <span aria-hidden="true">↗</span></button></div><p id="answer-feedback" role="status">${esc(feedback)}</p></form>`;
    } else {
      lead=`<span class="potato-eyebrow">FIM DE JOGO</span><h2>${!state.winner?'Partida encerrada sem vencedor':state.you===state.winner?'Você venceu!':`${esc(winner?.name)} venceu!`}</h2><p>${state.result==='dictionary_exhausted'?'Todas as palavras disponíveis foram usadas. Comece outra partida.':state.result==='cancelled'?'A turma desconectou ou a partida foi interrompida.':'A última pessoa com vidas ficou com a vitória.'}</p>`;
      controls=host ? `<div class="actions"><button data-action="start" ${!online || state.people.filter(x=>x.active&&x.online).length<2?'disabled':''}>Jogar novamente</button><button data-action="lobby" class="secondary">Retornar todos ao lobby</button></div>` : '<p>O anfitrião pode começar uma nova partida.</p>';
    }
    const event=p.event;
    const phaseLabel=lobby?'No lobby':playing?'Em partida':'Resultado';

    main.innerHTML=`<section class="potato-room"><header class="room-header"><div><div class="potato-eyebrow">BATATA QUENTE <span>· SALA ${esc(state.code)}</span></div><div class="room-title-line"><h1>${esc(state.room_name)}</h1><button id="copy-room-link" class="quiet icon-button room-share" aria-label="Copiar link da sala"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 2.93l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.71-1.71"/></svg></button></div><p class="potato-room-meta">${state.visibility==='private'?'Só por convite':'Sala pública'} · ${state.people.filter(x=>x.active).length}/8 pessoas ${host&&lobby?'<button id="edit-room-name" class="quiet">Alterar nome</button>':''}</p></div><div class="potato-tools">${status()}<button id="potato-sound" class="quiet" aria-pressed="${!muted}">${muted?'Som desligado':'Som ligado'}</button></div></header>${state.warning?'<div class="presence" role="alert"><p>Confirme sua presença para manter a sala aberta.</p><button data-action="presence">Estou aqui</button></div>':''}<div class="potato-layout"><section class="potato-table" aria-label="Mesa de jogo"><div class="table-caption"><span><i aria-hidden="true"></i>${phaseLabel}</span><span>${p.used_count} palavras na roda</span></div><div class="potato-arena ${playing?'is-playing':''}"><div class="potato-orbit" aria-hidden="true"></div><div class="potato-center"><div class="potato-token">${mascot}</div>${lead}</div><ol class="potato-seats" aria-label="Jogadores">${roster.map((person,index)=>`<li id="potato-seat-${esc(person.id)}" data-seat="${index}" ${host&&person.active&&person.id!==state.you?`data-kick-target="${esc(person.id)}" tabindex="0" role="button" aria-label="Abrir confirmação para remover ${esc(person.name)}"`:""} class="potato-seat ${person.id===p.turn&&playing?'current-seat':''} ${person.lives===0||!person.active?'out-seat':''}">${person.id===p.turn&&playing?'<span class="turn-pointer" aria-hidden="true"></span>':''}<span class="seat-avatar" aria-hidden="true">${esc(person.name.slice(0,1).toUpperCase())}</span><strong>${esc(person.name)}${person.id===state.you?' (você)':''}</strong><small>${person.host?'♛ ':''}${!person.active?'Saiu':!person.online?'Reconectando':person.spectator?'Espectador':person.lives===0?'Eliminado':person.id===p.turn&&playing?'▶ Está com a batata':lobby?'Pronto pra jogar':'Na roda'}</small>${person.lives!=null?`<span class="seat-hearts" aria-label="${person.lives} vidas">${'♥'.repeat(person.lives)}${'♡'.repeat(Math.max(0,p.settings.lives-person.lives))}</span>`:''}</li>`).join('')}</ol></div><div class="potato-input-area">${controls}</div></section></div><footer class="room-footer"><div><button class="quiet" data-action="leave">Sair da sala</button>${host?'<button id="close-room" class="quiet danger-text">Encerrar sala</button>':''}</div></footer></section>`;
    const arena=main.querySelector('.potato-arena');
    layoutArena(arena);
    if(seenState&&event?.id!==lastEvent&&event) {
      tone(event.kind);
      if(event.kind==='burn'&&!reduced()) arena.animate([{filter:'brightness(1)'},{filter:'brightness(1.55)'},{filter:'brightness(1)'}],{duration:500});
    }
    if(previousPhase==='playing'&&state.phase==='results'&&state.winner) tone('victory');
    if(currentCycle!==p.cycle) lastAlert=0;
    lastEvent=event?.id; seenState=true; previousPhase=state.phase; currentCycle=p.cycle;
    if(focus&&main.querySelector(`#${CSS.escape(focus)}`)&&!main.querySelector(`#${CSS.escape(focus)}`).disabled) {
      const target=main.querySelector(`#${CSS.escape(focus)}`);target.focus({preventScroll:true});
      if(target.type==='text'&&selection!=null) target.setSelectionRange(selection,selection);
    } else if(yourTurn&&previousTurn!==p.turn&&!matchMedia('(pointer: coarse)').matches) main.querySelector('#answer')?.focus({preventScroll:true});
    previousTurn=p.turn;
    timer(state,state.server_now);
    const motion=arena.querySelector('.potato-motion').getAnimations()[0];
    if(playing&&motion&&motionTime!=null)motion.currentTime=motionTime;
  }
  function mix(from,to,amount) {
    const a=from.match(/\w\w/g).map(value=>parseInt(value,16));
    const b=to.match(/\w\w/g).map(value=>parseInt(value,16));
    return '#'+a.map((value,index)=>Math.round(value+(b[index]-value)*amount).toString(16).padStart(2,'0')).join('');
  }
  function appearance(art,heat) {
    const palette=[['ffdb92','d58a3b','6a3c20','ff9772'],['f3ae72','cf693c','74352b','e77765'],['cf784f','97432e','522b24','c45749'],['775039','3e2923','a56d48','95533e']];
    const step=Math.min(2,Math.floor(heat*3)),amount=heat*3-step;
    for(const [index,name] of ['light','dark','outline','cheeks'].entries())art.style.setProperty(`--potato-${name}`,mix(palette[step][index],palette[step+1][index],amount));
    art.style.setProperty('--potato-ink',mix('432c25','ffe1b3',Math.max(0,(heat-.65)/.35)));
    art.style.setProperty('--potato-char',Math.max(0,(heat-.3)/.7)*.7);
    art.style.setProperty('--potato-sweat',Math.max(0,(heat-.6)/.4));
    art.style.setProperty('--potato-brows',Math.min(1,heat*2));
    art.style.setProperty('--hop-tilt',`${8+heat*9}deg`);
    const mood=heat<.3?'calm':heat<.6?'warm':heat<.82?'serious':'stressed';
    art.dataset.heat=mood;
    const names={calm:'Batata tranquila',warm:'Batata esquentando',serious:'Batata séria',stressed:'Batata estressada e queimada'};
    art.parentElement.setAttribute('role','img');art.parentElement.setAttribute('aria-label',names[mood]);
    const serious=Math.min(1,heat/.65),stress=Math.max(0,(heat-.65)/.35);
    art.querySelector('.potato-mouth').setAttribute('d',`M70 ${105+serious*5+stress*6}Q83 ${125-serious*15-stress*8} 96 ${104+serious*6+stress*6}`);
    art.querySelector('.potato-brow-left').setAttribute('d',`M51 ${74-heat*7}L68 ${74+heat*3}`);
    art.querySelector('.potato-brow-right').setAttribute('d',`M93 ${71+heat*3}L110 ${71-heat*7}`);
    for(const eye of art.querySelectorAll('.potato-eye'))eye.setAttribute('ry',String(7-stress*3));
    const motion=art.querySelector('.potato-motion').getAnimations()[0];
    if(motion) {
      if(reduced())motion.cancel();
      else motion.updatePlaybackRate(.7+heat*1.8);
    }
  }
  function timer(state,now) {
    if(state.phase!=='playing') return;
    const left=Math.max(0,state.deadline-now),identity=`${state.code}:${state.potato.cycle}:${state.started}`;
    if(identity!==heatIdentity) {heatIdentity=identity;heatLevel=0;}
    // O piso de passagem pode estender o prazo; isso não esfria a batata no mesmo aquecimento.
    const duration=Math.max(1,state.deadline-state.started);
    heatLevel=Math.max(heatLevel,Math.max(0,Math.min(1,(now-state.started)/duration)));
    const arena=document.querySelector('.potato-arena'),art=arena?.querySelector('.potato-art');
    arena?.classList.toggle('is-hot',left<=5);
    if(art)appearance(art,heatLevel);
    if(left>0&&left<=5&&Math.ceil(left)!==lastAlert) {lastAlert=Math.ceil(left);tone('alert');}
  }
  window.Batata={render,timer,portal};
})();
