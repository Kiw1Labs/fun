const byId = id => document.getElementById(id);
const labels = {lobby:'Lobby', question:'Em partida', reveal:'Revelação', results:'Resultados', public:'Pública', private:'Privada', easy:'Fácil', medium:'Médio', hard:'Difícil', image:'Imagem', text:'Texto', active:'Ativa', draft:'Rascunho', review:'Em revisão', inactive:'Inativa'};
let questions = [];
let authorization = '';
let activeQuestionId = null;
let questionTrigger = null;
let activeSubmission = null, submissionImageURL = '', moderationBusy = false;
let submissionImageRequest = 0;
let submissionPage = 1;

const mobileLayout = matchMedia('(max-width: 760px)');
function setMenu(open, restoreFocus = false) {
  open = open && mobileLayout.matches;
  byId('sidebar').classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  byId('menu-backdrop').hidden = !open;
  byId('menu').setAttribute('aria-expanded', String(open));
  byId('main').inert = open;
  if (restoreFocus) byId('menu').focus();
}
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  const button = byId('sidebar-toggle');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? 'Expandir navegação' : 'Recolher navegação');
  button.title = button.getAttribute('aria-label');
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  byId('theme-label').textContent = theme === 'light' ? 'claro' : 'escuro';
}
let savedTheme;
try { savedTheme = localStorage.getItem('fun:theme'); } catch {}
applyTheme(savedTheme);
byId('theme').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('fun:theme', theme); } catch {}
});
window.addEventListener('storage', event => {
  if (event.key === 'fun:theme') applyTheme(event.newValue);
});
byId('menu').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
byId('menu-backdrop').addEventListener('click', () => setMenu(false, true));
byId('sidebar-toggle').addEventListener('click', event => {
  event.stopPropagation();
  setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
});
byId('sidebar').addEventListener('click', () => {
  if (document.body.classList.contains('sidebar-collapsed')) setSidebarCollapsed(false);
});
mobileLayout.addEventListener('change', () => setMenu(false));
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('menu-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setMenu(false, true); }
  if (event.key === 'Tab') {
    const controls = [byId('menu'), ...byId('sidebar').querySelectorAll('a[href], button')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

function renderRooms(rooms) {
  byId('room-count').textContent = String(rooms.length);
  const body = byId('rooms'); body.replaceChildren();
  if (!rooms.length) {
    const message = document.createElement('p'); message.className = 'empty-message';
    message.textContent = 'Nenhuma sala aberta.'; body.append(message); return;
  }
  for (const room of rooms) {
    const card = document.createElement('article'); card.className = 'admin-room';
    const header = document.createElement('header'); header.className = 'room-heading';
    const heading = document.createElement('div');
    const name = document.createElement('h3'); name.textContent = room.name;
    const meta = document.createElement('p'); meta.className = 'room-meta';
    meta.textContent = `${room.code} · ${labels[room.visibility] || room.visibility} · ${labels[room.phase] || room.phase}`;
    heading.append(name, meta);
    const count = document.createElement('span'); count.className = 'count';
    count.textContent = `${room.players} ${room.players === 1 ? 'pessoa' : 'pessoas'}`;
    header.append(heading, count); card.append(header);
    if (/^[A-Z]{4}$/.test(room.code)) {
      const link = document.createElement('a'); link.className = 'room-link';
      link.href = new URL(`/${room.code}`, location.origin).href;
      link.textContent = link.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Abrir sala ${room.name}`); card.append(link);
    }
    const peopleHeading = document.createElement('h4'); peopleHeading.className = 'people-heading';
    peopleHeading.textContent = 'Participantes'; card.append(peopleHeading);
    if (Array.isArray(room.people) && room.people.length) {
      const people = document.createElement('ul'); people.className = 'room-people';
      people.setAttribute('aria-label', `Participantes de ${room.name}`);
      for (const person of room.people) {
        const item = document.createElement('li');
        const copy = document.createElement('div'); copy.className = 'member-copy';
        const personName = document.createElement('strong'); personName.textContent = person.name;
        const status = document.createElement('small'); status.textContent = person.online ? 'Conectado' : 'Desconectado';
        copy.append(personName, status); item.append(copy);
        if (person.host) {
          const badge = document.createElement('span'); badge.className = 'host-badge';
          badge.textContent = 'Anfitrião'; item.append(badge);
        }
        people.append(item);
      }
      card.append(people);
    } else {
      const message = document.createElement('p'); message.className = 'section-copy';
      message.textContent = Array.isArray(room.people) ? 'Nenhum participante na sala.' : 'Atualize para consultar os participantes.';
      card.append(message);
    }
    body.append(card);
  }
}

function selectView(view) {
  if (view !== 'questions') closeQuestion();
  for (const name of ['questions', 'rooms', 'submissions']) {
    const selected = view === name;
    const button = byId(`${name}-option`);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.option-state').textContent = selected ? 'Selecionado ✓' : 'Abrir';
    byId(`${name}-panel`).hidden = !selected;
  }
}

function questionMedia(question, large = false) {
  const media = document.createElement('span'); media.className = 'question-media';
  const placeholder = document.createElement('span'); placeholder.className = 'question-placeholder';
  const symbol = document.createElement('span'); symbol.className = 'question-placeholder-symbol';
  symbol.textContent = question.kind === 'image' ? '?' : 'Aa'; symbol.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('span');
  caption.textContent = question.kind === 'image' ? 'Imagem indisponível' : 'Questão de texto';
  placeholder.append(symbol, caption); media.append(placeholder);
  if (question.kind === 'image' && question.image) {
    try {
      const url = new URL(question.image, location.origin);
      if (url.origin === location.origin && url.pathname.startsWith('/media/')) {
        const image = document.createElement('img');
        image.alt = large ? 'Imagem da questão' : '';
        image.loading = large ? 'eager' : 'lazy'; image.decoding = 'async';
        placeholder.hidden = true;
        image.addEventListener('error', () => { image.remove(); placeholder.hidden = false; }, {once:true});
        image.src = url.href; media.append(image);
      }
    } catch { /* Mídia inválida mantém a indicação de imagem indisponível. */ }
  }
  return media;
}

function categoriesOf(question) {
  return Array.isArray(question.categories) && question.categories.length ? question.categories : question.category ? [question.category] : [];
}

function renderReviewCategories(categories) {
  const container = byId('submission-categories');
  if (JSON.stringify([...container.querySelectorAll('input')].map(input => input.value)) === JSON.stringify(categories)) return;
  container.replaceChildren();
  for (const category of categories) {
    const label = document.createElement('label'); label.className = 'category-choice';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'categories'; checkbox.value = category;
    const text = document.createElement('span'); text.textContent = category;
    label.append(checkbox, text); container.append(label);
  }
}

function renderQuestionDetails(question) {
  byId('submission-review').hidden = !activeSubmission;
  const contributed = !!(question.submission_id || activeSubmission);
  byId('question-detail-origin').hidden = !contributed;
  byId('question-detail-origin').textContent = contributed ? `Contribuição · ${question.submitted_by || question.nickname || 'Anônima'}` : '';
  byId('question-detail-id').textContent = question.id;
  byId('question-detail-prompt').textContent = question.prompt || 'Sem enunciado';
  byId('question-detail-reference').textContent = question.reference || '';
  byId('question-detail-reference').hidden = !question.reference;
  byId('question-detail-media').replaceChildren();
  byId('question-detail-media').hidden = question.kind !== 'image';
  if (question.kind === 'image') byId('question-detail-media').append(questionMedia(question, true));
  byId('question-detail-answer').textContent = question.answer || '—';
  const aliases = byId('question-detail-aliases'); aliases.replaceChildren();
  for (const alias of question.aliases || []) {
    const item = document.createElement('li'); item.textContent = alias; aliases.append(item);
  }
  aliases.hidden = !aliases.childElementCount;
  byId('question-no-aliases').hidden = !!aliases.childElementCount;
  byId('question-detail-category-label').textContent = activeSubmission ? 'Categorias sugeridas' : 'Categorias';
  byId('question-detail-category').textContent = (activeSubmission ? question.category : categoriesOf(question).join(' · ')) || '—';
  for (const field of ['subcategory', 'difficulty', 'kind', 'status']) {
    const value = question[field];
    byId(`question-detail-${field}`).textContent = (['difficulty', 'kind', 'status'].includes(field) ? labels[value] : '') || value || '—';
  }
}

function openQuestion(question, trigger) {
  activeQuestionId = question.id; questionTrigger = trigger;
  renderQuestionDetails(question);
  byId('question-dialog').showModal();
  document.body.classList.add('question-open');
}

function closeQuestion() {
  if (moderationBusy) return;
  if (byId('question-dialog').open) byId('question-dialog').close();
}

byId('question-close').addEventListener('click', closeQuestion);
byId('question-dialog').addEventListener('cancel', event => { if (moderationBusy) event.preventDefault(); });
byId('question-dialog').addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeQuestion();
});
byId('question-dialog').addEventListener('close', () => {
  document.body.classList.remove('question-open');
  if (!byId('dashboard').hidden && !byId('questions-panel').hidden) {
    const trigger = questionTrigger?.isConnected ? questionTrigger : [...byId('questions').querySelectorAll('.question-card')].find(card => card.dataset.questionId === activeQuestionId);
    (trigger || byId('question-filter')).focus({preventScroll:true});
  }
  if (activeSubmission && !byId('dashboard').hidden && !byId('submissions-panel').hidden) (questionTrigger?.isConnected ? questionTrigger : byId('submissions-title')).focus({preventScroll:true});
  activeSubmission = null; byId('submission-review').hidden = true;
  submissionImageRequest++;
  if (submissionImageURL) URL.revokeObjectURL(submissionImageURL); submissionImageURL = '';
  activeQuestionId = null; questionTrigger = null;
});

function renderQuestions() {
  const query = byId('question-filter').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = questions.filter(q => [q.id,...categoriesOf(q),q.subcategory,q.prompt,q.reference,q.answer,...(q.aliases || [])].join(' ').toLocaleLowerCase('pt-BR').includes(query));
  byId('question-count').textContent = query ? `${filtered.length} / ${questions.length}` : String(questions.length);
  const body = byId('questions'); body.replaceChildren();
  if (!filtered.length) {
    const message = document.createElement('p'); message.className = 'empty-message';
    message.textContent = 'Nenhuma pergunta encontrada.'; body.append(message);
  }
  for (const q of filtered) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'question-card';
    card.dataset.questionId = q.id;
    card.setAttribute('aria-label', `Ver detalhes: ${q.prompt || 'Sem enunciado'}`);
    card.setAttribute('aria-haspopup', 'dialog'); card.setAttribute('aria-controls', 'question-dialog');
    const copy = document.createElement('span'); copy.className = 'question-card-copy';
    const category = document.createElement('span'); category.className = 'question-category';
    category.textContent = categoriesOf(q).join(' · ') || 'Sem categoria';
    const prompt = document.createElement('span'); prompt.className = 'question-card-prompt';
    prompt.textContent = q.prompt || 'Sem enunciado';
    const meta = document.createElement('span'); meta.className = 'question-card-meta';
    const difficulty = document.createElement('span'); difficulty.textContent = labels[q.difficulty] || q.difficulty || '—';
    const badge = document.createElement('span'); badge.className = 'badge'; badge.classList.toggle('active', q.status === 'active');
    badge.textContent = labels[q.status] || q.status || '—'; meta.append(difficulty, badge);
    copy.append(category, prompt);
    if (q.submission_id) { const origin = document.createElement('span'); origin.className = 'badge'; origin.textContent = 'Contribuição'; copy.append(origin); }
    copy.append(meta); card.append(questionMedia(q), copy);
    card.addEventListener('click', () => openQuestion(q, card)); body.append(card);
  }
  if (byId('question-dialog').open && !activeSubmission) {
    const active = questions.find(question => question.id === activeQuestionId);
    if (active) renderQuestionDetails(active); else closeQuestion();
  }
}

function showLogin(message = '') {
  closeQuestion();
  authorization = '';
  questions = [];
  selectView('questions');
  byId('question-filter').value = '';
  byId('dashboard').hidden = true;
  byId('login-view').hidden = false;
  byId('login-error').textContent = message;
  byId('login-error').hidden = !message;
  byId('login-password').value = '';
  byId('login-username').focus();
}

async function request(path, options = {}) {
  return fetch(path, {...options, cache:'no-store', headers:{...options.headers, Authorization:authorization}});
}

async function openSubmission(submission, trigger) {
  const imageRequest = ++submissionImageRequest;
  activeSubmission = submission;
  byId('submission-review').reset(); byId('submission-review-error').hidden = true;
  openQuestion({...submission, status:'Aguardando análise', aliases:[]}, trigger);
  if (submission.kind !== 'image') return;
  const media = byId('question-detail-media'); media.replaceChildren();
  const loading = document.createElement('p'); loading.className = 'section-copy'; loading.textContent = 'Carregando imagem…'; media.append(loading);
  try {
    const response = await request(`/api/godmode/submissions/${encodeURIComponent(submission.id)}/image`);
    if (response.status === 401) { showLogin('Sua sessão expirou. Entre novamente.'); return; }
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    if (imageRequest !== submissionImageRequest || activeSubmission?.id !== submission.id || !byId('question-dialog').open) return;
    submissionImageURL = URL.createObjectURL(blob);
    const container = document.createElement('span'); container.className = 'question-media';
    const image = document.createElement('img'); image.alt = 'Imagem da contribuição'; image.src = submissionImageURL;
    image.addEventListener('error', () => { container.replaceChildren(); loading.textContent = 'Imagem indisponível.'; container.append(loading); }, {once:true});
    container.append(image); media.replaceChildren(container);
  } catch { if (activeSubmission?.id === submission.id) loading.textContent = 'Não foi possível carregar a imagem. Feche e abra a contribuição para tentar novamente.'; }
}

async function loadSubmissions() {
  byId('submission-notice').textContent = 'Carregando contribuições…';
  try {
    const response = await request(`/api/godmode/submissions?page=${submissionPage}`);
    if (response.status === 401) { showLogin('Sua sessão expirou. Entre novamente.'); return; }
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Falha ao consultar contribuições.');
    if (submissionPage > 1 && !result.submissions.length) { submissionPage--; await loadSubmissions(); return; }
    byId('submission-count').textContent = result.total;
    const grid = byId('submissions'); grid.replaceChildren();
    for (const submission of result.submissions) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'question-card submission-card'; card.dataset.questionId = submission.id;
      card.setAttribute('aria-haspopup', 'dialog'); card.setAttribute('aria-label', `Revisar contribuição: ${submission.prompt}`);
      const copy = document.createElement('span'); copy.className = 'question-card-copy';
      for (const [name, value] of [['question-category', submission.category], ['question-card-prompt', submission.prompt], ['question-category', submission.nickname || 'Anônima'], ['badge', 'Contribuição'], ['question-category', submission.kind === 'image' ? 'Imagem anexada' : 'Questão de texto']]) {
        const text = document.createElement('span'); text.className = name; text.textContent = value; copy.append(text);
      }
      card.append(copy); card.addEventListener('click', () => openSubmission(submission, card)); grid.append(card);
    }
    if (!result.submissions.length) { const message = document.createElement('p'); message.className = 'empty-message'; message.textContent = 'Nenhuma contribuição aguardando análise.'; grid.append(message); }
    byId('submissions-page').textContent = `Página ${submissionPage} de ${Math.max(1, Math.ceil(result.total / 20))}`;
    byId('submissions-previous').disabled = submissionPage <= 1; byId('submissions-next').disabled = submissionPage * 20 >= result.total;
    byId('submission-notice').textContent = '';
  } catch (error) { byId('submission-notice').textContent = error.message || 'Falha de conexão.'; }
}

async function moderateSubmission(action) {
  if (moderationBusy || !activeSubmission) return;
  const payload = {action};
  if (action === 'approve') {
    payload.categories = [...byId('submission-categories').querySelectorAll('input:checked')].map(input => input.value);
    if (!payload.categories.length) {
      byId('submission-review-error').textContent = 'Selecione uma ou mais categorias antes de aprovar.';
      byId('submission-review-error').hidden = false;
      byId('submission-categories').querySelector('input')?.focus();
      return;
    }
    payload.difficulty = byId('submission-difficulty').value; payload.rights = byId('submission-rights').value.trim();
  }
  moderationBusy = true; byId('submission-review-error').hidden = true;
  for (const control of byId('submission-review').elements) control.disabled = true;
  byId('question-close').disabled = true;
  try {
    const response = await request(`/api/godmode/submissions/${encodeURIComponent(activeSubmission.id)}/review`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível revisar a contribuição.');
    moderationBusy = false; closeQuestion();
    await Promise.all([refresh(), loadSubmissions()]);
    byId('submission-notice').textContent = action === 'approve' ? 'Questão aprovada e adicionada ao acervo.' : 'Questão recusada. Ela não foi adicionada ao jogo.';
  } catch (error) { byId('submission-review-error').textContent = error instanceof TypeError ? 'Verifique sua conexão e tente novamente.' : error.message; byId('submission-review-error').hidden = false; }
  finally { moderationBusy = false; byId('question-close').disabled = false; for (const control of byId('submission-review').elements) control.disabled = false; }
}
byId('submission-review').addEventListener('submit', event => { event.preventDefault(); moderateSubmission('approve'); });
byId('submission-reject').addEventListener('click', () => moderateSubmission('reject'));
byId('submissions-previous').addEventListener('click', () => { submissionPage--; loadSubmissions(); });
byId('submissions-next').addEventListener('click', () => { submissionPage++; loadSubmissions(); });

async function refresh() {
  byId('notice').textContent = 'Atualizando dados…';
  try {
    const [roomResponse, questionResponse, categoryResponse] = await Promise.all([
      request('/api/godmode/rooms'), request('/api/godmode/questions'), request('/api/question-submissions/categories')
    ]);
    if (roomResponse.status === 401 || questionResponse.status === 401) { showLogin('Sua sessão expirou. Entre novamente.'); return; }
    if (roomResponse.status === 429 || questionResponse.status === 429) throw new Error('Muitas tentativas. Aguarde um minuto e tente novamente.');
    if (!roomResponse.ok || !questionResponse.ok || !categoryResponse.ok) throw new Error('Não foi possível consultar os dados administrativos.');
    const roomData = await roomResponse.json();
    const questionData = await questionResponse.json();
    const categoryData = await categoryResponse.json();
    renderReviewCategories(categoryData.categories);
    questions = questionData.questions;
    renderRooms(roomData.rooms); renderQuestions();
    byId('notice').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}.`;
  } catch (error) { byId('notice').textContent = error.message || 'Falha ao carregar os dados.'; }
}

byId('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const username = byId('login-username').value;
  const password = byId('login-password').value;
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  authorization = `Basic ${btoa(String.fromCharCode(...bytes))}`;
  byId('login-error').hidden = true;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await request('/api/godmode/rooms');
    if (response.status === 401) { showLogin('Usuário ou senha incorretos. Confira os dados e tente novamente.'); return; }
    if (response.status === 429) { showLogin('Muitas tentativas. Aguarde um minuto e tente novamente.'); return; }
    if (!response.ok) throw new Error('Não foi possível entrar. Tente novamente em instantes.');
    byId('login-password').value = '';
    byId('login-view').hidden = true;
    byId('dashboard').hidden = false;
    selectView('questions');
    byId('dashboard-title').focus({preventScroll:true});
    window.scrollTo(0, 0);
    await refresh();
  } catch (error) {
    authorization = '';
    byId('login-error').textContent = error.message || 'Falha de conexão. Tente novamente.';
    byId('login-error').hidden = false;
  } finally { button.disabled = false; }
});

byId('logout').addEventListener('click', () => showLogin());
byId('refresh').addEventListener('click', () => { refresh(); if (!byId('submissions-panel').hidden) loadSubmissions(); });
byId('question-filter').addEventListener('input', renderQuestions);
byId('questions-option').addEventListener('click', () => selectView('questions'));
byId('rooms-option').addEventListener('click', () => { selectView('rooms'); refresh(); });
byId('submissions-option').addEventListener('click', () => { selectView('submissions'); loadSubmissions(); });
