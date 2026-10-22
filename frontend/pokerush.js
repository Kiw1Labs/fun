/* Interface PokéRush. Validação, sequência, ordem e tempo são exclusivos do servidor. */
(() => {
  const types={normal:'Normal',fire:'Fogo',water:'Água',electric:'Elétrico',grass:'Planta',ice:'Gelo',fighting:'Lutador',poison:'Veneno',ground:'Terra',flying:'Voador',psychic:'Psíquico',bug:'Inseto',rock:'Pedra',ghost:'Fantasma',dragon:'Dragão',dark:'Sombrio',steel:'Aço',fairy:'Fada'};
  const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h6m6 0h6M12 2v3"/><circle cx="12" cy="12" r="3"/></svg>';
  const normalize=value=>value.toLocaleLowerCase().replaceAll('♀','f').replaceAll('♂','m').normalize('NFKD').replace(/[^a-z0-9]/g,'');
  let catalog=[], loading, current, rootKey='', audio, muted=false, voices=[], observed, lastRound='', lastPhase='', seen=new Set(), alertRound='';
  try {muted=localStorage.getItem('fun:pokerush-muted')==='1';} catch {}
  const badges=(values,esc)=>values.map(type=>`<span class="rush-type" data-type="${esc(type)}">${esc(types[type])}</span>`).join('');
  const avatar=(person,esc)=>`<span class="rush-avatar" aria-hidden="true">${esc(person.name.slice(0,1).toUpperCase())}</span>`;
  const desktop=matchMedia('(min-width: 761px) and (pointer: fine)');
  function placeSuggestions() {
    const area=document.querySelector('.rush-room .rush-suggestion-area');if(!area)return;
    const target=document.querySelector(desktop.matches?'.rush-compose-bar':'#rush-composer');
    if(target&&area.parentElement!==target) {
      if(desktop.matches)target.insertBefore(area,target.querySelector('#rush-answer-help'));
      else target.append(area);
    }
  }
  function card() {return `<span class="game-icon">${icon}</span><strong>PokéRush</strong><span class="game-tagline">Lembre o nome.<br>Acerte os tipos.</span>`;}
  function portal(main) {
    const tile=document.createElement('label');tile.className='game-tile rush-tile';
    tile.innerHTML=`<input type="radio" name="game" value="pokerush">${card()}<span class="selected-game">Selecionado <span aria-hidden="true">✓</span></span>`;
    main.querySelector('.game-picker').append(tile);
  }
  function loadCatalog() {
    if(loading)return loading;
    loading=fetch('/assets/pokerush/catalog.json').then(response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{
      catalog=data.pokemon.map(p=>({...p,key:normalize(p.name),alias:normalize(p.slug)}));
      // As miniaturas leves são locais e ficam prontas antes dos acertos e das sugestões.
      for(const pokemon of catalog) {const image=new Image();image.src=pokemon.image;image.decode?.().catch(()=>{});}
      if(current) {suggestions(current.esc);pokedex(current.state,current.esc);}
    }).catch(()=>{loading=null;const message=document.querySelector('#rush-catalog-status');if(message)message.textContent='Sugestões indisponíveis. Você ainda pode escrever o nome completo.';});
    return loading;
  }
  function unlock() {
    if(!document.querySelector('.rush-room')||muted)return;
    try {audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});} catch {}
  }
  function silence() {for(const voice of voices)try {voice.stop();}catch {}voices=[];}
  function sound(kind) {
    if(muted||!audio||audio.state!=='running')return;
    silence(); // Um único efeito por vez, inclusive quando acertos chegam em sequência.
    const notes={correct:[523,784],wrong:[150],end:[523,659,784,1047],alert:[660,440]}[kind];
    notes.forEach((frequency,i)=>{
      const voice=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+i*.075;
      voice.type=kind==='wrong'?'triangle':'sine';voice.frequency.value=frequency;
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.045,at+.01);gain.gain.exponentialRampToValueAtTime(.0001,at+.12);
      voice.connect(gain);gain.connect(audio.destination);voice.start(at);voice.stop(at+.13);voices.push(voice);
    });
  }
  document.addEventListener('pointerdown',unlock);
  document.addEventListener('keydown',unlock);
  document.addEventListener('click',event=>{
    const button=event.target.closest('#rush-sound');if(!button)return;
    muted=!muted;try {localStorage.setItem('fun:pokerush-muted',muted?'1':'0');}catch {}
    if(muted)silence();else unlock();
    button.textContent=muted?'Som desligado':'Som ligado';button.setAttribute('aria-pressed',String(!muted));
  });
  function suggestions(esc) {
    const input=document.querySelector('#answer'),list=document.querySelector('#rush-suggestions');
    if(!input||!list)return;
    const key=normalize(input.value),matches=key.length>=2?catalog.filter(p=>p.key.includes(key)||p.alias.includes(key)):[];
    list.innerHTML=matches.map(p=>`<li><img src="${esc(p.image)}" alt="" width="40" height="40"><span>${esc(p.name)}</span></li>`).join('');
    list.hidden=!matches.length;
    input.setAttribute('aria-describedby',`rush-answer-help${matches.length?' rush-suggestion-label':''}`);
  }
  function pokedex(state,esc) {
    const panel=document.querySelector('.rush-pokedex');if(!panel)return;
    const caught=new Set(state.pokerush.used_ids||[]),records=new Map(catalog.map(p=>[p.id,p]));
    panel.querySelector('.rush-dex-count').textContent=`${caught.size} / 151`;
    panel.querySelector('.rush-dex-count').setAttribute('aria-label',`${caught.size} de 151 Pokémon acertados`);
    const grid=panel.querySelector('.rush-dex-grid');
    if(!grid.children.length)grid.innerHTML=Array.from({length:151},(_,i)=>`<li data-pokemon-id="${i+1}"></li>`).join('');
    for(const cell of grid.children) {
      const id=Number(cell.dataset.pokemonId),number=String(id).padStart(3,'0'),pokemon=records.get(id),revealed=caught.has(id)&&pokemon;
      const label=revealed?`Nº ${number}: ${pokemon.name}, acertado`:`Nº ${number}: ainda não acertado`;
      if(cell.getAttribute('aria-label')===label)continue;
      cell.classList.toggle('is-caught',Boolean(revealed));cell.setAttribute('aria-label',label);cell.title=label;
      cell.innerHTML=revealed?`<img src="${esc(pokemon.image)}" alt="" width="32" height="32"><span class="rush-dex-check" aria-hidden="true">✓</span>`:`<span>${number}</span>`;
    }
  }
  document.addEventListener('input',event=>{if(current&&document.querySelector('.rush-room')&&event.target.id==='answer')suggestions(current.esc);});
  // As sugestões não são opções selecionáveis. Toque/arrasto mantém o campo e o teclado ativos.
  document.addEventListener('mousedown',event=>{if(event.target.closest('#rush-suggestions'))event.preventDefault();});
  function viewport() {
    const room=document.querySelector('.rush-room');if(!room)return;
    const height=window.visualViewport?.height||innerHeight;
    room.classList.toggle('rush-compact',height<540||height<innerHeight*.75);
  }
  window.addEventListener('resize',()=>{viewport();placeSuggestions();layout();});
  window.visualViewport?.addEventListener('resize',()=>{
    viewport();
    if(document.activeElement?.id==='answer'&&document.querySelector('.rush-room'))document.querySelector('#answer').scrollIntoView({block:'center'});
  });
  function layout() {
    const arena=document.querySelector('.rush-arena');if(!arena)return;
    const seats=[...arena.querySelectorAll('.rush-seat')],compact=!desktop.matches&&arena.clientWidth<400&&seats.length>4&&seats.length<=8,many=desktop.matches?seats.length>4:seats.length>8||compact;
    arena.classList.toggle('rush-many',many);
    arena.classList.toggle('rush-small-grid',compact);
    arena.querySelector('.rush-center').style.top='';
    // Um único diâmetro impede que a mesa retangular estique a roda.
    arena.style.setProperty('--rush-orbit-size',`${Math.min(arena.clientWidth,arena.clientHeight)*.76}px`);
    arena.style.setProperty('--rush-orbit-y','50%');
    if(many) {
      let slots=compact?[[1,1],[2,1],[3,1],[3,2],[3,3],[3,4],[2,4],[1,4],[1,3],[1,2]]:[[1,1],[2,1],[3,1],[4,1],[4,2],[4,3],[4,4],[4,5],[4,6],[3,6],[2,6],[1,6],[1,5],[1,4],[1,3],[1,2]];
      if(desktop.matches) {
        const columns=Math.max(4,Math.ceil((seats.length-4)/2));
        arena.style.setProperty('--rush-columns',String(columns));
        slots=[...Array.from({length:columns},(_,i)=>[i+1,1]),[columns,2],[columns,3],...Array.from({length:columns},(_,i)=>[columns-i,4]),[1,3],[1,2]];
      }
      for(const [i,seat]of seats.entries()) {const slot=slots[Math.round(i*slots.length/seats.length)];seat.style.left='';seat.style.top='';seat.style.gridColumn=String(slot[0]);seat.style.gridRow=String(slot[1]);}
    } else {
      const width=arena.clientWidth,height=arena.clientHeight;
      const seatWidth=Math.max(...seats.map(seat=>seat.offsetWidth),0),seatHeight=Math.max(...seats.map(seat=>seat.offsetHeight),0);
      const feedback=desktop.matches?40:0,centerY=(height-feedback)/2;
      const radius=Math.max(0,Math.min((width-seatWidth)/2-8,(height-seatHeight-feedback)/2-8));
      const radiusX=desktop.matches?radius:width/2-(width<400?42:54);
      const radiusY=desktop.matches?radius:height/2-54;
      if(desktop.matches) {
        arena.querySelector('.rush-center').style.top=`${centerY}px`;
        arena.style.setProperty('--rush-orbit-y',`${centerY}px`);
      }
      for(const [i,seat]of seats.entries()) {
        const angle=2*Math.PI*i/Math.max(2,seats.length)-(desktop.matches&&seats.length===4?3*Math.PI/4:Math.PI/2);
        seat.style.gridColumn='';seat.style.gridRow='';seat.style.left=`${width/2+Math.cos(angle)*radiusX}px`;seat.style.top=`${centerY+Math.sin(angle)*radiusY}px`;
      }
    }
  }
  function results(state,host,canStart,esc) {
    const winners=state.people.filter(p=>state.winners.includes(p.id));
    const title=state.result==='cancelled'?'Partida cancelada, sem vencedor.':winners.length>1?'Vitória compartilhada!':winners[0]?.id===state.you?'Você venceu!':`${esc(winners[0]?.name||'A turma')} venceu!`;
    return `<section class="rush-results"><span class="eyebrow">${state.result==='exhausted'?'Os 151 Pokémon foram usados!':'Fim da partida'}</span><h2>${title}</h2><div class="rush-winners">${winners.map(p=>`<div>${avatar(p,esc)}<strong>${esc(p.name)}</strong><span>${p.score} pontos</span></div>`).join('')}</div><div class="rush-ranking" role="region" aria-label="Placar completo"><table><thead><tr><th scope="col">Jogador</th><th scope="col">Pontos</th><th scope="col">Acertos</th><th scope="col">Maior sequência</th></tr></thead><tbody>${state.people.filter(p=>!p.spectator).map(p=>`<tr class="${p.active?'':'departed'}"><th scope="row">${p.rank?`${p.rank}. `:''}${esc(p.name)}${!p.active?' · Saiu':''}</th><td>${p.score}</td><td>${p.hits}</td><td>×${p.best_streak}</td></tr>`).join('')}</tbody></table></div>${host?`<div class="actions"><button data-action="start" ${canStart?'':'disabled'}>Jogar novamente</button><button class="secondary" data-action="lobby">Voltar à sala</button></div>`:'<p>O anfitrião escolhe quando jogar novamente ou voltar à sala.</p>'}</section>`;
  }
  function render(context) {
    current=context;
    const previousDex=document.querySelector('.rush-pokedex');
    const {main,state,online,esc,status}=context,host=state.host===state.you,me=state.people.find(p=>p.id===state.you);
    const canStart=online&&state.people.filter(p=>p.active&&p.online).length>=2;
    const key=`${state.code}:${state.phase}:${Boolean(me.spectator)}`;
    // O formulário e o próprio nó do input sobrevivem a TODO snapshot durante a partida.
    if(key!==rootKey||!main.querySelector('.rush-room')) {
      observed?.disconnect();rootKey=key;lastRound='';seen=new Set();alertRound='';
      main.innerHTML=`<section class="rush-room workspace"><div class="rush-presence"></div><div class="rush-layout"><section class="rush-table" aria-label="Mesa de PokéRush"><div id="rush-stage"></div><div id="rush-composer"></div></section><section class="rush-sidebar" role="complementary" aria-label="Sala e controles"></section></div><footer class="room-footer"><button class="quiet" data-action="leave">Sair da sala</button><span id="rush-close"></span></footer></section>`;
      if(state.phase!=='results') {
        main.querySelector('#rush-stage').innerHTML=`<div class="rush-caption"><span>${state.phase==='lobby'?'A turma está chegando':'Todos respondem ao mesmo tempo'}</span><span id="rush-used"></span></div>${state.phase==='playing'?'<div class="rush-timer" role="progressbar" aria-label="Reserva de tempo" aria-valuetext="Barra cheia" aria-valuemin="0" aria-valuemax="100"><div id="rush-progress"></div></div>':''}<div class="rush-arena"><div class="rush-orbit" aria-hidden="true"></div><div class="rush-center"></div><ol class="rush-seats" aria-label="Jogadores"></ol></div><div id="rush-lobby-controls"></div>`;
        observed=new ResizeObserver(layout);observed.observe(main.querySelector('.rush-arena'));
        if(state.phase==='playing'&&!me.spectator)main.querySelector('#rush-composer').innerHTML='<div class="rush-compose-bar"><form id="answer-form"><label for="answer">Nome completo do Pokémon</label><div class="answer-row"><input id="answer" maxlength="200" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send" required placeholder="Qual Pokémon tem esses tipos?" aria-describedby="rush-answer-help"><button type="submit" aria-label="Enviar Pokémon">Enviar</button></div></form><p id="rush-answer-help" class="fine">Escreva o nome completo e envie. Sugestões são apenas visuais.</p><p id="rush-answer-status" class="sr-only" role="status"></p></div><div class="rush-suggestion-area"><span id="rush-suggestion-label" class="sr-only">Sugestões de nomes, sem seleção</span><ul id="rush-suggestions" aria-label="Sugestões de Pokémon" hidden></ul><p id="rush-catalog-status" class="fine"></p></div>';
        if(state.phase==='playing'&&me.spectator)main.querySelector('#rush-composer').innerHTML='<p class="rush-spectator" role="status">Você está acompanhando. Jogue na próxima partida.</p>';
      }
    }
    main.querySelector('.rush-sidebar').innerHTML=`<header><span class="eyebrow">POKÉRUSH · SALA ${esc(state.code)}</span><div class="room-title-line"><h1>${esc(state.room_name)}</h1><button id="copy-room-link" class="quiet icon-button" aria-label="Copiar link da sala">↗</button></div><p class="fine">${state.visibility==='public'?'Sala pública':'Só por convite'} · ${state.people.filter(p=>p.active).length}/16 pessoas</p>${host&&state.phase==='lobby'?'<button class="quiet" id="edit-room-name">Alterar nome</button>':''}${status()}<button id="rush-sound" class="quiet" aria-pressed="${!muted}">${muted?'Som desligado':'Som ligado'}</button></header><div class="rush-watchers">${state.people.filter(p=>p.spectator&&p.active).map(p=>`<p ${host&&p.id!==state.you?`data-kick-target="${esc(p.id)}" tabindex="0" role="button" aria-label="Abrir confirmação para remover ${esc(p.name)}"`:''}>${esc(p.name)} · Espectador</p>`).join('')}</div><details class="rush-rules"><summary>Como jogar</summary><p>Use um dos 151 Pokémon de Kanto com exatamente os tipos do centro. Cada Pokémon só vale uma vez na partida.</p><p>O primeiro acerto ganha 50 pontos. Cada acerto seguido da mesma pessoa soma mais 20. Erros não descontam pontos.</p><p>A barra recomeça a cada acerto. Se esvaziar, a partida termina.</p><a href="https://pokeapi.co/" target="_blank" rel="noopener noreferrer">Dados e sprites: PokéAPI</a></details>`;
    const dex=previousDex||document.createElement('section');dex.className='rush-pokedex';dex.setAttribute('aria-labelledby','rush-dex-title');
    if(!previousDex)dex.innerHTML='<div class="rush-dex-heading"><h2 id="rush-dex-title">Pokédex · Kanto</h2><span class="rush-dex-count"></span></div><ol class="rush-dex-grid" role="list" aria-label="Pokémon da primeira geração"></ol>';
    main.querySelector('.rush-sidebar').append(dex);pokedex(state,esc);loadCatalog();
    main.querySelector('.rush-room').dataset.phase=state.phase;
    main.querySelector('#rush-close').innerHTML=host?'<button id="close-room" class="quiet danger-text">Encerrar sala</button>':'';
    main.querySelector('.rush-presence').innerHTML=state.warning?'<div class="presence" role="alert"><p>Confirme sua presença para manter a sala aberta.</p><button data-action="presence">Estou aqui</button></div>':'';
    if(state.phase==='results') {
      main.querySelector('#rush-stage').innerHTML=results(state,host,canStart,esc);
      if(lastPhase==='playing')sound('end');
    } else {
      main.querySelector('#rush-used').textContent=`${state.pokerush.used_count} / 151 usados`;
      const center=main.querySelector('.rush-center');
      if(state.phase==='lobby') {
        center.innerHTML=`<div class="rush-emblem">${icon}</div><h2>Prontos para o rush?</h2><p>Um nome.<br>Os tipos exatos.</p>`;
        main.querySelector('#rush-lobby-controls').innerHTML=host?`<button data-action="start" ${canStart?'':'disabled'}>Iniciar PokéRush</button><p class="fine">É preciso ter pelo menos dois competidores conectados.</p>`:'<p>O anfitrião inicia a partida.</p>';
      } else if(lastRound!==state.round_id) {
        if(!center.querySelector('.rush-types'))center.innerHTML='<span class="eyebrow">Quem tem esses tipos?</span><h2 class="sr-only">Tipos do desafio</h2><div class="rush-types" aria-live="polite" aria-atomic="true"></div>';
        center.querySelector('.rush-types').innerHTML=badges(state.pokerush.types,esc);
        lastRound=state.round_id;
      }
      const roster=state.people.filter(p=>state.phase==='lobby'?p.active:!p.spectator),seats=main.querySelector('.rush-seats');
      for(const node of [...seats.children])if(!roster.some(p=>`rush-seat-${p.id}`===node.id))node.remove();
      for(const person of roster) {
        let seat=document.getElementById(`rush-seat-${person.id}`);
        if(!seat) {seat=document.createElement('li');seat.id=`rush-seat-${person.id}`;seat.className='rush-seat';seats.append(seat);}
        seat.classList.toggle('departed',!person.active);seat.classList.toggle('rush-you',person.id===state.you);
        if(host&&person.active&&person.id!==state.you) {seat.dataset.kickTarget=person.id;seat.tabIndex=0;seat.setAttribute('role','button');seat.setAttribute('aria-label',`Abrir confirmação para remover ${person.name}`);}
        else {delete seat.dataset.kickTarget;seat.removeAttribute('tabindex');seat.removeAttribute('role');seat.removeAttribute('aria-label');}
        const s=person.success,html=`${avatar(person,esc)}<strong title="${esc(person.name)}">${esc(person.name)}${person.id===state.you?'<span class="sr-only"> (você)</span>':''}</strong><small>${!person.active?'Saiu':!person.online?'Reconectando':person.host?'Anfitrião':''}</small>${state.phase==='playing'?`<span class="rush-score">${person.score} <span class="sr-only">pontos</span>${person.streak>=2?`<b class="rush-streak" aria-label="${person.streak} acertos consecutivos">🔥 ×${person.streak}</b>`:''}</span>`:''}${s?`<div class="rush-success" data-until="${s.until}" data-success-id="${esc(s.id)}"><span class="rush-points">+${s.points}</span><img src="${esc(s.pokemon.image)}" width="64" height="64" alt=""><strong>${esc(s.pokemon.name)}</strong><span class="rush-success-types">${badges(s.pokemon.types,esc)}</span></div>`:''}`;
        if(seat.dataset.view!==html) {seat.innerHTML=html;seat.dataset.view=html;}
        if(s&&!seen.has(s.id)) {seen.add(s.id);if(state.server_now-s.at<1)sound('correct');}
      }
      const input=main.querySelector('#answer');if(input) {input.disabled=!online;main.querySelector('#answer-form button').disabled=!online;}
      layout();loadCatalog();
      const composer=main.querySelector('.rush-compose-bar');
      if(composer&&!composer.querySelector('.rush-input-context')) {
        const context=document.createElement('div');context.className='rush-input-context';context.setAttribute('aria-hidden','true');
        context.innerHTML='<div class="rush-input-types"></div><div class="rush-input-timer"><div class="rush-mini-progress"></div></div>';
        composer.prepend(context);
      }
      const inputTypes=main.querySelector('.rush-input-types');
      if(inputTypes)inputTypes.innerHTML=badges(state.pokerush.types,esc);
    }
    placeSuggestions();layout();viewport();lastPhase=state.phase;timer(state,state.server_now);
  }
  function timer(state,now) {
    if(state.phase!=='playing')return;
    const left=Math.max(0,state.deadline-now),ratio=Math.min(1,left/30),progress=document.querySelector('#rush-progress');
    if(progress) {
      progress.style.width=`${ratio*100}%`;progress.dataset.level=ratio>.5?'green':ratio>.2?'yellow':'red';
      progress.parentElement.setAttribute('aria-valuetext',ratio>.5?'Barra alta':ratio>.2?'Barra pela metade':'Tempo acabando');
    }
    const mini=document.querySelector('.rush-mini-progress');
    if(mini) {mini.style.width=`${ratio*100}%`;mini.dataset.level=ratio>.5?'green':ratio>.2?'yellow':'red';}
    for(const success of document.querySelectorAll('.rush-success'))if(Number(success.dataset.until)<=now)success.hidden=true;
    if(left>0&&left<=5&&alertRound!==state.round_id) {alertRound=state.round_id;sound('alert');}
    if(!document.querySelector('#answer'))return;
    const blocked=state.cooldown>now;
    document.querySelector('#answer-form button').disabled=!current.online||blocked;
    document.querySelector('.rush-compose-bar').classList.toggle('rush-blocked',blocked);
  }
  function ack(message,event) {
    if(!current||message.ignored)return;
    const input=document.querySelector('#answer');
    if(message.correct&&input?.value===event.answer) {input.value='';suggestions(current.esc);}
    if(message.correct) {const status=document.querySelector('#rush-answer-status');if(status)status.textContent=`Acertou! +${message.points} pontos.`;}
    if(message.correct===false) {
      current.state.cooldown=message.retry_at;
      sound('wrong');
      const bar=document.querySelector('.rush-compose-bar');
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)bar?.animate([{opacity:1},{opacity:.55},{opacity:1}],{duration:180});
      const status=document.querySelector('#rush-answer-status');if(status)status.textContent='';
      if(status)requestAnimationFrame(()=>{status.textContent='Tente novamente.';});
    }
  }
  window.PokeRush={card,portal,render,timer,ack};
})();
