const $ = sel => document.querySelector(sel);
const lockScreen = $('#lockScreen');
const journalApp = $('#journalApp');
const coverStage = $('#coverStage');
const bookView = $('#bookView');
const streamView = $('#streamView');
const homeView = $('#homeView');
const connectionsView = $('#connectionsView');
const personProfileView = $('#personProfileView');
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
let homeData = { followingShelf: [], friendSuggestions: [] };
let notificationSummary = { count: 0, pendingInvites: 0 };
let notificationItems = [];
let viewedPersonData = null;
let personListMode = 'followers';
let personProfileReturnMode = 'connections';
let guideState = { version: 2, seenVersion: 1, required: false };
let guideIndex = 0;
let guideMandatory = false;
let guideRunning = false;
let partnerTag = null;
let activeScrapbook = null;
let spreadIndex = 0;
let currentMode = 'cover';
let editingId = null;
let editingPhotos = [];
let editingCanvasItems = [];
let editingCanvasSize = 'medium';
let editingCanvasLined = false;
let editingCanvasZoom = 1;
let canvasZoomMode = 'fit';
let canvasGesturePinching = false;
const canvasGesturePointers = new Map();
let canvasPinchState = null;
let selectedCanvasItemId = null;
let savedCanvasTextRange = null;
let me = null;
let pendingProfileAvatar = '';
let profileViewerScale = 1;
let profileViewerX = 0;
let profileViewerY = 0;
const profileViewerPointers = new Map();
let profileViewerGesture = null;
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

