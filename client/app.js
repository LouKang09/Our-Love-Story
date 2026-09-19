const $ = sel => document.querySelector(sel);
const lockScreen = $('#lockScreen');
const journalApp = $('#journalApp');
const coverStage = $('#coverStage');
const bookView = $('#bookView');
const streamView = $('#streamView');
const emptyState = $('#emptyState');
const leftPage = $('#leftPage');
const rightPage = $('#rightPage');
const bookShell = $('#bookShell');
const editorDialog = $('#editorDialog');
const loginForm = $('#loginForm');
const entryForm = $('#entryForm');
const photoControls = $('#photoControls');
const preview = $('#entryPreview');

let entries = [];
let spreadIndex = 0;
let currentMode = 'cover';
let editingId = null;
let editingPhotos = [];
let me = null;
let config = { title: 'Our Little Book of Us', subtitle: 'Every ordinary day deserves to be remembered.' };
let toastTimer;

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function formatDate(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(d);
}
function paragraphHtml(text) {
  const clean = escapeHtml(text || '').trim();
  if (!clean) return '<p><em style="color:#9b8b88">No words were needed for this memory.</em></p>';
  return clean.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
}
function photoHtml(photo) {
  return `<figure class="memory-photo ${photo.side}" style="width:${photo.width}%">
    <img src="${escapeHtml(photo.src)}" alt="Journal memory" loading="lazy" />
    ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}
  </figure>`;
}
function bodyHtml(entry) {
  const photos = (entry.photos || []).map(photoHtml).join('');
  return `${photos}${paragraphHtml(entry.text)}`;
}
function pageHtml(entry) {
  if (!entry) return `<div class="blank-page"><div><strong>A blank page.</strong><span>Some days are only waiting to happen.</span></div></div>`;
  return `<div class="entry-page">
    <div class="entry-date">${formatDate(entry.date)}</div>
    <h2>${escapeHtml(entry.title)}</h2>
    <div class="entry-meta">written by ${escapeHtml(entry.author || 'us')}</div>
    <div class="entry-body">${bodyHtml(entry)}</div>
    <div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this page</button></div>
  </div>`;
}
function chronologicalEntries() {
  return [...entries].sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
function isMobileBook() { return window.matchMedia('(max-width: 800px)').matches; }

function renderBook() {
  const ordered = chronologicalEntries();
  const mobile = isMobileBook();
  const step = mobile ? 1 : 2;
  const maxIndex = Math.max(0, ordered.length - 1);
  spreadIndex = Math.max(0, Math.min(spreadIndex, mobile ? maxIndex : Math.max(0, ordered.length - (ordered.length % 2 ? 1 : 2))));

  if (mobile) {
    leftPage.innerHTML = '';
    rightPage.innerHTML = pageHtml(ordered[spreadIndex]);
    $('#pageCounter').textContent = ordered.length ? `Page ${spreadIndex + 1} of ${ordered.length}` : 'Empty book';
  } else {
    leftPage.innerHTML = pageHtml(ordered[spreadIndex]);
    rightPage.innerHTML = pageHtml(ordered[spreadIndex + 1]);
    const end = Math.min(spreadIndex + 2, ordered.length);
    $('#pageCounter').textContent = ordered.length ? `Pages ${spreadIndex + 1}–${end} of ${ordered.length}` : 'Empty book';
  }
  $('#prevBtn').disabled = spreadIndex <= 0;
  $('#nextBtn').disabled = spreadIndex + step >= ordered.length;
  wireEntryButtons(bookShell);
}
function renderTimeline() {
  const ordered = chronologicalEntries().reverse();
  $('#timeline').innerHTML = ordered.map(entry => `<article class="timeline-item">
    <div class="timeline-dot"></div>
    <div class="stream-card">
      <div class="entry-date">${formatDate(entry.date)}</div>
      <h2>${escapeHtml(entry.title)}</h2>
      <div class="entry-meta">written by ${escapeHtml(entry.author || 'us')}</div>
      <div class="entry-body">${bodyHtml(entry)}</div>
      <div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this memory</button></div>
    </div>
  </article>`).join('');
  wireEntryButtons($('#timeline'));
}
function wireEntryButtons(root) {
  root.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
}
function showView(mode) {
  currentMode = mode;
  coverStage.classList.toggle('hidden', mode !== 'cover');
  bookView.classList.toggle('hidden', mode !== 'book');
  streamView.classList.toggle('hidden', mode !== 'stream');
  emptyState.classList.toggle('hidden', entries.length > 0 || mode === 'cover');
  $('#bookModeBtn').classList.toggle('active', mode === 'book');
  $('#streamModeBtn').classList.toggle('active', mode === 'stream');
  if (!entries.length && mode !== 'cover') {
    bookView.classList.add('hidden');
    streamView.classList.add('hidden');
  } else if (mode === 'book') renderBook();
  else if (mode === 'stream') renderTimeline();
}
async function refreshEntries() {
  const data = await api('/api/entries');
  entries = data.entries || [];
  if (currentMode === 'book') renderBook();
  if (currentMode === 'stream') renderTimeline();
}

function resetEditor(entry = null) {
  editingId = entry?.id || null;
  editingPhotos = (entry?.photos || []).map(p => ({ ...p }));
  $('#editorHeading').textContent = entry ? 'Edit this memory' : 'Write today down';
  $('#entryDate').value = entry?.date || new Date().toISOString().slice(0,10);
  $('#entryTitle').value = entry?.title || '';
  $('#entryText').value = entry?.text || '';
  $('#deleteEntryBtn').classList.toggle('hidden', !entry);
  $('#editorError').textContent = '';
  renderPhotoControls();
  renderPreview();
}
function openEditor(id = null) {
  const entry = id ? entries.find(e => e.id === id) : null;
  resetEditor(entry || null);
  editorDialog.showModal();
  setTimeout(() => $('#entryTitle').focus(), 50);
}
function closeEditor() {
  if (editorDialog.open) editorDialog.close();
}
function currentDraft() {
  return {
    id: editingId,
    date: $('#entryDate').value,
    title: $('#entryTitle').value || 'Untitled memory',
    text: $('#entryText').value,
    photos: editingPhotos,
    author: editingId ? (entries.find(e => e.id === editingId)?.author || me) : me
  };
}
function renderPreview() {
  const draft = currentDraft();
  preview.innerHTML = `<div class="entry-date">${draft.date ? formatDate(draft.date) : 'Someday'}</div><h2>${escapeHtml(draft.title)}</h2>${bodyHtml(draft)}`;
}
function renderPhotoControls() {
  if (!editingPhotos.length) {
    photoControls.innerHTML = '<div class="muted" style="font:12px ui-sans-serif,system-ui,sans-serif">No photos yet. Add one or several to turn this into a scrapbook page.</div>';
    return;
  }
  photoControls.innerHTML = editingPhotos.map((p, i) => `<div class="photo-control" data-index="${i}">
      <img class="drag-photo" src="${escapeHtml(p.src)}" alt="Photo ${i+1}" draggable="false" />
      <div class="photo-row">
        <button type="button" class="side-btn ${p.side==='left'?'active':''}" data-side="left">← Left</button>
        <button type="button" class="side-btn ${p.side==='right'?'active':''}" data-side="right">Right →</button>
      </div>
      <label style="margin-top:9px">Size <input class="size-range" type="range" min="24" max="70" value="${p.width}" /></label>
      <input class="caption-input" type="text" maxlength="240" value="${escapeHtml(p.caption || '')}" placeholder="Optional little caption" />
      <button type="button" class="remove-photo">Remove photo</button>
    </div>`).join('');

  photoControls.querySelectorAll('.photo-control').forEach(card => {
    const i = Number(card.dataset.index);
    card.querySelectorAll('.side-btn').forEach(btn => btn.addEventListener('click', () => {
      editingPhotos[i].side = btn.dataset.side;
      renderPhotoControls(); renderPreview();
    }));
    card.querySelector('.size-range').addEventListener('input', e => { editingPhotos[i].width = Number(e.target.value); renderPreview(); });
    card.querySelector('.caption-input').addEventListener('input', e => { editingPhotos[i].caption = e.target.value; renderPreview(); });
    card.querySelector('.remove-photo').addEventListener('click', () => { editingPhotos.splice(i,1); renderPhotoControls(); renderPreview(); });

    const img = card.querySelector('.drag-photo');
    let dragging = false;
    img.addEventListener('pointerdown', e => { dragging = true; img.setPointerCapture(e.pointerId); });
    img.addEventListener('pointermove', e => {
      if (!dragging) return;
      const rect = card.getBoundingClientRect();
      editingPhotos[i].side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
      renderPreview();
    });
    const end = () => { if (dragging) { dragging = false; renderPhotoControls(); renderPreview(); } };
    img.addEventListener('pointerup', end); img.addEventListener('pointercancel', end);
  });
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    const data = await api('/api/login', { method:'POST', body: JSON.stringify({ username: $('#username').value.trim(), password: $('#password').value }) });
    me = data.username;
    lockScreen.classList.add('hidden'); journalApp.classList.remove('hidden');
    await refreshEntries();
    showView('cover');
  } catch (err) { $('#loginError').textContent = err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('/api/logout',{method:'POST',body:'{}'}).catch(()=>{}); location.reload(); });
