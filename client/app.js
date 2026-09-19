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
let following = [];
let followers = [];
let partnerTag = null;
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
function plainTextHtml(text) {
  const clean = escapeHtml(text || '').trim();
  if (!clean) return '<p><em class="soft-note">No words were needed for this memory.</em></p>';
  return clean.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
}
function richTextHtml(entry) {
  const rich = String(entry?.richText || '').trim();
  return rich || plainTextHtml(entry?.text || '');
}
function avatarHtml(profile, className = '') {
  const p = profile || {};
  if (p.avatar) return `<span class="avatar ${className}"><img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(p.displayName || p.tag || 'Profile')}" /></span>`;
  const initial = String(p.displayName || p.tag || '♡').trim().charAt(0).toUpperCase() || '♡';
  return `<span class="avatar ${className}">${escapeHtml(initial)}</span>`;
}
function normalizedPhotoPosition(photo) {
  const width = Math.max(18, Math.min(90, Number(photo.width) || 42));
  const legacyX = (photo.side || 'left') === 'right' ? Math.max(0, 100 - width) : 0;
  const xPct = Math.max(0, Math.min(100 - width, Number.isFinite(Number(photo.xPct)) ? Number(photo.xPct) : legacyX));
  const yPx = Math.max(0, Math.min(900, Number.isFinite(Number(photo.yPx)) ? Number(photo.yPx) : (Number(photo.offsetY) || 0)));
  const side = xPct + width / 2 >= 50 ? 'right' : 'left';
  const rightGap = Math.max(0, 100 - xPct - width);
  return { width, xPct, yPx, side, rightGap };
}
function smartPhotoLayout(photo) {
  const pos = normalizedPhotoPosition(photo);
  const nearEdge = pos.xPct <= 8 || pos.rightGap <= 8;
  const wraps = pos.width <= 38 && nearEdge;
  return { ...pos, wraps };
}
function photoHtml(photo, interactive = false) {
  const pos = smartPhotoLayout(photo);
  let horizontal;
  if (pos.wraps) {
    horizontal = pos.side === 'left'
      ? `margin-left:${pos.xPct}%;margin-right:20px;`
      : `margin-right:${pos.rightGap}%;margin-left:20px;`;
  } else {
    horizontal = `margin-left:${pos.xPct}%;margin-right:0;`;
  }
  return `<figure class="memory-photo ${pos.side} ${pos.wraps ? 'wrap-photo' : 'block-photo'} ${interactive ? 'preview-draggable' : ''}" data-photo-id="${escapeHtml(photo.id)}" style="--photo-width:${pos.width}%;--photo-offset:${pos.yPx}px;${horizontal}">
    ${interactive ? '<span class="drag-badge">free drag</span>' : ''}
    <img src="${escapeHtml(photo.src)}" alt="Journal memory" loading="lazy" draggable="false" />
    ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}
  </figure>`;
}
function bodyHtml(entry, interactive = false) {
  return `${(entry.photos || []).map(p => photoHtml(p, interactive)).join('')}<div class="rich-copy">${richTextHtml(entry)}</div>`;
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
    <div class="entry-body journal-flow">${bodyHtml(entry)}</div>
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
      <div class="entry-body journal-flow">${bodyHtml(entry)}</div>
      ${me && entry.author === me.tag ? `<div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this memory</button></div>` : ''}
    </div>
  </article>`).join('');
  wireEntryButtons($('#timeline'));
}
function wireEntryButtons(root) {
  root.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
}

function privacyLabel(value) {
  return value === 'followers' ? 'Followers Only' : value === 'partner' ? 'Partner Only' : 'You Only';
}
function renderScrapbookPicker() {
  const picker = $('#scrapbookPicker');
  picker.innerHTML = scrapbooks.length ? scrapbooks.map(book => {
    const icon = book.type === 'couple' ? '♡' : book.type === 'personal' ? '✎' : '◌';
    const ownerNote = book.type === 'personal' && book.owner !== me?.tag ? ` · @${escapeHtml(book.owner)}` : '';
    return `<option value="${book.id}" ${book.id === activeScrapbook?.id ? 'selected' : ''}>${icon} ${escapeHtml(book.name)}${ownerNote}</option>`;
  }).join('') : '<option value="">No scrapbook yet</option>';
  picker.disabled = !scrapbooks.length;
}
function updateCover() {
  $('#coverTitle').textContent = activeBookLabel();
  $('#brandTitle').textContent = activeBookLabel();
  if (activeScrapbook?.type === 'couple') {
    const archived = activeScrapbook.bindingStatus === 'unbound';
    $('#coverKind').textContent = archived ? 'LOVERS ARCHIVE' : 'LOVERS SCRAPBOOK';
    $('#coverSubtitle').textContent = archived ? 'the bond ended, but the memories stay' : (activeScrapbook.members.length === 2 ? 'two lives, one little archive' : 'waiting for your person to join');
  } else if (activeScrapbook?.type === 'group') {
    $('#coverKind').textContent = 'SHARED SCRAPBOOK';
    $('#coverSubtitle').textContent = 'friends, moments, and stories kept together';
  } else if (activeScrapbook?.type === 'personal') {
    $('#coverKind').textContent = 'PERSONAL SCRAPBOOK';
    $('#coverSubtitle').textContent = activeScrapbook.owner === me?.tag
      ? `${privacyLabel(activeScrapbook.privacy)} · your memories, your space`
      : `shared with you by @${activeScrapbook.owner}`;
  } else {
    $('#coverKind').textContent = 'YOUR JOURNAL JOURNEY';
    $('#coverSubtitle').textContent = 'create a lovers, group, or personal scrapbook';
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

function renderUnbindPanel() {
  const panel = $('#unbindPanel');
  if (!activeScrapbook || activeScrapbook.type !== 'couple' || activeScrapbook.members.length !== 2) {
    panel.classList.add('hidden'); panel.innerHTML = ''; return;
  }
  panel.classList.remove('hidden');
  if (activeScrapbook.bindingStatus === 'unbound') {
    panel.innerHTML = '<div class="unbind-card archived"><strong>Unbound archive</strong><p>The relationship binding was ended with both approvals. Every memory and photo remains preserved here.</p></div>';
    return;
  }
  const request = activeScrapbook.unbindRequest;
  if (!request) {
    panel.innerHTML = '<div class="unbind-card"><div><strong>Couple binding</strong><p>Unbinding never deletes this scrapbook. Both partners must approve before the bond is released.</p></div><button id="requestUnbindBtn" class="ghost warning-action" type="button">Request unbind</button></div>';
    $('#requestUnbindBtn')?.addEventListener('click', requestUnbind);
    return;
  }
  const mine = request.requestedBy === me.tag;
  panel.innerHTML = mine
    ? '<div class="unbind-card pending"><div><strong>Waiting for your partner</strong><p>Your approval is recorded. Your partner must also approve before the bond changes.</p></div><button id="cancelUnbindBtn" class="ghost" type="button">Cancel request</button></div>'
    : '<div class="unbind-card pending"><div><strong>Your partner requested an unbind</strong><p>The scrapbook and all memories will remain as an archive. The bond changes only if you approve.</p></div><div class="unbind-actions"><button id="declineUnbindBtn" class="ghost" type="button">Keep bound</button><button id="approveUnbindBtn" class="danger" type="button">Approve unbind</button></div></div>';
  $('#cancelUnbindBtn')?.addEventListener('click', () => respondUnbind(false));
  $('#declineUnbindBtn')?.addEventListener('click', () => respondUnbind(false));
  $('#approveUnbindBtn')?.addEventListener('click', () => respondUnbind(true));
}
async function requestUnbind() {
  if (!activeScrapbook || !confirm('Request to unbind? Your partner must approve. No memories or photos will be deleted.')) return;
  try {
    await api(`/api/scrapbooks/${activeScrapbook.id}/unbind/request`, { method:'POST', body:'{}' });
    await loadSession(activeScrapbook.id); renderConnections(); showToast('Unbind request sent to your partner.');
  } catch (err) { showToast(err.message); }
}
async function respondUnbind(approve) {
  if (!activeScrapbook) return;
  if (approve && !confirm('Approve unbinding? The scrapbook will remain as a shared archive and no memories will be deleted.')) return;
  try {
    const data = await api(`/api/scrapbooks/${activeScrapbook.id}/unbind/respond`, { method:'POST', body:JSON.stringify({ approve }) });
    await loadSession(activeScrapbook.id); renderConnections(); updateCover();
    showToast(data.unbound ? 'The couple bond is now unbound. Your memories are preserved.' : (approve ? 'Your approval was recorded.' : 'Unbind request closed.'));
  } catch (err) { showToast(err.message); }
}
function renderFollowStats() {
  const el = $('#followStats');
  if (!el) return;
  el.innerHTML = `<span><b>${followers.length}</b> followers</span><span><b>${following.length}</b> following</span>`;
}
function renderPersonalPrivacy() {
  const panel = $('#personalPrivacyPanel');
  if (!activeScrapbook || activeScrapbook.type !== 'personal') {
    panel.classList.add('hidden'); panel.innerHTML = ''; return;
  }
  panel.classList.remove('hidden');
  if (activeScrapbook.owner !== me.tag) {
    panel.innerHTML = `<div class="privacy-card readonly"><strong>Read-only personal scrapbook</strong><p>@${escapeHtml(activeScrapbook.owner)} shared this scrapbook through <b>${privacyLabel(activeScrapbook.privacy)}</b>. Only the owner can write or change its privacy.</p></div>`;
    return;
  }
  panel.innerHTML = `<div class="privacy-card"><div><strong>Personal scrapbook privacy</strong><p>Choose exactly who is allowed to read this personal scrapbook.</p></div><select id="personalPrivacySelect">
    <option value="followers" ${activeScrapbook.privacy==='followers'?'selected':''}>Followers Only</option>
    <option value="partner" ${activeScrapbook.privacy==='partner'?'selected':''}>Partner Only</option>
    <option value="private" ${activeScrapbook.privacy==='private'?'selected':''}>You Only</option>
  </select></div>`;
  $('#personalPrivacySelect')?.addEventListener('change', async e => {
    try {
      const data = await api(`/api/scrapbooks/${activeScrapbook.id}/privacy`, { method:'PUT', body:JSON.stringify({ privacy:e.target.value }) });
      const idx = scrapbooks.findIndex(b => b.id === activeScrapbook.id);
      activeScrapbook = data.scrapbook;
      if (idx >= 0) scrapbooks[idx] = activeScrapbook;
      updateCover(); renderPersonalPrivacy(); showToast(`Privacy changed to ${privacyLabel(activeScrapbook.privacy)}.`);
    } catch (err) { showToast(err.message); }
  });
}
function renderConnections() {
  renderFollowStats();
  if (!activeScrapbook) {
    $('#connectionsTitle').textContent = 'Create your first scrapbook';
    $('#connectionsSubtitle').textContent = 'Choose Lovers, Group, or Personal.';
    $('#inviteForm').classList.add('hidden');
    $('#unbindPanel').classList.add('hidden');
    $('#personalPrivacyPanel').classList.add('hidden');
    $('#peopleMap').innerHTML = '<div class="onboarding-card"><div class="big-heart">♡</div><h3>Your journal can be shared or completely personal.</h3><p>Create a Lovers scrapbook, a Group scrapbook, or your own Personal scrapbook.</p><button id="onboardingCreate" class="primary">Create scrapbook</button></div>';
    $('#onboardingCreate')?.addEventListener('click', () => scrapbookDialog.showModal());
    return;
  }

  const isCouple = activeScrapbook.type === 'couple';
  const isPersonal = activeScrapbook.type === 'personal';
  const archived = isCouple && activeScrapbook.bindingStatus === 'unbound';
  const coupleFull = isCouple && activeScrapbook.members.length >= 2;
  $('#inviteForm').classList.toggle('hidden', isPersonal || archived || coupleFull);
  $('#connectionsTitle').textContent = activeScrapbook.name;

  if (isPersonal) {
    $('#unbindPanel').classList.add('hidden');
    $('#unbindPanel').innerHTML = '';
    const owner = activeScrapbook.profiles?.[0] || { tag:activeScrapbook.owner, displayName:activeScrapbook.owner };
    $('#connectionsSubtitle').textContent = activeScrapbook.owner === me.tag
      ? 'Your personal journal. You decide who can read it.'
      : `A personal scrapbook by @${activeScrapbook.owner}. You have read-only access.`;
    $('#peopleMap').innerHTML = `<div class="personal-owner-card">${avatarHtml(owner,'bound-avatar')}<strong>${escapeHtml(owner.displayName || owner.tag)}</strong><span>@${escapeHtml(owner.tag)}</span><small>${privacyLabel(activeScrapbook.privacy)}</small></div>`;
    renderPersonalPrivacy();
    return;
  }

  $('#personalPrivacyPanel').classList.add('hidden');
  $('#personalPrivacyPanel').innerHTML = '';
  $('#connectionsSubtitle').textContent = archived
    ? 'This is a preserved lovers archive. The memories remain shared even though the active bond has ended.'
    : (isCouple ? 'A lovers scrapbook only ever binds two profiles.' : 'Your view keeps you at the center, with your scrapbook circle connected around you.');

  const profiles = activeScrapbook.profiles || [];
  if (isCouple) {
    const mine = profiles.find(p => p.tag === me.tag) || me;
    const other = profiles.find(p => p.tag !== me.tag);
    $('#peopleMap').innerHTML = `<div class="couple-bind ${archived ? 'unbound-bind' : ''}">
      <div class="bound-profile">${avatarHtml(mine, 'bound-avatar')}<strong>${escapeHtml(mine.displayName)}</strong><span>@${escapeHtml(mine.tag)}</span></div>
      <div class="heart-bind"><span>♡</span><small>${archived ? 'UNBOUND ARCHIVE' : (other ? 'BOUND' : 'WAITING')}</small></div>
      ${other ? `<div class="bound-profile">${avatarHtml(other, 'bound-avatar')}<strong>${escapeHtml(other.displayName)}</strong><span>@${escapeHtml(other.tag)}</span></div>` : `<div class="bound-profile empty-bound"><span class="avatar bound-avatar">?</span><strong>Your person</strong><span>Invite by @tag</span></div>`}
    </div>`;
    renderUnbindPanel();
    return;
  }

  $('#unbindPanel').classList.add('hidden');
  $('#unbindPanel').innerHTML = '';
  const mine = profiles.find(p => p.tag === me.tag) || me;
  const others = profiles.filter(p => p.tag !== me.tag);
  const radius = 35;
  const points = others.map((p, i) => {
    const angle = (Math.PI * 2 * i / Math.max(1, others.length)) - Math.PI / 2;
    return { p, x:50 + Math.cos(angle) * radius, y:50 + Math.sin(angle) * radius };
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
  const canWrite = Boolean(activeScrapbook && activeScrapbook.canWrite !== false);
  $('#newEntryBtn').classList.toggle('hidden', Boolean(activeScrapbook) && !canWrite);
  emptyState.classList.toggle('hidden', mode === 'cover' || mode === 'connections' || (!noBook && !noEntries));
  if (noBook && mode !== 'cover' && mode !== 'connections') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
    $('#emptyTitle').textContent = 'Your first scrapbook starts here.';
    $('#emptyText').textContent = 'Create a lovers scrapbook for two, or a group scrapbook for your circle.';
    $('#emptyAddBtn').textContent = 'Create scrapbook';
  } else if (noEntries && mode !== 'cover' && mode !== 'connections') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
    $('#emptyTitle').textContent = canWrite ? 'The first page is waiting.' : 'No memories here yet.';
    $('#emptyText').textContent = canWrite ? 'Write a little piece of today and this scrapbook begins.' : 'This personal scrapbook is read-only for you.';
    $('#emptyAddBtn').classList.toggle('hidden', !canWrite);
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
  if (data.scrapbook) {
    activeScrapbook = data.scrapbook;
    const idx = scrapbooks.findIndex(b => b.id === activeScrapbook.id);
    if (idx >= 0) scrapbooks[idx] = activeScrapbook;
  }
  if (currentMode === 'book') renderBook();
  if (currentMode === 'stream') renderTimeline();
}
async function loadSession(preferredBookId = null) {
  const data = await api('/api/me');
  me = data.profile;
  scrapbooks = data.scrapbooks || [];
  invites = data.invites || [];
  following = data.following || [];
  followers = data.followers || [];
  partnerTag = data.partnerTag || null;
  const remembered = localStorage.getItem('activeScrapbookId');
  activeScrapbook = scrapbooks.find(b => b.id === preferredBookId) || scrapbooks.find(b => b.id === remembered) || scrapbooks[0] || null;
  if (activeScrapbook) localStorage.setItem('activeScrapbookId', activeScrapbook.id);
  renderScrapbookPicker(); renderProfileChip(); renderInviteBanner(); renderFollowStats(); updateCover();
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
  editingPhotos = (entry?.photos || []).map(p => {
    const pos = normalizedPhotoPosition(p);
    return { ...p, width:pos.width, xPct:pos.xPct, yPx:pos.yPx, offsetY:pos.yPx, side:pos.side };
  });
  $('#editorHeading').textContent = entry ? 'Edit this memory' : 'Write today down';
  $('#entryDate').value = entry?.date || new Date().toISOString().slice(0,10);
  $('#entryTitle').value = entry?.title || '';
  $('#entryText').innerHTML = entry?.richText ? entry.richText : (entry?.text ? plainTextHtml(entry.text) : '');
  savedRichRange = null;
  $('#deleteEntryBtn').classList.toggle('hidden', !entry);
  $('#editorError').textContent = '';
  renderPhotoControls(); renderPreview();
}
function openEditor(id = null) {
  if (!activeScrapbook) { scrapbookDialog.showModal(); return; }
  if (activeScrapbook.canWrite === false) { showToast('This personal scrapbook is read-only for you.'); return; }
  const entry = id ? entries.find(e => e.id === id) : null;
  if (entry && entry.author !== me.tag) { showToast('Only the writer can edit that memory.'); return; }
  resetEditor(entry || null);
  editorDialog.showModal();
  setTimeout(() => $('#entryTitle').focus(), 50);
}
function closeEditor() { if (editorDialog.open) editorDialog.close(); }
function currentDraft() {
  const editor = $('#entryText');
  return {
    id: editingId,
    scrapbookId: activeScrapbook?.id || '',
    date: $('#entryDate').value,
    title: $('#entryTitle').value || 'Untitled memory',
    text: editor.innerText.slice(0, 20000),
    richText: editor.innerHTML.slice(0, 50000),
    photos: editingPhotos,
    author: me?.tag
  };
}
function renderPreview() {
  const draft = currentDraft();
  preview.innerHTML = `<div class="entry-date">${draft.date ? formatDate(draft.date) : 'Someday'}</div><h2>${escapeHtml(draft.title)}</h2><div class="entry-meta">${me ? avatarHtml(me,'tiny-avatar') + escapeHtml(me.displayName) : ''}</div><div class="entry-body journal-flow preview-flow">${bodyHtml(draft, true)}</div>`;
  wirePreviewPhotoDrag();
}
function applyFigurePosition(figure, photo) {
  const pos = smartPhotoLayout(photo);
  figure.classList.toggle('left', pos.side === 'left');
  figure.classList.toggle('right', pos.side === 'right');
  figure.classList.toggle('wrap-photo', pos.wraps);
  figure.classList.toggle('block-photo', !pos.wraps);
  figure.style.setProperty('--photo-width', `${pos.width}%`);
  figure.style.setProperty('--photo-offset', `${pos.yPx}px`);
  figure.style.clear = pos.wraps ? 'none' : 'both';
  figure.style.cssFloat = pos.wraps ? pos.side : 'none';
  if (pos.wraps) {
    if (pos.side === 'left') {
      figure.style.marginLeft = `${pos.xPct}%`;
      figure.style.marginRight = '20px';
    } else {
      figure.style.marginRight = `${pos.rightGap}%`;
      figure.style.marginLeft = '20px';
    }
  } else {
    figure.style.marginLeft = `${pos.xPct}%`;
    figure.style.marginRight = '0';
  }
}
function renderPhotoControls() {
  if (!editingPhotos.length) {
    photoControls.innerHTML = '<div class="muted photo-empty">No photos yet. Add one or several and build the page like a real scrapbook.</div>';
    return;
  }
  photoControls.innerHTML = editingPhotos.map((p, i) => {
    const pos = normalizedPhotoPosition(p);
    return `<div class="photo-control" data-index="${i}">
      <img class="control-photo" src="${escapeHtml(p.src)}" alt="Photo ${i+1}" draggable="false" />
      <div class="photo-row"><button type="button" class="side-btn ${pos.side==='left'?'active':''}" data-side="left">← Left side</button><button type="button" class="side-btn ${pos.side==='right'?'active':''}" data-side="right">Right side →</button></div>
      <label class="size-label"><span>Size <b class="size-value">${pos.width}%</b></span><input class="size-range" type="range" min="18" max="90" step="1" value="${pos.width}" /></label>
      <div class="position-row"><span>Position: <b class="position-value">X ${Math.round(pos.xPct)}% · Y ${Math.round(pos.yPx)}px</b></span><button type="button" class="reset-position">Reset</button></div>
      <input class="caption-input" type="text" maxlength="240" value="${escapeHtml(p.caption || '')}" placeholder="Optional little caption" />
      <button type="button" class="remove-photo">Remove photo</button>
    </div>`;
  }).join('');

  photoControls.querySelectorAll('.photo-control').forEach(card => {
    const i = Number(card.dataset.index);
    card.querySelectorAll('.side-btn').forEach(btn => btn.addEventListener('click', () => {
      const width = Number(editingPhotos[i].width) || 42;
      editingPhotos[i].side = btn.dataset.side;
      editingPhotos[i].xPct = btn.dataset.side === 'left' ? 0 : Math.max(0, 100 - width);
      renderPhotoControls(); renderPreview();
    }));
    card.querySelector('.size-range').addEventListener('input', e => {
      const width = Number(e.target.value);
      editingPhotos[i].width = width;
      editingPhotos[i].xPct = Math.min(Number(editingPhotos[i].xPct) || 0, Math.max(0, 100 - width));
      card.querySelector('.size-value').textContent = `${width}%`;
      renderPreview();
    });
    card.querySelector('.caption-input').addEventListener('input', e => { editingPhotos[i].caption = e.target.value; renderPreview(); });
    card.querySelector('.reset-position').addEventListener('click', () => {
      const width = Number(editingPhotos[i].width) || 42;
      const side = editingPhotos[i].side === 'right' ? 'right' : 'left';
      editingPhotos[i].xPct = side === 'right' ? Math.max(0, 100 - width) : 0;
      editingPhotos[i].yPx = 0; editingPhotos[i].offsetY = 0;
      renderPhotoControls(); renderPreview();
    });
    card.querySelector('.remove-photo').addEventListener('click', () => { editingPhotos.splice(i,1); renderPhotoControls(); renderPreview(); });
  });
}
function wirePreviewPhotoDrag() {
  preview.querySelectorAll('.preview-draggable').forEach(figure => {
    const id = figure.dataset.photoId;
    const index = editingPhotos.findIndex(p => String(p.id) === String(id));
    if (index < 0) return;
    let startClientX = 0, startClientY = 0, startX = 0, startY = 0, dragging = false;

    figure.addEventListener('pointerdown', e => {
      if (e.target.closest('figcaption')) return;
      const pos = normalizedPhotoPosition(editingPhotos[index]);
      dragging = true;
      startClientX = e.clientX; startClientY = e.clientY;
      startX = pos.xPct; startY = pos.yPx;
      figure.classList.add('dragging');
      figure.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    figure.addEventListener('pointermove', e => {
      if (!dragging) return;
      const flow = figure.closest('.preview-flow') || preview;
      const rect = flow.getBoundingClientRect();
      const photo = editingPhotos[index];
      const width = Math.max(18, Math.min(90, Number(photo.width) || 42));
      const dxPct = rect.width ? ((e.clientX - startClientX) / rect.width) * 100 : 0;
      const maxX = Math.max(0, 100 - width);
      photo.xPct = Math.max(0, Math.min(maxX, startX + dxPct));
      photo.yPx = Math.max(0, Math.min(900, startY + (e.clientY - startClientY)));
      photo.offsetY = photo.yPx;
      photo.side = photo.xPct + width / 2 >= 50 ? 'right' : 'left';
      applyFigurePosition(figure, photo);
    });

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      figure.classList.remove('dragging');
      renderPhotoControls();
      renderPreview();
    };
    figure.addEventListener('pointerup', finish);
    figure.addEventListener('pointercancel', finish);
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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
}
async function getPushRegistration() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support background notifications.');
  return navigator.serviceWorker.register('/sw.js');
}
async function saveReminderSettings(enabled, reminderTime) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (!enabled) {
    const data = await api('/api/push/settings', { method:'PUT', body:JSON.stringify({ enabled:false, reminderTime, timezone }) });
    if (me) me.notifications = data.settings;
    return data.settings;
  }
  if (!config.pushEnabled || !config.pushPublicKey) throw new Error('Push reminders are not available on this server yet.');
  if (!('Notification' in window)) throw new Error('This browser does not support notifications.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(config.pushPublicKey)
    });
  }
  const data = await api('/api/push/subscribe', {
    method:'POST',
    body:JSON.stringify({ subscription:subscription.toJSON(), enabled:true, reminderTime, timezone })
  });
  if (me) me.notifications = data.settings;
  return data.settings;
}
function updateNotificationStatus() {
  const el = $('#notificationStatus');
  if (!el) return;
  if (!config.pushEnabled) { el.textContent = 'Push reminders are unavailable until the server keys are configured.'; return; }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) { el.textContent = 'This browser does not support web push reminders.'; return; }
  if (Notification.permission === 'denied') { el.textContent = 'Notifications are blocked in your browser settings.'; return; }
  el.textContent = $('#dailyReminderEnabled')?.checked ? 'You will be reminded only on days when you have not written a memory.' : 'Off by default. Turn this on if you want a daily reminder.';
}
function maybeOpenReminderComposer() {
  const params = new URLSearchParams(location.search);
  if (params.get('newMemory') === '1' && activeScrapbook) {
    history.replaceState({}, '', location.pathname);
    setTimeout(() => openEditor(), 250);
  }
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
  maybeOpenReminderComposer();
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
function updateScrapbookDialogForType() {
  const type = $('#scrapbookType').value;
  const personal = type === 'personal';
  $('#personalPrivacyWrap').classList.toggle('hidden', !personal);
  $('#scrapbookHelper').textContent = personal
    ? 'Personal scrapbooks are written only by you. Privacy controls who may read them.'
    : 'After creating it, invite people from the People view using their @tag.';
  if (!$('#scrapbookName').value.trim()) {
    $('#scrapbookName').placeholder = personal ? 'My Personal Scrapbook' : (type === 'couple' ? 'Our Love Story' : 'Our Weekend Crew');
  }
}
$('#createScrapbookBtn').addEventListener('click', () => { updateScrapbookDialogForType(); scrapbookDialog.showModal(); });
$('#scrapbookType').addEventListener('change', updateScrapbookDialogForType);
$('#closeScrapbookDialog').addEventListener('click', () => scrapbookDialog.close());
$('#scrapbookForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#scrapbookError').textContent = '';
  try {
    const type = $('#scrapbookType').value;
    const data = await api('/api/scrapbooks', { method:'POST', body:JSON.stringify({ type, name:$('#scrapbookName').value.trim(), privacy:$('#personalPrivacy').value }) });
    scrapbookDialog.close(); $('#scrapbookName').value = '';
    await loadSession(data.scrapbook.id); showView('connections');
    showToast(type === 'personal' ? 'Personal scrapbook created.' : 'Scrapbook created. Invite someone by @tag.');
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

function renderDiscoverResults(people) {
  const host = $('#discoverResults');
  if (!people?.length) {
    host.innerHTML = '<p class="helper">No matching profiles found.</p>';
    return;
  }
  host.innerHTML = people.map(person => `<article class="discover-person" data-tag="${escapeHtml(person.tag)}">
    ${avatarHtml(person,'small-avatar')}
    <div class="discover-person-copy"><strong>${escapeHtml(person.displayName || person.tag)}</strong><span>@${escapeHtml(person.tag)}</span>${person.bio ? `<small>${escapeHtml(person.bio)}</small>` : ''}</div>
    <div class="discover-badges">${person.isPartner ? '<span>Partner</span>' : ''}${person.followsYou ? '<span>Follows you</span>' : ''}</div>
    <button class="${person.isFollowing ? 'ghost' : 'primary'} follow-toggle" type="button">${person.isFollowing ? 'Following' : 'Follow'}</button>
  </article>`).join('');
  host.querySelectorAll('.follow-toggle').forEach(btn => btn.addEventListener('click', async () => {
    const card = btn.closest('.discover-person');
    const tag = card.dataset.tag;
    const isFollowingNow = btn.textContent.trim() === 'Following';
    try {
      await api(`/api/people/${encodeURIComponent(tag)}/follow`, { method:isFollowingNow ? 'DELETE' : 'POST', body:isFollowingNow ? undefined : '{}' });
      await loadSession(activeScrapbook?.id);
      const q = $('#discoverTag').value.trim();
      if (q) {
        const data = await api(`/api/people?q=${encodeURIComponent(q)}`);
        renderDiscoverResults(data.people || []);
      }
      showToast(isFollowingNow ? `Unfollowed @${tag}.` : `You are now following @${tag}.`);
    } catch (err) { showToast(err.message); }
  }));
}
$('#discoverForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#discoverTag').value.trim();
  if (!q) return;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(q)}`);
    renderDiscoverResults(data.people || []);
  } catch (err) { showToast(err.message); }
});