function canvasFontClass(font) {
  return ['serif','sans','hand','mono'].includes(font) ? `canvas-font-${font}` : 'canvas-font-serif';
}
function normalizeCanvasSize(value) {
  return ['small','medium','large','wide'].includes(value) ? value : 'medium';
}
function canvasSizeMeta(value) {
  const size = normalizeCanvasSize(value);
  return {
    small:  { label:'Small portrait', width:420, height:567 },
    medium: { label:'Medium portrait', width:620, height:837 },
    large:  { label:'Large portrait', width:820, height:1107 },
    wide:   { label:'Wide landscape', width:960, height:600 }
  }[size];
}
function clampCanvasZoom(value) {
  return Math.max(0.25, Math.min(2.5, Number(value) || 1));
}
function updateCanvasZoomLabel() {
  const el = $('#canvasZoomValue');
  if (el) el.textContent = `${Math.round(editingCanvasZoom * 100)}%`;
}
function canvasNavigationGutter() {
  const stage = $('#scrapCanvasStage');
  const stageWidth = stage?.clientWidth || 360;
  const stageHeight = stage?.clientHeight || 500;
  return {
    x: Math.max(54, Math.round(stageWidth * 0.55)),
    y: Math.max(72, Math.round(stageHeight * 0.48))
  };
}
function layoutCanvasViewport() {
  const viewport = $('#scrapCanvasViewport');
  const canvas = $('#scrapCanvas');
  if (!viewport || !canvas) return;
  const meta = canvasSizeMeta(editingCanvasSize);
  const gutter = canvasNavigationGutter();
  const scaledWidth = Math.round(meta.width * editingCanvasZoom);
  const scaledHeight = Math.round(meta.height * editingCanvasZoom);

  canvas.style.width = `${meta.width}px`;
  canvas.style.height = `${meta.height}px`;
  canvas.style.left = `${gutter.x}px`;
  canvas.style.top = `${gutter.y}px`;
  canvas.style.transform = `scale(${editingCanvasZoom})`;

  viewport.style.width = `${scaledWidth + gutter.x * 2}px`;
  viewport.style.height = `${scaledHeight + gutter.y * 2}px`;
  viewport.style.setProperty('--canvas-gutter-x', `${gutter.x}px`);
  viewport.style.setProperty('--canvas-gutter-y', `${gutter.y}px`);
  updateCanvasZoomLabel();
}
function centerCanvasInStage() {
  const stage = $('#scrapCanvasStage');
  const canvas = $('#scrapCanvas');
  if (!stage || !canvas) return;
  const meta = canvasSizeMeta(editingCanvasSize);
  const scaledWidth = meta.width * editingCanvasZoom;
  const scaledHeight = meta.height * editingCanvasZoom;
  const canvasCenterX = canvas.offsetLeft + scaledWidth / 2;
  const canvasCenterY = canvas.offsetTop + scaledHeight / 2;
  stage.scrollLeft = Math.max(0, canvasCenterX - stage.clientWidth / 2);
  stage.scrollTop = Math.max(0, canvasCenterY - stage.clientHeight / 2);
}
function changeCanvasZoom(nextZoom, options = {}) {
  const stage = $('#scrapCanvasStage');
  const viewport = $('#scrapCanvasViewport');
  const canvas = $('#scrapCanvas');
  if (!stage || !viewport || !canvas) return;
  const oldZoom = editingCanvasZoom;
  const next = clampCanvasZoom(nextZoom);
  const stageRect = stage.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const oldClientX = options.oldClientX ?? (stageRect.left + stage.clientWidth / 2);
  const oldClientY = options.oldClientY ?? (stageRect.top + stage.clientHeight / 2);
  const newClientX = options.newClientX ?? oldClientX;
  const newClientY = options.newClientY ?? oldClientY;
  const meta = canvasSizeMeta(editingCanvasSize);
  const pageX = Math.max(0, Math.min(meta.width, (oldClientX - canvasRect.left) / oldZoom));
  const pageY = Math.max(0, Math.min(meta.height, (oldClientY - canvasRect.top) / oldZoom));

  editingCanvasZoom = next;
  canvasZoomMode = options.mode || 'manual';
  layoutCanvasViewport();

  if (options.preserveAnchor !== false) {
    const nextStageRect = stage.getBoundingClientRect();
    stage.scrollLeft = canvas.offsetLeft + pageX * next - (newClientX - nextStageRect.left);
    stage.scrollTop = canvas.offsetTop + pageY * next - (newClientY - nextStageRect.top);
  }
}
function fitCanvasToStage({ resetScroll = true } = {}) {
  const stage = $('#scrapCanvasStage');
  if (!stage || !stage.clientWidth) return;
  const meta = canvasSizeMeta(editingCanvasSize);
  const breathingRoom = window.matchMedia('(max-width:800px)').matches ? 34 : 48;
  const available = Math.max(160, stage.clientWidth - breathingRoom);
  editingCanvasZoom = clampCanvasZoom(Math.min(1, available / meta.width));
  canvasZoomMode = 'fit';
  layoutCanvasViewport();
  if (resetScroll) centerCanvasInStage();
}
function canvasPinchGeometry() {
  const points = [...canvasGesturePointers.values()];
  if (points.length < 2) return null;
  const a = points[0], b = points[1];
  return {
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}
function initCanvasViewportGestures() {
  const stage = $('#scrapCanvasStage');
  if (!stage || stage.dataset.gesturesReady === '1') return;
  stage.dataset.gesturesReady = '1';
  let panState = null;

  const isCanvasObjectTarget = target => Boolean(target?.closest?.(
    '.canvas-photo-item,.canvas-drag-handle,.canvas-resize-handle,.canvas-remove-item,.canvas-text-content,.canvas-text-inspector,.canvas-zoom-controls,button,input,select,label'
  ));

  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    canvasGesturePointers.set(e.pointerId, { x:e.clientX, y:e.clientY });

    if (canvasGesturePointers.size >= 2) {
      panState = null;
      const g = canvasPinchGeometry();
      canvasGesturePinching = true;
      canvasPinchState = g ? { distance:g.distance, x:g.x, y:g.y } : null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!isCanvasObjectTarget(e.target)) {
      clearCanvasSelection();
      panState = {
        pointerId:e.pointerId,
        x:e.clientX,
        y:e.clientY,
        left:stage.scrollLeft,
        top:stage.scrollTop
      };
      try { stage.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  stage.addEventListener('pointermove', e => {
    if (!canvasGesturePointers.has(e.pointerId)) return;
    canvasGesturePointers.set(e.pointerId, { x:e.clientX, y:e.clientY });

    if (canvasGesturePinching && canvasGesturePointers.size >= 2 && canvasPinchState) {
      const g = canvasPinchGeometry();
      if (!g) return;
      const ratio = g.distance / Math.max(1, canvasPinchState.distance);
      changeCanvasZoom(editingCanvasZoom * ratio, {
        oldClientX:canvasPinchState.x,
        oldClientY:canvasPinchState.y,
        newClientX:g.x,
        newClientY:g.y,
        preserveAnchor:true,
        mode:'manual'
      });
      canvasPinchState = { distance:g.distance, x:g.x, y:g.y };
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (panState && panState.pointerId === e.pointerId && canvasGesturePointers.size === 1) {
      stage.scrollLeft = panState.left - (e.clientX - panState.x);
      stage.scrollTop = panState.top - (e.clientY - panState.y);
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  const finishPointer = e => {
    canvasGesturePointers.delete(e.pointerId);
    if (panState?.pointerId === e.pointerId) panState = null;
    if (canvasGesturePointers.size >= 2) {
      const g = canvasPinchGeometry();
      canvasPinchState = g ? { distance:g.distance, x:g.x, y:g.y } : null;
      return;
    }
    canvasPinchState = null;
    if (canvasGesturePointers.size === 0) canvasGesturePinching = false;
  };
  stage.addEventListener('pointerup', finishPointer, true);
  stage.addEventListener('pointercancel', finishPointer, true);

  stage.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    changeCanvasZoom(editingCanvasZoom * factor, {
      oldClientX:e.clientX,
      oldClientY:e.clientY,
      newClientX:e.clientX,
      newClientY:e.clientY,
      preserveAnchor:true,
      mode:'manual'
    });
  }, { passive:false });
}
function canvasItemStyle(item) {
  const x = Math.max(0, Math.min(94, Number(item.x) || 0));
  const y = Math.max(0, Math.min(94, Number(item.y) || 0));
  const w = Math.max(12, Math.min(96, Number(item.w) || 35));
  const h = Math.max(8, Math.min(90, Number(item.h) || 20));
  const z = Math.max(1, Math.min(999, Number(item.z) || 1));
  return `left:${x}%;top:${y}%;width:${w}%;height:${h}%;z-index:${z}`;
}
function savedCanvasHtml(entry) {
  const items = Array.isArray(entry?.canvasItems) ? [...entry.canvasItems].sort((a,b)=>(a.z||0)-(b.z||0)) : [];
  if (!items.length) return '';
  const canvasSize = normalizeCanvasSize(entry?.canvasSize);
  const linedClass = entry?.canvasLined === true ? ' canvas-lined' : '';
  return `<div class="saved-canvas canvas-size-${canvasSize}${linedClass}">${items.map(item => {
    if (item.type === 'photo') {
      return `<figure class="saved-canvas-item saved-photo-item" style="${canvasItemStyle(item)}"><img src="${escapeHtml(item.src)}" alt="Scrapbook photo" loading="lazy" />${item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}</figure>`;
    }
    const fontClass = canvasFontClass(item.font);
    const weight = item.bold ? 'font-weight:700;' : '';
    const style = item.italic ? 'font-style:italic;' : '';
    const size = Math.max(7, Math.min(42, Number(item.size) || 18));
    return `<div class="saved-canvas-item saved-text-item ${fontClass}" style="${canvasItemStyle(item)};--canvas-text-size:${size}px;--canvas-text-cqw:${(size/5.6).toFixed(3)}cqw;${weight}${style}"><div class="saved-text-content">${String(item.html || '')}</div></div>`;
  }).join('')}</div>`;
}
function entryContentHtml(entry) {
  return Array.isArray(entry?.canvasItems) && entry.canvasItems.length
    ? savedCanvasHtml(entry)
    : `<div class="journal-flow">${bodyHtml(entry)}</div>`;
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
    <div class="entry-body canvas-entry-body">${entryContentHtml(entry)}</div>
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
      <div class="entry-body canvas-entry-body">${entryContentHtml(entry)}</div>
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
function isBookCoverOpen() {
  return $('#introBook').classList.contains('open');
}
function syncBookCoverControls() {
  const open = isBookCoverOpen();
  const button = $('#openBookBtn');
  const book = $('#introBook');
  button.textContent = open ? 'Close the book' : 'Open the book';
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Close the book' : 'Open the book');
  book.setAttribute('aria-expanded', String(open));
  book.setAttribute('aria-label', open ? 'Close the scrapbook' : 'Open the scrapbook');
  book.title = open ? 'Close the scrapbook' : 'Open the scrapbook';
}
function setBookCoverOpen(open) {
  $('#introBook').classList.toggle('open', open === true);
  syncBookCoverControls();
}
async function toggleBookCover() {
  if (!activeScrapbook) {
    await refreshAndShow('connections', null);
    return;
  }
  if (isBookCoverOpen()) {
    setBookCoverOpen(false);
    showView('cover');
    return;
  }
  try {
    const currentId = activeScrapbook.id;
    const latest = await refreshLiveData(currentId);
    if (!latest || !activeScrapbook || activeScrapbook.id !== currentId) return;
    setBookCoverOpen(true);
    setTimeout(() => {
      if (isBookCoverOpen()) showView('book');
    }, 720);
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not refresh the scrapbook.');
  }
}

function updateCover() {
  $('#coverTitle').textContent = activeBookLabel();
  syncBookCoverControls();
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
function renderNotificationBadge() {
  const badge = $('#notificationBadge');
  if (!badge) return;
  const count = Math.max(0, Number(notificationSummary.count) || 0);
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
  $('#notificationBtn')?.classList.toggle('has-notifications', count > 0);
}
function notificationWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const delta = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
function closeNotificationHub() {
  $('#notificationPanel')?.classList.add('hidden');
  $('#notificationBtn')?.setAttribute('aria-expanded','false');
}
function renderNotificationHub() {
  const host = $('#notificationList');
  if (!host) return;
  if (!notificationItems.length) {
    host.innerHTML = '<div class="notification-empty"><span>♡</span><strong>All caught up.</strong><p>New followers and scrapbook invitations will appear here.</p></div>';
    return;
  }
  host.innerHTML = notificationItems.map(item => {
    const actor = item.actor || {};
    if (item.type === 'follow') {
      return `<article class="notification-item ${item.unread ? 'unread' : ''}">
        <button class="notification-actor notification-profile-link" type="button" data-tag="${escapeHtml(actor.tag || '')}">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>@${escapeHtml(actor.tag || '')} followed you</small></span>
        </button>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
      </article>`;
    }
    const isCouple = item.type === 'couple_invite';
    return `<article class="notification-item invite-notification" data-invite-id="${escapeHtml(item.inviteId || '')}">
      <button class="notification-actor notification-profile-link" type="button" data-tag="${escapeHtml(actor.tag || '')}">
        ${avatarHtml(actor,'notification-avatar')}
        <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>${isCouple ? 'invited you to a Lovers binding' : 'invited you to a Group scrapbook'}</small></span>
      </button>
      <div class="notification-invite-copy"><b>${escapeHtml(item.scrapbook?.name || (isCouple ? 'Lovers scrapbook' : 'Group scrapbook'))}</b><time>${escapeHtml(notificationWhen(item.createdAt))}</time></div>
      <div class="notification-invite-actions">
        <button class="ghost notification-decline" type="button">Decline</button>
        <button class="primary notification-accept" type="button">Accept</button>
      </div>
    </article>`;
  }).join('');
  host.querySelectorAll('.notification-profile-link').forEach(btn => btn.addEventListener('click', async () => {
    const tag = btn.dataset.tag;
    if (!tag) return;
    closeNotificationHub();
    await openPersonProfile(tag);
  }));
  host.querySelectorAll('.notification-accept').forEach(btn => btn.addEventListener('click', async () => {
    await respondNotificationInvite(btn.closest('.invite-notification')?.dataset.inviteId, true);
  }));
  host.querySelectorAll('.notification-decline').forEach(btn => btn.addEventListener('click', async () => {
    await respondNotificationInvite(btn.closest('.invite-notification')?.dataset.inviteId, false);
  }));
}
async function loadNotificationHub({ markRead = true } = {}) {
  try {
    const data = await api('/api/notifications');
    notificationItems = data.items || [];
    notificationSummary = { count:data.unreadCount || 0, pendingInvites:data.pendingInviteCount || 0 };
    renderNotificationHub();
    renderNotificationBadge();
    $('#notificationPanel').classList.remove('hidden');
    $('#notificationBtn').setAttribute('aria-expanded','true');
    if (markRead) {
      const read = await api('/api/notifications/read', { method:'POST', body:'{}' });
      notificationItems = notificationItems.map(item => item.type === 'follow' ? { ...item, unread:false } : item);
      notificationSummary = { count:read.unreadCount || 0, pendingInvites:read.pendingInviteCount || 0 };
      renderNotificationBadge();
      renderNotificationHub();
    }
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not load notifications.');
  }
}
async function respondNotificationInvite(inviteId, accept) {
  if (!inviteId) return;
  try {
    const currentId = activeScrapbook?.id || null;
    const data = await api(`/api/invites/${encodeURIComponent(inviteId)}/respond`, {
      method:'POST',
      body:JSON.stringify({ accept })
    });
    await loadSession(currentId || data.scrapbook?.id || null);
    await loadNotificationHub({ markRead:false });
    showToast(accept ? 'Invitation accepted.' : 'Invitation declined.');
  } catch (err) {
    showToast(err.message || 'Could not respond to that invitation.');
    await loadNotificationHub({ markRead:false });
  }
}
async function refreshNotificationCount() {
  if (journalApp.classList.contains('hidden')) return;
  try {
    const data = await api('/api/notifications');
    notificationSummary = { count:data.unreadCount || 0, pendingInvites:data.pendingInviteCount || 0 };
    renderNotificationBadge();
    if (!$('#notificationPanel').classList.contains('hidden')) {
      notificationItems = data.items || [];
      renderNotificationHub();
    }
  } catch {}
}

function renderInviteBanner() {
  const banner = $('#inviteBanner');
  banner.classList.add('hidden');
  banner.innerHTML = '';
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
  el.innerHTML = `<button class="follow-stat-button" type="button" data-list="followers"><b>${followers.length}</b><span>followers</span></button><button class="follow-stat-button" type="button" data-list="following"><b>${following.length}</b><span>following</span></button>`;
  el.querySelectorAll('.follow-stat-button').forEach(btn => btn.addEventListener('click', () => openPersonProfile(me.tag, { list:btn.dataset.list })));
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
    $('#peopleMap').innerHTML = `<button class="personal-owner-card profile-card-button" type="button" data-profile-tag="${escapeHtml(owner.tag)}">${avatarHtml(owner,'bound-avatar')}<strong>${escapeHtml(owner.displayName || owner.tag)}</strong><span>@${escapeHtml(owner.tag)}</span><small>${privacyLabel(activeScrapbook.privacy)}</small></button>`;
    wireProfileLinks($('#peopleMap'));
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
      <button class="bound-profile profile-card-button" type="button" data-profile-tag="${escapeHtml(mine.tag)}">${avatarHtml(mine, 'bound-avatar')}<strong>${escapeHtml(mine.displayName)}</strong><span>@${escapeHtml(mine.tag)}</span></button>
      <div class="heart-bind"><span>♡</span><small>${archived ? 'UNBOUND ARCHIVE' : (other ? 'BOUND' : 'WAITING')}</small></div>
      ${other ? `<button class="bound-profile profile-card-button" type="button" data-profile-tag="${escapeHtml(other.tag)}">${avatarHtml(other, 'bound-avatar')}<strong>${escapeHtml(other.displayName)}</strong><span>@${escapeHtml(other.tag)}</span></button>` : `<div class="bound-profile empty-bound"><span class="avatar bound-avatar">?</span><strong>Your person</strong><span>Invite by @tag</span></div>`}
    </div>`;
    wireProfileLinks($('#peopleMap'));
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
    <button class="network-person center-person profile-card-button" type="button" data-profile-tag="${escapeHtml(mine.tag)}" style="left:50%;top:50%">${avatarHtml(mine, 'network-avatar')}<strong>${escapeHtml(mine.displayName)}</strong><span>@${escapeHtml(mine.tag)}</span></button>
    ${points.map(pt => `<button class="network-person profile-card-button" type="button" data-profile-tag="${escapeHtml(pt.p.tag)}" style="left:${pt.x}%;top:${pt.y}%">${avatarHtml(pt.p, 'network-avatar')}<strong>${escapeHtml(pt.p.displayName)}</strong><span>@${escapeHtml(pt.p.tag)}</span></button>`).join('')}
    ${!others.length ? '<div class="network-empty">Invite friends by @tag and they will connect around you.</div>' : ''}
  </div>`;
  wireProfileLinks($('#peopleMap'));
}

const GUIDE_STEPS = [
  {
    selector:'#homeModeBtn',
    eyebrow:'WELCOME HOME',
    title:'This is your scrapbook home.',
    text:'Home is your starting point. It shows people you follow, the Personal scrapbooks they share with you, and friends-of-friends you may know.',
    prepare:() => showView('home')
  },
  {
    selector:'.scrapbook-picker-wrap',
    eyebrow:'YOUR SCRAPBOOKS',
    title:'Create or switch books here.',
    text:'Use the scrapbook selector to move between your Personal, Lovers, and Group scrapbooks. Tap the + button beside it when you want to create a new scrapbook.'
  },
  {
    selector:'.mode-switch',
    eyebrow:'WAYS TO REMEMBER',
    title:'Choose how you want to view memories.',
    text:'Book gives you the page-flip experience. Memory Stream shows memories continuously by date. People manages members, followers, privacy, and invitations.'
  },
  {
    selector:'#newEntryBtn',
    eyebrow:'WRITE A MEMORY',
    title:'New Memory opens the scrapbook designer.',
    text:'Once you have a scrapbook, use New Memory to create a page. You can choose the date and title before designing the page.',
    prepare:() => {
      showView('cover');
      $('#newEntryBtn').classList.remove('hidden');
    }
  },
  {
    selector:'#newEntryBtn',
    eyebrow:'DESIGN YOUR PAGE',
    title:'Photos first, then movable text.',
    text:'Inside the designer: add photos, drag and resize them, then add one or more text boxes. Text boxes can move independently and use different fonts, sizes, bold, or italic.',
    tip:'On phones: drag blank paper to pan, pinch with two fingers to zoom, and use Fit whenever you want the whole sheet back in view.'
  },
  {
    selector:'#connectionsModeBtn',
    eyebrow:'PEOPLE & PRIVACY',
    title:'People connects your scrapbook circle.',
    text:'Search @tags, follow people, invite members to Group or Lovers scrapbooks, manage your Personal scrapbook privacy, and see your relationship connections.',
    prepare:() => showView('connections')
  },
  {
    selector:'#notificationBtn',
    eyebrow:'STAY IN THE LOOP',
    title:'The bell keeps your scrapbook circle together.',
    text:'New followers and Lovers or Group scrapbook invitations appear here. Invitations can be accepted or declined without leaving what you are doing.',
    prepare:() => { closeNotificationHub(); showView('home'); }
  },
  {
    selector:'#profileBtn',
    eyebrow:'YOUR PROFILE',
    title:'Your identity travels with your memories.',
    text:'Use Profile to update your picture, display name, bio, and notification preferences. Your @tag stays your unique account identity.'
  },
  {
    selector:'#guideBtn',
    eyebrow:'NEED THIS AGAIN?',
    title:'The guide is always one tap away.',
    text:'Tap the ⓘ button anytime to replay this guide. When the scrapbook gets a major new feature, the guide version can update and show you what changed.',
    prepare:() => showView('home')
  }
];

function guideTarget(step) {
  const el = step?.selector ? document.querySelector(step.selector) : null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return el;
}
function positionGuideSpotlight() {
  if (!guideRunning) return;
  const step = GUIDE_STEPS[guideIndex];
  const target = guideTarget(step);
  const spot = $('#guideSpotlight');
  if (!target) {
    spot.classList.add('guide-no-target');
    spot.style.cssText = '';
    return;
  }
  const rect = target.getBoundingClientRect();
  const pad = window.innerWidth <= 600 ? 5 : 7;
  spot.classList.remove('guide-no-target');
  spot.style.left = `${Math.max(4, rect.left - pad)}px`;
  spot.style.top = `${Math.max(4, rect.top - pad)}px`;
  spot.style.width = `${Math.min(window.innerWidth - 8, rect.width + pad * 2)}px`;
  spot.style.height = `${Math.min(window.innerHeight - 8, rect.height + pad * 2)}px`;
}
function renderGuideStep() {
  if (!guideRunning) return;
  const step = GUIDE_STEPS[guideIndex];
  step.prepare?.();
  requestAnimationFrame(() => {
    const target = guideTarget(step);
    target?.scrollIntoView?.({ block:'nearest', inline:'nearest', behavior:'smooth' });
    setTimeout(positionGuideSpotlight, 160);
  });

  $('#guideStepLabel').textContent = `${guideIndex + 1} of ${GUIDE_STEPS.length}`;
  $('#guideProgressBar').style.width = `${((guideIndex + 1) / GUIDE_STEPS.length) * 100}%`;
  $('#guideEyebrow').textContent = step.eyebrow;
  $('#guideTitle').textContent = step.title;
  $('#guideText').textContent = step.text;
  const tip = $('#guideTip');
  tip.textContent = step.tip || '';
  tip.classList.toggle('hidden', !step.tip);
  $('#guideBackBtn').classList.toggle('hidden', guideIndex === 0);
  $('#guideNextBtn').textContent = guideIndex === GUIDE_STEPS.length - 1 ? 'Start journaling' : 'Next';
  $('#guideCloseBtn').classList.toggle('hidden', guideMandatory);
}
function startGuide(required = false) {
  if (guideRunning) return;
  guideMandatory = required === true;
  guideIndex = 0;
  guideRunning = true;
  if (editorDialog.open) editorDialog.close();
  if (scrapbookDialog.open) scrapbookDialog.close();
  if (profileDialog.open) profileDialog.close();
  showView('home');
  $('#guideOverlay').classList.remove('hidden');
  document.body.classList.add('guide-active');
  renderGuideStep();
}
async function finishGuide({ completed = true } = {}) {
  if (!guideRunning) return;
  const wasMandatory = guideMandatory;
  if (completed) {
    try {
      const result = await api('/api/guide/complete', {
        method:'POST',
        body:JSON.stringify({ version: guideState.version || 1 })
      });
      guideState = result.guide || { ...guideState, required:false, seenVersion:guideState.version };
    } catch (err) {
      if (wasMandatory) {
        showToast('Please reconnect so the guide can be marked complete.');
        return;
      }
    }
  }
  guideRunning = false;
  guideMandatory = false;
  $('#guideOverlay').classList.add('hidden');
  document.body.classList.remove('guide-active');
  $('#guideSpotlight').style.cssText = '';
  showView('home');
  if (wasMandatory) maybeOpenReminderComposer();
}
$('#guideNextBtn').addEventListener('click', async () => {
  if (guideIndex >= GUIDE_STEPS.length - 1) {
    await finishGuide({ completed:true });
    return;
  }
  guideIndex += 1;
  renderGuideStep();
});
$('#guideBackBtn').addEventListener('click', () => {
  if (guideIndex <= 0) return;
  guideIndex -= 1;
  renderGuideStep();
});
$('#guideCloseBtn').addEventListener('click', () => {
  if (!guideMandatory) finishGuide({ completed:false });
});
$('#guideOverlay').addEventListener('pointerdown', e => {
  if (!e.target.closest('.guide-card')) {
    e.preventDefault();
    e.stopPropagation();
  }
});
window.addEventListener('resize', () => {
  if (guideRunning) requestAnimationFrame(positionGuideSpotlight);
});
window.addEventListener('scroll', () => {
  if (guideRunning) requestAnimationFrame(positionGuideSpotlight);
}, true);
document.addEventListener('keydown', e => {
  if (!guideRunning || e.key !== 'Escape') return;
  e.preventDefault();
  if (!guideMandatory) finishGuide({ completed:false });
});

function applyProfileImageTransform() {
  const img = $('#profileImageViewerImg');
  if (!img) return;
  img.style.transform = `translate3d(${profileViewerX}px,${profileViewerY}px,0) scale(${profileViewerScale})`;
  $('#profileImageZoomValue').textContent = `${Math.round(profileViewerScale * 100)}%`;
}
function setProfileImageScale(value) {
  profileViewerScale = Math.max(1, Math.min(5, Number(value) || 1));
  if (profileViewerScale <= 1.001) {
    profileViewerScale = 1;
    profileViewerX = 0;
    profileViewerY = 0;
  }
  applyProfileImageTransform();
}
function openProfileImageViewer(profile) {
  if (!profile?.avatar) return;
  $('#profileImageViewerImg').src = profile.avatar;
  $('#profileImageViewerImg').alt = `${profile.displayName || profile.tag || 'Profile'} profile photo`;
  $('#profileImageViewerTitle').textContent = `${profile.displayName || '@'+profile.tag} · profile photo`;
  profileViewerScale = 1;
  profileViewerX = 0;
  profileViewerY = 0;
  profileViewerPointers.clear();
  profileViewerGesture = null;
  applyProfileImageTransform();
  $('#profileImageViewer').classList.remove('hidden');
  document.body.classList.add('profile-image-viewing');
}
function closeProfileImageViewer() {
  $('#profileImageViewer').classList.add('hidden');
  document.body.classList.remove('profile-image-viewing');
  profileViewerPointers.clear();
  profileViewerGesture = null;
}
function profileViewerGeometry() {
  const pts = [...profileViewerPointers.values()];
  if (pts.length < 2) return null;
  const a=pts[0], b=pts[1];
  return { distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)), x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
}

function publicPersonRow(person) {
  return `<button class="person-list-row" type="button" data-profile-tag="${escapeHtml(person.tag || '')}">
    ${avatarHtml(person,'person-list-avatar')}
    <span class="person-list-copy">
      <strong>${escapeHtml(person.displayName || person.tag)}</strong>
      <small>@${escapeHtml(person.tag || '')}</small>
      ${person.bio ? `<em>${escapeHtml(person.bio)}</em>` : ''}
    </span>
    <span class="person-list-arrow">›</span>
  </button>`;
}
function wireProfileLinks(root = document) {
  root.querySelectorAll('[data-profile-tag]').forEach(el => {
    if (el.dataset.profileWired === '1') return;
    el.dataset.profileWired = '1';
    el.addEventListener('click', e => {
      if (e.target.closest('button.follow-toggle,button.home-follow-suggestion,button.person-follow-toggle,.home-open-book')) return;
      const tag = el.dataset.profileTag || el.closest('[data-profile-tag]')?.dataset.profileTag;
      if (tag) openPersonProfile(tag);
    });
  });
}
function renderPersonConnections() {
  if (!viewedPersonData) return;
  const list = personListMode === 'following' ? viewedPersonData.following : viewedPersonData.followers;
  $('#personConnectionsTitle').textContent = personListMode === 'following' ? 'Following' : 'Followers';
  $('#personFollowersTab').classList.toggle('active', personListMode === 'followers');
  $('#personFollowingTab').classList.toggle('active', personListMode === 'following');
  $('#personConnectionsList').innerHTML = list?.length
    ? list.map(publicPersonRow).join('')
    : `<div class="person-list-empty">No ${personListMode === 'following' ? 'following' : 'followers'} yet.</div>`;
  wireProfileLinks($('#personConnectionsList'));
}
function renderPersonProfile() {
  if (!viewedPersonData) return;
  const data = viewedPersonData;
  const p = data.profile || {};
  const personAvatarMarkup = !data.isSelf && p.avatar
    ? `<button id="personAvatarZoomBtn" class="person-avatar-zoom" type="button" aria-label="Enlarge ${escapeHtml(p.displayName || p.tag)} profile photo">${avatarHtml(p,'person-profile-avatar')}<small>Tap to enlarge</small></button>`
    : avatarHtml(p,'person-profile-avatar');
  $('#personProfileIdentity').innerHTML = `
    ${personAvatarMarkup}
    <div>
      <p class="eyebrow">${data.isSelf ? 'YOUR SOCIAL PROFILE' : 'SCRAPBOOK PROFILE'}</p>
      <h2>${escapeHtml(p.displayName || p.tag)}</h2>
      <span>@${escapeHtml(p.tag || '')}</span>
      ${p.bio ? `<p>${escapeHtml(p.bio)}</p>` : '<p class="muted">No bio yet.</p>'}
      <div class="person-relation-badges">${data.isPartner ? '<span>Partner</span>' : ''}${data.followsYou ? '<span>Follows you</span>' : ''}${data.isFollowing ? '<span>You follow</span>' : ''}</div>
    </div>`;
  $('#personFollowerCount').textContent = String(data.followerCount || 0);
  $('#personFollowingCount').textContent = String(data.followingCount || 0);

  $('#personProfileActions').innerHTML = data.isSelf
    ? '<button id="personEditOwnProfile" class="ghost" type="button">Edit my profile</button>'
    : `<button class="${data.isFollowing ? 'ghost' : 'primary'} person-follow-toggle" type="button">${data.isFollowing ? 'Following' : 'Follow'}</button>`;

  const book = data.personalScrapbook;
  if (!book) {
    $('#personScrapbookPanel').innerHTML = '<div class="person-no-book"><span>♡</span><strong>No Personal scrapbook yet</strong><p>This profile has not created a Personal scrapbook.</p></div>';
  } else if (!book.accessible) {
    $('#personScrapbookPanel').innerHTML = `<div class="person-book-layout">
      <div class="person-book-copy"><p class="eyebrow">PERSONAL SCRAPBOOK</p><h3>Private scrapbook</h3><p>This scrapbook exists, but its privacy settings do not currently give you access.</p></div>
      <div class="person-closed-book locked"><div class="person-book-spine"></div><div class="person-book-face"><span>🔒</span><small>PERSONAL SCRAPBOOK</small><strong>Private</strong></div></div>
    </div>`;
  } else {
    $('#personScrapbookPanel').innerHTML = `<div class="person-book-layout">
      <div class="person-book-copy"><p class="eyebrow">PERSONAL SCRAPBOOK</p><h3>${escapeHtml(book.name || 'Personal Scrapbook')}</h3><p>Shared with you. Open it as a flip book or read it as a continuous memory stream.</p><div class="person-book-actions"><button class="primary person-open-book" data-id="${escapeHtml(book.id)}" data-mode="book" type="button">Open book</button><button class="ghost person-open-book" data-id="${escapeHtml(book.id)}" data-mode="stream" type="button">Memory stream</button></div></div>
      <button class="person-closed-book person-book-tap" data-id="${escapeHtml(book.id)}" type="button" aria-label="Open ${escapeHtml(book.name || 'Personal scrapbook')}"><div class="person-book-spine"></div><div class="person-book-face"><span>✦</span><small>PERSONAL SCRAPBOOK</small><strong>${escapeHtml(book.name || 'Personal Scrapbook')}</strong><em>tap to open</em></div></button>
    </div>`;
  }

  $('#personAvatarZoomBtn')?.addEventListener('click', () => openProfileImageViewer(p));
  $('#personEditOwnProfile')?.addEventListener('click', () => $('#profileBtn').click());
  $('#personProfileActions .person-follow-toggle')?.addEventListener('click', async e => {
    const wasFollowing = data.isFollowing === true;
    e.currentTarget.disabled = true;
    try {
      await api(`/api/people/${encodeURIComponent(p.tag)}/follow`, { method:wasFollowing ? 'DELETE' : 'POST', body:wasFollowing ? undefined : '{}' });
      await loadSession(activeScrapbook?.id || null);
      await openPersonProfile(p.tag, { preserveReturn:true, list:personListMode });
      showToast(wasFollowing ? `Unfollowed @${p.tag}.` : `You are now following @${p.tag}.`);
    } catch (err) {
      showToast(err.message);
      e.currentTarget.disabled = false;
    }
  });
  $('#personScrapbookPanel').querySelectorAll('.person-open-book,.person-book-tap').forEach(btn => btn.addEventListener('click', async () => {
    await openHomeScrapbook(btn.dataset.id, btn.dataset.mode || 'book');
  }));
  renderPersonConnections();
}
async function openPersonProfile(tag, options = {}) {
  const cleanTag = String(tag || '').replace(/^@/,'').toLowerCase();
  if (!cleanTag) return;
  if (currentMode !== 'person' && !options.preserveReturn) personProfileReturnMode = currentMode;
  if (options.list === 'following' || options.list === 'followers') personListMode = options.list;
  try {
    viewedPersonData = await api(`/api/people/${encodeURIComponent(cleanTag)}/profile`);
    renderPersonProfile();
    showView('person');
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not open that profile.');
  }
}

$('#personFollowersBtn').addEventListener('click', () => { personListMode='followers'; renderPersonConnections(); $('#personConnectionsList').scrollIntoView({behavior:'smooth',block:'nearest'}); });
$('#personFollowingBtn').addEventListener('click', () => { personListMode='following'; renderPersonConnections(); $('#personConnectionsList').scrollIntoView({behavior:'smooth',block:'nearest'}); });
$('#personFollowersTab').addEventListener('click', () => { personListMode='followers'; renderPersonConnections(); });
$('#personFollowingTab').addEventListener('click', () => { personListMode='following'; renderPersonConnections(); });
$('#personProfileBackBtn').addEventListener('click', async () => {
  const mode = ['home','cover','book','stream','connections'].includes(personProfileReturnMode) ? personProfileReturnMode : 'connections';
  if (mode === 'home' || mode === 'connections') await refreshAndShow(mode);
  else showView(mode);
});

function renderHome() {
  if (!me) return;
  const profileCard = $('#homeProfileCard');
  profileCard.innerHTML = `<button class="home-profile-link" type="button" data-profile-tag="${escapeHtml(me.tag)}">${avatarHtml(me,'home-avatar')}<span><strong>${escapeHtml(me.displayName || me.tag)}</strong><em>@${escapeHtml(me.tag)}</em><small>${followers.length} followers · ${following.length} following</small></span></button>`;

  const shelf = Array.isArray(homeData.followingShelf) ? homeData.followingShelf : [];
  $('#homeFollowingCount').textContent = `${shelf.length} following`;
  $('#homeShelf').innerHTML = shelf.length ? shelf.map(item => {
    const p = item.profile || {};
    const book = item.scrapbook;
    const accessible = Boolean(book?.accessible);
    const title = accessible ? (book.name || 'Personal Scrapbook') : 'Personal Scrapbook';
    const bookHtml = book
      ? `<div class="home-closed-book ${accessible ? '' : 'locked'}" data-book-id="${accessible ? escapeHtml(book.id) : ''}">
          <div class="home-book-spine"></div>
          <div class="home-book-face">
            <span class="home-book-mark">${accessible ? '✦' : '🔒'}</span>
            <small>PERSONAL SCRAPBOOK</small>
            <strong>${escapeHtml(title)}</strong>
            <em>${accessible ? 'shared with you' : 'not shared with followers'}</em>
          </div>
        </div>`
      : `<div class="home-closed-book empty-book"><div class="home-book-face"><span class="home-book-mark">♡</span><small>PERSONAL SCRAPBOOK</small><strong>No scrapbook yet</strong><em>Nothing to open right now</em></div></div>`;
    return `<article class="home-shelf-card">
      <button class="home-person-row" type="button" data-profile-tag="${escapeHtml(p.tag || '')}">${avatarHtml(p,'home-person-avatar')}<span><strong>${escapeHtml(p.displayName || p.tag)}</strong><em>@${escapeHtml(p.tag || '')}</em></span></button>
      ${bookHtml}
      <div class="home-book-actions">
        ${accessible ? `<button class="primary home-open-book" data-id="${escapeHtml(book.id)}" data-mode="book" type="button">Open book</button><button class="ghost home-open-book" data-id="${escapeHtml(book.id)}" data-mode="stream" type="button">Memory stream</button>` : (book ? '<span class="home-lock-note">This person has not shared this scrapbook with followers.</span>' : '')}
      </div>
    </article>`;
  }).join('') : '<div class="home-empty"><span>♡</span><strong>Your shelf is empty.</strong><p>Follow someone from People and their Personal scrapbook will appear here when they choose to share it with you.</p></div>';

  const suggestions = Array.isArray(homeData.friendSuggestions) ? homeData.friendSuggestions : [];
  $('#homeSuggestions').innerHTML = suggestions.length ? suggestions.map(item => {
    const p = item.profile || {};
    const viaNames = (item.via || []).map(v => `@${escapeHtml(v.tag)}`).join(', ');
    return `<article class="home-suggestion-card" data-tag="${escapeHtml(p.tag || '')}" data-profile-tag="${escapeHtml(p.tag || '')}">
      ${avatarHtml(p,'home-suggestion-avatar')}
      <div class="home-suggestion-copy"><strong>${escapeHtml(p.displayName || p.tag)}</strong><span>@${escapeHtml(p.tag || '')}</span><small>${item.mutualCount || 1} friend connection${(item.mutualCount || 1) === 1 ? '' : 's'}${viaNames ? ` · through ${viaNames}` : ''}</small></div>
      <button class="primary home-follow-suggestion" type="button">Follow</button>
    </article>`;
  }).join('') : '<p class="home-suggestion-empty">Follow a few people and friends-of-friends suggestions will appear here.</p>';

  $('#homeShelf').querySelectorAll('.home-open-book').forEach(btn => btn.addEventListener('click', async () => {
    await openHomeScrapbook(btn.dataset.id, btn.dataset.mode || 'book');
  }));
  wireProfileLinks(homeView);
  $('#homeSuggestions').querySelectorAll('.home-follow-suggestion').forEach(btn => btn.addEventListener('click', async () => {
    const tag = btn.closest('.home-suggestion-card')?.dataset.tag;
    if (!tag) return;
    btn.disabled = true;
    try {
      await api(`/api/people/${encodeURIComponent(tag)}/follow`, { method:'POST', body:'{}' });
      await loadSession(activeScrapbook?.id || null);
      showView('home');
      showToast(`You are now following @${tag}.`);
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
    }
  }));
}
async function openHomeScrapbook(id, mode = 'book') {
  try {
    await loadSession(id);
    const book = scrapbooks.find(b => b.id === id && b.type === 'personal');
    if (!book) {
      showToast('That scrapbook is no longer shared with you.');
      showView('home');
      return;
    }
    activeScrapbook = book;
    spreadIndex = 0;
    localStorage.setItem('activeScrapbookId', book.id);
    renderScrapbookPicker();
    updateCover();
    if (mode === 'stream') showView('stream');
    else {
      setBookCoverOpen(true);
      showView('book');
    }
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not open that scrapbook.');
  }
}

function showView(mode) {
  currentMode = mode;
  if (mode === 'book') setBookCoverOpen(true);
  homeView.classList.toggle('hidden', mode !== 'home');
  coverStage.classList.toggle('hidden', mode !== 'cover');
  bookView.classList.toggle('hidden', mode !== 'book');
  streamView.classList.toggle('hidden', mode !== 'stream');
  connectionsView.classList.toggle('hidden', mode !== 'connections');
  personProfileView.classList.toggle('hidden', mode !== 'person');
  $('#homeModeBtn').classList.toggle('active', mode === 'home');
  $('#bookModeBtn').classList.toggle('active', mode === 'book');
  $('#streamModeBtn').classList.toggle('active', mode === 'stream');
  $('#connectionsModeBtn').classList.toggle('active', mode === 'connections' || mode === 'person');

  const noBook = !activeScrapbook;
  const noEntries = activeScrapbook && !entries.length;
  const canWrite = Boolean(activeScrapbook && activeScrapbook.canWrite !== false);
  $('#newEntryBtn').classList.toggle('hidden', mode === 'home' || mode === 'person' || (Boolean(activeScrapbook) && !canWrite));
  emptyState.classList.toggle('hidden', mode === 'home' || mode === 'cover' || mode === 'connections' || mode === 'person' || (!noBook && !noEntries));

  if (mode === 'home') {
    renderHome();
    return;
  }
  if (mode === 'person') {
    renderPersonProfile();
    return;
  }
  if (noBook && mode !== 'cover' && mode !== 'connections') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
    $('#emptyTitle').textContent = 'Your first scrapbook starts here.';
    $('#emptyText').textContent = 'Create a lovers scrapbook, a group scrapbook, or your own Personal scrapbook.';
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
  homeData = data.home || { followingShelf: [], friendSuggestions: [] };
  notificationSummary = data.notifications || { count:0, pendingInvites:0 };
  guideState = data.guide || { version:2, seenVersion:1, required:false };
  partnerTag = data.partnerTag || null;
  const remembered = localStorage.getItem('activeScrapbookId');
  activeScrapbook = scrapbooks.find(b => b.id === preferredBookId) || scrapbooks.find(b => b.id === remembered) || scrapbooks[0] || null;
  if (activeScrapbook) localStorage.setItem('activeScrapbookId', activeScrapbook.id);
  renderScrapbookPicker(); renderProfileChip(); renderInviteBanner(); renderNotificationBadge(); renderFollowStats(); renderHome(); updateCover();
  await refreshEntries();
}
let liveRefreshSeq = 0;
async function refreshLiveData(preferredBookId = activeScrapbook?.id || null) {
  const seq = ++liveRefreshSeq;
  await loadSession(preferredBookId);
  return seq === liveRefreshSeq;
}
async function refreshAndShow(mode, preferredBookId = activeScrapbook?.id || null) {
  try {
    const latest = await refreshLiveData(preferredBookId);
    if (!latest) return;
    if (mode === 'book') setBookCoverOpen(true);
    if (mode === 'cover') setBookCoverOpen(false);
    showView(mode);
  } catch (err) {
    if (err.status === 401) {
      location.reload();
      return;
    }
    showToast(err.message || 'Could not refresh the scrapbook. Please try again.');
  }
}

async function respondInvite(id, accept) {
  try {
    const data = await api(`/api/invites/${id}/respond`, { method:'POST', body:JSON.stringify({ accept }) });
    await loadSession(data.scrapbook?.id || null);
    showToast(accept ? 'You joined the scrapbook.' : 'Invitation declined.');
    if (accept) showView('connections');
  } catch (err) { showToast(err.message); }
}

function maxCanvasZ() {
  return editingCanvasItems.reduce((max,item)=>Math.max(max,Number(item.z)||0),0);
}
function clampCanvasItem(item) {
  item.w = Math.max(item.type === 'text' ? 18 : 14, Math.min(96, Number(item.w) || (item.type === 'text' ? 55 : 34)));
  item.h = Math.max(item.type === 'text' ? 8 : 10, Math.min(90, Number(item.h) || (item.type === 'text' ? 18 : 26)));
  item.x = Math.max(0, Math.min(100 - item.w, Number(item.x) || 0));
  item.y = Math.max(0, Math.min(100 - item.h, Number(item.y) || 0));
  item.z = Math.max(1, Math.min(999, Number(item.z) || 1));
  return item;
}
function legacyEntryToCanvas(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.canvasItems) && entry.canvasItems.length) {
    return entry.canvasItems.map(item => clampCanvasItem({...item}));
  }
  const items = [];
  const photos = Array.isArray(entry.photos) ? entry.photos : [];
  photos.forEach((p,i) => {
    const pos = normalizedPhotoPosition(p);
    items.push(clampCanvasItem({
      id:p.id || crypto.randomUUID?.() || `photo-${Date.now()}-${i}`,
      type:'photo',
      src:p.src,
      caption:p.caption || '',
      x:Math.max(0,Math.min(64,pos.xPct)),
      y:Math.max(2,Math.min(68,4 + i*10 + pos.yPx/16)),
      w:Math.max(20,Math.min(48,pos.width || 34)),
      h:26,
      z:i+1
    }));
  });
  const html = entry.richText ? entry.richText : (entry.text ? plainTextHtml(entry.text) : '');
  if (html.trim()) {
    const y = Math.min(70, photos.length ? 12 + photos.length*9 : 8);
    items.push(clampCanvasItem({
      id:crypto.randomUUID?.() || `text-${Date.now()}`,
      type:'text',
      html,
      x:7,
      y,
      w:86,
      h:24,
      z:items.length+1,
      font:'serif',
      size:18,
      bold:false,
      italic:false
    }));
  }
  return items;
}
function resetEditor(entry = null) {
  editingId = entry?.id || null;
  editingPhotos = (entry?.photos || []).map(p => ({...p}));
  editingCanvasItems = legacyEntryToCanvas(entry);
  editingCanvasSize = normalizeCanvasSize(entry?.canvasSize || 'medium');
  editingCanvasLined = entry?.canvasLined === true;
  selectedCanvasItemId = null;
  savedCanvasTextRange = null;
  $('#editorHeading').textContent = entry ? 'Edit this memory' : 'Design this memory';
  $('#entryDate').value = entry?.date || new Date().toISOString().slice(0,10);
  $('#entryTitle').value = entry?.title || '';
  $('#entryText').innerHTML = entry?.richText ? entry.richText : (entry?.text ? plainTextHtml(entry.text) : '');
  $('#deleteEntryBtn').classList.toggle('hidden', !entry);
  $('#editorError').textContent = '';
  renderCanvasEditor();
}
function openEditor(id = null) {
  if (!activeScrapbook) { scrapbookDialog.showModal(); return; }
  if (activeScrapbook.canWrite === false) { showToast('This personal scrapbook is read-only for you.'); return; }
  const entry = id ? entries.find(e => e.id === id) : null;
  if (entry && entry.author !== me.tag) { showToast('Only the writer can edit that memory.'); return; }
  resetEditor(entry || null);
  editorDialog.showModal();
  setTimeout(() => {
    initCanvasViewportGestures();
    fitCanvasToStage({ resetScroll:true });
    $('#entryTitle').focus();
  }, 80);
}
function closeEditor() {
  selectedCanvasItemId = null;
  savedCanvasTextRange = null;
  if (editorDialog.open) editorDialog.close();
}
function canvasPlainText() {
  return editingCanvasItems
    .filter(item=>item.type==='text')
    .map(item => {
      const div=document.createElement('div');
      div.innerHTML=item.html || '';
      return div.innerText.trim();
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0,20000);
}
function currentDraft() {
  const textItems = editingCanvasItems.filter(item=>item.type==='text');
  const photoItems = editingCanvasItems.filter(item=>item.type==='photo');
  return {
    id: editingId,
    scrapbookId: activeScrapbook?.id || '',
    date: $('#entryDate').value,
    title: $('#entryTitle').value || 'Untitled memory',
    text: canvasPlainText(),
    richText: textItems.map(item=>item.html || '').join('<div><br></div>').slice(0,50000),
    canvasItems: editingCanvasItems.map(item=>({...item})),
    canvasSize: editingCanvasSize,
    canvasLined: editingCanvasLined,
    photos: photoItems.map(item=>({
      id:item.id,src:item.src,caption:item.caption || '',
      side:item.x + item.w/2 >= 50 ? 'right':'left',
      width:item.w,xPct:item.x,yPx:Math.round(item.y*6),offsetY:Math.round(item.y*6)
    })),
    author: me?.tag
  };
}
function canvasItemHtml(item) {
  const selected = item.id === selectedCanvasItemId ? ' selected' : '';
  if (item.type === 'photo') {
    return `<div class="canvas-item canvas-photo-item${selected}" data-canvas-id="${escapeHtml(item.id)}" style="${canvasItemStyle(item)}">
      <button class="canvas-remove-item" type="button" title="Remove photo">×</button>
      <img src="${escapeHtml(item.src)}" alt="Scrapbook photo" draggable="false" />
      ${item.caption ? `<div class="canvas-photo-caption">${escapeHtml(item.caption)}</div>` : ''}
      <span class="canvas-resize-handle" aria-hidden="true"></span>
    </div>`;
  }
  const size=Math.max(7,Math.min(42,Number(item.size)||18));
  return `<div class="canvas-item canvas-text-item${selected} ${canvasFontClass(item.font)}" data-canvas-id="${escapeHtml(item.id)}" style="${canvasItemStyle(item)};--edit-text-size:${size}px;${item.bold?'font-weight:700;':''}${item.italic?'font-style:italic;':''}">
    <button class="canvas-remove-item" type="button" title="Remove text box">×</button>
    <div class="canvas-drag-handle" title="Drag text box">✥ Move</div>
    <div class="canvas-text-content" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Type your memory here…">${String(item.html || '')}</div>
    <span class="canvas-resize-handle" aria-hidden="true"></span>
  </div>`;
}
function applyCanvasPageSettings() {
  const canvas = $('#scrapCanvas');
  if (!canvas) return;
  canvas.classList.remove('canvas-size-small','canvas-size-medium','canvas-size-large','canvas-size-wide');
  canvas.classList.add(`canvas-size-${editingCanvasSize}`);
  canvas.classList.toggle('canvas-lined', editingCanvasLined);
  $('#canvasPageSize').value = editingCanvasSize;
  $('#canvasLined').checked = editingCanvasLined;
  const meta = canvasSizeMeta(editingCanvasSize);
  $('#canvasSizeHint').textContent = `${meta.label} · ${meta.width} × ${meta.height} workspace`;
  layoutCanvasViewport();
}
function renderCanvasEditor() {
  const canvas=$('#scrapCanvas');
  const hint=$('#canvasEmptyHint');
  applyCanvasPageSettings();
  canvas.querySelectorAll('.canvas-item').forEach(el=>el.remove());
  const ordered=[...editingCanvasItems].sort((a,b)=>(a.z||0)-(b.z||0));
  canvas.insertAdjacentHTML('beforeend',ordered.map(canvasItemHtml).join(''));
  hint.classList.toggle('hidden',ordered.length>0);
  wireCanvasItems();
  updateCanvasInspector();
}
function selectCanvasItem(id, bringFront=false) {
  const item=editingCanvasItems.find(x=>x.id===id);
  if(!item)return;
  selectedCanvasItemId=id;
  if(bringFront){
    item.z=Math.min(999,maxCanvasZ()+1);
  }
  renderCanvasEditor();
}
function activeCanvasTextItem() {
  const item=editingCanvasItems.find(x=>x.id===selectedCanvasItemId);
  return item?.type==='text' ? item : null;
}
function clearCanvasSelection() {
  selectedCanvasItemId = null;
  savedCanvasTextRange = null;
  $('#canvasTextInspector')?.classList.add('hidden');
  $('#scrapCanvas')?.querySelectorAll('.canvas-item.selected').forEach(el => el.classList.remove('selected'));
  const active = document.activeElement;
  if (active?.closest?.('.canvas-text-content')) active.blur();
  try { window.getSelection()?.removeAllRanges(); } catch {}
}
function updateCanvasInspector() {
  const inspector=$('#canvasTextInspector');
  const item=activeCanvasTextItem();
  inspector.classList.toggle('hidden',!item);
  if(!item)return;
  $('#canvasFontSelect').value=item.font || 'serif';
  $('#canvasFontSizeValue').textContent=`${item.size || 18}px`;
  $('#canvasBoldBtn').classList.toggle('active',item.bold===true);
  $('#canvasItalicBtn').classList.toggle('active',item.italic===true);
  positionCanvasInspectorMobile();
}
function addCanvasText() {
  const count=editingCanvasItems.filter(i=>i.type==='text').length;
  const item=clampCanvasItem({
    id:crypto.randomUUID?.() || `text-${Date.now()}-${Math.random()}`,
    type:'text',html:'',x:8,y:Math.min(70,8+count*8),w:70,h:18,
    z:maxCanvasZ()+1,font:'serif',size:18,bold:false,italic:false
  });
  editingCanvasItems.push(item);
  selectedCanvasItemId=item.id;
  renderCanvasEditor();
  requestAnimationFrame(()=>{
    const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"] .canvas-text-content`);
    el?.focus();
  });
}
function canvasTextSelection() {
  const item=activeCanvasTextItem();
  if(!item)return null;
  const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"] .canvas-text-content`);
  const sel=window.getSelection();
  if(!el||!sel||!sel.rangeCount||sel.isCollapsed)return null;
  const range=sel.getRangeAt(0);
  return el.contains(range.commonAncestorContainer) ? range : null;
}
function rememberCanvasTextSelection() {
  const range=canvasTextSelection();
  if(range)savedCanvasTextRange=range.cloneRange();
}
function restoreCanvasTextSelection() {
  if(!savedCanvasTextRange)return false;
  const item=activeCanvasTextItem();
  if(!item)return false;
  const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"] .canvas-text-content`);
  if(!el||!el.contains(savedCanvasTextRange.commonAncestorContainer))return false;
  const sel=window.getSelection();
  sel.removeAllRanges();sel.addRange(savedCanvasTextRange);
  return true;
}
function applyCanvasInline(command,value=null) {
  if(!restoreCanvasTextSelection())return false;
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed)return false;
  document.execCommand(command,false,value);
  const item=activeCanvasTextItem();
  const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"] .canvas-text-content`);
  item.html=el?.innerHTML || '';
  rememberCanvasTextSelection();
  return true;
}
function setCanvasTextFont(value) {
  const item=activeCanvasTextItem();if(!item)return;
  const face={serif:'Georgia',sans:'Arial',hand:'Segoe Print',mono:'Courier New'}[value] || 'Georgia';
  if(!applyCanvasInline('fontName',face)){
    item.font=value;
    renderCanvasEditor();
  }
}
function setCanvasTextSize(value) {
  const item=activeCanvasTextItem();if(!item)return;
  const size=Math.max(7,Math.min(42,Number(value)||18));
  const liveRange=canvasTextSelection();
  if(liveRange) savedCanvasTextRange=liveRange.cloneRange();
  if(liveRange || savedCanvasTextRange){
    const level=size<=9?1:size<=13?2:size<=18?3:size<=23?4:size<=29?5:size<=35?6:7;
    if(applyCanvasInline('fontSize',String(level))){
      $('#canvasFontSizeValue').textContent=`${size}px selection`;
      return;
    }
  }
  item.size=size;
  $('#canvasFontSizeValue').textContent=`${size}px`;
  const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"]`);
  el?.style.setProperty('--edit-text-size',`${size}px`);
}
function stepCanvasTextSize(delta) {
  const item=activeCanvasTextItem();
  if(!item)return;
  setCanvasTextSize(Math.max(7,Math.min(42,(Number(item.size)||18)+delta)));
}
function toggleCanvasTextStyle(kind) {
  const item=activeCanvasTextItem();if(!item)return;
  const command=kind==='bold'?'bold':'italic';
  if(applyCanvasInline(command)){renderCanvasEditor();return;}
  item[kind]=!item[kind];
  renderCanvasEditor();
}
function syncCanvasTextHeight(content,itemEl,item) {
  const canvas=$('#scrapCanvas');
  const canvasHeight=canvas.offsetHeight || canvasSizeMeta(editingCanvasSize).height;
  if(!canvasHeight)return;
  const dragH=itemEl.querySelector('.canvas-drag-handle')?.offsetHeight || 28;
  const needed=content.scrollHeight+dragH+18;
  const neededPct=needed/canvasHeight*100;
  if(neededPct>item.h){
    item.h=Math.min(96-item.y,Math.max(item.h,neededPct));
    itemEl.style.height=`${item.h}%`;
  }
}
function wireCanvasItems() {
  const canvas=$('#scrapCanvas');
  const rect=()=>canvas.getBoundingClientRect();
  canvas.querySelectorAll('.canvas-item').forEach(el=>{
    const id=el.dataset.canvasId;
    const item=editingCanvasItems.find(x=>x.id===id);
    if(!item)return;
    el.addEventListener('pointerdown',e=>{
      if(e.target.closest('.canvas-remove-item,.canvas-resize-handle,.canvas-text-content'))return;
      if(item.type==='text'&&!e.target.closest('.canvas-drag-handle'))return;
      selectedCanvasItemId=id;
      item.z=Math.min(999,maxCanvasZ()+1);
      const r=rect();
      const sx=e.clientX,sy=e.clientY,ox=item.x,oy=item.y;
      el.setPointerCapture(e.pointerId);el.classList.add('dragging');
      const move=ev=>{
        if(canvasGesturePinching)return;
        const dx=(ev.clientX-sx)/r.width*100,dy=(ev.clientY-sy)/r.height*100;
        item.x=Math.max(0,Math.min(100-item.w,ox+dx));
        item.y=Math.max(0,Math.min(100-item.h,oy+dy));
        el.style.left=`${item.x}%`;el.style.top=`${item.y}%`;
      };
      const up=ev=>{
        el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);
        el.classList.remove('dragging');renderCanvasEditor();
      };
      el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
      e.preventDefault();
    });
    el.addEventListener('click',()=>{selectedCanvasItemId=id;updateCanvasInspector();canvas.querySelectorAll('.canvas-item').forEach(n=>n.classList.toggle('selected',n===el));});
    el.querySelector('.canvas-remove-item')?.addEventListener('click',e=>{
      e.stopPropagation();editingCanvasItems=editingCanvasItems.filter(x=>x.id!==id);
      if(selectedCanvasItemId===id)selectedCanvasItemId=null;renderCanvasEditor();
    });
    const handle=el.querySelector('.canvas-resize-handle');
    handle?.addEventListener('pointerdown',e=>{
      e.stopPropagation();
      selectedCanvasItemId=id;
      const r=rect(),sx=e.clientX,sy=e.clientY,ow=item.w,oh=item.h;
      handle.setPointerCapture(e.pointerId);el.classList.add('resizing');
      const move=ev=>{
        if(canvasGesturePinching)return;
        item.w=Math.max(item.type==='text'?18:14,Math.min(100-item.x,ow+(ev.clientX-sx)/r.width*100));
        item.h=Math.max(item.type==='text'?8:10,Math.min(100-item.y,oh+(ev.clientY-sy)/r.height*100));
        el.style.width=`${item.w}%`;el.style.height=`${item.h}%`;
      };
      const up=()=>{
        handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);
        el.classList.remove('resizing');renderCanvasEditor();
      };
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
      e.preventDefault();
    });
    const content=el.querySelector('.canvas-text-content');
    if(content){
      content.addEventListener('focus',()=>{selectedCanvasItemId=id;updateCanvasInspector();});
      content.addEventListener('input',()=>{
        item.html=content.innerHTML.slice(0,50000);
        syncCanvasTextHeight(content,el,item);
      });
      content.addEventListener('selectionchange',rememberCanvasTextSelection);
      content.addEventListener('keyup',rememberCanvasTextSelection);
      content.addEventListener('touchend',()=>setTimeout(rememberCanvasTextSelection,80));
      content.addEventListener('paste',ev=>{
        ev.preventDefault();
        document.execCommand('insertText',false,ev.clipboardData?.getData('text/plain') || '');
      });
    }
  });
}
function positionCanvasInspectorMobile() {
  const inspector=$('#canvasTextInspector');
  if(!inspector||inspector.classList.contains('hidden')||!window.matchMedia('(max-width:800px),(pointer:coarse)').matches){
    if(inspector)inspector.style.top='';
    return;
  }
  const vv=window.visualViewport;
  const top=vv?vv.offsetTop:0;
  const height=vv?vv.height:window.innerHeight;
  requestAnimationFrame(()=>{
    const h=inspector.offsetHeight||54;
    inspector.style.top=`${Math.max(top+8,top+height-h-8)}px`;
  });
}

function renderPreview() {
  if (editorDialog.open) updateCanvasInspector();
}
function renderPhotoControls() {
  // Legacy control retained only for backwards-compatible hidden markup.
}
async function imageAspectRatio(file) {
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      const ratio = bitmap.width / Math.max(1, bitmap.height);
      bitmap.close?.();
      return ratio || 1;
    }
  } catch {}
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
      URL.revokeObjectURL(url);
      resolve(ratio || 1);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(1); };
    img.src = url;
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

