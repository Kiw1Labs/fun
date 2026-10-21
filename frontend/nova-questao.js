const byId = id => document.getElementById(id);
const mobile = matchMedia('(max-width: 760px)');
function setMenu(open, restore = false) {
  open = open && mobile.matches;
  byId('sidebar').classList.toggle('open', open); document.body.classList.toggle('menu-open', open);
  byId('menu-backdrop').hidden = !open; byId('menu').setAttribute('aria-expanded', String(open)); byId('main').inert = open;
  if (restore) byId('menu').focus();
}
function theme(value) {
  document.documentElement.dataset.theme = value === 'light' ? 'light' : 'dark';
  byId('theme-label').textContent = value === 'light' ? 'claro' : 'escuro';
}
try { theme(localStorage.getItem('fun:theme')); } catch { theme('dark'); }
byId('theme').addEventListener('click', () => {
  const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; theme(value);
  try { localStorage.setItem('fun:theme', value); } catch {}
});
window.addEventListener('storage', event => { if (event.key === 'fun:theme') theme(event.newValue); });
byId('menu').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
byId('menu-backdrop').addEventListener('click', () => setMenu(false, true));
mobile.addEventListener('change', () => setMenu(false));
byId('sidebar-toggle').addEventListener('click', event => {
  event.stopPropagation(); const collapsed = document.body.classList.toggle('sidebar-collapsed');
  event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
  event.currentTarget.setAttribute('aria-label', collapsed ? 'Expandir navegação' : 'Recolher navegação');
});
byId('sidebar').addEventListener('click', () => {
  if (document.body.classList.contains('sidebar-collapsed')) {
    document.body.classList.remove('sidebar-collapsed'); byId('sidebar-toggle').setAttribute('aria-expanded', 'true');
    byId('sidebar-toggle').setAttribute('aria-label', 'Recolher navegação');
  }
});
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

let image = null, previewURL = '', requestId = crypto.randomUUID(), busy = false, preparing = false;
let selectedFormat = 'image';
function error(message = '') { byId('contribution-error').textContent = message; byId('contribution-error').hidden = !message; }
function updateSubmit() { byId('contribution-submit').disabled = busy || preparing; }
function selectFormat(format, focus = false) {
  if (busy) return;
  if (selectedFormat !== format) { requestId = crypto.randomUUID(); error(); }
  selectedFormat = format;
  for (const name of ['image', 'text']) {
    const selected = name === format, tab = byId(`${name}-tab`);
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    byId(`${name}-panel`).hidden = !selected;
  }
  byId('contribution-reference').disabled = format !== 'text'; byId('contribution-reference').required = format === 'text';
  byId('contribution-image').disabled = format !== 'image' || preparing;
  byId('contribution-image').setAttribute('aria-required', String(format === 'image'));
  byId('choose-image').disabled = format !== 'image' || preparing;
  byId('remove-image').disabled = format !== 'image' || preparing;
  if (focus) byId(`${format}-tab`).focus();
}
for (const format of ['image', 'text']) byId(`${format}-tab`).addEventListener('click', () => selectFormat(format, true));
document.querySelector('.format-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  selectFormat(event.key === 'Home' ? 'image' : event.key === 'End' ? 'text' : selectedFormat === 'image' ? 'text' : 'image', true);
});
function clearImage() {
  image = null; if (previewURL) URL.revokeObjectURL(previewURL); previewURL = '';
  byId('preview-image').removeAttribute('src'); byId('image-preview').hidden = true; byId('contribution-image').value = '';
  byId('image-filename').textContent = 'Nenhuma imagem selecionada';
}
byId('choose-image').addEventListener('click', () => byId('contribution-image').click());
byId('remove-image').addEventListener('click', () => { clearImage(); requestId = crypto.randomUUID(); });
byId('contribution-image').addEventListener('change', async event => {
  const file = event.currentTarget.files[0]; clearImage(); if (!file) return;
  preparing = true; event.currentTarget.disabled = true; updateSubmit(); error();
  let bitmap;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('Escolha uma foto JPG, PNG ou WebP de até 12 MB.');
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const quality of [.82, .65, .5]) { blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)); if (blob && blob.size <= 512 * 1024) break; }
    if (!blob || blob.size > 512 * 1024) throw new Error('Não foi possível reduzir a imagem. Escolha outra foto.');
    const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    image = btoa(binary); previewURL = URL.createObjectURL(blob); byId('preview-image').src = previewURL; byId('image-preview').hidden = false;
    byId('image-filename').textContent = file.name;
    requestId = crypto.randomUUID();
  } catch (failure) { clearImage(); error(failure.message || 'Não foi possível preparar a imagem.'); }
  finally { bitmap?.close(); preparing = false; selectFormat(selectedFormat); updateSubmit(); }
});
byId('contribution-form').addEventListener('input', () => { requestId = crypto.randomUUID(); });
byId('contribution-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || preparing) return;
  const payload = {request_id:requestId, image:selectedFormat === 'image' ? image : null,
    reference:selectedFormat === 'text' ? byId('contribution-reference').value.trim() : ''};
  for (const field of ['nickname', 'prompt', 'answer', 'category']) payload[field] = byId(`contribution-${field}`).value.trim();
  if (!payload.prompt || !payload.answer) { error('Preencha o título e a resposta.'); return; }
  if (!payload.category) { error('Escreva as categorias sugeridas.'); byId('contribution-category').focus(); return; }
  if (selectedFormat === 'image' && !image) { error('Adicione a imagem da pergunta.'); byId('choose-image').focus(); return; }
  if (selectedFormat === 'text' && !payload.reference) { error('Preencha o texto de referência.'); byId('contribution-reference').focus(); return; }
  busy = true; updateSubmit(); error(); byId('contribution-submit').textContent = 'Enviando…';
  for (const control of event.currentTarget.elements) control.disabled = true;
  try {
    const response = await fetch('/api/question-submissions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível enviar. Tente novamente.');
    byId('contribution-form').hidden = true; byId('contribution-success').hidden = false; byId('success-title').focus();
  } catch (failure) { error(failure instanceof TypeError ? 'Verifique sua conexão e tente novamente. Seu texto foi mantido.' : failure.message); }
  finally {
    busy = false; for (const control of byId('contribution-form').elements) control.disabled = false;
    byId('contribution-submit').textContent = 'Enviar para análise'; selectFormat(selectedFormat); updateSubmit();
  }
});
byId('send-another').addEventListener('click', () => {
  const nickname = byId('contribution-nickname').value; byId('contribution-form').reset(); byId('contribution-nickname').value = nickname;
  clearImage(); requestId = crypto.randomUUID(); error(); selectFormat(selectedFormat); byId('contribution-success').hidden = true; byId('contribution-form').hidden = false; byId('contribution-prompt').focus();
});
selectFormat(selectedFormat);
updateSubmit();
