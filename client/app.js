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
let pendingChatFiles = [];
let pendingChatPreviewUrls = [];
let chatImageViewerSrc = '';
let pendingChatReply = null;
let chatReactionPicker = null;
let chatThreadActionMenu = null;
let commentReactionPicker = null;
let pendingChatAudioFile = null;
let pendingChatAudioUrl = '';
let chatMediaRecorder = null;
let chatMediaStream = null;
let chatAudioChunks = [];
let chatRecordingStartedAt = 0;
let chatRecordingMode = '';
let chatRecordingDisposition = 'preview';
let chatMicHoldTimer = null;
let chatMicHoldActive = false;
let chatMicPointerId = null;
let chatMicStartX = 0;
let chatMicCancelled = false;
let chatRecordTicker = null;
let chatAudioContext = null;
let chatAudioAnalyser = null;
let chatAudioAnimationFrame = null;
let reactionViewer = null;
let viewedPersonData = null;
let ownerOverrideTargetTag = null;
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

const PHONE_UI_QUERY = '(max-width: 800px)';
let mobileBookContextTag = null;
let mobileHomeSearchTimer = null;
let mobileHomeSearchSeq = 0;
let mobilePrivateChatSearchTimer = null;
let mobilePrivateChatSearchSeq = 0;
let mobileInviteSearchTimer = null;
let mobileInviteSearchSeq = 0;
let phoneHistoryReady = false;
let restoringPhoneHistory = false;
let phoneHistoryRestoreToken = 0;

function isPhoneUI() {
  return window.matchMedia(PHONE_UI_QUERY).matches;
}

const NATIVE_PERMISSION_KEY = 'scrapella-native-permissions-v3';
const NATIVE_THEME_KEY = 'scrapella-native-theme-v1';
const nativePluginCache = {};

function isNativeScrapellaApp() {
  const cap = window.Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
    const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    return platform === 'ios' || platform === 'android';
  } catch {
    return false;
  }
}
function nativePlatform() {
  try { return window.Capacitor?.getPlatform?.() || 'web'; }
  catch { return 'web'; }
}
function nativePlugin(name) {
  if (!isNativeScrapellaApp()) return null;
  const cap = window.Capacitor;
  if (cap?.Plugins?.[name]) return cap.Plugins[name];
  if (typeof cap?.registerPlugin === 'function') {
    nativePluginCache[name] ||= cap.registerPlugin(name);
    return nativePluginCache[name];
  }
  return null;
}
function storedNativeAppearanceMode() {
  try { return normalizeAppearanceMode(localStorage.getItem(NATIVE_THEME_KEY) || 'light'); }
  catch { return 'light'; }
}
function rememberNativeAppearanceMode(mode) {
  try { localStorage.setItem(NATIVE_THEME_KEY, normalizeAppearanceMode(mode)); } catch {}
}
function permissionTimeout(promise, ms = 9000) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>window.setTimeout(()=>reject(new Error('Permission request timed out.')),ms))
  ]);
}
function setNativePermissionState(kind, state, label) {
  const row = document.querySelector(`[data-native-permission="${kind}"]`);
  if (!row) return;
  row.classList.remove('granted','denied','working');
  if (state) row.classList.add(state);
  const status = row.querySelector('b');
  if (status) status.textContent = label || (state === 'granted' ? 'Allowed' : state === 'denied' ? 'Not allowed' : state === 'working' ? 'Waiting…' : 'Ready');
}
function closeNativePermissionGate(mark = 'done') {
  const gate = $('#nativePermissionGate');
  if (!gate) return;
  try { localStorage.setItem(NATIVE_PERMISSION_KEY, mark); } catch {}
  gate.classList.add('hidden');
  document.body.classList.remove('native-permission-open');
}
async function maybeShowNativePermissionGate() {
  if (!isNativeScrapellaApp()) return;
  try {
    if (localStorage.getItem(NATIVE_PERMISSION_KEY)) return;
  } catch {}
  const gate = $('#nativePermissionGate');
  if (!gate) return;

  gate.classList.remove('hidden');
  document.body.classList.add('native-permission-open');
  setNativePermissionState('notifications','','Ready');
  setNativePermissionState('camera','','Ready');

  const platform = nativePlatform();
  if (platform === 'android') {
    // Android's modern system Photo Picker does not require broad gallery permission.
    setNativePermissionState('photos','granted','System picker');
  } else {
    setNativePermissionState('photos','','Ready');
  }

  const push = nativePlugin('PushNotifications');
  const camera = nativePlugin('Camera');
  try {
    if (push?.checkPermissions) {
      const status = await permissionTimeout(push.checkPermissions(),3500);
      if (status?.receive === 'granted') setNativePermissionState('notifications','granted','Allowed');
      else if (status?.receive === 'denied') setNativePermissionState('notifications','denied','Not allowed');
    }
  } catch {}
  try {
    if (camera?.checkPermissions) {
      const status = await permissionTimeout(camera.checkPermissions(),3500);
      if (status?.camera === 'granted') setNativePermissionState('camera','granted','Allowed');
      else if (status?.camera === 'denied') setNativePermissionState('camera','denied','Not allowed');
      if (platform === 'ios') {
        if (status?.photos === 'granted' || status?.photos === 'limited') {
          setNativePermissionState('photos','granted',status.photos === 'limited' ? 'Selected' : 'Allowed');
        } else if (status?.photos === 'denied') {
          setNativePermissionState('photos','denied','Not allowed');
        }
      }
    }
  } catch {}
}
async function requestScrapellaNativePermissions() {
  if (!isNativeScrapellaApp()) return closeNativePermissionGate('web');
  const button = $('#nativePermissionsContinue');
  const statusText = $('#nativePermissionStatus');
  if (button) button.disabled = true;

  const push = nativePlugin('PushNotifications');
  const camera = nativePlugin('Camera');
  const platform = nativePlatform();

  try {
    setNativePermissionState('notifications','working','Waiting…');
    let result = push?.checkPermissions ? await permissionTimeout(push.checkPermissions()) : null;
    if (push?.requestPermissions && (!result || result.receive === 'prompt' || result.receive === 'prompt-with-rationale')) {
      result = await permissionTimeout(push.requestPermissions());
    }
    const allowed = result?.receive === 'granted';
    setNativePermissionState('notifications',allowed ? 'granted' : 'denied',allowed ? 'Allowed' : 'Not allowed');
  } catch {
    setNativePermissionState('notifications','denied','Skipped');
  }

  try {
    setNativePermissionState('camera','working','Waiting…');
    let result = camera?.checkPermissions ? await permissionTimeout(camera.checkPermissions()) : null;
    if (camera?.requestPermissions && result?.camera !== 'granted') {
      result = await permissionTimeout(camera.requestPermissions({ permissions:['camera'] }));
    }
    const allowed = result?.camera === 'granted';
    setNativePermissionState('camera',allowed ? 'granted' : 'denied',allowed ? 'Allowed' : 'Not allowed');
  } catch {
    setNativePermissionState('camera','denied','Skipped');
  }

  if (platform === 'android') {
    setNativePermissionState('photos','granted','System picker');
  } else {
    try {
      setNativePermissionState('photos','working','Waiting…');
      let result = camera?.checkPermissions ? await permissionTimeout(camera.checkPermissions()) : null;
      if (camera?.requestPermissions && result?.photos !== 'granted' && result?.photos !== 'limited') {
        result = await permissionTimeout(camera.requestPermissions({ permissions:['photos'] }));
      }
      const allowed = result?.photos === 'granted' || result?.photos === 'limited';
      setNativePermissionState('photos',allowed ? 'granted' : 'denied',result?.photos === 'limited' ? 'Selected' : allowed ? 'Allowed' : 'Not allowed');
    } catch {
      setNativePermissionState('photos','denied','Skipped');
    }
  }

  if (statusText) statusText.textContent = 'Setup complete. You can change permissions later in phone settings.';
  try { localStorage.setItem(NATIVE_PERMISSION_KEY, 'done'); } catch {}
  window.setTimeout(() => closeNativePermissionGate('done'), 550);
  if (button) button.disabled = false;
}
$('#nativePermissionsContinue')?.addEventListener('click', requestScrapellaNativePermissions);
$('#nativePermissionsSkip')?.addEventListener('click', () => closeNativePermissionGate('skipped'));

if (isNativeScrapellaApp()) {
  document.documentElement.classList.add('native-app');
  applyAppearanceMode(storedNativeAppearanceMode());
}