let signupTagCheckTimer = null;
let signupTagCheckSeq = 0;
$('#signupTag').addEventListener('input', () => {
  clearTimeout(signupTagCheckTimer);
  const raw = $('#signupTag').value.trim();
  const tag = raw.replace(/^@/,'').toLowerCase();
  const status = $('#signupTagStatus');
  status.className = 'helper tag-availability';
  if (!tag) { status.textContent = ''; return; }
  if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(tag)) {
    status.textContent = 'Use 3–24 letters, numbers, dots, dashes or underscores.';
    status.classList.add('unavailable');
    return;
  }
  const seq = ++signupTagCheckSeq;
  status.textContent = 'Checking @tag…';
  signupTagCheckTimer = setTimeout(async () => {
    try {
      const data = await api(`/api/tag-availability?tag=${encodeURIComponent(tag)}`);
      if (seq !== signupTagCheckSeq) return;
      status.textContent = data.available ? `@${tag} is available.` : `@${tag} is already taken.`;
      status.classList.toggle('available', data.available === true);
      status.classList.toggle('unavailable', data.available !== true);
    } catch {
      if (seq === signupTagCheckSeq) status.textContent = '';
    }
  }, 280);
});

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
    await enterApp(); showView('home');
  } catch (err) { $('#signupError').textContent = err.message; }
});
async function enterApp() {
  await loadSession();
  lockScreen.classList.add('hidden'); journalApp.classList.remove('hidden');
  showView('home');
  if (guideState.required) setTimeout(() => startGuide(true), 180);
  else maybeOpenReminderComposer();
}
$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method:'POST', body:'{}' }).catch(()=>{});
  localStorage.removeItem('activeScrapbookId'); location.reload();
});
$('#brandButton').addEventListener('click', async () => {
  setBookCoverOpen(false);
  await refreshAndShow('cover');
});
$('#openBookBtn').addEventListener('click', toggleBookCover);
$('#introBook').addEventListener('click', toggleBookCover);
$('#introBook').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  toggleBookCover();
});
$('#guideBtn').addEventListener('click', () => startGuide(false));
$('#homeModeBtn').addEventListener('click', () => refreshAndShow('home'));
$('#bookModeBtn').addEventListener('click', async () => {
  if (!activeScrapbook) { await refreshAndShow('connections', null); return; }
  await refreshAndShow('book');
});
$('#closeBookViewBtn').addEventListener('click', async () => {
  setBookCoverOpen(false);
  await refreshAndShow('cover');
});
$('#streamModeBtn').addEventListener('click', () => refreshAndShow('stream'));
$('#connectionsModeBtn').addEventListener('click', () => refreshAndShow('connections'));
$('#newEntryBtn').addEventListener('click', () => openEditor());
$('#emptyAddBtn').addEventListener('click', () => activeScrapbook ? openEditor() : scrapbookDialog.showModal());
$('#closeEditorBtn').addEventListener('click', closeEditor);
$('#cancelEditorBtn').addEventListener('click', closeEditor);