$('#profileBtn').addEventListener('click', () => {
  if (!me) return;
  pendingProfileAvatar = me.avatar || '';
  $('#profileName').value = me.displayName || '';
  $('#profileTag').value = `@${me.tag}`;
  $('#profileBio').value = me.bio || '';
  $('#dailyReminderEnabled').checked = me.notifications?.enabled === true;
  $('#dailyReminderTime').value = me.notifications?.reminderTime || '20:00';
  $('#profileAvatarLarge').outerHTML = avatarHtml(me, 'large-avatar').replace('class="avatar large-avatar"', 'id="profileAvatarLarge" class="avatar large-avatar"');
  $('#profileError').textContent = '';
  updateNotificationStatus();
  profileDialog.showModal();
});
$('#closeProfileDialog').addEventListener('click', () => profileDialog.close());
$('#dailyReminderEnabled').addEventListener('change', updateNotificationStatus);
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
    const enabled = $('#dailyReminderEnabled').checked;
    const reminderTime = $('#dailyReminderTime').value || '20:00';
    await api('/api/profile', { method:'PUT', body:JSON.stringify({ displayName:$('#profileName').value.trim(), bio:$('#profileBio').value.trim(), avatar:pendingProfileAvatar }) });
    await saveReminderSettings(enabled, reminderTime);
    await loadSession(activeScrapbook?.id);
    profileDialog.close();
    showToast(enabled ? 'Profile saved. Daily reminder is on.' : 'Profile updated.');
    if (currentMode === 'connections') renderConnections();
  } catch (err) { $('#profileError').textContent = err.message; updateNotificationStatus(); }
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

