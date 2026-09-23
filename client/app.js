const $ = sel => document.querySelector(sel);
const lockScreen = $('#lockScreen');
const journalApp = $('#journalApp');
const coverStage = $('#coverStage');
const bookView = $('#bookView');
const streamView = $('#streamView');
const homeView = $('#homeView');
const memoryUniverseView = $('#memoryUniverseView');
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
let activeChatUnreadBoundaryAt = null;
let activeChatBoundaryChatId = null;
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
let chatPcmProcessor = null;
let chatPcmSilentGain = null;
let chatPcmChunks = [];
let chatPcmSampleRate = 0;
let nativeChatVoicePlayback = null;
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
let config = { title: 'Our Little Book of Us', subtitle: 'Every ordinary day deserves to be remembered.', nativePushEnabled:false };
let toastTimer;
let liveEventSource = null;
let realtimeEntryTimer = null;
let realtimeSocialTimer = null;
let realtimeChatTimer = null;
let presencePingTimer = null;
let presenceUiTimer = null;

const PHONE_UI_QUERY = '(max-width: 800px)';
let mobileBookContextTag = null;
let mobileBookShelfOnly = false;
let mobileBookBackToSelfAfterProfile = false;
let mobileHomeSearchTimer = null;
let mobileHomeSearchSeq = 0;
let desktopHomeSearchTimer = null;
let desktopHomeSearchSeq = 0;
let desktopDiscoverSearchTimer = null;
let desktopDiscoverSearchSeq = 0;
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