$('#scrapbookPicker').addEventListener('change', async e => {
  const selectedId = e.target.value || null;
  setBookCoverOpen(false);
  spreadIndex = 0;
  try {
    await loadSession(selectedId);
    setBookCoverOpen(false);
    showView('cover');
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not refresh that scrapbook.');
  }
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
  host.innerHTML = people.map(person => `<article class="discover-person" data-tag="${escapeHtml(person.tag)}" data-profile-tag="${escapeHtml(person.tag)}">
    ${avatarHtml(person,'small-avatar')}
    <div class="discover-person-copy"><strong>${escapeHtml(person.displayName || person.tag)}</strong><span>@${escapeHtml(person.tag)}</span>${person.bio ? `<small>${escapeHtml(person.bio)}</small>` : ''}</div>
    <div class="discover-badges">${person.isPartner ? '<span>Partner</span>' : ''}${person.followsYou ? '<span>Follows you</span>' : ''}</div>
    <button class="${person.isFollowing ? 'ghost' : 'primary'} follow-toggle" type="button">${person.isFollowing ? 'Following' : 'Follow'}</button>
  </article>`).join('');
  wireProfileLinks(host);
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

$('#notificationBtn').addEventListener('click', async () => {
  if (!$('#notificationPanel').classList.contains('hidden')) { closeNotificationHub(); return; }
  await loadNotificationHub({ markRead:true });
});
$('#notificationCloseBtn').addEventListener('click', closeNotificationHub);
document.addEventListener('pointerdown', e => {
  if (!$('#notificationPanel').classList.contains('hidden') && !e.target.closest('#notificationWrap')) closeNotificationHub();
});

$('#profileImageViewerClose').addEventListener('click', closeProfileImageViewer);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#profileImageViewer').classList.contains('hidden')) {
    e.preventDefault();
    closeProfileImageViewer();
  }
});
$('#profileImageZoomFit').addEventListener('click', () => setProfileImageScale(1));
$('#profileImageZoomIn').addEventListener('click', () => setProfileImageScale(profileViewerScale * 1.25));
$('#profileImageZoomOut').addEventListener('click', () => setProfileImageScale(profileViewerScale / 1.25));
$('#profileImageViewer').addEventListener('pointerdown', e => {
  if (e.target === $('#profileImageViewer')) closeProfileImageViewer();
});
const profileImageStage = $('#profileImageViewerStage');
profileImageStage.addEventListener('pointerdown', e => {
  profileViewerPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  try { profileImageStage.setPointerCapture(e.pointerId); } catch {}
  if (profileViewerPointers.size >= 2) {
    const g=profileViewerGeometry();
    profileViewerGesture=g ? {type:'pinch',distance:g.distance,x:g.x,y:g.y,scale:profileViewerScale,panX:profileViewerX,panY:profileViewerY} : null;
  } else if (profileViewerScale > 1) {
    profileViewerGesture={type:'pan',x:e.clientX,y:e.clientY,panX:profileViewerX,panY:profileViewerY};
  }
  e.preventDefault();
});
profileImageStage.addEventListener('pointermove', e => {
  if (!profileViewerPointers.has(e.pointerId)) return;
  profileViewerPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if (profileViewerPointers.size >= 2) {
    const g=profileViewerGeometry();
    if (!g) return;
    if (!profileViewerGesture || profileViewerGesture.type !== 'pinch') {
      profileViewerGesture={type:'pinch',distance:g.distance,x:g.x,y:g.y,scale:profileViewerScale,panX:profileViewerX,panY:profileViewerY};
    }
    const ratio=g.distance/Math.max(1,profileViewerGesture.distance);
    profileViewerScale=Math.max(1,Math.min(5,profileViewerGesture.scale*ratio));
    profileViewerX=profileViewerGesture.panX+(g.x-profileViewerGesture.x);
    profileViewerY=profileViewerGesture.panY+(g.y-profileViewerGesture.y);
    applyProfileImageTransform();
    e.preventDefault();
    return;
  }
  if (profileViewerGesture?.type==='pan' && profileViewerScale>1) {
    profileViewerX=profileViewerGesture.panX+(e.clientX-profileViewerGesture.x);
    profileViewerY=profileViewerGesture.panY+(e.clientY-profileViewerGesture.y);
    applyProfileImageTransform();
    e.preventDefault();
  }
});
const finishProfileViewerPointer=e=>{
  profileViewerPointers.delete(e.pointerId);
  if (profileViewerPointers.size===0) profileViewerGesture=null;
  else if (profileViewerPointers.size===1 && profileViewerScale>1) {
    const [pt]=profileViewerPointers.values();
    profileViewerGesture={type:'pan',x:pt.x,y:pt.y,panX:profileViewerX,panY:profileViewerY};
  }
};
profileImageStage.addEventListener('pointerup',finishProfileViewerPointer);
profileImageStage.addEventListener('pointercancel',finishProfileViewerPointer);
profileImageStage.addEventListener('wheel',e=>{
  e.preventDefault();
  setProfileImageScale(profileViewerScale*(e.deltaY<0?1.12:0.9));
},{passive:false});

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

