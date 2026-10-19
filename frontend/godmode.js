const byId = id => document.getElementById(id);
const labels = {lobby:'Lobby', question:'Em partida', reveal:'Revelação', results:'Resultados', public:'Pública', private:'Privada', easy:'Fácil', medium:'Médio', hard:'Difícil', image:'Imagem', text:'Texto', active:'Ativa', draft:'Rascunho', review:'Em revisão', inactive:'Inativa'};
let questions = [];

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

async function refresh() {
  byId('notice').textContent = 'Atualizando…';
  try {
    const [roomResponse, questionResponse] = await Promise.all([
      fetch('/api/godmode/rooms', {cache:'no-store'}), fetch('/api/godmode/questions', {cache:'no-store'})
    ]);
    if (roomResponse.status === 401 || questionResponse.status === 401) { byId('notice').textContent = 'Autenticação necessária. Recarregue a página e informe usuário e senha.'; return; }
    if (!roomResponse.ok || !questionResponse.ok) throw new Error('Não foi possível consultar os dados administrativos.');
    const roomData = await roomResponse.json();
    const questionData = await questionResponse.json();
    questions = questionData.questions;
    renderRooms(roomData.rooms); renderQuestions();
    byId('notice').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}.`;
  } catch (error) { byId('notice').textContent = error.message || 'Falha ao carregar os dados.'; }
}

byId('refresh').addEventListener('click', refresh);
byId('question-filter').addEventListener('input', renderQuestions);
refresh();