const NATIVE_PERMISSION_KEY = 'scrapella-native-permissions-v5';
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
async function checkMicrophonePermission({ request = false, verifyMedia = false } = {}) {
  const nativeMic = nativePlugin('MicrophonePermission');
  if (nativePlatform() === 'android' && nativeMic) {
    try {
      const result = request && nativeMic.request
        ? await permissionTimeout(nativeMic.request(),9000)
        : nativeMic.check
          ? await permissionTimeout(nativeMic.check(),4500)
          : null;
      const state = String(result?.microphone || '').toLowerCase();
      if (state === 'granted') {
        if (!verifyMedia) return 'granted';
      } else if (state === 'denied') {
        return 'denied';
      } else if (state === 'prompt' || state === 'prompt-with-rationale') {
        if (!request) return 'prompt';
      }
    } catch {}
  }

  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (Array.isArray(devices) && devices.some(device => device.kind === 'audioinput' && device.label)) {
      if (!verifyMedia) return 'granted';
    }
  } catch {}

  if (request || verifyMedia) {
    if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
    try {
      const stream = await permissionTimeout(navigator.mediaDevices.getUserMedia({ audio:true }),12000);
      stream?.getTracks?.().forEach(track => track.stop());
      return 'granted';
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') return 'denied';
      return 'error';
    }
  }

  try {
    if (navigator.permissions?.query) {
      const status = await permissionTimeout(navigator.permissions.query({ name:'microphone' }),3000);
      if (status?.state === 'granted') return 'granted';
      if (status?.state === 'prompt') return 'prompt';
      // Some Android WebViews report "denied" here even while the native
      // RECORD_AUDIO permission is already allowed, so do not treat it as
      // authoritative unless the native permission plugin also says denied.
    }
  } catch {}
  return 'unknown';
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
  setNativePermissionState('microphone','','Ready');

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
  try {
    const mic = await checkMicrophonePermission({ request:false });
    if (mic === 'granted') setNativePermissionState('microphone','granted','Allowed');
    else if (mic === 'denied') setNativePermissionState('microphone','denied','Not allowed');
    else setNativePermissionState('microphone','','Tap Continue to check');
  } catch {}
}
async function requestScrapellaNativePermissions() {
  if (!isNativeScrapellaApp()) return closeNativePermissionGate('web');
  const button = $('#nativePermissionsContinue');
  const statusText = $('#nativePermissionStatus');
  if (button) button.disabled = true;

  const push = nativePlugin('PushNotifications');
  const local = nativePlugin('LocalNotifications');
  const camera = nativePlugin('Camera');
  const platform = nativePlatform();

  try {
    setNativePermissionState('notifications','working','Waiting…');
    let pushResult = push?.checkPermissions ? await permissionTimeout(push.checkPermissions()) : null;
    let localResult = local?.checkPermissions ? await permissionTimeout(local.checkPermissions()) : null;
    if (push?.requestPermissions && (!pushResult || pushResult.receive === 'prompt' || pushResult.receive === 'prompt-with-rationale')) {
      pushResult = await permissionTimeout(push.requestPermissions());
    }
    if (local?.requestPermissions && (!localResult || localResult.display !== 'granted')) {
      localResult = await permissionTimeout(local.requestPermissions());
    }
    const allowed = pushResult?.receive === 'granted' || localResult?.display === 'granted';
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

  try {
    setNativePermissionState('microphone','working','Checking…');
    const mic = await checkMicrophonePermission({ request:true, verifyMedia:true });
    if (mic === 'granted') setNativePermissionState('microphone','granted','Allowed');
    else if (mic === 'unavailable') setNativePermissionState('microphone','denied','Unavailable');
    else setNativePermissionState('microphone','denied','Not allowed');
  } catch {
    setNativePermissionState('microphone','denied','Could not verify');
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

  if (statusText) statusText.textContent = 'Setup complete. You can review permissions anytime in Profile → App permissions.';
  try { localStorage.setItem(NATIVE_PERMISSION_KEY, 'done'); } catch {}
  window.setTimeout(() => closeNativePermissionGate('done'), 550);
  if (button) button.disabled = false;
}
$('#nativePermissionsContinue')?.addEventListener('click', requestScrapellaNativePermissions);
$('#nativePermissionsSkip')?.addEventListener('click', () => closeNativePermissionGate('skipped'));

function setProfilePermissionState(kind, state, label = '') {
  const ids = {
    notifications:'profilePermissionNotificationsStatus',
    camera:'profilePermissionCameraStatus',
    microphone:'profilePermissionMicrophoneStatus'
  };
  const el = document.getElementById(ids[kind] || '');
  const row = document.querySelector(`[data-profile-permission="${kind}"]`);
  if (row) {
    row.classList.remove('granted','denied','prompt','working');
    if (state) row.classList.add(state);
  }
  if (el) el.textContent = label || (
    state === 'granted' ? 'Allowed' :
    state === 'denied' ? 'Not allowed' :
    state === 'working' ? 'Checking…' :
    'Ready to check'
  );
}
async function checkProfilePermission(kind, { request = false } = {}) {
  setProfilePermissionState(kind,'working','Checking…');
  if (kind === 'notifications') {
    try {
      const push = nativePlugin('PushNotifications');
      const local = nativePlugin('LocalNotifications');
      if (push || local) {
        let pushResult = push?.checkPermissions ? await permissionTimeout(push.checkPermissions(),4500) : null;
        let localResult = local?.checkPermissions ? await permissionTimeout(local.checkPermissions(),4500) : null;
        if (request && push?.requestPermissions && pushResult?.receive !== 'granted') {
          pushResult = await permissionTimeout(push.requestPermissions(),9000);
        }
        if (request && local?.requestPermissions && localResult?.display !== 'granted') {
          localResult = await permissionTimeout(local.requestPermissions(),9000);
        }
        const granted = pushResult?.receive === 'granted' || localResult?.display === 'granted';
        const denied = pushResult?.receive === 'denied' && (!local || localResult?.display === 'denied');
        const state = granted ? 'granted' : denied ? 'denied' : 'prompt';
        const label = state === 'granted'
          ? (config.nativePushEnabled ? 'Allowed · background push ready' : 'Allowed · app alerts ready')
          : state === 'denied' ? 'Not allowed' : 'Tap to allow';
        setProfilePermissionState(kind,state,label);
        return state;
      }
      if ('Notification' in window) {
        let value = Notification.permission;
        if (request && value === 'default') value = await Notification.requestPermission();
        const state = value === 'granted' ? 'granted' : value === 'denied' ? 'denied' : 'prompt';
        setProfilePermissionState(kind,state,state === 'granted' ? 'Allowed' : state === 'denied' ? 'Not allowed' : 'Tap to allow');
        return state;
      }
    } catch {}
    setProfilePermissionState(kind,'prompt','Unavailable here');
    return 'unknown';
  }

  if (kind === 'camera') {
    try {
      const camera = nativePlugin('Camera');
      if (camera) {
        let result = camera.checkPermissions ? await permissionTimeout(camera.checkPermissions(),4500) : null;
        if (request && camera.requestPermissions && result?.camera !== 'granted') {
          result = await permissionTimeout(camera.requestPermissions({ permissions:['camera'] }),9000);
        }
        const state = result?.camera === 'granted' ? 'granted'
          : result?.camera === 'denied' ? 'denied'
          : 'prompt';
        setProfilePermissionState(kind,state,state === 'granted' ? 'Allowed' : state === 'denied' ? 'Not allowed' : 'Tap to allow');
        return state;
      }
      if (request && navigator.mediaDevices?.getUserMedia) {
        const stream = await permissionTimeout(navigator.mediaDevices.getUserMedia({ video:true }),12000);
        stream?.getTracks?.().forEach(track => track.stop());
        setProfilePermissionState(kind,'granted','Allowed');
        return 'granted';
      }
      if (navigator.permissions?.query) {
        const status = await permissionTimeout(navigator.permissions.query({ name:'camera' }),3000);
        const state = status?.state === 'granted' ? 'granted' : status?.state === 'denied' ? 'denied' : 'prompt';
        setProfilePermissionState(kind,state,state === 'granted' ? 'Allowed' : state === 'denied' ? 'Not allowed' : 'Tap to allow');
        return state;
      }
    } catch (err) {
      setProfilePermissionState(kind,'denied',err?.name === 'NotAllowedError' ? 'Not allowed' : 'Could not check');
      return 'denied';
    }
    setProfilePermissionState(kind,'prompt','Tap to check');
    return 'unknown';
  }

  if (kind === 'microphone') {
    const state = await checkMicrophonePermission({ request, verifyMedia:request });
    if (state === 'granted') setProfilePermissionState(kind,'granted','Allowed');
    else if (state === 'denied') setProfilePermissionState(kind,'denied','Not allowed');
    else if (state === 'unavailable') setProfilePermissionState(kind,'denied','Unavailable');
    else setProfilePermissionState(kind,'prompt',request ? 'Could not verify' : 'Tap to check');
    return state;
  }
}
async function refreshProfilePermissionSettings() {
  await Promise.allSettled([
    checkProfilePermission('notifications'),
    checkProfilePermission('camera'),
    checkProfilePermission('microphone')
  ]);
}
for (const [kind,id] of [
  ['notifications','profilePermissionNotificationsBtn'],
  ['camera','profilePermissionCameraBtn'],
  ['microphone','profilePermissionMicrophoneBtn']
]) {
  document.getElementById(id)?.addEventListener('click', async () => {
    const button = document.getElementById(id);
    if (button) button.disabled = true;
    try {
      const state = await checkProfilePermission(kind,{ request:true });
      if (state === 'granted') showToast(`${kind[0].toUpperCase()+kind.slice(1)} permission is allowed.`);
      else if (state === 'denied') showToast(`${kind[0].toUpperCase()+kind.slice(1)} permission is blocked. Enable it in phone App settings if needed.`);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

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
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hold = reduced ? 550 : (isPhoneUI() ? 1740 : 2000);
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
    const mode = ['home','cover','book','stream','universe','connections','messages','person'].includes(state?.mode) ? state.mode : 'home';
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

    if (mode === 'universe') {
      clearOpenPhoneChatState();
      await loadMemoryUniverse(state?.contextTag || me.tag,{override:false});
      showView('universe');
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

let phonePullStartY=null;
let phonePullDistance=0;
let phonePullRefreshing=false;
let phonePullScroller=null;
function nearestPhoneScroller(node){
  let el=node instanceof Element ? node : node?.parentElement;
  while(el && el!==document.body && el!==document.documentElement){
    const style=getComputedStyle(el);
    const overflowY=style.overflowY || '';
    if(/auto|scroll|overlay/.test(overflowY) && el.scrollHeight>el.clientHeight+2) return el;
    el=el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
function phoneAtScrollTop(scroller=phonePullScroller){
  const root=document.scrollingElement || document.documentElement;
  if(scroller && scroller!==root && scroller!==document.body && scroller!==document.documentElement){
    return Number(scroller.scrollTop||0)<=1;
  }
  return Number(root?.scrollTop||window.scrollY||0)<=1;
}
function phonePullIndicator(){
  let el=document.querySelector('.scrapella-pull-refresh');
  if(!el){
    el=document.createElement('div');
    el.className='scrapella-pull-refresh';
    el.innerHTML='<span>↻</span><b>Pull to refresh</b>';
    document.body.appendChild(el);
  }
  return el;
}
async function refreshNativePhoneContext(){
  if(phonePullRefreshing || !me?.tag)return;
  phonePullRefreshing=true;
  const indicator=phonePullIndicator();
  indicator.classList.add('refreshing','visible');
  indicator.style.setProperty('--pull','1');
  indicator.querySelector('b').textContent='Refreshing…';

  const mode=currentMode;
  const bookId=activeScrapbook?.id || null;
  const contextTag=mobileBookContextTag || me.tag;
  const personTag=mode==='person' ? (viewedPersonData?.profile?.tag || contextTag) : null;
  const personList=personListMode;
  const ownerOverrideTag=ownerOverrideTargetTag;
  const universeTag=universeTargetTag || contextTag || me.tag;
  const universeOverride=universeOwnerOverride;
  const shelfOnly=mobileBookShelfOnly;

  try{
    await loadSession(bookId);
    mobileBookContextTag=contextTag;
    mobileBookShelfOnly=shelfOnly;
    ownerOverrideTargetTag=ownerOverrideTag;

    if(mode==='universe'){
      await loadMemoryUniverse(universeTag,{override:universeOverride});
      mobileBookContextTag=contextTag;
      showView('universe');
    }else if(mode==='person' && personTag){
      await openPersonProfile(personTag,{preserveReturn:true,list:personList});
      mobileBookContextTag=contextTag;
    }else if(mode==='book' || mode==='stream' || mode==='cover'){
      renderScrapbookPicker();
      renderMobileBookShelf();
      setBookCoverOpen(mode!=='cover' && !shelfOnly);
      showView(mode);
    }else if(mode==='connections'){
      showView('connections');
    }else if(mode==='messages'){
      await loadChats().catch(()=>{});
      showView('messages');
    }else{
      showView('home');
    }

    indicator.querySelector('b').textContent='Updated';
  }catch(err){
    indicator.querySelector('b').textContent='Could not refresh';
    showToast(err?.message || 'Could not refresh Scrapella.');
  }finally{
    setTimeout(()=>{
      indicator.classList.remove('visible','refreshing');
      indicator.style.setProperty('--pull','0');
      phonePullRefreshing=false;
      phonePullScroller=null;
    },560);
  }
}
function phonePullReset(){
  phonePullStartY=null;
  phonePullDistance=0;
  phonePullScroller=null;
  const indicator=document.querySelector('.scrapella-pull-refresh');
  if(indicator && !phonePullRefreshing){
    indicator.classList.remove('visible');
    indicator.style.setProperty('--pull','0');
  }
}
document.addEventListener('touchstart',e=>{
  if(e.target.closest?.('.memory-constellation,.scrapella-select-menu,.chat-messages,.scrap-canvas-stage')){phonePullReset();return;}
  if(!isPhoneUI()||phonePullRefreshing||e.touches.length!==1){phonePullReset();return;}
  phonePullScroller=nearestPhoneScroller(e.target);
  if(!phoneAtScrollTop(phonePullScroller)){phonePullReset();return;}
  phonePullStartY=e.touches[0].clientY;
  phonePullDistance=0;
},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{
  if(phonePullStartY===null||e.touches.length!==1)return;
  if(!phoneAtScrollTop(phonePullScroller)){phonePullReset();return;}
  const delta=Math.max(0,e.touches[0].clientY-phonePullStartY);
  phonePullDistance=Math.min(130,delta);
  const indicator=phonePullIndicator();
  const progress=Math.min(1,phonePullDistance/72);
  indicator.classList.toggle('visible',phonePullDistance>8);
  indicator.style.setProperty('--pull',String(progress));
  indicator.querySelector('b').textContent=phonePullDistance>=72?'Release to refresh':'Pull to refresh';
},{passive:true,capture:true});
document.addEventListener('touchend',()=>{
  if(phonePullStartY===null)return;
  const shouldRefresh=phonePullDistance>=72 && phoneAtScrollTop(phonePullScroller);
  phonePullStartY=null;
  phonePullDistance=0;
  if(shouldRefresh)refreshNativePhoneContext();
  else phonePullReset();
},{passive:true,capture:true});
document.addEventListener('touchcancel',phonePullReset,{passive:true,capture:true});

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
  const backBtn=$('#mobileBookBackBtn');
  backBtn?.classList.toggle('hidden', !other);
  if(backBtn && other) backBtn.textContent=mobileBookShelfOnly ? '← My books' : `← ${profile.displayName || '@'+profile.tag}’s books`;
  $('#bookView')?.classList.toggle('mobile-books-only', Boolean(other && mobileBookShelfOnly));
  const context = $('#mobileBookContext');
  if (context) {
    context.innerHTML = `
      <div class="mobile-book-context-copy">
        <p class="eyebrow">${other ? 'VIEWING PROFILE' : 'YOUR SCRAPBOOK CIRCLE'}</p>
        <button class="mobile-book-context-person mobile-book-profile-link" type="button" data-profile-tag="${escapeHtml(profile.tag || me?.tag || '')}">
          ${avatarHtml(profile,'mobile-book-context-avatar')}
          <span><strong>${escapeHtml(other ? (profile.displayName || profile.tag) : (profile.displayName || 'My profile'))}</strong><small>${other ? '@' + escapeHtml(profile.tag || '') : '@' + escapeHtml(me?.tag || '') + ' · tap to view account'}</small></span>
        </button>
      </div>`;
    wireProfileLinks(context);
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
  if (target && (target.id !== activeScrapbook?.id || currentMode === 'universe' || entries.some(entry => entry.scrapbookId && entry.scrapbookId !== target.id))) {
    await loadSession(target.id);
    activeScrapbook = scrapbooks.find(book => book.id === target.id) || target;
    localStorage.setItem('activeScrapbookId', target.id);
  } else if (target && activeScrapbook?.id === target.id) {
    await refreshEntries();
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
    refreshScrapellaSelect(select);
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


let scrapellaSelectPortal=null;
let scrapellaSelectActive=null;
function closeScrapellaSelect(){
  scrapellaSelectPortal?.remove();
  scrapellaSelectPortal=null;
  if(scrapellaSelectActive?.button) scrapellaSelectActive.button.setAttribute('aria-expanded','false');
  scrapellaSelectActive=null;
}
function scrapellaSelectLabel(select){
  const option=select.options?.[select.selectedIndex] || [...(select.options||[])].find(opt=>opt.value===select.value);
  return option?.textContent?.trim() || select.getAttribute('aria-label') || 'Choose';
}
function refreshScrapellaSelect(select){
  const enhanced=select?._scrapellaSelect;
  if(!enhanced)return;
  enhanced.button.querySelector('strong').textContent=scrapellaSelectLabel(select);
  enhanced.button.disabled=select.disabled;
}
function positionScrapellaSelectPortal(button,portal){
  const rect=button.getBoundingClientRect();
  const width=Math.max(180,rect.width);
  portal.style.width=`${Math.min(width,window.innerWidth-16)}px`;
  portal.style.left=`${Math.max(8,Math.min(window.innerWidth-width-8,rect.left))}px`;
  portal.style.top=`${Math.min(window.innerHeight-12,rect.bottom+6)}px`;
  requestAnimationFrame(()=>{
    const ph=portal.offsetHeight||220;
    if(rect.bottom+6+ph>window.innerHeight-8){
      portal.style.top=`${Math.max(8,rect.top-ph-6)}px`;
    }
  });
}
function openScrapellaSelect(select){
  const enhanced=select?._scrapellaSelect;
  if(!enhanced || select.disabled)return;
  if(scrapellaSelectActive?.select===select){closeScrapellaSelect();return;}
  closeScrapellaSelect();
  refreshScrapellaSelect(select);
  const portal=document.createElement('div');
  portal.className='scrapella-select-menu';
  portal.setAttribute('role','listbox');
  portal.innerHTML=[...(select.options||[])].map((option,index)=>`
    <button type="button" role="option" data-option-index="${index}" aria-selected="${option.selected?'true':'false'}" class="${option.selected?'active':''}" ${option.disabled?'disabled':''}>
      <strong>${escapeHtml(option.textContent||'')}</strong>
    </button>`).join('');
  document.body.appendChild(portal);
  positionScrapellaSelectPortal(enhanced.button,portal);
  scrapellaSelectPortal=portal;
  scrapellaSelectActive={select,button:enhanced.button};
  enhanced.button.setAttribute('aria-expanded','true');
  portal.querySelectorAll('[data-option-index]').forEach(btn=>btn.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    const option=select.options[Number(btn.dataset.optionIndex)];
    if(!option || option.disabled)return;
    const changed=select.value!==option.value;
    select.value=option.value;
    refreshScrapellaSelect(select);
    closeScrapellaSelect();
    if(changed){
      select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }));
}
function enhanceScrapellaSelect(select){
  if(!select || select._scrapellaSelect || select.multiple || Number(select.size)>1)return;
  const wrapper=document.createElement('span');
  wrapper.className='scrapella-select-control';
  const button=document.createElement('button');
  button.type='button';
  button.className='scrapella-select-button';
  button.setAttribute('aria-haspopup','listbox');
  button.setAttribute('aria-expanded','false');
  button.innerHTML=`<strong>${escapeHtml(scrapellaSelectLabel(select))}</strong><b aria-hidden="true">⌄</b>`;
  select.parentNode.insertBefore(wrapper,select);
  wrapper.appendChild(select);
  wrapper.appendChild(button);
  select.classList.add('scrapella-native-select');
  select._scrapellaSelect={wrapper,button};
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openScrapellaSelect(select);});
  const parentLabel=wrapper.closest('label');
  parentLabel?.addEventListener('click',e=>{
    if(e.target.closest('.scrapella-select-button')) return;
    if(e.target===select) return;
    e.preventDefault();
    openScrapellaSelect(select);
  });
  button.addEventListener('keydown',e=>{
    if(['Enter',' ','ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openScrapellaSelect(select);}
    else if(e.key==='Escape')closeScrapellaSelect();
  });
  select.addEventListener('change',()=>refreshScrapellaSelect(select));
  refreshScrapellaSelect(select);
}
function enhanceAllScrapellaSelects(root=document){
  if(root?.matches?.('select')) enhanceScrapellaSelect(root);
  root?.querySelectorAll?.('select').forEach(enhanceScrapellaSelect);
}
document.addEventListener('click',e=>{
  if(scrapellaSelectPortal && !scrapellaSelectPortal.contains(e.target) && !scrapellaSelectActive?.button?.contains(e.target)) closeScrapellaSelect();
});
window.addEventListener('resize',()=>closeScrapellaSelect());
window.addEventListener('scroll',e=>{
  if(scrapellaSelectPortal && scrapellaSelectPortal.contains(e.target)) return;
  closeScrapellaSelect();
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeScrapellaSelect();});
const scrapellaSelectObserver=new MutationObserver(records=>{
  records.forEach(record=>record.addedNodes.forEach(node=>{
    if(node.nodeType===Node.ELEMENT_NODE) enhanceAllScrapellaSelects(node);
  }));
});
if(document.body){
  enhanceAllScrapellaSelects(document);
  scrapellaSelectObserver.observe(document.body,{childList:true,subtree:true});
}else{
  document.addEventListener('DOMContentLoaded',()=>{
    enhanceAllScrapellaSelects(document);
    scrapellaSelectObserver.observe(document.body,{childList:true,subtree:true});
  },{once:true});
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
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
      if (e.pointerType === 'mouse') stage.classList.add('mouse-panning');
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
    if (panState?.pointerId === e.pointerId) {
      panState = null;
      stage.classList.remove('mouse-panning');
    }
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
  const rotation=((Number(item.rotation)||0)%360+360)%360;
  return `left:${x}%;top:${y}%;width:${w}%;height:${h}%;z-index:${z};--item-rotation:${rotation}deg;--drag-x:0px;--drag-y:0px;transform:translate3d(var(--drag-x),var(--drag-y),0) rotate(var(--item-rotation))`;
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
  const tag=p.tag || entry.author || '';
  return `<button class="author-line profile-author-link" type="button" data-profile-tag="${escapeHtml(tag)}">${avatarHtml(p, 'tiny-avatar')}<span><strong>${escapeHtml(p.displayName || p.tag)}</strong> <small>@${escapeHtml(tag)}</small></span></button>`;
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
    ${(editable || isNativeScrapellaApp()) ? `<div class="page-actions">${editable ? `<button class="ghost edit-entry" data-id="${entry.id}">Edit this page</button>` : ''}${isNativeScrapellaApp() ? `<button class="ghost share-entry" data-id="${entry.id}" type="button" aria-label="Share this memory"><span aria-hidden="true">↗</span> Share</button>` : ''}</div>` : ''}
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
        ${((me && entry.author === me.tag) || isNativeScrapellaApp()) ? `<div class="page-actions">${me && entry.author === me.tag ? `<button class="ghost edit-entry" data-id="${entry.id}">Edit this memory</button>` : ''}${isNativeScrapellaApp() ? `<button class="ghost share-entry" data-id="${entry.id}" type="button" aria-label="Share this memory"><span aria-hidden="true">↗</span> Share</button>` : ''}</div>` : ''}
      </div>
    </article>`;
  }).join('');
  wireEntryButtons($('#timeline'));
}

function memoryShareUrl(entryId) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  if (activeScrapbook?.id) url.searchParams.set('book', activeScrapbook.id);
  if (entryId) url.searchParams.set('entry', entryId);
  return url.toString();
}
let html2CanvasLoader = null;
async function ensureMemoryCaptureLibrary() {
  if (typeof window.html2canvas === 'function') return window.html2canvas;
  if (!html2CanvasLoader) {
    html2CanvasLoader = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/html2canvas.min.js?v=1.4.1';
      script.async = true;
      script.onload = () => typeof window.html2canvas === 'function'
        ? resolve(window.html2canvas)
        : reject(new Error('Memory capture library did not load.'));
      script.onerror = () => reject(new Error('Could not load memory capture library.'));
      document.head.appendChild(script);
    }).catch(err => {
      html2CanvasLoader = null;
      throw err;
    });
  }
  return html2CanvasLoader;
}
async function waitForShareImages(root) {
  const images = [...(root?.querySelectorAll?.('img') || [])];
  await Promise.all(images.map(img => {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => resolve();
      img.addEventListener('load',done,{once:true});
      img.addEventListener('error',done,{once:true});
      setTimeout(done,3500);
    });
  }));
}
async function captureMemoryShareImage(entryId, sourceNode = null) {
  const html2canvas = await ensureMemoryCaptureLibrary();
  const source = sourceNode
    || document.querySelector(`.entry-page[data-entry-id="${CSS.escape(entryId)}"]`)
    || document.querySelector(`.timeline-item[data-entry-id="${CSS.escape(entryId)}"] .stream-card`);
  if (!source) throw new Error('Could not find this memory on screen.');

  const host = document.createElement('div');
  host.className = 'memory-share-render-host';
  const card = source.cloneNode(true);
  card.classList.add('memory-share-capture-card');
  card.querySelectorAll('.memory-comments,.page-actions,.comment-form,.comment-actions,.comment-reply-form').forEach(node => node.remove());
  card.querySelectorAll('button').forEach(button => {
    if (button.closest('.entry-meta')) button.setAttribute('tabindex','-1');
  });
  host.appendChild(card);
  document.body.appendChild(host);
  try {
    await waitForShareImages(card);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = await html2canvas(card,{
      backgroundColor:'#f7f0e5',
      scale:Math.min(2,Math.max(1,window.devicePixelRatio || 1)),
      useCORS:true,
      allowTaint:false,
      logging:false,
      imageTimeout:8000,
      removeContainer:true
    });
    const blob = await new Promise((resolve,reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not create the scrapbook image.')),'image/png',0.95);
    });
    return blob;
  } finally {
    host.remove();
  }
}
function blobToBase64(blob) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not prepare the image.'));
    reader.readAsDataURL(blob);
  });
}
async function shareMemory(entryId, sourceNode = null, button = null) {
  const entry = entries.find(item => item.id === entryId);
  if (!entry) return;
  const bookName = activeScrapbook?.name || 'Scrapella';
  const title = entry.title || 'A Scrapella memory';
  const url = memoryShareUrl(entry.id);
  const text = `${title} · ${bookName}\n${url}`;
  const originalLabel = button?.innerHTML || '';
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span aria-hidden="true">◌</span> Preparing…';
  }
  try {
    const blob = await captureMemoryShareImage(entry.id,sourceNode);
    const fileName = `scrapella-memory-${String(entry.id || Date.now()).replace(/[^a-z0-9_-]/gi,'-')}.png`;

    if (isNativeScrapellaApp()) {
      const sharePlugin = nativePlugin('Share');
      const filesystem = nativePlugin('Filesystem');
      if (sharePlugin?.share && filesystem?.writeFile) {
        const data = await blobToBase64(blob);
        const saved = await filesystem.writeFile({
          path:fileName,
          data,
          directory:'CACHE',
          recursive:true
        });
        let uri = saved?.uri || '';
        if (!uri && filesystem.getUri) {
          const located = await filesystem.getUri({ path:fileName, directory:'CACHE' });
          uri = located?.uri || '';
        }
        if (uri) {
          await sharePlugin.share({
            title,
            text,
            files:[uri],
            dialogTitle:'Share this scrapbook memory'
          });
          return;
        }
      }
    }

    const file = new File([blob],fileName,{ type:'image/png', lastModified:Date.now() });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files:[file] }))) {
      await navigator.share({ title, text, files:[file] });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl),1500);
    showToast('Scrapbook image saved. Share it to your Story from your photos.');
  } catch (err) {
    if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('cancel')) return;
    try {
      await navigator.clipboard?.writeText?.(url);
      showToast('Could not share the image, so the memory link was copied instead.');
    } catch {
      showToast(err?.message || 'Could not share this scrapbook memory.');
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  }
}
function wireEntryButtons(root) {
  root.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
  root.querySelectorAll('.share-entry').forEach(btn => btn.addEventListener('click', () => {
    const source = btn.closest('.entry-page,.stream-card');
    shareMemory(btn.dataset.id,source,btn);
  }));
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
async function sendPresencePing() {
  if (journalApp.classList.contains('hidden') || document.visibilityState === 'hidden') return;
  try { await api('/api/presence', { method:'POST', body:'{}' }); } catch {}
}
function refreshPresenceUi() {
  if (currentMode !== 'messages') return;
  renderChatList();
  const chat = activeChat();
  if (chat) {
    renderChatHeader(chat);
    renderChatMessages({stickBottom:false});
  }
}
function startPresenceHeartbeat() {
  clearInterval(presencePingTimer);
  clearInterval(presenceUiTimer);
  sendPresencePing();
  presencePingTimer = setInterval(sendPresencePing, 45000);
  presenceUiTimer = setInterval(refreshPresenceUi, 30000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !journalApp.classList.contains('hidden')) sendPresencePing();
});

function connectLiveEvents() {
  if (!('EventSource' in window) || journalApp.classList.contains('hidden')) return;
  if (liveEventSource) {
    try { liveEventSource.close(); } catch {}
  }
  const source = new EventSource('/api/events');
  liveEventSource = source;
  source.addEventListener('notification', e => {
    let payload={};
    try{payload=JSON.parse(e.data || '{}');}catch{}
    refreshNotificationCount();
    showNativeSocialNotification(payload).catch(()=>{});
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
  source.addEventListener('secret', () => {
    if (currentMode === 'universe' && universeLabMode === 'secret') renderUniverseSecretLab().catch(()=>{});
  });
  source.addEventListener('wall', () => {
    if (currentMode === 'universe' && universeLabMode === 'wall') renderUniverseFreedomWallLab().catch(()=>{});
  });
  source.addEventListener('presence', () => {
    loadChats().then(() => {
      const chat = activeChat();
      if (chat) {
        renderChatHeader(chat);
        renderChatMessages({stickBottom:false});
      }
    }).catch(() => {});
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
journalApp?.addEventListener('click',e=>{
  const img=e.target?.closest?.('img');
  if(!img || img.closest('#profileImageViewer') || img.classList.contains('brand-header-logo'))return;
  if(img.closest('[data-profile-tag],.avatar,.comment-author,.person-list-row,.mobile-book-profile-link,.universe-profile-link'))return;
  const src=img.currentSrc || img.src;
  if(!src)return;
  e.preventDefault();
  e.stopPropagation();
  openProfileImageViewer({avatar:src,displayName:img.alt || 'Photo'});
},true);
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
    ? '<button id="personMemoryUniverseBtn" class="primary" type="button">Memory Universe</button><button id="personEditOwnProfile" class="ghost" type="button">Edit my profile</button>'
    : `<button id="personMemoryUniverseBtn" class="ghost" type="button">Memory Universe</button><button class="primary person-message-btn" type="button">Message</button><button class="${data.isFollowing ? 'ghost' : 'primary'} person-follow-toggle" type="button">${data.isFollowing ? 'Following' : 'Follow'}</button>${data.overrideAvailable ? `<button id="personOverrideBtn" class="primary owner-override-btn ${data.overrideActive ? 'active' : ''}" type="button">${data.overrideActive ? 'Override active' : 'Override'}</button>` : ''}`;

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
  $('#personMemoryUniverseBtn')?.addEventListener('click',()=>openMemoryUniverse(p.tag));
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
  if (isPhoneUI() && mobileBookBackToSelfAfterProfile && me?.tag) {
    mobileBookBackToSelfAfterProfile=false;
    viewedPersonData=null;
    mobileBookContextTag=me.tag;
    await loadSession(null);
    await prepareMobileBookView();
    return;
  }
  if (isPhoneUI() && phoneHistoryReady) {
    phoneBackButton();
    return;
  }
  const mode = ['home','cover','book','stream','universe','connections','messages'].includes(personProfileReturnMode) ? personProfileReturnMode : 'connections';
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
async function runDesktopHomeSearch(rawQuery = $('#homeSearchInput')?.value || '') {
  if (isPhoneUI()) return;
  const query = String(rawQuery || '').trim();
  const host = $('#homeSearchResults');
  if (!query) {
    host?.classList.add('hidden');
    if (host) host.innerHTML = '';
    return;
  }
  const seq = ++desktopHomeSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== desktopHomeSearchSeq || isPhoneUI()) return;
    renderHomeSearchResults(data.people || []);
  } catch (err) {
    if (seq === desktopHomeSearchSeq) showToast(err.message || 'Could not search profiles.');
  }
}
$('#homeSearchInput').addEventListener('input', e => {
  const query = e.currentTarget.value.trim();
  if (isPhoneUI()) {
    clearTimeout(mobileHomeSearchTimer);
    if (!query) {
      $('#homeSearchResults')?.classList.add('hidden');
      if ($('#homeSearchResults')) $('#homeSearchResults').innerHTML = '';
      return;
    }
    mobileHomeSearchTimer = setTimeout(() => runMobileHomeSearch(query), 110);
    return;
  }
  clearTimeout(desktopHomeSearchTimer);
  if (!query) {
    $('#homeSearchResults')?.classList.add('hidden');
    if ($('#homeSearchResults')) $('#homeSearchResults').innerHTML = '';
    return;
  }
  desktopHomeSearchTimer = setTimeout(() => runDesktopHomeSearch(query), 120);
});

async function openHomeScrapbook(id, mode = 'book') {
  try {
    await loadSession(id);
    const book = scrapbooks.find(b => b.id === id);
    if (!book) {
      showToast('That scrapbook is no longer shared with you.');
      showView('home');
      return;
    }
    activeScrapbook = book;
    if (isPhoneUI()) {
      mobileBookContextTag = book.owner || me?.tag || null;
      mobileBookShelfOnly = false;
    }
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
function chatMessageTimestamp(value) {
  const d = new Date(value || '');
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour:'numeric', minute:'2-digit' }
    : { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(d);
}
function chatMessageSeenLabel(message) {
  if (!message || message.author !== me?.tag || message.deleted) return '';
  const count = Number(message.seenByCount) || 0;
  if (count < 1) return '';
  const chat = activeChat();
  if (chat?.type === 'group') return `Seen by ${count}`;
  return 'Seen';
}
function activeChat() {
  return chats.find(chat => chat.id === activeChatId) || null;
}
function chatPresenceDisplay(profile) {
  const presence = profile?.presence || {};
  const lastMs = Date.parse(presence.lastActiveAt || '') || 0;
  const age = lastMs ? Math.max(0, Date.now() - lastMs) : Infinity;
  if (presence.explicitOffline === true) return { state:'offline', label:'×', title:'Offline' };
  if (lastMs && age <= 90000) return { state:'active', label:'', title:'Active now' };
  if (lastMs && age <= 24 * 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.floor(age / 60000));
    const label = minutes < 60 ? `${minutes}m` : `${Math.max(1,Math.floor(minutes / 60))}h`;
    return { state:'away', label, title:`Away ${label}` };
  }
  return { state:'offline', label:'×', title:'Offline' };
}
function chatPresenceBadgeHtml(profile) {
  const status = chatPresenceDisplay(profile);
  return `<span class="chat-presence-badge ${status.state}" title="${escapeHtml(status.title)}" aria-label="${escapeHtml(status.title)}">${escapeHtml(status.label)}</span>`;
}
function chatMiniPresenceBadgeHtml(profile) {
  const status = chatPresenceDisplay(profile);
  const mark = status.state === 'offline' ? '×' : '';
  return `<span class="chat-mini-presence-badge ${status.state}" title="${escapeHtml(status.title)}" aria-label="${escapeHtml(status.title)}">${mark}</span>`;
}
function chatAvatarHtml(chat) {
  if (chat.type === 'private') {
    const profile = chat.otherProfile || {};
    return `<span class="chat-presence-avatar-wrap">${avatarHtml(profile, 'chat-list-avatar')}${chatPresenceBadgeHtml(profile)}</span>`;
  }
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
    <audio preload="metadata" data-chat-audio-src="${escapeHtml(message.audio)}" src="${escapeHtml(message.audio)}"></audio>
  </div>`;
}
async function hydrateProtectedChatAudio(audio) {
  if (!audio || audio.dataset.chatAudioHydrated === '1') return true;
  const source = String(audio.dataset.chatAudioSrc || audio.getAttribute('src') || '');
  if (!source) return false;
  try {
    // Android/iOS media pipelines can bypass the WebView cookie jar for a
    // protected <audio src>. Fetching with credentials first guarantees that
    // the authenticated chat attachment becomes a local blob URL.
    const response = await fetch(source,{credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw new Error(`Audio fetch failed (${response.status})`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Empty voice message');
    const previous = audio.dataset.chatAudioObjectUrl || '';
    if(isNativeScrapellaApp()){
      // A data URL keeps playback inside the WebView media context instead of
      // handing an authenticated URL/blob to Android's external media stack.
      let playableBlob=blob;
      if(!/audio\/(wav|wave|x-wav)/i.test(String(blob.type||''))){
        try{
          const converted=await normalizeVoiceRecordingForPlayback(blob);
          if(converted?.blob?.size)playableBlob=converted.blob;
        }catch{}
      }
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result||''));
        reader.onerror=()=>reject(reader.error||new Error('Could not prepare voice message.'));
        reader.readAsDataURL(playableBlob);
      });
      audio.dataset.chatAudioObjectUrl='';
      audio.dataset.chatAudioHydrated='1';
      audio.src=dataUrl;
      audio.load();
      if(previous)URL.revokeObjectURL(previous);
      return true;
    }
    const objectUrl = URL.createObjectURL(blob);
    audio.dataset.chatAudioObjectUrl = objectUrl;
    audio.dataset.chatAudioHydrated = '1';
    audio.src = objectUrl;
    audio.load();
    if (previous) URL.revokeObjectURL(previous);
    return true;
  } catch {
    // Keep the original URL as a fallback for browsers whose normal media
    // loader already handles authenticated range requests correctly.
    audio.dataset.chatAudioHydrated = 'fallback';
    audio.src = source;
    try { audio.load(); } catch {}
    return false;
  }
}
function stopNativeChatVoiceMessage({ reset = false } = {}) {
  const state=nativeChatVoicePlayback;
  nativeChatVoicePlayback=null;
  if(!state)return;
  if(state.raf)cancelAnimationFrame(state.raf);
  if(state.audio){
    try{state.audio.pause();}catch{}
    if(reset){
      try{state.audio.currentTime=0;}catch{}
    }
  }
  const nativeAudio=nativePlugin('NativeAudioPlayer');
  if(state.native && nativeAudio?.stop) nativeAudio.stop().catch(()=>{});
  try{state.source?.stop?.();}catch{}
  try{state.ctx?.close?.();}catch{}
  const player=state.player;
  if(player){
    player.classList.remove('playing');
    const play=player.querySelector('.chat-voice-play span');
    if(play)play.textContent='▶';
    if(reset){
      const bars=[...player.querySelectorAll('.chat-voice-wave i')];
      bars.forEach(bar=>bar.classList.remove('played'));
      const duration=player.querySelector('.chat-voice-duration');
      const total=Number(state.duration)||Number(state.buffer?.duration)||Number(state.audio?.duration)||0;
      if(duration)duration.textContent=formatAudioTime(total);
    }
  }
}
async function prepareNativeVoiceBlob(sourceUrl) {
  const response=await fetch(sourceUrl,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error(`Voice fetch failed (${response.status})`);
  let blob=await response.blob();
  if(!blob.size)throw new Error('Voice message is empty.');
  if(!/audio\/(wav|wave|x-wav)/i.test(String(blob.type||''))){
    try{
      const normalized=await normalizeVoiceRecordingForPlayback(blob);
      if(normalized?.blob?.size)blob=normalized.blob;
    }catch{}
  }
  return blob;
}
async function nativeVoiceFileUrl(blob, messageId='voice') {
  const filesystem=nativePlugin('Filesystem');
  if(!filesystem?.writeFile)return '';
  const type=String(blob?.type||'audio/wav').toLowerCase();
  const ext=type.includes('ogg')?'ogg':type.includes('mp4')?'m4a':type.includes('webm')?'webm':'wav';
  const safeId=String(messageId||Date.now()).replace(/[^a-z0-9_-]/gi,'-');
  const path=`chat-voice-${safeId}.${ext}`;
  const data=await blobToBase64(blob);
  const saved=await filesystem.writeFile({path,data,directory:'CACHE',recursive:true});
  let uri=String(saved?.uri||'');
  if(!uri&&filesystem.getUri){
    const located=await filesystem.getUri({path,directory:'CACHE'});
    uri=String(located?.uri||'');
  }
  if(!uri)return '';
  try{return window.Capacitor?.convertFileSrc?.(uri)||uri;}
  catch{return uri;}
}
async function playNativeChatVoiceMessage(player,audio) {
  if(!isNativeScrapellaApp()||!player||!audio)return false;
  if(nativeChatVoicePlayback?.player===player){
    stopNativeChatVoiceMessage();
    return true;
  }
  stopNativeChatVoiceMessage();
  const sourceUrl=String(audio.dataset.chatAudioSrc||audio.getAttribute('src')||'');
  if(!sourceUrl)return false;
  const playButton=player.querySelector('.chat-voice-play');
  const playIcon=playButton?.querySelector('span');
  const durationEl=player.querySelector('.chat-voice-duration');
  const bars=[...player.querySelectorAll('.chat-voice-wave i')];
  if(playButton)playButton.disabled=true;
  try{
    const nativeAudio=nativePlugin('NativeAudioPlayer');

    if(nativeAudio?.play){
      const absoluteUrl=new URL(sourceUrl,window.location.origin).href;
      const result=await nativeAudio.play({url:absoluteUrl});
      const duration=Math.max(.1,Number(result?.durationMs||0)/1000);
      const startedAt=performance.now();
      const state={player,audio,native:true,duration,startedAt,raf:0};
      nativeChatVoicePlayback=state;
      player.classList.add('playing');
      if(playIcon)playIcon.textContent='Ⅱ';
      const paint=()=>{
        if(nativeChatVoicePlayback!==state)return;
        const elapsed=Math.min(duration,Math.max(0,(performance.now()-startedAt)/1000));
        const ratio=duration?elapsed/duration:0;
        bars.forEach((bar,index)=>bar.classList.toggle('played',(index+1)/Math.max(1,bars.length)<=ratio));
        if(durationEl)durationEl.textContent=formatAudioTime(elapsed);
        if(elapsed>=duration){
          stopNativeChatVoiceMessage({reset:true});
          return;
        }
        state.raf=requestAnimationFrame(paint);
      };
      paint();
      return true;
    }

    // Fallback for iOS/current installs that do not yet contain the native player.
    // Android avoids materializing the whole recording in bridge memory.
    const blob=await prepareNativeVoiceBlob(sourceUrl);
    const localUrl=await nativeVoiceFileUrl(blob,player.dataset.messageId||Date.now());
    if(localUrl){
      audio.src=localUrl;
      audio.dataset.chatAudioHydrated='1';
      audio.load();
    }else{
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result||''));
        reader.onerror=()=>reject(reader.error||new Error('Could not prepare voice message.'));
        reader.readAsDataURL(blob);
      });
      audio.src=dataUrl;
      audio.dataset.chatAudioHydrated='1';
      audio.load();
    }
    await audio.play();
    const state={player,audio,native:false,duration:Number(audio.duration)||0,startedAt:performance.now(),raf:0};
    nativeChatVoicePlayback=state;
    player.classList.add('playing');
    if(playIcon)playIcon.textContent='Ⅱ';
    return true;
  }catch(err){
    console.warn('Native voice playback failed:',err?.message||err);
    stopNativeChatVoiceMessage();
    return false;
  }finally{
    if(playButton)playButton.disabled=false;
  }
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
    play.addEventListener('click',async e=>{
      e.stopPropagation();
      if(isNativeScrapellaApp()){
        const ok=await playNativeChatVoiceMessage(player,audio);
        if(!ok)showToast('Could not play that voice message.');
        return;
      }
      if(audio.paused){
        if(audio.dataset.chatAudioHydrated!=='1' && isPhoneUI()) {
          play.disabled=true;
          await hydrateProtectedChatAudio(audio);
          play.disabled=false;
        }
        try {
          await audio.play();
        } catch {
          audio.dataset.chatAudioHydrated='';
          const hydrated=await hydrateProtectedChatAudio(audio);
          if(hydrated){
            try { await audio.play(); return; } catch {}
          }
          showToast('Could not play that voice message.');
        }
      } else audio.pause();
    });
    wave.addEventListener('click',e=>{
      e.stopPropagation();
      if(!Number(audio.duration))return;
      const rect=wave.getBoundingClientRect();
      audio.currentTime=Math.max(0,Math.min(audio.duration,((e.clientX-rect.left)/rect.width)*audio.duration));
      paint();
    });
    if (!isNativeScrapellaApp() && isPhoneUI()) {
      hydrateProtectedChatAudio(audio).catch(()=>{});
    }
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
  const createdMs=Date.parse(message.createdAt||'')||0;
  const withinWindow=message.canEdit===true || (createdMs && Date.now() <= createdMs + (15*60*1000));
  if(!withinWindow){
    showToast('Messages can only be edited within 15 minutes of sending.');
    return;
  }
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
  const createdMs=Date.parse(message.createdAt||'')||0;
  const canEdit=Boolean(mine&&!message.deleted&&hasText&&(message.canEdit===true || (createdMs && Date.now() <= createdMs + (15*60*1000))));
  const actions=[
    {id:'reply',label:'Reply',show:!message.deleted},
    {id:'edit',label:'Edit',show:canEdit},
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

  const boundaryMs = Date.parse(activeChatUnreadBoundaryAt || '') || 0;
  let lastSeenInserted = false;
  host.innerHTML = activeChatMessages.map(message => {
    const mine = message.author === me?.tag;
    const profile = message.profile || {};
    const chat = activeChat();
    const liveProfile = chat?.type === 'group'
      ? (chat.members || []).find(member => member?.tag === message.author) || profile
      : profile;
    const reply=message.replyTo;
    const images=chatMessageImages(message);
    const reactions=Array.isArray(message.reactions)?message.reactions:[];
    const messageMs=Date.parse(message.createdAt||'')||0;
    const showLastSeen = !lastSeenInserted && boundaryMs > 0 && messageMs > boundaryMs;
    if (showLastSeen) lastSeenInserted = true;
    const seenLabel=chatMessageSeenLabel(message);
    const metaParts=[
      chatMessageTimestamp(message.createdAt),
      message.editedAt ? 'Edited' : '',
      seenLabel
    ].filter(Boolean);
    return `${showLastSeen ? '<div class="chat-last-seen-divider" role="separator"><span>Last seen</span></div>' : ''}<article class="chat-message ${mine ? 'mine' : 'theirs'}" data-message-id="${escapeHtml(message.id || '')}">
      ${mine ? '' : `<button class="chat-message-author" type="button" data-profile-tag="${escapeHtml(message.author || '')}"><span class="chat-message-avatar-wrap">${avatarHtml(liveProfile,'chat-message-avatar')}${chat?.type === 'group' ? chatMiniPresenceBadgeHtml(liveProfile) : ''}</span></button>`}
      <span class="chat-swipe-reply-indicator" aria-hidden="true">↪</span>
      <div class="chat-bubble" data-message-id="${escapeHtml(message.id || '')}">
        ${!mine ? `<strong>${escapeHtml(profile.displayName || message.author || '')}</strong>` : ''}
        ${message.deleted
          ? '<p class="chat-message-deleted"><span>⊘</span> Message deleted</p>'
          : `${reply ? `<button type="button" class="chat-reply-quote" data-reply-target="${escapeHtml(reply.id || '')}"><small>↪ ${mine ? 'You replied to' : 'Replied to'} ${escapeHtml(reply.profile?.displayName || reply.author || 'message')}</small><span>${escapeHtml(chatReplySnippet(reply))}</span></button>` : ''}
             ${images.length ? `<div class="chat-image-group chat-image-count-${Math.min(images.length,10)}" data-image-count="${images.length}">${images.map((src,index)=>`<button class="chat-message-image-button" type="button" data-chat-image="${escapeHtml(src)}" aria-label="View photo ${index+1} of ${images.length}"><img class="chat-message-image" src="${escapeHtml(src)}" alt="Chat photo ${index+1}" loading="lazy" /></button>`).join('')}</div>` : ''}
             ${chatVoiceHtml(message)}
             ${message.text ? `<p>${mentionTextHtml(message.text).replace(/\n/g,'<br>')}</p>` : ''}
             ${message.pinnedAt ? '<span class="chat-message-pinned">📌 Pinned</span>' : ''}`}
        <time class="chat-message-meta">${escapeHtml(metaParts.join(' · '))}</time>
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
  if(chatPcmProcessor){
    try{chatPcmProcessor.onaudioprocess=null;chatPcmProcessor.disconnect();}catch{}
  }
  if(chatPcmSilentGain){
    try{chatPcmSilentGain.disconnect();}catch{}
  }
  chatPcmProcessor=null;
  chatPcmSilentGain=null;
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
      chatAudioContext.resume?.().catch?.(()=>{});
      const source=chatAudioContext.createMediaStreamSource(stream);
      chatAudioAnalyser=chatAudioContext.createAnalyser();
      chatAudioAnalyser.fftSize=64;
      source.connect(chatAudioAnalyser);

      // Native Scrapella records a parallel PCM stream. MediaRecorder output
      // varies by Android/iOS WebView (WebM/Opus, OGG, MP4), and some devices
      // can record a codec that their own media player later refuses to play.
      // Capturing PCM here lets us always send a plain WAV voice message.
      if(isNativeScrapellaApp() && chatAudioContext.createScriptProcessor){
        chatPcmChunks=[];
        chatPcmSampleRate=chatAudioContext.sampleRate || 48000;
        chatPcmProcessor=chatAudioContext.createScriptProcessor(4096,1,1);
        chatPcmSilentGain=chatAudioContext.createGain();
        chatPcmSilentGain.gain.value=0;
        chatPcmProcessor.onaudioprocess=event=>{
          const input=event.inputBuffer?.getChannelData?.(0);
          if(input?.length)chatPcmChunks.push(new Float32Array(input));
        };
        source.connect(chatPcmProcessor);
        chatPcmProcessor.connect(chatPcmSilentGain);
        chatPcmSilentGain.connect(chatAudioContext.destination);
      }

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
function wavFromPcmChunks(chunks, inputRate = 48000, targetRate = 16000) {
  const usable=(chunks||[]).filter(chunk=>chunk?.length);
  if(!usable.length)return null;
  const total=usable.reduce((sum,chunk)=>sum+chunk.length,0);
  if(!total)return null;
  const source=new Float32Array(total);
  let cursor=0;
  for(const chunk of usable){source.set(chunk,cursor);cursor+=chunk.length;}
  const rate=Math.max(8000,Number(inputRate)||48000);
  const outRate=Math.min(rate,Math.max(8000,Number(targetRate)||16000));
  const frames=Math.max(1,Math.round(source.length*outRate/rate));
  const mono=new Float32Array(frames);
  for(let i=0;i<frames;i++){
    const pos=(i/Math.max(1,frames-1))*Math.max(0,source.length-1);
    const left=Math.floor(pos),right=Math.min(source.length-1,left+1),frac=pos-left;
    mono[i]=(source[left]||0)*(1-frac)+(source[right]||0)*frac;
  }
  const buffer=new ArrayBuffer(44+mono.length*2);
  const view=new DataView(buffer);
  const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+mono.length*2,true);write(8,'WAVE');
  write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,outRate,true);view.setUint32(28,outRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  write(36,'data');view.setUint32(40,mono.length*2,true);
  let offset=44;
  for(let i=0;i<mono.length;i++,offset+=2){
    const sample=Math.max(-1,Math.min(1,mono[i]));
    view.setInt16(offset,Math.round(sample<0?sample*0x8000:sample*0x7fff),true);
  }
  return new Blob([buffer],{type:'audio/wav'});
}

async function normalizeVoiceRecordingForPlayback(blob) {
  if (!blob?.size) return { blob, type:blob?.type || 'audio/webm', ext:'webm' };
  try {
    const AudioCtx=window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('No audio decoder');
    const ctx=new AudioCtx();
    const decoded=await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const targetRate=16000;
    const frames=Math.max(1,Math.round(decoded.duration*targetRate));
    const mono=new Float32Array(frames);
    const channels=Math.max(1,decoded.numberOfChannels);
    for(let i=0;i<frames;i++){
      const sourcePos=(i/Math.max(1,frames-1))*Math.max(0,decoded.length-1);
      const left=Math.floor(sourcePos),right=Math.min(decoded.length-1,left+1),frac=sourcePos-left;
      let sample=0;
      for(let ch=0;ch<channels;ch++){
        const data=decoded.getChannelData(ch);
        sample += (data[left]||0)*(1-frac)+(data[right]||0)*frac;
      }
      mono[i]=Math.max(-1,Math.min(1,sample/channels));
    }
    try{await ctx.close();}catch{}
    const buffer=new ArrayBuffer(44+mono.length*2);
    const view=new DataView(buffer);
    const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    write(0,'RIFF'); view.setUint32(4,36+mono.length*2,true); write(8,'WAVE');
    write(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
    view.setUint32(24,targetRate,true); view.setUint32(28,targetRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
    write(36,'data'); view.setUint32(40,mono.length*2,true);
    let offset=44;
    for(let i=0;i<mono.length;i++,offset+=2){
      const value=mono[i]<0?mono[i]*0x8000:mono[i]*0x7fff;
      view.setInt16(offset,Math.round(value),true);
    }
    return {blob:new Blob([buffer],{type:'audio/wav'}),type:'audio/wav',ext:'wav'};
  } catch {
    const type=blob.type || 'audio/webm';
    const ext=type.includes('ogg')?'ogg':type.includes('mp4')?'m4a':type.includes('wav')?'wav':'webm';
    return {blob,type,ext};
  }
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
  if(!button)return false;
  if(chatMediaRecorder?.state==='recording')return true;
  if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){
    showToast('Voice recording is not supported by this browser.');
    return false;
  }
  chatRecordingMode=mode;
  chatRecordingDisposition=mode==='hold'?'send':'preview';
  try{
    if (isNativeScrapellaApp()) {
      const permission = await checkMicrophonePermission({ request:true });
      if (permission === 'denied') {
        setProfilePermissionState('microphone','denied','Not allowed');
        showToast('Microphone access is blocked. Open Profile → App permissions and allow Microphone.');
        return false;
      }
    }
    clearPendingChatAudio();
    chatMediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
    setProfilePermissionState('microphone','granted','Allowed');
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
      const pcmChunks=chatPcmChunks;
      const pcmRate=chatPcmSampleRate;
      chatMediaRecorder=null;
      chatAudioChunks=[];
      chatPcmChunks=[];
      chatPcmSampleRate=0;
      stopChatMediaStream();
      stopChatAudioVisualizer();
      button.classList.remove('recording');
      if(disposition==='cancel')return;
      if(duration<400||(!blob.size&&!pcmChunks.length)){
        showToast('Recording was too short.');
        return;
      }
      if(blob.size>8*1024*1024&&!pcmChunks.length){
        showToast('Voice message is too large. Please record a shorter clip.');
        return;
      }
      const nativeWav=isNativeScrapellaApp()?wavFromPcmChunks(pcmChunks,pcmRate,16000):null;
      const normalized=nativeWav
        ? {blob:nativeWav,type:'audio/wav',ext:'wav'}
        : await normalizeVoiceRecordingForPlayback(blob);
      if(normalized.blob.size>8*1024*1024){
        showToast('Voice message is too large. Please record a shorter clip.');
        return;
      }
      const file=new File([normalized.blob],`voice-${Date.now()}.${normalized.ext}`,{type:normalized.type,lastModified:Date.now()});
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
  mic.addEventListener('click',e=>{
    if(isPhoneUI())return;
    e.preventDefault();
    toggleChatAudioRecording();
  });
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
  if (activeChatBoundaryChatId !== chatId) {
    activeChatBoundaryChatId = chatId;
    activeChatUnreadBoundaryAt = data.previousReadAt || null;
  }
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
    activeChatUnreadBoundaryAt = null;
    activeChatBoundaryChatId = null;
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
      if (payload.type === 'message' && payload.from !== me?.tag) {
        showNativeChatNotification(payload).catch(()=>{});
      }
      if (currentMode === 'messages' && activeChatId && payload.chatId === activeChatId && payload.from !== me?.tag) {
        await loadChatMessages(activeChatId);
      }
    } catch {}
  }, 120);
}

let universeSelectedEntryId = null;
let universeTargetTag = null;
let universeContextProfile = null;
let universeBooks = [];
let universeCanSeeExtended = true;
let universeOwnerOverride = false;
let universeOfficialState = {};
let universeStateSaveTimer = null;
let universeReplayTimer = null;
let universeReplayOverlay = null;
let universeConstellationYear = '';
let universeConstellationMonth = '';
let universeConstellationTarget = '';
function universeEntryImage(entry) {
  const canvasPhoto = (entry?.canvasItems || []).find(item => item?.type === 'photo' && item?.src);
  if (canvasPhoto?.src) return canvasPhoto.src;
  const photo = (entry?.photos || []).find(item => item?.src);
  return photo?.src || '';
}
function universeAuthor(entry) {
  return authorProfiles?.[entry?.author] || {
    tag:entry?.author || '',
    displayName:entry?.author || 'Someone',
    avatar:''
  };
}
function universeExcerpt(entry, max = 180) {
  const plain = String(entry?.text || '').replace(/\s+/g,' ').trim();
  if (!plain) return 'A visual memory saved in this scrapbook.';
  return plain.length > max ? plain.slice(0,max).trimEnd() + '…' : plain;
}
function universeDateLabel(value, options = {month:'short',day:'numeric',year:'numeric'}) {
  const d = new Date(String(value || '') + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? String(value || '') : new Intl.DateTimeFormat(undefined,options).format(d);
}
async function openUniverseMemory(entryId) {
  const entry=entries.find(item=>item.id===entryId);
  if(!entry)return;
  try{
    if(entry.scrapbookId && activeScrapbook?.id!==entry.scrapbookId) await loadSession(entry.scrapbookId);
    showView('stream');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      document.querySelector(`#timeline [data-entry-id="${CSS.escape(entryId)}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
    }));
  }catch(err){showToast(err?.message || 'Could not open that memory.');}
}
function renderMemoryUniverseDetail(entry) {
  const host = $('#memoryUniverseDetail');
  if (!host) return;
  if (!entry) {
    host.innerHTML = '<div class="universe-detail-empty"><span>✦</span><strong>Select a memory</strong><p>Its story, author, date, and relationship to this scrapbook will appear here.</p></div>';
    return;
  }
  universeSelectedEntryId = entry.id;
  const author = universeAuthor(entry);
  const image = universeEntryImage(entry);
  const comments = Array.isArray(entry.comments) ? entry.comments.length : 0;
  host.innerHTML = `<article class="universe-detail-card">
    ${image ? `<img class="universe-detail-image" src="${escapeHtml(image)}" alt="" />` : '<div class="universe-detail-image universe-detail-image-empty">✦</div>'}
    <div class="universe-detail-copy">
      <p class="eyebrow">${escapeHtml(universeDateLabel(entry.date))}</p>
      <h3>${escapeHtml(entry.title || 'Untitled memory')}</h3>
      <button class="universe-detail-author universe-profile-link" type="button" data-profile-tag="${escapeHtml(author.tag || '')}">${avatarHtml(author,'universe-detail-avatar')}<span><strong>${escapeHtml(author.displayName || author.tag || 'Someone')}</strong><small>@${escapeHtml(author.tag || '')}</small></span></button>
      <p>${escapeHtml(universeExcerpt(entry,240))}</p>
      <div class="universe-detail-meta"><span>${comments} ${comments === 1 ? 'comment' : 'comments'}</span><span>${image ? 'Visual memory' : 'Written memory'}</span></div>
      <div class="universe-detail-actions"><button class="primary universe-open-memory" type="button">Open memory</button><button class="ghost universe-replay-here" type="button">▶ Replay from here</button></div>
    </div>
  </article>`;
  host.querySelector('.universe-open-memory')?.addEventListener('click',()=>openUniverseMemory(entry.id));
  host.querySelector('.universe-replay-here')?.addEventListener('click',()=>startMemoryReplay(entry.id));
  wireProfileLinks(host);
  $('#memoryConstellationNodes')?.querySelectorAll('[data-universe-entry]').forEach(node=>node.classList.toggle('selected',node.dataset.universeEntry===entry.id));
}
function wireMemoryConstellationPan(){
  const viewport=$('#memoryConstellation');
  if(!viewport || viewport.dataset.panWired==='1')return;
  viewport.dataset.panWired='1';
  let dragging=false,startX=0,startY=0,startLeft=0,startTop=0,moved=false;
  viewport.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch' || e.target.closest('button'))return;
    dragging=true;moved=false;
    startX=e.clientX;startY=e.clientY;
    startLeft=viewport.scrollLeft;startTop=viewport.scrollTop;
    viewport.classList.add('dragging');
    try{viewport.setPointerCapture(e.pointerId);}catch{}
  });
  viewport.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const dx=e.clientX-startX,dy=e.clientY-startY;
    if(Math.hypot(dx,dy)>3)moved=true;
    viewport.scrollLeft=startLeft-dx;
    viewport.scrollTop=startTop-dy;
    e.preventDefault();
  });
  const end=e=>{
    if(!dragging)return;
    dragging=false;
    viewport.classList.remove('dragging');
    try{viewport.releasePointerCapture(e.pointerId);}catch{}
  };
  viewport.addEventListener('pointerup',end);
  viewport.addEventListener('pointercancel',end);
}
function renderMemoryConstellation(ordered) {
  const nodesHost = $('#memoryConstellationNodes');
  const linesHost = $('#memoryConstellationLines');
  const filtersHost = $('#memoryConstellationFilters');
  const viewport = $('#memoryConstellation');
  if (!nodesHost || !linesHost) return;

  const valid=ordered.filter(entry=>/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date||'')));
  const years=[...new Set(valid.map(entry=>String(entry.date).slice(0,4)))].sort((a,b)=>b.localeCompare(a));
  if(!universeConstellationYear || (universeConstellationYear!=='all' && !years.includes(universeConstellationYear))){
    universeConstellationYear=years[0] || 'all';
  }
  const yearEntries=universeConstellationYear==='all'
    ? valid
    : valid.filter(entry=>String(entry.date).slice(0,4)===universeConstellationYear);
  const availableMonths=[...new Set(yearEntries.map(entry=>String(entry.date).slice(5,7)))].sort((a,b)=>Number(b)-Number(a));
  if(!universeConstellationMonth || (universeConstellationMonth!=='all' && !availableMonths.includes(universeConstellationMonth))){
    universeConstellationMonth=availableMonths[0] || 'all';
  }
  const filtered=yearEntries.filter(entry=>universeConstellationMonth==='all' || String(entry.date).slice(5,7)===universeConstellationMonth);
  const sample=filtered.slice(-16);

  if(filtersHost){
    const monthName=value=>value==='all'?'All months':new Intl.DateTimeFormat(undefined,{month:'long'}).format(new Date(2026,Math.max(0,Number(value)-1),1));
    filtersHost.innerHTML=`
      <label><span>Year</span><select id="memoryConstellationYearSelect">${['all',...years].map(value=>`<option value="${value}"${value===universeConstellationYear?' selected':''}>${value==='all'?'All years':value}</option>`).join('')}</select></label>
      <label><span>Month</span><select id="memoryConstellationMonthSelect">${['all',...availableMonths].map(value=>`<option value="${value}"${value===universeConstellationMonth?' selected':''}>${escapeHtml(monthName(value))}</option>`).join('')}</select></label>
      <small>Showing ${sample.length}${filtered.length>sample.length?' latest':''} of ${filtered.length} in this period</small>`;
    enhanceAllScrapellaSelects(filtersHost);
    $('#memoryConstellationYearSelect')?.addEventListener('change',e=>{
      universeConstellationYear=e.target.value || 'all';
      universeConstellationMonth='all';
      renderMemoryConstellation(ordered);
    });
    $('#memoryConstellationMonthSelect')?.addEventListener('change',e=>{
      universeConstellationMonth=e.target.value || 'all';
      renderMemoryConstellation(ordered);
    });
  }

  if (!sample.length) {
    nodesHost.innerHTML = '<div class="universe-empty constellation-empty"><span>✧</span><strong>No memories in this period.</strong><p>Choose another month or year.</p></div>';
    linesHost.innerHTML = '';
    renderMemoryUniverseDetail(null);
    wireMemoryConstellationPan();
    return;
  }

  const people = [...new Set(sample.map(entry=>entry.author).filter(Boolean))].slice(0,6).map(tag=>authorProfiles?.[tag] || {tag,displayName:tag,avatar:''});
  const personPositions = new Map();
  people.forEach((person,index)=>{
    const angle=-Math.PI/2+(index/Math.max(1,people.length))*Math.PI*2;
    personPositions.set(person.tag,{x:50+Math.cos(angle)*21,y:50+Math.sin(angle)*25});
  });
  const points=sample.map((entry,index)=>{
    const angle=-Math.PI/2+(index/Math.max(1,sample.length))*Math.PI*2;
    const jitter=((String(entry.id||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%7)-3)*.45;
    return {entry,x:Math.max(7,Math.min(93,50+Math.cos(angle)*(42+jitter))),y:Math.max(8,Math.min(92,50+Math.sin(angle)*(39+jitter)))};
  });
  const lines=[];
  points.forEach(point=>{
    lines.push(`<line class="constellation-line memory-line" x1="500" y1="325" x2="${(point.x*10).toFixed(1)}" y2="${(point.y*6.5).toFixed(1)}" />`);
    const p=personPositions.get(point.entry.author);
    if(p)lines.push(`<line class="constellation-line person-line" x1="${(p.x*10).toFixed(1)}" y1="${(p.y*6.5).toFixed(1)}" x2="${(point.x*10).toFixed(1)}" y2="${(point.y*6.5).toFixed(1)}" />`);
  });
  linesHost.innerHTML=lines.join('');
  const center=`<div class="constellation-book-node" style="left:50%;top:50%"><span>♡</span><strong>${escapeHtml(universeContextProfile?.displayName ? universeContextProfile.displayName + '’s universe' : 'Memory Universe')}</strong><small>${filtered.length} in period</small></div>`;
  const personNodes=people.map(person=>{
    const p=personPositions.get(person.tag);
    return `<button class="constellation-person-node" type="button" data-universe-person="${escapeHtml(person.tag||'')}" style="left:${p.x}%;top:${p.y}%">${avatarHtml(person,'universe-person-avatar')}<small>${escapeHtml(person.displayName||person.tag)}</small></button>`;
  }).join('');
  const memoryNodes=points.map(({entry,x,y})=>{
    const image=universeEntryImage(entry);
    return `<button class="constellation-memory-node${entry.id===universeSelectedEntryId?' selected':''}" type="button" data-universe-entry="${escapeHtml(entry.id)}" style="left:${x}%;top:${y}%" title="${escapeHtml(entry.title||'Memory')} · ${escapeHtml(universeDateLabel(entry.date))}">
      <span class="universe-memory-thumb">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy" />`:'✦'}</span>
      <small>${escapeHtml(universeDateLabel(entry.date,{month:'short',day:'numeric'}))}</small>
    </button>`;
  }).join('');
  nodesHost.innerHTML=center+personNodes+memoryNodes;
  nodesHost.querySelectorAll('[data-universe-entry]').forEach(btn=>btn.addEventListener('click',()=>{
    const entry=entries.find(item=>item.id===btn.dataset.universeEntry);
    if(entry)renderMemoryUniverseDetail(entry);
  }));
  nodesHost.querySelectorAll('[data-universe-person]').forEach(btn=>btn.addEventListener('click',()=>{
    const list=sample.filter(entry=>entry.author===btn.dataset.universePerson);
    if(list.length)renderMemoryUniverseDetail(list[list.length-1]);
  }));
  renderMemoryUniverseDetail(sample.find(item=>item.id===universeSelectedEntryId) || sample[sample.length-1]);
  wireMemoryConstellationPan();

  if(viewport){
    const periodKey=`${universeConstellationTarget}:${universeConstellationYear}:${universeConstellationMonth}`;
    requestAnimationFrame(()=>{
      if(viewport.dataset.periodKey!==periodKey){
        viewport.dataset.periodKey=periodKey;
        viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2);
        viewport.scrollTop=Math.max(0,(viewport.scrollHeight-viewport.clientHeight)/2);
      }
    });
  }
}
function renderMemoryEchoes(ordered) {
  const host=$('#memoryEchoesGrid');
  if(!host)return;
  const byDay=new Map();
  ordered.forEach(entry=>{
    const d=new Date(String(entry.date||'')+'T12:00:00');
    if(Number.isNaN(d.getTime()))return;
    const key=`${d.getMonth()+1}-${d.getDate()}`;
    if(!byDay.has(key))byDay.set(key,[]);
    byDay.get(key).push(entry);
  });
  let pairs=[...byDay.values()].filter(group=>new Set(group.map(e=>String(e.date).slice(0,4))).size>1).map(group=>[group[0],group[group.length-1]]);
  if(!pairs.length && ordered.length>1)pairs=[[ordered[0],ordered[ordered.length-1]]];
  pairs=pairs.slice(0,3);
  if(!pairs.length){
    host.innerHTML='<div class="universe-empty wide"><span>↔</span><strong>Your echoes will appear over time.</strong><p>As this scrapbook grows, Scrapella will pair then-and-now moments.</p></div>';
    return;
  }
  const card=e=>{
    const image=universeEntryImage(e),author=universeAuthor(e);
    return `<button class="universe-mini-memory" type="button" data-universe-entry="${escapeHtml(e.id)}"><div class="universe-mini-visual">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy" />`:'<span>✦</span>'}</div><div><small>${escapeHtml(universeDateLabel(e.date))}</small><strong>${escapeHtml(e.title||'Untitled memory')}</strong><span>${escapeHtml(author.displayName||author.tag||'Someone')}</span></div></button>`;
  };
  host.innerHTML=pairs.map(([a,b])=>`<article class="memory-echo-card"><div class="memory-echo-label"><span>THEN</span><i></i><b>Across time</b><i></i><span>NOW</span></div><div class="memory-echo-pair">${card(a)}${card(b)}</div></article>`).join('');
  host.querySelectorAll('[data-universe-entry]').forEach(btn=>btn.addEventListener('click',()=>openUniverseMemory(btn.dataset.universeEntry)));
}
function renderMemoryPerspectives(ordered) {
  const host=$('#memoryPerspectivesGrid');
  if(!host)return;
  const groups=new Map();
  ordered.forEach(entry=>{
    if(!groups.has(entry.date))groups.set(entry.date,[]);
    groups.get(entry.date).push(entry);
  });
  const shared=[...groups.entries()].filter(([,group])=>group.length>1 && new Set(group.map(e=>e.author)).size>1).slice(-4).reverse();
  if(!shared.length){
    host.innerHTML='<div class="universe-empty wide"><span>◎</span><strong>No shared-date perspectives yet.</strong><p>When different people remember the same day, their viewpoints will meet here automatically.</p></div>';
    return;
  }
  host.innerHTML=shared.map(([date,group])=>`<article class="perspective-card"><header><small>${escapeHtml(universeDateLabel(date))}</small><strong>${group.length} memories · ${new Set(group.map(e=>e.author)).size} perspectives</strong></header><div class="perspective-memory-list">${group.slice(0,4).map(entry=>`<button type="button" data-universe-entry="${escapeHtml(entry.id)}"><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><span>${escapeHtml(universeAuthor(entry).displayName||entry.author||'Someone')}</span><p>${escapeHtml(universeExcerpt(entry,90))}</p></button>`).join('')}</div></article>`).join('');
  host.querySelectorAll('[data-universe-entry]').forEach(btn=>btn.addEventListener('click',()=>openUniverseMemory(btn.dataset.universeEntry)));
}
const OFFICIAL_UNIVERSE_MODES = ['voiceMemory','letters','prompts','anniversaries','box','themes','peopleMemory','vault','family','inherited','secret','faith','wall','capsules','museum'];
let universeLabMode = 'voiceMemory';
let universeVoiceRecorder = null;
let universeVoiceStream = null;
let universeVoiceChunks = [];
let universeVoiceTimer = null;
let universeVoiceStartedAt = 0;
const universeVoiceClips = [];
let universeMemoryVoiceRecorder = null;
let universeMemoryVoiceStream = null;
let universeMemoryVoiceChunks = [];
let universeMemoryVoiceStartedAt = 0;
const universeMemoryVoiceClips = [];
const universeBoxSessionItems = [];
let universeFreedomWallCache = { posts:[], profiles:{} };
const UNIVERSE_INTERVIEW_PROMPTS = ["What happened right before this moment?","What happened immediately after it?","Who was there that the photo does not show?","What sound do you remember from this day?","What detail would future you probably forget?","What were you worried about at the time?","What made you laugh that day?","What did this place feel like in person?","If you could return to this moment for five minutes, what would you notice first?","What would you tell the version of yourself in this memory?","Why did this ordinary moment become important?","Was there something you wanted to say but did not?","Who took the photo, and what were they doing?","What song, smell, food, or weather belongs to this memory?","How do you feel about this memory now compared with then?","What do you hope someone else remembers about this day?"];