$('#canvasPageSize').addEventListener('change', e => {
  editingCanvasSize = normalizeCanvasSize(e.target.value);
  applyCanvasPageSettings();
  requestAnimationFrame(() => fitCanvasToStage({ resetScroll:true }));
});
$('#canvasLined').addEventListener('change', e => {
  editingCanvasLined = e.target.checked === true;
  applyCanvasPageSettings();
});
$('#canvasZoomOut').addEventListener('click', () => changeCanvasZoom(editingCanvasZoom * 0.84, { mode:'manual' }));
$('#canvasZoomIn').addEventListener('click', () => changeCanvasZoom(editingCanvasZoom * 1.18, { mode:'manual' }));
$('#canvasZoomFit').addEventListener('click', () => fitCanvasToStage({ resetScroll:false }));
$('#canvasAddTextBtn').addEventListener('click', addCanvasText);
$('#canvasPhotoInput').addEventListener('change', async e => {
  const files=[...e.target.files].slice(0,Math.max(0,12-editingCanvasItems.filter(i=>i.type==='photo').length));
  $('#editorError').textContent='';
  try{
    for(const [idx,file] of files.entries()){
      const [uploaded,aspect]=await Promise.all([uploadImage(file),imageAspectRatio(file)]);
      const w=36;
      const h=Math.max(12,Math.min(55,w*(4/5.4)/Math.max(.25,aspect)));
      editingCanvasItems.push(clampCanvasItem({
        id:crypto.randomUUID?.() || `photo-${Date.now()}-${idx}`,
        type:'photo',src:uploaded.src,caption:'',
        x:Math.min(58,6+(editingCanvasItems.length%4)*8),
        y:Math.min(62,7+(editingCanvasItems.length%5)*8),
        w,h,z:maxCanvasZ()+1
      }));
    }
    renderCanvasEditor();
  }catch(err){$('#editorError').textContent=err.message;}
  e.target.value='';
});
$('#canvasFontSelect').addEventListener('pointerdown',rememberCanvasTextSelection);
$('#canvasFontSelect').addEventListener('change',e=>setCanvasTextFont(e.target.value));
['canvasFontSizeMinus','canvasFontSizePlus'].forEach(id=>{
  $('#'+id).addEventListener('pointerdown',e=>{rememberCanvasTextSelection();e.preventDefault();});
});
$('#canvasFontSizeMinus').addEventListener('click',()=>stepCanvasTextSize(-1));
$('#canvasFontSizePlus').addEventListener('click',()=>stepCanvasTextSize(1));
['canvasBoldBtn','canvasItalicBtn','canvasBringFrontBtn','canvasDeleteItemBtn'].forEach(id=>{
  $('#'+id).addEventListener('pointerdown',e=>{rememberCanvasTextSelection(); if(id!=='canvasBringFrontBtn'&&id!=='canvasDeleteItemBtn')e.preventDefault();});
});
$('#canvasBoldBtn').addEventListener('click',()=>toggleCanvasTextStyle('bold'));
$('#canvasItalicBtn').addEventListener('click',()=>toggleCanvasTextStyle('italic'));
$('#canvasBringFrontBtn').addEventListener('click',()=>{
  const item=editingCanvasItems.find(x=>x.id===selectedCanvasItemId);if(!item)return;
  item.z=Math.min(999,maxCanvasZ()+1);renderCanvasEditor();
});
$('#canvasDeleteItemBtn').addEventListener('click',()=>{
  if(!selectedCanvasItemId)return;
  editingCanvasItems=editingCanvasItems.filter(x=>x.id!==selectedCanvasItemId);
  selectedCanvasItemId=null;renderCanvasEditor();
});
document.addEventListener('selectionchange',()=>{
  if(activeCanvasTextItem())rememberCanvasTextSelection();
});
window.visualViewport?.addEventListener('resize',positionCanvasInspectorMobile);
window.visualViewport?.addEventListener('scroll',positionCanvasInspectorMobile);
window.addEventListener('resize', () => {
  if (!editorDialog.open) return;
  if (canvasZoomMode === 'fit') requestAnimationFrame(() => { fitCanvasToStage({ resetScroll:false }); centerCanvasInStage(); });
  else requestAnimationFrame(layoutCanvasViewport);
});
window.addEventListener('orientationchange', () => {
  if (!editorDialog.open) return;
  setTimeout(() => fitCanvasToStage({ resetScroll:false }), 180);
});

