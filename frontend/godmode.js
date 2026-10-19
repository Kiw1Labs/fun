const byId = id => document.getElementById(id);
const labels = {lobby:'Lobby', question:'Em partida', reveal:'Revelação', results:'Resultados', public:'Pública', private:'Privada', easy:'Fácil', medium:'Médio', hard:'Difícil', image:'Imagem', text:'Texto', active:'Ativa', draft:'Rascunho', review:'Em revisão', inactive:'Inativa'};
let questions = [];
let authorization = '';

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = value == null || value === '' ? '—' : String(value);
  row.append(td);
}

function renderRooms(rooms) {
  byId('room-count').textContent = String(rooms.length);
  const body = byId('rooms'); body.replaceChildren();
  if (!rooms.length) {
    const row = body.insertRow(); const td = row.insertCell(); td.colSpan = 5; td.textContent = 'Nenhuma sala aberta.'; return;
  }
  for (const room of rooms) {
    const row = body.insertRow();
    cell(row, room.code); cell(row, room.name); cell(row, labels[room.visibility] || room.visibility);
    cell(row, labels[room.phase] || room.phase); cell(row, room.players);
  }
}

function renderQuestions() {
  const query = byId('question-filter').value.trim().toLocaleLowerCase('pt-BR');
  const filtered = questions.filter(q => [q.id,q.category,q.subcategory,q.prompt,q.answer,...q.aliases].join(' ').toLocaleLowerCase('pt-BR').includes(query));
  byId('question-count').textContent = query ? `${filtered.length} / ${questions.length}` : String(questions.length);
  const body = byId('questions'); body.replaceChildren();
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