function universePreviewStorageKey(type) {
  const target = universeTargetTag || activeScrapbook?.owner || me?.tag || 'guest';
  return `scrapella-memory-universe-v2:${target}:${type}`;
}

function cloneUniverseValue(value, fallback) {
  try {
    const source = value === undefined ? fallback : value;
    return typeof structuredClone === 'function' ? structuredClone(source) : JSON.parse(JSON.stringify(source));
  } catch {
    return Array.isArray(fallback) ? [] : {};
  }
}

function loadUniversePreview(type, fallback) {
  if (Object.prototype.hasOwnProperty.call(universeOfficialState || {},type)) {
    return cloneUniverseValue(universeOfficialState[type],fallback);
  }
  try {
    const raw = localStorage.getItem(universePreviewStorageKey(type));
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem(`scrapella-universe-preview-v1:${me?.tag || 'guest'}:${activeScrapbook?.id || 'none'}:${type}`);
    if (legacy) {
      const value=JSON.parse(legacy);
      if ((universeTargetTag || me?.tag) === me?.tag) {
        universeOfficialState[type]=cloneUniverseValue(value,fallback);
        queueUniverseStateSave(type,value);
      }
      return value;
    }
  } catch {}
  return cloneUniverseValue(undefined,fallback);
}

function queueUniverseStateSave(type,value) {
  if (!me?.tag || (universeTargetTag || me.tag) !== me.tag) return;
  universeOfficialState[type]=cloneUniverseValue(value,null);
  clearTimeout(universeStateSaveTimer);
  universeStateSaveTimer=setTimeout(()=>{
    api('/api/memory-universe/state',{
      method:'PUT',
      body:JSON.stringify({type,value:universeOfficialState[type]})
    }).catch(err=>console.warn('Memory Universe save failed:',err?.message||err));
  },180);
}