let savedRichRange = null;

function mobileFormattingMode() {
  return window.matchMedia('(max-width: 800px), (pointer: coarse)').matches;
}
function selectedEditorRange() {
  const editor = $('#entryText');
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  if (!editor.contains(node) && node !== editor) return null;
  return range;
}
function rememberRichSelection() {
  const range = selectedEditorRange();
  if (range) savedRichRange = range.cloneRange();
}
function restoreRichSelection() {
  if (!savedRichRange) return false;
  const editor = $('#entryText');
  if (!editor.contains(savedRichRange.commonAncestorContainer)) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedRichRange);
  return true;
}
function hideMobileRichToolbar() {
  const bar = $('#mobileRichToolbar');
  if (!bar) return;
  bar.classList.add('hidden');
  bar.style.top = '';
}
function positionMobileRichToolbar() {
  const bar = $('#mobileRichToolbar');
  if (!bar || bar.classList.contains('hidden')) return;
  const vv = window.visualViewport;
  const viewportTop = vv ? vv.offsetTop : 0;
  const viewportHeight = vv ? vv.height : window.innerHeight;
  const barHeight = Math.max(48, bar.offsetHeight || 48);
  const top = Math.max(viewportTop + 8, viewportTop + viewportHeight - barHeight - 10);
  bar.style.top = `${Math.round(top)}px`;
}
function syncMobileRichToolbar() {
  const bar = $('#mobileRichToolbar');
  if (!bar || !mobileFormattingMode() || !editorDialog.open) {
    hideMobileRichToolbar();
    return;
  }
  const range = selectedEditorRange();
  if (!range) {
    if (!bar.matches(':focus-within')) hideMobileRichToolbar();
    return;
  }
  savedRichRange = range.cloneRange();
  bar.classList.remove('hidden');
  requestAnimationFrame(positionMobileRichToolbar);
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
  syncMobileRichToolbar();
}
function changeSelectedTextSize(delta) {
  if (!restoreRichSelection()) return showToast('Select some journal text first.');
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return showToast('Select some journal text first.');
  let current = parseInt(document.queryCommandValue('fontSize'), 10);
  if (!Number.isFinite(current) || current < 1 || current > 7) current = 3;
  applyRichCommand('fontSize', String(Math.max(1, Math.min(7, current + delta))));
}