$('#brandButton').addEventListener('click', () => { $('#introBook').classList.remove('open'); showView('cover'); });
$('#openBookBtn').addEventListener('click', () => {
  $('#introBook').classList.add('open');
  setTimeout(() => showView(entries.length ? 'book' : 'book'), 720);
});
$('#bookModeBtn').addEventListener('click', () => showView('book'));
$('#streamModeBtn').addEventListener('click', () => showView('stream'));
$('#newEntryBtn').addEventListener('click', () => openEditor());
$('#emptyAddBtn').addEventListener('click', () => openEditor());
$('#closeEditorBtn').addEventListener('click', closeEditor);
$('#cancelEditorBtn').addEventListener('click', closeEditor);

function turn(direction) {
  const ordered = chronologicalEntries();
  const step = isMobileBook() ? 1 : 2;
  const next = spreadIndex + (direction === 'next' ? step : -step);
  if (next < 0 || next >= ordered.length) return;
  const page = direction === 'next' ? rightPage : (isMobileBook() ? rightPage : leftPage);
  page.classList.add(direction === 'next' ? 'flip-forward' : 'flip-back');
  setTimeout(() => { spreadIndex = next; renderBook(); }, 315);
  setTimeout(() => page.classList.remove('flip-forward','flip-back'), 680);
}
$('#prevBtn').addEventListener('click', () => turn('prev'));
$('#nextBtn').addEventListener('click', () => turn('next'));
window.addEventListener('keydown', e => {
  if (editorDialog.open || currentMode !== 'book') return;
  if (e.key === 'ArrowRight') turn('next');
  if (e.key === 'ArrowLeft') turn('prev');
});
window.addEventListener('resize', () => { if (currentMode === 'book') renderBook(); });