function saveUniversePreview(type, value) {
  universeOfficialState[type]=cloneUniverseValue(value,null);
  try { localStorage.setItem(universePreviewStorageKey(type), JSON.stringify(value)); } catch {}
  queueUniverseStateSave(type,value);
}

async function loadMemoryUniverse(tag = me?.tag, { override = universeOwnerOverride } = {}) {
  const clean=String(tag || me?.tag || '').replace(/^@/,'').toLowerCase();
  if(!clean)return false;
  const self=clean===me?.tag;
  if(universeConstellationTarget!==clean){
    universeConstellationTarget=clean;
    universeConstellationYear='';
    universeConstellationMonth='';
  }
  const query=new URLSearchParams({tag:clean});
  if(self && override)query.set('override','1');
  const data=await api(`/api/memory-universe?${query.toString()}`);
  universeTargetTag=data.profile?.tag || clean;
  universeContextProfile=data.profile || {tag:clean,displayName:clean};
  universeBooks=Array.isArray(data.books)?data.books:[];
  universeCanSeeExtended=data.canSeeExtended===true;
  universeOwnerOverride=data.ownerOverrideActive===true;
  universeOfficialState=data.state && typeof data.state==='object' ? data.state : {};
  entries=Array.isArray(data.entries)?data.entries:[];
  authorProfiles=data.profiles && typeof data.profiles==='object' ? data.profiles : {};
  if(!entries.some(entry=>entry.id===universeSelectedEntryId)) universeSelectedEntryId=entries.at(-1)?.id || null;
  if(isPhoneUI()) mobileBookContextTag=universeTargetTag;
  return true;
}

async function openMemoryUniverse(tag = me?.tag, options = {}) {
  try {
    await loadMemoryUniverse(tag,options);
    showView('universe');
    return true;
  } catch(err) {
    if(err?.status===401)location.reload();
    else showToast(err?.message || 'Could not open Memory Universe.');
    return false;
  }
}

function universeSelectedEntry() {
  return entries.find(entry => entry.id === universeSelectedEntryId) || entries[entries.length - 1] || null;
}

function universeMemorySelectOptions(selectedId = '') {
  const ordered = [...entries].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return ordered.map(entry => `<option value="${escapeHtml(entry.id)}"${entry.id===selectedId?' selected':''}>${escapeHtml(universeDateLabel(entry.date,{month:'short',day:'numeric',year:'numeric'}))} · ${escapeHtml(entry.title || 'Untitled memory')}</option>`).join('');
}

function universeLabSetMode(mode) {
  universeLabMode = OFFICIAL_UNIVERSE_MODES.includes(mode) ? mode : OFFICIAL_UNIVERSE_MODES[0];
  document.querySelectorAll('[data-universe-lab]').forEach(btn => btn.classList.toggle('active',btn.dataset.universeLab===universeLabMode));
  renderUniverseLabStage();
}

function applyUniverseReadOnlyState() {
  const stage=$('#universeLabStage');
  if(!stage || (universeTargetTag || me?.tag)===me?.tag)return;
  stage.classList.add('universe-readonly');
  stage.querySelectorAll('input,textarea,select,button[type="submit"],.remove-preview-item,.remove-letter-preview,.remove-trail-preview,.remove-heirloom-preview').forEach(el=>el.disabled=true);
  stage.querySelectorAll('input[type="file"],.lab-drop-photo').forEach(el=>{ el.disabled=true; el.classList?.add('disabled'); });
}
function renderUniverseLabs() {
  const stage = $('#universeLabStage');
  if (!stage) return;
  if (!OFFICIAL_UNIVERSE_MODES.includes(universeLabMode)) universeLabMode = OFFICIAL_UNIVERSE_MODES[0];
  document.querySelectorAll('[data-universe-lab]').forEach(btn => {
    const mode=btn.dataset.universeLab || '';
    const official=OFFICIAL_UNIVERSE_MODES.includes(mode);
    btn.hidden = !official;
    btn.onclick = official ? (() => universeLabSetMode(mode)) : null;
    btn.classList.toggle('active',official && mode===universeLabMode);
  });
  renderUniverseLabStage();
  requestAnimationFrame(applyUniverseReadOnlyState);
}

function renderUniverseLabStage() {
  const stage = $('#universeLabStage');
  if (!stage) return;
  if (universeLabMode === 'wall') {
    renderUniverseFreedomWallLab();
    return;
  }
  if (universeLabMode === 'secret') {
    renderUniverseSecretLab();
    return;
  }
  if (!universeTargetTag && !me?.tag) {
    stage.innerHTML = '<div class="universe-empty wide"><span>♡</span><strong>Open a Memory Universe first.</strong></div>';
    return;
  }
  const entryOptionalModes = new Set(['box','themes','family','faith','wall','secret']);
  if (!entries.length && !entryOptionalModes.has(universeLabMode)) {
    stage.innerHTML = '<div class="universe-empty wide"><span>✧</span><strong>Add a memory to use this feature.</strong><p>Once your Memory Universe has a page, these tools can begin connecting it.</p></div>';
    return;
  }
  if (universeLabMode === 'layers') renderUniverseLayersLab();
  else if (universeLabMode === 'trails') renderUniverseTrailsLab();
  else if (universeLabMode === 'interview') renderUniverseInterviewLab();
  else if (universeLabMode === 'voice') renderUniverseVoiceLab();
  else if (universeLabMode === 'voiceMemory') renderUniverseVoiceMemoryLab();
  else if (universeLabMode === 'letters') renderUniverseLettersLab();
  else if (universeLabMode === 'collaborative') renderUniverseCollaborativeLab();
  else if (universeLabMode === 'prompts') renderUniversePromptsLab();
  else if (universeLabMode === 'anniversaries') renderUniverseAnniversaryLab();
  else if (universeLabMode === 'rituals') renderUniverseRitualsLab();
  else if (universeLabMode === 'box') renderUniverseMemoryBoxLab();
  else if (universeLabMode === 'themes') renderUniverseThemesLab();
  else if (universeLabMode === 'peopleMemory') renderUniversePeopleMemoryLab();
  else if (universeLabMode === 'versions') renderUniverseVersionsLab();
  else if (universeLabMode === 'vault') renderUniverseVaultLab();
  else if (universeLabMode === 'family') renderUniverseFamilyLab();
  else if (universeLabMode === 'inherited') renderUniverseInheritedLab();
  else if (universeLabMode === 'qr') renderUniverseQrLab();
  else if (universeLabMode === 'secret') renderUniverseSecretLab();
  else if (universeLabMode === 'unfinished') renderUniverseUnfinishedLab();
  else if (universeLabMode === 'faith') renderUniverseFaithLab();
  else if (universeLabMode === 'capsules') renderUniverseCapsulesLab();
  else if (universeLabMode === 'heirlooms') renderUniverseHeirloomsLab();
  else if (universeLabMode === 'museum') renderUniverseMuseumLab();
  else renderUniverseArchiveLab();
}

function renderUniverseLayersLab() {
  const stage = $('#universeLabStage');
  const entry = universeSelectedEntry();
  if (!stage || !entry) return;
  const allLayers = loadUniversePreview('layers',{});
  const layers = Array.isArray(allLayers[entry.id]) ? allLayers[entry.id] : [];
  stage.innerHTML = `<div class="lab-split">
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">MEMORY LAYERS</p><h4>Let a memory grow without rewriting the past.</h4></div><span class="lab-preview-pill">Saved feature</span></div>
      <label class="lab-field">Memory<select id="layersMemorySelect">${universeMemorySelectOptions(entry.id)}</select></label>
      <article class="memory-layer-original">
        <small>ORIGINAL · ${escapeHtml(universeDateLabel(entry.date))}</small>
        <strong>${escapeHtml(entry.title || 'Untitled memory')}</strong>
        <p>${escapeHtml(universeExcerpt(entry,360))}</p>
      </article>
      <div class="memory-layer-thread">${layers.map((layer,index)=>`<article class="memory-layer-reflection"><span>${index+1}</span><div><small>REFLECTION · ${escapeHtml(universeDateLabel(String(layer.createdAt||'').slice(0,10)))}</small><p>${escapeHtml(layer.text || '')}</p></div></article>`).join('') || '<div class="lab-soft-empty">No reflections yet. Add what this memory means to you now.</div>'}</div>
    </section>
    <aside class="lab-compose-card">
      <span class="lab-icon">↻</span>
      <h4>Reflect without erasing.</h4>
      <p>Your original page stays exactly as it was. This adds a new layer beside it.</p>
      <textarea id="memoryLayerText" rows="6" maxlength="1200" placeholder="Looking back now, I realize…"></textarea>
      <button id="addMemoryLayerBtn" class="primary" type="button">Add reflection layer</button>
      <small>Saved to your Memory Universe.</small>
    </aside>
  </div>`;
  $('#layersMemorySelect')?.addEventListener('change',e=>{universeSelectedEntryId=e.target.value;renderUniverseLayersLab();});
  $('#addMemoryLayerBtn')?.addEventListener('click',()=>{
    const text=String($('#memoryLayerText')?.value||'').trim();
    if(!text){showToast('Write a reflection first.');return;}
    allLayers[entry.id]=layers.concat({id:crypto.randomUUID?.()||String(Date.now()),text,createdAt:new Date().toISOString()});
    saveUniversePreview('layers',allLayers);
    renderUniverseLayersLab();
    showToast('Reflection layer added to the Memory Universe.');
  });
}

function renderUniverseInterviewLab() {
  const stage = $('#universeLabStage');
  const entry = universeSelectedEntry();
  if (!stage || !entry) return;
  const answers = loadUniversePreview('interviews',{});
  const entryAnswers = answers[entry.id] || {};
  const seed = String(entry.id || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  const promptSet = [];
  for (let i=0;i<4;i++) promptSet.push(UNIVERSE_INTERVIEW_PROMPTS[(seed+i*3)%UNIVERSE_INTERVIEW_PROMPTS.length]);
  stage.innerHTML = `<div class="lab-split interview-lab">
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">MEMORY INTERVIEW</p><h4>Turn a photo into the story behind the photo.</h4></div><span class="lab-preview-pill">Guided memory</span></div>
      <label class="lab-field">Memory<select id="interviewMemorySelect">${universeMemorySelectOptions(entry.id)}</select></label>
      <div class="interview-memory-brief">
        ${universeEntryImage(entry)?`<img src="${escapeHtml(universeEntryImage(entry))}" alt="" />`:'<span>✦</span>'}
        <div><small>${escapeHtml(universeDateLabel(entry.date))}</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>${escapeHtml(universeExcerpt(entry,180))}</p></div>
      </div>
    </section>
    <form id="memoryInterviewForm" class="interview-prompt-list">
      ${promptSet.map((prompt,index)=>`<label><span>${index+1}</span><strong>${escapeHtml(prompt)}</strong><textarea rows="3" maxlength="700" data-interview-prompt="${escapeHtml(prompt)}" placeholder="Your answer…">${escapeHtml(entryAnswers[prompt]||'')}</textarea></label>`).join('')}
      <button class="primary" type="submit">Save interview notes</button>
      <small>Interview notes are saved to your Memory Universe and do not edit the original page.</small>
    </form>
  </div>`;
  $('#interviewMemorySelect')?.addEventListener('change',e=>{universeSelectedEntryId=e.target.value;renderUniverseInterviewLab();});
  $('#memoryInterviewForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const next={...entryAnswers};
    e.currentTarget.querySelectorAll('[data-interview-prompt]').forEach(area=>{
      const value=String(area.value||'').trim();
      if(value)next[area.dataset.interviewPrompt]=value;
      else delete next[area.dataset.interviewPrompt];
    });
    answers[entry.id]=next;
    saveUniversePreview('interviews',answers);
    showToast('Memory interview saved.');
  });
}

function renderUniverseCapsulesLab() {
  const stage=$('#universeLabStage');
  if(!stage)return;
  const capsules=loadUniversePreview('capsules',[]);
  const selected=universeSelectedEntry();
  const future=new Date();
  future.setFullYear(future.getFullYear()+1);
  const defaultDate=future.toISOString().slice(0,10);
  const today=new Date().toISOString().slice(0,10);
  stage.innerHTML=`<div class="lab-split">
    <form id="memoryCapsuleForm" class="lab-compose-card lab-form-card">
      <span class="lab-icon">⌛</span>
      <p class="eyebrow">FUTURE CAPSULE</p>
      <h4>Send a memory forward in time.</h4>
      <label class="lab-field">Memory<select name="entryId">${universeMemorySelectOptions(selected?.id||'')}</select></label>
      <label class="lab-field">Unlock on<input name="unlockDate" type="date" min="${today}" value="${defaultDate}" required /></label>
      <label class="lab-field">A note for that day<textarea name="note" rows="4" maxlength="700" placeholder="When this opens, remember…"></textarea></label>
      <button class="primary" type="submit">Seal capsule</button>
      <small>The original memory remains in its current scrapbook and keeps its existing privacy.</small>
    </form>
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">YOUR CAPSULE SHELF</p><h4>Memories waiting for another day.</h4></div><span class="lab-preview-pill">${capsules.length} sealed</span></div>
      <div class="capsule-list">${capsules.map(capsule=>{
        const entry=entries.find(e=>e.id===capsule.entryId);
        const unlocked=String(capsule.unlockDate||'')<=today;
        const days=Math.max(0,Math.ceil((new Date(capsule.unlockDate+'T12:00:00')-new Date())/86400000));
        return `<article class="capsule-card ${unlocked?'unlocked':'locked'}"><div class="capsule-lock">${unlocked?'♡':'⌛'}</div><div><small>${unlocked?'READY TO OPEN':`${days} days to go`}</small><strong>${escapeHtml(entry?.title||'Memory')}</strong><p>${escapeHtml(capsule.note||'No note added.')}</p><span>Unlocks ${escapeHtml(universeDateLabel(capsule.unlockDate))}</span></div><button type="button" class="icon-btn remove-preview-item" data-preview-id="${escapeHtml(capsule.id)}" aria-label="Remove capsule">×</button></article>`;
      }).join('')||'<div class="lab-soft-empty">No capsules yet. Seal one from the form beside this shelf.</div>'}</div>
    </section>
  </div>`;
  $('#memoryCapsuleForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    const item={id:crypto.randomUUID?.()||String(Date.now()),entryId:String(form.get('entryId')||''),unlockDate:String(form.get('unlockDate')||''),note:String(form.get('note')||'').trim(),createdAt:new Date().toISOString()};
    saveUniversePreview('capsules',capsules.concat(item));
    renderUniverseCapsulesLab();
    showToast('Future capsule sealed in Memory Universe.');
  });
  stage.querySelectorAll('.remove-preview-item').forEach(btn=>btn.addEventListener('click',()=>{
    saveUniversePreview('capsules',capsules.filter(item=>item.id!==btn.dataset.previewId));
    renderUniverseCapsulesLab();
  }));
}

function renderUniverseHeirloomsLab() {
  const stage=$('#universeLabStage');
  if(!stage)return;
  const heirlooms=loadUniversePreview('heirlooms',[]);
  const selected=universeSelectedEntry();
  stage.innerHTML=`<div class="lab-split">
    <form id="memoryHeirloomForm" class="lab-compose-card lab-form-card">
      <span class="lab-icon">◇</span>
      <p class="eyebrow">DIGITAL HEIRLOOM</p>
      <h4>Choose what deserves to outlive a timeline.</h4>
      <label class="lab-field">Memory<select name="entryId">${universeMemorySelectOptions(selected?.id||'')}</select></label>
      <label class="lab-field">For<input name="recipient" maxlength="40" placeholder="@child, @partner, family…" /></label>
      <label class="lab-field">Why this matters<textarea name="note" rows="4" maxlength="700" placeholder="I want you to keep this because…"></textarea></label>
      <button class="primary" type="submit">Mark as heirloom</button>
      <small>This marks the memory as an heirloom; it does not transfer account ownership or scrapbook access.</small>
    </form>
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">HEIRLOOM CHEST</p><h4>Stories intentionally kept for someone.</h4></div><span class="lab-preview-pill">${heirlooms.length} chosen</span></div>
      <div class="heirloom-grid">${heirlooms.map(item=>{
        const entry=entries.find(e=>e.id===item.entryId);
        const image=universeEntryImage(entry);
        return `<article class="heirloom-card">${image?`<img src="${escapeHtml(image)}" alt="" />`:'<div class="heirloom-placeholder">◇</div>'}<div><small>FOR ${escapeHtml(item.recipient||'SOMEONE SPECIAL')}</small><strong>${escapeHtml(entry?.title||'Memory')}</strong><p>${escapeHtml(item.note||'A memory worth keeping.')}</p></div><button class="icon-btn remove-heirloom-preview" data-preview-id="${escapeHtml(item.id)}" type="button">×</button></article>`;
      }).join('')||'<div class="lab-soft-empty">Your heirloom chest is empty.</div>'}</div>
    </section>
  </div>`;
  $('#memoryHeirloomForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    const item={id:crypto.randomUUID?.()||String(Date.now()),entryId:String(form.get('entryId')||''),recipient:String(form.get('recipient')||'').trim(),note:String(form.get('note')||'').trim(),createdAt:new Date().toISOString()};
    saveUniversePreview('heirlooms',heirlooms.concat(item));
    renderUniverseHeirloomsLab();
    showToast('Heirloom marked in Memory Universe.');
  });
  stage.querySelectorAll('.remove-heirloom-preview').forEach(btn=>btn.addEventListener('click',()=>{
    saveUniversePreview('heirlooms',heirlooms.filter(item=>item.id!==btn.dataset.previewId));
    renderUniverseHeirloomsLab();
  }));
}

function renderUniverseVoiceLab() {
  const stage=$('#universeLabStage');
  if(!stage)return;
  const people=[...new Set(entries.map(e=>e.author).filter(Boolean))].map(tag=>authorProfiles?.[tag]||{tag,displayName:tag,avatar:''});
  const clips=loadUniversePreview('voicePortraits',[]);
  stage.innerHTML=`<div class="lab-split">
    <section class="voice-portrait-stage">
      <div class="voice-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="voice-person-preview">${people[0]?avatarHtml(people[0],'voice-portrait-avatar'):'<span class="voice-portrait-avatar">♡</span>'}<strong>Preserve the voice, not only the photo.</strong><p>A laugh, a story, a recipe, advice, or simply the way someone says your name can become part of the scrapbook.</p></div>
    </section>
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">VOICE PORTRAITS</p><h4>Record a tiny piece of someone’s voice.</h4></div><span class="lab-preview-pill">Up to 30 sec</span></div>
      <label class="lab-field">Person<select id="voicePortraitPerson">${people.map(p=>`<option value="${escapeHtml(p.tag)}">${escapeHtml(p.displayName||p.tag)} · @${escapeHtml(p.tag)}</option>`).join('')}</select></label>
      <div class="voice-record-controls"><button id="voicePortraitRecordBtn" class="primary" type="button">● Start recording</button><button id="voicePortraitStopBtn" class="ghost" type="button" disabled>■ Stop</button><span id="voicePortraitStatus">Ready</span></div>
      <p class="helper">Voice Portraits are saved to your Memory Universe.</p>
      <div class="voice-clip-list">${clips.map(clip=>{const person=authorProfiles?.[clip.tag]||{tag:clip.tag,displayName:clip.tag};return `<article><div><strong>${escapeHtml(person.displayName||person.tag||'Voice')}</strong><small>${Math.max(1,Math.round(clip.duration/1000))} sec · saved</small></div><audio controls src="${escapeHtml(clip.url)}"></audio></article>`;}).join('')||'<div class="lab-soft-empty">No Voice Portraits saved yet.</div>'}</div>
    </section>
  </div>`;
  $('#voicePortraitRecordBtn')?.addEventListener('click',()=>startUniverseVoiceRecording(String($('#voicePortraitPerson')?.value||'')));
  $('#voicePortraitStopBtn')?.addEventListener('click',()=>stopUniverseVoiceRecording());
}
async function startUniverseVoiceRecording(tag) {
  if(universeVoiceRecorder?.state==='recording')return;
  const status=$('#voicePortraitStatus'),start=$('#voicePortraitRecordBtn'),stop=$('#voicePortraitStopBtn');
  try{
    if((universeTargetTag || me?.tag)!==me?.tag){showToast('This Memory Universe is read-only for you.');return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){showToast('Voice recording is not supported on this device.');return;}
    if(isNativeScrapellaApp()){
      const permission=await checkMicrophonePermission({request:true});
      if(permission==='denied'){showToast('Microphone access is blocked in your phone settings.');return;}
    }
    universeVoiceStream=await navigator.mediaDevices.getUserMedia({audio:true});
    universeVoiceChunks=[]; universeVoiceStartedAt=Date.now();
    const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported?.(type));
    universeVoiceRecorder=new MediaRecorder(universeVoiceStream,preferred?{mimeType:preferred}:undefined);
    universeVoiceRecorder.ondataavailable=e=>{if(e.data?.size)universeVoiceChunks.push(e.data);};
    universeVoiceRecorder.onstop=async()=>{
      const duration=Date.now()-universeVoiceStartedAt;
      const type=universeVoiceRecorder?.mimeType||universeVoiceChunks[0]?.type||'audio/webm';
      const raw=new Blob(universeVoiceChunks,{type});
      universeVoiceStream?.getTracks?.().forEach(track=>track.stop()); universeVoiceStream=null; universeVoiceRecorder=null; clearTimeout(universeVoiceTimer);
      if(status)status.textContent='Saving…';
      try{
        const normalized=await normalizeVoiceRecordingForPlayback(raw);
        const file=new File([normalized.blob],`voice-portrait-${Date.now()}.${normalized.ext}`,{type:normalized.type,lastModified:Date.now()});
        const uploaded=await uploadAttachment(file);
        const clips=loadUniversePreview('voicePortraits',[]);
        clips.unshift({id:crypto.randomUUID?.()||String(Date.now()),tag,url:uploaded.src,duration,createdAt:new Date().toISOString()});
        saveUniversePreview('voicePortraits',clips.slice(0,80));
        showToast('Voice Portrait saved.');
      }catch(err){showToast(err?.message || 'Could not save Voice Portrait.');}
      renderUniverseVoiceLab();
    };
    universeVoiceRecorder.start(250); if(status)status.textContent='Recording…';if(start)start.disabled=true;if(stop)stop.disabled=false;
    universeVoiceTimer=setTimeout(stopUniverseVoiceRecording,30000);
  }catch(err){
    universeVoiceStream?.getTracks?.().forEach(track=>track.stop()); universeVoiceStream=null;
    if(status)status.textContent='Microphone unavailable';
    showToast(err?.name==='NotAllowedError'?'Microphone permission was not allowed.':'Could not start voice recording.');
  }
}
function stopUniverseVoiceRecording() {
  clearTimeout(universeVoiceTimer);
  if(universeVoiceRecorder?.state==='recording')universeVoiceRecorder.stop();
}