document.addEventListener('selectionchange', () => {
  rememberRichSelection();
  syncMobileRichToolbar();
});
window.visualViewport?.addEventListener('resize', positionMobileRichToolbar);
window.visualViewport?.addEventListener('scroll', positionMobileRichToolbar);
window.addEventListener('orientationchange', () => setTimeout(positionMobileRichToolbar, 120));
editorDialog.addEventListener('close', hideMobileRichToolbar);

['richBoldBtn','richItalicBtn','richSmallerBtn','richLargerBtn','richClearBtn',
 'mobileRichBold','mobileRichItalic','mobileRichSmaller','mobileRichLarger','mobileRichClear'].forEach(id => {
  $('#'+id)?.addEventListener('pointerdown', e => {
    rememberRichSelection();
    e.preventDefault();
  });
});

$('#richBoldBtn').addEventListener('click', () => applyRichCommand('bold'));
$('#richItalicBtn').addEventListener('click', () => applyRichCommand('italic'));
$('#richSmallerBtn').addEventListener('click', () => changeSelectedTextSize(-1));
$('#richLargerBtn').addEventListener('click', () => changeSelectedTextSize(1));
$('#richClearBtn').addEventListener('click', () => applyRichCommand('removeFormat'));
$('#richFontSelect').addEventListener('pointerdown', rememberRichSelection);
$('#richFontSelect').addEventListener('change', e => {
  const face = e.target.value;
  if (face) applyRichCommand('fontName', face);
  e.target.value = '';
});

$('#mobileRichBold').addEventListener('click', () => applyRichCommand('bold'));
$('#mobileRichItalic').addEventListener('click', () => applyRichCommand('italic'));
$('#mobileRichSmaller').addEventListener('click', () => changeSelectedTextSize(-1));
$('#mobileRichLarger').addEventListener('click', () => changeSelectedTextSize(1));
$('#mobileRichClear').addEventListener('click', () => applyRichCommand('removeFormat'));
$('#mobileRichFont').addEventListener('pointerdown', rememberRichSelection);
$('#mobileRichFont').addEventListener('change', e => {
  const face = e.target.value;
  if (face) applyRichCommand('fontName', face);
  e.target.value = '';
  requestAnimationFrame(positionMobileRichToolbar);
});

$('#entryText').addEventListener('focus', () => setTimeout(syncMobileRichToolbar, 80));
$('#entryText').addEventListener('keyup', syncMobileRichToolbar);
$('#entryText').addEventListener('touchend', () => setTimeout(syncMobileRichToolbar, 120));
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

setInterval(() => refreshNotificationCount(), 60 * 1000);

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
