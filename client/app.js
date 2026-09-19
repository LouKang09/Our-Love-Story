const $ = sel => document.querySelector(sel);
const lockScreen = $('#lockScreen');
const journalApp = $('#journalApp');
const coverStage = $('#coverStage');
const bookView = $('#bookView');
const streamView = $('#streamView');
const connectionsView = $('#connectionsView');
const emptyState = $('#emptyState');
const leftPage = $('#leftPage');
const rightPage = $('#rightPage');
const bookShell = $('#bookShell');
const editorDialog = $('#editorDialog');
const scrapbookDialog = $('#scrapbookDialog');
const profileDialog = $('#profileDialog');
const loginForm = $('#loginForm');
const signupForm = $('#signupForm');
const entryForm = $('#entryForm');
const photoControls = $('#photoControls');
const preview = $('#entryPreview');

let entries = [];
let authorProfiles = {};
let scrapbooks = [];
let invites = [];
let activeScrapbook = null;
let spreadIndex = 0;
let currentMode = 'cover';
let editingId = null;
let editingPhotos = [];
let me = null;
let pendingProfileAvatar = '';
let config = { title: 'Our Little Book of Us', subtitle: 'Every ordinary day deserves to be remembered.' };
let toastTimer;

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.status = res.status;
    throw error;
  }
  return data;
};

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function formatDate(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(d);
}
function paragraphHtml(text) {
  const clean = escapeHtml(text || '').trim();
  if (!clean) return '<p><em class="soft-note">No words were needed for this memory.</em></p>';
  return clean.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
}
function avatarHtml(profile, className = '') {
  const p = profile || {};
  if (p.avatar) return `<span class="avatar ${className}"><img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(p.displayName || p.tag || 'Profile')}" /></span>`;
  const initial = String(p.displayName || p.tag || '♡').trim().charAt(0).toUpperCase() || '♡';
  return `<span class="avatar ${className}">${escapeHtml(initial)}</span>`;
}
function photoHtml(photo, interactive = false) {
  return `<figure class="memory-photo ${photo.side || 'left'} ${interactive ? 'preview-draggable' : ''}" data-photo-id="${escapeHtml(photo.id)}" style="--photo-width:${Number(photo.width) || 42}%;--photo-offset:${Number(photo.offsetY) || 0}px">
    ${interactive ? '<span class="drag-badge">drag</span>' : ''}
    <img src="${escapeHtml(photo.src)}" alt="Journal memory" loading="lazy" draggable="false" />
    ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}
  </figure>`;
}
function bodyHtml(entry, interactive = false) {
  return `${(entry.photos || []).map(p => photoHtml(p, interactive)).join('')}${paragraphHtml(entry.text)}`;
}
function authorHtml(entry) {
  const p = authorProfiles[entry.author] || activeScrapbook?.profiles?.find(x => x.tag === entry.author) || { tag: entry.author, displayName: entry.author };
  return `<span class="author-line">${avatarHtml(p, 'tiny-avatar')}<span>${escapeHtml(p.displayName || p.tag)} <small>@${escapeHtml(p.tag || entry.author)}</small></span></span>`;
}
function pageHtml(entry) {
  if (!entry) return '<div class="blank-page"><div><strong>A blank page.</strong><span>Some days are only waiting to happen.</span></div></div>';
  const editable = me && entry.author === me.tag;
  return `<div class="entry-page">
    <div class="entry-date">${formatDate(entry.date)}</div>
    <h2>${escapeHtml(entry.title)}</h2>
    <div class="entry-meta">${authorHtml(entry)}</div>
    <div class="entry-body">${bodyHtml(entry)}</div>
    ${editable ? `<div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this page</button></div>` : ''}
  </div>`;
}
function chronologicalEntries() {
  return [...entries].sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
function isMobileBook() { return window.matchMedia('(max-width: 800px)').matches; }
function activeBookLabel() { return activeScrapbook?.name || 'My Scrapbooks'; }

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
    $('#pageCounter').textContent = ordered.length ? `Pages ${spreadIndex + 1}–${Math.min(spreadIndex + 2, ordered.length)} of ${ordered.length}` : 'Empty book';
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
      <div class="entry-meta">${authorHtml(entry)}</div>
      <div class="entry-body">${bodyHtml(entry)}</div>
      ${me && entry.author === me.tag ? `<div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this memory</button></div>` : ''}
    </div>
  </article>`).join('');
  wireEntryButtons($('#timeline'));
}
function wireEntryButtons(root) {
  root.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
}

function renderScrapbookPicker() {
  const picker = $('#scrapbookPicker');
  picker.innerHTML = scrapbooks.length ? scrapbooks.map(book => `<option value="${book.id}" ${book.id === activeScrapbook?.id ? 'selected' : ''}>${book.type === 'couple' ? '♡' : '◌'} ${escapeHtml(book.name)}</option>`).join('') : '<option value="">No scrapbook yet</option>';
  picker.disabled = !scrapbooks.length;
}
function updateCover() {
  $('#coverTitle').textContent = activeBookLabel();
  $('#brandTitle').textContent = activeBookLabel();
  if (activeScrapbook?.type === 'couple') {
    $('#coverKind').textContent = 'LOVERS SCRAPBOOK';
    $('#coverSubtitle').textContent = activeScrapbook.members.length === 2 ? 'two lives, one little archive' : 'waiting for your person to join';
  } else if (activeScrapbook?.type === 'group') {
    $('#coverKind').textContent = 'SHARED SCRAPBOOK';
    $('#coverSubtitle').textContent = 'friends, moments, and stories kept together';
  } else {
    $('#coverKind').textContent = 'YOUR JOURNAL JOURNEY';
    $('#coverSubtitle').textContent = 'create a lovers or group scrapbook';
  }
}
function renderProfileChip() {
  if (!me) return;
  $('#profileChipText').textContent = me.displayName || `@${me.tag}`;
  $('#profileAvatarMini').outerHTML = avatarHtml(me, 'mini-avatar') .replace('class="avatar mini-avatar"', 'id="profileAvatarMini" class="avatar mini-avatar"');
}
function renderInviteBanner() {
  const banner = $('#inviteBanner');
  if (!invites.length) { banner.classList.add('hidden'); banner.innerHTML = ''; return; }
  banner.classList.remove('hidden');
  banner.innerHTML = invites.map(invite => `<div class="invite-card" data-invite="${invite.id}">
    ${avatarHtml(invite.fromProfile, 'small-avatar')}
    <div><strong>${escapeHtml(invite.fromProfile?.displayName || invite.from)}</strong> invited you to <b>${escapeHtml(invite.scrapbook?.name || 'a scrapbook')}</b><small>${invite.type === 'couple' ? 'Lovers binding' : 'Group scrapbook'}</small></div>
    <button class="primary accept-invite" type="button">Accept</button><button class="ghost decline-invite" type="button">Decline</button>
  </div>`).join('');
  banner.querySelectorAll('.accept-invite').forEach(btn => btn.addEventListener('click', () => respondInvite(btn.closest('.invite-card').dataset.invite, true)));
  banner.querySelectorAll('.decline-invite').forEach(btn => btn.addEventListener('click', () => respondInvite(btn.closest('.invite-card').dataset.invite, false)));
}

function renderConnections() {
  if (!activeScrapbook) {
    $('#connectionsTitle').textContent = 'Create your first scrapbook';
    $('#connectionsSubtitle').textContent = 'Choose Lovers for a private two-person book, or Group for friends and family.';
    $('#inviteForm').classList.add('hidden');
    $('#peopleMap').innerHTML = '<div class="onboarding-card"><div class="big-heart">♡</div><h3>Your journal can be just two people or a whole circle.</h3><p>Create a scrapbook, then invite someone by their unique @tag.</p><button id="onboardingCreate" class="primary">Create scrapbook</button></div>';
    $('#onboardingCreate')?.addEventListener('click', () => scrapbookDialog.showModal());
    return;
  }
  $('#inviteForm').classList.remove('hidden');
  $('#connectionsTitle').textContent = activeScrapbook.name;
  $('#connectionsSubtitle').textContent = activeScrapbook.type === 'couple' ? 'A lovers scrapbook only ever binds two profiles.' : 'Your view keeps you at the center, with your scrapbook circle connected around you.';
  const profiles = activeScrapbook.profiles || [];

  if (activeScrapbook.type === 'couple') {
    const mine = profiles.find(p => p.tag === me.tag) || me;
    const other = profiles.find(p => p.tag !== me.tag);
    $('#peopleMap').innerHTML = `<div class="couple-bind">
      <div class="bound-profile">${avatarHtml(mine, 'bound-avatar')}<strong>${escapeHtml(mine.displayName)}</strong><span>@${escapeHtml(mine.tag)}</span></div>
      <div class="heart-bind"><span>♡</span><small>${other ? 'BOUND' : 'WAITING'}</small></div>
      ${other ? `<div class="bound-profile">${avatarHtml(other, 'bound-avatar')}<strong>${escapeHtml(other.displayName)}</strong><span>@${escapeHtml(other.tag)}</span></div>` : `<div class="bound-profile empty-bound"><span class="avatar bound-avatar">?</span><strong>Your person</strong><span>Invite by @tag</span></div>`}
    </div>`;
    return;
  }

  const mine = profiles.find(p => p.tag === me.tag) || me;
  const others = profiles.filter(p => p.tag !== me.tag);
  const radius = 35;
  const points = others.map((p, i) => {
    const angle = (Math.PI * 2 * i / Math.max(1, others.length)) - Math.PI / 2;
    return { p, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });
  $('#peopleMap').innerHTML = `<div class="group-network">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${points.map(pt => `<line x1="50" y1="50" x2="${pt.x}" y2="${pt.y}" />`).join('')}</svg>
    <div class="network-person center-person" style="left:50%;top:50%">${avatarHtml(mine, 'network-avatar')}<strong>${escapeHtml(mine.displayName)}</strong><span>@${escapeHtml(mine.tag)}</span></div>
    ${points.map(pt => `<div class="network-person" style="left:${pt.x}%;top:${pt.y}%">${avatarHtml(pt.p, 'network-avatar')}<strong>${escapeHtml(pt.p.displayName)}</strong><span>@${escapeHtml(pt.p.tag)}</span></div>`).join('')}
    ${!others.length ? '<div class="network-empty">Invite friends by @tag and they will connect around you.</div>' : ''}
  </div>`;
}

function showView(mode) {
  currentMode = mode;
  coverStage.classList.toggle('hidden', mode !== 'cover');
  bookView.classList.toggle('hidden', mode !== 'book');
  streamView.classList.toggle('hidden', mode !== 'stream');
  connectionsView.classList.toggle('hidden', mode !== 'connections');
  $('#bookModeBtn').classList.toggle('active', mode === 'book');
  $('#streamModeBtn').classList.toggle('active', mode === 'stream');
  $('#connectionsModeBtn').classList.toggle('active', mode === 'connections');

  const noBook = !activeScrapbook;
  const noEntries = activeScrapbook && !entries.length;
  emptyState.classList.toggle('hidden', mode === 'cover' || mode === 'connections' || (!noBook && !noEntries));
  if (noBook && mode !== 'cover' && mode !== 'connections') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
    $('#emptyTitle').textContent = 'Your first scrapbook starts here.';
    $('#emptyText').textContent = 'Create a lovers scrapbook for two, or a group scrapbook for your circle.';
    $('#emptyAddBtn').textContent = 'Create scrapbook';
  } else if (noEntries && mode !== 'cover' && mode !== 'connections') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
    $('#emptyTitle').textContent = 'The first page is waiting.';
    $('#emptyText').textContent = 'Write a little piece of today and this scrapbook begins.';
    $('#emptyAddBtn').textContent = 'Write the first memory';
  } else if (mode === 'book') renderBook();
  else if (mode === 'stream') renderTimeline();
  else if (mode === 'connections') renderConnections();
}

async function refreshEntries() {
  if (!activeScrapbook) { entries = []; authorProfiles = {}; return; }
  const data = await api(`/api/entries?scrapbookId=${encodeURIComponent(activeScrapbook.id)}`);
  entries = data.entries || [];
  authorProfiles = data.profiles || {};
  if (currentMode === 'book') renderBook();
  if (currentMode === 'stream') renderTimeline();
}
async function loadSession(preferredBookId = null) {
  const data = await api('/api/me');
  me = data.profile;
  scrapbooks = data.scrapbooks || [];
  invites = data.invites || [];
  const remembered = localStorage.getItem('activeScrapbookId');
  activeScrapbook = scrapbooks.find(b => b.id === preferredBookId) || scrapbooks.find(b => b.id === remembered) || scrapbooks[0] || null;
  if (activeScrapbook) localStorage.setItem('activeScrapbookId', activeScrapbook.id);
  renderScrapbookPicker(); renderProfileChip(); renderInviteBanner(); updateCover();
  await refreshEntries();
}
async function respondInvite(id, accept) {
  try {
    const data = await api(`/api/invites/${id}/respond`, { method:'POST', body:JSON.stringify({ accept }) });
    await loadSession(data.scrapbook?.id || null);
    showToast(accept ? 'You joined the scrapbook.' : 'Invitation declined.');
    if (accept) showView('connections');
  } catch (err) { showToast(err.message); }
}

function resetEditor(entry = null) {
  editingId = entry?.id || null;
  editingPhotos = (entry?.photos || []).map(p => ({ offsetY:0, ...p }));
  $('#editorHeading').textContent = entry ? 'Edit this memory' : 'Write today down';
  $('#entryDate').value = entry?.date || new Date().toISOString().slice(0,10);
  $('#entryTitle').value = entry?.title || '';
  $('#entryText').value = entry?.text || '';
  $('#deleteEntryBtn').classList.toggle('hidden', !entry);
  $('#editorError').textContent = '';
  renderPhotoControls(); renderPreview();
}
function openEditor(id = null) {
  if (!activeScrapbook) { scrapbookDialog.showModal(); return; }
  const entry = id ? entries.find(e => e.id === id) : null;
  if (entry && entry.author !== me.tag) { showToast('Only the writer can edit that memory.'); return; }
  resetEditor(entry || null);
  editorDialog.showModal();
  setTimeout(() => $('#entryTitle').focus(), 50);
}
function closeEditor() { if (editorDialog.open) editorDialog.close(); }
function currentDraft() {
  return {
    id: editingId,
    scrapbookId: activeScrapbook?.id || '',
    date: $('#entryDate').value,
    title: $('#entryTitle').value || 'Untitled memory',
    text: $('#entryText').value,
    photos: editingPhotos,
    author: me?.tag
  };
}
function renderPreview() {
  const draft = currentDraft();
  preview.innerHTML = `<div class="entry-date">${draft.date ? formatDate(draft.date) : 'Someday'}</div><h2>${escapeHtml(draft.title)}</h2><div class="entry-meta">${me ? avatarHtml(me,'tiny-avatar') + escapeHtml(me.displayName) : ''}</div><div class="preview-flow">${bodyHtml(draft, true)}</div>`;
  wirePreviewPhotoDrag();
}
function renderPhotoControls() {
  if (!editingPhotos.length) {
    photoControls.innerHTML = '<div class="muted photo-empty">No photos yet. Add one or several and build the page like a real scrapbook.</div>';
    return;
  }
  photoControls.innerHTML = editingPhotos.map((p, i) => `<div class="photo-control" data-index="${i}">
    <img class="control-photo" src="${escapeHtml(p.src)}" alt="Photo ${i+1}" draggable="false" />
    <div class="photo-row"><button type="button" class="side-btn ${p.side==='left'?'active':''}" data-side="left">← Wrap left</button><button type="button" class="side-btn ${p.side==='right'?'active':''}" data-side="right">Wrap right →</button></div>
    <label class="size-label"><span>Size <b class="size-value">${Number(p.width)||42}%</b></span><input class="size-range" type="range" min="18" max="90" step="1" value="${Number(p.width)||42}" /></label>
    <div class="position-row"><span>Vertical offset: <b>${Number(p.offsetY)||0}px</b></span><button type="button" class="reset-position">Reset position</button></div>
    <input class="caption-input" type="text" maxlength="240" value="${escapeHtml(p.caption || '')}" placeholder="Optional little caption" />
    <button type="button" class="remove-photo">Remove photo</button>
  </div>`).join('');

  photoControls.querySelectorAll('.photo-control').forEach(card => {
    const i = Number(card.dataset.index);
    card.querySelectorAll('.side-btn').forEach(btn => btn.addEventListener('click', () => {
      editingPhotos[i].side = btn.dataset.side; renderPhotoControls(); renderPreview();
    }));
    card.querySelector('.size-range').addEventListener('input', e => {
      editingPhotos[i].width = Number(e.target.value);
      card.querySelector('.size-value').textContent = `${e.target.value}%`;
      renderPreview();
    });
    card.querySelector('.caption-input').addEventListener('input', e => { editingPhotos[i].caption = e.target.value; renderPreview(); });
    card.querySelector('.reset-position').addEventListener('click', () => { editingPhotos[i].offsetY = 0; renderPhotoControls(); renderPreview(); });
    card.querySelector('.remove-photo').addEventListener('click', () => { editingPhotos.splice(i,1); renderPhotoControls(); renderPreview(); });
  });
}
function wirePreviewPhotoDrag() {
  preview.querySelectorAll('.preview-draggable').forEach(figure => {
    const id = figure.dataset.photoId;
    const index = editingPhotos.findIndex(p => String(p.id) === String(id));
    if (index < 0) return;
    let startY = 0, startOffset = 0, dragging = false;
    figure.addEventListener('pointerdown', e => {
      if (e.target.closest('figcaption')) return;
      dragging = true; startY = e.clientY; startOffset = Number(editingPhotos[index].offsetY) || 0;
      figure.classList.add('dragging'); figure.setPointerCapture(e.pointerId); e.preventDefault();
    });
    figure.addEventListener('pointermove', e => {
      if (!dragging) return;
      const offset = Math.max(0, Math.min(420, startOffset + (e.clientY - startY)));
      editingPhotos[index].offsetY = Math.round(offset);
      figure.style.setProperty('--photo-offset', `${Math.round(offset)}px`);
      const rect = preview.getBoundingClientRect();
      figure.dataset.previewSide = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    });
    const finish = e => {
      if (!dragging) return;
      dragging = false; figure.classList.remove('dragging');
      const rect = preview.getBoundingClientRect();
      editingPhotos[index].side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
      renderPhotoControls(); renderPreview();
    };
    figure.addEventListener('pointerup', finish); figure.addEventListener('pointercancel', finish);
  });
}
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}
async function uploadImage(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
  const dataUrl = await fileToDataUrl(file);
  return api('/api/upload', { method:'POST', body:JSON.stringify({ dataUrl, name:file.name }) });
}

function setAuthTab(tab) {
  const signIn = tab === 'signin';
  $('#signInTab').classList.toggle('active', signIn);
  $('#signUpTab').classList.toggle('active', !signIn);
  loginForm.classList.toggle('hidden', !signIn);
  signupForm.classList.toggle('hidden', signIn);
}
$('#signInTab').addEventListener('click', () => setAuthTab('signin'));
$('#signUpTab').addEventListener('click', () => setAuthTab('signup'));

loginForm.addEventListener('submit', async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  try {
    await api('/api/login', { method:'POST', body:JSON.stringify({ username:$('#username').value.trim(), password:$('#password').value }) });
    await enterApp();
  } catch (err) { $('#loginError').textContent = err.message; }
});
signupForm.addEventListener('submit', async e => {
  e.preventDefault(); $('#signupError').textContent = '';
  try {
    await api('/api/signup', { method:'POST', body:JSON.stringify({ displayName:$('#signupName').value.trim(), tag:$('#signupTag').value.trim(), password:$('#signupPassword').value }) });
    await enterApp(); showView('connections');
  } catch (err) { $('#signupError').textContent = err.message; }
});
async function enterApp() {
  await loadSession();
  lockScreen.classList.add('hidden'); journalApp.classList.remove('hidden');
  showView(activeScrapbook ? 'cover' : 'connections');
}
$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method:'POST', body:'{}' }).catch(()=>{});
  localStorage.removeItem('activeScrapbookId'); location.reload();
});
$('#brandButton').addEventListener('click', () => { $('#introBook').classList.remove('open'); showView('cover'); });
$('#openBookBtn').addEventListener('click', () => {
  if (!activeScrapbook) { showView('connections'); return; }
  $('#introBook').classList.add('open'); setTimeout(() => showView('book'), 720);
});
$('#bookModeBtn').addEventListener('click', () => showView('book'));
$('#streamModeBtn').addEventListener('click', () => showView('stream'));
$('#connectionsModeBtn').addEventListener('click', () => showView('connections'));
$('#newEntryBtn').addEventListener('click', () => openEditor());
$('#emptyAddBtn').addEventListener('click', () => activeScrapbook ? openEditor() : scrapbookDialog.showModal());
$('#closeEditorBtn').addEventListener('click', closeEditor);
$('#cancelEditorBtn').addEventListener('click', closeEditor);

$('#scrapbookPicker').addEventListener('change', async e => {
  activeScrapbook = scrapbooks.find(b => b.id === e.target.value) || null;
  spreadIndex = 0;
  if (activeScrapbook) localStorage.setItem('activeScrapbookId', activeScrapbook.id);
  updateCover(); await refreshEntries(); showView('cover');
});
$('#createScrapbookBtn').addEventListener('click', () => scrapbookDialog.showModal());
$('#closeScrapbookDialog').addEventListener('click', () => scrapbookDialog.close());
$('#scrapbookForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#scrapbookError').textContent = '';
  try {
    const data = await api('/api/scrapbooks', { method:'POST', body:JSON.stringify({ type:$('#scrapbookType').value, name:$('#scrapbookName').value.trim() }) });
    scrapbookDialog.close(); $('#scrapbookName').value = '';
    await loadSession(data.scrapbook.id); showView('connections'); showToast('Scrapbook created. Invite someone by @tag.');
  } catch (err) { $('#scrapbookError').textContent = err.message; }
});
$('#inviteForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!activeScrapbook) return;
  try {
    await api(`/api/scrapbooks/${activeScrapbook.id}/invite`, { method:'POST', body:JSON.stringify({ tag:$('#inviteTag').value.trim() }) });
    showToast('Invitation sent.'); $('#inviteTag').value = '';
  } catch (err) { showToast(err.message); }
});

$('#profileBtn').addEventListener('click', () => {
  if (!me) return;
  pendingProfileAvatar = me.avatar || '';
  $('#profileName').value = me.displayName || '';
  $('#profileTag').value = `@${me.tag}`;
  $('#profileBio').value = me.bio || '';
  $('#profileAvatarLarge').outerHTML = avatarHtml(me, 'large-avatar').replace('class="avatar large-avatar"', 'id="profileAvatarLarge" class="avatar large-avatar"');
  $('#profileError').textContent = '';
  profileDialog.showModal();
});
$('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
$('#profilePhotoInput').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  $('#profileError').textContent = '';
  try {
    const uploaded = await uploadImage(file); pendingProfileAvatar = uploaded.src;
    const temp = { ...me, avatar:pendingProfileAvatar };
    $('#profileAvatarLarge').outerHTML = avatarHtml(temp, 'large-avatar').replace('class="avatar large-avatar"', 'id="profileAvatarLarge" class="avatar large-avatar"');
  } catch (err) { $('#profileError').textContent = err.message; }
  e.target.value = '';
});
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#profileError').textContent = '';
  try {
    await api('/api/profile', { method:'PUT', body:JSON.stringify({ displayName:$('#profileName').value.trim(), bio:$('#profileBio').value.trim(), avatar:pendingProfileAvatar }) });
    await loadSession(activeScrapbook?.id); profileDialog.close(); showToast('Profile updated.');
    if (currentMode === 'connections') renderConnections();
  } catch (err) { $('#profileError').textContent = err.message; }
});

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
  if (editorDialog.open || scrapbookDialog.open || profileDialog.open || currentMode !== 'book') return;
  if (e.key === 'ArrowRight') turn('next'); if (e.key === 'ArrowLeft') turn('prev');
});
window.addEventListener('resize', () => { if (currentMode === 'book') renderBook(); if (currentMode === 'connections' && activeScrapbook?.type === 'group') renderConnections(); });

['entryDate','entryTitle','entryText'].forEach(id => $(`#${id}`).addEventListener('input', renderPreview));
$('#photoInput').addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, Math.max(0, 12 - editingPhotos.length));
  $('#editorError').textContent = '';
  try {
    for (const file of files) {
      const uploaded = await uploadImage(file);
      editingPhotos.push({ id:crypto.randomUUID?.() || String(Date.now()+Math.random()), src:uploaded.src, side:editingPhotos.length % 2 ? 'right' : 'left', width:42, offsetY:0, caption:'' });
    }
    renderPhotoControls(); renderPreview();
  } catch (err) { $('#editorError').textContent = err.message; }
  e.target.value = '';
});
entryForm.addEventListener('submit', async e => {
  e.preventDefault(); $('#editorError').textContent = '';
  try {
    const draft = currentDraft();
    await api(editingId ? `/api/entries/${editingId}` : '/api/entries', { method:editingId ? 'PUT' : 'POST', body:JSON.stringify(draft) });
    const wasEditing = Boolean(editingId);
    await refreshEntries(); closeEditor(); showToast(wasEditing ? 'Memory updated.' : 'Memory added to the scrapbook.');
    if (currentMode === 'cover') showView('book');
  } catch (err) { $('#editorError').textContent = err.message; }
});
$('#deleteEntryBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Delete this memory from the scrapbook?')) return;
  try {
    await api(`/api/entries/${editingId}`, { method:'DELETE', body:'{}' });
    await refreshEntries(); closeEditor(); showToast('Memory deleted.'); showView(currentMode === 'stream' ? 'stream' : 'book');
  } catch (err) { $('#editorError').textContent = err.message; }
});

(async function boot() {
  try {
    config = await api('/api/config');
    document.title = config.title; $('#lockTitle').textContent = config.title; $('#lockSubtitle').textContent = config.subtitle;
    try { await enterApp(); } catch (err) { if (err.status !== 401) throw err; }
  } catch (err) {
    $('#loginError').textContent = 'The scrapbook could not start. Please try again.';
    console.error(err);
  }
})();
