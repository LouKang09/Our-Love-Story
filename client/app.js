const $ = sel => document.querySelector(sel);
const lockScreen = $('#lockScreen');
const journalApp = $('#journalApp');
const coverStage = $('#coverStage');
const bookView = $('#bookView');
const streamView = $('#streamView');
const homeView = $('#homeView');
const connectionsView = $('#connectionsView');
const messagesView = $('#messagesView');
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
let chats = [];
let activeChatId = null;
let activeChatMessages = [];
let chatUnreadCount = 0;
let pendingChatFile = null;
let pendingChatPreviewUrl = '';
let viewedPersonData = null;
let personListMode = 'followers';
let personProfileReturnMode = 'connections';
let guideState = { version: 8, seenVersion: 7, required: false };
let activeGuideSteps = [];
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
let liveEventSource = null;
let realtimeEntryTimer = null;
let realtimeSocialTimer = null;
let realtimeChatTimer = null;

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
function normalizeAppearanceMode(value) {
  return value === 'night' ? 'night' : 'light';
}
function applyAppearanceMode(value) {
  const mode = normalizeAppearanceMode(value);
  document.documentElement.dataset.theme = mode;
  const btn = $('#themeModeBtn');
  if (btn) {
    const night = mode === 'night';
    btn.innerHTML = `<span aria-hidden="true">${night ? '☀' : '☾'}</span><b>${night ? 'Light mode' : 'Dark mode'}</b>`;
    btn.setAttribute('aria-label', night ? 'Switch to light mode' : 'Switch to night mode');
    btn.title = night ? 'Switch to light mode' : 'Switch to night mode';
    btn.classList.toggle('active', night);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'night' ? '#21191b' : '#6e3d46');
  return mode;
}
function normalizeCoverTheme(value) {
  return ['rose','midnight','forest','ocean','sunset','classic'].includes(value) ? value : 'rose';
}
function applyActiveCoverTheme() {
  const theme = normalizeCoverTheme(activeScrapbook?.coverTheme);
  $('#introBook')?.setAttribute('data-cover-theme', theme);
  const select = $('#coverThemeSelect');
  const wrap = $('#coverThemeWrap');
  if (select) {
    select.value = theme;
    select.disabled = !activeScrapbook || activeScrapbook.isOwner !== true;
    select.title = select.disabled ? 'Only the scrapbook owner can change the shared cover.' : 'Change the shared scrapbook cover';
  }
  wrap?.classList.toggle('hidden', !activeScrapbook);
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function formatDate(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(d);
}
function formatEntryTime(value) {
  const d = new Date(value || '');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour:'numeric', minute:'2-digit' }).format(d);
}
function mentionTextHtml(text = '') {
  const escaped = escapeHtml(text);
  return escaped.replace(/(^|\s)@([a-z0-9][a-z0-9_.-]{2,23})\b/gi, (match, lead, tag) =>
    `${lead}<button class="inline-mention" type="button" data-profile-tag="${tag.toLowerCase()}">@${tag}</button>`
  );
}
let mentionSuggestSeq = 0;
function mentionContext(input) {
  if (!input || typeof input.selectionStart !== 'number') return null;
  const caret = input.selectionStart;
  const before = input.value.slice(0, caret);
  const match = before.match(/(^|\s)@([a-z0-9_.-]{0,23})$/i);
  if (!match) return null;
  const atIndex = before.lastIndexOf('@');
  return { start:atIndex, end:caret, query:(match[2] || '').toLowerCase() };
}
function connectedMentionPeople(query = '') {
  const q = String(query || '').toLowerCase();
  const pool = [
    ...(following || []),
    ...(followers || []),
    ...((activeScrapbook?.profiles || []))
  ];
  const seen = new Set();
  return pool.filter(person => {
    const tag = String(person?.tag || '').toLowerCase();
    if (!tag || tag === me?.tag || seen.has(tag)) return false;
    seen.add(tag);
    return !q || tag.includes(q) || String(person.displayName || '').toLowerCase().includes(q);
  }).slice(0,8);
}
function closeMentionSuggestions(input) {
  const popup = input?._mentionPopup;
  if (popup) popup.remove();
  if (input) input._mentionPopup = null;
}
function insertMention(input, tag, context = mentionContext(input)) {
  if (!input || !tag || !context) return;
  const value = input.value;
  const insertion = `@${tag} `;
  input.value = value.slice(0, context.start) + insertion + value.slice(context.end);
  const caret = context.start + insertion.length;
  input.focus({ preventScroll:true });
  try { input.setSelectionRange(caret, caret); } catch {}
  input.dispatchEvent(new Event('input', { bubbles:true }));
}
function positionMentionSuggestions(input, popup) {
  const rect = input.getBoundingClientRect();
  const maxWidth = Math.min(360, Math.max(220, rect.width));
  popup.style.width = `${maxWidth}px`;
  popup.style.left = `${Math.max(8, Math.min(window.innerWidth - maxWidth - 8, rect.left))}px`;
  const preferredTop = rect.bottom + 6;
  const popupHeight = Math.min(260, popup.scrollHeight || 220);
  popup.style.top = `${preferredTop + popupHeight <= window.innerHeight - 8 ? preferredTop : Math.max(8, rect.top - popupHeight - 6)}px`;
}
function renderMentionSuggestions(input, people, context) {
  closeMentionSuggestions(input);
  if (!context || !people.length || document.activeElement !== input) return;
  const popup = document.createElement('div');
  popup.className = 'mention-suggestions';
  popup.setAttribute('role','listbox');
  popup.innerHTML = people.slice(0,8).map(person => `<button class="mention-suggestion" type="button" data-tag="${escapeHtml(person.tag || '')}">
    ${avatarHtml(person,'mention-suggestion-avatar')}
    <span><strong>${escapeHtml(person.displayName || person.tag)}</strong><small>@${escapeHtml(person.tag || '')}</small></span>
  </button>`).join('');
  const popupHost = input.closest('dialog[open]') || document.body;
  popupHost.appendChild(popup);
  input._mentionPopup = popup;
  positionMentionSuggestions(input, popup);
  popup.querySelectorAll('.mention-suggestion').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      const latest = mentionContext(input) || context;
      insertMention(input, btn.dataset.tag, latest);
      closeMentionSuggestions(input);
    });
  });
}
async function updateMentionSuggestions(input) {
  const context = mentionContext(input);
  if (!context) { closeMentionSuggestions(input); return; }
  const seq = ++mentionSuggestSeq;
  let people = connectedMentionPeople(context.query);
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(context.query)}`);
    if (seq !== mentionSuggestSeq || document.activeElement !== input) return;
    const merged = new Map();
    [...people, ...(data.people || [])].forEach(person => {
      if (person?.tag && person.tag !== me?.tag) merged.set(person.tag, person);
    });
    people = [...merged.values()].slice(0,8);
  } catch {}
  if (seq !== mentionSuggestSeq) return;
  renderMentionSuggestions(input, people, mentionContext(input));
}
function wireMentionAutocomplete(input) {
  if (!input || input.dataset.mentionAutocomplete === '1') return;
  input.dataset.mentionAutocomplete = '1';
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => updateMentionSuggestions(input), 90);
  });
  input.addEventListener('click', () => updateMentionSuggestions(input));
  input.addEventListener('keyup', e => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) updateMentionSuggestions(input);
    if (e.key === 'Escape') closeMentionSuggestions(input);
  });
  input.addEventListener('blur', () => setTimeout(() => closeMentionSuggestions(input), 120));
  window.addEventListener('resize', () => {
    if (input._mentionPopup) positionMentionSuggestions(input, input._mentionPopup);
  });
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
  const meta = canvasSizeMeta(canvasSize);
  const linedClass = entry?.canvasLined === true ? ' canvas-lined' : '';
  return `<div class="saved-canvas canvas-size-${canvasSize}${linedClass}">${items.map(item => {
    if (item.type === 'photo') {
      const hasCaption = Boolean(String(item.caption || '').trim());
      return `<figure class="saved-canvas-item saved-photo-item${hasCaption ? ' has-caption' : ''}" style="${canvasItemStyle(item)}">
        <div class="saved-photo-frame"><img src="${escapeHtml(item.src)}" alt="Scrapbook photo" loading="lazy" /></div>
        ${hasCaption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : ''}
      </figure>`;
    }
    const fontClass = canvasFontClass(item.font);
    const weight = item.bold ? 'font-weight:700;' : '';
    const style = item.italic ? 'font-style:italic;' : '';
    const size = Math.max(7, Math.min(42, Number(item.size) || 18));
    const sizeCqw = (size / meta.width * 100).toFixed(4);
    const topCqw = (24 / meta.width * 100).toFixed(4);
    const padYCqw = (8 / meta.width * 100).toFixed(4);
    const padXCqw = (10 / meta.width * 100).toFixed(4);
    return `<div class="saved-canvas-item saved-text-item ${fontClass}" style="${canvasItemStyle(item)};--canvas-text-size:${size}px;--canvas-text-cqw:${sizeCqw}cqw;--saved-text-top:${topCqw}cqw;--saved-text-pad-y:${padYCqw}cqw;--saved-text-pad-x:${padXCqw}cqw;${weight}${style}"><div class="saved-text-content">${String(item.html || '')}</div></div>`;
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
function commentProfile(comment) {
  return authorProfiles[comment?.author] || { tag:comment?.author || '', displayName:comment?.author || 'Someone' };
}
function commentsEnabledForActiveBook() {
  return Boolean(activeScrapbook && ['personal','group'].includes(activeScrapbook.type) && activeScrapbook.canComment !== false);
}
function commentsHtml(entry) {
  if (!activeScrapbook || !['personal','group'].includes(activeScrapbook.type)) return '';
  const comments = Array.isArray(entry.comments) ? entry.comments : [];
  const list = comments.length ? comments.map(comment => {
    const p = commentProfile(comment);
    const canDelete = me && (comment.author === me.tag || activeScrapbook.owner === me.tag);
    return `<article class="memory-comment" data-comment-id="${escapeHtml(comment.id || '')}">
      <button class="comment-author" type="button" data-profile-tag="${escapeHtml(p.tag || comment.author || '')}">${avatarHtml(p,'comment-avatar')}<span><strong>${escapeHtml(p.displayName || p.tag)}</strong><small>@${escapeHtml(p.tag || comment.author || '')} · ${escapeHtml(notificationWhen(comment.createdAt))}</small></span></button>
      <p>${mentionTextHtml(comment.text || '')}</p>
      ${canDelete ? `<button class="comment-delete" type="button" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id)}" aria-label="Delete comment">×</button>` : ''}
    </article>`;
  }).join('') : '<p class="comments-empty">No comments yet. Leave the first little note.</p>';
  const composer = commentsEnabledForActiveBook()
    ? `<form class="comment-form" data-entry-id="${escapeHtml(entry.id)}"><textarea maxlength="600" rows="2" placeholder="Write a comment… Tag someone with @tag"></textarea><button class="primary" type="submit">Post</button></form>`
    : '';
  return `<section class="memory-comments"><div class="comments-head"><strong>Comments</strong><span>${comments.length}</span></div><div class="comments-list">${list}</div>${composer}</section>`;
}
function pageHtml(entry) {
  if (!entry) return '<div class="blank-page"><div><strong>A blank page.</strong><span>Some days are only waiting to happen.</span></div></div>';
  const editable = me && entry.author === me.tag;
  const time = formatEntryTime(entry.createdAt);
  return `<div class="entry-page" data-entry-id="${escapeHtml(entry.id)}">
    <div class="entry-date-row"><div class="entry-date">${formatDate(entry.date)}</div>${time ? `<time class="entry-time">${escapeHtml(time)}</time>` : ''}</div>
    <h2>${escapeHtml(entry.title)}</h2>
    <div class="entry-meta">${authorHtml(entry)}</div>
    <div class="entry-body canvas-entry-body">${entryContentHtml(entry)}</div>
    ${commentsHtml(entry)}
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
  $('#timeline').innerHTML = ordered.map(entry => {
    const time = formatEntryTime(entry.createdAt);
    return `<article class="timeline-item" data-entry-id="${escapeHtml(entry.id)}">
      <div class="timeline-dot"></div>
      <div class="stream-card">
        <div class="entry-date-row"><div class="entry-date">${formatDate(entry.date)}</div>${time ? `<time class="entry-time">${escapeHtml(time)}</time>` : ''}</div>
        <h2>${escapeHtml(entry.title)}</h2>
        <div class="entry-meta">${authorHtml(entry)}</div>
        <div class="entry-body canvas-entry-body">${entryContentHtml(entry)}</div>
        ${commentsHtml(entry)}
        ${me && entry.author === me.tag ? `<div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this memory</button></div>` : ''}
      </div>
    </article>`;
  }).join('');
  wireEntryButtons($('#timeline'));
}
function wireEntryButtons(root) {
  root.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
  wireProfileLinks(root);
  root.querySelectorAll('.comment-form').forEach(form => {
    wireMentionAutocomplete(form.querySelector('textarea'));
    form.addEventListener('submit', async e => {
    e.preventDefault();
    const entryId = form.dataset.entryId;
    const input = form.querySelector('textarea');
    const text = input?.value.trim() || '';
    if (!text) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api(`/api/entries/${encodeURIComponent(entryId)}/comments`, { method:'POST', body:JSON.stringify({ text }) });
      await refreshEntries();
      showToast('Comment posted.');
    } catch (err) {
      showToast(err.message);
      button.disabled = false;
    }
    });
  });
  root.querySelectorAll('.comment-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this comment?')) return;
    try {
      await api(`/api/entries/${encodeURIComponent(btn.dataset.entryId)}/comments/${encodeURIComponent(btn.dataset.commentId)}`, { method:'DELETE' });
      await refreshEntries();
      showToast('Comment removed.');
    } catch (err) { showToast(err.message); }
  }));
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
  applyActiveCoverTheme();
  syncBookCoverControls();
  renderPersonalPrivacyQuick();
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
    if (item.type === 'profile_mention' || item.type === 'comment_mention') {
      const inComment = item.type === 'comment_mention';
      return `<article class="notification-item mention-notification ${item.unread ? 'unread' : ''}">
        <button class="notification-actor notification-profile-link" type="button" data-tag="${escapeHtml(actor.tag || '')}">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>${inComment ? 'tagged you in a scrapbook comment' : 'tagged you in their profile About'}</small></span>
        </button>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        ${item.excerpt ? `<p class="notification-mention-excerpt">${mentionTextHtml(item.excerpt)}</p>` : ''}
        ${inComment && item.scrapbookId && item.entryId ? `<button class="ghost notification-view-memory" type="button" data-scrapbook-id="${escapeHtml(item.scrapbookId)}" data-entry-id="${escapeHtml(item.entryId)}">View memory</button>` : ''}
      </article>`;
    }
    if (item.type === 'comment') {
      return `<article class="notification-item mention-notification ${item.unread ? 'unread' : ''}">
        <button class="notification-actor notification-profile-link" type="button" data-tag="${escapeHtml(actor.tag || '')}">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>commented in ${escapeHtml(item.scrapbookName || 'a scrapbook')}</small></span>
        </button>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        ${item.excerpt ? `<p class="notification-mention-excerpt">${mentionTextHtml(item.excerpt)}</p>` : ''}
        ${item.scrapbookId && item.entryId ? `<button class="ghost notification-view-memory" type="button" data-scrapbook-id="${escapeHtml(item.scrapbookId)}" data-entry-id="${escapeHtml(item.entryId)}">View memory</button>` : ''}
      </article>`;
    }
    if (item.type === 'invite_accepted' || item.type === 'invite_declined') {
      const accepted = item.type === 'invite_accepted';
      return `<article class="notification-item ${item.unread ? 'unread' : ''}">
        <button class="notification-actor notification-profile-link" type="button" data-tag="${escapeHtml(actor.tag || '')}">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>${accepted ? 'accepted' : 'declined'} your scrapbook invitation${item.scrapbookName ? ` · ${escapeHtml(item.scrapbookName)}` : ''}</small></span>
        </button>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
      </article>`;
    }
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
  host.querySelectorAll('.notification-view-memory').forEach(btn => btn.addEventListener('click', async () => {
    closeNotificationHub();
    try {
      const targetBookId = btn.dataset.scrapbookId;
      await loadSession(targetBookId);
      if (!activeScrapbook || activeScrapbook.id !== targetBookId) {
        showToast('That scrapbook is no longer shared with you.');
        return;
      }
      showView('stream');
      requestAnimationFrame(() => {
        document.querySelector(`#timeline [data-entry-id="${CSS.escape(btn.dataset.entryId)}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    } catch (err) {
      showToast(err.message || 'That memory is no longer available.');
    }
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
      notificationItems = notificationItems.map(item => ['couple_invite','group_invite'].includes(item.type) ? item : { ...item, unread:false });
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

function scheduleRealtimeEntryRefresh(payload = {}) {
  if (!activeScrapbook || payload.scrapbookId !== activeScrapbook.id) return;
  if (payload.from && payload.from === me?.tag) return;
  clearTimeout(realtimeEntryTimer);
  const run = async () => {
    if (isTypingFieldFocused() || editorDialog.open || scrapbookDialog.open || profileDialog.open) {
      realtimeEntryTimer = setTimeout(run, 700);
      return;
    }
    try { await refreshEntries(); } catch {}
  };
  realtimeEntryTimer = setTimeout(run, 120);
}
function scheduleRealtimeSocialRefresh() {
  clearTimeout(realtimeSocialTimer);
  const run = async () => {
    if (isTypingFieldFocused() || editorDialog.open || scrapbookDialog.open || profileDialog.open) {
      realtimeSocialTimer = setTimeout(run, 700);
      return;
    }
    try {
      const currentId = activeScrapbook?.id || null;
      await loadSession(currentId);
      if (currentMode === 'home') renderHome();
      if (currentMode === 'connections') renderConnections();
      if (currentMode === 'person' && viewedPersonData?.profile?.tag) {
        await openPersonProfile(viewedPersonData.profile.tag, { preserveReturn:true, list:personListMode });
      }
    } catch {}
  };
  realtimeSocialTimer = setTimeout(run, 180);
}
function connectLiveEvents() {
  if (!('EventSource' in window) || journalApp.classList.contains('hidden')) return;
  if (liveEventSource) {
    try { liveEventSource.close(); } catch {}
  }
  const source = new EventSource('/api/events');
  liveEventSource = source;
  source.addEventListener('notification', () => {
    refreshNotificationCount();
  });
  source.addEventListener('entries', e => {
    try { scheduleRealtimeEntryRefresh(JSON.parse(e.data || '{}')); } catch {}
  });
  source.addEventListener('social', () => {
    refreshNotificationCount();
    scheduleRealtimeSocialRefresh();
  });
  source.addEventListener('chat', e => {
    try { refreshChatRealtime(JSON.parse(e.data || '{}')); }
    catch { refreshChatRealtime({}); }
  });
  source.onerror = () => {
    // EventSource reconnects automatically. The 60-second polling remains as fallback.
  };
}
function disconnectLiveEvents() {
  if (liveEventSource) {
    try { liveEventSource.close(); } catch {}
    liveEventSource = null;
  }
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
  el.innerHTML = `<button class="follow-stat-button" type="button" data-list="followers"><b>${compactSocialCount(followers.length)}</b><span>followers</span></button><button class="follow-stat-button" type="button" data-list="following"><b>${compactSocialCount(following.length)}</b><span>following</span></button>`;
  el.querySelectorAll('.follow-stat-button').forEach(btn => btn.addEventListener('click', () => openPersonProfile(me.tag, { list:btn.dataset.list })));
}
async function savePersonalPrivacy(privacy) {
  if (!activeScrapbook || activeScrapbook.type !== 'personal' || activeScrapbook.owner !== me?.tag) return;
  try {
    const data = await api(`/api/scrapbooks/${activeScrapbook.id}/privacy`, {
      method:'PUT',
      body:JSON.stringify({ privacy })
    });
    const idx = scrapbooks.findIndex(book => book.id === activeScrapbook.id);
    activeScrapbook = data.scrapbook;
    if (idx >= 0) scrapbooks[idx] = activeScrapbook;
    renderScrapbookPicker();
    updateCover();
    renderPersonalPrivacy();
    renderPersonalPrivacyQuick();
    showToast(`Privacy changed to ${privacyLabel(activeScrapbook.privacy)}.`);
  } catch (err) {
    showToast(err.message || 'Could not update privacy.');
    renderPersonalPrivacyQuick();
  }
}

function renderPersonalPrivacyQuick() {
  const panel = $('#personalPrivacyQuick');
  if (!panel || !activeScrapbook || activeScrapbook.type !== 'personal' || activeScrapbook.owner !== me?.tag) {
    panel?.classList.add('hidden');
    if (panel) panel.innerHTML = '';
    return;
  }

  const privacy = activeScrapbook.privacy || 'private';
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="privacy-quick-inner">
    <div class="privacy-quick-copy">
      <strong>Who can read this scrapbook?</strong>
      <span>${escapeHtml(privacyLabel(privacy))}</span>
    </div>
    <div class="privacy-quick-buttons" role="group" aria-label="Personal scrapbook privacy">
      <button type="button" data-privacy="private" class="${privacy === 'private' ? 'active' : ''}">You Only</button>
      <button type="button" data-privacy="followers" class="${privacy === 'followers' ? 'active' : ''}">Followers</button>
      <button type="button" data-privacy="partner" class="${privacy === 'partner' ? 'active' : ''}">Partner</button>
    </div>
  </div>`;

  panel.querySelectorAll('[data-privacy]').forEach(button => {
    button.addEventListener('click', async () => {
      const next = button.dataset.privacy;
      if (!next || next === activeScrapbook.privacy) return;
      panel.querySelectorAll('[data-privacy]').forEach(item => { item.disabled = true; });
      await savePersonalPrivacy(next);
    });
  });
}

async function saveAllPersonalPrivacy(privacy) {
  const ownedPersonal = scrapbooks.filter(book => book.type === 'personal' && book.owner === me?.tag);
  if (!ownedPersonal.length) return;

  try {
    const data = await api('/api/personal/privacy', {
      method:'PUT',
      body:JSON.stringify({ privacy })
    });

    const updated = Array.isArray(data.scrapbooks) ? data.scrapbooks : [];
    const byId = new Map(updated.map(book => [book.id, book]));
    scrapbooks = scrapbooks.map(book => byId.get(book.id) || book);

    if (activeScrapbook && byId.has(activeScrapbook.id)) {
      activeScrapbook = byId.get(activeScrapbook.id);
    }

    renderScrapbookPicker();
    updateCover();
    renderPersonalPrivacy();
    renderPersonalPrivacyQuick();
    renderHome();

    showToast(`${updated.length} Personal scrapbook${updated.length === 1 ? '' : 's'} changed to ${privacyLabel(privacy)}.`);
  } catch (err) {
    showToast(err.message || 'Could not update all Personal scrapbook privacy.');
    renderPersonalPrivacy();
  }
}

function renderPersonalPrivacy() {
  const panel = $('#personalPrivacyPanel');
  if (!activeScrapbook || activeScrapbook.type !== 'personal') {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');
  if (activeScrapbook.owner !== me.tag) {
    panel.innerHTML = `<div class="privacy-card readonly"><strong>Read-only Personal scrapbook</strong><p>@${escapeHtml(activeScrapbook.owner)} shared this scrapbook through <b>${escapeHtml(privacyLabel(activeScrapbook.privacy))}</b>. Only the owner can write or change its privacy.</p></div>`;
    return;
  }

  const ownedPersonal = scrapbooks.filter(book => book.type === 'personal' && book.owner === me.tag);
  const privacyValues = [...new Set(ownedPersonal.map(book => book.privacy || 'private'))];
  const bulkPrivacy = privacyValues.length === 1 ? privacyValues[0] : 'mixed';

  panel.innerHTML = `<div class="privacy-card"><div><strong>All Personal scrapbooks privacy</strong><p>Changing this setting applies to all ${ownedPersonal.length} of your Personal scrapbooks. Afterward, you can open any one scrapbook and manually give that book a different privacy setting.</p></div><select id="personalPrivacySelect" aria-label="Apply privacy to all Personal scrapbooks">
    ${bulkPrivacy === 'mixed' ? '<option value="mixed" selected disabled>Mixed — individual settings differ</option>' : ''}
    <option value="followers" ${bulkPrivacy==='followers'?'selected':''}>Followers Only — all Personal scrapbooks</option>
    <option value="partner" ${bulkPrivacy==='partner'?'selected':''}>Partner Only — all Personal scrapbooks</option>
    <option value="private" ${bulkPrivacy==='private'?'selected':''}>You Only — all Personal scrapbooks</option>
  </select></div>`;
  $('#personalPrivacySelect')?.addEventListener('change', e => {
    if (e.target.value && e.target.value !== 'mixed') saveAllPersonalPrivacy(e.target.value);
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
      ? 'Your Personal scrapbook. The privacy setting below can apply one choice to all of your Personal scrapbooks.'
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
    selector:'#profileBtn',
    eyebrow:'YOUR SCRAPBOOKS',
    title:'Your scrapbook controls now live in Profile.',
    text:'Open Profile to switch between your Personal, Lovers, and Group scrapbooks. The + button in the header creates a new scrapbook.'
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
    introducedIn:8,
    selector:'#profileBtn',
    eyebrow:'NEW · PERSONAL SCRAPBOOKS',
    title:'Personal scrapbooks now work better with multiple journals.',
    text:'A person can own more than one Personal scrapbook. Every scrapbook shared with you now appears on their profile and Home shelf. Owners can also change You Only, Followers Only, or Partner Only directly from the active scrapbook.',
    prepare:() => showView('home')
  },
  {
    introducedIn:7,
    selector:'#profileBtn',
    eyebrow:'NEW · NIGHT MODE',
    title:'Appearance settings now live in Profile.',
    text:'Open Profile to switch between light and night mode. Your choice follows your account across devices.',
    prepare:() => showView('home')
  },
  {
    introducedIn:7,
    selector:'#coverThemeSelect',
    eyebrow:'NEW · BOOK COVERS & MOBILE CHAT',
    title:'Make each book feel different—and chats cleaner on phones.',
    text:'Scrapbook owners can choose a shared cover theme. Group chat member counts are tappable, and phone Messages now open one conversation at a time instead of stacking the list and chat together.',
    prepare:() => showView('cover')
  },
  {
    introducedIn:6,
    selector:'#messagesModeBtn',
    eyebrow:'NEW · PRIVATE & GROUP CHAT',
    title:'Messages now live beside your scrapbooks.',
    text:'Start a private conversation from any profile or by @tag. Every Group scrapbook has an automatic shared chat, and chats can include image attachments.',
    prepare:() => showView('home')
  },
  {
    introducedIn:5,
    selector:'#notificationBtn',
    eyebrow:'NEW · LIVE SCRAPBOOK UPDATES',
    title:'Comments and social changes now arrive in real time.',
    text:'The bell updates immediately for follows, invitations, comments, and mentions while you are online. Supported browser notifications can also alert you when the scrapbook is in the background.',
    prepare:() => { closeNotificationHub(); showView('home'); }
  },
  {
    introducedIn:4,
    selector:'#notificationBtn',
    eyebrow:'NEW · SMARTER @MENTIONS',
    title:'Tagging people is faster and can reach them outside the app.',
    text:'Type @ in Profile About or Personal/Group comments to see tag suggestions. Tap a name to insert it. People who enabled browser notifications can also receive a push when you mention them.',
    prepare:() => { closeNotificationHub(); showView('home'); }
  },
  {
    introducedIn:3,
    selector:'#homeSearchForm',
    eyebrow:'NEW · SEARCH FROM HOME',
    title:'Finding someone is now available right from Home.',
    text:'Search an @tag here to open a profile, follow someone, or find a Personal scrapbook they have shared with you.',
    prepare:() => showView('home')
  },
  {
    introducedIn:3,
    selector:'#profileBtn',
    eyebrow:'NEW · TAGS & COMMENTS',
    title:'@tags now connect profiles and scrapbook conversations.',
    text:'Use @tag in your profile About or in comments on Personal and Group scrapbook memories. The person you tag receives a notification. Saved memories also show the time they were posted.',
    prepare:() => showView('home')
  },
  {
    introducedIn:2,
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
  const step = activeGuideSteps[guideIndex];
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
  const step = activeGuideSteps[guideIndex];
  step.prepare?.();
  requestAnimationFrame(() => {
    const target = guideTarget(step);
    target?.scrollIntoView?.({ block:'nearest', inline:'nearest', behavior:'smooth' });
    setTimeout(positionGuideSpotlight, 160);
  });

  $('#guideStepLabel').textContent = `${guideIndex + 1} of ${activeGuideSteps.length}`;
  $('#guideProgressBar').style.width = `${((guideIndex + 1) / activeGuideSteps.length) * 100}%`;
  $('#guideEyebrow').textContent = step.eyebrow;
  $('#guideTitle').textContent = step.title;
  $('#guideText').textContent = step.text;
  const tip = $('#guideTip');
  tip.textContent = step.tip || '';
  tip.classList.toggle('hidden', !step.tip);
  $('#guideBackBtn').classList.toggle('hidden', guideIndex === 0);
  const isLast = guideIndex === activeGuideSteps.length - 1;
  const isUpdateOnly = guideMandatory && (Number(guideState.seenVersion) || 0) > 0;
  $('#guideNextBtn').textContent = isLast ? (isUpdateOnly ? 'Got it' : 'Start journaling') : 'Next';
  $('#guideCloseBtn').classList.toggle('hidden', guideMandatory);
}
function startGuide(required = false) {
  if (guideRunning) return;
  guideMandatory = required === true;
  const seenVersion = Math.max(0, Number(guideState.seenVersion) || 0);
  activeGuideSteps = guideMandatory && seenVersion > 0
    ? GUIDE_STEPS.filter(step => (Number(step.introducedIn) || 1) === Number(guideState.version || 1))
    : [...GUIDE_STEPS];

  if (!activeGuideSteps.length) {
    guideState.required = false;
    maybeOpenReminderComposer();
    return;
  }

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
  activeGuideSteps = [];
  $('#guideOverlay').classList.add('hidden');
  document.body.classList.remove('guide-active');
  $('#guideSpotlight').style.cssText = '';
  showView('home');
  if (wasMandatory) maybeOpenReminderComposer();
}
$('#guideNextBtn').addEventListener('click', async () => {
  if (guideIndex >= activeGuideSteps.length - 1) {
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
function personPersonalBookHtml(book) {
  if (!book) return '';
  return `<div class="person-book-layout">
    <div class="person-book-copy">
      <p class="eyebrow">PERSONAL SCRAPBOOK</p>
      <h3>${escapeHtml(book.name || 'Personal Scrapbook')}</h3>
      <p>${escapeHtml(privacyLabel(book.privacy))} · Shared with you. Open it as a flip book or read it as a continuous Memory Stream.</p>
      <div class="person-book-actions">
        <button class="primary person-open-book" data-id="${escapeHtml(book.id)}" data-mode="book" type="button">Open book</button>
        <button class="ghost person-open-book" data-id="${escapeHtml(book.id)}" data-mode="stream" type="button">Memory stream</button>
      </div>
    </div>
    <button class="person-closed-book person-book-tap" data-id="${escapeHtml(book.id)}" type="button" aria-label="Open ${escapeHtml(book.name || 'Personal scrapbook')}">
      <div class="person-book-spine"></div>
      <div class="person-book-face">
        <span>✦</span>
        <small>PERSONAL SCRAPBOOK</small>
        <strong>${escapeHtml(book.name || 'Personal Scrapbook')}</strong>
        <em>${escapeHtml(privacyLabel(book.privacy))}</em>
      </div>
    </button>
  </div>`;
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
      ${p.bio ? `<p class="profile-about-text">${mentionTextHtml(p.bio)}</p>` : '<p class="muted">No bio yet.</p>'}
      <div class="person-relation-badges">${data.isPartner ? '<span>Partner</span>' : ''}${data.followsYou ? '<span>Follows you</span>' : ''}${data.isFollowing ? '<span>You follow</span>' : ''}</div>
    </div>`;
  $('#personFollowerCount').textContent = compactSocialCount(data.followerCount || 0);
  $('#personFollowingCount').textContent = compactSocialCount(data.followingCount || 0);

  $('#personProfileActions').innerHTML = data.isSelf
    ? '<button id="personEditOwnProfile" class="ghost" type="button">Edit my profile</button>'
    : `<button class="primary person-message-btn" type="button">Message</button><button class="${data.isFollowing ? 'ghost' : 'primary'} person-follow-toggle" type="button">${data.isFollowing ? 'Following' : 'Follow'}</button>`;

  const personalBooks = Array.isArray(data.personalScrapbooks)
    ? data.personalScrapbooks
    : (data.personalScrapbook?.accessible ? [data.personalScrapbook] : []);
  const hasLockedPersonalScrapbooks =
    data.hasLockedPersonalScrapbooks === true ||
    Boolean(data.personalScrapbook && data.personalScrapbook.accessible === false);

  if (!personalBooks.length && !hasLockedPersonalScrapbooks) {
    $('#personScrapbookPanel').innerHTML = '<div class="person-no-book"><span>♡</span><strong>No Personal scrapbook yet</strong><p>This profile has not created a Personal scrapbook.</p></div>';
  } else {
    const visibleBooks = personalBooks.map(personPersonalBookHtml).join('');
    const privateNotice = hasLockedPersonalScrapbooks
      ? `<div class="person-book-layout person-private-book-notice">
          <div class="person-book-copy"><p class="eyebrow">PERSONAL SCRAPBOOK</p><h3>Private scrapbook</h3><p>This person also has a Personal scrapbook that is not shared with you under its current privacy setting.</p></div>
          <div class="person-closed-book locked"><div class="person-book-spine"></div><div class="person-book-face"><span>🔒</span><small>PERSONAL SCRAPBOOK</small><strong>Private</strong></div></div>
        </div>`
      : '';
    $('#personScrapbookPanel').innerHTML = `<div class="person-books-grid">${visibleBooks}${privateNotice}</div>`;
  }

  wireProfileLinks($('#personProfileIdentity'));
  $('#personAvatarZoomBtn')?.addEventListener('click', () => openProfileImageViewer(p));
  $('#personEditOwnProfile')?.addEventListener('click', () => $('#profileBtn').click());
  $('#personProfileActions .person-message-btn')?.addEventListener('click', () => startPrivateChat(p.tag));
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
  const mode = ['home','cover','book','stream','connections','messages'].includes(personProfileReturnMode) ? personProfileReturnMode : 'connections';
  if (mode === 'home' || mode === 'connections') await refreshAndShow(mode);
  else showView(mode);
});

function compactSocialCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1000) return `${Math.floor(count / 1000)}k+`;
  if (count > 100) return '99+';
  return String(count);
}
function homeAccessibleBooks(item) {
  return Array.isArray(item?.scrapbooks)
    ? item.scrapbooks
    : (item?.scrapbook?.accessible ? [item.scrapbook] : []);
}
function homeHasLockedBooks(item) {
  return item?.hasLockedPersonalScrapbooks === true ||
    Boolean(item?.scrapbook && item.scrapbook.accessible === false);
}
function renderHome() {
  if (!me) return;
  if (!$('#homeSearchInput')?.value.trim()) {
    $('#homeSearchResults')?.classList.add('hidden');
    if ($('#homeSearchResults')) $('#homeSearchResults').innerHTML = '';
  }

  const rawShelf = Array.isArray(homeData.followingShelf) ? homeData.followingShelf : [];
  const shelf = rawShelf.filter(item => {
    const books = homeAccessibleBooks(item);
    return books.length > 0 || !homeHasLockedBooks(item);
  });

  $('#homeFollowingCount').textContent = `${compactSocialCount(following.length)} following`;
  $('#homeShelf').innerHTML = shelf.length ? shelf.map(item => {
    const p = item.profile || {};
    const books = homeAccessibleBooks(item);
    const firstBook = books[0] || null;

    const booksHtml = firstBook ? `<div class="home-personal-book-card">
      <div class="home-closed-book" data-book-id="${escapeHtml(firstBook.id)}">
        <div class="home-book-spine"></div>
        <div class="home-book-face">
          <span class="home-book-mark">✦</span>
          <small>PERSONAL SCRAPBOOK</small>
          <strong>${escapeHtml(firstBook.name || 'Personal Scrapbook')}</strong>
          <em>${escapeHtml(privacyLabel(firstBook.privacy))}</em>
        </div>
      </div>
      <div class="home-book-actions">
        <button class="primary home-open-book" data-id="${escapeHtml(firstBook.id)}" data-mode="book" type="button">Open book</button>
        <button class="ghost home-open-book" data-id="${escapeHtml(firstBook.id)}" data-mode="stream" type="button">Memory stream</button>
      </div>
    </div>` : '';

    const moreBooksHtml = books.length > 1 ? `
      <button class="ghost home-view-all-books" type="button" data-profile-tag="${escapeHtml(p.tag || '')}" aria-label="View all scrapbooks by ${escapeHtml(p.displayName || p.tag || 'this person')}">
        <span>View all scrapbooks</span>
        <small>Tap here to see the rest</small>
      </button>` : '';

    const emptyHtml = !books.length ? `<div class="home-personal-book-card">
      <div class="home-closed-book empty-book">
        <div class="home-book-face">
          <span class="home-book-mark">♡</span>
          <small>PERSONAL SCRAPBOOK</small>
          <strong>No scrapbook yet</strong>
          <em>Nothing to open right now</em>
        </div>
      </div>
    </div>` : '';

    return `<article class="home-shelf-card">
      <button class="home-person-row" type="button" data-profile-tag="${escapeHtml(p.tag || '')}">
        ${avatarHtml(p,'home-person-avatar')}
        <span><strong>${escapeHtml(p.displayName || p.tag)}</strong><em>@${escapeHtml(p.tag || '')}</em></span>
      </button>
      <div class="home-personal-books-grid">${booksHtml}${emptyHtml}${moreBooksHtml}</div>
    </article>`;
  }).join('') : '<div class="home-empty"><span>♡</span><strong>Your shelf is empty.</strong><p>Follow someone and their Personal scrapbooks will appear here when they choose to share them with you.</p></div>';

  const suggestions = Array.isArray(homeData.friendSuggestions) ? homeData.friendSuggestions : [];
  $('#homeSuggestions').innerHTML = suggestions.length ? suggestions.map(item => {
    const p = item.profile || {};
    const viaNames = (item.via || []).map(v => `@${escapeHtml(v.tag)}`).join(', ');
    return `<article class="home-suggestion-card" data-tag="${escapeHtml(p.tag || '')}" data-profile-tag="${escapeHtml(p.tag || '')}">
      ${avatarHtml(p,'home-suggestion-avatar')}
      <div class="home-suggestion-copy"><strong>${escapeHtml(p.displayName || p.tag)}</strong><span>@${escapeHtml(p.tag || '')}</span><small>${item.mutualCount || 1} friend connection${(item.mutualCount || 1) === 1 ? '' : 's'}${viaNames ? ` · through ${viaNames}` : ''}</small></div>
      <button class="primary home-follow-suggestion" type="button">Follow</button>
    </article>`;
  }).join('') : '<p class="home-suggestion-empty">Suggestions will appear here as your scrapbook circle grows.</p>';

  $('#homeShelf').querySelectorAll('.home-open-book').forEach(btn => btn.addEventListener('click', async () => {
    await openHomeScrapbook(btn.dataset.id, btn.dataset.mode || 'book');
  }));
  wireProfileLinks(homeView);
  $('#homeSuggestions').querySelectorAll('.home-follow-suggestion').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
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
function renderHomeSearchResults(people = []) {
  const host = $('#homeSearchResults');
  if (!host) return;
  host.classList.remove('hidden');
  if (!people.length) {
    host.innerHTML = '<p class="home-search-empty">No matching profiles found.</p>';
    return;
  }
  host.innerHTML = people.map(person => `<article class="home-search-person" data-profile-tag="${escapeHtml(person.tag)}" data-tag="${escapeHtml(person.tag)}">
    ${avatarHtml(person,'home-search-avatar')}
    <div><strong>${escapeHtml(person.displayName || person.tag)}</strong><span>@${escapeHtml(person.tag)}</span>${person.bio ? `<small>${mentionTextHtml(person.bio)}</small>` : ''}</div>
    <button class="${person.isFollowing ? 'ghost' : 'primary'} home-search-follow" type="button">${person.isFollowing ? 'Following' : 'Follow'}</button>
  </article>`).join('');
  wireProfileLinks(host);
  host.querySelectorAll('.home-search-follow').forEach(btn => btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    const card = btn.closest('.home-search-person');
    const tag = card?.dataset.tag;
    if (!tag) return;
    const currentlyFollowing = btn.textContent.trim() === 'Following';
    btn.disabled = true;
    try {
      await api(`/api/people/${encodeURIComponent(tag)}/follow`, {
        method:currentlyFollowing ? 'DELETE' : 'POST',
        body:currentlyFollowing ? undefined : '{}'
      });
      await loadSession(activeScrapbook?.id || null);
      const query = $('#homeSearchInput').value.trim();
      if (query) await runHomePeopleSearch(query);
      showToast(currentlyFollowing ? `Unfollowed @${tag}.` : `You are now following @${tag}.`);
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
    }
  }));
}
let homePeopleSearchTimer = null;
let homePeopleSearchSeq = 0;
async function runHomePeopleSearch(rawQuery = $('#homeSearchInput')?.value || '') {
  const input = $('#homeSearchInput');
  const host = $('#homeSearchResults');
  const query = String(rawQuery || '').trim();
  if (!input || !host || !query) {
    host?.classList.add('hidden');
    if (host) host.innerHTML = '';
    return;
  }
  const seq = ++homePeopleSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== homePeopleSearchSeq) return;
    renderHomeSearchResults(data.people || []);
  } catch (err) {
    if (seq === homePeopleSearchSeq) showToast(err.message || 'Could not search profiles.');
  }
}
$('#homeSearchInput').addEventListener('input', e => {
  clearTimeout(homePeopleSearchTimer);
  const query = e.currentTarget.value.trim();
  if (!query) {
    $('#homeSearchResults').classList.add('hidden');
    $('#homeSearchResults').innerHTML = '';
    return;
  }
  homePeopleSearchTimer = setTimeout(() => runHomePeopleSearch(query), 120);
});
$('#homeSearchInput').addEventListener('focus', e => {
  const query = e.currentTarget.value.trim();
  if (query) runHomePeopleSearch(query);
});
$('#homeSearchForm').addEventListener('submit', async e => {
  e.preventDefault();
  await runHomePeopleSearch($('#homeSearchInput').value);
});

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

function renderMessagesBadge() {
  const badge = $('#messagesBadge');
  if (!badge) return;
  const count = Math.max(0, Number(chatUnreadCount) || 0);
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count < 1);
  $('#messagesModeBtn')?.classList.toggle('has-unread', count > 0);
}
function chatWhen(value) {
  const d = new Date(value || '');
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour:'numeric', minute:'2-digit' }
    : { month:'short', day:'numeric' }).format(d);
}
function activeChat() {
  return chats.find(chat => chat.id === activeChatId) || null;
}
function chatAvatarHtml(chat) {
  if (chat.type === 'private') return avatarHtml(chat.otherProfile || {}, 'chat-list-avatar');
  const members = Array.isArray(chat.members) ? chat.members.slice(0,3) : [];
  return `<span class="chat-group-avatar">${members.map((member,i)=>avatarHtml(member,`chat-stack-avatar chat-stack-${i}`)).join('')}<b>👥</b></span>`;
}
function renderChatList() {
  const host = $('#chatList');
  if (!host) return;
  if (!chats.length) {
    host.innerHTML = '<div class="chat-list-empty"><span>💬</span><strong>No conversations yet</strong><p>Start a private message by @tag. Group scrapbook chats will appear here automatically.</p></div>';
    return;
  }
  host.innerHTML = chats.map(chat => {
    const last = chat.lastMessage;
    const preview = last ? (last.text || (last.image ? '📷 Photo' : 'New message')) : (chat.type === 'group' ? 'Group scrapbook chat' : 'Start a conversation');
    return `<button class="chat-list-item ${chat.id === activeChatId ? 'active' : ''}" type="button" data-chat-id="${escapeHtml(chat.id)}">
      ${chatAvatarHtml(chat)}
      <span class="chat-list-copy"><strong>${escapeHtml(chat.name || 'Conversation')}</strong><small>${escapeHtml(preview)}</small></span>
      <span class="chat-list-meta">${last ? `<time>${escapeHtml(chatWhen(last.createdAt))}</time>` : ''}${chat.unreadCount ? `<b>${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</b>` : ''}</span>
    </button>`;
  }).join('');
  host.querySelectorAll('.chat-list-item').forEach(btn => btn.addEventListener('click', () => openChat(btn.dataset.chatId)));
}
function openChatMembersDialog(chat) {
  if (!chat || chat.type !== 'group') return;
  const members = Array.isArray(chat.members) ? chat.members : [];
  $('#chatMembersTitle').textContent = `${chat.name || 'Group chat'} · ${members.length} member${members.length === 1 ? '' : 's'}`;
  const host = $('#chatMembersList');
  host.innerHTML = members.length ? members.map(member => `<button class="chat-member-row" type="button" data-profile-tag="${escapeHtml(member.tag || '')}">
    ${avatarHtml(member,'chat-member-avatar')}
    <span><strong>${escapeHtml(member.displayName || member.tag || 'Member')}</strong><small>@${escapeHtml(member.tag || '')}</small></span>
    ${member.tag === me?.tag ? '<em>You</em>' : ''}
  </button>`).join('') : '<p class="helper">No members found.</p>';
  wireProfileLinks(host);
  host.querySelectorAll('.chat-member-row').forEach(row => row.addEventListener('click', () => {
    $('#chatMembersDialog').close();
  }));
  $('#chatMembersDialog').showModal();
}
function syncMobileChatViewport() {
  if (!messagesView) return;
  if (!window.matchMedia('(max-width: 800px)').matches || !messagesView.classList.contains('chat-open')) {
    messagesView.style.removeProperty('--mobile-chat-top');
    return;
  }
  const topbar = document.querySelector('.topbar');
  const top = Math.max(0, Math.round(topbar?.getBoundingClientRect().bottom || 0));
  messagesView.style.setProperty('--mobile-chat-top', `${top}px`);
}
function closeMobileChat() {
  messagesView?.classList.remove('chat-open');
  messagesView?.style.removeProperty('--mobile-chat-top');
  if (window.matchMedia('(max-width: 800px)').matches) {
    activeChatId = null;
    activeChatMessages = [];
    $('#activeChat')?.classList.add('hidden');
    $('#chatEmptyState')?.classList.remove('hidden');
    renderChatList();
  }
}
function renderChatHeader(chat) {
  const host = $('#chatHeader');
  if (!host || !chat) return;
  const memberCount = Array.isArray(chat.members) ? chat.members.length : 0;
  host.innerHTML = `<button class="chat-mobile-back" type="button" aria-label="Back to conversations">←</button><div class="chat-header-identity">${chatAvatarHtml(chat)}<div><p class="eyebrow">${chat.type === 'group' ? 'GROUP SCRAPBOOK CHAT' : 'PRIVATE MESSAGE'}</p><h3>${escapeHtml(chat.name || 'Conversation')}</h3>${chat.type === 'group' ? `<button class="chat-member-count" type="button">${memberCount} member${memberCount === 1 ? '' : 's'} · tap to view</button>` : `<button class="chat-profile-link" type="button" data-profile-tag="${escapeHtml(chat.otherProfile?.tag || '')}">@${escapeHtml(chat.otherProfile?.tag || '')}</button>`}</div></div>`;
  wireProfileLinks(host);
  host.querySelector('.chat-mobile-back')?.addEventListener('click', closeMobileChat);
  host.querySelector('.chat-member-count')?.addEventListener('click', () => openChatMembersDialog(chat));
}
function renderChatMessages() {
  const host = $('#chatMessages');
  if (!host) return;
  if (!activeChatMessages.length) {
    host.innerHTML = '<div class="chat-messages-empty"><span>♡</span><p>This conversation is just getting started.</p></div>';
    return;
  }
  host.innerHTML = activeChatMessages.map(message => {
    const mine = message.author === me?.tag;
    const profile = message.profile || {};
    return `<article class="chat-message ${mine ? 'mine' : 'theirs'}">
      ${mine ? '' : `<button class="chat-message-author" type="button" data-profile-tag="${escapeHtml(message.author || '')}">${avatarHtml(profile,'chat-message-avatar')}</button>`}
      <div class="chat-bubble">
        ${!mine ? `<strong>${escapeHtml(profile.displayName || message.author || '')}</strong>` : ''}
        ${message.image ? `<img class="chat-message-image" src="${escapeHtml(message.image)}" alt="Chat photo" loading="lazy" />` : ''}
        ${message.text ? `<p>${mentionTextHtml(message.text).replace(/\n/g,'<br>')}</p>` : ''}
        <time>${escapeHtml(chatWhen(message.createdAt))}</time>
      </div>
    </article>`;
  }).join('');
  wireProfileLinks(host);
  requestAnimationFrame(() => { host.scrollTop = host.scrollHeight; });
}
function renderPendingChatImage() {
  const host = $('#chatImagePreview');
  if (!host) return;
  if (!pendingChatFile || !pendingChatPreviewUrl) {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }
  host.classList.remove('hidden');
  host.innerHTML = `<div><img src="${pendingChatPreviewUrl}" alt="Photo to send" /><button id="removeChatImageBtn" type="button" aria-label="Remove attached photo">×</button><span>${escapeHtml(pendingChatFile.name || 'Photo')}</span></div>`;
  $('#removeChatImageBtn')?.addEventListener('click', () => clearPendingChatImage());
}
function clearPendingChatImage() {
  if (pendingChatPreviewUrl) URL.revokeObjectURL(pendingChatPreviewUrl);
  pendingChatPreviewUrl = '';
  pendingChatFile = null;
  if ($('#chatPhotoInput')) $('#chatPhotoInput').value = '';
  renderPendingChatImage();
}
async function loadChats({ preserveActive = true } = {}) {
  const data = await api('/api/chats');
  chats = data.chats || [];
  chatUnreadCount = Number(data.unreadCount) || 0;
  if (!preserveActive || !chats.some(chat => chat.id === activeChatId)) activeChatId = null;
  renderMessagesBadge();
  renderChatList();
  return chats;
}
async function loadChatMessages(chatId = activeChatId) {
  if (!chatId) return;
  const data = await api(`/api/chats/${encodeURIComponent(chatId)}/messages`);
  activeChatId = chatId;
  activeChatMessages = data.messages || [];
  chatUnreadCount = Number(data.unreadCount) || 0;
  const latest = data.chat;
  const idx = chats.findIndex(chat => chat.id === chatId);
  if (latest) {
    if (idx >= 0) chats[idx] = latest;
    else chats.unshift(latest);
  }
  renderMessagesBadge();
  renderChatList();
  renderChatHeader(latest || activeChat());
  renderChatMessages();
  $('#chatEmptyState')?.classList.add('hidden');
  $('#activeChat')?.classList.remove('hidden');
}
async function openChat(chatId) {
  if (!chatId) return;
  activeChatId = chatId;
  if (currentMode !== 'messages') showView('messages');
  messagesView?.classList.add('chat-open');
  syncMobileChatViewport();
  try { await loadChatMessages(chatId); }
  catch (err) { showToast(err.message || 'Could not open that conversation.'); }
}
async function startPrivateChat(tag) {
  const clean = String(tag || '').trim().replace(/^@/,'').toLowerCase();
  if (!clean) return;
  try {
    const data = await api('/api/chats/private', { method:'POST', body:JSON.stringify({ tag:clean }) });
    await loadChats();
    await openChat(data.chat.id);
    $('#privateChatTag').value = '';
  } catch (err) {
    showToast(err.message || 'Could not start that conversation.');
  }
}
async function refreshChatRealtime(payload = {}) {
  clearTimeout(realtimeChatTimer);
  realtimeChatTimer = setTimeout(async () => {
    try {
      await loadChats();
      if (currentMode === 'messages' && activeChatId && payload.chatId === activeChatId && payload.from !== me?.tag) {
        await loadChatMessages(activeChatId);
      }
    } catch {}
  }, 120);
}

function showView(mode) {
  currentMode = mode;
  if (mode === 'book') setBookCoverOpen(true);
  homeView.classList.toggle('hidden', mode !== 'home');
  coverStage.classList.toggle('hidden', mode !== 'cover');
  bookView.classList.toggle('hidden', mode !== 'book');
  streamView.classList.toggle('hidden', mode !== 'stream');
  connectionsView.classList.toggle('hidden', mode !== 'connections');
  messagesView.classList.toggle('hidden', mode !== 'messages');
  personProfileView.classList.toggle('hidden', mode !== 'person');
  $('#homeModeBtn').classList.toggle('active', mode === 'home');
  $('#bookModeBtn').classList.toggle('active', mode === 'book');
  $('#streamModeBtn').classList.toggle('active', mode === 'stream');
  $('#connectionsModeBtn').classList.toggle('active', mode === 'connections' || mode === 'person');
  $('#messagesModeBtn').classList.toggle('active', mode === 'messages');

  const noBook = !activeScrapbook;
  const noEntries = activeScrapbook && !entries.length;
  const canWrite = Boolean(activeScrapbook && activeScrapbook.canWrite !== false);
  $('#newEntryBtn').classList.toggle('hidden', mode === 'home' || mode === 'person' || mode === 'messages' || (Boolean(activeScrapbook) && !canWrite));
  emptyState.classList.toggle('hidden', mode === 'home' || mode === 'cover' || mode === 'connections' || mode === 'person' || mode === 'messages' || (!noBook && !noEntries));

  if (mode === 'home') {
    renderHome();
    return;
  }
  if (mode === 'person') {
    renderPersonProfile();
    return;
  }
  if (mode === 'messages') {
    loadChats().then(() => {
      if (!activeChatId) {
        $('#chatEmptyState')?.classList.remove('hidden');
        $('#activeChat')?.classList.add('hidden');
      }
    }).catch(() => {});
    return;
  }
  if (noBook && mode !== 'cover' && mode !== 'connections' && mode !== 'messages') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
    $('#emptyTitle').textContent = 'Your first scrapbook starts here.';
    $('#emptyText').textContent = 'Create a lovers scrapbook, a group scrapbook, or your own Personal scrapbook.';
    $('#emptyAddBtn').textContent = 'Create scrapbook';
  } else if (noEntries && mode !== 'cover' && mode !== 'connections' && mode !== 'messages') {
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
  applyAppearanceMode(me?.appearanceMode || 'light');
  scrapbooks = data.scrapbooks || [];
  invites = data.invites || [];
  following = data.following || [];
  followers = data.followers || [];
  homeData = data.home || { followingShelf: [], friendSuggestions: [] };
  notificationSummary = data.notifications || { count:0, pendingInvites:0 };
  chatUnreadCount = Number(data.messages?.unreadCount) || 0;
  guideState = data.guide || { version:8, seenVersion:7, required:false };
  partnerTag = data.partnerTag || null;
  const remembered = localStorage.getItem('activeScrapbookId');
  activeScrapbook = scrapbooks.find(b => b.id === preferredBookId) || scrapbooks.find(b => b.id === remembered) || scrapbooks[0] || null;
  if (activeScrapbook) localStorage.setItem('activeScrapbookId', activeScrapbook.id);
  renderScrapbookPicker(); renderProfileChip(); renderInviteBanner(); renderNotificationBadge(); renderMessagesBadge(); renderFollowStats(); renderHome(); updateCover();
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
  const messageChatId = params.get('messages');
  if (messageChatId) {
    history.replaceState({}, '', location.pathname);
    setTimeout(async () => {
      showView('messages');
      await loadChats();
      if (chats.some(chat => chat.id === messageChatId)) await openChat(messageChatId);
    }, 180);
    return;
  }
  if (params.get('notifications') === '1') {
    history.replaceState({}, '', location.pathname);
    setTimeout(() => loadNotificationHub({ markRead:true }), 250);
    return;
  }
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
  connectLiveEvents();
  if (guideState.required) setTimeout(() => startGuide(true), 180);
  else maybeOpenReminderComposer();
}
$('#logoutBtn').addEventListener('click', async () => {
  disconnectLiveEvents();
  applyAppearanceMode('light');
  await api('/api/logout', { method:'POST', body:'{}' }).catch(()=>{});
  localStorage.removeItem('activeScrapbookId'); location.reload();
});
$('#brandButton').addEventListener('click', async () => {
  if (profileDialog.open) profileDialog.close();
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
$('#messagesModeBtn').addEventListener('click', () => { closeMobileChat(); showView('messages'); });
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
    if (profileDialog.open) profileDialog.close();
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
    const data = await api('/api/scrapbooks', { method:'POST', body:JSON.stringify({ type, name:$('#scrapbookName').value.trim(), privacy:$('#personalPrivacy').value, coverTheme:$('#scrapbookCoverTheme').value }) });
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

$('#themeModeBtn').addEventListener('click', async () => {
  const previous = normalizeAppearanceMode(me?.appearanceMode);
  const next = previous === 'night' ? 'light' : 'night';
  applyAppearanceMode(next);
  if (me) me.appearanceMode = next;
  try {
    await api('/api/preferences', { method:'PUT', body:JSON.stringify({ appearanceMode:next }) });
  } catch (err) {
    applyAppearanceMode(previous);
    if (me) me.appearanceMode = previous;
    showToast(err.message || 'Could not save appearance mode.');
  }
});
$('#coverThemeSelect').addEventListener('change', async e => {
  if (!activeScrapbook?.id || activeScrapbook.isOwner !== true) {
    e.currentTarget.value = normalizeCoverTheme(activeScrapbook?.coverTheme);
    return;
  }
  const previous = normalizeCoverTheme(activeScrapbook.coverTheme);
  const next = normalizeCoverTheme(e.currentTarget.value);
  activeScrapbook.coverTheme = next;
  applyActiveCoverTheme();
  try {
    const data = await api(`/api/scrapbooks/${encodeURIComponent(activeScrapbook.id)}/cover-theme`, {
      method:'PUT',
      body:JSON.stringify({ coverTheme:next })
    });
    if (data.scrapbook) {
      activeScrapbook = data.scrapbook;
      const idx = scrapbooks.findIndex(book => book.id === activeScrapbook.id);
      if (idx >= 0) scrapbooks[idx] = activeScrapbook;
      applyActiveCoverTheme();
    }
    showToast('Book cover updated.');
  } catch (err) {
    activeScrapbook.coverTheme = previous;
    applyActiveCoverTheme();
    showToast(err.message || 'Could not update the book cover.');
  }
});
$('#closeChatMembersDialog').addEventListener('click', () => $('#chatMembersDialog').close());

let privateChatSearchTimer = null;
let privateChatSearchSeq = 0;
function hidePrivateChatSuggestions() {
  const host = $('#privateChatSuggestions');
  host?.classList.add('hidden');
  if (host) host.innerHTML = '';
}
function renderPrivateChatSuggestions(people = []) {
  const host = $('#privateChatSuggestions');
  if (!host) return;
  const filtered = people.filter(person => person?.tag && person.tag !== me?.tag).slice(0,8);
  if (!filtered.length) {
    host.innerHTML = '<p class="private-chat-suggestion-empty">No matching people.</p>';
    host.classList.remove('hidden');
    return;
  }
  host.innerHTML = filtered.map(person => `<button class="private-chat-suggestion" type="button" data-tag="${escapeHtml(person.tag)}">
    ${avatarHtml(person,'mention-suggestion-avatar')}
    <span><strong>${escapeHtml(person.displayName || person.tag)}</strong><small>@${escapeHtml(person.tag)}</small></span>
  </button>`).join('');
  host.classList.remove('hidden');
  host.querySelectorAll('.private-chat-suggestion').forEach(btn => btn.addEventListener('pointerdown', async e => {
    e.preventDefault();
    const tag = btn.dataset.tag;
    if (!tag) return;
    $('#privateChatTag').value = `@${tag}`;
    hidePrivateChatSuggestions();
    await startPrivateChat(tag);
  }));
}
async function runPrivateChatSearch(rawQuery = $('#privateChatTag')?.value || '') {
  const query = String(rawQuery || '').trim();
  if (!query) {
    hidePrivateChatSuggestions();
    return;
  }
  const seq = ++privateChatSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== privateChatSearchSeq) return;
    renderPrivateChatSuggestions(data.people || []);
  } catch {
    if (seq === privateChatSearchSeq) hidePrivateChatSuggestions();
  }
}
$('#privateChatTag').addEventListener('input', e => {
  clearTimeout(privateChatSearchTimer);
  const query = e.currentTarget.value.trim();
  if (!query) return hidePrivateChatSuggestions();
  privateChatSearchTimer = setTimeout(() => runPrivateChatSearch(query), 100);
});
$('#privateChatTag').addEventListener('focus', e => {
  const query = e.currentTarget.value.trim();
  if (query) runPrivateChatSearch(query);
});
$('#privateChatTag').addEventListener('blur', () => setTimeout(hidePrivateChatSuggestions, 180));
$('#privateChatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const value = $('#privateChatTag').value.trim();
  if (value) await startPrivateChat(value);
});
$('#chatPhotoInput').addEventListener('change', () => {
  const file = $('#chatPhotoInput').files?.[0] || null;
  if (!file) { clearPendingChatImage(); return; }
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
    showToast('Chat attachments can only be image files.');
    $('#chatPhotoInput').value = '';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast('Chat photos must be 8 MB or smaller.');
    $('#chatPhotoInput').value = '';
    return;
  }
  clearPendingChatImage();
  pendingChatFile = file;
  pendingChatPreviewUrl = URL.createObjectURL(file);
  renderPendingChatImage();
});
$('#chatComposer').addEventListener('submit', async e => {
  e.preventDefault();
  if (!activeChatId) return;
  const text = $('#chatText').value.trim();
  if (!text && !pendingChatFile) {
    showToast('Write a message or attach a photo.');
    return;
  }
  const sendBtn = $('#chatSendBtn');
  sendBtn.disabled = true;
  try {
    let image = '';
    if (pendingChatFile) {
      const uploaded = await uploadImage(pendingChatFile);
      image = uploaded.src || '';
    }
    await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages`, {
      method:'POST',
      body:JSON.stringify({ text, image })
    });
    $('#chatText').value = '';
    clearPendingChatImage();
    await loadChatMessages(activeChatId);
    await loadChats();
  } catch (err) {
    showToast(err.message || 'Could not send that message.');
  } finally {
    sendBtn.disabled = false;
    $('#chatText').focus({ preventScroll:true });
  }
});
$('#chatText').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  if (!window.matchMedia('(min-width: 801px)').matches) return;
  e.preventDefault();
  $('#chatComposer').requestSubmit();
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
wireMentionAutocomplete($('#profileBio'));
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
function isTypingFieldFocused() {
  const active = document.activeElement;
  return Boolean(active && active.matches?.('input,textarea,[contenteditable="true"]'));
}
window.addEventListener('resize', () => {
  if (currentMode === 'book' && !isTypingFieldFocused()) renderBook();
  if (currentMode === 'connections' && activeScrapbook?.type === 'group' && !isTypingFieldFocused()) renderConnections();
});

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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !journalApp.classList.contains('hidden')) {
    connectLiveEvents();
    refreshNotificationCount();
  }
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


window.addEventListener('resize', syncMobileChatViewport);
window.addEventListener('orientationchange', () => setTimeout(syncMobileChatViewport, 120));