function runScrapellaBrandIntro() {
  const intro = $('#brandIntro');
  const finish = () => {
    document.body.classList.remove('brand-intro-active');
    window.setTimeout(maybeShowNativePermissionGate, 80);
  };
  if (!intro) {
    finish();
    return;
  }
  if (!isPhoneUI()) {
    intro.remove();
    finish();
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hold = reduced ? 550 : 1740;
  window.setTimeout(() => {
    intro.classList.add('brand-intro-finish');
    window.setTimeout(() => {
      intro.remove();
      finish();
    }, reduced ? 80 : 260);
  }, hold);
}
runScrapellaBrandIntro();

function phoneHistorySnapshot(mode = currentMode, overrides = {}) {
  return {
    journalPhone:true,
    mode:String(overrides.mode || mode || 'home'),
    bookId:overrides.bookId !== undefined ? overrides.bookId : (activeScrapbook?.id || null),
    chatId:overrides.chatId !== undefined ? overrides.chatId : ((mode === 'messages' && activeChatId) ? activeChatId : null),
    personTag:overrides.personTag !== undefined ? overrides.personTag : ((mode === 'person' && viewedPersonData?.profile?.tag) ? viewedPersonData.profile.tag : null),
    contextTag:overrides.contextTag !== undefined ? overrides.contextTag : (mobileBookContextTag || me?.tag || null)
  };
}
function phoneHistoryKey(state) {
  if (!state || state.journalPhone !== true) return '';
  return [state.mode||'',state.bookId||'',state.chatId||'',state.personTag||'',state.contextTag||''].join('|');
}
function recordPhoneHistory(mode = currentMode, overrides = {}) {
  if (!isPhoneUI() || !me || !phoneHistoryReady || restoringPhoneHistory) return;
  const state = phoneHistorySnapshot(mode,overrides);
  if (phoneHistoryKey(history.state) === phoneHistoryKey(state)) return;
  history.pushState(state,'',location.href);
}
function initializePhoneHistory() {
  if (!isPhoneUI() || !me) return;
  const homeState = phoneHistorySnapshot('home',{ chatId:null, personTag:null, contextTag:me.tag });
  history.replaceState({ journalPhoneRoot:true },'',location.href);
  history.pushState(homeState,'',location.href);
  phoneHistoryReady = true;
}
function closePhoneTransientLayer() {
  if (!isPhoneUI()) return false;
  if (editorDialog?.open) { closeEditor(); return true; }
  if (scrapbookDialog?.open) { scrapbookDialog.close(); return true; }
  if (profileDialog?.open) { profileDialog.close(); return true; }
  const membersDialog = $('#chatMembersDialog');
  if (membersDialog?.open) { membersDialog.close(); return true; }
  if (!$('#notificationPanel')?.classList.contains('hidden')) { closeNotificationHub(); return true; }
  if (!$('#chatImageViewer')?.classList.contains('hidden')) { closeChatImageViewer(); return true; }
  if (!$('#profileImageViewer')?.classList.contains('hidden')) { closeProfileImageViewer(); return true; }
  if (reactionViewer) { closeReactionViewer(); return true; }
  if (chatThreadActionMenu) { closeChatThreadActionMenu(); return true; }
  if (chatReactionPicker) { closeChatReactionPicker(); return true; }
  if (commentReactionPicker) { closeCommentReactionPicker(); return true; }
  if (guideRunning && !guideMandatory) { finishGuide({ completed:false }); return true; }
  return false;
}
function clearOpenPhoneChatState() {
  messagesView?.classList.remove('chat-open');
  messagesView?.style.removeProperty('--mobile-chat-top');
  activeChatId = null;
  activeChatMessages = [];
  clearPendingChatImage();
  clearPendingChatReply();
  closeChatReactionPicker();
  if ($('#chatText')) $('#chatText').value = '';
  $('#activeChat')?.classList.add('hidden');
  $('#chatEmptyState')?.classList.remove('hidden');
}
async function restorePhoneHistoryState(state) {
  if (!isPhoneUI() || !me || restoringPhoneHistory) return;
  const token = ++phoneHistoryRestoreToken;
  restoringPhoneHistory = true;
  try {
    const mode = ['home','cover','book','stream','connections','messages','person'].includes(state?.mode) ? state.mode : 'home';
    const targetBookId = state?.bookId || null;
    if (targetBookId && activeScrapbook?.id !== targetBookId) {
      await loadSession(targetBookId);
      if (token !== phoneHistoryRestoreToken) return;
    }
    mobileBookContextTag = state?.contextTag || me.tag;

    if (mode === 'person' && state?.personTag) {
      clearOpenPhoneChatState();
      await openPersonProfile(state.personTag,{ preserveReturn:true });
      return;
    }

    if (mode === 'messages') {
      showView('messages');
      await loadChats();
      if (token !== phoneHistoryRestoreToken) return;
      if (state?.chatId && chats.some(chat => chat.id === state.chatId)) {
        await openChat(state.chatId);
      } else {
        clearOpenPhoneChatState();
        renderChatList();
      }
      return;
    }

    clearOpenPhoneChatState();
    if (mode === 'book') setBookCoverOpen(Boolean(activeScrapbook));
    if (mode === 'cover') setBookCoverOpen(false);
    renderScrapbookPicker();
    renderMobileBookShelf();
    showView(mode);
  } catch (err) {
    if (err?.status === 401) {
      location.reload();
      return;
    }
    clearOpenPhoneChatState();
    showView('home');
    showToast(err?.message || 'Could not return to that screen.');
  } finally {
    if (token === phoneHistoryRestoreToken) restoringPhoneHistory = false;
  }
}
function phoneBackButton(fallback) {
  if (isPhoneUI() && me && phoneHistoryReady && history.state?.journalPhone) {
    history.back();
    return;
  }
  fallback?.();
}

function compactPhoneCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (!isPhoneUI()) return String(count);
  if (count >= 1000) return `${Math.floor(count / 1000)}k+`;
  if (count > 100) return '99+';
  return String(count);
}
function uniqueBooks(list = []) {
  const seen = new Set();
  return list.filter(book => {
    if (!book?.id || seen.has(book.id)) return false;
    seen.add(book.id);
    return true;
  });
}
function mobileBookOptions() {
  if (!me) return [];
  const contextTag = mobileBookContextTag || me.tag;
  if (contextTag === me.tag) {
    return uniqueBooks(scrapbooks.filter(book =>
      book.owner === me.tag ||
      (book.type !== 'personal' && Array.isArray(book.members) && book.members.includes(me.tag))
    ));
  }

  // Merge profile data with the current session's accessible books.
  // Previously the profile response replaced the session list, so a stale
  // profile payload could make some accessible scrapbooks vanish from the
  // Book dropdown even though the user could still open them elsewhere.
  const fromProfile = viewedPersonData?.profile?.tag === contextTag
    ? (Array.isArray(viewedPersonData.personalScrapbooks)
        ? viewedPersonData.personalScrapbooks
        : (viewedPersonData.personalScrapbook?.accessible ? [viewedPersonData.personalScrapbook] : []))
    : [];
  const fromSession = scrapbooks.filter(book =>
    book.type === 'personal' && book.owner === contextTag
  );
  const sharedGroups = scrapbooks.filter(book =>
    book.type !== 'personal' &&
    Array.isArray(book.members) &&
    book.members.includes(me.tag) &&
    book.members.includes(contextTag)
  );
  return uniqueBooks([...fromProfile, ...fromSession, ...sharedGroups]);
}
function mobileContextProfile() {
  const tag = mobileBookContextTag || me?.tag;
  if (!tag) return null;
  if (tag === me?.tag) return me;
  if (viewedPersonData?.profile?.tag === tag) return viewedPersonData.profile;
  const pools = [
    ...(following || []),
    ...(followers || []),
    ...((homeData.followingShelf || []).map(item => item.profile)),
    ...((activeScrapbook?.profiles || []))
  ];
  return pools.find(person => person?.tag === tag) || { tag, displayName:tag };
}
function renderMobileBookShelf() {
  const shelf = $('#mobileBookShelf');
  if (!shelf) return;
  shelf.classList.toggle('hidden', !isPhoneUI());
  if (!isPhoneUI()) return;
  if (!mobileBookContextTag && me?.tag) mobileBookContextTag = me.tag;
  const profile = mobileContextProfile() || me || {};
  const other = Boolean(profile.tag && me?.tag && profile.tag !== me.tag);
  $('#mobileBookBackBtn')?.classList.toggle('hidden', !other);
  const context = $('#mobileBookContext');
  if (context) {
    context.innerHTML = `
      <div class="mobile-book-context-copy">
        <p class="eyebrow">${other ? 'VIEWING PROFILE' : 'YOUR SCRAPBOOK CIRCLE'}</p>
        <div class="mobile-book-context-person">
          ${avatarHtml(profile,'mobile-book-context-avatar')}
          <span><strong>${escapeHtml(other ? (profile.displayName || profile.tag) : 'My scrapbooks')}</strong><small>${other ? '@' + escapeHtml(profile.tag || '') : 'Personal, Lovers, and Groups you belong to'}</small></span>
        </div>
      </div>`;
  }
  const canWrite = Boolean(activeScrapbook && activeScrapbook.canWrite !== false);
  const canDeleteBook = Boolean(activeScrapbook && !other && (activeScrapbook.isOwner === true || (activeScrapbook.type === 'group' && activeScrapbook.isGroupAdmin === true)));
  const canLeaveGroup = Boolean(activeScrapbook && !other && activeScrapbook.type === 'group' && activeScrapbook.isOwner !== true);
  $('#mobileNewMemoryBtn')?.classList.toggle('hidden', !canWrite);
  if ($('#mobileStreamBtn')) $('#mobileStreamBtn').disabled = !activeScrapbook;
  const deleteBtn = $('#mobileDeleteScrapbookBtn');
  deleteBtn?.classList.toggle('hidden', !canDeleteBook);
  if (deleteBtn && canDeleteBook) {
    const waiting = activeScrapbook.type === 'group' && activeScrapbook.isOwner !== true && Boolean(activeScrapbook.deleteRequest);
    deleteBtn.textContent = waiting ? 'Deletion request pending' : (activeScrapbook.isOwner === true ? 'Delete scrapbook' : 'Request group deletion');
    deleteBtn.disabled = waiting;
  } else if (deleteBtn) {
    deleteBtn.disabled = false;
  }
  $('#mobileLeaveScrapbookBtn')?.classList.toggle('hidden', !canLeaveGroup);
}
async function prepareMobileBookView() {
  if (!isPhoneUI()) {
    if (!activeScrapbook) { await refreshAndShow('connections', null); return; }
    await refreshAndShow('book');
    return;
  }
  if (!mobileBookContextTag && me?.tag) mobileBookContextTag = me.tag;
  const options = mobileBookOptions();
  const target = options.find(book => book.id === activeScrapbook?.id) || options[0] || null;
  if (target && target.id !== activeScrapbook?.id) {
    await loadSession(target.id);
    activeScrapbook = scrapbooks.find(book => book.id === target.id) || target;
    localStorage.setItem('activeScrapbookId', target.id);
  }
  renderScrapbookPicker();
  renderMobileBookShelf();
  if (!activeScrapbook) {
    showView('book');
    return;
  }
  setBookCoverOpen(true);
  showView('book');
}


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
    btn.innerHTML = isPhoneUI()
      ? `<span aria-hidden="true">${night ? '☀' : '☾'}</span><b>${night ? 'Light mode' : 'Dark mode'}</b>`
      : `<span aria-hidden="true">${night ? '☀' : '☾'}</span>`;
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
function formatBondDate(value) {
  const d = new Date(value || '');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric' }).format(d);
}
function bondDurationText(startValue, endValue = null) {
  const start = new Date(startValue || '');
  const end = endValue ? new Date(endValue) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '';
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  months = Math.max(0, months);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remain = months % 12;
    return remain ? `${years}y ${remain}mo bonded` : `${years} year${years === 1 ? '' : 's'} bonded`;
  }
  if (months >= 1) return `${months} month${months === 1 ? '' : 's'} bonded`;
  const days = Math.max(0, Math.floor((end - start) / 86400000));
  return `${days} day${days === 1 ? '' : 's'} bonded`;
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
function connectedMentionPeople(query = '', input = null) {
  const q = String(query || '').toLowerCase();
  const chat = input?.id === 'chatText' ? activeChat() : null;
  const pool = chat?.type === 'group'
    ? (Array.isArray(chat.members) ? chat.members : [])
    : [
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
  const groupChatMention = input?.id === 'chatText' && activeChat()?.type === 'group';
  let people = connectedMentionPeople(context.query,input);
  if (!groupChatMention) {
    try {
      const data = await api(`/api/people?q=${encodeURIComponent(context.query)}`);
      if (seq !== mentionSuggestSeq || document.activeElement !== input) return;
      const merged = new Map();
      [...people, ...(data.people || [])].forEach(person => {
        if (person?.tag && person.tag !== me?.tag) merged.set(person.tag, person);
      });
      people = [...merged.values()].slice(0,8);
    } catch {}
  }
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
  return ['serif','classic','elegant','sans','rounded','casual','hand','script','mono'].includes(font) ? `canvas-font-${font}` : 'canvas-font-serif';
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
    const align=['left','center','right','justify'].includes(item.align)?item.align:'left';
    return `<div class="saved-canvas-item saved-text-item ${fontClass}" style="${canvasItemStyle(item)};--canvas-text-size:${size}px;--canvas-text-cqw:${sizeCqw}cqw;--saved-text-top:${topCqw}cqw;--saved-text-pad-y:${padYCqw}cqw;--saved-text-pad-x:${padXCqw}cqw;text-align:${align};${weight}${style}"><div class="saved-text-content" style="text-align:${align}">${String(item.html || '')}</div></div>`;
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
  return Boolean(activeScrapbook && ['personal','group','couple'].includes(activeScrapbook.type) && activeScrapbook.canComment !== false);
}
function commentReactions(comment) {
  const raw = comment?.reactions && typeof comment.reactions === 'object' ? comment.reactions : {};
  return Object.entries(raw).map(([emoji,tags]) => {
    const people = Array.isArray(tags) ? [...new Set(tags.filter(Boolean))] : [];
    return {
      emoji,
      count:people.length,
      reactedByMe:Boolean(me?.tag && people.includes(me.tag)),
      people:people.map(tag => authorProfiles[tag] || { tag, displayName:tag, avatar:'' })
    };
  }).filter(item => item.count > 0);
}
function commentReactionHtml(entryId, comment) {
  const reactions = commentReactions(comment);
  const readOnly = !commentsEnabledForActiveBook();
  return reactions.length
    ? `<div class="comment-reaction-summary">${reactions.map(item=>`<button type="button" class="comment-reaction-chip ${item.reactedByMe?'mine':''}" data-entry-id="${escapeHtml(entryId)}" data-comment-id="${escapeHtml(comment.id)}" data-emoji="${escapeHtml(item.emoji)}"${readOnly ? ' disabled aria-disabled="true"' : ''}><span>${escapeHtml(item.emoji)}</span><b>${item.count}</b></button>`).join('')}</div>`
    : '';
}
function commentNodeHtml(entry, comment, childrenMap, depth = 0) {
  const p = commentProfile(comment);
  const canDelete = me && (comment.author === me.tag || activeScrapbook.owner === me.tag);
  const children = childrenMap.get(comment.id) || [];
  return `<div class="comment-thread ${depth ? 'comment-reply-thread' : ''}">
    <article class="memory-comment" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id || '')}">
      <button class="comment-author" type="button" data-profile-tag="${escapeHtml(p.tag || comment.author || '')}">${avatarHtml(p,'comment-avatar')}<span><strong>${escapeHtml(p.displayName || p.tag)}</strong><small>@${escapeHtml(p.tag || comment.author || '')} · ${escapeHtml(notificationWhen(comment.createdAt))}</small></span></button>
      <div class="comment-main" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id)}"><p>${mentionTextHtml(comment.text || '')}</p></div>
      <div class="comment-actions">
        ${commentsEnabledForActiveBook() ? `<button class="comment-reply-trigger" type="button" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id)}">Reply</button>${isPhoneUI() ? '' : `<button class="comment-react-trigger" type="button" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id)}">React</button>`}` : ''}
        ${commentReactionHtml(entry.id,comment)}
      </div>
      ${commentsEnabledForActiveBook() ? `<form class="comment-reply-form hidden" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id)}">
        <textarea maxlength="600" rows="2" placeholder="Write a reply… Tag someone with @tag"></textarea>
        <div><button class="ghost comment-reply-cancel" type="button">Cancel</button><button class="primary" type="submit">Reply</button></div>
      </form>` : ''}
      ${canDelete ? `<button class="comment-delete" type="button" data-entry-id="${escapeHtml(entry.id)}" data-comment-id="${escapeHtml(comment.id)}" aria-label="Delete comment">×</button>` : ''}
    </article>
    ${children.length ? `<div class="comment-replies">${children.map(child=>commentNodeHtml(entry,child,childrenMap,depth+1)).join('')}</div>` : ''}
  </div>`;
}
function commentsHtml(entry) {
  if (!activeScrapbook || !['personal','group','couple'].includes(activeScrapbook.type)) return '';
  const comments = Array.isArray(entry.comments) ? entry.comments : [];
  const childrenMap = new Map();
  comments.forEach(comment => {
    if (!comment.parentId) return;
    const list = childrenMap.get(comment.parentId) || [];
    list.push(comment);
    childrenMap.set(comment.parentId,list);
  });
  const roots = comments.filter(comment => !comment.parentId || !comments.some(item => item.id === comment.parentId));
  const list = roots.length ? roots.map(comment => commentNodeHtml(entry,comment,childrenMap,0)).join('') : '<p class="comments-empty">No comments yet. Leave the first little note.</p>';
  const composer = commentsEnabledForActiveBook()
    ? `<form class="comment-form" data-entry-id="${escapeHtml(entry.id)}"><textarea maxlength="600" rows="2" placeholder="Write a comment… Tag someone with @tag"></textarea><button class="primary" type="submit">Post</button></form>`
    : '';
  return `<section class="memory-comments"><div class="comments-head"><strong>Comments</strong><span>${comments.length}</span></div><div class="comments-list">${list}</div>${composer}</section>`;
}
function closeCommentReactionPicker() {
  if (commentReactionPicker) {
    commentReactionPicker.remove();
    commentReactionPicker = null;
  }
}
async function toggleCommentReaction(entryId,commentId,emoji='👍') {
  try {
    await api(`/api/entries/${encodeURIComponent(entryId)}/comments/${encodeURIComponent(commentId)}/reactions`,{
      method:'POST',
      body:JSON.stringify({emoji})
    });
    await refreshEntries();
  } catch (err) {
    showToast(err.message || 'Could not react to that comment.');
  }
}
function showCommentReactionPicker(entryId,commentId,anchor) {
  if (!anchor) return;
  closeCommentReactionPicker();
  const picker=document.createElement('div');
  picker.className='comment-reaction-picker';
  picker.innerHTML=['👍','❤️','😂','😮','😢','😡'].map(emoji=>`<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('');
  document.body.appendChild(picker);
  commentReactionPicker=picker;
  const rect=anchor.getBoundingClientRect();
  const width=Math.min(330,window.innerWidth-16);
  picker.style.width=`${width}px`;
  picker.style.left=`${Math.max(8,Math.min(window.innerWidth-width-8,rect.left+(rect.width-width)/2))}px`;
  requestAnimationFrame(()=>{
    const h=picker.offsetHeight||52;
    picker.style.top=`${rect.top-h-8>=8?rect.top-h-8:Math.min(window.innerHeight-h-8,rect.bottom+8)}px`;
  });
  picker.querySelectorAll('button').forEach(button=>button.addEventListener('pointerdown',async e=>{
    e.preventDefault();
    e.stopPropagation();
    const emoji=button.dataset.emoji;
    closeCommentReactionPicker();
    await toggleCommentReaction(entryId,commentId,emoji);
  }));
}
function wireCommentGestures(root) {
  if (!commentsEnabledForActiveBook()) return;
  root.querySelectorAll('.comment-react-trigger').forEach(button=>button.addEventListener('click',e=>{
    e.preventDefault();
    const article=button.closest('.memory-comment');
    const main=article?.querySelector('.comment-main');
    if(main)showCommentReactionPicker(button.dataset.entryId,button.dataset.commentId,main);
  }));
  root.querySelectorAll('.comment-main').forEach(main=>{
    if(!isPhoneUI()){
      main.addEventListener('contextmenu',e=>{
        e.preventDefault();
        showCommentReactionPicker(main.dataset.entryId,main.dataset.commentId,main);
      });
      main.addEventListener('dblclick',e=>{
        e.preventDefault();
        toggleCommentReaction(main.dataset.entryId,main.dataset.commentId,'👍');
      });
      return;
    }
    let lastTap=0,hold=null,startX=0,startY=0,cancelled=false,longPressed=false;
    main.addEventListener('pointerdown',e=>{
      if(!isPhoneUI()||e.pointerType==='mouse')return;
      startX=e.clientX;startY=e.clientY;cancelled=false;longPressed=false;
      hold=setTimeout(()=>{
        if(cancelled)return;
        longPressed=true;
        showCommentReactionPicker(main.dataset.entryId,main.dataset.commentId,main);
      },360);
    });
    main.addEventListener('pointermove',e=>{
      if(Math.hypot(e.clientX-startX,e.clientY-startY)>16){
        cancelled=true;clearTimeout(hold);
      }
    });
    main.addEventListener('pointerup',()=>{
      clearTimeout(hold);
      if(longPressed||cancelled)return;
      const now=Date.now();
      if(now-lastTap<390){
        lastTap=0;
        toggleCommentReaction(main.dataset.entryId,main.dataset.commentId,'👍');
      } else lastTap=now;
    });
    main.addEventListener('pointercancel',()=>{cancelled=true;clearTimeout(hold);});
    main.addEventListener('contextmenu',e=>{if(isPhoneUI())e.preventDefault();});
  });
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

function positionMobilePageArrows() {
  if (!isPhoneUI() || currentMode !== 'book') return;
  const shell = bookShell;
  const target =
    rightPage.querySelector('.saved-canvas') ||
    rightPage.querySelector('.journal-flow') ||
    rightPage.querySelector('.entry-body');
  if (!shell || !target) {
    shell?.style.removeProperty('--mobile-page-arrow-top');
    return;
  }
  const shellRect = shell.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = Math.max(24, targetRect.top - shellRect.top + (targetRect.height / 2));
  shell.style.setProperty('--mobile-page-arrow-top', `${top}px`);
}
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
  if ($('#mobilePrevBtn')) $('#mobilePrevBtn').disabled = spreadIndex <= 0;
  if ($('#mobileNextBtn')) $('#mobileNextBtn').disabled = spreadIndex + step >= ordered.length;
  wireEntryButtons(bookShell);
  if (mobile) requestAnimationFrame(() => requestAnimationFrame(positionMobilePageArrows));
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
  root.querySelectorAll('.saved-photo-frame img,.memory-photo img').forEach(img => {
    if (img.dataset.scrapbookZoomWired === '1') return;
    img.dataset.scrapbookZoomWired = '1';
    img.setAttribute('role','button');
    img.setAttribute('tabindex','0');
    img.setAttribute('aria-label','Open scrapbook photo');
    const open = e => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openChatImageViewer(img.currentSrc || img.src);
    };
    img.addEventListener('click', open);
    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });
  });
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
  root.querySelectorAll('.comment-reply-trigger').forEach(button=>button.addEventListener('click',()=>{
    const article=button.closest('.memory-comment');
    const form=article?.querySelector('.comment-reply-form');
    if(!form)return;
    root.querySelectorAll('.comment-reply-form:not(.hidden)').forEach(other=>{if(other!==form)other.classList.add('hidden');});
    form.classList.toggle('hidden');
    if(!form.classList.contains('hidden')) form.querySelector('textarea')?.focus({preventScroll:true});
  }));
  root.querySelectorAll('.comment-reply-cancel').forEach(button=>button.addEventListener('click',()=>{
    button.closest('.comment-reply-form')?.classList.add('hidden');
  }));
  root.querySelectorAll('.comment-reply-form').forEach(form=>{
    wireMentionAutocomplete(form.querySelector('textarea'));
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const input=form.querySelector('textarea');
      const text=input?.value.trim()||'';
      if(!text)return;
      const submit=form.querySelector('button[type="submit"]');
      submit.disabled=true;
      try{
        await api(`/api/entries/${encodeURIComponent(form.dataset.entryId)}/comments`,{
          method:'POST',
          body:JSON.stringify({text,parentId:form.dataset.commentId})
        });
        await refreshEntries();
        showToast('Reply posted.');
      }catch(err){
        showToast(err.message||'Could not post that reply.');
        submit.disabled=false;
      }
    });
  });
  root.querySelectorAll('.comment-reaction-chip').forEach(button=>button.addEventListener('click',e=>{
    e.stopPropagation();
    const entry=entries.find(item=>item.id===button.dataset.entryId);
    const comment=(entry?.comments || []).find(item=>item.id===button.dataset.commentId);
    if(comment) openReactionViewer('Comment reactions',commentReactions(comment),{
      onSelfReaction:emoji=>toggleCommentReaction(button.dataset.entryId,button.dataset.commentId,emoji)
    });
  }));
  wireCommentGestures(root);
  root.querySelectorAll('.comment-delete').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this comment? Its replies will also be removed. This cannot be undone.')) return;
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
  if (!picker) return;
  const phone = isPhoneUI();
  const source = phone ? mobileBookOptions() : scrapbooks;
  const desired = source.map(book => {
    const icon = book.type === 'couple' ? '♡' : book.type === 'personal' ? '✎' : '◌';
    const ownerNote = !phone && book.type === 'personal' && book.owner !== me?.tag ? ` · @${book.owner}` : '';
    return { value:String(book.id), label:`${icon} ${book.name}${ownerNote}` };
  });
  const desiredSignature = JSON.stringify(desired);
  const currentSignature = picker.dataset.optionsSignature || '';

  // Do not rebuild the native select on every phone viewport resize.
  // Android changes the visual viewport while its chooser is opening;
  // replacing <option> nodes at that moment immediately closes the chooser.
  if (currentSignature !== desiredSignature) {
    picker.replaceChildren(...(
      desired.length
        ? desired.map(item => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            return option;
          })
        : [Object.assign(document.createElement('option'), { value:'', textContent:'No scrapbook yet' })]
    ));
    picker.dataset.optionsSignature = desiredSignature;
  }

  const selectedId = activeScrapbook?.id ? String(activeScrapbook.id) : '';
  if (picker.value !== selectedId && document.activeElement !== picker) {
    picker.value = selectedId;
  }
  picker.disabled = !source.length;
  renderMobileBookShelf();
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
  $('#brandTitle').textContent = isPhoneUI() ? activeBookLabel() : 'Scrapella';
  if ($('#desktopBookTitle')) $('#desktopBookTitle').textContent = activeBookLabel();
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
async function openNotificationMemory(scrapbookId,entryId) {
  if(!scrapbookId||!entryId)return;
  closeNotificationHub();
  try{
    await loadSession(scrapbookId);
    if(!activeScrapbook||activeScrapbook.id!==scrapbookId){
      showToast('That scrapbook is no longer shared with you.');
      return;
    }
    showView('stream');
    requestAnimationFrame(()=>{
      document.querySelector(`#timeline [data-entry-id="${CSS.escape(entryId)}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }catch(err){
    showToast(err.message || 'That memory is no longer available.');
  }
}
async function openNotificationChat(chatId) {
  if(!chatId)return;
  closeNotificationHub();
  try{
    showView('messages');
    await loadChats();
    if(!chats.some(chat=>chat.id===chatId)){
      showToast('That conversation is no longer available.');
      return;
    }
    await openChat(chatId);
  }catch(err){
    showToast(err.message || 'That conversation is no longer available.');
  }
}
async function respondGroupDeleteRequest(scrapbookId,approve) {
  if(!scrapbookId)return;
  if(approve && !confirm('Approve deletion of this Group scrapbook? Its memories, group chat, related notifications, and stored group images will be removed. This cannot be undone.'))return;
  try{
    const currentId=activeScrapbook?.id || null;
    const data=await api(`/api/scrapbooks/${encodeURIComponent(scrapbookId)}/delete-request/respond`,{
      method:'POST',
      body:JSON.stringify({approve})
    });
    if(data.deleted && currentId===scrapbookId){
      localStorage.removeItem('activeScrapbookId');
      await loadSession(null);
    }else{
      await loadSession(currentId===scrapbookId ? scrapbookId : currentId);
    }
    await loadNotificationHub({markRead:false});
    showToast(data.deleted ? 'Group deletion approved.' : 'Group deletion request declined.');
  }catch(err){
    showToast(err.message || 'Could not respond to the group deletion request.');
    await loadNotificationHub({markRead:false}).catch(()=>{});
  }
}
function notificationActivityLabel(item) {
  const labels={
    invite_accepted:'accepted your scrapbook invitation',
    invite_declined:'declined your scrapbook invitation',
    group_delete_declined:'declined your group deletion request',
    group_admin_added:'made you a group admin',
    group_admin_removed:'removed your group admin role',
    group_removed:'removed you from a group scrapbook',
    group_member_left:'left your group scrapbook'
  };
  return labels[item.type] || 'updated your scrapbook circle';
}
function renderNotificationHub() {
  const host = $('#notificationList');
  if (!host) return;
  if (!notificationItems.length) {
    host.innerHTML = '<div class="notification-empty"><span>♡</span><strong>All caught up.</strong><p>New followers, mentions, messages, and scrapbook invitations will appear here.</p></div>';
    return;
  }

  host.innerHTML = notificationItems.map(item => {
    const actor = item.actor || {};

    if (item.type === 'profile_mention') {
      return `<article class="notification-item mention-notification notification-route-profile ${item.unread ? 'unread' : ''}" data-profile-tag="${escapeHtml(actor.tag || '')}">
        <div class="notification-actor">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>tagged you in their profile About</small></span>
        </div>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        ${item.excerpt ? `<p class="notification-mention-excerpt">${mentionTextHtml(item.excerpt)}</p>` : ''}
      </article>`;
    }

    if (item.type === 'chat_mention') {
      return `<article class="notification-item mention-notification notification-route-chat ${item.unread ? 'unread' : ''}" data-chat-id="${escapeHtml(item.chatId || '')}">
        <div class="notification-actor">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>mentioned you in a message</small></span>
        </div>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        ${item.excerpt ? `<p class="notification-mention-excerpt">${mentionTextHtml(item.excerpt)}</p>` : ''}
      </article>`;
    }

    if (item.type === 'comment_mention') {
      return `<article class="notification-item mention-notification notification-route-memory ${item.unread ? 'unread' : ''}" data-scrapbook-id="${escapeHtml(item.scrapbookId || '')}" data-entry-id="${escapeHtml(item.entryId || '')}">
        <div class="notification-actor">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>tagged you in a scrapbook comment</small></span>
        </div>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        ${item.excerpt ? `<p class="notification-mention-excerpt">${mentionTextHtml(item.excerpt)}</p>` : ''}
      </article>`;
    }

    if (item.type === 'comment') {
      return `<article class="notification-item mention-notification notification-route-memory ${item.unread ? 'unread' : ''}" data-scrapbook-id="${escapeHtml(item.scrapbookId || '')}" data-entry-id="${escapeHtml(item.entryId || '')}">
        <div class="notification-actor">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>commented in ${escapeHtml(item.scrapbookName || 'a scrapbook')}</small></span>
        </div>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        ${item.excerpt ? `<p class="notification-mention-excerpt">${mentionTextHtml(item.excerpt)}</p>` : ''}
      </article>`;
    }

    if (item.type === 'group_delete_request') {
      return `<article class="notification-item group-delete-notification ${item.unread ? 'unread' : ''}" data-scrapbook-id="${escapeHtml(item.scrapbookId || '')}">
        <div class="notification-actor">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Group admin')}</strong><small>requested deletion of ${escapeHtml(item.scrapbookName || 'your Group scrapbook')}</small></span>
        </div>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
        <div class="group-delete-notification-actions">
          <button class="ghost group-delete-decline" type="button">Keep group</button>
          <button class="danger group-delete-approve" type="button">Approve deletion</button>
        </div>
      </article>`;
    }

    if (item.type === 'follow') {
      return `<article class="notification-item notification-route-profile ${item.unread ? 'unread' : ''}" data-profile-tag="${escapeHtml(actor.tag || '')}">
        <div class="notification-actor">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>@${escapeHtml(actor.tag || '')} followed you</small></span>
        </div>
        <time>${escapeHtml(notificationWhen(item.createdAt))}</time>
      </article>`;
    }

    if (['invite_accepted','invite_declined','group_delete_declined','group_admin_added','group_admin_removed','group_removed','group_member_left'].includes(item.type)) {
      return `<article class="notification-item ${item.unread ? 'unread' : ''}">
        <button class="notification-actor notification-profile-link" type="button" data-tag="${escapeHtml(actor.tag || '')}">
          ${avatarHtml(actor,'notification-avatar')}
          <span><strong>${escapeHtml(actor.displayName || actor.tag || 'Someone')}</strong><small>${escapeHtml(notificationActivityLabel(item))}${item.scrapbookName ? ` · ${escapeHtml(item.scrapbookName)}` : ''}</small></span>
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

  host.querySelectorAll('.inline-mention[data-profile-tag]').forEach(button=>button.addEventListener('click',async e=>{
    e.stopPropagation();
    const tag=button.dataset.profileTag;
    if(!tag)return;
    closeNotificationHub();
    await openPersonProfile(tag);
  }));

  host.querySelectorAll('.notification-profile-link').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const tag = btn.dataset.tag;
    if (!tag) return;
    closeNotificationHub();
    await openPersonProfile(tag);
  }));

  host.querySelectorAll('.notification-route-profile').forEach(card=>card.addEventListener('click',async e=>{
    if(e.target.closest('.inline-mention,button'))return;
    const tag=card.dataset.profileTag;
    if(!tag)return;
    closeNotificationHub();
    await openPersonProfile(tag);
  }));

  host.querySelectorAll('.notification-route-memory').forEach(card=>card.addEventListener('click',async e=>{
    if(e.target.closest('.inline-mention,button'))return;
    await openNotificationMemory(card.dataset.scrapbookId,card.dataset.entryId);
  }));

  host.querySelectorAll('.notification-route-chat').forEach(card=>card.addEventListener('click',async e=>{
    if(e.target.closest('.inline-mention,button'))return;
    await openNotificationChat(card.dataset.chatId);
  }));

  host.querySelectorAll('.group-delete-approve').forEach(button=>button.addEventListener('click',async e=>{
    e.stopPropagation();
    const card=button.closest('.group-delete-notification');
    await respondGroupDeleteRequest(card?.dataset.scrapbookId,true);
  }));
  host.querySelectorAll('.group-delete-decline').forEach(button=>button.addEventListener('click',async e=>{
    e.stopPropagation();
    const card=button.closest('.group-delete-notification');
    await respondGroupDeleteRequest(card?.dataset.scrapbookId,false);
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
  el.innerHTML = `<button class="follow-stat-button" type="button" data-list="followers"><b>${compactPhoneCount(followers.length)}</b><span>followers</span></button><button class="follow-stat-button" type="button" data-list="following"><b>${compactPhoneCount(following.length)}</b><span>following</span></button>`;
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

function parkDesktopNewMemoryButton() {
  if (isPhoneUI()) return;
  const button = $('#desktopNewMemoryBtn');
  const slot = $('#desktopBookActionSlot');
  if (button && slot && button.parentNode !== slot) slot.appendChild(button);
}
function placeDesktopNewMemoryUnderPrivacy() {
  if (isPhoneUI()) return;
  const button = $('#desktopNewMemoryBtn');
  const slot = $('#personalPrivacyQuick .desktop-privacy-new-memory');
  if (button && slot && button.parentNode !== slot) slot.appendChild(button);
}

function renderPersonalPrivacyQuick() {
  const panel = $('#personalPrivacyQuick');
  if (!isPhoneUI()) parkDesktopNewMemoryButton();
  const wrongDesktopView = !isPhoneUI() && currentMode !== 'book';
  if (!panel || (isPhoneUI() && currentMode !== 'book') || wrongDesktopView || !activeScrapbook || activeScrapbook.type !== 'personal' || activeScrapbook.owner !== me?.tag) {
    panel?.classList.add('hidden');
    if (panel) panel.innerHTML = '';
    return;
  }

  const privacy = activeScrapbook.privacy || 'private';
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="privacy-quick-inner">
    <div class="privacy-quick-main">
      <div class="privacy-quick-copy">
        <strong>Who can read this scrapbook?</strong>
        <span>${escapeHtml(privacyLabel(privacy))}</span>
      </div>
      <div class="privacy-quick-buttons" role="group" aria-label="Personal scrapbook privacy">
        <button type="button" data-privacy="private" class="${privacy === 'private' ? 'active' : ''}">You Only</button>
        <button type="button" data-privacy="followers" class="${privacy === 'followers' ? 'active' : ''}">Followers</button>
        <button type="button" data-privacy="partner" class="${privacy === 'partner' ? 'active' : ''}">Partner</button>
      </div>
    </div>
    ${isPhoneUI() ? '' : '<div class="desktop-privacy-new-memory"></div>'}
  </div>`;

  if (!isPhoneUI()) placeDesktopNewMemoryUnderPrivacy();

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
  connectionsView.classList.remove('mobile-person-only-context');
  const connectionsEyebrow = connectionsView.querySelector('.connections-head .eyebrow');
  if (connectionsEyebrow) connectionsEyebrow.textContent = 'WHO SHARES THIS BOOK';

  const phonePersonOnly = isPhoneUI() &&
    mobileBookContextTag &&
    me?.tag &&
    mobileBookContextTag !== me.tag &&
    mobileBookOptions().length === 0;

  if (phonePersonOnly) {
    const person = mobileContextProfile() || { tag:mobileBookContextTag, displayName:mobileBookContextTag };
    connectionsView.classList.add('mobile-person-only-context');
    connectionsView.classList.remove('mobile-personal-context','mobile-group-context');
    if (connectionsEyebrow) connectionsEyebrow.textContent = 'PROFILE';
    $('#connectionsTitle').textContent = '';
    $('#connectionsSubtitle').textContent = `Viewing @${person.tag || mobileBookContextTag}. You do not share a scrapbook or group with this person yet.`;
    $('#inviteForm').classList.add('hidden');
    $('#unbindPanel').classList.add('hidden');
    $('#unbindPanel').innerHTML = '';
    $('#personalPrivacyPanel').classList.add('hidden');
    $('#personalPrivacyPanel').innerHTML = '';
    $('#peopleMap').innerHTML = `<button class="personal-owner-card profile-card-button" type="button" data-profile-tag="${escapeHtml(person.tag || mobileBookContextTag)}">${avatarHtml(person,'bound-avatar')}<strong>${escapeHtml(person.displayName || person.tag || mobileBookContextTag)}</strong><span>@${escapeHtml(person.tag || mobileBookContextTag)}</span></button>`;
    wireProfileLinks($('#peopleMap'));
    return;
  }

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
  connectionsView.classList.toggle('mobile-personal-context', isPhoneUI() && isPersonal);
  connectionsView.classList.toggle('mobile-group-context', isPhoneUI() && activeScrapbook.type === 'group');
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
    const bondStart = activeScrapbook.boundAt || activeScrapbook.createdAt;
    const bondEnd = archived ? activeScrapbook.unboundAt : null;
    const bondDate = other && bondStart ? formatBondDate(bondStart) : '';
    const bondDuration = other && bondStart ? bondDurationText(bondStart, bondEnd) : '';
    $('#peopleMap').innerHTML = `<div class="couple-bind ${archived ? 'unbound-bind' : ''}">
      <svg class="bond-current-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path class="bond-current-left" d="M18 50 C27 38 36 62 47 50" />
        <path class="bond-current-right" d="M53 50 C64 38 73 62 82 50" />
      </svg>
      <button class="bound-profile profile-card-button" type="button" data-profile-tag="${escapeHtml(mine.tag)}">${avatarHtml(mine, 'bound-avatar')}<strong>${escapeHtml(mine.displayName)}</strong><span>@${escapeHtml(mine.tag)}</span></button>
      <div class="heart-bind"><span>♡</span><small>${archived ? 'UNBOUND ARCHIVE' : (other ? 'BOUND' : 'WAITING')}</small>${bondDate ? `<em>Since ${escapeHtml(bondDate)}</em>` : ''}${bondDuration ? `<b>${escapeHtml(bondDuration)}</b>` : ''}</div>
      ${other ? `<button class="bound-profile profile-card-button" type="button" data-profile-tag="${escapeHtml(other.tag)}">${avatarHtml(other, 'bound-avatar')}<strong>${escapeHtml(other.displayName)}</strong><span>@${escapeHtml(other.tag)}</span></button>` : `<div class="bound-profile empty-bound"><span class="avatar bound-avatar">?</span><strong>Your person</strong><span>Invite by @tag</span></div>`}
    </div>`;
    wireProfileLinks($('#peopleMap'));
    renderUnbindPanel();
    return;
  }

  $('#unbindPanel').classList.add('hidden');
  $('#unbindPanel').innerHTML = '';
  const phoneCenterTag = isPhoneUI() && mobileBookContextTag && profiles.some(p => p.tag === mobileBookContextTag)
    ? mobileBookContextTag
    : me.tag;
  const mine = profiles.find(p => p.tag === phoneCenterTag) || me;
  const others = profiles.filter(p => p.tag !== mine.tag);
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
    introducedIn:8,
    selector:'#scrapbookPicker',
    eyebrow:'NEW · PERSONAL SCRAPBOOKS',
    title:'Personal scrapbooks now work better with multiple journals.',
    text:'A person can own more than one Personal scrapbook. Every scrapbook shared with you now appears on their profile and Home shelf. Owners can also change You Only, Followers Only, or Partner Only directly from the active scrapbook.',
    prepare:() => showView('home')
  },
  {
    introducedIn:7,
    selector:'#themeModeBtn',
    eyebrow:'NEW · NIGHT MODE',
    title:'The scrapbook can now settle into the dark.',
    text:'Use the moon or sun button to switch between light and night mode. Your choice follows your account across devices.',
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
  const card = $('#guideCard');
  if (!target) {
    spot.classList.add('guide-no-target');
    spot.style.cssText = '';
    card?.classList.remove('guide-card-top');
    return;
  }
  const rect = target.getBoundingClientRect();
  const pad = window.innerWidth <= 600 ? 5 : 7;
  spot.classList.remove('guide-no-target');
  spot.style.left = `${Math.max(4, rect.left - pad)}px`;
  spot.style.top = `${Math.max(4, rect.top - pad)}px`;
  spot.style.width = `${Math.min(window.innerWidth - 8, rect.width + pad * 2)}px`;
  spot.style.height = `${Math.min(window.innerHeight - 8, rect.height + pad * 2)}px`;

  if (isPhoneUI() && card) {
    const targetCenter = rect.top + rect.height / 2;
    card.classList.toggle('guide-card-top', targetCenter > window.innerHeight / 2);
  } else {
    card?.classList.remove('guide-card-top');
  }
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
  $('#guideCard')?.classList.remove('guide-card-top');
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
function chatMessageImages(message) {
  if (!message) return [];
  return [...new Set([
    ...(Array.isArray(message.images) ? message.images : []),
    message.image || ''
  ].filter(Boolean))].slice(0,10);
}
async function saveChatImage(src,index=0) {
  if(!src)return;
  try{
    const response=await fetch(src,{credentials:'same-origin'});
    if(!response.ok)throw new Error('Could not download that photo.');
    const blob=await response.blob();
    const ext=(blob.type.split('/')[1]||'jpg').replace('jpeg','jpg');
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`scrapbook-photo-${Date.now()}-${index+1}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(err){
    showToast(err.message || 'Could not save that photo.');
  }
}
async function saveChatImages(message) {
  const images=chatMessageImages(message);
  if(!images.length)return;
  if(images.length===1){
    await saveChatImage(images[0],0);
    return;
  }
  for(let i=0;i<images.length;i++){
    await saveChatImage(images[i],i);
    await new Promise(resolve=>setTimeout(resolve,180));
  }
  showToast(`Saving ${images.length} photos.`);
}
function openChatImageViewer(src) {
  if(!src)return;
  const viewer=$('#chatImageViewer');
  const img=$('#chatImageViewerImg');
  if(!viewer||!img)return;
  chatImageViewerSrc=src;
  img.src=src;
  viewer.classList.remove('hidden');
  document.body.classList.add('chat-image-viewing');
}
function closeChatImageViewer() {
  $('#chatImageViewer')?.classList.add('hidden');
  if($('#chatImageViewerImg'))$('#chatImageViewerImg').src='';
  chatImageViewerSrc='';
  document.body.classList.remove('chat-image-viewing');
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
function isOwnerOverrideBook(bookId) {
  if (!bookId || ownerOverrideTargetTag !== viewedPersonData?.profile?.tag || viewedPersonData?.overrideActive !== true) return false;
  return (viewedPersonData.personalScrapbooks || []).some(book => book?.id === bookId);
}
function personPersonalBookHtml(book) {
  if (!book) return '';
  return `<div class="person-book-layout">
    <div class="person-book-copy">
      <p class="eyebrow">PERSONAL SCRAPBOOK</p>
      <h3>${escapeHtml(book.name || 'Personal Scrapbook')}</h3>
      <p>${book.overrideAccess
        ? `<span class="owner-override-note">Owner Override</span> · ${escapeHtml(privacyLabel(book.privacy))} · Read-only access.`
        : `${escapeHtml(privacyLabel(book.privacy))} · Shared with you.`} Open it as a flip book or read it as a continuous Memory Stream.</p>
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
  const ownerBadge = p.isPlatformOwner
    ? '<span class="owner-verified-badge" title="Scrapella Owner" aria-label="Scrapella Owner">✓</span>'
    : '';
  const avatarCore = `<span class="person-avatar-owner-wrap">${avatarHtml(p,'person-profile-avatar')}${ownerBadge}</span>`;
  const personAvatarMarkup = !data.isSelf && p.avatar
    ? `<button id="personAvatarZoomBtn" class="person-avatar-zoom" type="button" aria-label="Enlarge ${escapeHtml(p.displayName || p.tag)} profile photo">${avatarCore}<small>Tap to enlarge</small></button>`
    : avatarCore;
  $('#personProfileIdentity').innerHTML = `
    ${personAvatarMarkup}
    <div>
      <p class="eyebrow">${data.isSelf ? 'YOUR SOCIAL PROFILE' : 'SCRAPBOOK PROFILE'}</p>
      <h2>${escapeHtml(p.displayName || p.tag)}${p.isPlatformOwner ? '<span class="owner-name-label">(Owner)</span>' : ''}</h2>
      <span>@${escapeHtml(p.tag || '')}</span>
      ${p.bio ? `<p class="profile-about-text">${mentionTextHtml(p.bio)}</p>` : '<p class="muted">No bio yet.</p>'}
      <div class="person-relation-badges">${data.isPartner ? '<span>Partner</span>' : ''}${data.followsYou ? '<span>Follows you</span>' : ''}${data.isFollowing ? '<span>You follow</span>' : ''}</div>
    </div>`;
  $('#personFollowerCount').textContent = compactPhoneCount(data.followerCount || 0);
  $('#personFollowingCount').textContent = compactPhoneCount(data.followingCount || 0);

  $('#personProfileActions').innerHTML = data.isSelf
    ? '<button id="personEditOwnProfile" class="ghost" type="button">Edit my profile</button>'
    : `<button class="primary person-message-btn" type="button">Message</button><button class="${data.isFollowing ? 'ghost' : 'primary'} person-follow-toggle" type="button">${data.isFollowing ? 'Following' : 'Follow'}</button>${data.overrideAvailable ? `<button id="personOverrideBtn" class="primary owner-override-btn ${data.overrideActive ? 'active' : ''}" type="button">${data.overrideActive ? 'Override active' : 'Override'}</button>` : ''}`;

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
  $('#personOverrideBtn')?.addEventListener('click', async e => {
    if (!data.overrideAvailable) return;
    e.currentTarget.disabled = true;
    const previousTarget = ownerOverrideTargetTag;
    ownerOverrideTargetTag = data.overrideActive ? null : p.tag;
    const opened = await openPersonProfile(p.tag, { preserveReturn:true, list:personListMode });
    if (!opened) {
      ownerOverrideTargetTag = previousTarget;
      e.currentTarget.disabled = false;
      return;
    }
    showToast(ownerOverrideTargetTag === p.tag
      ? `Owner Override enabled for @${p.tag}. Private Personal scrapbooks are visible read-only.`
      : 'Owner Override closed.');
  });
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
  if (!cleanTag) return false;
  if (currentMode !== 'person' && !options.preserveReturn) personProfileReturnMode = currentMode;
  if (options.list === 'following' || options.list === 'followers') personListMode = options.list;
  try {
    const overrideQuery = ownerOverrideTargetTag === cleanTag ? '?override=1' : '';
    viewedPersonData = await api(`/api/people/${encodeURIComponent(cleanTag)}/profile${overrideQuery}`);
    if (isPhoneUI()) mobileBookContextTag = cleanTag;
    renderPersonProfile();
    showView('person');
    return true;
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not open that profile.');
    return false;
  }
}

$('#personFollowersBtn').addEventListener('click', () => { personListMode='followers'; renderPersonConnections(); $('#personConnectionsList').scrollIntoView({behavior:'smooth',block:'nearest'}); });
$('#personFollowingBtn').addEventListener('click', () => { personListMode='following'; renderPersonConnections(); $('#personConnectionsList').scrollIntoView({behavior:'smooth',block:'nearest'}); });
$('#personFollowersTab').addEventListener('click', () => { personListMode='followers'; renderPersonConnections(); });
$('#personFollowingTab').addEventListener('click', () => { personListMode='following'; renderPersonConnections(); });
$('#personProfileBackBtn').addEventListener('click', async () => {
  if (isPhoneUI() && phoneHistoryReady) {
    phoneBackButton();
    return;
  }
  const mode = ['home','cover','book','stream','connections','messages'].includes(personProfileReturnMode) ? personProfileReturnMode : 'connections';
  if (mode === 'home' || mode === 'connections') await refreshAndShow(mode);
  else showView(mode);
});

function renderHome() {
  if (!me) return;
  if (!$('#homeSearchInput')?.value.trim()) {
    $('#homeSearchResults')?.classList.add('hidden');
    if ($('#homeSearchResults')) $('#homeSearchResults').innerHTML = '';
  }
  const profileCard = $('#homeProfileCard');
  profileCard.innerHTML = `<button class="home-profile-link" type="button" data-profile-tag="${escapeHtml(me.tag)}">${avatarHtml(me,'home-avatar')}<span><strong>${escapeHtml(me.displayName || me.tag)}</strong><em>@${escapeHtml(me.tag)}</em><small>${followers.length} followers · ${following.length} following</small></span></button>`;

  const shelf = Array.isArray(homeData.followingShelf) ? homeData.followingShelf : [];
  $('#homeFollowingCount').textContent = isPhoneUI()
    ? `${compactPhoneCount(following.length)} following`
    : `${shelf.length} following`;
  $('#homeShelf').innerHTML = shelf.length ? shelf.map(item => {
    const p = item.profile || {};
    const books = Array.isArray(item.scrapbooks)
      ? item.scrapbooks
      : (item.scrapbook?.accessible ? [item.scrapbook] : []);
    const hasLocked =
      item.hasLockedPersonalScrapbooks === true ||
      Boolean(item.scrapbook && item.scrapbook.accessible === false);

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


    const emptyHtml = !books.length && !hasLocked ? `<div class="home-personal-book-card">
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
  }).join('') : '<div class="home-empty"><span>♡</span><strong>Your shelf is empty.</strong><p>Follow someone from People and their Personal scrapbooks will appear here when they choose to share them with you.</p></div>';

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
      if (query) {
        const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
        renderHomeSearchResults(data.people || []);
      }
      showToast(currentlyFollowing ? `Unfollowed @${tag}.` : `You are now following @${tag}.`);
    } catch (err) {
      showToast(err.message);
      btn.disabled = false;
    }
  }));
}