let savedRichRange = null;
function rememberRichSelection() {
  const editor = $('#entryText');
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
  savedRichRange = sel.getRangeAt(0).cloneRange();
}
function restoreRichSelection() {
  if (!savedRichRange) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRichRange);
  return true;
}
function applyRichCommand(command, value = null) {
  const editor = $('#entryText');
  if (!restoreRichSelection()) {
    showToast('Select some journal text first.');
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    showToast('Select some journal text first.');
    return;
  }
  editor.focus({ preventScroll:true });
  document.execCommand(command, false, value);
  rememberRichSelection();
  renderPreview();
}
function changeSelectedTextSize(delta) {
  if (!restoreRichSelection()) return showToast('Select some journal text first.');
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return showToast('Select some journal text first.');
  let current = parseInt(document.queryCommandValue('fontSize'), 10);
  if (!Number.isFinite(current) || current < 1 || current > 7) current = 3;
  applyRichCommand('fontSize', String(Math.max(1, Math.min(7, current + delta))));
}
document.addEventListener('selectionchange', rememberRichSelection);
['richBoldBtn','richItalicBtn','richSmallerBtn','richLargerBtn','richClearBtn'].forEach(id => {
  $('#'+id).addEventListener('pointerdown', e => e.preventDefault());
});
$('#richBoldBtn').addEventListener('click', () => applyRichCommand('bold'));
$('#richItalicBtn').addEventListener('click', () => applyRichCommand('italic'));
$('#richSmallerBtn').addEventListener('click', () => changeSelectedTextSize(-1));
$('#richLargerBtn').addEventListener('click', () => changeSelectedTextSize(1));
$('#richClearBtn').addEventListener('click', () => applyRichCommand('removeFormat'));
$('#richFontSelect').addEventListener('change', e => {
  const face = e.target.value;
  if (face) applyRichCommand('fontName', face);
  e.target.value = '';
});
$('#entryText').addEventListener('paste', e => {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') || '';
  document.execCommand('insertText', false, text);
});
$('#entryText').addEventListener('drop', e => {
  if (e.dataTransfer?.types?.includes('text/html')) e.preventDefault();
});

['entryDate','entryTitle','entryText'].forEach(id => $(`#${id}`).addEventListener('input', renderPreview));
$('#photoInput').addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, Math.max(0, 12 - editingPhotos.length));
  $('#editorError').textContent = '';
  try {
    for (const file of files) {
      const uploaded = await uploadImage(file);
      {
        const side = editingPhotos.length % 2 ? 'right' : 'left';
        editingPhotos.push({ id:crypto.randomUUID?.() || String(Date.now()+Math.random()), src:uploaded.src, side, width:42, xPct:side === 'right' ? 58 : 0, yPx:0, offsetY:0, caption:'' });
      }
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