function renderUniverseMuseumLab() {
  const stage=$('#universeLabStage');
  if(!stage)return;
  const visual=entries.filter(entry=>universeEntryImage(entry)).slice(-8);
  if(!visual.length){
    stage.innerHTML='<div class="universe-empty wide"><span>▣</span><strong>Your Life Museum needs photographs.</strong><p>Add visual memories and Scrapella will hang them in a quiet gallery instead of another scrolling feed.</p></div>';
    return;
  }
  stage.innerHTML=`<section class="life-museum">
    <div class="museum-ceiling"><i></i><i></i><i></i></div>
    <div class="museum-wall">
      <div class="museum-title-plaque"><small>LIFE MUSEUM · ${escapeHtml(activeScrapbook?.name||'SCRAPBOOK')}</small><strong>A room made from memories.</strong></div>
      <div class="museum-gallery">${visual.map((entry,index)=>`<button class="museum-frame museum-frame-${(index%4)+1}" type="button" data-museum-entry="${escapeHtml(entry.id)}"><span><img src="${escapeHtml(universeEntryImage(entry))}" alt="" loading="lazy" /></span><small>${escapeHtml(entry.title||'Untitled memory')}</small><em>${escapeHtml(universeDateLabel(entry.date,{month:'short',year:'numeric'}))}</em></button>`).join('')}</div>
    </div>
    <div class="museum-floor"></div>
    <p class="museum-caption">tap a frame to step back into that memory.</p>
  </section>`;
  stage.querySelectorAll('[data-museum-entry]').forEach(btn=>btn.addEventListener('click',()=>openUniverseMemory(btn.dataset.museumEntry)));
}

function downloadUniverseFile(name,blob) {
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function downloadUniverseArchive(format='json') {
  if(!activeScrapbook)return;
  const safeName=String(activeScrapbook.name||'scrapbook').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'scrapbook';
  if(format==='json'){
    const archive={format:'Scrapella Portable Archive',version:1,exportedAt:new Date().toISOString(),scrapbook:activeScrapbook,profiles:authorProfiles,entries};
    downloadUniverseFile(`${safeName}-scrapella-archive.json`,new Blob([JSON.stringify(archive,null,2)],{type:'application/json'}));
    return;
  }
  const cards=[...entries].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(entry=>{
    const image=universeEntryImage(entry);
    return `<article>${image?`<img src="${escapeHtml(image)}" alt="">`:''}<small>${escapeHtml(universeDateLabel(entry.date))}</small><h2>${escapeHtml(entry.title||'Untitled memory')}</h2><p>${escapeHtml(universeExcerpt(entry,1000))}</p></article>`;
  }).join('');
  const doc=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(activeScrapbook.name||'Scrapella Archive')}</title><style>body{max-width:900px;margin:50px auto;padding:0 24px;font-family:Georgia,serif;color:#352729;background:#fffaf1}header{border-bottom:1px solid #d9c7c2;padding-bottom:24px;margin-bottom:30px}article{padding:26px 0;border-bottom:1px solid #e4d6d1}img{max-width:100%;max-height:520px;object-fit:contain;border-radius:12px}small{color:#8a6d71}p{line-height:1.65;white-space:pre-wrap}</style></head><body><header><small>SCRAPELLA PORTABLE KEEPSAKE</small><h1>${escapeHtml(activeScrapbook.name||'Scrapbook')}</h1><p>Exported ${escapeHtml(new Date().toLocaleString())}</p></header>${cards}</body></html>`;
  downloadUniverseFile(`${safeName}-keepsake.html`,new Blob([doc],{type:'text/html'}));
}

function renderUniverseTrailsLab() {
  const stage=$('#universeLabStage'); if(!stage)return;
  const trails=loadUniversePreview('trails',[]);
  const memoryCards=idList=>idList.map((id,index)=>{
    const entry=entries.find(e=>e.id===id); if(!entry)return '';
    return `<button class="trail-memory-node" type="button" data-trail-entry="${escapeHtml(id)}"><span>${index+1}</span><div><small>${escapeHtml(universeDateLabel(entry.date,{month:'short',day:'numeric',year:'numeric'}))}</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong></div></button>`;
  }).join('<i class="trail-connector">→</i>');
  stage.innerHTML=`<div class="lab-split">
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">MEMORY TRAILS</p><h4>Turn scattered moments into a journey.</h4></div><span class="lab-preview-pill">${trails.length} trails</span></div>
      <div class="memory-trail-list">${trails.map(trail=>`<article class="memory-trail-card"><header><div><small>${trail.ids.length} stops</small><strong>${escapeHtml(trail.name||'Untitled trail')}</strong></div><button class="icon-btn remove-trail-preview" type="button" data-preview-id="${escapeHtml(trail.id)}">×</button></header><div class="memory-trail-path">${memoryCards(trail.ids)}</div></article>`).join('')||'<div class="lab-soft-empty">No trails yet. Build one from memories that belong to the same story.</div>'}</div>
    </section>
    <form id="memoryTrailForm" class="lab-compose-card">
      <span class="lab-icon">⌁</span><p class="eyebrow">BUILD A TRAIL</p><h4>What story connects these memories?</h4>
      <label class="lab-field">Trail name<input name="name" maxlength="70" placeholder="College days · How we met · First year away…" required /></label>
      <div class="trail-picker">${[...entries].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-12).map(entry=>`<label><input type="checkbox" name="entryId" value="${escapeHtml(entry.id)}" /><span>${escapeHtml(universeDateLabel(entry.date,{month:'short',day:'numeric'}))}</span><strong>${escapeHtml(entry.title||'Untitled memory')}</strong></label>`).join('')}</div>
      <button class="primary" type="submit">Create trail</button><small>Trails are saved to your Memory Universe.</small>
    </form>
  </div>`;
  $('#memoryTrailForm')?.addEventListener('submit',e=>{
    e.preventDefault(); const form=new FormData(e.currentTarget);
    const ids=form.getAll('entryId').map(String);
    if(ids.length<2){showToast('Choose at least two memories for a trail.');return;}
    const item={id:crypto.randomUUID?.()||String(Date.now()),name:String(form.get('name')||'').trim(),ids,createdAt:new Date().toISOString()};
    saveUniversePreview('trails',trails.concat(item)); renderUniverseTrailsLab(); showToast('Memory trail created in feature.');
  });
  stage.querySelectorAll('[data-trail-entry]').forEach(btn=>btn.addEventListener('click',()=>openUniverseMemory(btn.dataset.trailEntry)));
  stage.querySelectorAll('.remove-trail-preview').forEach(btn=>btn.addEventListener('click',()=>{saveUniversePreview('trails',trails.filter(t=>t.id!==btn.dataset.previewId));renderUniverseTrailsLab();}));
}

function renderUniverseVoiceMemoryLab() {
  const stage=$('#universeLabStage'); const entry=universeSelectedEntry(); if(!stage||!entry)return;
  const clips=loadUniversePreview('voiceMemories',[]).filter(c=>c.entryId===entry.id);
  const ordered=[...entries].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  stage.innerHTML=`<div class="lab-split">
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">VOICE MEMORIES</p><h4>Let a memory keep the sound of your voice.</h4></div><span class="lab-preview-pill">Saved</span></div>
      <div class="lab-field"><span>Memory</span><div class="lab-memory-picker"><button id="voiceMemoryPickerBtn" class="lab-memory-picker-button" type="button"><span>${escapeHtml(universeDateLabel(entry.date,{month:'short',day:'numeric',year:'numeric'}))} · ${escapeHtml(entry.title||'Untitled memory')}</span><b>⌄</b></button><div id="voiceMemoryPickerMenu" class="lab-memory-picker-menu hidden">${ordered.map(item=>`<button type="button" data-voice-memory-entry="${escapeHtml(item.id)}" class="${item.id===entry.id?'active':''}"><small>${escapeHtml(universeDateLabel(item.date,{month:'short',day:'numeric',year:'numeric'}))}</small><strong>${escapeHtml(item.title||'Untitled memory')}</strong></button>`).join('')}</div></div></div>
      <div class="voice-memory-card">${universeEntryImage(entry)?`<img src="${escapeHtml(universeEntryImage(entry))}" alt="" />`:'<span>♪</span>'}<div><small>${escapeHtml(universeDateLabel(entry.date))}</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>${escapeHtml(universeExcerpt(entry,220))}</p></div></div>
    </section>
    <aside class="lab-compose-card"><span class="lab-icon">♫</span><h4>Tell what the page cannot.</h4><p>Record up to 45 seconds explaining what you remember, what you felt, or what happened outside the frame.</p><div class="voice-record-controls"><button id="voiceMemoryRecordBtn" class="primary" type="button">● Record</button><button id="voiceMemoryStopBtn" class="ghost" type="button" disabled>■ Stop</button><span id="voiceMemoryStatus">Ready</span></div><div class="voice-clip-list">${clips.map(c=>`<article><div><strong>${escapeHtml(entry.title||'Memory')}</strong><small>${Math.max(1,Math.round(c.duration/1000))} sec · saved</small></div><audio controls src="${escapeHtml(c.url)}"></audio></article>`).join('')||'<div class="lab-soft-empty">No voice memory yet.</div>'}</div><small>Voice Memories are saved to your Memory Universe.</small></aside>
  </div>`;
  $('#voiceMemoryPickerBtn')?.addEventListener('click',e=>{e.stopPropagation();$('#voiceMemoryPickerMenu')?.classList.toggle('hidden');});
  $('#voiceMemoryPickerMenu')?.querySelectorAll('[data-voice-memory-entry]').forEach(btn=>btn.addEventListener('click',()=>{
    universeSelectedEntryId=btn.dataset.voiceMemoryEntry;
    renderUniverseVoiceMemoryLab();
  }));
  $('#voiceMemoryRecordBtn')?.addEventListener('click',()=>startUniverseMemoryVoiceRecording(entry.id));
  $('#voiceMemoryStopBtn')?.addEventListener('click',stopUniverseMemoryVoiceRecording);
}
async function startUniverseMemoryVoiceRecording(entryId) {
  if(universeMemoryVoiceRecorder?.state==='recording')return;
  const start=$('#voiceMemoryRecordBtn'),stop=$('#voiceMemoryStopBtn'),status=$('#voiceMemoryStatus');
  try{
    if((universeTargetTag || me?.tag)!==me?.tag){showToast('This Memory Universe is read-only for you.');return;}
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){showToast('Voice recording is not supported on this device.');return;}
    if(isNativeScrapellaApp()){
      const permission=await checkMicrophonePermission({request:true});
      if(permission==='denied'){
        setProfilePermissionState('microphone','denied','Not allowed');
        showToast('Microphone access is blocked. Open Profile → App permissions and allow Microphone.');
        return;
      }
    }
    universeMemoryVoiceStream=await navigator.mediaDevices.getUserMedia({audio:true});
    setProfilePermissionState('microphone','granted','Allowed');
    universeMemoryVoiceChunks=[]; universeMemoryVoiceStartedAt=Date.now();
    const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported?.(type));
    universeMemoryVoiceRecorder=new MediaRecorder(universeMemoryVoiceStream,preferred?{mimeType:preferred}:undefined);
    universeMemoryVoiceRecorder.ondataavailable=e=>{if(e.data?.size)universeMemoryVoiceChunks.push(e.data);};
    universeMemoryVoiceRecorder.onstop=async()=>{
      const duration=Date.now()-universeMemoryVoiceStartedAt;
      const type=universeMemoryVoiceRecorder?.mimeType || universeMemoryVoiceChunks[0]?.type || 'audio/webm';
      const raw=new Blob(universeMemoryVoiceChunks,{type});
      universeMemoryVoiceStream?.getTracks?.().forEach(t=>t.stop()); universeMemoryVoiceStream=null; universeMemoryVoiceRecorder=null;
      if(status)status.textContent='Saving…';
      try{
        const normalized=await normalizeVoiceRecordingForPlayback(raw);
        const file=new File([normalized.blob],`voice-memory-${Date.now()}.${normalized.ext}`,{type:normalized.type,lastModified:Date.now()});
        const uploaded=await uploadAttachment(file);
        const clips=loadUniversePreview('voiceMemories',[]);
        clips.unshift({id:crypto.randomUUID?.()||String(Date.now()),entryId,url:uploaded.src,duration,type:normalized.type,createdAt:new Date().toISOString()});
        saveUniversePreview('voiceMemories',clips.slice(0,80));
        showToast('Voice Memory saved.');
      }catch(err){showToast(err?.message || 'Could not save Voice Memory.');}
      renderUniverseVoiceMemoryLab();
    };
    universeMemoryVoiceRecorder.start(250); if(start)start.disabled=true;if(stop)stop.disabled=false;if(status)status.textContent='Recording…';
    setTimeout(()=>{if(universeMemoryVoiceRecorder?.state==='recording')stopUniverseMemoryVoiceRecording();},45000);
  }catch(err){showToast(err?.name==='NotAllowedError'?'Microphone permission was not allowed.':'Could not start recording.');}
}
function stopUniverseMemoryVoiceRecording(){if(universeMemoryVoiceRecorder?.state==='recording')universeMemoryVoiceRecorder.stop();}

function renderUniverseLettersLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const letters=loadUniversePreview('letters',[]);
  const future=new Date();future.setFullYear(future.getFullYear()+1);
  stage.innerHTML=`<div class="lab-split">
    <form id="letterToForm" class="lab-compose-card lab-letter-paper"><p class="eyebrow">LETTER TO…</p><h4>Write something that belongs to another time.</h4><label class="lab-field">To<input name="to" maxlength="60" placeholder="Future me · Mom · My child · Sarah…" required /></label><label class="lab-field">Open on<input name="openDate" type="date" value="${future.toISOString().slice(0,10)}" required /></label><label class="lab-field">Letter<textarea name="body" rows="10" maxlength="2400" placeholder="Dear future me…" required></textarea></label><button class="primary" type="submit">Seal letter</button><small>Letters remain in this browser and do not notify anyone.</small></form>
    <section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">SEALED LETTERS</p><h4>Words waiting for the right day.</h4></div><span class="lab-preview-pill">${letters.length} letters</span></div><div class="letter-preview-list">${letters.map(l=>`<article><div class="letter-stamp">✉</div><div><small>TO ${escapeHtml(l.to)} · OPENS ${escapeHtml(universeDateLabel(l.openDate))}</small><p>${escapeHtml(String(l.body||'').slice(0,180))}${String(l.body||'').length>180?'…':''}</p></div><button class="icon-btn remove-letter-preview" type="button" data-preview-id="${escapeHtml(l.id)}">×</button></article>`).join('')||'<div class="lab-soft-empty">No sealed letters yet.</div>'}</div></section>
  </div>`;
  $('#letterToForm')?.addEventListener('submit',e=>{e.preventDefault();const form=new FormData(e.currentTarget);const item={id:crypto.randomUUID?.()||String(Date.now()),to:String(form.get('to')||'').trim(),openDate:String(form.get('openDate')||''),body:String(form.get('body')||'').trim(),createdAt:new Date().toISOString()};saveUniversePreview('letters',letters.concat(item));renderUniverseLettersLab();showToast('Letter sealed in feature.');});
  stage.querySelectorAll('.remove-letter-preview').forEach(btn=>btn.addEventListener('click',()=>{saveUniversePreview('letters',letters.filter(l=>l.id!==btn.dataset.previewId));renderUniverseLettersLab();}));
}

function renderUniverseCollaborativeLab() {
  const stage=$('#universeLabStage'),entry=universeSelectedEntry();if(!stage||!entry)return;
  const all=loadUniversePreview('collaborative',{}),contribs=all[entry.id]||[];
  const people=[...new Set([...(activeScrapbook?.members||[]),...entries.map(e=>e.author)])].filter(Boolean);
  stage.innerHTML=`<div class="lab-split"><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">COLLABORATIVE PAGE</p><h4>One page, remembered by more than one person.</h4></div><span class="lab-preview-pill">${contribs.length+1} perspectives</span></div><label class="lab-field">Memory<select id="collabMemorySelect">${universeMemorySelectOptions(entry.id)}</select></label><article class="collab-original"><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>${escapeHtml(universeExcerpt(entry,240))}</p><small>Original by ${escapeHtml(universeAuthor(entry).displayName||entry.author)}</small></article><div class="collab-contributions">${contribs.map(c=>`<article><div>${avatarHtml(authorProfiles?.[c.tag]||{tag:c.tag,displayName:c.tag},'collab-avatar')}</div><div><strong>${escapeHtml(authorProfiles?.[c.tag]?.displayName||c.tag)}</strong><p>${escapeHtml(c.text)}</p></div></article>`).join('')||'<div class="lab-soft-empty">No additional perspectives yet.</div>'}</div></section><form id="collabPreviewForm" class="lab-compose-card"><span class="lab-icon">＋</span><h4>Add another viewpoint.</h4><label class="lab-field">Contributor<select name="tag">${people.map(tag=>`<option value="${escapeHtml(tag)}">${escapeHtml(authorProfiles?.[tag]?.displayName||tag)} · @${escapeHtml(tag)}</option>`).join('')}</select></label><label class="lab-field">Their side of the story<textarea name="text" rows="7" maxlength="1000" required placeholder="I remember this day differently because…"></textarea></label><button class="primary" type="submit">Add perspective</button><small>This saves another viewpoint in your Memory Universe. It does not send an invitation.</small></form></div>`;
  $('#collabMemorySelect')?.addEventListener('change',e=>{universeSelectedEntryId=e.target.value;renderUniverseCollaborativeLab();});
  $('#collabPreviewForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),item={tag:String(f.get('tag')||me?.tag||''),text:String(f.get('text')||'').trim(),createdAt:new Date().toISOString()};all[entry.id]=contribs.concat(item);saveUniversePreview('collaborative',all);renderUniverseCollaborativeLab();showToast('Perspective added to feature.');});
}

function renderUniversePromptsLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const prompts=["What is a tiny detail from today you never want to forget?","Who made today feel different?","What ordinary object tells today’s story?","What did you hear that belongs to this memory?","What are you grateful happened exactly this way?","If this day had a title, what would it be?","What would future you misunderstand about today?","What did you learn about someone you love?","What moment today deserves more than a camera-roll photo?","What did you almost forget to notice?"];
  const day=Math.floor(Date.now()/86400000),prompt=prompts[day%prompts.length],saved=loadUniversePreview('promptDrafts',{}),key=new Date().toISOString().slice(0,10);
  stage.innerHTML=`<div class="prompt-lab"><section class="prompt-card"><small>TODAY’S MEMORY PROMPT</small><blockquote>“${escapeHtml(prompt)}”</blockquote><p>No streak pressure. No audience. Just something worth remembering.</p></section><form id="memoryPromptForm" class="lab-compose-card"><h4>Write from the prompt.</h4><textarea name="text" rows="9" maxlength="1800" placeholder="Start with whatever comes to mind…">${escapeHtml(saved[key]?.text||'')}</textarea><label class="lab-field">Working title<input name="title" maxlength="80" value="${escapeHtml(saved[key]?.title||'')}" placeholder="A small thing I want to keep" /></label><button class="primary" type="submit">Save prompt draft</button><small>Draft stays only in this browser. It does not become an official memory yet.</small></form></div>`;
  $('#memoryPromptForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);saved[key]={prompt,title:String(f.get('title')||'').trim(),text:String(f.get('text')||'').trim(),savedAt:new Date().toISOString()};saveUniversePreview('promptDrafts',saved);showToast('Prompt draft saved in feature.');});
}

function renderUniverseAnniversaryLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const now=new Date(),m=now.getMonth(),d=now.getDate();
  const exact=entries.filter(e=>{const dt=new Date(String(e.date||'')+'T12:00:00');return !Number.isNaN(dt)&&dt.getMonth()===m&&dt.getDate()===d&&dt.getFullYear()<now.getFullYear();}).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  let cards=exact;
  let heading='On this day';
  if(!cards.length){
    heading='Coming anniversaries';
    cards=[...entries].map(e=>{const dt=new Date(String(e.date||'')+'T12:00:00');if(Number.isNaN(dt))return null;let next=new Date(now.getFullYear(),dt.getMonth(),dt.getDate(),12);if(next<now)next.setFullYear(next.getFullYear()+1);return {entry:e,days:Math.ceil((next-now)/86400000),next};}).filter(Boolean).sort((a,b)=>a.days-b.days).slice(0,6);
  }
  stage.innerHTML=`<section class="anniversary-lab"><div class="lab-title-row"><div><p class="eyebrow">ANNIVERSARY RESURFACING</p><h4>${heading} should feel like reopening a page, not an engagement notification.</h4></div><span class="lab-preview-pill">${exact.length?'Today':'Upcoming'}</span></div><div class="anniversary-cards">${exact.length?cards.map(entry=>`<button type="button" data-anniversary-entry="${escapeHtml(entry.id)}">${universeEntryImage(entry)?`<img src="${escapeHtml(universeEntryImage(entry))}" alt="" />`:'<span>♡</span>'}<div><small>${now.getFullYear()-Number(String(entry.date).slice(0,4))} years ago</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>${escapeHtml(universeExcerpt(entry,130))}</p></div></button>`).join(''):cards.map(item=>`<button type="button" data-anniversary-entry="${escapeHtml(item.entry.id)}">${universeEntryImage(item.entry)?`<img src="${escapeHtml(universeEntryImage(item.entry))}" alt="" />`:'<span>♡</span>'}<div><small>IN ${item.days} ${item.days===1?'DAY':'DAYS'} · ${escapeHtml(universeDateLabel(item.entry.date,{month:'short',day:'numeric'}))}</small><strong>${escapeHtml(item.entry.title||'Untitled memory')}</strong><p>${escapeHtml(universeExcerpt(item.entry,130))}</p></div></button>`).join('')}</div></section>`;
  stage.querySelectorAll('[data-anniversary-entry]').forEach(btn=>btn.addEventListener('click',()=>openUniverseMemory(btn.dataset.anniversaryEntry)));
}