$('#homeSearchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const query = $('#homeSearchInput').value.trim();
  if (!query) return;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    renderHomeSearchResults(data.people || []);
  } catch (err) {
    showToast(err.message || 'Could not search profiles.');
  }
});

async function runMobileHomeSearch(rawQuery = $('#homeSearchInput')?.value || '') {
  if (!isPhoneUI()) return;
  const query = String(rawQuery || '').trim();
  const host = $('#homeSearchResults');
  if (!query) {
    host?.classList.add('hidden');
    if (host) host.innerHTML = '';
    return;
  }
  const seq = ++mobileHomeSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== mobileHomeSearchSeq || !isPhoneUI()) return;
    renderHomeSearchResults(data.people || []);
  } catch (err) {
    if (seq === mobileHomeSearchSeq) showToast(err.message || 'Could not search profiles.');
  }
}
$('#homeSearchInput').addEventListener('input', e => {
  if (!isPhoneUI()) return;
  clearTimeout(mobileHomeSearchTimer);
  const query = e.currentTarget.value.trim();
  if (!query) {
    $('#homeSearchResults')?.classList.add('hidden');
    if ($('#homeSearchResults')) $('#homeSearchResults').innerHTML = '';
    return;
  }
  mobileHomeSearchTimer = setTimeout(() => runMobileHomeSearch(query), 110);
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
    if (isPhoneUI()) mobileBookContextTag = book.owner || me?.tag || null;
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
function closeChatThreadActionMenu() {
  if (!chatThreadActionMenu) return;
  chatThreadActionMenu.remove();
  chatThreadActionMenu = null;
}
async function updateChatThreadPreference(chat, action, value = true) {
  if (!chat?.id) return;
  if (action === 'delete' && !confirm('Delete this conversation from your list? It will reappear if a new message arrives.')) return;
  if (action === 'block' && value === true && !confirm(`Block ${chat.name || 'this person'}? You will not be able to exchange messages until you unblock them.`)) return;
  try {
    await api(`/api/chats/${encodeURIComponent(chat.id)}/preferences`, {
      method:'PATCH',
      body:JSON.stringify({ action, value })
    });
    closeChatThreadActionMenu();
    if (action === 'delete') {
      if (activeChatId === chat.id) await closeMobileChat();
      await loadChats({ preserveActive:false });
      showToast('Conversation removed from your list.');
      return;
    }
    await loadChats();
    const messages = {
      pin:value ? 'Conversation pinned.' : 'Conversation unpinned.',
      mute:value ? 'Conversation muted.' : 'Conversation unmuted.',
      restrict:value ? 'Conversation restricted.' : 'Restriction removed.',
      block:value ? 'Person blocked.' : 'Person unblocked.'
    };
    showToast(messages[action] || 'Conversation updated.');
  } catch (err) {
    showToast(err.message || 'Could not update that conversation.');
  }
}
function chatThreadActionIcon(kind) {
  return ({
    pin:'📌',
    mute:'🔕',
    restrict:'◉',
    block:'⊖',
    delete:'🗑'
  })[kind] || '•';
}
function showChatThreadActionMenu(chat, point = null) {
  if (!chat) return;
  closeChatThreadActionMenu();
  closeChatReactionPicker();
  const phone = isPhoneUI();

  const actions = [
    { id:'pin', label:chat.pinned ? 'Unpin' : 'Pin', value:!chat.pinned },
    { id:'mute', label:chat.muted ? 'Unmute' : 'Mute', value:!chat.muted },
    ...(chat.type === 'private' ? [
      { id:'restrict', label:chat.restricted ? 'Unrestrict' : 'Restrict', value:!chat.restricted },
      { id:'block', label:chat.blocked ? 'Unblock' : 'Block', value:!chat.blocked }
    ] : []),
    { id:'delete', label:'Delete', value:true, danger:true }
  ];

  const overlay=document.createElement('div');
  overlay.className=`chat-thread-menu-overlay${phone ? '' : ' desktop-thread-context'}`;
  overlay.innerHTML=`<section class="chat-thread-menu-sheet" role="menu" aria-label="Conversation actions">
    <div class="chat-thread-menu-handle" aria-hidden="true"></div>
    <div class="chat-thread-menu-person">
      ${chatAvatarHtml(chat)}
      <span><strong>${escapeHtml(chat.name || 'Conversation')}</strong><small>${chat.type === 'private' ? '@'+escapeHtml(chat.otherProfile?.tag || '') : 'Group conversation'}</small></span>
    </div>
    <div class="chat-thread-menu-actions">
      ${actions.map(action=>`<button type="button" data-thread-action="${action.id}" data-thread-value="${action.value?'1':'0'}" class="${action.danger?'danger':''}"><span aria-hidden="true">${chatThreadActionIcon(action.id)}</span><b>${escapeHtml(action.label)}</b></button>`).join('')}
    </div>
  </section>`;
  document.body.appendChild(overlay);
  chatThreadActionMenu=overlay;
  if (!phone) {
    const sheet = overlay.querySelector('.chat-thread-menu-sheet');
    requestAnimationFrame(() => {
      const rect = sheet.getBoundingClientRect();
      const x = Number(point?.x) || (window.innerWidth / 2);
      const y = Number(point?.y) || (window.innerHeight / 2);
      sheet.style.left = `${Math.max(10, Math.min(window.innerWidth - rect.width - 10, x))}px`;
      sheet.style.top = `${Math.max(10, Math.min(window.innerHeight - rect.height - 10, y))}px`;
    });
  }
  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeChatThreadActionMenu();});
  overlay.querySelectorAll('[data-thread-action]').forEach(button=>button.addEventListener('click',async()=>{
    const action=button.dataset.threadAction;
    const value=button.dataset.threadValue==='1';
    await updateChatThreadPreference(chat,action,value);
  }));
}
function wireChatThreadGestures(host) {
  if (!host) return;
  if (!isPhoneUI()) {
    host.querySelectorAll('.chat-list-item').forEach(button => {
      button.addEventListener('contextmenu', e => {
        e.preventDefault();
        const chat = chats.find(item => item.id === button.dataset.chatId);
        if (chat) showChatThreadActionMenu(chat, { x:e.clientX, y:e.clientY });
      });
    });
    return;
  }
  host.querySelectorAll('.chat-list-item').forEach(button => {
    let timer=null;
    let sx=0,sy=0;
    let longPress=false;
    button.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse' && e.button!==0)return;
      sx=e.clientX; sy=e.clientY; longPress=false;
      clearTimeout(timer);
      timer=setTimeout(()=>{
        longPress=true;
        button._suppressChatClick=true;
        const chat=chats.find(item=>item.id===button.dataset.chatId);
        if(chat)showChatThreadActionMenu(chat);
        if(navigator.vibrate)navigator.vibrate(18);
      },430);
    });
    button.addEventListener('pointermove',e=>{
      if(Math.hypot(e.clientX-sx,e.clientY-sy)>13)clearTimeout(timer);
    });
    const end=()=>{
      clearTimeout(timer);
      if(longPress)setTimeout(()=>{button._suppressChatClick=false;},450);
    };
    button.addEventListener('pointerup',end);
    button.addEventListener('pointercancel',end);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  });
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
    const lastImages=last ? chatMessageImages(last) : [];
    const preview = last ? (last.deleted ? 'Message deleted' : (last.text || (lastImages.length ? (lastImages.length===1 ? '📷 Photo' : `📷 ${lastImages.length} photos`) : (last.audio ? '🎙 Voice message' : 'New message')))) : (chat.type === 'group' ? 'Group scrapbook chat' : 'Start a conversation');
    const stateMarks = [chat.pinned?'📌':'',chat.muted?'🔕':'',chat.restricted?'Restricted':'',chat.blocked?'Blocked':''].filter(Boolean).join(' · ');
    return `<button class="chat-list-item ${chat.id === activeChatId ? 'active' : ''} ${chat.pinned?'pinned':''}" type="button" data-chat-id="${escapeHtml(chat.id)}">
      ${chatAvatarHtml(chat)}
      <span class="chat-list-copy"><strong>${escapeHtml(chat.name || 'Conversation')}</strong><small>${escapeHtml(preview)}</small>${stateMarks ? `<em>${escapeHtml(stateMarks)}</em>` : ''}</span>
      <span class="chat-list-meta">${last ? `<time>${escapeHtml(chatWhen(last.createdAt))}</time>` : ''}${chat.unreadCount ? `<b>${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</b>` : ''}</span>
    </button>`;
  }).join('');
  host.querySelectorAll('.chat-list-item').forEach(btn => btn.addEventListener('click', e => {
    if (btn._suppressChatClick) { e.preventDefault(); return; }
    openChat(btn.dataset.chatId);
  }));
  wireChatThreadGestures(host);
}
async function refreshManagedGroupChat(chatId, { reopenMembers = true } = {}) {
  await loadChats();
  const updated=chats.find(item=>item.id===chatId) || null;
  if(activeChatId===chatId && updated){
    await loadChatMessages(chatId);
  }
  if(reopenMembers && updated) openChatMembersDialog(updated);
  return updated;
}
async function manageGroupAdmin(chat,target,makeAdmin) {
  try {
    await api(`/api/scrapbooks/${encodeURIComponent(chat.scrapbookId)}/admins/${encodeURIComponent(target)}`, {
      method:makeAdmin?'PUT':'DELETE',
      body:'{}'
    });
    showToast(makeAdmin?'Admin added.':'Admin removed.');
    await refreshManagedGroupChat(chat.id);
  } catch (err) {
    showToast(err.message || 'Could not update the admin role.');
  }
}
async function removeGroupMember(chat,target) {
  if(!confirm(`Remove @${target} from ${chat.name}? They will lose access to the scrapbook and group chat.`))return;
  try {
    await api(`/api/scrapbooks/${encodeURIComponent(chat.scrapbookId)}/members/${encodeURIComponent(target)}`, { method:'DELETE', body:'{}' });
    showToast(`@${target} was removed from the group.`);
    await refreshManagedGroupChat(chat.id);
  } catch (err) {
    showToast(err.message || 'Could not remove that member.');
  }
}
async function leaveGroupFromChat(chat) {
  if(!confirm(`Leave "${chat.name}"? You will lose access to this scrapbook and group chat.`))return;
  try {
    await api(`/api/scrapbooks/${encodeURIComponent(chat.scrapbookId)}/leave`, { method:'POST', body:'{}' });
    $('#chatMembersDialog')?.close();
    if(activeChatId===chat.id){
      activeChatId=null;
      activeChatMessages=[];
      messagesView?.classList.remove('chat-open');
      $('#activeChat')?.classList.add('hidden');
      $('#chatEmptyState')?.classList.remove('hidden');
    }
    await loadSession(activeScrapbook?.id===chat.scrapbookId ? null : activeScrapbook?.id || null);
    await loadChats({ preserveActive:false });
    showToast('You left the group.');
  } catch (err) {
    showToast(err.message || 'Could not leave the group.');
  }
}
async function deleteGroupFromChat(chat) {
  const delegated=chat.isOwner!==true;
  const warning=delegated
    ? `Request deletion of "${chat.name}"? The owner must approve before the group is deleted.`
    : `Delete "${chat.name}" for everyone? Its scrapbook, messages, notifications, and related data will be removed.`;
  if(!confirm(warning))return;
  try {
    const result=await api(`/api/scrapbooks/${encodeURIComponent(chat.scrapbookId)}`, { method:'DELETE' });
    if(result.approvalRequired){
      showToast('Deletion request sent to the group owner.');
      await refreshManagedGroupChat(chat.id);
      return;
    }
    $('#chatMembersDialog')?.close();
    activeChatId=null;
    activeChatMessages=[];
    messagesView?.classList.remove('chat-open');
    $('#activeChat')?.classList.add('hidden');
    $('#chatEmptyState')?.classList.remove('hidden');
    await loadSession(activeScrapbook?.id===chat.scrapbookId ? null : activeScrapbook?.id || null);
    await loadChats({ preserveActive:false });
    showToast('Group scrapbook deleted.');
  } catch (err) {
    showToast(err.message || 'Could not delete the group.');
  }
}
function openChatMembersDialog(chat) {
  if (!chat || chat.type !== 'group') return;
  const members = Array.isArray(chat.members) ? chat.members : [];
  const admins = new Set(Array.isArray(chat.admins) ? chat.admins : []);
  $('#chatMembersTitle').textContent = `${chat.name || 'Group chat'} · ${members.length} member${members.length === 1 ? '' : 's'}`;
  const host = $('#chatMembersList');

  const addMember = chat.isAdmin ? `<form class="group-member-add" id="groupMemberAddForm">
    <input id="groupMemberAddTag" placeholder="@tag to invite" autocomplete="off" />
    <button class="primary" type="submit">Add</button>
  </form>` : '';

  const memberRows = members.length ? members.map(member => {
    const isOwner = member.tag === chat.owner;
    const isAdmin = admins.has(member.tag);
    const canManage = chat.isAdmin && !isOwner && member.tag !== me?.tag;
    const canPromote = chat.isOwner && !isOwner;
    return `<article class="chat-member-row" data-member-tag="${escapeHtml(member.tag || '')}">
      <button class="chat-member-profile" type="button" data-profile-tag="${escapeHtml(member.tag || '')}">
        ${avatarHtml(member,'chat-member-avatar')}
        <span><strong>${escapeHtml(member.displayName || member.tag || 'Member')}</strong><small>@${escapeHtml(member.tag || '')}</small></span>
      </button>
      <div class="chat-member-badges">${isOwner?'<em>Owner</em>':''}${!isOwner&&isAdmin?'<em>Admin</em>':''}${member.tag===me?.tag?'<em>You</em>':''}</div>
      <div class="chat-member-actions">
        ${canPromote ? `<button class="ghost chat-admin-toggle" type="button" data-tag="${escapeHtml(member.tag)}" data-make-admin="${isAdmin?'0':'1'}">${isAdmin?'Remove admin':'Make admin'}</button>` : ''}
        ${canManage ? `<button class="danger chat-member-remove" type="button" data-tag="${escapeHtml(member.tag)}">Kick</button>` : ''}
      </div>
    </article>`;
  }).join('') : '<p class="helper">No members found.</p>';

  const managementActions = `<div class="group-member-footer">
    ${!chat.isOwner ? '<button id="leaveGroupChatBtn" class="ghost" type="button">Leave group</button>' : ''}
    ${chat.isAdmin ? `<button id="deleteGroupChatBtn" class="danger" type="button" ${chat.deleteRequest ? 'disabled' : ''}>${chat.isOwner?'Delete group':'Request deletion'}</button>` : ''}
    ${chat.deleteRequest ? '<small>A deletion request is waiting for the owner.</small>' : ''}
  </div>`;

  host.innerHTML = addMember + memberRows + managementActions;
  wireProfileLinks(host);

  host.querySelectorAll('.chat-member-profile').forEach(button=>button.addEventListener('click',()=>{
    $('#chatMembersDialog').close();
  }));
  host.querySelectorAll('.chat-admin-toggle').forEach(button=>button.addEventListener('click',()=>{
    manageGroupAdmin(chat,button.dataset.tag,button.dataset.makeAdmin==='1');
  }));
  host.querySelectorAll('.chat-member-remove').forEach(button=>button.addEventListener('click',()=>{
    removeGroupMember(chat,button.dataset.tag);
  }));

  $('#groupMemberAddForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const input=$('#groupMemberAddTag');
    const tag=String(input?.value||'').trim().replace(/^@/,'').toLowerCase();
    if(!tag)return;
    try{
      await api(`/api/scrapbooks/${encodeURIComponent(chat.scrapbookId)}/invite`, {
        method:'POST',
        body:JSON.stringify({tag})
      });
      input.value='';
      showToast(`Invitation sent to @${tag}.`);
    }catch(err){
      showToast(err.message || 'Could not invite that person.');
    }
  });
  $('#leaveGroupChatBtn')?.addEventListener('click',()=>leaveGroupFromChat(chat));
  $('#deleteGroupChatBtn')?.addEventListener('click',()=>deleteGroupFromChat(chat));
  $('#chatMembersDialog').showModal();
}
function syncMobileChatViewport() {
  if (!messagesView) return;
  if (!isPhoneUI() || !messagesView.classList.contains('chat-open')) {
    messagesView.style.removeProperty('--mobile-chat-top');
    return;
  }
  const topbar = document.querySelector('.topbar');
  const top = Math.max(0, Math.round(topbar?.getBoundingClientRect().bottom || 0));
  messagesView.style.setProperty('--mobile-chat-top', `${top}px`);
}
async function closeMobileChat() {
  const closingId = activeChatId;
  const closingChat = activeChat();
  const untouchedDraft = isPhoneUI() &&
    closingId &&
    closingChat?.type === 'private' &&
    activeChatMessages.length === 0 &&
    !closingChat.lastMessage &&
    !($('#chatText')?.value || '').trim() &&
    pendingChatFiles.length === 0;

  messagesView?.classList.remove('chat-open');
  messagesView?.style.removeProperty('--mobile-chat-top');

  if (isPhoneUI()) {
    activeChatId = null;
    activeChatMessages = [];
    clearPendingChatImage();
    clearPendingChatAudio();
    if(chatMediaRecorder?.state==='recording')chatMediaRecorder.stop();
    stopChatMediaStream();
    clearPendingChatReply();
    closeChatReactionPicker();
    if ($('#chatText')) $('#chatText').value = '';
    $('#activeChat')?.classList.add('hidden');
    $('#chatEmptyState')?.classList.remove('hidden');

    if (untouchedDraft) {
      try {
        await api(`/api/chats/${encodeURIComponent(closingId)}`, { method:'DELETE' });
        chats = chats.filter(chat => chat.id !== closingId);
        await loadChats({ preserveActive:false });
      } catch {
        await loadChats({ preserveActive:false }).catch(() => {});
      }
    } else {
      renderChatList();
    }
  }
}
function renderChatHeader(chat) {
  const host = $('#chatHeader');
  if (!host || !chat) return;
  const memberCount = Array.isArray(chat.members) ? chat.members.length : 0;
  host.innerHTML = `<button class="chat-mobile-back" type="button" aria-label="Back to conversations"><span aria-hidden="true">←</span></button><div class="chat-header-identity">${chatAvatarHtml(chat)}<div><p class="eyebrow">${chat.type === 'group' ? 'GROUP SCRAPBOOK CHAT' : 'PRIVATE MESSAGE'}</p><h3>${escapeHtml(chat.name || 'Conversation')}</h3>${chat.type === 'group' ? `<button class="chat-member-count" type="button">${memberCount} member${memberCount === 1 ? '' : 's'} · tap to view</button>` : `<button class="chat-profile-link" type="button" data-profile-tag="${escapeHtml(chat.otherProfile?.tag || '')}">@${escapeHtml(chat.otherProfile?.tag || '')}</button>`}</div></div>`;
  wireProfileLinks(host);
  host.querySelector('.chat-mobile-back')?.addEventListener('click', () => phoneBackButton(closeMobileChat));
  host.querySelector('.chat-member-count')?.addEventListener('click', () => openChatMembersDialog(chat));
}
function closeReactionViewer() {
  if (reactionViewer) {
    reactionViewer.remove();
    reactionViewer = null;
  }
}
function openReactionViewer(title, groups = [], { onSelfReaction = null } = {}) {
  closeReactionViewer();
  const people = [];
  groups.forEach(group => {
    (Array.isArray(group.people) ? group.people : []).forEach(profile => {
      const tag = profile?.tag || '';
      const key = `${group.emoji}:${tag}`;
      if (!tag || people.some(item => item.key === key)) return;
      people.push({ key, emoji:group.emoji, profile });
    });
  });
  if (!people.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'reaction-viewer';
  overlay.innerHTML = `<section class="reaction-viewer-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Reactions')}">
    <header><div><small>REACTIONS</small><strong>${escapeHtml(title || 'People who reacted')}</strong></div><button type="button" class="reaction-viewer-close" aria-label="Close">×</button></header>
    <div class="reaction-viewer-list">${people.map(item => {
      const p=item.profile || {};
      const mine=Boolean(me?.tag && p.tag===me.tag);
      return `<button type="button" class="reaction-viewer-person ${mine?'self-reactor':''}" data-profile-tag="${escapeHtml(p.tag || '')}" data-reaction-emoji="${escapeHtml(item.emoji)}">
        ${avatarHtml(p,'reaction-viewer-avatar')}
        <span><strong>${escapeHtml(p.displayName || p.tag || 'Someone')}${mine?' (You)':''}</strong><small>${mine?'Tap to remove your reaction':`@${escapeHtml(p.tag || '')}`}</small></span>
        <em>${escapeHtml(item.emoji)}</em>
      </button>`;
    }).join('')}</div>
  </section>`;
  document.body.appendChild(overlay);
  reactionViewer=overlay;
  overlay.querySelector('.reaction-viewer-close')?.addEventListener('click',closeReactionViewer);
  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeReactionViewer();});
  overlay.querySelectorAll('[data-profile-tag]').forEach(button=>button.addEventListener('click',async()=>{
    const tag=button.dataset.profileTag;
    const emoji=button.dataset.reactionEmoji || '';
    if(tag && me?.tag && tag===me.tag && typeof onSelfReaction==='function'){
      closeReactionViewer();
      await onSelfReaction(emoji);
      return;
    }
    closeReactionViewer();
    if(tag)await openPersonProfile(tag);
  }));
}
function formatAudioTime(seconds) {
  const value = Number.isFinite(Number(seconds)) ? Math.max(0,Math.floor(Number(seconds))) : 0;
  return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
}
function chatVoiceBars() {
  return Array.from({length:22},(_,i)=>`<i style="--bar:${i}"></i>`).join('');
}
function chatVoiceHtml(message) {
  if (!message?.audio) return '';
  return `<div class="chat-voice-player" data-message-id="${escapeHtml(message.id || '')}">
    <button class="chat-voice-play" type="button" aria-label="Play voice message"><span>▶</span></button>
    <button class="chat-voice-wave" type="button" aria-label="Seek voice message">${chatVoiceBars()}</button>
    <span class="chat-voice-duration">0:00</span>
    <audio preload="metadata" src="${escapeHtml(message.audio)}"></audio>
  </div>`;
}
function scrollChatToMessage(messageId) {
  const host=$('#chatMessages');
  if(!host||!messageId)return;
  const target=host.querySelector(`.chat-message[data-message-id="${CSS.escape(messageId)}"]`);
  if(!target){
    showToast('That original message is no longer available.');
    return;
  }
  target.scrollIntoView({behavior:'smooth',block:'center'});
  target.classList.remove('chat-message-jump');
  void target.offsetWidth;
  target.classList.add('chat-message-jump');
  setTimeout(()=>target.classList.remove('chat-message-jump'),1400);
}
function wireChatVoicePlayers(host) {
  host?.querySelectorAll('.chat-voice-player').forEach(player=>{
    const audio=player.querySelector('audio');
    const play=player.querySelector('.chat-voice-play');
    const wave=player.querySelector('.chat-voice-wave');
    const duration=player.querySelector('.chat-voice-duration');
    const bars=[...player.querySelectorAll('.chat-voice-wave i')];
    if(!audio||!play||!wave||!duration)return;
    const paint=()=>{
      const total=Number(audio.duration)||0;
      const ratio=total?Math.max(0,Math.min(1,(Number(audio.currentTime)||0)/total)):0;
      bars.forEach((bar,index)=>bar.classList.toggle('played',(index+1)/bars.length<=ratio));
      duration.textContent=formatAudioTime(audio.paused ? total : audio.currentTime);
      play.querySelector('span').textContent=audio.paused?'▶':'Ⅱ';
    };
    audio.addEventListener('loadedmetadata',paint);
    audio.addEventListener('timeupdate',paint);
    audio.addEventListener('play',()=>{
      host.querySelectorAll('.chat-voice-player audio').forEach(other=>{if(other!==audio)other.pause();});
      paint();
    });
    audio.addEventListener('pause',paint);
    audio.addEventListener('ended',()=>{audio.currentTime=0;paint();});
    play.addEventListener('click',e=>{
      e.stopPropagation();
      if(audio.paused)audio.play().catch(()=>showToast('Could not play that voice message.'));
      else audio.pause();
    });
    wave.addEventListener('click',e=>{
      e.stopPropagation();
      if(!Number(audio.duration))return;
      const rect=wave.getBoundingClientRect();
      audio.currentTime=Math.max(0,Math.min(audio.duration,((e.clientX-rect.left)/rect.width)*audio.duration));
      paint();
    });
    paint();
  });
}

