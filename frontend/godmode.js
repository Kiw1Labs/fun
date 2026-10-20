const byId = id => document.getElementById(id);
const labels = {lobby:'Lobby', question:'Em partida', reveal:'Revelação', results:'Resultados', public:'Pública', private:'Privada', easy:'Fácil', medium:'Médio', hard:'Difícil', image:'Imagem', text:'Texto', active:'Ativa', draft:'Rascunho', review:'Em revisão', inactive:'Inativa'};
let questions = [];
let authorization = '';

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

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = value == null || value === '' ? '—' : String(value);
  row.append(td);
}

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
  for (const name of ['questions', 'rooms']) {
    const selected = view === name;
    const button = byId(`${name}-option`);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.option-state').textContent = selected ? 'Selecionado ✓' : 'Abrir';
    byId(`${name}-panel`).hidden = !selected;
  }
}

function renderQuestions() {
  const query = byId('question-filter').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = questions.filter(q => [q.id,q.category,q.subcategory,q.prompt,q.answer,...q.aliases].join(' ').toLocaleLowerCase('pt-BR').includes(query));
  byId('question-count').textContent = query ? `${filtered.length} / ${questions.length}` : String(questions.length);
  const body = byId('questions'); body.replaceChildren();
  body.closest('.table-wrap').classList.toggle('empty', !filtered.length);
  if (!filtered.length) {
    const row = body.insertRow(); const td = row.insertCell(); td.colSpan = 9; td.textContent = 'Nenhuma pergunta encontrada.'; return;
  }
  for (const q of filtered) {
    const row = body.insertRow();
    cell(row,q.id); cell(row,[q.category,q.subcategory].filter(Boolean).join(' · '));
    cell(row,labels[q.difficulty] || q.difficulty); cell(row,labels[q.kind] || q.kind);
    cell(row,q.prompt); cell(row,q.answer); cell(row,(q.aliases || []).join(', ')); cell(row,q.image);
    const status = document.createElement('td');
    const badge = document.createElement('span'); badge.className = `badge ${q.status}`;
    badge.textContent = labels[q.status] || q.status; status.append(badge); row.append(status);
  }
}

function showLogin(message = '') {
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

async function request(path) {
  return fetch(path, {cache:'no-store', headers:{Authorization:authorization}});
}

async function refresh() {
  byId('notice').textContent = 'Atualizando dados…';
  try {
    const [roomResponse, questionResponse] = await Promise.all([
      request('/api/godmode/rooms'), request('/api/godmode/questions')
    ]);
    if (roomResponse.status === 401 || questionResponse.status === 401) { showLogin('Sua sessão expirou. Entre novamente.'); return; }
    if (roomResponse.status === 429 || questionResponse.status === 429) throw new Error('Muitas tentativas. Aguarde um minuto e tente novamente.');
    if (!roomResponse.ok || !questionResponse.ok) throw new Error('Não foi possível consultar os dados administrativos.');
    const roomData = await roomResponse.json();
    const questionData = await questionResponse.json();
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
byId('refresh').addEventListener('click', refresh);
byId('question-filter').addEventListener('input', renderQuestions);
byId('questions-option').addEventListener('click', () => selectView('questions'));
byId('rooms-option').addEventListener('click', () => { selectView('rooms'); refresh(); });