function renderUniverseRitualsLab() {
  const stage=$('#universeLabStage');if(!stage)return;const rituals=loadUniversePreview('rituals',[]);
  stage.innerHTML=`<div class="lab-split"><form id="ritualForm" class="lab-compose-card"><span class="lab-icon">◌</span><p class="eyebrow">PRIVATE RITUALS</p><h4>Make remembering a gentle habit.</h4><label class="lab-field">Ritual<input name="name" maxlength="80" required placeholder="Sunday family photo · Monthly letter · Friday gratitude" /></label><label class="lab-field">Rhythm<select name="cadence"><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option><option value="sunday">Every Sunday</option></select></label><button class="primary" type="submit">Add ritual</button><small>Private by design. No public streaks or rankings.</small></form><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">YOUR RHYTHMS</p><h4>Small traditions that build a life archive.</h4></div><span class="lab-preview-pill">${rituals.length} rituals</span></div><div class="ritual-grid">${rituals.map((r,i)=>`<article><span>${['♡','☼','◌','✦'][i%4]}</span><div><small>${escapeHtml(String(r.cadence||'').toUpperCase())}</small><strong>${escapeHtml(r.name)}</strong><p>Next gentle reminder will follow this rhythm.</p></div><button class="icon-btn remove-ritual-preview" data-preview-id="${escapeHtml(r.id)}" type="button">×</button></article>`).join('')||'<div class="lab-soft-empty">No rituals yet.</div>'}</div></section></div>`;
  $('#ritualForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),item={id:crypto.randomUUID?.()||String(Date.now()),name:String(f.get('name')||'').trim(),cadence:String(f.get('cadence')||'weekly')};saveUniversePreview('rituals',rituals.concat(item));renderUniverseRitualsLab();});
  stage.querySelectorAll('.remove-ritual-preview').forEach(btn=>btn.addEventListener('click',()=>{saveUniversePreview('rituals',rituals.filter(r=>r.id!==btn.dataset.previewId));renderUniverseRitualsLab();}));
}

function renderUniverseMemoryBoxLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const items=loadUniversePreview('memoryBox',[]);
  stage.innerHTML=`<div class="lab-split"><form id="memoryBoxForm" class="lab-compose-card"><span class="lab-icon">□</span><p class="eyebrow">MEMORY BOX</p><h4>Save first. Design later.</h4><textarea name="text" rows="6" maxlength="1000" placeholder="A quick thought, quote, tiny story, or something you don't want to lose…"></textarea><label class="lab-drop-photo">＋ Add one photo<input id="memoryBoxPhoto" type="file" accept="image/*" hidden /></label><div id="memoryBoxPhotoPreview" class="memory-box-photo-preview hidden"></div><button class="primary" type="submit">Drop into Memory Box</button><small>Items stay in your Memory Universe until you remove them.</small></form><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">UNSORTED KEEPSAKES</p><h4>Things waiting to find their page.</h4></div><span class="lab-preview-pill">${items.length} waiting</span></div><div class="memory-box-grid">${items.map(item=>`<article>${item.image?`<img src="${escapeHtml(item.image)}" alt="" />`:'<span>✧</span>'}<div><small>${new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(item.createdAt))}</small><p>${escapeHtml(item.text||'Photo saved for later.')}</p></div></article>`).join('')||'<div class="lab-soft-empty">Your Memory Box is empty.</div>'}</div></section></div>`;
  let pendingFile=null,pendingUrl='';
  $('#memoryBoxPhoto')?.addEventListener('change',e=>{pendingFile=e.target.files?.[0]||null;if(!pendingFile)return;if(pendingUrl)URL.revokeObjectURL(pendingUrl);pendingUrl=URL.createObjectURL(pendingFile);const p=$('#memoryBoxPhotoPreview');p.innerHTML=`<img src="${pendingUrl}" alt="Selected photo" />`;p.classList.remove('hidden');});
  $('#memoryBoxForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    if((universeTargetTag || me?.tag)!==me?.tag){showToast('This Memory Universe is read-only for you.');return;}
    const f=new FormData(e.currentTarget),text=String(f.get('text')||'').trim();
    if(!text&&!pendingFile){showToast('Add a note or a photo first.');return;}
    const submit=e.currentTarget.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
    try{
      let image='';
      if(pendingFile) image=(await uploadImage(pendingFile)).src;
      saveUniversePreview('memoryBox',[{id:crypto.randomUUID?.()||String(Date.now()),text,image,createdAt:new Date().toISOString()},...items].slice(0,120));
      if(pendingUrl)URL.revokeObjectURL(pendingUrl);
      renderUniverseMemoryBoxLab();
      showToast('Added to Memory Box.');
    }catch(err){showToast(err?.message || 'Could not save Memory Box item.');if(submit)submit.disabled=false;}
  });
}
function applyUniverseLivingThemePreview() {
  const view=$('#memoryUniverseView');
  if(!view)return;
  const state=loadUniversePreview('livingTheme',{theme:'travel'});
  const allowed=new Set(['travel','childhood','letters','school','family','faith']);
  const theme=allowed.has(state?.theme)?state.theme:'travel';
  view.dataset.livingTheme=theme;
}
function renderUniverseThemesLab() {
  const stage=$('#universeLabStage');if(!stage)return;const state=loadUniversePreview('livingTheme',{theme:'travel'});
  const themes={travel:{name:'Travel Journal',icon:'✈',line:'Passport stamps, route lines, tickets and place chapters.',action:'Browse by places and journeys'},childhood:{name:'Childhood Album',icon:'☁',line:'Soft paper, doodles, school labels and playful keepsakes.',action:'Browse by school year and age'},letters:{name:'Love Letters',icon:'♡',line:'Envelope folds, handwritten notes and sealed-letter transitions.',action:'Browse letters and relationship milestones'},school:{name:'School Years',icon:'✎',line:'Notebook paper, class years, subjects and graduation milestones.',action:'Browse by school year and graduation'},family:{name:'Family Archive',icon:'⌂',line:'Generations, heirlooms, family tree and archival captions.',action:'Browse people and generations'},faith:{name:'Faith Journey',icon:'✝',line:'Liturgical seasons, prayer reflections and spiritual milestones.',action:'Browse reflections and spiritual milestones'}};
  const selected=themes[state.theme]||themes.travel;
  applyUniverseLivingThemePreview();
  stage.innerHTML=`<div class="theme-lab"><aside class="theme-picker"><p class="eyebrow">LIVING SCRAPBOOK THEMES</p><h4>A theme should change how the scrapbook behaves, not only its color.</h4>${Object.entries(themes).map(([key,t])=>`<button class="${key===state.theme?'active':''}" type="button" data-theme-preview="${key}"><span>${t.icon}</span><div><strong>${t.name}</strong><small>${t.line}</small></div></button>`).join('')}</aside><section class="living-theme-preview theme-${escapeHtml(state.theme)}"><div class="theme-scene-head"><span>${selected.icon}</span><small>${escapeHtml(selected.name.toUpperCase())}</small></div><div class="theme-scene-page"><p class="eyebrow">${escapeHtml(activeScrapbook?.name||'SCRAPBOOK')}</p><h3>${escapeHtml(entries.at(-1)?.title||'A chapter worth keeping')}</h3><p>${escapeHtml(universeExcerpt(entries.at(-1),190))}</p><div class="theme-scene-decoration"></div></div><div class="theme-behavior-card"><strong>${escapeHtml(selected.action)}</strong><span>${escapeHtml(selected.line)}</span></div><p class="theme-behavior-copy">The selected theme now changes the whole Memory Universe background and atmosphere. Your scrapbook pages stay untouched.</p></section></div>`;
  stage.querySelectorAll('[data-theme-preview]').forEach(btn=>btn.addEventListener('click',()=>{saveUniversePreview('livingTheme',{theme:btn.dataset.themePreview});applyUniverseLivingThemePreview();renderUniverseThemesLab();}));
}

function renderUniversePeopleMemoryLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const counts=new Map();
  const bump=(tag,kind)=>{if(!tag)return;const item=counts.get(tag)||{tag,memories:0,comments:0,mentions:0};item[kind]++;counts.set(tag,item);};
  entries.forEach(entry=>{bump(entry.author,'memories');(entry.comments||[]).forEach(c=>bump(c.author,'comments'));const text=[entry.text,entry.title,...(entry.comments||[]).map(c=>c.text)].join(' ');for(const m of text.matchAll(/@([a-z0-9][a-z0-9_.-]{2,23})/gi))bump(m[1].toLowerCase(),'mentions');});
  const people=[...counts.values()].sort((a,b)=>(b.memories*3+b.comments+b.mentions)-(a.memories*3+a.comments+a.mentions)).slice(0,12);
  stage.innerHTML=`<section class="people-memory-lab"><div class="lab-title-row"><div><p class="eyebrow">PEOPLE INSIDE MY MEMORY</p><h4>Who actually lives inside this chapter?</h4></div><span class="lab-preview-pill">${people.length} people found</span></div><div class="people-memory-map">${people.map((item,index)=>{const p=authorProfiles?.[item.tag]||{tag:item.tag,displayName:item.tag};return `<button type="button" data-people-memory-tag="${escapeHtml(item.tag)}" style="--person-size:${Math.max(54,Math.min(100,54+item.memories*8+item.comments*2))}px;--person-delay:${index*18}ms">${avatarHtml(p,'people-memory-avatar')}<strong>${escapeHtml(p.displayName||p.tag)}</strong><small>${item.memories} memories · ${item.comments} comments · ${item.mentions} mentions</small></button>`;}).join('')||'<div class="lab-soft-empty">As people appear in memories, comments, and @mentions, they will gather here.</div>'}</div><p class="helper">This is not a popularity score. It simply shows who appears in the story of this scrapbook.</p></section>`;
  stage.querySelectorAll('[data-people-memory-tag]').forEach(btn=>btn.addEventListener('click',()=>openPersonProfile(btn.dataset.peopleMemoryTag)));
}

function renderUniverseVersionsLab() {
  const stage=$('#universeLabStage'),entry=universeSelectedEntry();if(!stage||!entry)return;
  const all=loadUniversePreview('versions',{}),versions=all[entry.id]||[];
  const latest=versions.at(-1);
  stage.innerHTML=`<div class="lab-split"><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">MEMORY VERSIONS</p><h4>See how the story changed without losing what came before.</h4></div><span class="lab-preview-pill">${versions.length+1} versions</span></div><label class="lab-field">Memory<select id="versionMemorySelect">${universeMemorySelectOptions(entry.id)}</select></label><div class="version-compare"><article><small>ORIGINAL</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>${escapeHtml(universeExcerpt(entry,500))}</p></article><article><small>${latest?'LATEST VERSION':'NO REVISION YET'}</small><strong>${escapeHtml(latest?.title||entry.title||'Untitled memory')}</strong><p>${escapeHtml(latest?.text||universeExcerpt(entry,500))}</p></article></div><div class="version-history">${versions.map((v,i)=>`<button type="button" data-version-index="${i}"><span>v${i+2}</span><div><strong>${escapeHtml(v.title||entry.title||'Untitled')}</strong><small>${escapeHtml(new Date(v.createdAt).toLocaleString())}</small></div></button>`).join('')||'<div class="lab-soft-empty">No revisions yet.</div>'}</div></section><form id="versionPreviewForm" class="lab-compose-card"><span class="lab-icon">≋</span><h4>Create a new version.</h4><p>Unlike Memory Layers, a version is a changed draft of the memory itself. Layers are reflections beside the original.</p><label class="lab-field">Title<input name="title" maxlength="100" value="${escapeHtml(latest?.title||entry.title||'')}" /></label><label class="lab-field">Revised memory<textarea name="text" rows="9" maxlength="2400">${escapeHtml(latest?.text||universeExcerpt(entry,1000))}</textarea></label><button class="primary" type="submit">Save version</button><small>Original Scrapella page remains untouched.</small></form></div>`;
  $('#versionMemorySelect')?.addEventListener('change',e=>{universeSelectedEntryId=e.target.value;renderUniverseVersionsLab();});
  $('#versionPreviewForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),v={id:crypto.randomUUID?.()||String(Date.now()),title:String(f.get('title')||'').trim(),text:String(f.get('text')||'').trim(),createdAt:new Date().toISOString()};all[entry.id]=versions.concat(v);saveUniversePreview('versions',all);renderUniverseVersionsLab();showToast('Version saved.');});
}

function renderUniverseVaultLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const vault=loadUniversePreview('vault',[]);
  stage.innerHTML=`<div class="lab-split"><form id="vaultPreviewForm" class="lab-compose-card vault-compose"><span class="lab-icon">▣</span><p class="eyebrow">PERSONAL VAULT</p><h4>A second lock for your most private memories.</h4><label class="lab-field">Memory<select name="entryId">${universeMemorySelectOptions(universeSelectedEntry()?.id||'')}</select></label><label class="lab-field">Protection idea<select name="mode"><option>PIN + device unlock</option><option>Biometric only</option><option>PIN + recovery phrase</option></select></label><button class="primary" type="submit">Add to Personal Vault</button><div class="vault-warning"><strong>Private Memory Universe shelf.</strong><span>Only you can load your saved Personal Vault shelf. Adding a memory here does not change the privacy of its original scrapbook page.</span></div></form><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">VAULT SHELF</p><h4>Memories behind another door.</h4></div><span class="lab-preview-pill">${vault.length} locked</span></div><div class="vault-grid">${vault.map(item=>{const e=entries.find(x=>x.id===item.entryId);return `<article><span>▣</span><div><small>${escapeHtml(item.mode)}</small><strong>${escapeHtml(e?.title||'Memory')}</strong><p>${escapeHtml(universeDateLabel(e?.date))}</p></div><button class="icon-btn remove-vault-preview" type="button" data-preview-id="${escapeHtml(item.id)}">×</button></article>`;}).join('')||'<div class="lab-soft-empty">Nothing is in Memory Universe vault yet.</div>'}</div></section></div>`;
  $('#vaultPreviewForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const item={id:crypto.randomUUID?.()||String(Date.now()),entryId:String(f.get('entryId')||''),mode:String(f.get('mode')||'PIN + device unlock')};if(vault.some(v=>v.entryId===item.entryId)){showToast('That memory is already in Memory Universe vault.');return;}saveUniversePreview('vault',vault.concat(item));renderUniverseVaultLab();});
  stage.querySelectorAll('.remove-vault-preview').forEach(btn=>btn.addEventListener('click',()=>{saveUniversePreview('vault',vault.filter(v=>v.id!==btn.dataset.previewId));renderUniverseVaultLab();}));
}

function renderUniverseFamilyLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const relatives=loadUniversePreview('family',[]);
  stage.innerHTML=`<div class="lab-split"><section class="lab-workbench family-tree-preview"><div class="lab-title-row"><div><p class="eyebrow">FAMILY HISTORY MODE</p><h4>A scrapbook that understands generations.</h4></div><span class="lab-preview-pill">${relatives.length+1} people</span></div><div class="family-tree-root">${avatarHtml(me||{},'family-tree-avatar')}<strong>${escapeHtml(me?.displayName||me?.tag||'You')}</strong><small>YOU</small></div><div class="family-tree-branches">${relatives.map((r,i)=>`<article style="--branch:${i}"><span>${escapeHtml(r.relation)}</span><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.years||'')}</small><p>${escapeHtml(r.story||'')}</p><button class="icon-btn remove-family-preview" type="button" data-preview-id="${escapeHtml(r.id)}">×</button></article>`).join('')||'<div class="lab-soft-empty">Add relatives to see the family-history layout take shape.</div>'}</div></section><form id="familyPreviewForm" class="lab-compose-card"><span class="lab-icon">⌂</span><h4>Add a family branch.</h4><label class="lab-field">Name<input name="name" maxlength="70" required placeholder="Lola Maria" /></label><label class="lab-field">Relationship<select name="relation"><option>Grandparent</option><option>Parent</option><option>Sibling</option><option>Child</option><option>Aunt / Uncle</option><option>Cousin</option><option>Ancestor</option><option>Other</option></select></label><label class="lab-field">Years<input name="years" maxlength="30" placeholder="1948–2024" /></label><label class="lab-field">One line to remember<textarea name="story" rows="4" maxlength="500" placeholder="She taught us…"></textarea></label><button class="primary" type="submit">Add family branch</button><small>Family History is saved to your Memory Universe.</small></form></div>`;
  $('#familyPreviewForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),item={id:crypto.randomUUID?.()||String(Date.now()),name:String(f.get('name')||'').trim(),relation:String(f.get('relation')||''),years:String(f.get('years')||'').trim(),story:String(f.get('story')||'').trim()};saveUniversePreview('family',relatives.concat(item));renderUniverseFamilyLab();});
  stage.querySelectorAll('.remove-family-preview').forEach(btn=>btn.addEventListener('click',()=>{saveUniversePreview('family',relatives.filter(r=>r.id!==btn.dataset.previewId));renderUniverseFamilyLab();}));
}

function renderUniverseInheritedLab() {
  const stage=$('#universeLabStage');if(!stage)return;const items=loadUniversePreview('inherited',[]);
  stage.innerHTML=`<div class="lab-split"><form id="inheritedPreviewForm" class="lab-compose-card"><span class="lab-icon">⇢</span><p class="eyebrow">INHERITED MEMORY</p><h4>Keep the story attached to who passed it down.</h4><label class="lab-field">Memory<select name="entryId">${universeMemorySelectOptions(universeSelectedEntry()?.id||'')}</select></label><label class="lab-field">Originally from<input name="from" maxlength="70" placeholder="Lola · Dad · @jill" required /></label><label class="lab-field">Pass forward to<input name="to" maxlength="70" placeholder="My children · @janella" /></label><label class="lab-field">Lineage note<textarea name="note" rows="5" maxlength="700" placeholder="This photo came from her old album…"></textarea></label><button class="primary" type="submit">Add lineage</button></form><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">MEMORY LINEAGE</p><h4>Stories can travel without losing their origin.</h4></div><span class="lab-preview-pill">${items.length} inherited</span></div><div class="inheritance-list">${items.map(item=>{const e=entries.find(x=>x.id===item.entryId);return `<article><div class="inheritance-chain"><span>${escapeHtml(item.from)}</span><i>→</i><strong>${escapeHtml(e?.title||'Memory')}</strong><i>→</i><span>${escapeHtml(item.to||'Future family')}</span></div><p>${escapeHtml(item.note||'')}</p></article>`;}).join('')||'<div class="lab-soft-empty">No inherited memories marked yet.</div>'}</div></section></div>`;
  $('#inheritedPreviewForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),item={id:crypto.randomUUID?.()||String(Date.now()),entryId:String(f.get('entryId')||''),from:String(f.get('from')||'').trim(),to:String(f.get('to')||'').trim(),note:String(f.get('note')||'').trim()};saveUniversePreview('inherited',items.concat(item));renderUniverseInheritedLab();});
}

async function renderUniverseQrLab() {
  const stage=$('#universeLabStage'),entry=universeSelectedEntry();if(!stage||!entry)return;
  stage.innerHTML=`<div class="lab-split qr-lab"><section class="qr-keepsake-preview"><div class="qr-keepsake-card">${universeEntryImage(entry)?`<img class="qr-keepsake-photo" src="${escapeHtml(universeEntryImage(entry))}" alt="" />`:'<div class="qr-keepsake-photo qr-empty">♡</div>'}<div><small>${escapeHtml(universeDateLabel(entry.date))}</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>Scan to reopen this memory in Scrapella.</p><div id="qrKeepsakeImage" class="qr-image-loading">Generating QR…</div></div></div></section><section class="lab-workbench"><div class="lab-title-row"><div><p class="eyebrow">SCRAPBOOK QR KEEPSAKES</p><h4>Let paper open the part paper cannot hold.</h4></div><span class="lab-preview-pill">Scannable keepsake</span></div><label class="lab-field">Memory<select id="qrMemorySelect">${universeMemorySelectOptions(entry.id)}</select></label><p class="qr-explainer">Print a tiny QR beside a photo, invitation, wedding album, memorial page, or physical scrapbook. The code can reopen the digital memory with its audio, video, and story.</p><button id="downloadQrBtn" class="primary" type="button" disabled>↓ Save QR image</button><small class="helper">Access still follows Scrapella privacy rules. A QR should never bypass a private scrapbook.</small></section></div>`;
  $('#qrMemorySelect')?.addEventListener('change',e=>{universeSelectedEntryId=e.target.value;renderUniverseQrLab();});
  try{
    const value=memoryShareUrl(entry.id);
    const data=await api(`/api/memory-universe/qr?value=${encodeURIComponent(value)}`);
    const host=$('#qrKeepsakeImage');if(host)host.innerHTML=`<img src="${escapeHtml(data.dataUrl)}" alt="QR code for this Scrapella memory" />`;
    const btn=$('#downloadQrBtn');if(btn){btn.disabled=false;btn.onclick=()=>{const a=document.createElement('a');a.href=data.dataUrl;a.download='scrapella-memory-qr.png';a.click();};}
  }catch(err){const host=$('#qrKeepsakeImage');if(host)host.textContent='Could not generate QR feature.';}
}

function secretProjectPerson(project,tag){
  return project?.profiles?.[tag] || {tag,displayName:tag,avatar:''};
}

function wireSecretTagSearch(input,host,onSelect){
  if(!input||!host)return;
  let timer=null,seq=0;
  const close=()=>{host.classList.add('hidden');host.innerHTML='';};
  const cleanValue=()=>String(input.value||'').trim().replace(/^@/,'').toLowerCase();
  const selectExact=async()=>{
    const q=cleanValue();
    if(!q)return false;
    try{
      const data=await api(`/api/people?q=${encodeURIComponent(q)}`);
      const exact=(data.people||[]).find(person=>String(person.tag||'').toLowerCase()===q && person.tag!==me?.tag);
      if(!exact)return false;
      onSelect(exact.tag,exact);
      close();
      return true;
    }catch{return false;}
  };
  input.addEventListener('input',()=>{
    clearTimeout(timer);
    const q=cleanValue();
    if(!q){close();return;}
    const current=++seq;
    timer=setTimeout(async()=>{
      try{
        const data=await api(`/api/people?q=${encodeURIComponent(q)}`);
        if(current!==seq)return;
        const people=(data.people||[]).filter(person=>person.tag!==me?.tag);
        if(!people.length){host.innerHTML='<div class="secret-tag-empty">No matching @tag.</div>';host.classList.remove('hidden');return;}
        host.innerHTML=people.map(person=>`<button type="button" data-secret-tag="${escapeHtml(person.tag)}">${avatarHtml(person,'secret-tag-avatar')}<span><strong>${escapeHtml(person.displayName||person.tag)}</strong><small>@${escapeHtml(person.tag)}</small></span></button>`).join('');
        host.classList.remove('hidden');
        host.querySelectorAll('[data-secret-tag]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
          e.preventDefault();
          const person=people.find(item=>item.tag===btn.dataset.secretTag);
          onSelect(btn.dataset.secretTag,person||null);
          close();
        }));
      }catch{close();}
    },180);
  });
  input.addEventListener('keydown',async e=>{
    if(!['Enter',',','Tab'].includes(e.key))return;
    const q=cleanValue();
    if(!q)return;
    if(e.key!=='Tab')e.preventDefault();
    const selected=await selectExact();
    if(!selected&&e.key!=='Tab')showToast(`We could not find @${q}.`);
  });
  input.addEventListener('blur',()=>setTimeout(close,220));
}
async function renderUniverseSecretLab(){
  const stage=$('#universeLabStage');if(!stage)return;
  stage.innerHTML='<div class="universe-empty wide"><span>✉</span><strong>Opening Secret Contributors…</strong><p>Loading shared surprises.</p></div>';
  let projects=[];
  try{projects=(await api('/api/memory-universe/secret-contributors')).projects||[];}
  catch(err){stage.innerHTML=`<div class="lab-soft-empty">Could not load Secret Contributors: ${escapeHtml(err.message||'Unknown error')}</div>`;return;}
  const future=new Date();future.setDate(future.getDate()+7);
  stage.innerHTML=`<div class="secret-beta-layout">
    <form id="secretProjectCreateForm" class="lab-compose-card secret-envelope">
      <span class="lab-icon">✉</span><p class="eyebrow">SECRET CONTRIBUTORS</p><h4>Create a surprise people can build together.</h4>
      <label class="lab-field">Surprise title<input name="title" maxlength="90" placeholder="For Sarah’s birthday" required /></label>
      <label class="lab-field">Recipient @tag<div class="secret-tag-field"><input id="secretRecipientTag" name="recipient" maxlength="30" placeholder="@friendtag" autocomplete="off" required /><div id="secretRecipientSuggestions" class="secret-tag-suggestions hidden"></div></div></label>
      <label class="lab-field">Reveal date<input name="revealDate" type="date" min="${new Date().toISOString().slice(0,10)}" value="${future.toISOString().slice(0,10)}" required /></label>
      <label class="lab-field">Invite contributors<div class="secret-tag-field"><input id="secretContributorTagInput" maxlength="30" placeholder="Search @friendtag" autocomplete="off" /><div id="secretContributorSuggestions" class="secret-tag-suggestions hidden"></div></div></label>
      <div id="secretContributorChips" class="secret-contributor-chips"></div>
      <button class="primary" type="submit">Create secret surprise</button>
      <small>The recipient sees only a sealed envelope until the reveal date. Invited contributors can add text or one photo.</small>
    </form>
    <section class="lab-workbench">
      <div class="lab-title-row"><div><p class="eyebrow">YOUR SECRET SURPRISES</p><h4>Contribute now. Reveal later.</h4></div><span class="lab-preview-pill">${projects.length} projects</span></div>
      <div class="secret-project-list">${projects.map(project=>{
        const owner=secretProjectPerson(project,project.owner);
        const recipient=secretProjectPerson(project,project.recipient);
        const contributorProfiles=(project.contributors||[]).map(tag=>secretProjectPerson(project,tag));
        if(project.sealed){
          return `<article class="secret-project-card sealed"><div class="secret-sealed-icon">✉</div><div><small>SEALED FOR YOU</small><strong>${escapeHtml(project.title)}</strong><p>This surprise opens on ${escapeHtml(universeDateLabel(project.revealDate))}.</p><span>Created privately by Scrapella contributors.</span></div></article>`;
        }
        const contributions=project.contributions||[];
        return `<article class="secret-project-card ${project.due?'revealed':''}" data-secret-project="${escapeHtml(project.id)}">
          <header><div><small>${project.due?'READY TO OPEN':project.role==='owner'?'YOU CREATED THIS':'YOU ARE A CONTRIBUTOR'}</small><strong>${escapeHtml(project.title)}</strong><p>For ${escapeHtml(recipient.displayName||recipient.tag)} · reveals ${escapeHtml(universeDateLabel(project.revealDate))}</p></div>${project.role==='owner'?`<button class="icon-btn secret-project-delete" type="button" data-secret-delete="${escapeHtml(project.id)}">×</button>`:''}</header>
          <div class="secret-project-people"><span>Created by ${escapeHtml(owner.displayName||owner.tag)}</span>${contributorProfiles.length?`<span>Contributors: ${contributorProfiles.map(p=>'@'+escapeHtml(p.tag)).join(', ')}</span>`:''}</div>
          ${project.due&&project.role==='recipient'?`<div class="secret-open-banner"><div><strong>♡ It is reveal day.</strong><span>Your surprise is ready. Open it when you are ready.</span></div><button class="primary secret-open-surprise" type="button" data-secret-open="${escapeHtml(project.id)}">Open surprise</button></div>`:''}
          <div class="secret-reveal-content ${project.due&&project.role==='recipient'?'hidden':''}" data-secret-content="${escapeHtml(project.id)}">
            <div class="secret-contribution-grid">${contributions.map(item=>{const p=secretProjectPerson(project,item.author);return `<article>${item.image?`<img src="${escapeHtml(item.image)}" alt="" loading="lazy" />`:'<span>✦</span>'}<div><small>${escapeHtml(p.displayName||p.tag)} · @${escapeHtml(p.tag||item.author)}</small>${item.text?`<p>${escapeHtml(item.text)}</p>`:''}<time>${escapeHtml(new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(item.createdAt)))}</time></div></article>`;}).join('')||'<div class="lab-soft-empty">No contributions yet.</div>'}</div>
          </div>
          ${project.canContribute?`<form class="secret-add-contribution" data-secret-contribute="${escapeHtml(project.id)}"><textarea name="text" rows="3" maxlength="1400" placeholder="Add a note, story, or memory…"></textarea><label class="ghost">▣ Photo<input type="file" name="photo" accept="image/*" hidden /></label><button class="primary" type="submit">Add secretly</button><small class="secret-photo-name"></small></form>`:''}
        </article>`;
      }).join('')||'<div class="lab-soft-empty">No shared surprises yet. Create one from the form.</div>'}</div>
    </section>
  </div>`;

  const selectedContributors=new Set();
  const chips=$('#secretContributorChips');
  const renderChips=()=>{
    if(chips)chips.innerHTML=[...selectedContributors].map(tag=>`<button type="button" data-remove-secret-tag="${escapeHtml(tag)}">@${escapeHtml(tag)} ×</button>`).join('');
    chips?.querySelectorAll('[data-remove-secret-tag]').forEach(btn=>btn.addEventListener('click',()=>{selectedContributors.delete(btn.dataset.removeSecretTag);renderChips();}));
  };
  const recipientInput=$('#secretRecipientTag');
  wireSecretTagSearch(recipientInput,$('#secretRecipientSuggestions'),tag=>{recipientInput.value='@'+tag;});
  wireSecretTagSearch($('#secretContributorTagInput'),$('#secretContributorSuggestions'),tag=>{selectedContributors.add(tag);$('#secretContributorTagInput').value='';renderChips();});
  $('#secretProjectCreateForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
    try{
      const f=new FormData(e.currentTarget),revealDate=String(f.get('revealDate')||'');
      const localReveal=new Date(revealDate+'T00:00:00');
      await api('/api/memory-universe/secret-contributors',{method:'POST',body:JSON.stringify({
        title:String(f.get('title')||'').trim(),
        recipient:String(f.get('recipient')||'').trim(),
        revealDate,
        revealAt:localReveal.toISOString(),
        contributors:[...selectedContributors]
      })});
      showToast('Secret surprise created. Contributors can now add to it.');
      await renderUniverseSecretLab();
    }catch(err){showToast(err.message||'Could not create the surprise.');btn.disabled=false;}
  });
  stage.querySelectorAll('[data-secret-open]').forEach(btn=>btn.addEventListener('click',()=>{
    const projectId=btn.dataset.secretOpen;
    const content=stage.querySelector(`[data-secret-content="${CSS.escape(projectId)}"]`);
    content?.classList.remove('hidden');
    btn.closest('.secret-open-banner')?.classList.add('opened');
    btn.remove();
    content?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }));
  stage.querySelectorAll('.secret-add-contribution').forEach(form=>{
    const fileInput=form.querySelector('input[type="file"]'),name=form.querySelector('.secret-photo-name');
    fileInput?.addEventListener('change',()=>{if(name)name.textContent=fileInput.files?.[0]?.name||'';});
    form.addEventListener('submit',async e=>{
      e.preventDefault();const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
      try{
        const f=new FormData(form),file=fileInput?.files?.[0]||null;let image='';
        if(file){const up=await uploadImage(file);image=up.src||'';}
        await api(`/api/memory-universe/secret-contributors/${encodeURIComponent(form.dataset.secretContribute)}/contributions`,{method:'POST',body:JSON.stringify({text:String(f.get('text')||'').trim(),image})});
        showToast('Secret contribution added.');
        await renderUniverseSecretLab();
      }catch(err){showToast(err.message||'Could not add the contribution.');btn.disabled=false;}
    });
  });
  stage.querySelectorAll('[data-secret-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Remove this surprise?'))return;
    try{await api(`/api/memory-universe/secret-contributors/${encodeURIComponent(btn.dataset.secretDelete)}`,{method:'DELETE'});await renderUniverseSecretLab();}
    catch(err){showToast(err.message||'Could not remove the surprise.');}
  }));
}
function renderUniverseUnfinishedLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const unfinished=entries.filter(entry=>{const text=String(entry.text||'').trim();const image=universeEntryImage(entry);return !entry.title||String(entry.title).trim().length<3||text.length<45||!image;}).slice(-12).reverse();
  stage.innerHTML=`<section class="unfinished-lab"><div class="lab-title-row"><div><p class="eyebrow">UNFINISHED MEMORIES</p><h4>Scrapella notices what you saved but never fully told.</h4></div><span class="lab-preview-pill">${unfinished.length} may need a little more</span></div><div class="unfinished-grid">${unfinished.map(entry=>{const missing=[];if(!universeEntryImage(entry))missing.push('photo');if(String(entry.text||'').trim().length<45)missing.push('story');if(!entry.title||String(entry.title).trim().length<3)missing.push('title');return `<article>${universeEntryImage(entry)?`<img src="${escapeHtml(universeEntryImage(entry))}" alt="" />`:'<div class="unfinished-photo">…</div>'}<div><small>${escapeHtml(universeDateLabel(entry.date))}</small><strong>${escapeHtml(entry.title||'Untitled memory')}</strong><p>Could use: ${escapeHtml(missing.join(', '))}</p><button class="ghost" type="button" data-unfinished-entry="${escapeHtml(entry.id)}">Open memory</button></div></article>`;}).join('')||'<div class="lab-soft-empty">Nothing looks unfinished right now.</div>'}</div><div class="unfinished-box-note"><strong>Memory Box + Unfinished Memories</strong><span>Memory Box catches things before they become pages. Unfinished Memories finds pages you already started but may want to complete.</span></div></section>`;
  stage.querySelectorAll('[data-unfinished-entry]').forEach(btn=>btn.addEventListener('click',()=>openUniverseMemory(btn.dataset.unfinishedEntry)));
}

function renderUniverseFaithLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  const all=loadUniversePreview('faithJournal',{}),today=new Date().toISOString().slice(0,10),item=all[today]||{};
  stage.innerHTML=`<div class="faith-journal"><header class="faith-journal-head"><span>✝</span><div><p class="eyebrow">CATHOLIC DAILY READING REFLECTION</p><h4>${escapeHtml(new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date()))}</h4><p>A quiet place for Scripture references, reflection, prayer, and one thing to carry into the day.</p></div></header><form id="faithJournalForm" class="faith-journal-page"><div class="faith-reading-grid"><label>First Reading<input name="reading1" maxlength="80" value="${escapeHtml(item.reading1||'')}" placeholder="e.g. Isaiah 55:10–11" /></label><label>Psalm<input name="psalm" maxlength="80" value="${escapeHtml(item.psalm||'')}" placeholder="e.g. Psalm 34" /></label><label>Second Reading <small>(if applicable)</small><input name="reading2" maxlength="80" value="${escapeHtml(item.reading2||'')}" placeholder="Reference" /></label><label>Gospel<input name="gospel" maxlength="80" value="${escapeHtml(item.gospel||'')}" placeholder="e.g. Matthew 6:7–15" /></label></div><label><span>Word or phrase that stayed with me</span><input name="word" maxlength="180" value="${escapeHtml(item.word||'')}" placeholder="A phrase from today’s readings…" /></label><label><span>Reflection</span><textarea name="reflection" rows="7" maxlength="2400" placeholder="What is God inviting me to notice today?">${escapeHtml(item.reflection||'')}</textarea></label><div class="faith-two"><label><span>Prayer</span><textarea name="prayer" rows="4" maxlength="1000" placeholder="Lord…">${escapeHtml(item.prayer||'')}</textarea></label><label><span>One action today</span><textarea name="action" rows="4" maxlength="700" placeholder="Today I will…">${escapeHtml(item.action||'')}</textarea></label></div><button class="primary" type="submit">Save today’s reflection</button><small class="helper">Enter the Catholic reading references you are reflecting on. Scrapella stores your references, reflection, prayer, and action in Memory Universe.</small></form></div>`;
  $('#faithJournalForm')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);all[today]={reading1:String(f.get('reading1')||'').trim(),psalm:String(f.get('psalm')||'').trim(),reading2:String(f.get('reading2')||'').trim(),gospel:String(f.get('gospel')||'').trim(),word:String(f.get('word')||'').trim(),reflection:String(f.get('reflection')||'').trim(),prayer:String(f.get('prayer')||'').trim(),action:String(f.get('action')||'').trim(),savedAt:new Date().toISOString()};saveUniversePreview('faithJournal',all);showToast('Today’s Catholic reflection saved in feature.');});
}

async function renderUniverseFreedomWallLab() {
  const stage=$('#universeLabStage');if(!stage)return;
  stage.innerHTML=`<div class="freedom-wall-lab"><header class="freedom-wall-head"><div><p class="eyebrow">SCRAPELLA FREEDOM WALL</p><h4>A giant wall for small thoughts.</h4><p>Every signed-in Scrapella user can leave one photo with text, or text alone. Names are clickable. Posts are timestamped. This wall is shared across signed-in Scrapella users.</p></div><span class="lab-preview-pill">Global wall</span></header><form id="freedomWallForm" class="freedom-wall-compose"><div class="freedom-wall-me">${avatarHtml(me||{},'freedom-wall-avatar')}</div><textarea name="text" rows="3" maxlength="900" placeholder="Leave something on the wall…"></textarea><label class="ghost freedom-wall-photo">▣ Photo<input id="freedomWallPhotoInput" type="file" accept="image/*" hidden /></label><div id="freedomWallPhotoPreview" class="freedom-wall-photo-preview hidden"></div><button class="primary" type="submit">Post to wall</button></form><div id="freedomWallCanvas" class="freedom-wall-canvas"><div class="lab-soft-empty">Loading the wall…</div></div></div>`;
  let pendingFile=null;
  $('#freedomWallPhotoInput')?.addEventListener('change',e=>{pendingFile=e.target.files?.[0]||null;const host=$('#freedomWallPhotoPreview');if(!pendingFile){host.classList.add('hidden');host.innerHTML='';return;}const url=URL.createObjectURL(pendingFile);host.innerHTML=`<img src="${url}" alt="Selected wall photo" /><button type="button" aria-label="Remove photo">×</button>`;host.classList.remove('hidden');host.querySelector('button').onclick=()=>{pendingFile=null;host.classList.add('hidden');host.innerHTML='';};});
  $('#freedomWallForm')?.addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]'),text=String(new FormData(e.currentTarget).get('text')||'').trim();if(!text&&!pendingFile){showToast('Write something or add a photo.');return;}btn.disabled=true;try{let image='';if(pendingFile){const up=await uploadImage(pendingFile);image=up.src||'';}await api('/api/memory-universe/freedom-wall',{method:'POST',body:JSON.stringify({text,image})});showToast('Posted to the Freedom Wall feature.');await renderUniverseFreedomWallLab();}catch(err){showToast(err.message||'Could not post to the wall.');btn.disabled=false;}});
  try{
    universeFreedomWallCache=await api('/api/memory-universe/freedom-wall');
    const posts=universeFreedomWallCache.posts||[],profiles=universeFreedomWallCache.profiles||{};
    const canvas=$('#freedomWallCanvas');
    canvas.innerHTML=posts.slice().reverse().map((post,index)=>{const p=profiles[post.author]||{tag:post.author,displayName:post.author};const tilt=((String(post.id).charCodeAt(0)||0)%7)-3;return `<article class="freedom-note freedom-note-${index%5}" style="--wall-tilt:${tilt}deg"><header><button type="button" data-wall-profile="${escapeHtml(post.author)}">${avatarHtml(p,'freedom-note-avatar')}<span><strong>${escapeHtml(p.displayName||p.tag)}</strong><small>@${escapeHtml(p.tag||post.author)}</small></span></button>${post.author===me?.tag||me?.isPlatformOwner?`<button class="freedom-note-delete" type="button" data-wall-delete="${escapeHtml(post.id)}">×</button>`:''}</header>${post.image?`<img class="freedom-note-photo" src="${escapeHtml(post.image)}" alt="" loading="lazy" />`:''}${post.text?`<p>${mentionTextHtml(post.text)}</p>`:''}<time>${escapeHtml(new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(post.createdAt)))}</time></article>`;}).join('')||'<div class="lab-soft-empty">The wall is empty. Be the first to leave something.</div>';
    canvas.querySelectorAll('[data-wall-profile]').forEach(btn=>btn.addEventListener('click',()=>openPersonProfile(btn.dataset.wallProfile)));
    wireProfileLinks(canvas);
    canvas.querySelectorAll('[data-wall-delete]').forEach(btn=>btn.addEventListener('click',async()=>{try{await api(`/api/memory-universe/freedom-wall/${encodeURIComponent(btn.dataset.wallDelete)}`,{method:'DELETE'});await renderUniverseFreedomWallLab();}catch(err){showToast(err.message);}}));
  }catch(err){const canvas=$('#freedomWallCanvas');if(canvas)canvas.innerHTML=`<div class="lab-soft-empty">Could not load the Freedom Wall: ${escapeHtml(err.message||'Unknown error')}</div>`;}
}

function renderUniverseArchiveLab() {
  const stage=$('#universeLabStage');
  if(!stage)return;
  const comments=entries.reduce((sum,entry)=>sum+(Array.isArray(entry.comments)?entry.comments.length:0),0);
  const photos=entries.reduce((sum,entry)=>sum+(Array.isArray(entry.photos)?entry.photos.length:0)+(Array.isArray(entry.canvasItems)?entry.canvasItems.filter(item=>item?.type==='photo').length:0),0);
  stage.innerHTML=`<div class="archive-lab">
    <section class="archive-vault-visual"><div class="archive-box"><span>♡</span><strong>${escapeHtml(activeScrapbook?.name||'Your scrapbook')}</strong><small>PORTABLE MEMORY ARCHIVE</small></div><div class="archive-shadow"></div></section>
    <section class="lab-workbench archive-copy">
      <div class="lab-title-row"><div><p class="eyebrow">PORTABLE ARCHIVE</p><h4>Your memories should never feel trapped inside one app.</h4></div><span class="lab-preview-pill">Portable export</span></div>
      <p>Export a readable copy of this chapter. The JSON keeps the scrapbook structure and metadata; the HTML keeps a simple human-readable keepsake you can open in a browser.</p>
      <div class="archive-stats"><div><strong>${entries.length}</strong><span>memories</span></div><div><strong>${photos}</strong><span>visual items</span></div><div><strong>${comments}</strong><span>comments</span></div></div>
      <div class="archive-actions"><button id="downloadArchiveJsonBtn" class="primary" type="button">↓ Download archive JSON</button><button id="downloadArchiveHtmlBtn" class="ghost" type="button">↓ Download keepsake HTML</button></div>
      <small class="helper">Export a portable copy of the memories currently visible in your Memory Universe.</small>
    </section>
  </div>`;
  $('#downloadArchiveJsonBtn')?.addEventListener('click',()=>downloadUniverseArchive('json'));
  $('#downloadArchiveHtmlBtn')?.addEventListener('click',()=>downloadUniverseArchive('html'));
}