function chatReplySnippet(message) {
  if (!message) return '';
  if (message.deleted) return 'Message deleted';
  if (message.text) return String(message.text).replace(/\s+/g,' ').trim().slice(0,110);
  const images=chatMessageImages(message);
  if (images.length) return images.length===1 ? '📷 Photo' : `📷 ${images.length} photos`;
  if (message.audio) return '🎙 Voice message';
  return 'Message';
}
function renderChatReplyPreview() {
  const host=$('#chatReplyPreview');
  if(!host)return;
  if(!pendingChatReply){
    host.classList.add('hidden');
    host.innerHTML='';
    return;
  }
  const profile=pendingChatReply.profile || {};
  host.classList.remove('hidden');
  host.innerHTML=`<div class="chat-reply-preview-inner">
    <div><small>Replying to</small><strong>${escapeHtml(profile.displayName || pendingChatReply.author || 'Message')}</strong><span>${escapeHtml(chatReplySnippet(pendingChatReply))}</span></div>
    <button id="clearChatReplyBtn" type="button" aria-label="Cancel reply">×</button>
  </div>`;
  $('#clearChatReplyBtn')?.addEventListener('click',clearPendingChatReply);
}
function setPendingChatReply(message) {
  if(!message)return;
  pendingChatReply=message;
  renderChatReplyPreview();
  $('#chatText')?.focus({preventScroll:true});
}
function clearPendingChatReply() {
  pendingChatReply=null;
  renderChatReplyPreview();
}
function closeChatReactionPicker() {
  if(chatReactionPicker){
    chatReactionPicker.remove();
    chatReactionPicker=null;
  }
}
async function toggleChatReaction(messageId,emoji='❤️') {
  if(!activeChatId||!messageId)return;
  try{
    const data=await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(messageId)}/reactions`,{
      method:'POST',
      body:JSON.stringify({emoji})
    });
    const idx=activeChatMessages.findIndex(message=>message.id===messageId);
    if(idx>=0&&data.message) activeChatMessages[idx]=data.message;
    renderChatMessages({stickBottom:false});
  }catch(err){
    showToast(err.message || 'Could not add that reaction.');
  }
}
async function deleteChatMessage(messageId) {
  if(!activeChatId||!messageId)return;
  const message=activeChatMessages.find(item=>item.id===messageId);
  if(!message||message.author!==me?.tag||message.deleted)return;
  if(!confirm('Delete this message? Everyone in this conversation will see “Message deleted”.'))return;
  try{
    const data=await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(messageId)}`,{method:'DELETE'});
    const idx=activeChatMessages.findIndex(item=>item.id===messageId);
    if(idx>=0&&data.message)activeChatMessages[idx]=data.message;
    if(pendingChatReply?.id===messageId)clearPendingChatReply();
    renderChatMessages({stickBottom:false});
    await loadChats();
    showToast('Message deleted.');
  }catch(err){
    showToast(err.message || 'Could not delete that message.');
  }
}
async function copyChatMessage(message) {
  const value=String(message?.text || '').trim();
  if(!value){ showToast('There is no text to copy.'); return; }
  try{
    await navigator.clipboard.writeText(value);
    showToast('Message copied.');
  }catch{
    const area=document.createElement('textarea');
    area.value=value;
    area.style.position='fixed';
    area.style.opacity='0';
    document.body.appendChild(area);
    area.select();
    try{document.execCommand('copy');showToast('Message copied.');}
    catch{showToast('Could not copy that message.');}
    area.remove();
  }
}
async function editOwnChatMessage(message) {
  if(!message||message.author!==me?.tag||message.deleted)return;
  const current=String(message.text||'');
  const next=prompt('Edit message',current);
  if(next===null)return;
  const value=String(next).trim();
  if(!value && !chatMessageImages(message).length && !message.audio){
    showToast('A message cannot be empty.');
    return;
  }
  try{
    const data=await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(message.id)}`,{
      method:'PATCH',
      body:JSON.stringify({text:value})
    });
    const idx=activeChatMessages.findIndex(item=>item.id===message.id);
    if(idx>=0&&data.message)activeChatMessages[idx]=data.message;
    renderChatMessages({stickBottom:false});
    await loadChats();
    showToast('Message edited.');
  }catch(err){
    showToast(err.message||'Could not edit that message.');
  }
}
function translateChatMessage(message) {
  const text=String(message?.text||'').trim();
  if(!text){showToast('There is no text to translate.');return;}
  const lang=String(navigator.language||'en').split('-')[0]||'en';
  const url=`https://translate.google.com/?sl=auto&tl=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}&op=translate`;
  window.open(url,'_blank','noopener,noreferrer');
}
async function togglePinChatMessage(message) {
  if(!activeChatId||!message||message.deleted)return;
  try{
    const data=await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(message.id)}/pin`,{
      method:'POST',
      body:JSON.stringify({pinned:!message.pinnedAt})
    });
    const idx=activeChatMessages.findIndex(item=>item.id===message.id);
    if(idx>=0&&data.message)activeChatMessages[idx]=data.message;
    renderChatMessages({stickBottom:false});
    showToast(message.pinnedAt?'Message unpinned.':'Message pinned.');
  }catch(err){
    showToast(err.message||'Could not update the pin.');
  }
}
async function forwardOwnChatMessage(message) {
  if(!message||message.author!==me?.tag)return;
  closeChatReactionPicker();
  await loadChats();
  const targets=chats.filter(chat=>chat.id!==activeChatId);
  if(!targets.length){showToast('There is no other conversation to forward this to.');return;}
  const overlay=document.createElement('div');
  overlay.className='chat-reaction-picker chat-forward-picker';
  overlay.innerHTML=`<section class="chat-forward-sheet" role="dialog" aria-modal="true" aria-label="Forward message">
    <header><strong>Forward message</strong><button type="button" data-close-forward aria-label="Close">×</button></header>
    <div class="chat-forward-list">${targets.map(chat=>`<button type="button" data-forward-chat="${escapeHtml(chat.id)}">${chatAvatarHtml(chat)}<span><strong>${escapeHtml(chat.name||'Conversation')}</strong><small>${chat.type==='group'?'Group chat':'Private message'}</small></span></button>`).join('')}</div>
  </section>`;
  document.body.appendChild(overlay);
  chatReactionPicker=overlay;
  const close=()=>closeChatReactionPicker();
  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
  overlay.querySelector('[data-close-forward]')?.addEventListener('click',close);
  overlay.querySelectorAll('[data-forward-chat]').forEach(button=>button.addEventListener('click',async()=>{
    const targetId=button.dataset.forwardChat;
    button.disabled=true;
    try{
      await api(`/api/chats/${encodeURIComponent(targetId)}/messages`,{
        method:'POST',
        body:JSON.stringify({
          text:message.text||'',
          images:chatMessageImages(message),
          audio:message.audio||'',
          replyTo:''
        })
      });
      close();
      await loadChats();
      showToast('Message forwarded.');
    }catch(err){
      button.disabled=false;
      showToast(err.message||'Could not forward that message.');
    }
  }));
}
function chatActionIcon(kind) {
  const icons={
    reply:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8 4 12l5 4"/><path d="M5 12h8a7 7 0 0 1 7 7"/></svg>',
    edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 7 3.5 3.5"/></svg>',
    forward:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 8 5 4-5 4"/><path d="M19 12h-8a7 7 0 0 0-7 7"/></svg>',
    copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    translate:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h8M8 3v2M6 7c1 3 3 5 6 6"/><path d="M5 13c2-1 4-3 6-6"/><path d="m14 20 3-7 3 7M15.5 17h3"/></svg>',
    pin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4 8 8"/><path d="m14 3 7 7-4 2-3 5-2-2-5 3-2-2 3-5-2-2 5-3 3-4Z"/><path d="m9 15-5 5"/></svg>',
    save:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
    delete:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>'
  };
  return icons[kind]||'';
}
function showChatReactionPicker(message,bubble,point=null) {
  if(!message||!bubble)return;
  const phone=isPhoneUI();
  closeChatReactionPicker();
  const images=chatMessageImages(message);
  const mine=message.author===me?.tag;
  const overlay=document.createElement('div');
  overlay.className=`chat-reaction-picker chat-message-menu-overlay${phone ? '' : ' desktop-chat-message-menu'}`;
  overlay.setAttribute('role','presentation');
  const hasText=Boolean(String(message.text||'').trim());
  const actions=[
    {id:'reply',label:'Reply',show:!message.deleted},
    {id:'edit',label:'Edit',show:mine&&!message.deleted&&hasText},
    {id:'forward',label:'Forward',show:mine&&!message.deleted},
    {id:'copy',label:'Copy',show:!message.deleted&&hasText},
    {id:'translate',label:'Translate',show:!message.deleted&&hasText},
    {id:'pin',label:message.pinnedAt?'Unpin':'Pin',show:!message.deleted},
    {id:'save',label:images.length>1?'Save photos':'Save image',show:!message.deleted&&images.length>0},
    {id:'delete',label:'Delete',show:mine&&!message.deleted,danger:true}
  ].filter(action=>action.show);
  overlay.innerHTML=`<div class="chat-message-menu-anchor">
    <div class="chat-message-reaction-bar" role="menu" aria-label="React to message">
      <small>React to message</small>
      <div>${['❤️','😂','😮','😢','😡','👍'].map(emoji=>`<button type="button" data-emoji="${emoji}" aria-label="React ${emoji}">${emoji}</button>`).join('')}</div>
    </div>
    <section class="chat-message-action-sheet" role="menu" aria-label="Message actions">
      <time>${escapeHtml(chatWhen(message.createdAt))}</time>
      ${actions.map(action=>`<button type="button" data-message-action="${action.id}" class="${action.danger?'danger':''}">${chatActionIcon(action.id)}<span>${escapeHtml(action.label)}</span></button>`).join('')}
    </section>
  </div>`;
  document.body.appendChild(overlay);
  chatReactionPicker=overlay;

  const rect=bubble.getBoundingClientRect();
  const anchor=overlay.querySelector('.chat-message-menu-anchor');
  const width=phone ? Math.min(370,window.innerWidth-20) : 330;
  anchor.style.width=`${width}px`;
  requestAnimationFrame(()=>{
    const h=anchor.offsetHeight||320;
    if (phone) {
      let top=rect.top-h*.42;
      top=Math.max(8,Math.min(window.innerHeight-h-8,top));
      anchor.style.top=`${top}px`;
      anchor.style.left=`${Math.max(10,window.innerWidth-width-10)}px`;
    } else {
      const x=Number(point?.x)||rect.right;
      const y=Number(point?.y)||rect.top;
      anchor.style.left=`${Math.max(10,Math.min(window.innerWidth-width-10,x))}px`;
      anchor.style.top=`${Math.max(10,Math.min(window.innerHeight-h-10,y))}px`;
    }
  });

  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)closeChatReactionPicker();});
  overlay.querySelectorAll('[data-emoji]').forEach(button=>button.addEventListener('click',async e=>{
    e.stopPropagation();
    const emoji=button.dataset.emoji;
    closeChatReactionPicker();
    await toggleChatReaction(message.id,emoji);
  }));
  overlay.querySelectorAll('[data-message-action]').forEach(button=>button.addEventListener('click',async e=>{
    e.stopPropagation();
    const action=button.dataset.messageAction;
    if(action==='reply'){
      closeChatReactionPicker();
      setPendingChatReply(message);
      return;
    }
    if(action==='edit'){
      closeChatReactionPicker();
      await editOwnChatMessage(message);
      return;
    }
    if(action==='forward'){
      await forwardOwnChatMessage(message);
      return;
    }
    if(action==='copy'){
      closeChatReactionPicker();
      await copyChatMessage(message);
      return;
    }
    if(action==='translate'){
      closeChatReactionPicker();
      translateChatMessage(message);
      return;
    }
    if(action==='pin'){
      closeChatReactionPicker();
      await togglePinChatMessage(message);
      return;
    }
    if(action==='save'){
      closeChatReactionPicker();
      await saveChatImages(message);
      return;
    }
    if(action==='delete'){
      closeChatReactionPicker();
      await deleteChatMessage(message.id);
    }
  }));
}
function wireChatMessageGestures(host) {
  if(!host)return;
  host.querySelectorAll('.chat-reaction-chip').forEach(button=>button.addEventListener('click',e=>{
    e.stopPropagation();
    const message=activeChatMessages.find(item=>item.id===button.dataset.messageId);
    if(message) openReactionViewer('Message reactions',message.reactions || [],{
      onSelfReaction:emoji=>toggleChatReaction(message.id,emoji)
    });
  }));
  if(!isPhoneUI()){
    host.querySelectorAll('.chat-bubble[data-message-id]').forEach(bubble=>{
      const message=activeChatMessages.find(item=>item.id===bubble.dataset.messageId);
      if(!message||message.deleted)return;
      bubble.addEventListener('contextmenu',e=>{
        if(e.target.closest('audio,button:not(.chat-message-image-button)'))return;
        e.preventDefault();
        showChatReactionPicker(message,bubble,{x:e.clientX,y:e.clientY});
      });
      bubble.addEventListener('dblclick',e=>{
        if(e.target.closest('audio,button:not(.chat-message-image-button)'))return;
        e.preventDefault();
        toggleChatReaction(message.id,'❤️');
      });
    });
    return;
  }

  host.querySelectorAll('.chat-bubble[data-message-id]').forEach(bubble=>{
    const message=activeChatMessages.find(item=>item.id===bubble.dataset.messageId);
    if(!message||message.deleted)return;
    let lastTap=0;
    let holdTimer=null;
    let startX=0,startY=0;
    let swiping=false,longPressed=false,cancelled=false,gestureActive=false;

    const indicator=bubble.closest('.chat-message')?.querySelector('.chat-swipe-reply-indicator');
    const resetTransform=()=>{
      bubble.style.transition='transform .16s ease';
      bubble.style.transform='';
      if(indicator){
        indicator.style.opacity='0';
        indicator.style.transform='scale(.72)';
      }
      setTimeout(()=>{bubble.style.transition='';},180);
    };

    bubble.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'||e.target.closest('audio,button:not(.chat-message-image-button)'))return;
      gestureActive=true;
      closeChatReactionPicker();
      startX=e.clientX;
      startY=e.clientY;
      swiping=false;
      longPressed=false;
      cancelled=false;
      if(indicator){
        indicator.style.left=`${Math.max(4,bubble.offsetLeft-39)}px`;
        indicator.style.opacity='0';
        indicator.style.transform='scale(.72)';
      }
      holdTimer=setTimeout(()=>{
        if(cancelled||swiping)return;
        longPressed=true;
        showChatReactionPicker(message,bubble);
      },360);
    });

    bubble.addEventListener('pointermove',e=>{
      if(e.pointerType==='mouse'||!gestureActive)return;
      const dx=e.clientX-startX;
      const dy=e.clientY-startY;
      if(Math.abs(dy)>18 && Math.abs(dy)>Math.abs(dx)*1.08){
        cancelled=true;
        clearTimeout(holdTimer);
        if(swiping)resetTransform();
        swiping=false;
        return;
      }
      if(dx>15 && Math.abs(dx)>Math.abs(dy)*1.12){
        swiping=true;
        cancelled=true;
        clearTimeout(holdTimer);
        const shift=Math.min(72,Math.max(0,dx));
        bubble.style.transition='none';
        bubble.style.transform=`translateX(${shift}px)`;
        if(indicator){
          const progress=Math.max(0,Math.min(1,(shift-10)/46));
          indicator.style.opacity=String(progress);
          indicator.style.transform=`scale(${0.72+progress*.28})`;
        }
      }else if(Math.hypot(dx,dy)>16){
        cancelled=true;
        clearTimeout(holdTimer);
      }
    });

    const finish=e=>{
      if(!gestureActive)return;
      gestureActive=false;
      clearTimeout(holdTimer);
      const dx=(e?.clientX ?? startX)-startX;
      if(swiping){
        resetTransform();
        if(dx>=56){
          setPendingChatReply(message);
          showToast('Replying to this message.');
        }
        swiping=false;
        return;
      }
      if(longPressed){
        longPressed=false;
        return;
      }
      if(cancelled)return;
      const now=Date.now();
      if(now-lastTap<390){
        lastTap=0;
        toggleChatReaction(message.id,'❤️');
      }else{
        lastTap=now;
      }
    };
    bubble.addEventListener('pointerup',finish);
    bubble.addEventListener('pointercancel',()=>{
      gestureActive=false;
      clearTimeout(holdTimer);
      if(swiping)resetTransform();
      swiping=false;
      cancelled=true;
    });
    bubble.addEventListener('contextmenu',e=>e.preventDefault());
  });
}
function renderChatMessages({stickBottom=true}={}) {
  const host = $('#chatMessages');
  if (!host) return;
  const previousTop=host.scrollTop;
  const previousHeight=host.scrollHeight;
  if (!activeChatMessages.length) {
    host.innerHTML = '<div class="chat-messages-empty"><span>♡</span><p>This conversation is just getting started.</p></div>';
    return;
  }
  host.innerHTML = activeChatMessages.map(message => {
    const mine = message.author === me?.tag;
    const profile = message.profile || {};
    const reply=message.replyTo;
    const images=chatMessageImages(message);
    const reactions=Array.isArray(message.reactions)?message.reactions:[];
    return `<article class="chat-message ${mine ? 'mine' : 'theirs'}" data-message-id="${escapeHtml(message.id || '')}">
      ${mine ? '' : `<button class="chat-message-author" type="button" data-profile-tag="${escapeHtml(message.author || '')}">${avatarHtml(profile,'chat-message-avatar')}</button>`}
      <span class="chat-swipe-reply-indicator" aria-hidden="true">↪</span>
      <div class="chat-bubble" data-message-id="${escapeHtml(message.id || '')}">
        ${!mine ? `<strong>${escapeHtml(profile.displayName || message.author || '')}</strong>` : ''}
        ${message.deleted
          ? '<p class="chat-message-deleted"><span>⊘</span> Message deleted</p>'
          : `${reply ? `<button type="button" class="chat-reply-quote" data-reply-target="${escapeHtml(reply.id || '')}"><small>↪ ${mine ? 'You replied to' : 'Replied to'} ${escapeHtml(reply.profile?.displayName || reply.author || 'message')}</small><span>${escapeHtml(chatReplySnippet(reply))}</span></button>` : ''}
             ${images.length ? (isPhoneUI()
               ? `<div class="chat-image-group chat-image-count-${Math.min(images.length,10)}" data-image-count="${images.length}">${images.map((src,index)=>`<button class="chat-message-image-button" type="button" data-chat-image="${escapeHtml(src)}" aria-label="View photo ${index+1} of ${images.length}"><img class="chat-message-image" src="${escapeHtml(src)}" alt="Chat photo ${index+1}" loading="lazy" /></button>`).join('')}</div>`
               : `<button class="chat-message-image-button" type="button" data-chat-image="${escapeHtml(images[0])}" aria-label="View photo"><img class="chat-message-image" src="${escapeHtml(images[0])}" alt="Chat photo" loading="lazy" /></button>`) : ''}
             ${chatVoiceHtml(message)}
             ${message.text ? `<p>${mentionTextHtml(message.text).replace(/\n/g,'<br>')}</p>` : ''}
             ${isPhoneUI() && message.pinnedAt ? '<span class="chat-message-pinned">📌 Pinned</span>' : ''}`}
        <time>${escapeHtml(chatWhen(message.createdAt))}${isPhoneUI() && message.editedAt ? ' · Edited' : ''}</time>
        ${!message.deleted && reactions.length ? `<div class="chat-reactions">${reactions.map(reaction=>`<button class="chat-reaction-chip ${reaction.reactedByMe?'mine':''}" type="button" data-message-id="${escapeHtml(message.id || '')}" data-emoji="${escapeHtml(reaction.emoji)}"><span>${escapeHtml(reaction.emoji)}</span><b>${reaction.count}</b></button>`).join('')}</div>` : ''}
      </div>
    </article>`;
  }).join('');
  wireProfileLinks(host);
  host.querySelectorAll('.chat-message-image-button').forEach(button=>button.addEventListener('click',e=>{
    e.stopPropagation();
    openChatImageViewer(button.dataset.chatImage);
  }));
  host.querySelectorAll('.chat-reply-quote[data-reply-target]').forEach(button=>button.addEventListener('click',e=>{
    e.stopPropagation();
    scrollChatToMessage(button.dataset.replyTarget);
  }));
  wireChatVoicePlayers(host);
  wireChatMessageGestures(host);
  requestAnimationFrame(() => {
    if(stickBottom) host.scrollTop=host.scrollHeight;
    else host.scrollTop=Math.max(0,previousTop+(host.scrollHeight-previousHeight));
  });
}
function renderPendingChatImage() {
  const host = $('#chatImagePreview');
  if (!host) return;
  if (!pendingChatFiles.length || !pendingChatPreviewUrls.length) {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }
  host.classList.remove('hidden');
  if(!isPhoneUI()){
    const file=pendingChatFiles[0];
    const url=pendingChatPreviewUrls[0] || '';
    host.innerHTML=`<div><img src="${escapeHtml(url)}" alt="Photo to send" /><button id="removeChatImageBtn" type="button" aria-label="Remove attached photo">×</button><span>${escapeHtml(file?.name || 'Photo')}</span></div>`;
    $('#removeChatImageBtn')?.addEventListener('click',()=>clearPendingChatImage());
    return;
  }
  host.innerHTML = `<div class="chat-pending-image-grid" data-count="${pendingChatFiles.length}">
    ${pendingChatFiles.map((file,index)=>`<div class="chat-pending-image-item">
      <img src="${escapeHtml(pendingChatPreviewUrls[index]||'')}" alt="Photo ${index+1} to send" />
      <button type="button" data-remove-chat-image="${index}" aria-label="Remove photo ${index+1}">×</button>
      <span>${index+1}</span>
    </div>`).join('')}
    <small>${pendingChatFiles.length} / 10 selected</small>
  </div>`;
  host.querySelectorAll('[data-remove-chat-image]').forEach(button=>button.addEventListener('click',()=>{
    clearPendingChatImage(Number(button.dataset.removeChatImage));
  }));
}
function clearPendingChatImage(index = null) {
  if (Number.isInteger(index) && index >= 0 && index < pendingChatFiles.length) {
    const [url]=pendingChatPreviewUrls.splice(index,1);
    if(url)URL.revokeObjectURL(url);
    pendingChatFiles.splice(index,1);
  } else {
    pendingChatPreviewUrls.forEach(url=>{if(url)URL.revokeObjectURL(url);});
    pendingChatPreviewUrls=[];
    pendingChatFiles=[];
  }
  if ($('#chatPhotoInput')) $('#chatPhotoInput').value = '';
  if ($('#chatCameraInput')) $('#chatCameraInput').value = '';
  renderPendingChatImage();
}
function renderPendingChatAudio() {
  const host=$('#chatAudioPreview');
  if(!host)return;
  if(!pendingChatAudioFile||!pendingChatAudioUrl){
    host.classList.add('hidden');
    host.innerHTML='';
    return;
  }
  host.classList.remove('hidden');
  host.innerHTML=`<div class="pending-voice-pill">
    <button id="pendingVoicePlayBtn" type="button" aria-label="Play recorded voice"><span>▶</span></button>
    <div class="pending-voice-wave">${chatVoiceBars()}</div>
    <span id="pendingVoiceDuration">0:00</span>
    <button id="removeChatAudioBtn" type="button" aria-label="Remove voice message">×</button>
    <audio preload="metadata" src="${escapeHtml(pendingChatAudioUrl)}"></audio>
  </div>`;
  const audio=host.querySelector('audio');
  const play=$('#pendingVoicePlayBtn');
  const duration=$('#pendingVoiceDuration');
  const bars=[...host.querySelectorAll('.pending-voice-wave i')];
  const paint=()=>{
    const total=Number(audio?.duration)||0;
    const ratio=total?Math.max(0,Math.min(1,(Number(audio?.currentTime)||0)/total)):0;
    bars.forEach((bar,index)=>bar.classList.toggle('played',(index+1)/bars.length<=ratio));
    if(duration)duration.textContent=formatAudioTime(audio?.paused ? total : audio?.currentTime);
    if(play?.querySelector('span'))play.querySelector('span').textContent=audio?.paused?'▶':'Ⅱ';
  };
  audio?.addEventListener('loadedmetadata',paint);
  audio?.addEventListener('timeupdate',paint);
  audio?.addEventListener('pause',paint);
  audio?.addEventListener('play',paint);
  audio?.addEventListener('ended',()=>{audio.currentTime=0;paint();});
  play?.addEventListener('click',()=>{if(audio?.paused)audio.play().catch(()=>{});else audio?.pause();});
  $('#removeChatAudioBtn')?.addEventListener('click',clearPendingChatAudio);
}
function clearPendingChatAudio() {
  if(pendingChatAudioUrl)URL.revokeObjectURL(pendingChatAudioUrl);
  pendingChatAudioUrl='';
  pendingChatAudioFile=null;
  renderPendingChatAudio();
}
function stopChatMediaStream() {
  if(chatMediaStream){
    chatMediaStream.getTracks().forEach(track=>track.stop());
    chatMediaStream=null;
  }
}
function stopChatAudioVisualizer() {
  if(chatAudioAnimationFrame)cancelAnimationFrame(chatAudioAnimationFrame);
  chatAudioAnimationFrame=null;
  clearInterval(chatRecordTicker);
  chatRecordTicker=null;
  if(chatAudioContext){
    try{chatAudioContext.close();}catch{}
  }
  chatAudioContext=null;
  chatAudioAnalyser=null;
  $('#chatRecordingOverlay')?.classList.add('hidden');
  $('#chatRecordingOverlay')?.classList.remove('cancel-ready');
}
function startChatAudioVisualizer(stream,mode='tap') {
  const host=$('#chatRecordingOverlay');
  if(!host)return;
  host.classList.remove('hidden');
  host.classList.toggle('hold-recording',mode==='hold');
  host.innerHTML=`<div class="chat-live-recording">
    <button class="chat-record-trash" type="button" aria-label="Cancel voice recording">⌫</button>
    <div class="chat-record-live-pill">
      <span class="chat-record-status-dot"></span>
      <div class="chat-record-wave">${chatVoiceBars()}</div>
      <strong id="chatRecordTime">0:00</strong>
    </div>
    <small id="chatRecordHint">${mode==='hold'?'Slide left to cancel · release to send':'Tap microphone again to stop'}</small>
  </div>`;
  host.querySelector('.chat-record-trash')?.addEventListener('click',()=>stopChatAudioRecording({cancel:true}));
  const bars=[...host.querySelectorAll('.chat-record-wave i')];
  const updateTime=()=>{const el=$('#chatRecordTime');if(el)el.textContent=formatAudioTime((Date.now()-chatRecordingStartedAt)/1000);};
  updateTime();
  chatRecordTicker=setInterval(updateTime,250);
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(AudioCtx){
      chatAudioContext=new AudioCtx();
      const source=chatAudioContext.createMediaStreamSource(stream);
      chatAudioAnalyser=chatAudioContext.createAnalyser();
      chatAudioAnalyser.fftSize=64;
      source.connect(chatAudioAnalyser);
      const data=new Uint8Array(chatAudioAnalyser.frequencyBinCount);
      const draw=()=>{
        if(!chatAudioAnalyser)return;
        chatAudioAnalyser.getByteFrequencyData(data);
        bars.forEach((bar,index)=>{
          const value=data[Math.min(data.length-1,Math.floor(index*data.length/bars.length))]||0;
          bar.style.setProperty('--live',String(Math.max(.18,value/255)));
        });
        chatAudioAnimationFrame=requestAnimationFrame(draw);
      };
      draw();
    }
  }catch{}
}
async function sendChatVoiceFile(file) {
  if(!activeChatId||!file)return;
  const replyId=pendingChatReply?.id || '';
  try{
    const uploaded=await uploadAttachment(file);
    await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages`,{
      method:'POST',
      body:JSON.stringify({text:'',image:'',audio:uploaded.src || '',replyTo:replyId})
    });
    clearPendingChatReply();
    await loadChatMessages(activeChatId);
    await loadChats();
  }catch(err){
    pendingChatAudioFile=file;
    pendingChatAudioUrl=URL.createObjectURL(file);
    renderPendingChatAudio();
    showToast(err.message || 'Could not send that voice message.');
  }
}
async function startChatAudioRecording(mode='tap') {
  const button=$('#chatMicBtn');
  if(!button||!isPhoneUI())return false;
  if(chatMediaRecorder?.state==='recording')return true;
  if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){
    showToast('Voice recording is not supported by this browser.');
    return false;
  }
  chatRecordingMode=mode;
  chatRecordingDisposition=mode==='hold'?'send':'preview';
  try{
    clearPendingChatAudio();
    chatMediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
    const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported?.(type));
    chatAudioChunks=[];
    chatMediaRecorder=new MediaRecorder(chatMediaStream,preferred?{mimeType:preferred}:undefined);
    chatRecordingStartedAt=Date.now();
    chatMediaRecorder.addEventListener('dataavailable',event=>{if(event.data?.size)chatAudioChunks.push(event.data);});
    chatMediaRecorder.addEventListener('stop',async()=>{
      const recorder=chatMediaRecorder;
      const disposition=chatRecordingDisposition;
      const duration=Date.now()-chatRecordingStartedAt;
      const type=recorder?.mimeType || chatAudioChunks[0]?.type || 'audio/webm';
      const blob=new Blob(chatAudioChunks,{type});
      chatMediaRecorder=null;
      chatAudioChunks=[];
      stopChatMediaStream();
      stopChatAudioVisualizer();
      button.classList.remove('recording');
      if(disposition==='cancel')return;
      if(duration<400||!blob.size){
        showToast('Recording was too short.');
        return;
      }
      if(blob.size>8*1024*1024){
        showToast('Voice message is too large. Please record a shorter clip.');
        return;
      }
      const ext=type.includes('ogg')?'ogg':'webm';
      const file=new File([blob],`voice-${Date.now()}.${ext}`,{type,lastModified:Date.now()});
      if(disposition==='send') await sendChatVoiceFile(file);
      else{
        pendingChatAudioFile=file;
        pendingChatAudioUrl=URL.createObjectURL(file);
        renderPendingChatAudio();
      }
    });
    chatMediaRecorder.start(180);
    button.classList.add('recording');
    startChatAudioVisualizer(chatMediaStream,mode);
    if(mode==='hold' && !chatMicHoldActive){
      stopChatAudioRecording({send:chatRecordingDisposition!=='cancel',cancel:chatRecordingDisposition==='cancel'});
    }
    return true;
  }catch(err){
    stopChatMediaStream();
    stopChatAudioVisualizer();
    chatMediaRecorder=null;
    button.classList.remove('recording');
    showToast(err?.name==='NotAllowedError'?'Microphone permission was not granted.':'Could not start voice recording.');
    return false;
  }
}
function stopChatAudioRecording({send=false,cancel=false}={}) {
  if(cancel)chatRecordingDisposition='cancel';
  else if(send)chatRecordingDisposition='send';
  else chatRecordingDisposition='preview';
  if(chatMediaRecorder?.state==='recording'){
    try{chatMediaRecorder.stop();}catch{}
  }else{
    stopChatMediaStream();
    stopChatAudioVisualizer();
  }
}
async function toggleChatAudioRecording() {
  if(chatMediaRecorder?.state==='recording'){
    stopChatAudioRecording({send:false});
    return;
  }
  await startChatAudioRecording('tap');
}
function wireChatMicHold() {
  const mic=$('#chatMicBtn');
  if(!mic)return;
  mic.addEventListener('pointerdown',e=>{
    if(!isPhoneUI())return;
    chatMicPointerId=e.pointerId;
    if(chatMediaRecorder?.state==='recording'){
      chatMicHoldActive=false;
      return;
    }
    chatMicStartX=e.clientX;
    chatMicCancelled=false;
    chatMicHoldActive=false;
    clearTimeout(chatMicHoldTimer);
    try{mic.setPointerCapture(e.pointerId);}catch{}
    chatMicHoldTimer=setTimeout(async()=>{
      chatMicHoldActive=true;
      chatRecordingDisposition='send';
      await startChatAudioRecording('hold');
    },330);
  });
  mic.addEventListener('pointermove',e=>{
    if(e.pointerId!==chatMicPointerId||!chatMicHoldActive)return;
    const dx=e.clientX-chatMicStartX;
    chatMicCancelled=dx<-68;
    const overlay=$('#chatRecordingOverlay');
    overlay?.classList.toggle('cancel-ready',chatMicCancelled);
    const hint=$('#chatRecordHint');
    if(hint)hint.textContent=chatMicCancelled?'Release to cancel':'Slide left to cancel · release to send';
  });
  const finish=e=>{
    if(e.pointerId!==chatMicPointerId)return;
    clearTimeout(chatMicHoldTimer);
    const wasHold=chatMicHoldActive;
    chatMicHoldActive=false;
    chatMicPointerId=null;
    if(wasHold){
      chatRecordingDisposition=chatMicCancelled?'cancel':'send';
      stopChatAudioRecording({send:!chatMicCancelled,cancel:chatMicCancelled});
      return;
    }
    toggleChatAudioRecording();
  };
  mic.addEventListener('pointerup',finish);
  mic.addEventListener('pointercancel',e=>{
    if(e.pointerId!==chatMicPointerId)return;
    clearTimeout(chatMicHoldTimer);
    const wasHold=chatMicHoldActive;
    chatMicHoldActive=false;
    chatMicPointerId=null;
    if(wasHold)stopChatAudioRecording({cancel:true});
  });
  mic.addEventListener('contextmenu',e=>e.preventDefault());
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
  if(pendingChatReply){
    const latestReply=activeChatMessages.find(item=>item.id===pendingChatReply.id);
    if(!latestReply || latestReply.deleted) clearPendingChatReply();
    else pendingChatReply=latestReply;
  }
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
  if(activeChatId && activeChatId!==chatId){
    clearPendingChatReply();
    closeChatReactionPicker();
  }
  activeChatId = chatId;
  if (currentMode !== 'messages') showView('messages');
  messagesView?.classList.add('chat-open');
  syncMobileChatViewport();
  try {
    await loadChatMessages(chatId);
    recordPhoneHistory('messages',{chatId});
  }
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
  const previousMode = currentMode;
  currentMode = mode;
  if (isNativeScrapellaApp() && isPhoneUI() && previousMode !== mode) {
    requestAnimationFrame(() => {
      try { journalApp.scrollTo({ top:0, left:0, behavior:'auto' }); }
      catch { journalApp.scrollTop = 0; journalApp.scrollLeft = 0; }
    });
  }
  renderPersonalPrivacyQuick();
  if (isPhoneUI()) {
    renderMobileBookShelf();
    syncResponsiveChrome();
  }
  if (mode === 'book') setBookCoverOpen(true);
  homeView.classList.toggle('hidden', mode !== 'home');
  coverStage.classList.toggle('hidden', mode !== 'cover');
  bookView.classList.toggle('hidden', mode !== 'book');
  streamView.classList.toggle('hidden', mode !== 'stream');
  connectionsView.classList.toggle('hidden', mode !== 'connections');
  messagesView.classList.toggle('hidden', mode !== 'messages');
  personProfileView.classList.toggle('hidden', mode !== 'person');
  $('#homeModeBtn').classList.toggle('active', mode === 'home');
  $('#bookModeBtn').classList.toggle('active', mode === 'book' || (isPhoneUI() && mode === 'stream'));
  $('#streamModeBtn').classList.toggle('active', mode === 'stream');
  $('#connectionsModeBtn').classList.toggle('active', mode === 'connections' || mode === 'person');
  $('#messagesModeBtn').classList.toggle('active', mode === 'messages');
  recordPhoneHistory(mode);

  const noBook = !activeScrapbook;
  const noEntries = activeScrapbook && !entries.length;
  const canWrite = Boolean(activeScrapbook && activeScrapbook.canWrite !== false);
  $('#newEntryBtn').classList.toggle('hidden', mode === 'home' || mode === 'person' || mode === 'messages' || (Boolean(activeScrapbook) && !canWrite));
  const desktopWorkspaceVisible = !isPhoneUI() && mode === 'book';
  $('#desktopScrapbookBar')?.classList.toggle('hidden', !desktopWorkspaceVisible);
  $('#desktopNewMemoryBtn')?.classList.toggle('hidden', !desktopWorkspaceVisible || !canWrite);
  if (!isPhoneUI()) {
    if (mode === 'book') renderPersonalPrivacyQuick();
    else parkDesktopNewMemoryButton();
  }
  emptyState.classList.toggle('hidden', mode === 'home' || mode === 'cover' || mode === 'connections' || mode === 'person' || mode === 'messages' || (!noBook && !noEntries));
  const canEmptyDelete = Boolean(isPhoneUI() && noEntries && activeScrapbook && (activeScrapbook.isOwner === true || (activeScrapbook.type === 'group' && activeScrapbook.isGroupAdmin === true)));
  $('#emptyDeleteScrapbookBtn')?.classList.toggle('hidden', !canEmptyDelete);
  if ($('#emptyDeleteScrapbookBtn') && canEmptyDelete) $('#emptyDeleteScrapbookBtn').textContent = activeScrapbook.isOwner === true ? 'Delete scrapbook' : 'Request group deletion';

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
  const overrideQuery = activeScrapbook.overrideAccess || isOwnerOverrideBook(activeScrapbook.id) ? '&override=1' : '';
  const data = await api(`/api/entries?scrapbookId=${encodeURIComponent(activeScrapbook.id)}${overrideQuery}`);
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
  const overrideBookId = isOwnerOverrideBook(preferredBookId) ? preferredBookId : null;
  const meUrl = overrideBookId ? `/api/me?overrideBookId=${encodeURIComponent(overrideBookId)}` : '/api/me';
  const data = await api(meUrl);
  me = data.profile;
  const sessionAppearance = isNativeScrapellaApp() ? storedNativeAppearanceMode() : (me?.appearanceMode || 'light');
  me.appearanceMode = sessionAppearance;
  applyAppearanceMode(sessionAppearance);
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
  if (!mobileBookContextTag && me?.tag) mobileBookContextTag = me.tag;
  syncResponsiveChrome();
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
      italic:false,
      align:'left'
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
  return `<div class="canvas-item canvas-text-item${selected} ${canvasFontClass(item.font)}" data-canvas-id="${escapeHtml(item.id)}" style="${canvasItemStyle(item)};--edit-text-size:${size}px;text-align:${['left','center','right','justify'].includes(item.align)?item.align:'left'};${item.bold?'font-weight:700;':''}${item.italic?'font-style:italic;':''}">
    <button class="canvas-remove-item" type="button" title="Remove text box">×</button>
    <div class="canvas-text-content" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Type your memory here…" style="text-align:${['left','center','right','justify'].includes(item.align)?item.align:'left'}">${String(item.html || '')}</div>
    <div class="canvas-drag-handle" title="Drag text box">＋ Move</div>
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
  const align=item.align || 'left';
  [['canvasAlignLeftBtn','left'],['canvasAlignCenterBtn','center'],['canvasAlignRightBtn','right'],['canvasAlignJustifyBtn','justify']]
    .forEach(([id,value])=>$('#'+id)?.classList.toggle('active',align===value));
  positionCanvasInspectorMobile();
}
function addCanvasText() {
  const count=editingCanvasItems.filter(i=>i.type==='text').length;
  const item=clampCanvasItem({
    id:crypto.randomUUID?.() || `text-${Date.now()}-${Math.random()}`,
    type:'text',html:'',x:8,y:Math.min(70,8+count*8),w:70,h:18,
    z:maxCanvasZ()+1,font:'serif',size:18,bold:false,italic:false,align:'left'
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
  const face={
    serif:'Georgia',
    classic:'Times New Roman',
    elegant:'Palatino Linotype',
    sans:'Arial',
    rounded:'Verdana',
    casual:'Trebuchet MS',
    hand:'Segoe Print',
    script:'Brush Script MT',
    mono:'Courier New'
  }[value] || 'Georgia';
  if(!applyCanvasInline('fontName',face)){
    item.font=value;
    renderCanvasEditor();
  }
}
function canvasSelectionComputedSize() {
  const item=activeCanvasTextItem();
  if(!item)return 18;
  const range=canvasTextSelection() || savedCanvasTextRange;
  if(!range)return Number(item.size)||18;
  let node=range.startContainer;
  if(node?.nodeType===Node.TEXT_NODE) node=node.parentElement;
  if(!(node instanceof Element)) return Number(item.size)||18;
  const px=parseFloat(getComputedStyle(node).fontSize);
  return Number.isFinite(px) ? Math.max(7,Math.min(42,Math.round(px))) : (Number(item.size)||18);
}
function applyCanvasSelectionFontSize(size) {
  if(!restoreCanvasTextSelection())return false;
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.rangeCount)return false;
  const range=sel.getRangeAt(0);
  const item=activeCanvasTextItem();
  const content=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"] .canvas-text-content`);
  if(!content||!content.contains(range.commonAncestorContainer))return false;
  const fragment=range.extractContents();
  const span=document.createElement('span');
  span.style.fontSize=`${size}px`;
  span.appendChild(fragment);
  range.insertNode(span);
  const next=document.createRange();
  next.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(next);
  item.html=content.innerHTML.slice(0,50000);
  savedCanvasTextRange=next.cloneRange();
  return true;
}
function setCanvasTextSize(value) {
  const item=activeCanvasTextItem();if(!item)return;
  const size=Math.max(7,Math.min(42,Number(value)||18));
  const liveRange=canvasTextSelection();
  if(liveRange) savedCanvasTextRange=liveRange.cloneRange();
  if((liveRange || savedCanvasTextRange) && applyCanvasSelectionFontSize(size)){
    $('#canvasFontSizeValue').textContent=`${size}px selection`;
    return;
  }
  item.size=size;
  $('#canvasFontSizeValue').textContent=`${size}px`;
  const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"]`);
  el?.style.setProperty('--edit-text-size',`${size}px`);
}
function stepCanvasTextSize(delta) {
  const item=activeCanvasTextItem();
  if(!item)return;
  const hasSelection=Boolean(canvasTextSelection() || savedCanvasTextRange);
  const base=hasSelection ? canvasSelectionComputedSize() : (Number(item.size)||18);
  setCanvasTextSize(Math.max(7,Math.min(42,base+delta)));
}
function toggleCanvasTextStyle(kind) {
  const item=activeCanvasTextItem();if(!item)return;
  const command=kind==='bold'?'bold':'italic';
  if(applyCanvasInline(command)){renderCanvasEditor();return;}
  item[kind]=!item[kind];
  renderCanvasEditor();
}
function setCanvasTextAlign(value) {
  const item=activeCanvasTextItem(); if(!item)return;
  const align=['left','center','right','justify'].includes(value)?value:'left';
  item.align=align;
  const el=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(item.id)}"] .canvas-text-content`);
  if(el) el.style.textAlign=align;
  updateCanvasInspector();
}
function syncCanvasTextHeight(content,itemEl,item) {
  const canvas=$('#scrapCanvas');
  const canvasHeight=canvas.offsetHeight || canvasSizeMeta(editingCanvasSize).height;
  if(!canvasHeight)return;
  const needed=content.scrollHeight+18;
  const neededPct=needed/canvasHeight*100;
  if(neededPct>item.h){
    item.h=Math.min(96-item.y,Math.max(item.h,neededPct));
    itemEl.style.height=`${item.h}%`;
  }
}
function wireCanvasItems() {
  const canvas=$('#scrapCanvas');
  const rect=()=>canvas.getBoundingClientRect();

  const normalizeCanvasZ=()=>{
    if(maxCanvasZ()<990)return;
    [...editingCanvasItems]
      .sort((a,b)=>(Number(a.z)||0)-(Number(b.z)||0))
      .forEach((entry,index)=>{entry.z=index+1;});
  };

  canvas.querySelectorAll('.canvas-item').forEach(el=>{
    const id=el.dataset.canvasId;
    const item=editingCanvasItems.find(x=>x.id===id);
    if(!item)return;

    const bringItemFront=()=>{
      normalizeCanvasZ();
      selectedCanvasItemId=id;
      const max=maxCanvasZ();
      const anotherAtOrAbove=editingCanvasItems.some(other=>other.id!==id && (Number(other.z)||0)>=(Number(item.z)||0));
      if(anotherAtOrAbove || (Number(item.z)||0)<max) item.z=Math.min(999,max+1);
      el.style.zIndex=String(item.z);
      canvas.querySelectorAll('.canvas-item').forEach(node=>node.classList.toggle('selected',node===el));
      updateCanvasInspector();
    };

    if(item.type==='text'){
      el.addEventListener('pointerdown',bringItemFront,true);
    }

    el.addEventListener('pointerdown',e=>{
      if(e.target.closest('.canvas-remove-item,.canvas-resize-handle,.canvas-text-content'))return;
      if(item.type==='text'&&!e.target.closest('.canvas-drag-handle'))return;
      bringItemFront();
      const r=rect();
      const sx=e.clientX,sy=e.clientY,ox=item.x,oy=item.y;
      try{el.setPointerCapture(e.pointerId);}catch{}
      el.classList.add('dragging');
      const move=ev=>{
        if(canvasGesturePinching)return;
        const dx=(ev.clientX-sx)/r.width*100,dy=(ev.clientY-sy)/r.height*100;
        item.x=Math.max(0,Math.min(100-item.w,ox+dx));
        item.y=Math.max(0,Math.min(100-item.h,oy+dy));
        el.style.left=`${item.x}%`;
        el.style.top=`${item.y}%`;
      };
      const up=()=>{
        el.removeEventListener('pointermove',move);
        el.removeEventListener('pointerup',up);
        el.removeEventListener('pointercancel',up);
        el.classList.remove('dragging');
        renderCanvasEditor();
      };
      el.addEventListener('pointermove',move);
      el.addEventListener('pointerup',up);
      el.addEventListener('pointercancel',up);
      e.preventDefault();
    });

    el.addEventListener('click',()=>{
      bringItemFront();
    });

    el.querySelector('.canvas-remove-item')?.addEventListener('click',e=>{
      e.stopPropagation();
      editingCanvasItems=editingCanvasItems.filter(x=>x.id!==id);
      if(selectedCanvasItemId===id)selectedCanvasItemId=null;
      renderCanvasEditor();
    });

    const handle=el.querySelector('.canvas-resize-handle');
    handle?.addEventListener('pointerdown',e=>{
      e.stopPropagation();
      bringItemFront();
      const r=rect(),sx=e.clientX,sy=e.clientY,ow=item.w,oh=item.h;
      if(item.type==='photo' && !item.aspect){
        const img=el.querySelector('img');
        item.aspect=(img?.naturalWidth && img?.naturalHeight) ? img.naturalWidth/img.naturalHeight : 1;
      }
      try{handle.setPointerCapture(e.pointerId);}catch{}
      el.classList.add('resizing');
      const move=ev=>{
        if(canvasGesturePinching)return;
        const dw=(ev.clientX-sx)/r.width*100;
        const dh=(ev.clientY-sy)/r.height*100;
        if(item.type==='photo' && isPhoneUI()){
          const meta=canvasSizeMeta(editingCanvasSize);
          const aspect=Math.max(.15,Math.min(8,Number(item.aspect)||1));
          let nextW=ow+dw;
          if(Math.abs(dh)>Math.abs(dw)){
            const desiredH=oh+dh;
            nextW=desiredH*aspect*meta.height/meta.width;
          }
          nextW=Math.max(14,Math.min(100-item.x,nextW));
          const nextH=nextW*meta.width/(aspect*meta.height);
          item.w=nextW;
          item.h=Math.max(10,Math.min(100-item.y,nextH));
        }else{
          item.w=Math.max(item.type==='text'?18:14,Math.min(100-item.x,ow+dw));
          item.h=Math.max(item.type==='text'?8:10,Math.min(100-item.y,oh+dh));
        }
        el.style.width=`${item.w}%`;
        el.style.height=`${item.h}%`;
      };
      const up=()=>{
        handle.removeEventListener('pointermove',move);
        handle.removeEventListener('pointerup',up);
        handle.removeEventListener('pointercancel',up);
        el.classList.remove('resizing');
        renderCanvasEditor();
      };
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',up);
      handle.addEventListener('pointercancel',up);
      e.preventDefault();
    });

    const content=el.querySelector('.canvas-text-content');
    if(content){
      content.addEventListener('focus',bringItemFront);

      content.addEventListener('pointerdown',e=>{
        bringItemFront();
        if(!isPhoneUI() || e.pointerType==='mouse')return;

        const r=rect();
        const sx=e.clientX,sy=e.clientY,ox=item.x,oy=item.y;
        const pointerId=e.pointerId;
        let longDragging=false;
        let cancelled=false;

        const timer=setTimeout(()=>{
          if(cancelled)return;
          longDragging=true;
          content.dataset.longDragged='1';
          content.blur();
          savedCanvasTextRange=null;
          try{window.getSelection()?.removeAllRanges();}catch{}
          try{content.setPointerCapture(pointerId);}catch{}
          el.classList.add('dragging','long-dragging');
        },420);

        const move=ev=>{
          const travel=Math.hypot(ev.clientX-sx,ev.clientY-sy);
          if(!longDragging){
            if(travel>10){
              cancelled=true;
              clearTimeout(timer);
            }
            return;
          }
          const dx=(ev.clientX-sx)/r.width*100;
          const dy=(ev.clientY-sy)/r.height*100;
          item.x=Math.max(0,Math.min(100-item.w,ox+dx));
          item.y=Math.max(0,Math.min(100-item.h,oy+dy));
          el.style.left=`${item.x}%`;
          el.style.top=`${item.y}%`;
          ev.preventDefault();
        };

        const finish=()=>{
          cancelled=true;
          clearTimeout(timer);
          content.removeEventListener('pointermove',move);
          content.removeEventListener('pointerup',finish);
          content.removeEventListener('pointercancel',finish);
          if(longDragging){
            el.classList.remove('dragging','long-dragging');
            renderCanvasEditor();
            setTimeout(()=>{
              const current=$('#scrapCanvas').querySelector(`[data-canvas-id="${CSS.escape(id)}"] .canvas-text-content`);
              if(current)delete current.dataset.longDragged;
            },260);
          }
        };

        content.addEventListener('pointermove',move);
        content.addEventListener('pointerup',finish);
        content.addEventListener('pointercancel',finish);
      });

      content.addEventListener('click',e=>{
        if(content.dataset.longDragged==='1'){
          e.preventDefault();
          e.stopPropagation();
          content.blur();
        }
      });
      content.addEventListener('contextmenu',e=>{
        if(isPhoneUI())e.preventDefault();
      });
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
    if(inspector){
      inspector.style.top='';
      inspector.style.bottom='';
    }
    return;
  }
  const vv=window.visualViewport;
  const keyboardOpen=Boolean(vv && vv.height < window.innerHeight*.78);
  requestAnimationFrame(()=>{
    const h=inspector.offsetHeight||76;
    if(keyboardOpen){
      const top=vv?.offsetTop||0;
      const height=vv?.height||window.innerHeight;
      inspector.style.bottom='auto';
      inspector.style.top=`${Math.max(top+6,top+height-h-6)}px`;
    }else{
      inspector.style.top='auto';
      inspector.style.bottom='calc(8px + env(safe-area-inset-bottom))';
    }
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
async function compressImageForUpload(file) {
  if (!file || !String(file.type || '').startsWith('image/')) return file;
  if (file.type === 'image/gif') return file;
  if (file.size > 24 * 1024 * 1024) throw new Error(`${file.name} is too large to process.`);
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha:true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const toBlob = quality => new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    let blob = await toBlob(.82);
    if (blob && blob.size > 2.2 * 1024 * 1024) blob = await toBlob(.7);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.webp', { type:'image/webp', lastModified:Date.now() });
  } catch {
    return file;
  }
}
async function uploadImage(file) {
  const compressed = await compressImageForUpload(file);
  if (compressed.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB after compression.`);
  const dataUrl = await fileToDataUrl(compressed);
  return api('/api/upload', { method:'POST', body:JSON.stringify({ dataUrl, name:compressed.name || file.name }) });
}
async function uploadAttachment(file) {
  if (!file) throw new Error('No attachment selected.');
  if (String(file.type || '').startsWith('image/')) return uploadImage(file);
  if (!String(file.type || '').startsWith('audio/')) throw new Error('Unsupported attachment type.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Voice messages must be 8 MB or smaller.');
  const dataUrl = await fileToDataUrl(file);
  return api('/api/upload', { method:'POST', body:JSON.stringify({ dataUrl, name:file.name || 'voice-message.webm' }) });
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

  // Native Scrapella uses the phone permission flow, not the browser
  // Notification/service-worker APIs. Keep the user's reminder preference
  // without showing browser-only errors inside Android/iOS.
  if (isNativeScrapellaApp()) {
    const data = await api('/api/push/settings', {
      method:'PUT',
      body:JSON.stringify({ enabled:Boolean(enabled), reminderTime, timezone })
    });
    if (me) me.notifications = data.settings;
    return data.settings;
  }

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
async function updateNotificationStatus() {
  const el = $('#notificationStatus');
  if (!el) return;

  if (isNativeScrapellaApp()) {
    const enabled = $('#dailyReminderEnabled')?.checked === true;
    const push = nativePlugin('PushNotifications');
    try {
      const status = push?.checkPermissions ? await permissionTimeout(push.checkPermissions(),3000) : null;
      if (status?.receive === 'denied') {
        el.textContent = 'Notifications are turned off for Scrapella in your phone settings.';
        return;
      }
      el.textContent = enabled
        ? 'Daily reminder is on. Scrapella uses your phone notification permission.'
        : 'Daily reminder is off.';
    } catch {
      el.textContent = enabled ? 'Daily reminder is on.' : 'Daily reminder is off.';
    }
    return;
  }

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
document.querySelectorAll('.password-visibility').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById(button.dataset.passwordTarget || '');
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  button.textContent = reveal ? 'Hide' : 'Show';
  button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
}));

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
  const password = $('#signupPassword').value;
  const confirmPassword = $('#signupPasswordConfirm').value;
  if (password !== confirmPassword) {
    $('#signupError').textContent = 'Passwords do not match. Please re-enter them.';
    $('#signupPasswordConfirm').focus();
    return;
  }
  try {
    await api('/api/signup', { method:'POST', body:JSON.stringify({ displayName:$('#signupName').value.trim(), tag:$('#signupTag').value.trim(), password }) });
    await enterApp();
  } catch (err) { $('#signupError').textContent = err.message; }
});
function finishSessionBootstrap(authenticated) {
  document.body.classList.remove('auth-pending');
  if (authenticated === true) {
    document.body.classList.remove('native-permission-open','brand-intro-active');
    $('#nativePermissionGate')?.classList.add('hidden');
  }
  $('#sessionSplash')?.classList.add('hidden');
  lockScreen.classList.toggle('hidden', authenticated === true);
  journalApp.classList.toggle('hidden', authenticated !== true);
}
async function enterApp() {
  await loadSession();
  finishSessionBootstrap(true);
  showView('home');
  initializePhoneHistory();
  connectLiveEvents();
  if (guideState.required) setTimeout(() => startGuide(true), 180);
  else maybeOpenReminderComposer();
}
$('#logoutBtn').addEventListener('click', async () => {
  disconnectLiveEvents();
  if (isNativeScrapellaApp()) rememberNativeAppearanceMode(document.documentElement.dataset.theme || me?.appearanceMode || 'light');
  await api('/api/logout', { method:'POST', body:'{}' }).catch(()=>{});
  localStorage.removeItem('activeScrapbookId');
  location.reload();
});
$('#brandButton').addEventListener('click', async () => {
  if (!isPhoneUI()) {
    await refreshAndShow('home');
    return;
  }
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
  try { await prepareMobileBookView(); }
  catch (err) { showToast(err.message || 'Could not open the selected scrapbook.'); }
});
$('#closeBookViewBtn').addEventListener('click', async () => {
  setBookCoverOpen(false);
  await refreshAndShow('cover');
});
$('#streamModeBtn').addEventListener('click', () => refreshAndShow('stream'));
$('#connectionsModeBtn').addEventListener('click', async () => {
  if (!isPhoneUI()) { await refreshAndShow('connections'); return; }
  const options = mobileBookOptions();
  const target = options.find(book => book.id === activeScrapbook?.id) || options[0] || null;
  if (target && target.id !== activeScrapbook?.id) await loadSession(target.id);
  showView('connections');
});
$('#messagesModeBtn').addEventListener('click', () => { closeMobileChat(); showView('messages'); });
$('#newEntryBtn').addEventListener('click', () => openEditor());
$('#desktopNewMemoryBtn')?.addEventListener('click', () => {
  if (isPhoneUI() || !activeScrapbook || activeScrapbook.canWrite === false) return;
  openEditor();
});
$('#desktopBookTitleBtn')?.addEventListener('click', async () => {
  if (isPhoneUI()) return;
  setBookCoverOpen(false);
  await refreshAndShow('cover');
});
$('#mobileNewMemoryBtn')?.addEventListener('click', () => {
  if (!isPhoneUI() || !activeScrapbook || activeScrapbook.canWrite === false) return;
  openEditor();
});
$('#mobileStreamBtn')?.addEventListener('click', () => {
  if (!isPhoneUI() || !activeScrapbook) return;
  showView('stream');
});
$('#mobileDeleteScrapbookBtn')?.addEventListener('click', deleteActiveScrapbook);
$('#emptyDeleteScrapbookBtn')?.addEventListener('click', deleteActiveScrapbook);
$('#mobileLeaveScrapbookBtn')?.addEventListener('click', leaveActiveGroup);
$('#emptyAddBtn').addEventListener('click', () => activeScrapbook ? openEditor() : scrapbookDialog.showModal());
$('#closeEditorBtn').addEventListener('click', closeEditor);
$('#cancelEditorBtn').addEventListener('click', closeEditor);

$('#scrapbookPicker').addEventListener('change', async e => {
  const selectedId = e.target.value || null;
  setBookCoverOpen(false);
  spreadIndex = 0;
  try {
    await loadSession(selectedId);
    if (isPhoneUI()) {
      setBookCoverOpen(true);
      renderMobileBookShelf();
      showView('book');
    } else {
      setBookCoverOpen(true);
      showView(activeScrapbook ? 'book' : 'cover');
    }
  } catch (err) {
    if (err.status === 401) location.reload();
    else showToast(err.message || 'Could not refresh that scrapbook.');
  }
});
$('#mobileBookBackBtn')?.addEventListener('click', async () => {
  if (!isPhoneUI() || !me?.tag) return;
  mobileBookContextTag = me.tag;
  viewedPersonData = viewedPersonData?.isSelf ? viewedPersonData : null;
  const options = mobileBookOptions();
  const target = options.find(book => book.id === activeScrapbook?.id) || options[0] || null;
  if (target && target.id !== activeScrapbook?.id) await loadSession(target.id);
  renderScrapbookPicker();
  renderMobileBookShelf();
  setBookCoverOpen(Boolean(activeScrapbook));
  showView('book');
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
    if (isPhoneUI() && type === 'personal') {
      mobileBookContextTag = me?.tag || null;
      await loadSession(data.scrapbook.id);
      setBookCoverOpen(true);
      showView('book');
      showToast('Personal scrapbook created.');
      setTimeout(() => openEditor(), 140);
    } else {
      await loadSession(data.scrapbook.id); showView('connections');
      showToast(type === 'personal' ? 'Personal scrapbook created.' : 'Scrapbook created. Invite someone by @tag.');
    }
  } catch (err) { $('#scrapbookError').textContent = err.message; }
});
async function deleteActiveScrapbook() {
  if (!isPhoneUI() || !activeScrapbook) return;
  const book = activeScrapbook;
  const canDelete = book.isOwner === true || (book.type === 'group' && book.isGroupAdmin === true);
  if (!canDelete) return;
  const delegatedAdmin = book.type === 'group' && book.isOwner !== true;
  const warning = delegatedAdmin
    ? `Request deletion of "${book.name}"? The group owner must approve before anything is removed.`
    : (book.type === 'personal'
      ? `Delete "${book.name}" and all of its memories? This cannot be undone.`
      : `Delete "${book.name}" for everyone and remove all of its memories and shared chat? This cannot be undone.`);
  if (!confirm(warning)) return;
  try {
    const result = await api(`/api/scrapbooks/${encodeURIComponent(book.id)}`, { method:'DELETE' });
    if (result.approvalRequired) {
      await loadSession(book.id);
      showToast('Deletion request sent to the group owner for approval.');
      renderMobileBookShelf();
      return;
    }
    localStorage.removeItem('activeScrapbookId');
    mobileBookContextTag = me?.tag || null;
    await loadSession(null);
    showToast('Scrapbook deleted.');
    showView(activeScrapbook ? 'book' : 'home');
  } catch (err) {
    showToast(err.message || 'Could not delete the scrapbook.');
  }
}
async function leaveActiveGroup() {
  if (!isPhoneUI() || !activeScrapbook || activeScrapbook.type !== 'group' || activeScrapbook.isOwner === true) return;
  const book = activeScrapbook;
  if (!confirm(`Leave "${book.name}"? You will lose access to its scrapbook and group chat, while memories you already posted remain preserved.`)) return;
  try {
    await api(`/api/scrapbooks/${encodeURIComponent(book.id)}/leave`, { method:'POST', body:'{}' });
    localStorage.removeItem('activeScrapbookId');
    mobileBookContextTag = me?.tag || null;
    await loadSession(null);
    showToast('You left the group.');
    showView(activeScrapbook ? 'book' : 'home');
  } catch (err) {
    showToast(err.message || 'Could not leave the group.');
  }
}
function hidePhoneInviteSuggestions() {
  const host = $('#inviteSuggestions');
  host?.classList.add('hidden');
  if (host) host.innerHTML = '';
}
async function sendScrapbookInvite(tag) {
  if (!activeScrapbook) return;
  const clean = String(tag || '').trim().replace(/^@/,'').toLowerCase();
  if (!clean) return;
  try {
    await api(`/api/scrapbooks/${activeScrapbook.id}/invite`, { method:'POST', body:JSON.stringify({ tag:clean }) });
    $('#inviteTag').value = '';
    hidePhoneInviteSuggestions();
    showToast(`Invitation sent to @${clean}.`);
  } catch (err) {
    showToast(err.message);
  }
}
$('#inviteForm').addEventListener('submit', async e => {
  e.preventDefault();
  await sendScrapbookInvite($('#inviteTag').value);
});
function renderPhoneInviteSuggestions(people = []) {
  if (!isPhoneUI()) return;
  const host = $('#inviteSuggestions');
  if (!host) return;
  const existing = new Set(activeScrapbook?.members || []);
  const filtered = people
    .filter(person => person?.tag && person.tag !== me?.tag && !existing.has(person.tag))
    .slice(0,8);
  if (!filtered.length) {
    host.innerHTML = '<p class="invite-suggestion-empty">No available matching profiles.</p>';
    host.classList.remove('hidden');
    return;
  }
  host.innerHTML = filtered.map(person => `<button class="invite-suggestion" type="button" data-tag="${escapeHtml(person.tag)}">
    ${avatarHtml(person,'mention-suggestion-avatar')}
    <span><strong>${escapeHtml(person.displayName || person.tag)}</strong><small>@${escapeHtml(person.tag)}</small></span>
  </button>`).join('');
  host.classList.remove('hidden');
  host.querySelectorAll('.invite-suggestion').forEach(btn => btn.addEventListener('pointerdown', async e => {
    e.preventDefault();
    await sendScrapbookInvite(btn.dataset.tag);
  }));
}
async function runPhoneInviteSearch(rawQuery = $('#inviteTag')?.value || '') {
  if (!isPhoneUI()) return;
  const query = String(rawQuery || '').trim();
  if (!query) return hidePhoneInviteSuggestions();
  const seq = ++mobileInviteSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== mobileInviteSearchSeq || !isPhoneUI()) return;
    renderPhoneInviteSuggestions(data.people || []);
  } catch {
    if (seq === mobileInviteSearchSeq) hidePhoneInviteSuggestions();
  }
}
$('#inviteTag').addEventListener('input', e => {
  if (!isPhoneUI()) return;
  clearTimeout(mobileInviteSearchTimer);
  const query = e.currentTarget.value.trim();
  if (!query) return hidePhoneInviteSuggestions();
  mobileInviteSearchTimer = setTimeout(() => runPhoneInviteSearch(query), 100);
});
$('#inviteTag').addEventListener('blur', () => {
  if (isPhoneUI()) setTimeout(hidePhoneInviteSuggestions, 180);
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
  const previous = normalizeAppearanceMode(me?.appearanceMode || document.documentElement.dataset.theme);
  const next = previous === 'night' ? 'light' : 'night';
  applyAppearanceMode(next);
  if (me) me.appearanceMode = next;

  if (isNativeScrapellaApp()) {
    rememberNativeAppearanceMode(next);
    return;
  }

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

$('#privateChatForm').addEventListener('submit', async e => {
  e.preventDefault();
  await startPrivateChat($('#privateChatTag').value);
});

function hideMobilePrivateChatSuggestions() {
  const host = $('#privateChatSuggestions');
  host?.classList.add('hidden');
  if (host) host.innerHTML = '';
}
function renderMobilePrivateChatSuggestions(people = []) {
  if (!isPhoneUI()) return;
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
    hideMobilePrivateChatSuggestions();
    await startPrivateChat(tag);
  }));
}
async function runMobilePrivateChatSearch(rawQuery = $('#privateChatTag')?.value || '') {
  if (!isPhoneUI()) return;
  const query = String(rawQuery || '').trim();
  if (!query) return hideMobilePrivateChatSuggestions();
  const seq = ++mobilePrivateChatSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== mobilePrivateChatSearchSeq || !isPhoneUI()) return;
    renderMobilePrivateChatSuggestions(data.people || []);
  } catch {
    if (seq === mobilePrivateChatSearchSeq) hideMobilePrivateChatSuggestions();
  }
}
$('#privateChatTag').addEventListener('input', e => {
  if (!isPhoneUI()) return;
  clearTimeout(mobilePrivateChatSearchTimer);
  const query = e.currentTarget.value.trim();
  if (!query) return hideMobilePrivateChatSuggestions();
  mobilePrivateChatSearchTimer = setTimeout(() => runMobilePrivateChatSearch(query), 100);
});
$('#privateChatTag').addEventListener('blur', () => {
  if (isPhoneUI()) setTimeout(hideMobilePrivateChatSuggestions, 160);
});
function validChatPhoto(file) {
  return Boolean(file && /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type) && file.size <= 16 * 1024 * 1024);
}
function setPendingChatPhotos(fileList,input,{append=false}={}) {
  const selected=[...(fileList || [])];
  if (!selected.length) {
    if(!append) clearPendingChatImage();
    return;
  }
  if(append && pendingChatFiles.length >= 10){
    if(input)input.value='';
    showToast('10 photos selected. Remove one before adding another.');
    return;
  }
  const valid=[];
  for(const file of selected){
    if(!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)){
      showToast('One of the selected files is not a supported photo.');
      continue;
    }
    if(file.size>16*1024*1024){
      showToast(`${file.name || 'A photo'} is too large to process.`);
      continue;
    }
    valid.push(file);
  }
  const existing=append ? [...pendingChatFiles] : [];
  const available=Math.max(0,10-existing.length);
  const accepted=valid.slice(0,available);
  if(valid.length>available) showToast(available ? `Only ${available} more photo${available===1?'':'s'} can be added.` : '10 photos selected. Remove one before adding another.');
  if(!append) clearPendingChatImage();
  if(append){
    pendingChatFiles=[...existing,...accepted];
    pendingChatPreviewUrls=[...pendingChatPreviewUrls,...accepted.map(file=>URL.createObjectURL(file))];
  }else{
    pendingChatFiles=accepted;
    pendingChatPreviewUrls=accepted.map(file=>URL.createObjectURL(file));
  }
  if(input)input.value='';
  renderPendingChatImage();
}
$('#chatPhotoInput').addEventListener('change',()=>setPendingChatPhotos($('#chatPhotoInput').files,$('#chatPhotoInput')));
$('#chatCameraInput')?.addEventListener('change',()=>setPendingChatPhotos($('#chatCameraInput').files,$('#chatCameraInput'),{append:true}));
$('#chatGalleryBtn')?.addEventListener('click',()=>{
  if(pendingChatFiles.length>=10){
    showToast('10 photos selected. Remove one before adding another.');
    return;
  }
  $('#chatPhotoInput')?.click();
});
wireChatMicHold();
async function uploadChatPhotoBatch(files,onProgress){
  const queue=[...(files || [])];
  if(!queue.length)return [];
  const results=new Array(queue.length);
  let nextIndex=0;
  let completed=0;
  const worker=async()=>{
    while(true){
      const index=nextIndex++;
      if(index>=queue.length)return;
      const uploaded=await uploadImage(queue[index]);
      results[index]=uploaded?.src || '';
      completed+=1;
      onProgress?.(completed,queue.length);
    }
  };
  const workerCount=Math.min(3,queue.length);
  await Promise.all(Array.from({length:workerCount},()=>worker()));
  return results.filter(Boolean);
}
$('#chatComposer').addEventListener('submit', async e => {
  e.preventDefault();
  if (!activeChatId) return;
  const text = $('#chatText').value.trim();
  if (!text && !pendingChatFiles.length && !pendingChatAudioFile) {
    showToast('Write a message or attach media.');
    return;
  }
  const sendBtn = $('#chatSendBtn');
  const helper=$('.chat-media-helper');
  const originalHelper=helper?.innerHTML || '';
  sendBtn.disabled = true;
  sendBtn.setAttribute('aria-busy','true');
  try {
    const filesToSend=[...pendingChatFiles].slice(0,10);
    if(filesToSend.length){
      if(helper)helper.textContent=`Preparing ${filesToSend.length} photo${filesToSend.length===1?'':'s'}…`;
      showToast(`Sending ${filesToSend.length} photo${filesToSend.length===1?'':'s'}…`);
    }
    const images = await uploadChatPhotoBatch(filesToSend,(done,total)=>{
      if(helper)helper.textContent=`Uploading photos ${done}/${total}…`;
      sendBtn.setAttribute('aria-label',`Sending photos ${done} of ${total}`);
    });
    let audio = '';
    if (pendingChatAudioFile) {
      if(helper)helper.textContent='Uploading voice message…';
      const uploaded = await uploadAttachment(pendingChatAudioFile);
      audio = uploaded.src || '';
    }
    if(filesToSend.length && images.length!==filesToSend.length) throw new Error('One or more photos could not be uploaded.');
    if(helper)helper.textContent='Sending message…';
    await api(`/api/chats/${encodeURIComponent(activeChatId)}/messages`, {
      method:'POST',
      body:JSON.stringify({ text, images, audio, replyTo:pendingChatReply?.id || '' })
    });
    $('#chatText').value = '';
    clearPendingChatImage();
    clearPendingChatAudio();
    if(chatMediaRecorder?.state==='recording')chatMediaRecorder.stop();
    stopChatMediaStream();
    clearPendingChatReply();
    await Promise.all([loadChatMessages(activeChatId),loadChats()]);
  } catch (err) {
    showToast(err.message || 'Could not send that message.');
  } finally {
    if(helper)helper.innerHTML=originalHelper;
    sendBtn.disabled = false;
    sendBtn.removeAttribute('aria-busy');
    sendBtn.setAttribute('aria-label','Send');
    $('#chatText').focus({ preventScroll:true });
  }
});
wireMentionAutocomplete($('#chatText'));
$('#chatText').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || isPhoneUI()) return;
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
document.addEventListener('pointerdown',e=>{
  if(chatReactionPicker && !e.target.closest('.chat-reaction-picker')) closeChatReactionPicker();
});
document.addEventListener('contextmenu',e=>{
  if(!isPhoneUI())return;
  e.preventDefault();
},{capture:true});
document.addEventListener('dragstart',e=>{
  if(isPhoneUI() && e.target.closest('img,a')) e.preventDefault();
},{capture:true});
document.addEventListener('pointerdown',e=>{
  if(commentReactionPicker && !e.target.closest('.comment-reaction-picker,.comment-react-trigger')) closeCommentReactionPicker();
});

$('#chatImageViewerClose')?.addEventListener('click',closeChatImageViewer);
$('#chatImageViewerSave')?.addEventListener('click',async e=>{
  e.stopPropagation();
  if(chatImageViewerSrc)await saveChatImage(chatImageViewerSrc,0);
});
$('#chatImageViewer')?.addEventListener('pointerdown',e=>{if(e.target===$('#chatImageViewer'))closeChatImageViewer();});
$('#profileImageViewerClose').addEventListener('click', closeProfileImageViewer);
document.addEventListener('keydown', e => {
  if(e.key!=='Escape')return;
  if(!$('#chatImageViewer')?.classList.contains('hidden')){
    e.preventDefault();
    closeChatImageViewer();
    return;
  }
  if (!$('#profileImageViewer').classList.contains('hidden')) {
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

function setPhoneMessageButtonVisual(phone) {
  const btn = $('#messagesModeBtn');
  const badge = $('#messagesBadge');
  if (!btn || !badge) return;
  if (phone) {
    btn.classList.add('phone-message-icon');
    btn.setAttribute('aria-label','Messages');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.7 2.3a1 1 0 0 0-1.05-.23L2.7 9.05a1 1 0 0 0 .08 1.89l7.42 2.47 2.47 7.42a1 1 0 0 0 1.89.08l6.97-17.95a1 1 0 0 0 .17-.66ZM5.95 10.08 18.4 5.24l-7.03 7.03-5.42-2.19Zm8 7.97-1.81-5.42 7.03-7.03-5.22 12.45Z"/></svg>';
    btn.appendChild(badge);
  } else {
    btn.classList.remove('phone-message-icon');
    btn.removeAttribute('aria-label');
    btn.innerHTML = 'Messages ';
    btn.appendChild(badge);
  }
  renderMessagesBadge();
}
function syncResponsiveChrome() {
  const phone = isPhoneUI();
  if($('#chatPhotoInput')) $('#chatPhotoInput').multiple = true;
  const toolbar = document.querySelector('.toolbar');
  const modeSwitch = document.querySelector('.mode-switch');
  const pickerWrap = document.querySelector('.scrapbook-picker-wrap');
  const mobileActions = $('#mobileHeaderActions');
  const mobileThemeSlot = $('#mobileThemeSlot');
  const mobileBookSlot = $('#mobileBookPickerSlot');
  const mobileBookShelf = $('#mobileBookShelf');
  const privacyQuick = $('#personalPrivacyQuick');
  const suggestions = $('#homeSuggestionsSection');
  const searchSection = document.querySelector('.home-search-section');
  const home = $('#homeView');

  if (phone) {
    if (!mobileBookContextTag && me?.tag) mobileBookContextTag = me.tag;
    [$('#createScrapbookBtn'), $('#profileBtn'), $('#messagesModeBtn'), $('#notificationWrap'), $('#guideBtn'), $('#logoutBtn')]
      .filter(Boolean).forEach(el => mobileActions?.appendChild(el));
    if ($('#themeModeBtn')) mobileThemeSlot?.appendChild($('#themeModeBtn'));
    if ($('#scrapbookPicker') && mobileBookSlot && $('#scrapbookPicker').parentNode !== mobileBookSlot) {
      mobileBookSlot.appendChild($('#scrapbookPicker'));
    }
    if (privacyQuick && mobileBookShelf && privacyQuick.parentNode !== mobileBookShelf) mobileBookShelf.appendChild(privacyQuick);
    if (suggestions && searchSection && suggestions.parentNode !== searchSection) searchSection.appendChild(suggestions);
    setPhoneMessageButtonVisual(true);
    if ($('#privateChatTag')) $('#privateChatTag').placeholder = 'Search';
  } else {
    const desktopPickerSlot = $('#desktopBookPickerSlot');
    if ($('#scrapbookPicker') && pickerWrap && $('#scrapbookPicker').parentNode !== pickerWrap) {
      pickerWrap.insertBefore($('#scrapbookPicker'), $('#createScrapbookBtn') || null);
    }
    if ($('#createScrapbookBtn') && pickerWrap) pickerWrap.appendChild($('#createScrapbookBtn'));
    if (pickerWrap && desktopPickerSlot && pickerWrap.parentNode !== desktopPickerSlot) {
      desktopPickerSlot.appendChild(pickerWrap);
    }
    if ($('#messagesModeBtn') && modeSwitch) modeSwitch.appendChild($('#messagesModeBtn'));
    if ($('#notificationWrap') && toolbar) toolbar.appendChild($('#notificationWrap'));
    if ($('#guideBtn') && toolbar) toolbar.appendChild($('#guideBtn'));
    if ($('#themeModeBtn') && toolbar) toolbar.appendChild($('#themeModeBtn'));
    if ($('#profileBtn') && toolbar) toolbar.appendChild($('#profileBtn'));
    if ($('#logoutBtn') && toolbar) toolbar.appendChild($('#logoutBtn'));
    if (suggestions && home && suggestions.parentNode !== home) home.appendChild(suggestions);
    parkDesktopNewMemoryButton();
    setPhoneMessageButtonVisual(false);
    if ($('#privateChatTag')) $('#privateChatTag').placeholder = 'Message @tag';
    hideMobilePrivateChatSuggestions();
    hidePhoneInviteSuggestions();
  }
  applyAppearanceMode(me?.appearanceMode || document.documentElement.dataset.theme || 'light');
  renderScrapbookPicker();
  renderMobileBookShelf();
  syncMobileChatViewport();
}

$('#profileBtn').addEventListener('click', () => {
  if (!me) return;
  syncResponsiveChrome();
  pendingProfileAvatar = me.avatar || '';
  $('#profileName').value = me.displayName || '';
  $('#profileTag').value = `@${me.tag}`;
  $('#profileTagStatus').textContent = 'You can change your @tag as long as nobody else is using it.';
  $('#profileTagStatus').classList.remove('tag-ok','tag-bad');
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
let profileTagAvailabilityTimer = null;
let profileTagAvailabilitySeq = 0;
$('#profileTag')?.addEventListener('input', e => {
  const input = e.currentTarget;
  const status = $('#profileTagStatus');
  const raw = String(input.value || '').trim();
  const clean = raw.replace(/^@/,'').toLowerCase();
  if (raw && !raw.startsWith('@')) input.value = '@' + raw.replace(/^@+/,'');
  clearTimeout(profileTagAvailabilityTimer);

  if (!clean || clean === me?.tag) {
    status.textContent = clean === me?.tag
      ? 'This is your current @tag.'
      : 'Tag must be 3–24 characters using letters, numbers, dot, dash or underscore.';
    status.classList.remove('tag-ok','tag-bad');
    return;
  }
  if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(clean)) {
    status.textContent = 'Tag must be 3–24 characters using letters, numbers, dot, dash or underscore.';
    status.classList.remove('tag-ok');
    status.classList.add('tag-bad');
    return;
  }
  const seq = ++profileTagAvailabilitySeq;
  status.textContent = 'Checking availability…';
  status.classList.remove('tag-ok','tag-bad');
  profileTagAvailabilityTimer = setTimeout(async () => {
    try {
      const result = await api(`/api/tag-availability?tag=${encodeURIComponent(clean)}`);
      if (seq !== profileTagAvailabilitySeq) return;
      status.textContent = result.available ? `@${clean} is available.` : `@${clean} is already taken.`;
      status.classList.toggle('tag-ok', result.available === true);
      status.classList.toggle('tag-bad', result.available !== true);
    } catch {
      if (seq === profileTagAvailabilitySeq) {
        status.textContent = 'Availability will be checked when you save.';
        status.classList.remove('tag-ok','tag-bad');
      }
    }
  }, 280);
});
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#profileError').textContent = '';
  try {
    const enabled = $('#dailyReminderEnabled').checked;
    const reminderTime = $('#dailyReminderTime').value || '20:00';
    const requestedTag = $('#profileTag').value.trim();
    const profileResult = await api('/api/profile', {
      method:'PUT',
      body:JSON.stringify({
        displayName:$('#profileName').value.trim(),
        tag:requestedTag,
        bio:$('#profileBio').value.trim(),
        avatar:pendingProfileAvatar
      })
    });
    if (profileResult?.profile?.tag) {
      const oldTag = me?.tag;
      me = { ...me, ...profileResult.profile };
      mobileBookContextTag = mobileBookContextTag === oldTag ? me.tag : mobileBookContextTag;
    }
    await saveReminderSettings(enabled, reminderTime);
    await loadSession(activeScrapbook?.id);
    if (profileResult?.tagChanged) {
      disconnectLiveEvents();
      connectLiveEvents();
      showToast(`Your @tag is now @${me.tag}.`);
    }
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
$('#mobilePrevBtn')?.addEventListener('click', () => turn('prev'));
$('#mobileNextBtn')?.addEventListener('click', () => turn('next'));
$('#mobileStreamBackBtn')?.addEventListener('click', () => {
  if (!isPhoneUI()) return;
  showView('book');
});
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
        type:'photo',src:uploaded.src,caption:'',aspect,
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
[['canvasAlignLeftBtn','left'],['canvasAlignCenterBtn','center'],['canvasAlignRightBtn','right'],['canvasAlignJustifyBtn','justify']]
  .forEach(([id,value])=>{
    $('#'+id)?.addEventListener('pointerdown',e=>{rememberCanvasTextSelection();e.preventDefault();});
    $('#'+id)?.addEventListener('click',()=>setCanvasTextAlign(value));
  });
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
    const bookId = activeScrapbook?.id || '';
    const result = await api(editingId ? `/api/entries/${editingId}` : '/api/entries', { method:editingId ? 'PUT' : 'POST', body:JSON.stringify(draft) });
    const wasEditing = Boolean(editingId);
    const savedId = result.entry?.id || editingId || null;

    if (isPhoneUI()) {
      closeEditor();
      await loadSession(bookId);
      const ordered = chronologicalEntries();
      const savedIndex = savedId ? ordered.findIndex(entry => entry.id === savedId) : -1;
      spreadIndex = savedIndex >= 0 ? savedIndex : Math.max(0, ordered.length - 1);
      setBookCoverOpen(true);
      showView('book');
      renderBook();
    } else {
      await refreshEntries();
      closeEditor();
      if (currentMode === 'cover') showView('book');
    }
    showToast(wasEditing ? 'Memory updated.' : 'Memory added to the scrapbook.');
  } catch (err) { $('#editorError').textContent = err.message; }
});
$('#deleteEntryBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Delete this memory from the scrapbook?')) return;
  try {
    await api(`/api/entries/${editingId}`, { method:'DELETE', body:'{}' });
    await refreshEntries(); closeEditor(); showToast('Memory deleted.'); showView(currentMode === 'stream' ? 'stream' : 'book');
  } catch (err) { $('#editorError').textContent = err.message; }
});

let nativeBackButtonInstalled = false;
async function installNativeBackButtonHandler() {
  if (nativeBackButtonInstalled || !isNativeScrapellaApp()) return;
  const appPlugin = nativePlugin('App');
  if (!appPlugin?.addListener) return;
  nativeBackButtonInstalled = true;
  try {
    await appPlugin.addListener('backButton', () => {
      if (!isPhoneUI()) return;
      const gate = $('#nativePermissionGate');
      if (gate && !gate.classList.contains('hidden')) {
        closeNativePermissionGate('skipped');
        return;
      }
      if (!me) return;
      if (closePhoneTransientLayer()) return;
      if (phoneHistoryReady) {
        history.back();
        return;
      }
      showView('home');
    });
  } catch {
    nativeBackButtonInstalled = false;
  }
}
installNativeBackButtonHandler();

window.addEventListener('popstate', async e => {
  if (!isPhoneUI() || !me || !phoneHistoryReady) return;

  if (closePhoneTransientLayer()) {
    history.pushState(phoneHistorySnapshot(currentMode),'',location.href);
    return;
  }

  const state = e.state;
  if (!state || state.journalPhoneRoot === true || state.journalPhone !== true) {
    restoringPhoneHistory = true;
    try {
      clearOpenPhoneChatState();
      mobileBookContextTag = me.tag;
      showView('home');
    } finally {
      restoringPhoneHistory = false;
    }
    history.pushState(phoneHistorySnapshot('home',{chatId:null,personTag:null,contextTag:me.tag}),'',location.href);
    return;
  }

  await restorePhoneHistoryState(state);
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
    document.title = 'Scrapella';
    $('#lockTitle').textContent = 'Scrapella';
    $('#lockSubtitle').textContent = config.subtitle || 'Every ordinary day deserves to be remembered.';
    try {
      await enterApp();
    } catch (err) {
      if (err.status === 401) {
        finishSessionBootstrap(false);
        return;
      }
      throw err;
    }
  } catch (err) {
    finishSessionBootstrap(false);
    $('#loginError').textContent = 'The scrapbook could not start. Please try again.';
    console.error(err);
  }
})();


let scrapbookPickerInteracting = false;
const scrapbookPickerEl = $('#scrapbookPicker');
scrapbookPickerEl?.addEventListener('pointerdown', () => { scrapbookPickerInteracting = true; });
scrapbookPickerEl?.addEventListener('focus', () => { scrapbookPickerInteracting = true; });
scrapbookPickerEl?.addEventListener('change', () => {
  window.setTimeout(() => { scrapbookPickerInteracting = false; }, 250);
});
scrapbookPickerEl?.addEventListener('blur', () => {
  window.setTimeout(() => { scrapbookPickerInteracting = false; }, 120);
});

window.addEventListener('resize', () => {
  // Android's native select briefly resizes the visual viewport while open.
  // Do not move/rebuild responsive chrome until the chooser is finished.
  if (!scrapbookPickerInteracting) syncResponsiveChrome();
  if (isPhoneUI()) {
    if (!scrapbookPickerInteracting) renderMobileBookShelf();
    if (currentMode === 'book') requestAnimationFrame(positionMobilePageArrows);
    if (me && !phoneHistoryReady) initializePhoneHistory();
  }
});
window.addEventListener('orientationchange', () => setTimeout(() => {
  if (!scrapbookPickerInteracting) syncResponsiveChrome();
}, 120));
syncResponsiveChrome();