['entryDate','entryTitle','entryText'].forEach(id => $(`#${id}`).addEventListener('input', renderPreview));
$('#photoInput').addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, Math.max(0, 12 - editingPhotos.length));
  $('#editorError').textContent = '';
  try {
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await api('/api/upload', { method:'POST', body: JSON.stringify({ dataUrl, name:file.name }) });
      editingPhotos.push({ id: crypto.randomUUID?.() || String(Date.now()+Math.random()), src:uploaded.src, side: editingPhotos.length % 2 ? 'right' : 'left', width:42, caption:'' });
      renderPhotoControls(); renderPreview();
    }
  } catch (err) { $('#editorError').textContent = err.message; }
  e.target.value = '';
});

entryForm.addEventListener('submit', async e => {
  e.preventDefault();
  $('#editorError').textContent = '';
  try {
    const draft = currentDraft();
    const url = editingId ? `/api/entries/${editingId}` : '/api/entries';
    const method = editingId ? 'PUT' : 'POST';
    await api(url, { method, body: JSON.stringify(draft) });
    await refreshEntries();
    closeEditor();
    if (currentMode === 'cover') showView('book');
    showToast(editingId ? 'Memory updated.' : 'Memory added to your book.');
  } catch (err) { $('#editorError').textContent = err.message; }
});
$('#deleteEntryBtn').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Delete this memory from the journal?')) return;
  try {
    await api(`/api/entries/${editingId}`, { method:'DELETE', body:'{}' });
    await refreshEntries(); closeEditor(); showToast('Memory deleted.');
    if (!entries.length) showView('book');
  } catch (err) { $('#editorError').textContent = err.message; }
});

(async function boot() {
  try {
    config = await api('/api/config');
    document.title = config.title;
    $('#lockTitle').textContent = config.title;
    $('#lockSubtitle').textContent = config.subtitle;
    $('#brandTitle').textContent = config.title;
    $('#coverTitle').textContent = config.title;
    const session = await api('/api/me');
    if (session.authenticated) {
      me = session.username;
      lockScreen.classList.add('hidden'); journalApp.classList.remove('hidden');
      await refreshEntries(); showView('cover');
    }
  } catch (err) {
    $('#loginError').textContent = 'The journal could not start. Please check the server.';
    console.error(err);
  }
})();