function renderMemoryUniverse() {
  applyUniverseLivingThemePreview();
  const ordered=[...entries].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt).localeCompare(String(b.createdAt)));
  const profile=universeContextProfile || me || {};
  const self=(profile.tag || universeTargetTag)===me?.tag;
  const display=profile.displayName || profile.tag || 'Your';
  const title=$('#memoryUniverseHeroTitle');
  if(title)title.textContent=self ? 'Your memories are more than a feed.' : `${display}’s Memory Universe`;
  const audience=$('#memoryUniverseAudience');
  if(audience){
    audience.textContent=universeCanSeeExtended
      ? (self
          ? (universeOwnerOverride ? 'Owner override is on: Followers Only, Partner Only, Only You, Groups, and your bound Partner memories are included.' : 'Standard owner view: Followers Only memories plus Groups and your bound Partner context. Use owner override to include Partner Only and Only You memories.')
          : 'You follow this person, so Memory Echoes and all Memory Universe features are available alongside the memories shared with you.')
      : 'Only Memory Constellation is visible here. It includes Followers Only memories you can access, shared Groups, and bound Partner context when applicable.';
  }
  const overrideBtn=$('#memoryUniverseOwnerOverrideBtn');
  if(overrideBtn){
    overrideBtn.classList.toggle('hidden',!self);
    overrideBtn.textContent=universeOwnerOverride ? 'Owner override: showing all' : 'Owner override: show Partner + Only You';
    overrideBtn.classList.toggle('active',universeOwnerOverride);
  }
  document.querySelectorAll('#memoryUniverseView .universe-extended-section').forEach(el=>el.classList.toggle('hidden',!universeCanSeeExtended));

  if(!ordered.length){
    $('#memoryUniverseStats').innerHTML='';
    $('#memoryConstellationNodes').innerHTML='<div class="universe-empty constellation-empty"><span>♡</span><strong>No visible memories yet.</strong><p>Memories will appear here when their privacy and shared-book access allow it.</p></div>';
    $('#memoryConstellationLines').innerHTML='';
    $('#memoryEchoesGrid').innerHTML='';
    $('#memoryPerspectivesGrid').innerHTML='';
    renderMemoryUniverseDetail(null);
    if(universeCanSeeExtended)renderUniverseLabs();
    return;
  }
  const people=new Set(ordered.map(e=>e.author).filter(Boolean)).size;
  const visuals=ordered.filter(e=>universeEntryImage(e)).length;
  const years=[...new Set(ordered.map(e=>String(e.date||'').slice(0,4)).filter(y=>/^\d{4}$/.test(y)))];
  $('#memoryUniverseStats').innerHTML=`<div><strong>${ordered.length}</strong><span>memories</span></div><div><strong>${people}</strong><span>${people===1?'voice':'voices'}</span></div><div><strong>${visuals}</strong><span>visual moments</span></div><div><strong>${escapeHtml(years.length>1?`${years[0]}–${years[years.length-1]}`:(years[0]||'Now'))}</strong><span>chapter span</span></div>`;
  renderMemoryConstellation(ordered);
  if(universeCanSeeExtended){
    renderMemoryEchoes(ordered);
    $('#memoryPerspectivesGrid').innerHTML='';
    renderUniverseLabs();
  }else{
    $('#memoryEchoesGrid').innerHTML='';
    $('#memoryPerspectivesGrid').innerHTML='';
    $('#universeLabStage').innerHTML='';
  }
}
function closeMemoryReplay() {
  clearTimeout(universeReplayTimer);
  universeReplayTimer=null;
  universeReplayOverlay?.remove();
  universeReplayOverlay=null;
  document.body.classList.remove('memory-replay-open');
}
function startMemoryReplay(startEntryId='') {
  const ordered=[...entries].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt).localeCompare(String(b.createdAt)));
  if(!ordered.length){showToast('Add a memory first.');return;}
  closeMemoryReplay();
  let index=Math.max(0,ordered.findIndex(e=>e.id===startEntryId));
  let paused=false;
  const overlay=document.createElement('div');
  overlay.className='memory-replay-overlay';
  overlay.innerHTML=`<section class="memory-replay" role="dialog" aria-modal="true" aria-label="Life Replay"><button class="memory-replay-close" type="button">×</button><div class="memory-replay-backdrop"></div><div class="memory-replay-shade"></div><div class="memory-replay-content"><p class="memory-replay-kicker">LIFE REPLAY · ${escapeHtml(activeScrapbook?.name||'SCRAPBOOK')}</p><div class="memory-replay-author"></div><time class="memory-replay-date"></time><h2 class="memory-replay-title"></h2><p class="memory-replay-text"></p></div><div class="memory-replay-footer"><div class="memory-replay-progress"><i></i></div><div class="memory-replay-controls"><button class="memory-replay-prev" type="button">←</button><button class="memory-replay-toggle" type="button">Ⅱ</button><button class="memory-replay-next" type="button">→</button><span class="memory-replay-count"></span></div></div></section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('memory-replay-open');
  universeReplayOverlay=overlay;
  const backdrop=overlay.querySelector('.memory-replay-backdrop');
  const progress=overlay.querySelector('.memory-replay-progress i');
  const toggle=overlay.querySelector('.memory-replay-toggle');
  const render=()=>{
    const entry=ordered[index],author=universeAuthor(entry),image=universeEntryImage(entry);
    backdrop.style.backgroundImage=image?`url("${String(image).replace(/"/g,'\\"')}")`:'none';
    backdrop.classList.toggle('no-image',!image);
    overlay.querySelector('.memory-replay-date').textContent=universeDateLabel(entry.date);
    overlay.querySelector('.memory-replay-title').textContent=entry.title||'Untitled memory';
    overlay.querySelector('.memory-replay-text').textContent=universeExcerpt(entry,280);
    overlay.querySelector('.memory-replay-author').innerHTML=`${avatarHtml(author,'memory-replay-avatar')}<span>${escapeHtml(author.displayName||author.tag||'Someone')}</span>`;
    overlay.querySelector('.memory-replay-count').textContent=`${index+1} / ${ordered.length}`;
    progress.style.width=`${((index+1)/ordered.length)*100}%`;
    clearTimeout(universeReplayTimer);
    if(!paused)universeReplayTimer=setTimeout(()=>{if(index<ordered.length-1){index++;render();}else{paused=true;toggle.textContent='▶';}},4800);
  };
  const move=delta=>{index=Math.max(0,Math.min(ordered.length-1,index+delta));render();};
  overlay.querySelector('.memory-replay-close').addEventListener('click',closeMemoryReplay);
  overlay.querySelector('.memory-replay-prev').addEventListener('click',()=>move(-1));
  overlay.querySelector('.memory-replay-next').addEventListener('click',()=>move(1));
  toggle.addEventListener('click',()=>{paused=!paused;toggle.textContent=paused?'▶':'Ⅱ';render();});
  render();
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
  memoryUniverseView?.classList.toggle('hidden', mode !== 'universe');
  connectionsView.classList.toggle('hidden', mode !== 'connections');
  messagesView.classList.toggle('hidden', mode !== 'messages');
  personProfileView.classList.toggle('hidden', mode !== 'person');
  $('#homeModeBtn').classList.toggle('active', mode === 'home');
  $('#bookModeBtn').classList.toggle('active', mode === 'book' || (isPhoneUI() && mode === 'stream'));
  $('#streamModeBtn').classList.toggle('active', mode === 'stream');
  $('#universeModeBtn')?.classList.toggle('active', mode === 'universe');
  $('#connectionsModeBtn').classList.toggle('active', mode === 'connections' || mode === 'person');
  $('#messagesModeBtn').classList.toggle('active', mode === 'messages');
  recordPhoneHistory(mode);

  const noBook = !activeScrapbook;
  const noEntries = activeScrapbook && !entries.length;
  const canWrite = Boolean(activeScrapbook && activeScrapbook.canWrite !== false);
  $('#newEntryBtn').classList.toggle('hidden', mode === 'home' || mode === 'person' || mode === 'messages' || mode === 'universe' || (Boolean(activeScrapbook) && !canWrite));
  const desktopWorkspaceVisible = !isPhoneUI() && mode === 'book';
  $('#desktopScrapbookBar')?.classList.toggle('hidden', !desktopWorkspaceVisible);
  $('#desktopNewMemoryBtn')?.classList.toggle('hidden', !desktopWorkspaceVisible || !canWrite);
  if (!isPhoneUI()) {
    if (mode === 'book') renderPersonalPrivacyQuick();
    else parkDesktopNewMemoryButton();
  }
  emptyState.classList.toggle('hidden', mode === 'home' || mode === 'cover' || mode === 'connections' || mode === 'person' || mode === 'messages' || mode === 'universe' || (!noBook && !noEntries));
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
  if (mode === 'universe') {
    renderMemoryUniverse();
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
  if (currentMode === 'universe') renderMemoryUniverse();
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
  item.rotation = ((Number(item.rotation) || 0) % 360 + 360) % 360;
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

function canvasTextItemPlainValue(item){
  const div=document.createElement('div');
  div.innerHTML=String(item?.html || '');
  return String(div.innerText || div.textContent || '').replace(/\u00a0/g,' ').trim();
}
function validateCanvasTextBoxes(){
  const empty=editingCanvasItems.find(item=>item.type==='text' && !canvasTextItemPlainValue(item));
  if(!empty)return true;
  selectedCanvasItemId=empty.id;
  renderCanvasEditor();
  const content=$('#scrapCanvas')?.querySelector(`[data-canvas-id="${CSS.escape(empty.id)}"] .canvas-text-content`);
  content?.focus();
  $('#editorError').textContent='Every text box must contain text before you save this memory.';
  showToast('Fill in every text box before saving.');
  return false;
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
      <button class="canvas-rotate-handle" type="button" title="Rotate photo" aria-label="Rotate photo">↻</button>
      <img src="${escapeHtml(item.src)}" alt="Scrapbook photo" draggable="false" />
      ${item.caption ? `<div class="canvas-photo-caption">${escapeHtml(item.caption)}</div>` : ''}
      <span class="canvas-resize-handle" aria-hidden="true"></span>
    </div>`;
  }
  const size=Math.max(7,Math.min(42,Number(item.size)||18));
  return `<div class="canvas-item canvas-text-item${selected} ${canvasFontClass(item.font)}" data-canvas-id="${escapeHtml(item.id)}" style="${canvasItemStyle(item)};--edit-text-size:${size}px;text-align:${['left','center','right','justify'].includes(item.align)?item.align:'left'};${item.bold?'font-weight:700;':''}${item.italic?'font-style:italic;':''}">
    <button class="canvas-remove-item" type="button" title="Remove text box">×</button>
    <button class="canvas-rotate-handle" type="button" title="Rotate text box" aria-label="Rotate text box">↻</button>
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
  refreshScrapellaSelect($('#canvasPageSize'));
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
      if(e.target.closest('.canvas-remove-item,.canvas-resize-handle,.canvas-rotate-handle,.canvas-text-content'))return;
      if(item.type==='text'&&!e.target.closest('.canvas-drag-handle'))return;
      bringItemFront();
      const r=rect();
      const sx=e.clientX,sy=e.clientY,ox=item.x,oy=item.y;
      let nextX=ox,nextY=oy;
      try{el.setPointerCapture(e.pointerId);}catch{}
      el.classList.add('dragging');
      const move=ev=>{
        if(canvasGesturePinching)return;
        const rawDx=ev.clientX-sx,rawDy=ev.clientY-sy;
        const dx=rawDx/r.width*100,dy=rawDy/r.height*100;
        nextX=Math.max(0,Math.min(100-item.w,ox+dx));
        nextY=Math.max(0,Math.min(100-item.h,oy+dy));
        const visualDx=(nextX-ox)/100*r.width;
        const visualDy=(nextY-oy)/100*r.height;
        el.style.setProperty('--drag-x',`${visualDx}px`);
        el.style.setProperty('--drag-y',`${visualDy}px`);
      };
      const up=()=>{
        item.x=nextX;item.y=nextY;
        el.removeEventListener('pointermove',move);
        el.removeEventListener('pointerup',up);
        el.removeEventListener('pointercancel',up);
        el.classList.remove('dragging');
        el.style.setProperty('--drag-x','0px');
        el.style.setProperty('--drag-y','0px');
        el.style.left=`${item.x}%`;
        el.style.top=`${item.y}%`;
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


    const rotateHandle=el.querySelector('.canvas-rotate-handle');
    rotateHandle?.addEventListener('pointerdown',e=>{
      e.preventDefault();
      e.stopPropagation();
      bringItemFront();
      const box=el.getBoundingClientRect();
      const cx=box.left+box.width/2,cy=box.top+box.height/2;
      const startAngle=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI;
      const startRotation=Number(item.rotation)||0;
      try{rotateHandle.setPointerCapture(e.pointerId);}catch{}
      el.classList.add('rotating');
      const move=ev=>{
        const angle=Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI;
        item.rotation=((startRotation+(angle-startAngle))%360+360)%360;
        el.style.setProperty('--item-rotation',`${item.rotation}deg`);
      };
      const up=()=>{
        rotateHandle.removeEventListener('pointermove',move);
        rotateHandle.removeEventListener('pointerup',up);
        rotateHandle.removeEventListener('pointercancel',up);
        el.classList.remove('rotating');
      };
      rotateHandle.addEventListener('pointermove',move);
      rotateHandle.addEventListener('pointerup',up);
      rotateHandle.addEventListener('pointercancel',up);
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
        const desktopMouseDrag = !isPhoneUI() && e.pointerType === 'mouse' && e.button === 0;
        const phoneTouchDrag = isPhoneUI() && e.pointerType !== 'mouse';
        if(!desktopMouseDrag && !phoneTouchDrag)return;

        const r=rect();
        const sx=e.clientX,sy=e.clientY,ox=item.x,oy=item.y;
        const pointerId=e.pointerId;
        let longDragging=false;
        let cancelled=false;

        let nextX=ox,nextY=oy;
        const timer=setTimeout(()=>{
          if(cancelled)return;
          longDragging=true;
          content.dataset.longDragged='1';
          content.blur();
          savedCanvasTextRange=null;
          try{window.getSelection()?.removeAllRanges();}catch{}
          try{content.setPointerCapture(pointerId);}catch{}
          el.classList.add('dragging','long-dragging');
        },160);

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
          nextX=Math.max(0,Math.min(100-item.w,ox+dx));
          nextY=Math.max(0,Math.min(100-item.h,oy+dy));
          el.style.setProperty('--drag-x',`${(nextX-ox)/100*r.width}px`);
          el.style.setProperty('--drag-y',`${(nextY-oy)/100*r.height}px`);
          ev.preventDefault();
        };

        const finish=()=>{
          cancelled=true;
          clearTimeout(timer);
          content.removeEventListener('pointermove',move);
          content.removeEventListener('pointerup',finish);
          content.removeEventListener('pointercancel',finish);
          if(longDragging){
            item.x=nextX;item.y=nextY;
            el.classList.remove('dragging','long-dragging');
            el.style.setProperty('--drag-x','0px');
            el.style.setProperty('--drag-y','0px');
            el.style.left=`${item.x}%`;
            el.style.top=`${item.y}%`;
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
let nativeChatNotificationsReady = false;
let nativePushRegistrationReady = false;
let nativePushToken = '';
let nativeAppInfoPromise=null;
function versionAtLeast(value,minimum){
  const a=String(value||'0').split('.').map(v=>Number.parseInt(v,10)||0);
  const b=String(minimum||'0').split('.').map(v=>Number.parseInt(v,10)||0);
  for(let i=0;i<Math.max(a.length,b.length);i++){
    if((a[i]||0)>(b[i]||0))return true;
    if((a[i]||0)<(b[i]||0))return false;
  }
  return true;
}
async function nativeNotificationIconOptions(){
  if(!isNativeScrapellaApp() || nativePlatform()!=='android')return {};
  try{
    const appPlugin=nativePlugin('App');
    if(!appPlugin?.getInfo)return {};
    nativeAppInfoPromise ||= appPlugin.getInfo().catch(()=>null);
    const info=await nativeAppInfoPromise;
    return versionAtLeast(info?.version,'2.3.1')
      ? {smallIcon:'ic_stat_scrapella',iconColor:'#6e3d46'}
      : {};
  }catch{return {};}
}
function nativeNotificationId(value='') {
  const text=String(value||Date.now());
  let hash=0;
  for (let i=0;i<text.length;i++) hash=((hash<<5)-hash+text.charCodeAt(i))|0;
  return Math.abs(hash || Date.now()) % 2147483000;
}
async function ensureNativeChatNotifications() {
  if (!isNativeScrapellaApp()) return;
  const local = nativePlugin('LocalNotifications');
  const push = nativePlugin('PushNotifications');

  try {
    if (local && !nativeChatNotificationsReady) {
      let permission = local.checkPermissions ? await permissionTimeout(local.checkPermissions(),4000) : null;
      if (permission?.display !== 'granted' && local.requestPermissions) {
        permission = await permissionTimeout(local.requestPermissions(),9000);
      }
      if (nativePlatform() === 'android' && local.createChannel) {
        await local.createChannel({
          id:'messages',
          name:'Messages',
          description:'Scrapella chat messages',
          importance:5,
          visibility:1,
          vibration:true,
          sound:'default'
        }).catch(()=>{});
        await local.createChannel({
          id:'activity',
          name:'Comments & mentions',
          description:'Scrapella comments and mentions',
          importance:5,
          visibility:1,
          vibration:true,
          sound:'default'
        }).catch(()=>{});
      }
      if (local.addListener) {
        await local.addListener('localNotificationActionPerformed', async event => {
          const extra=event?.notification?.extra || {};
          const chatId=String(extra.chatId || '');
          const scrapbookId=String(extra.scrapbookId || '');
          const entryId=String(extra.entryId || '');
          if (chatId) {
            showView('messages');
            await loadChats().catch(()=>{});
            if (chats.some(chat=>chat.id===chatId)) await openChat(chatId).catch(()=>{});
            return;
          }
          if(scrapbookId && entryId){
            await openNotificationMemory(scrapbookId,entryId).catch(()=>{});
            return;
          }
          await loadNotificationHub({markRead:true}).catch(()=>{});
        });
      }
      nativeChatNotificationsReady = permission?.display === 'granted';
    }
  } catch {}

  // Register the actual OS push token so messages can arrive even when
  // Scrapella is backgrounded or closed. This uses Capacitor PushNotifications.
  try {
    if (push && !nativePushRegistrationReady) {
      nativePushRegistrationReady = true;
      if (push.addListener) {
        await push.addListener('registration', async token => {
          nativePushToken=String(token?.value || '');
          if (!nativePushToken) return;
          try {
            const result=await api('/api/push/native/register',{
              method:'POST',
              body:JSON.stringify({token:nativePushToken,platform:nativePlatform()})
            });
            config.nativePushEnabled=result?.nativePushReady===true;
          } catch {}
        });
        await push.addListener('registrationError', error => {
          nativePushRegistrationReady=false;
          console.warn('Native push registration failed:',error?.error || error?.message || error);
        });
        await push.addListener('pushNotificationActionPerformed', async event => {
          const data=event?.notification?.data || {};
          const url=String(data.url || '');
          const match=url.match(/[?&]messages=([^&]+)/);
          const chatId=match ? decodeURIComponent(match[1]) : '';
          if (chatId) {
            showView('messages');
            await loadChats().catch(()=>{});
            if (chats.some(chat=>chat.id===chatId)) await openChat(chatId).catch(()=>{});
          } else if ((url.includes('universe=secret') || url.includes('beta=secret'))) {
            showView('universe');
            universeLabSetMode('secret');
          } else if (url.includes('notifications=1')) {
            loadNotificationHub({markRead:true}).catch(()=>{});
          }
        });
        await push.addListener('pushNotificationReceived', notification => {
          // Foreground push events are already visible in-app. LocalNotifications
          // mirrors them into the system tray when appropriate.
          const data=notification?.data || {};
          const match=String(data.url||'').match(/[?&]messages=([^&]+)/);
          const chatId=match ? decodeURIComponent(match[1]) : '';
          if (chatId) {
            showNativeChatNotification({chatId,from:'',messageId:String(notification?.id||Date.now())}).catch(()=>{});
          }
        });
      }
      let permission=push.checkPermissions ? await permissionTimeout(push.checkPermissions(),4000) : null;
      if (permission?.receive !== 'granted' && push.requestPermissions) {
        permission=await permissionTimeout(push.requestPermissions(),9000);
      }
      if (permission?.receive === 'granted' && push.register) await push.register();
    }
  } catch {}

  // Web Push remains an additional fallback where supported.
  if (config.pushEnabled && 'serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration=await getPushRegistration();
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){
        subscription=await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(config.pushPublicKey)
        });
      }
      await api('/api/push/subscribe',{
        method:'POST',
        body:JSON.stringify({
          subscription:subscription.toJSON(),
          enabled:me?.notifications?.enabled===true,
          reminderTime:me?.notifications?.reminderTime || '20:00',
          timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        })
      });
    } catch {}
  }
}
async function showNativeChatNotification(payload = {}) {
  if (!isNativeScrapellaApp() || !payload?.chatId || payload.from === me?.tag) return;
  if (document.visibilityState === 'visible' && currentMode === 'messages' && activeChatId === payload.chatId) return;
  const local = nativePlugin('LocalNotifications');
  if (!local) return;
  await ensureNativeChatNotifications();
  try {
    const chat=chats.find(item=>item.id===payload.chatId);
    if (chat?.muted || chat?.restricted) return;
    const sender=chat?.type === 'private'
      ? (chat.otherProfile?.displayName || chat.name || 'New message')
      : (chat?.name || 'Group message');
    const title=chat?.type === 'group' ? `${sender} · new message` : `${sender} sent you a message`;
    const body=String(chat?.lastMessage?.text || chat?.lastMessageText || '').trim()
      || (chat?.lastMessage?.audio ? '🎙 Voice message' : chat?.lastMessage?.image || chat?.lastMessage?.images?.length ? '📷 Photo' : 'Open Scrapella to read it.');
    const iconOptions=await nativeNotificationIconOptions();
    await local.schedule({
      notifications:[{
        id:nativeNotificationId(payload.messageId || payload.chatId + Date.now()),
        title:String(title).slice(0,90),
        body:String(body).slice(0,180),
        channelId:nativePlatform()==='android' ? 'messages' : undefined,
        ...iconOptions,
        extra:{chatId:payload.chatId}
      }]
    });
  } catch {}
}


const nativeSocialNotificationSeen=new Set();
async function showNativeSocialNotification(payload = {}) {
  if(!isNativeScrapellaApp() || payload?.from===me?.tag)return;
  const type=String(payload?.type || '');
  if(!['comment','comment_mention','profile_mention'].includes(type))return;
  if(config.nativePushEnabled)return;
  const local=nativePlugin('LocalNotifications');
  if(!local)return;
  await ensureNativeChatNotifications();
  try{
    let item={
      id:payload.notificationId || '',
      type,
      actor:payload.actor || (payload.from ? {tag:payload.from,displayName:payload.from} : null),
      scrapbookId:payload.scrapbookId || null,
      entryId:payload.entryId || null,
      scrapbookName:payload.scrapbookName || '',
      excerpt:payload.excerpt || '',
      createdAt:payload.createdAt || ''
    };
    if(!item.id || (!item.excerpt && !item.actor?.tag)){
      await new Promise(resolve=>setTimeout(resolve,220));
      const data=await api('/api/notifications');
      const items=Array.isArray(data?.items)?data.items:[];
      item=items.find(candidate=>{
        if(candidate.type!==type)return false;
        if(payload.from && candidate.actor?.tag!==payload.from)return false;
        if(payload.entryId && candidate.entryId!==payload.entryId)return false;
        return true;
      }) || item;
    }
    const key=String(item.id || payload.notificationId || `${type}:${item.createdAt||Date.now()}`);
    if(nativeSocialNotificationSeen.has(key))return;
    nativeSocialNotificationSeen.add(key);
    if(nativeSocialNotificationSeen.size>120){
      const first=nativeSocialNotificationSeen.values().next().value;
      nativeSocialNotificationSeen.delete(first);
    }
    const name=item.actor?.displayName || item.actor?.tag || 'Someone';
    const title=type==='comment'
      ? `${name} commented${item.scrapbookName ? ' in '+item.scrapbookName : ''}`
      : type==='profile_mention'
        ? `${name} mentioned you`
        : `${name} mentioned you in a comment`;
    const body=String(item.excerpt || (type==='comment' ? 'Open Scrapella to read the comment.' : 'Open Scrapella to see the mention.')).trim();
    const iconOptions=await nativeNotificationIconOptions();
    await local.schedule({
      notifications:[{
        id:nativeNotificationId(key),
        title:String(title).slice(0,90),
        body:String(body).slice(0,180),
        channelId:nativePlatform()==='android' ? 'activity' : undefined,
        ...iconOptions,
        extra:{
          notificationType:type,
          scrapbookId:item.scrapbookId || payload.scrapbookId || '',
          entryId:item.entryId || payload.entryId || ''
        }
      }]
    });
  }catch{}
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
      if (status?.receive === 'granted' && config.nativePushEnabled) {
        el.textContent = enabled
          ? 'Daily reminder is on. Background message notifications are ready.'
          : 'Phone notifications are allowed. Background message notifications are ready.';
      } else if (status?.receive === 'granted') {
        el.textContent = enabled
          ? 'Phone notifications are allowed. Daily reminder is on, but closed-app message push still needs Firebase connection.'
          : 'Phone notifications are allowed, but closed-app message push still needs Firebase connection.';
      } else {
        el.textContent = enabled ? 'Daily reminder is on.' : 'Daily reminder is off.';
      }
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
  if (params.get('universe') === 'secret' || params.get('beta') === 'secret') {
    history.replaceState({}, '', location.pathname);
    setTimeout(() => {
      showView('universe');
      universeLabSetMode('secret');
      $('#universeLabStage')?.scrollIntoView({behavior:'smooth',block:'start'});
    }, 220);
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
function sharedMemoryTarget() {
  const params = new URLSearchParams(location.search);
  return {
    bookId:String(params.get('book') || ''),
    entryId:String(params.get('entry') || '')
  };
}
async function openSharedMemoryTarget(target) {
  if (!target?.bookId || !target?.entryId) return false;
  if (activeScrapbook?.id !== target.bookId) await loadSession(target.bookId);
  if (activeScrapbook?.id !== target.bookId || !entries.some(entry => entry.id === target.entryId)) {
    showToast('This memory is unavailable or private.');
    return false;
  }
  showView('stream');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelector(`#timeline [data-entry-id="${CSS.escape(target.entryId)}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  return true;
}
async function enterApp() {
  const sharedTarget = sharedMemoryTarget();
  await loadSession(sharedTarget.bookId || null);
  finishSessionBootstrap(true);
  const openedShared = await openSharedMemoryTarget(sharedTarget);
  if (!openedShared) showView('home');
  initializePhoneHistory();
  connectLiveEvents();
  startPresenceHeartbeat();
  ensureNativeChatNotifications().catch(()=>{});
  if (guideState.required) setTimeout(() => startGuide(true), 180);
  else maybeOpenReminderComposer();
}
$('#logoutBtn').addEventListener('click', async () => {
  disconnectLiveEvents();
  if (isNativeScrapellaApp()) {
    rememberNativeAppearanceMode(document.documentElement.dataset.theme || me?.appearanceMode || 'light');
    if (nativePushToken) {
      await api('/api/push/native/unregister',{
        method:'POST',
        body:JSON.stringify({token:nativePushToken})
      }).catch(()=>{});
    }
  }
  await api('/api/logout', { method:'POST', body:'{}' }).catch(()=>{});
  localStorage.removeItem('activeScrapbookId');
  location.reload();
});
$('#brandButton').addEventListener('click', async e => {
  if (!isPhoneUI() && e.target?.closest?.('.brand-header-logo')) {
    e.preventDefault();
    e.stopPropagation();
    openChatImageViewer('/assets/scrapella-logo.webp');
    return;
  }
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
$('#universeModeBtn')?.addEventListener('click', () => {
  const target=currentMode==='person'
    ? (viewedPersonData?.profile?.tag || me?.tag)
    : ((currentMode==='book' || currentMode==='stream') && mobileBookContextTag && mobileBookContextTag!==me?.tag
        ? mobileBookContextTag
        : me?.tag);
  openMemoryUniverse(target);
});
$('#memoryUniverseOwnerOverrideBtn')?.addEventListener('click',async()=>{
  if((universeTargetTag || me?.tag)!==me?.tag)return;
  universeOwnerOverride=!universeOwnerOverride;
  await openMemoryUniverse(me.tag,{override:universeOwnerOverride});
});
$('#memoryReplayBtn')?.addEventListener('click',()=>startMemoryReplay());
$('#memorySurpriseBtn')?.addEventListener('click',()=>{ if(!entries.length){ showToast('Add a memory first.'); return; } const entry=entries[Math.floor(Math.random()*entries.length)]; renderMemoryUniverseDetail(entry); $('#memoryUniverseDetail')?.scrollIntoView({behavior:'smooth',block:'nearest'}); });
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
  mobileBookShelfOnly = false;
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
  const contextTag=mobileBookContextTag || me.tag;

  if(contextTag!==me.tag && !mobileBookShelfOnly){
    mobileBookBackToSelfAfterProfile=false;
    mobileBookShelfOnly=true;
    setBookCoverOpen(false);
    renderScrapbookPicker();
    renderMobileBookShelf();
    showView('book');
    return;
  }

  if(contextTag!==me.tag){
    mobileBookBackToSelfAfterProfile=false;
    mobileBookContextTag=me.tag;
    mobileBookShelfOnly=false;
    viewedPersonData=viewedPersonData?.isSelf ? viewedPersonData : null;
    await loadSession(null);
    await prepareMobileBookView();
    return;
  }

  mobileBookShelfOnly=false;
  await prepareMobileBookView();
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
async function runDesktopDiscoverSearch(rawQuery = $('#discoverTag')?.value || '') {
  if (isPhoneUI()) return;
  const q=String(rawQuery||'').trim();
  if(!q){
    $('#discoverResults').innerHTML='';
    return;
  }
  const seq=++desktopDiscoverSearchSeq;
  try{
    const data=await api(`/api/people?q=${encodeURIComponent(q)}`);
    if(seq!==desktopDiscoverSearchSeq || isPhoneUI())return;
    renderDiscoverResults(data.people || []);
  }catch(err){
    if(seq===desktopDiscoverSearchSeq)showToast(err.message||'Could not search profiles.');
  }
}
$('#discoverTag').addEventListener('input',e=>{
  if(isPhoneUI())return;
  clearTimeout(desktopDiscoverSearchTimer);
  const q=e.currentTarget.value.trim();
  if(!q){
    $('#discoverResults').innerHTML='';
    return;
  }
  desktopDiscoverSearchTimer=setTimeout(()=>runDesktopDiscoverSearch(q),120);
});
$('#discoverForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#discoverTag').value.trim();
  if (!q) return;
  if(!isPhoneUI()){
    await runDesktopDiscoverSearch(q);
    return;
  }
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
  const query = String(rawQuery || '').trim();
  if (!query) return hideMobilePrivateChatSuggestions();
  const seq = ++mobilePrivateChatSearchSeq;
  try {
    const data = await api(`/api/people?q=${encodeURIComponent(query)}`);
    if (seq !== mobilePrivateChatSearchSeq) return;
    renderMobilePrivateChatSuggestions(data.people || []);
  } catch {
    if (seq === mobilePrivateChatSearchSeq) hideMobilePrivateChatSuggestions();
  }
}
$('#privateChatTag').addEventListener('input', e => {
  clearTimeout(mobilePrivateChatSearchTimer);
  const query = e.currentTarget.value.trim();
  if (!query) return hideMobilePrivateChatSuggestions();
  mobilePrivateChatSearchTimer = setTimeout(() => runMobilePrivateChatSearch(query), 100);
});
$('#privateChatTag').addEventListener('blur', () => {
  setTimeout(hideMobilePrivateChatSuggestions, 160);
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
  document.documentElement.classList.toggle('memory-universe-official', true);
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
  refreshProfilePermissionSettings().catch(()=>{});
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
  if (currentMode === 'universe' && !isTypingFieldFocused()) renderMemoryUniverse();
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
  if(!validateCanvasTextBoxes())return;
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
