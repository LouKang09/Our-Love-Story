const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'client');
const STORAGE = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, 'storage');
const UPLOADS = path.join(STORAGE, 'uploads');
const DATA_FILE = path.join(STORAGE, 'journal.json');
const SOCIAL_FILE = path.join(STORAGE, 'social.json');
const ACCOUNTS_FILE = path.join(STORAGE, 'accounts.json');
const PRESENCE_FILE = path.join(STORAGE, 'presence.json');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-this-before-deploying';
const JOURNAL_TITLE = process.env.JOURNAL_TITLE || 'Our Little Book of Us';
const JOURNAL_SUBTITLE = process.env.JOURNAL_SUBTITLE || 'Every ordinary day deserves to be remembered.';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://our-love-story-production-47c9.up.railway.app';
const PUSH_READY = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const GUIDE_VERSION = 8;
const PLATFORM_OWNER_SEED_TAG = slugTag(process.env.PLATFORM_OWNER_TAG || 'loukang09');

if (PUSH_READY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}
function safeEqualBuffer(a, b) {
  return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}
function slugTag(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}
function validTag(tag) {
  return /^[a-z0-9][a-z0-9_.-]{2,23}$/.test(tag);
}
function displayTag(tag) {
  return `@${tag}`;
}
function parseBootstrapUsers() {
  const users = new Map();
  const hashed = process.env.JOURNAL_USERS_HASHED || '';
  for (const pair of hashed.split(',')) {
    const idx = pair.indexOf(':');
    if (idx <= 0) continue;
    const tag = slugTag(pair.slice(0, idx));
    const hash = pair.slice(idx + 1).trim().toLowerCase();
    if (validTag(tag) && /^[a-f0-9]{64}$/.test(hash)) users.set(tag, { type: 'sha256', hash });
  }
  if (!users.size && !PROD) {
    const raw = process.env.JOURNAL_USERS || 'you:love123,girlfriend:journal123';
    for (const pair of raw.split(',')) {
      const idx = pair.indexOf(':');
      if (idx <= 0) continue;
      const tag = slugTag(pair.slice(0, idx));
      const password = pair.slice(idx + 1).trim();
      if (validTag(tag) && password) users.set(tag, { type: 'sha256', hash: sha256(password).toString('hex') });
    }
  }
  return users;
}
const BOOTSTRAP_USERS = parseBootstrapUsers();
const PENDING_SIGNUP_TAGS = new Set();
const LIVE_CLIENTS = new Map();
const PRESENCE_MEMORY = new Map();
const PRESENCE_ACTIVE_WINDOW_MS = 90 * 1000;
const PRESENCE_AWAY_WINDOW_MS = 24 * 60 * 60 * 1000;
let presenceWriteQueue = Promise.resolve();

function markPresence(tag, state = 'active', at = new Date().toISOString()) {
  if (!tag) return null;
  const previous = PRESENCE_MEMORY.get(tag) || {};
  const record = {
    ...previous,
    state: state === 'offline' ? 'offline' : 'active',
    lastActiveAt: at
  };
  PRESENCE_MEMORY.set(tag, record);
  return record;
}
function presenceSnapshot(tag) {
  const record = PRESENCE_MEMORY.get(tag) || {};
  const lastMs = Date.parse(record.lastActiveAt || '') || 0;
  const age = lastMs ? Math.max(0, Date.now() - lastMs) : Infinity;
  const explicitOffline = record.state === 'offline';
  let status = 'offline';
  if (!explicitOffline && lastMs && age <= PRESENCE_ACTIVE_WINDOW_MS) status = 'active';
  else if (!explicitOffline && lastMs && age <= PRESENCE_AWAY_WINDOW_MS) status = 'away';
  return {
    status,
    lastActiveAt: lastMs ? new Date(lastMs).toISOString() : null,
    explicitOffline
  };
}
async function loadPresenceStore() {
  const stored = await readJson(PRESENCE_FILE, {});
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
  for (const [tag,value] of Object.entries(stored)) {
    if (!value || typeof value !== 'object') continue;
    const lastActiveAt = value.lastActiveAt || null;
    if (!lastActiveAt) continue;
    PRESENCE_MEMORY.set(tag, {
      state:value.state === 'offline' ? 'offline' : 'active',
      lastActiveAt,
      persistedAt:lastActiveAt
    });
  }
}
async function persistPresence(tag, state = 'active', at = new Date().toISOString(), { force = false } = {}) {
  const memory = markPresence(tag,state,at);
  const persistedMs = Date.parse(memory?.persistedAt || '') || 0;
  const atMs = Date.parse(at) || Date.now();
  if (!force && persistedMs && atMs - persistedMs < 120000) return;
  if (memory) memory.persistedAt = at;
  const write = presenceWriteQueue.then(async () => {
    const stored = await readJson(PRESENCE_FILE, {});
    const safe = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    safe[tag] = { state:state === 'offline' ? 'offline' : 'active', lastActiveAt:at };
    await writeJson(PRESENCE_FILE, safe);
  });
  presenceWriteQueue = write.catch(() => {});
  return write;
}
function presenceChatPeers(social, tag) {
  const peers = new Set();
  for (const chat of social?.chats || []) {
    if (chat?.type !== 'private' || !Array.isArray(chat.members) || !chat.members.includes(tag)) continue;
    chat.members.forEach(member => { if (member && member !== tag) peers.add(member); });
  }
  return [...peers];
}

function emitLiveEvent(tag, event, data = {}) {
  const clients = LIVE_CLIENTS.get(tag);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of [...clients]) {
    try { res.write(payload); }
    catch {
      clients.delete(res);
    }
  }
  if (!clients.size) LIVE_CLIENTS.delete(tag);
}
function emitLiveMany(tags, event, data = {}) {
  for (const tag of new Set((tags || []).filter(Boolean))) emitLiveEvent(tag, event, data);
}
function registerLiveClient(req, res, tag) {
  markPresence(tag, 'active');
  res.writeHead(200, {
    'Content-Type':'text/event-stream; charset=utf-8',
    'Cache-Control':'no-cache, no-transform',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ ok:true })}\n\n`);
  if (!LIVE_CLIENTS.has(tag)) LIVE_CLIENTS.set(tag, new Set());
  LIVE_CLIENTS.get(tag).add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 20 * 1000);
  const cleanup = () => {
    clearInterval(heartbeat);
    const set = LIVE_CLIENTS.get(tag);
    set?.delete(res);
    if (set && !set.size) LIVE_CLIENTS.delete(tag);
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
}

async function readJson(file, fallback) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tmp, file);
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}
async function ensureFile(file, initial) {
  try { await fsp.access(file); }
  catch { await writeJson(file, initial); }
}
async function readEntries() {
  const data = await readJson(DATA_FILE, []);
  return Array.isArray(data) ? data : [];
}
async function writeEntries(entries) { await writeJson(DATA_FILE, entries); }
async function readAccounts() {
  const data = await readJson(ACCOUNTS_FILE, []);
  return Array.isArray(data) ? data : [];
}
async function writeAccounts(accounts) { await writeJson(ACCOUNTS_FILE, accounts); }
async function readSocial() {
  const data = await readJson(SOCIAL_FILE, { profiles: {}, scrapbooks: [], invites: [], follows: [], pushSubscriptions: [], notificationSettings: {} });
  data.profiles ||= {};
  data.scrapbooks = Array.isArray(data.scrapbooks) ? data.scrapbooks : [];
  data.invites = Array.isArray(data.invites) ? data.invites : [];
  data.follows = Array.isArray(data.follows) ? data.follows : [];
  data.uploadOwners = data.uploadOwners && typeof data.uploadOwners === 'object' ? data.uploadOwners : {};
  data.pushSubscriptions = Array.isArray(data.pushSubscriptions) ? data.pushSubscriptions : [];
  data.notificationSettings = data.notificationSettings && typeof data.notificationSettings === 'object' ? data.notificationSettings : {};
  data.notificationHub = data.notificationHub && typeof data.notificationHub === 'object' ? data.notificationHub : {};
  data.mentions = Array.isArray(data.mentions) ? data.mentions : [];
  data.activityNotifications = Array.isArray(data.activityNotifications) ? data.activityNotifications : [];
  data.chats = Array.isArray(data.chats) ? data.chats : [];
  data.chatMessages = Array.isArray(data.chatMessages) ? data.chatMessages : [];
  data.chatRead = data.chatRead && typeof data.chatRead === 'object' ? data.chatRead : {};
  data.chatPreferences = data.chatPreferences && typeof data.chatPreferences === 'object' ? data.chatPreferences : {};
  data.blockedUsers = data.blockedUsers && typeof data.blockedUsers === 'object' ? data.blockedUsers : {};
  data.freedomWall = Array.isArray(data.freedomWall) ? data.freedomWall : [];
  for (const book of data.scrapbooks) {
    if (book?.type !== 'group') continue;
    const members = Array.isArray(book.members) ? book.members.filter(Boolean) : [];
    book.members = [...new Set(members)];
    const legacyAdmins = Array.isArray(book.admins) ? book.admins.filter(tag => book.members.includes(tag)) : [];
    book.admins = [...new Set([book.owner, ...legacyAdmins].filter(tag => book.members.includes(tag)))];
    if (book.deleteRequest && book.deleteRequest.status !== 'pending') delete book.deleteRequest;
  }
  return data;
}
async function writeSocial(social) { await writeJson(SOCIAL_FILE, social); }

let uploadOwnerWriteQueue = Promise.resolve();
async function recordUploadOwner(src, user) {
  const write = uploadOwnerWriteQueue.then(async () => {
    const latestSocial = await readSocial();
    latestSocial.uploadOwners[src] = user;
    await writeSocial(latestSocial);
  });
  uploadOwnerWriteQueue = write.catch(() => {});
  return write;
}

async function ensureStorage() {
  await fsp.mkdir(UPLOADS, { recursive: true });
  await ensureFile(DATA_FILE, []);
  await ensureFile(ACCOUNTS_FILE, []);
  await ensureFile(SOCIAL_FILE, { profiles: {}, scrapbooks: [], invites: [], follows: [], pushSubscriptions: [], notificationSettings: {}, notificationHub: {}, mentions: [], activityNotifications: [], chats: [], chatMessages: [], chatRead: {}, freedomWall: [] });
  await ensureFile(PRESENCE_FILE, {});
  await loadPresenceStore();

  const social = await readSocial();
  const bootstrapTags = [...BOOTSTRAP_USERS.keys()];
  let changed = false;
  for (const tag of bootstrapTags) {
    if (!social.profiles[tag]) {
      social.profiles[tag] = { tag, displayName: tag === 'girlfriend' ? 'Girlfriend' : tag === 'you' ? 'You' : tag, avatar: '', bio: '', createdAt: new Date().toISOString() };
      changed = true;
    }
  }

  const existingPlatformOwner = Object.values(social.profiles).find(profile => profile?.platformOwner === true);
  if (!existingPlatformOwner && social.profiles[PLATFORM_OWNER_SEED_TAG]) {
    social.profiles[PLATFORM_OWNER_SEED_TAG].platformOwner = true;
    changed = true;
  }

  let defaultBook = social.scrapbooks.find(book => book.isLegacyDefault);
  if (!defaultBook && bootstrapTags.length >= 2) {
    defaultBook = {
      id: crypto.randomUUID(),
      type: 'couple',
      name: JOURNAL_TITLE,
      owner: bootstrapTags[0],
      members: bootstrapTags.slice(0, 2),
      createdAt: new Date().toISOString(),
      isLegacyDefault: true
    };
    social.scrapbooks.push(defaultBook);
    changed = true;
  }
  for (const book of social.scrapbooks.filter(book => book.type === 'group')) {
    if (!social.chats.some(chat => chat.type === 'group' && chat.scrapbookId === book.id)) {
      social.chats.push({
        id:crypto.randomUUID(),
        type:'group',
        scrapbookId:book.id,
        createdAt:book.createdAt || new Date().toISOString()
      });
      changed = true;
    }
  }
  if (changed) await writeSocial(social);

  if (defaultBook) {
    const entries = await readEntries();
    let migrated = false;
    for (const entry of entries) {
      if (!entry.scrapbookId) {
        entry.scrapbookId = defaultBook.id;
        migrated = true;
      }
    }
    if (migrated) await writeEntries(entries);
  }
}

async function backupNamedJsonDataOnce(name) {
  const backupDir = path.join(STORAGE, 'backups', name);
  const marker = path.join(backupDir, '.complete');
  try {
    await fsp.access(marker);
    return;
  } catch {}
  await fsp.mkdir(backupDir, { recursive: true });
  for (const [source, fileName] of [[DATA_FILE,'journal.json'],[SOCIAL_FILE,'social.json'],[ACCOUNTS_FILE,'accounts.json']]) {
    try { await fsp.copyFile(source, path.join(backupDir, fileName)); } catch {}
  }
  await fsp.writeFile(marker, new Date().toISOString(), 'utf8');
}
async function backupJsonDataOnce() {
  await backupNamedJsonDataOnce('pre-richtext-smartwrap-mobile-20260919');
  await backupNamedJsonDataOnce('pre-canvas-editor-20260919');
  await backupNamedJsonDataOnce('pre-page-size-lines-20260919');
  await backupNamedJsonDataOnce('pre-home-social-20260919');
  await backupNamedJsonDataOnce('pre-guided-onboarding-20260919');
  await backupNamedJsonDataOnce('pre-session-live-refresh-caption-20260919');
  await backupNamedJsonDataOnce('pre-social-profile-browser-20260919');
  await backupNamedJsonDataOnce('pre-notification-hub-profile-zoom-20260919');
  await backupNamedJsonDataOnce('pre-comments-mentions-layout-20260919');
  await backupNamedJsonDataOnce('pre-mention-autocomplete-push-20260919');
  await backupNamedJsonDataOnce('pre-realtime-stream-layout-20260920');
  await backupNamedJsonDataOnce('pre-private-group-chat-20260920');
  await backupNamedJsonDataOnce('pre-night-cover-mobilechat-20260920');
  await backupNamedJsonDataOnce('pre-night-privacy-multipersonal-20260920');
  await backupNamedJsonDataOnce('pre-bulk-personal-privacy-20260920');
  await backupNamedJsonDataOnce('pre-group-admin-chat-reactions-20260920');
  await backupNamedJsonDataOnce('pre-comment-replies-audio-chat-20260920');
}

async function scryptHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = await new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (err, derived) => err ? reject(err) : resolve(derived)));
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyCredential(stored, supplied) {
  if (!stored || stored.disabled === true) return false;
  if (stored.type === 'sha256') return safeEqualBuffer(Buffer.from(stored.hash, 'hex'), sha256(supplied));
  const value = String(stored.passwordHash || stored.hash || '');
  if (!value.startsWith('scrypt$')) return false;
  const [, salt, expectedHex] = value.split('$');
  if (!salt || !expectedHex) return false;
  const calculated = await scryptHash(supplied, salt);
  const actualHex = calculated.split('$')[2];
  return safeEqualBuffer(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
}
async function getCredential(tag) {
  const accounts = await readAccounts();
  const stored = accounts.find(a => a.tag === tag);
  if (stored) return stored;
  if (BOOTSTRAP_USERS.has(tag)) return BOOTSTRAP_USERS.get(tag);
  return null;
}
async function accountExists(tag) {
  return Boolean(await getCredential(tag));
}
async function allKnownTags() {
  const accounts = await readAccounts();
  const disabled = new Set(accounts.filter(a => a.disabled === true).map(a => a.tag));
  return [...new Set([
    ...[...BOOTSTRAP_USERS.keys()].filter(tag => !disabled.has(tag)),
    ...accounts.filter(a => a.disabled !== true).map(a => a.tag)
  ])];
}

function renameExactTagDeep(value, oldTag, newTag) {
  if (typeof value === 'string') return value === oldTag ? newTag : value;
  if (Array.isArray(value)) return value.map(item => renameExactTagDeep(item, oldTag, newTag));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key,item] of Object.entries(value)) {
    const nextKey = key === oldTag ? newTag : key;
    out[nextKey] = renameExactTagDeep(item, oldTag, newTag);
  }
  return out;
}
function makeSession(tag) {
  const payload = Buffer.from(JSON.stringify({ tag, exp: Date.now() + SESSION_MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function getCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
async function getUser(req) {
  const token = getCookies(req).journal_session;
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqualBuffer(Buffer.from(sign(payload)), Buffer.from(sig))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.tag || Date.now() > session.exp || !(await accountExists(session.tag))) return null;
    return session.tag;
  } catch { return null; }
}
function sessionCookie(token) {
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000).toUTCString();
  return `journal_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; Expires=${expires}; SameSite=Lax; Priority=High${PROD ? '; Secure' : ''}`;
}
function clearCookie() {
  return `journal_session=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${PROD ? '; Secure' : ''}`;
}
function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function notFound(res) { json(res, 404, { error: 'Not found' }); }
function forbidden(res, message = 'You do not have access to that scrapbook.') { json(res, 403, { error: message }); }
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon',
    '.webm':'audio/webm', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.m4a':'audio/mp4', '.mp4':'audio/mp4', '.wav':'audio/wav'
  })[ext] || 'application/octet-stream';
}
async function readBody(req, maxBytes = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { const raw = Buffer.concat(chunks).toString('utf8'); resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
async function requireAuth(req, res) {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Please sign in first.' }); return null; }
  return user;
}
function cleanPhoto(photo) {
  if (!photo || typeof photo !== 'object') return null;
  const src = String(photo.src || '');
  if (!src.startsWith('/uploads/')) return null;
  const width = Math.max(18, Math.min(90, Number(photo.width) || 42));
  const legacyX = photo.side === 'right' ? Math.max(0, 100 - width) : 0;
  const xPct = Math.max(0, Math.min(100 - width, Number.isFinite(Number(photo.xPct)) ? Number(photo.xPct) : legacyX));
  const yPx = Math.max(0, Math.min(900, Number.isFinite(Number(photo.yPx)) ? Number(photo.yPx) : (Number(photo.offsetY) || 0)));
  return {
    id: String(photo.id || crypto.randomUUID()),
    src,
    side: (xPct + width / 2) >= 50 ? 'right' : 'left',
    width,
    xPct,
    yPx,
    offsetY: yPx,
    caption: String(photo.caption || '').slice(0, 240)
  };
}
function sanitizeRichText(input) {
  let html = String(input || '').slice(0, 50000);
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|link|meta)[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|link|meta)\b[^>]*\/?>/gi, '');

  html = html.replace(/<font\b([^>]*)>/gi, (match, attrs) => {
    const classes = [];
    const faceMatch = attrs.match(/\bface\s*=\s*["']([^"']+)["']/i);
    const sizeMatch = attrs.match(/\bsize\s*=\s*["']?([1-7])["']?/i);
    const face = String(faceMatch?.[1] || '').toLowerCase();
    if (face.includes('georgia')) classes.push('fmt-font-serif');
    else if (face.includes('times')) classes.push('fmt-font-classic');
    else if (face.includes('palatino') || face.includes('book antiqua')) classes.push('fmt-font-elegant');
    else if (face.includes('verdana')) classes.push('fmt-font-rounded');
    else if (face.includes('trebuchet')) classes.push('fmt-font-casual');
    else if (face.includes('arial') || face.includes('helvetica') || face.includes('sans')) classes.push('fmt-font-sans');
    else if (face.includes('segoe print') || face.includes('comic sans') || face.includes('bradley')) classes.push('fmt-font-hand');
    else if (face.includes('brush script') || face.includes('segoe script')) classes.push('fmt-font-script');
    else if (face.includes('courier') || face.includes('mono')) classes.push('fmt-font-mono');
    if (sizeMatch) classes.push(`fmt-size-${sizeMatch[1]}`);
    return classes.length ? `<span class="${classes.join(' ')}">` : '<span>';
  });
  html = html.replace(/<\/font\s*>/gi, '</span>');

  html = html.replace(/<(b|strong)\b[^>]*>/gi, '<strong>');
  html = html.replace(/<\/(b|strong)\s*>/gi, '</strong>');
  html = html.replace(/<(i|em)\b[^>]*>/gi, '<em>');
  html = html.replace(/<\/(i|em)\s*>/gi, '</em>');
  html = html.replace(/<br\b[^>]*\/?>/gi, '<br>');
  html = html.replace(/<(div|p)\b[^>]*>/gi, '<$1>');
  html = html.replace(/<\/(div|p)\s*>/gi, '</$1>');

  html = html.replace(/<span\b([^>]*)>/gi, (match, attrs) => {
    const classMatch = attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i);
    const allowed = String(classMatch?.[1] || '')
      .split(/\s+/)
      .filter(cls => /^fmt-font-(serif|classic|elegant|sans|rounded|casual|hand|script|mono)$/.test(cls) || /^fmt-size-[1-7]$/.test(cls));
    const styleMatch = attrs.match(/\bstyle\s*=\s*["'][^"']*font-size\s*:\s*([0-9.]+)px[^"']*["']/i);
    const rawSize = Number(styleMatch?.[1]);
    const safeStyle = Number.isFinite(rawSize)
      ? ` style="font-size:${Math.max(7,Math.min(42,rawSize)).toFixed(rawSize % 1 ? 1 : 0)}px"`
      : '';
    const classAttr = allowed.length ? ` class="${[...new Set(allowed)].join(' ')}"` : '';
    return `<span${classAttr}${safeStyle}>`;
  });
  html = html.replace(/<\/span\s*>/gi, '</span>');

  html = html.replace(/<(?!\/?(?:strong|em|br|div|p|span)\b)[^>]*>/gi, '');
  return html.slice(0, 50000);
}
function plainTextFromRichHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function cleanCanvasItem(item) {
  if (!item || typeof item !== 'object') return null;
  const type = item.type === 'text' ? 'text' : item.type === 'photo' ? 'photo' : '';
  if (!type) return null;
  const common = {
    id: String(item.id || crypto.randomUUID()).slice(0,120),
    type,
    x: Math.max(0, Math.min(94, Number(item.x) || 0)),
    y: Math.max(0, Math.min(94, Number(item.y) || 0)),
    w: Math.max(type === 'text' ? 18 : 14, Math.min(96, Number(item.w) || (type === 'text' ? 55 : 34))),
    h: Math.max(type === 'text' ? 8 : 10, Math.min(90, Number(item.h) || (type === 'text' ? 18 : 26))),
    z: Math.max(1, Math.min(999, Math.round(Number(item.z) || 1)))
  };
  if (common.x + common.w > 100) common.x = Math.max(0, 100 - common.w);
  if (common.y + common.h > 100) common.y = Math.max(0, 100 - common.h);

  if (type === 'photo') {
    const src = String(item.src || '');
    if (!src.startsWith('/uploads/')) return null;
    return {
      ...common,
      src,
      caption: String(item.caption || '').slice(0,240),
      aspect: Math.max(0.15, Math.min(8, Number(item.aspect) || 1))
    };
  }

  const font = ['serif','classic','elegant','sans','rounded','casual','hand','script','mono'].includes(item.font) ? item.font : 'serif';
  const align = ['left','center','right','justify'].includes(item.align) ? item.align : 'left';
  return {
    ...common,
    html: sanitizeRichText(item.html || ''),
    font,
    align,
    size: Math.max(7, Math.min(42, Number(item.size) || 18)),
    bold: item.bold === true,
    italic: item.italic === true
  };
}

function cleanEntry(input, author, existing = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : new Date().toISOString().slice(0, 10);
  const hasRichText = input.richText !== undefined;
  const richText = hasRichText ? sanitizeRichText(input.richText) : String(existing.richText || '');
  const plain = String(input.text ?? (richText ? plainTextFromRichHtml(richText) : existing.text || '')).slice(0, 20000);
  return {
    id: existing.id || crypto.randomUUID(),
    scrapbookId: existing.scrapbookId || String(input.scrapbookId || ''),
    date,
    title: String(input.title || 'Untitled memory').trim().slice(0, 120),
    text: plain,
    richText,
    photos: Array.isArray(input.photos) ? input.photos.map(cleanPhoto).filter(Boolean).slice(0, 12) : [],
    canvasItems: Array.isArray(input.canvasItems)
      ? input.canvasItems.map(cleanCanvasItem).filter(Boolean).slice(0, 40)
      : (Array.isArray(existing.canvasItems) ? existing.canvasItems : []),
    canvasSize: ['small','medium','large','wide'].includes(input.canvasSize)
      ? input.canvasSize
      : (['small','medium','large','wide'].includes(existing.canvasSize) ? existing.canvasSize : 'medium'),
    canvasLined: input.canvasLined === true ? true : (input.canvasLined === false ? false : existing.canvasLined === true),
    author: existing.author || author,
    comments: Array.isArray(existing.comments) ? existing.comments : [],
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function isPlatformOwner(social, tag) {
  return Boolean(tag && social?.profiles?.[tag]?.platformOwner === true);
}
function profileFor(social, tag) {
  const p = social.profiles[tag] || { tag, displayName: tag, avatar: '', bio: '' };
  const notify = social.notificationSettings?.[tag] || {};
  return {
    tag,
    tagLabel: displayTag(tag),
    displayName: p.displayName || tag,
    avatar: p.avatar || '',
    bio: p.bio || '',
    isPlatformOwner: isPlatformOwner(social, tag),
    appearanceMode: ['light','night'].includes(p.appearanceMode) ? p.appearanceMode : 'light',
    notifications: {
      enabled: notify.enabled === true,
      reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(notify.reminderTime || '')) ? notify.reminderTime : '20:00',
      timezone: String(notify.timezone || '')
    }
  };
}
function publicProfileFor(social, tag) {
  const p = social.profiles[tag] || { tag, displayName: tag, avatar: '', bio: '' };
  return {
    tag,
    tagLabel: displayTag(tag),
    displayName: p.displayName || tag,
    avatar: p.avatar || '',
    bio: p.bio || '',
    isPlatformOwner: isPlatformOwner(social, tag),
    presence: presenceSnapshot(tag)
  };
}
function isFollowing(social, follower, following) {
  return social.follows.some(f => f.follower === follower && f.following === following);
}
function activePartnerTag(social, tag) {
  const couple = social.scrapbooks.find(b =>
    b.type === 'couple' &&
    (b.bindingStatus || 'bound') !== 'unbound' &&
    Array.isArray(b.members) &&
    b.members.length === 2 &&
    b.members.includes(tag)
  );
  return couple ? couple.members.find(member => member !== tag) || null : null;
}
function isActivePartner(social, a, b) {
  return Boolean(a && b && activePartnerTag(social, a) === b);
}
function personalPrivacy(book) {
  return ['followers','partner','private'].includes(book?.privacy) ? book.privacy : 'private';
}
function canViewBook(social, book, viewer) {
  if (!book || !viewer) return false;
  if (book.type !== 'personal') return Array.isArray(book.members) && book.members.includes(viewer);
  if (book.owner === viewer) return true;
  const privacy = personalPrivacy(book);
  if (privacy === 'followers') return isFollowing(social, viewer, book.owner);
  if (privacy === 'partner') return isActivePartner(social, viewer, book.owner);
  return false;
}
function mentionTags(text) {
  const matches = String(text || '').matchAll(/(^|\s)@([a-z0-9][a-z0-9_.-]{2,23})\b/gi);
  return [...new Set([...matches].map(match => slugTag(match[2])).filter(Boolean))].slice(0, 12);
}
async function sendUserPush(social, { to, title, body, tag = 'scrapbook-social', url = '/?notifications=1' }) {
  if (!PUSH_READY || !to) return;
  const subscriptions = social.pushSubscriptions.filter(item => item.tag === to);
  if (!subscriptions.length) return;
  const payload = JSON.stringify({
    title:String(title || 'Scrapbook update').slice(0,120),
    body:String(body || 'Open your scrapbook to see what changed.').slice(0,180),
    url,
    tag:String(tag || 'scrapbook-social').slice(0,120)
  });
  for (const item of [...subscriptions]) {
    try {
      await webpush.sendNotification(item.subscription, payload, { TTL:60 * 60 * 24 });
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        social.pushSubscriptions = social.pushSubscriptions.filter(sub => sub.endpoint !== item.endpoint);
      } else {
        console.warn('Social push failed:', err?.statusCode || err?.message || err);
      }
    }
  }
}
async function sendMentionPush(social, { to, from, kind, excerpt = '', chatId = null }) {
  const actor = publicProfileFor(social, from);
  const name = actor.displayName || displayTag(from);
  const profileMention = kind === 'profile';
  const chatMention = kind === 'chat';
  await sendUserPush(social, {
    to,
    title:profileMention
      ? `${name} mentioned you in their profile`
      : (chatMention ? `${name} mentioned you in a message` : `${name} mentioned you in a scrapbook comment`),
    body:excerpt || (profileMention ? 'Open the scrapbook to see the mention.' : (chatMention ? 'Open Messages to see the mention.' : 'Open the memory to see the comment.')),
    tag:`mention-${kind}-${from}-${to}`,
    url:chatMention && chatId ? `/?messages=${encodeURIComponent(chatId)}` : '/?notifications=1'
  });
}
async function appendMentionNotifications(social, { from, text, kind, scrapbookId = null, entryId = null, chatId = null, messageId = null, previousText = '', allowedTargets = null }) {
  const previous = new Set(mentionTags(previousText));
  for (const target of mentionTags(text)) {
    if (!target || target === from || previous.has(target)) continue;
    if (allowedTargets && !allowedTargets.has(target)) continue;
    if (!(await accountExists(target))) continue;
    const excerpt = String(text || '').trim().slice(0, 180);
    social.mentions.push({
      id: crypto.randomUUID(),
      to: target,
      from,
      kind,
      scrapbookId,
      entryId,
      chatId,
      messageId,
      excerpt,
      createdAt: new Date().toISOString()
    });
    await sendMentionPush(social, { to:target, from, kind, excerpt, chatId });
    const type = kind === 'profile' ? 'profile_mention' : (kind === 'chat' ? 'chat_mention' : 'comment_mention');
    emitLiveEvent(target, 'notification', { type, from, scrapbookId, entryId, chatId });
  }
  if (social.mentions.length > 2000) social.mentions = social.mentions.slice(-2000);
}
function appendActivityNotification(social, { to, from, type, scrapbookId = null, entryId = null, chatId = null, scrapbookName = '', excerpt = '' }) {
  if (!to || to === from) return null;
  const item = {
    id:crypto.randomUUID(),
    to,
    from,
    type,
    scrapbookId,
    entryId,
    chatId,
    scrapbookName:String(scrapbookName || '').slice(0,80),
    excerpt:String(excerpt || '').slice(0,180),
    createdAt:new Date().toISOString()
  };
  social.activityNotifications.push(item);
  if (social.activityNotifications.length > 3000) social.activityNotifications = social.activityNotifications.slice(-3000);
  return item;
}
function realtimeBookViewers(social, book) {
  if (!book) return [];
  if (book.type !== 'personal') return [...new Set(book.members || [])];
  const viewers = new Set([book.owner]);
  const privacy = personalPrivacy(book);
  if (privacy === 'followers') {
    social.follows.filter(f => f.following === book.owner).forEach(f => viewers.add(f.follower));
  } else if (privacy === 'partner') {
    const partner = activePartnerTag(social, book.owner);
    if (partner) viewers.add(partner);
  }
  return [...viewers];
}
function canCommentBook(social, book, viewer) {
  if (!book || !viewer) return false;
  if (book.type === 'group' || book.type === 'couple') return Array.isArray(book.members) && book.members.includes(viewer);
  if (book.type === 'personal') return canViewBook(social, book, viewer);
  return false;
}
function notificationSnapshot(social, user) {
  social.notificationHub ||= {};
  const hub = social.notificationHub[user] || {};
  const seenMs = Date.parse(hub.lastSeenAt || '') || 0;

  const inviteItems = social.invites
    .filter(invite => invite.to === user && invite.status === 'pending')
    .map(invite => {
      const book = social.scrapbooks.find(b => b.id === invite.scrapbookId);
      return {
        id: `invite:${invite.id}`,
        inviteId: invite.id,
        type: invite.type === 'couple' ? 'couple_invite' : 'group_invite',
        createdAt: invite.createdAt || '',
        unread: true,
        actor: publicProfileFor(social, invite.from),
        scrapbook: book ? {
          id: book.id,
          name: book.name,
          type: book.type
        } : {
          id: invite.scrapbookId,
          name: invite.type === 'couple' ? 'Lovers scrapbook' : 'Group scrapbook',
          type: invite.type
        }
      };
    });

  const followItems = social.follows
    .filter(follow => follow.following === user)
    .map(follow => ({
      id: `follow:${follow.follower}:${follow.createdAt || ''}`,
      type: 'follow',
      createdAt: follow.createdAt || '',
      unread: (Date.parse(follow.createdAt || '') || 0) > seenMs,
      actor: publicProfileFor(social, follow.follower)
    }));

  const mentionItems = social.mentions
    .filter(item => item.to === user)
    .map(item => ({
      id: `mention:${item.id}`,
      type: item.kind === 'profile' ? 'profile_mention' : (item.kind === 'chat' ? 'chat_mention' : 'comment_mention'),
      createdAt: item.createdAt || '',
      unread: (Date.parse(item.createdAt || '') || 0) > seenMs,
      actor: publicProfileFor(social, item.from),
      scrapbookId: item.scrapbookId || null,
      entryId: item.entryId || null,
      chatId: item.chatId || null,
      excerpt: item.excerpt || ''
    }));

  const activityItems = social.activityNotifications
    .filter(item => item.to === user)
    .map(item => ({
      id:`activity:${item.id}`,
      type:item.type,
      createdAt:item.createdAt || '',
      unread:(Date.parse(item.createdAt || '') || 0) > seenMs,
      actor:publicProfileFor(social, item.from),
      scrapbookId:item.scrapbookId || null,
      entryId:item.entryId || null,
      chatId:item.chatId || null,
      scrapbookName:item.scrapbookName || '',
      excerpt:item.excerpt || ''
    }));

  const items = [...inviteItems, ...followItems, ...mentionItems, ...activityItems]
    .sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 80);
  const unreadFollowers = followItems.filter(item => item.unread).length;
  const unreadMentions = mentionItems.filter(item => item.unread).length;
  const unreadActivities = activityItems.filter(item => item.unread).length;
  return {
    items,
    unreadCount: unreadFollowers + unreadMentions + unreadActivities + inviteItems.length,
    pendingInviteCount: inviteItems.length
  };
}
function bookForViewer(social, id, tag) {
  const book = social.scrapbooks.find(b => b.id === id);
  return canViewBook(social, book, tag) ? book : null;
}
function bookForUser(social, id, tag) {
  const book = social.scrapbooks.find(b => b.id === id);
  if (!book || !Array.isArray(book.members) || !book.members.includes(tag)) return null;
  return book;
}
function canWriteBook(book, viewer) {
  if (!book || !viewer) return false;
  if (book.type === 'personal') return book.owner === viewer;
  return Array.isArray(book.members) && book.members.includes(viewer);
}
function chatMembers(social, chat) {
  if (!chat) return [];
  if (chat.type === 'private') return [...new Set(Array.isArray(chat.members) ? chat.members.filter(Boolean) : [])];
  if (chat.type === 'group') {
    const book = social.scrapbooks.find(item => item.id === chat.scrapbookId && item.type === 'group');
    return book ? [...new Set(book.members || [])] : [];
  }
  return [];
}
function canAccessChat(social, chat, user) {
  return Boolean(user && chatMembers(social, chat).includes(user));
}
function chatPreferenceFor(social, user, chatId) {
  const prefs = social.chatPreferences?.[user]?.[chatId];
  return prefs && typeof prefs === 'object' ? prefs : {};
}
function ensureChatPreference(social, user, chatId) {
  social.chatPreferences ||= {};
  social.chatPreferences[user] ||= {};
  social.chatPreferences[user][chatId] ||= {};
  return social.chatPreferences[user][chatId];
}
function blockedTagsFor(social, user) {
  const items = social.blockedUsers?.[user];
  return Array.isArray(items) ? items : [];
}
function isBlockedBetween(social, a, b) {
  if (!a || !b) return false;
  return blockedTagsFor(social,a).includes(b) || blockedTagsFor(social,b).includes(a);
}
function chatHiddenForUser(social, chat, user) {
  const deletedAt = Date.parse(chatPreferenceFor(social,user,chat.id).deletedAt || '') || 0;
  if (!deletedAt) return false;
  const lastMessage = [...social.chatMessages].reverse().find(message => message.chatId === chat.id);
  const lastActivity = Date.parse(lastMessage?.createdAt || chat.createdAt || '') || 0;
  return lastActivity <= deletedAt;
}
function chatUnreadCount(social, chat, user) {
  if (!canAccessChat(social, chat, user) || chatHiddenForUser(social,chat,user)) return 0;
  const pref = chatPreferenceFor(social,user,chat.id);
  if (pref.restricted === true) return 0;
  const seenMs = Date.parse(social.chatRead?.[user]?.[chat.id] || '') || 0;
  return social.chatMessages.filter(message =>
    message.chatId === chat.id &&
    message.author !== user &&
    (Date.parse(message.createdAt || '') || 0) > seenMs
  ).length;
}
function decorateChatMessage(social, message, user) {
  const raw = message?.reactions && typeof message.reactions === 'object' ? message.reactions : {};
  const reactions = Object.entries(raw).map(([emoji,tags]) => {
    const people = Array.isArray(tags) ? [...new Set(tags.filter(Boolean))] : [];
    return {
      emoji,
      count:people.length,
      reactedByMe:people.includes(user),
      people:people.map(tag => publicProfileFor(social, tag))
    };
  }).filter(item => item.count > 0);
  const replied = message?.replyTo ? social.chatMessages.find(item => item.id === message.replyTo && item.chatId === message.chatId) : null;
  const createdMs = Date.parse(message?.createdAt || '') || 0;
  const editDeadlineMs = createdMs ? createdMs + (15 * 60 * 1000) : 0;
  const chat = social.chats.find(item => item.id === message.chatId) || null;
  const seenByTags = chat ? chatMembers(social,chat).filter(tag =>
    tag !== message.author &&
    (Date.parse(social.chatRead?.[tag]?.[message.chatId] || '') || 0) >= createdMs &&
    createdMs > 0
  ) : [];
  return {
    id:message.id,
    author:message.author,
    profile:publicProfileFor(social, message.author),
    deleted:Boolean(message.deletedAt),
    deletedAt:message.deletedAt || null,
    text:message.deletedAt ? '' : (message.text || ''),
    images:message.deletedAt ? [] : [...new Set([
      ...(Array.isArray(message.images) ? message.images : []),
      message.image || ''
    ].filter(Boolean))].slice(0,10),
    image:message.deletedAt ? '' : (message.image || (Array.isArray(message.images) ? message.images[0] || '' : '')),
    audio:message.deletedAt ? '' : (message.audio || ''),
    replyTo:replied ? {
      id:replied.id,
      author:replied.author,
      profile:publicProfileFor(social, replied.author),
      deleted:Boolean(replied.deletedAt),
      text:replied.deletedAt ? '' : String(replied.text || '').slice(0,180),
      images:replied.deletedAt ? [] : [...new Set([
        ...(Array.isArray(replied.images) ? replied.images : []),
        replied.image || ''
      ].filter(Boolean))].slice(0,10),
      image:replied.deletedAt ? '' : (replied.image || (Array.isArray(replied.images) ? replied.images[0] || '' : '')),
      audio:replied.deletedAt ? '' : (replied.audio || '')
    } : null,
    reactions,
    editedAt:message.editedAt || null,
    canEdit:Boolean(
      message.author === user &&
      !message.deletedAt &&
      String(message.text || '').trim() &&
      editDeadlineMs > Date.now()
    ),
    editableUntil:editDeadlineMs ? new Date(editDeadlineMs).toISOString() : null,
    seenBy:seenByTags.map(tag => publicProfileFor(social,tag)),
    seenByCount:seenByTags.length,
    pinnedAt:message.pinnedAt || null,
    pinnedBy:message.pinnedBy || null,
    createdAt:message.createdAt
  };
}
function decorateChat(social, chat, user) {
  const members = chatMembers(social, chat);
  const prefs = chatPreferenceFor(social,user,chat.id);
  const lastMessage = [...social.chatMessages].reverse().find(message => message.chatId === chat.id) || null;
  if (chat.type === 'group') {
    const book = social.scrapbooks.find(item => item.id === chat.scrapbookId);
    return {
      id:chat.id,
      type:'group',
      scrapbookId:chat.scrapbookId,
      name:book?.name || 'Group chat',
      owner:book?.owner || null,
      admins:book ? groupAdminTags(book) : [],
      isOwner:Boolean(book && book.owner === user),
      isAdmin:Boolean(book && isGroupAdmin(book,user)),
      deleteRequest:book?.deleteRequest?.status === 'pending' ? {
        id:book.deleteRequest.id,
        requestedBy:book.deleteRequest.requestedBy,
        createdAt:book.deleteRequest.createdAt
      } : null,
      members:members.map(tag => publicProfileFor(social, tag)),
      pinned:prefs.pinned === true,
      muted:prefs.muted === true,
      restricted:prefs.restricted === true,
      blocked:false,
      unreadCount:chatUnreadCount(social, chat, user),
      lastMessage:lastMessage ? {
        id:lastMessage.id,
        author:lastMessage.author,
        deleted:Boolean(lastMessage.deletedAt),
        text:lastMessage.deletedAt ? 'Message deleted' : (lastMessage.text || ''),
        images:lastMessage.deletedAt ? [] : [...new Set([
          ...(Array.isArray(lastMessage.images) ? lastMessage.images : []),
          lastMessage.image || ''
        ].filter(Boolean))].slice(0,10),
        image:lastMessage.deletedAt ? '' : (lastMessage.image || (Array.isArray(lastMessage.images) ? lastMessage.images[0] || '' : '')),
        audio:lastMessage.deletedAt ? '' : (lastMessage.audio || ''),
        createdAt:lastMessage.createdAt
      } : null
    };
  }
  const other = members.find(tag => tag !== user) || user;
  const profile = publicProfileFor(social, other);
  return {
    id:chat.id,
    type:'private',
    name:profile.displayName || displayTag(other),
    otherProfile:profile,
    members:members.map(tag => publicProfileFor(social, tag)),
    pinned:prefs.pinned === true,
    muted:prefs.muted === true,
    restricted:prefs.restricted === true,
    blocked:blockedTagsFor(social,user).includes(other),
    unreadCount:chatUnreadCount(social, chat, user),
    lastMessage:lastMessage ? {
      id:lastMessage.id,
      author:lastMessage.author,
      deleted:Boolean(lastMessage.deletedAt),
      text:lastMessage.deletedAt ? 'Message deleted' : (lastMessage.text || ''),
      image:lastMessage.deletedAt ? '' : (lastMessage.image || ''),
      audio:lastMessage.deletedAt ? '' : (lastMessage.audio || ''),
      createdAt:lastMessage.createdAt
    } : null
  };
}
function totalChatUnread(social, user) {
  return social.chats
    .filter(chat => canAccessChat(social, chat, user))
    .reduce((sum, chat) => sum + chatUnreadCount(social, chat, user), 0);
}
function groupAdminTags(book) {
  if (!book || book.type !== 'group') return [];
  const members = Array.isArray(book.members) ? book.members : [];
  const admins = Array.isArray(book.admins) ? book.admins : [];
  return [...new Set([book.owner, ...admins].filter(tag => members.includes(tag)))];
}
function isGroupAdmin(book, tag) {
  return Boolean(book?.type === 'group' && tag && groupAdminTags(book).includes(tag));
}
function decorateBook(social, book, viewer, options = {}) {
  const viewingAsFollower = book.type === 'personal' && book.owner !== viewer && isFollowing(social, viewer, book.owner);
  const viewingAsPartner = book.type === 'personal' && book.owner !== viewer && isActivePartner(social, viewer, book.owner);
  const overrideAccess = options.overrideAccess === true &&
    book.type === 'personal' &&
    book.owner !== viewer &&
    isPlatformOwner(social, viewer);
  return {
    id: book.id,
    type: book.type,
    name: book.name,
    coverTheme: ['rose','midnight','forest','ocean','sunset','classic'].includes(book.coverTheme) ? book.coverTheme : 'rose',
    owner: book.owner,
    members: book.members,
    privacy: book.type === 'personal' ? personalPrivacy(book) : null,
    createdAt: book.createdAt,
    isOwner: book.owner === viewer,
    admins: book.type === 'group' ? groupAdminTags(book) : [],
    isGroupAdmin: book.type === 'group' ? isGroupAdmin(book, viewer) : false,
    deleteRequest: book.type === 'group' && book.deleteRequest?.status === 'pending' ? {
      id:book.deleteRequest.id,
      requestedBy:book.deleteRequest.requestedBy,
      createdAt:book.deleteRequest.createdAt
    } : null,
    canWrite: canWriteBook(book, viewer),
    overrideAccess,
    accessReason: overrideAccess ? 'override' : (book.owner === viewer ? 'owner' : (viewingAsPartner ? 'partner' : (viewingAsFollower ? 'follower' : 'member'))),
    bindingStatus: book.bindingStatus || 'bound',
    boundAt: book.boundAt || (book.type === 'couple' && (book.members || []).length >= 2 ? book.createdAt : null),
    unboundAt: book.unboundAt || null,
    unbindRequest: book.unbindRequest ? {
      status: book.unbindRequest.status,
      requestedBy: book.unbindRequest.requestedBy,
      approvals: Array.isArray(book.unbindRequest.approvals) ? book.unbindRequest.approvals : [],
      createdAt: book.unbindRequest.createdAt
    } : null,
    profiles: book.type === 'personal'
      ? [publicProfileFor(social, book.owner)]
      : book.members.map(tag => publicProfileFor(social, tag))
  };
}
function userHasOtherCouple(social, tag, exceptId = null) {
  return social.scrapbooks.some(b => b.type === 'couple' && (b.bindingStatus || 'bound') !== 'unbound' && b.id !== exceptId && b.members.includes(tag));
}

async function deleteScrapbookCompletely(social, book, actor) {
  const viewers = realtimeBookViewers(social, book);
  const entries = await readEntries();
  const removedEntries = entries.filter(entry => entry.scrapbookId === book.id);
  const remainingEntries = entries.filter(entry => entry.scrapbookId !== book.id);
  const removedChats = social.chats.filter(chat => chat.scrapbookId === book.id);
  const removedChatIds = new Set(removedChats.map(chat => chat.id));
  const removedMessages = social.chatMessages.filter(message => removedChatIds.has(message.chatId));

  const candidateAssets = new Set();
  for (const entry of removedEntries) {
    for (const photo of Array.isArray(entry.photos) ? entry.photos : []) {
      if (photo?.src?.startsWith('/uploads/')) candidateAssets.add(photo.src);
    }
    for (const item of Array.isArray(entry.canvasItems) ? entry.canvasItems : []) {
      if (item?.type === 'photo' && item?.src?.startsWith('/uploads/')) candidateAssets.add(item.src);
    }
  }
  for (const message of removedMessages) {
    const messageImages = [...new Set([
      ...(Array.isArray(message?.images) ? message.images : []),
      message?.image || ''
    ].filter(Boolean))];
    for (const src of messageImages) if (src.startsWith('/uploads/')) candidateAssets.add(src);
    if (message?.audio?.startsWith('/uploads/')) candidateAssets.add(message.audio);
  }

  social.scrapbooks = social.scrapbooks.filter(item => item.id !== book.id);
  social.invites = social.invites.filter(invite => invite.scrapbookId !== book.id);
  social.chats = social.chats.filter(chat => !removedChatIds.has(chat.id));
  social.chatMessages = social.chatMessages.filter(message => !removedChatIds.has(message.chatId));
  social.mentions = social.mentions.filter(item => item.scrapbookId !== book.id && !removedChatIds.has(item.chatId));
  social.activityNotifications = social.activityNotifications.filter(item => item.scrapbookId !== book.id && !removedChatIds.has(item.chatId));

  for (const readMap of Object.values(social.chatRead || {})) {
    if (!readMap || typeof readMap !== 'object') continue;
    for (const chatId of removedChatIds) delete readMap[chatId];
  }

  const assetStillUsed = src =>
    remainingEntries.some(entry =>
      (Array.isArray(entry.photos) && entry.photos.some(photo => photo?.src === src)) ||
      (Array.isArray(entry.canvasItems) && entry.canvasItems.some(item => item?.type === 'photo' && item?.src === src))
    ) ||
    social.chatMessages.some(message =>
      message?.image === src ||
      (Array.isArray(message?.images) && message.images.includes(src)) ||
      message?.audio === src
    ) ||
    Object.values(social.profiles || {}).some(profile => profile?.avatar === src);

  const orphanedAssets = [...candidateAssets].filter(src => !assetStillUsed(src));
  for (const src of orphanedAssets) {
    if (social.uploadOwners) delete social.uploadOwners[src];
  }

  await writeEntries(remainingEntries);
  await writeSocial(social);

  for (const src of orphanedAssets) {
    try { await fsp.unlink(path.join(UPLOADS, path.basename(src))); }
    catch (err) { if (err?.code !== 'ENOENT') console.warn('Could not remove orphaned upload:', src, err?.message || err); }
  }

  emitLiveMany(viewers, 'social', { type:'scrapbook_deleted', scrapbookId:book.id, from:actor });
  return { deleted:true, scrapbookId:book.id };
}

async function serveFile(res, file) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return notFound(res);
    res.writeHead(200, { 'Content-Type': contentType(file), 'Content-Length': stat.size, 'Cache-Control': file.includes(`${path.sep}uploads${path.sep}`) ? 'private, max-age=86400' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch { notFound(res); }
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, {
    title: JOURNAL_TITLE,
    subtitle: JOURNAL_SUBTITLE,
    production: PROD,
    pushEnabled: PUSH_READY,
    pushPublicKey: PUSH_READY ? VAPID_PUBLIC_KEY : ''
  });

  if (pathname === '/api/tag-availability' && req.method === 'GET') {
    const tag = slugTag(url.searchParams.get('tag') || '');
    if (!validTag(tag)) return json(res, 200, { tag, valid:false, available:false });
    const reserved = PENDING_SIGNUP_TAGS.has(tag);
    return json(res, 200, { tag, valid:true, available:!reserved && !(await accountExists(tag)) });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    const tag = slugTag(body.username || body.tag);
    const credential = await getCredential(tag);
    if (!credential || !(await verifyCredential(credential, String(body.password || '')))) return json(res, 401, { error: 'That tag or password does not match.' });
    const now = new Date().toISOString();
    await persistPresence(tag, 'active', now, { force:true });
    const social = await readSocial();
    emitLiveMany(presenceChatPeers(social,tag), 'presence', { tag, status:'active', lastActiveAt:now });
    return json(res, 200, { tag }, { 'Set-Cookie': sessionCookie(makeSession(tag)) });
  }

  if (pathname === '/api/signup' && req.method === 'POST') {
    const body = await readBody(req, 128 * 1024);
    const tag = slugTag(body.tag);
    const displayName = String(body.displayName || '').trim().slice(0, 60);
    const password = String(body.password || '');
    if (!validTag(tag)) return json(res, 400, { error: 'Tag must be 3–24 characters using letters, numbers, dot, dash or underscore.' });
    if (password.length < 8) return json(res, 400, { error: 'Use a password with at least 8 characters.' });
    if (PENDING_SIGNUP_TAGS.has(tag)) return json(res, 409, { error: 'That @tag is already taken.' });

    PENDING_SIGNUP_TAGS.add(tag);
    try {
      if (await accountExists(tag)) return json(res, 409, { error: 'That @tag is already taken.' });
      const accounts = await readAccounts();
      if (accounts.some(account => slugTag(account.tag) === tag) || BOOTSTRAP_USERS.has(tag)) {
        return json(res, 409, { error: 'That @tag is already taken.' });
      }
      accounts.push({ tag, passwordHash: await scryptHash(password), createdAt: new Date().toISOString() });
      await writeAccounts(accounts);
      const social = await readSocial();
      const createdAt = new Date().toISOString();
      social.profiles[tag] = { tag, displayName: displayName || tag, avatar: '', bio: '', guideVersion: 0, createdAt };
      social.notificationHub ||= {};
      social.notificationHub[tag] = { lastSeenAt: createdAt };
      await writeSocial(social);
      await persistPresence(tag, 'active', createdAt, { force:true });
      return json(res, 201, { tag }, { 'Set-Cookie': sessionCookie(makeSession(tag)) });
    } finally {
      PENDING_SIGNUP_TAGS.delete(tag);
    }
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const tag = await getUser(req);
    if (tag) {
      const now = new Date().toISOString();
      await persistPresence(tag, 'offline', now, { force:true });
      const social = await readSocial();
      emitLiveMany(presenceChatPeers(social,tag), 'presence', { tag, status:'offline', lastActiveAt:now });
    }
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }

  const user = await requireAuth(req, res);
  if (!user) return;
  if (pathname === '/api/events' && req.method === 'GET') {
    registerLiveClient(req, res, user);
    return;
  }
  const social = await readSocial();

  if (pathname === '/api/presence' && req.method === 'POST') {
    const now = new Date().toISOString();
    await persistPresence(user, 'active', now);
    emitLiveMany(presenceChatPeers(social,user), 'presence', { tag:user, status:'active', lastActiveAt:now });
    return json(res, 200, { presence:presenceSnapshot(user) });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    social.notificationHub ||= {};
    if (!social.notificationHub[user]) {
      social.notificationHub[user] = { lastSeenAt: new Date().toISOString() };
      await writeSocial(social);
    }
    const guideProfile = social.profiles[user] || { tag:user, displayName:user, avatar:'', bio:'', createdAt:new Date().toISOString() };
    let seenGuideVersion = Number(guideProfile.guideVersion);
    if (!Number.isFinite(seenGuideVersion) || seenGuideVersion < 0) {
      const existingEntries = await readEntries();
      const hasPostedMemory = existingEntries.some(entry => entry.author === user);
      seenGuideVersion = hasPostedMemory ? Math.max(1, GUIDE_VERSION - 1) : 0;
      guideProfile.guideVersion = seenGuideVersion;
      if (hasPostedMemory) guideProfile.guideCompletedAt ||= new Date().toISOString();
      social.profiles[user] = guideProfile;
      await writeSocial(social);
    }

    const overrideBookId = isPlatformOwner(social, user)
      ? String(url.searchParams.get('overrideBookId') || '')
      : '';
    const books = social.scrapbooks
      .filter(b => canViewBook(social, b, user) || (
        overrideBookId &&
        b.id === overrideBookId &&
        b.type === 'personal' &&
        b.owner !== user
      ))
      .sort((a,b) => {
        const ao = a.owner === user ? 0 : 1;
        const bo = b.owner === user ? 0 : 1;
        return ao - bo || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      })
      .map(b => decorateBook(social, b, user, {
        overrideAccess:Boolean(overrideBookId && b.id === overrideBookId && !canViewBook(social, b, user))
      }));
    const invites = social.invites.filter(i => i.to === user && i.status === 'pending').map(i => ({
      ...i,
      fromProfile: publicProfileFor(social, i.from),
      scrapbook: social.scrapbooks.find(b => b.id === i.scrapbookId) ? decorateBook(social, social.scrapbooks.find(b => b.id === i.scrapbookId), user) : null
    }));

    const followingTags = [...new Set(social.follows.filter(f => f.follower === user).map(f => f.following))];
    const following = followingTags.map(tag => publicProfileFor(social, tag));
    const followers = social.follows.filter(f => f.following === user).map(f => publicProfileFor(social, f.follower));

    const followingShelf = followingTags.map(tag => {
      const personalBooks = social.scrapbooks
        .filter(book => book.type === 'personal' && book.owner === tag)
        .sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

      const scrapbooks = personalBooks
        .filter(book => canViewBook(social, book, user))
        .map(book => ({ ...decorateBook(social, book, user), accessible:true, locked:false }));

      const hasLockedPersonalScrapbooks = personalBooks.some(book => !canViewBook(social, book, user));

      return {
        profile: publicProfileFor(social, tag),
        scrapbooks,
        hasLockedPersonalScrapbooks,
        scrapbook: scrapbooks[0] || (hasLockedPersonalScrapbooks
          ? { type:'personal', owner:tag, accessible:false, locked:true }
          : null)
      };
    });

    const knownTags = new Set(await allKnownTags());
    const direct = new Set(followingTags);
    const suggestions = new Map();
    for (const follow of social.follows) {
      if (!direct.has(follow.follower)) continue;
      const target = follow.following;
      if (!target || target === user || direct.has(target) || !knownTags.has(target)) continue;
      if (!suggestions.has(target)) suggestions.set(target, new Set());
      suggestions.get(target).add(follow.follower);
    }
    const friendSuggestions = [...suggestions.entries()]
      .sort((a,b) => b[1].size - a[1].size || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 10)
      .map(([tag, via]) => ({
        profile: publicProfileFor(social, tag),
        mutualCount: via.size,
        via: [...via].slice(0, 3).map(v => publicProfileFor(social, v))
      }));

    return json(res, 200, {
      authenticated: true,
      profile: profileFor(social, user),
      scrapbooks: books,
      invites,
      following,
      followers,
      partnerTag: activePartnerTag(social, user),
      notifications: {
        count: notificationSnapshot(social, user).unreadCount,
        pendingInvites: notificationSnapshot(social, user).pendingInviteCount
      },
      messages: {
        unreadCount: totalChatUnread(social, user)
      },
      guide: {
        version: GUIDE_VERSION,
        seenVersion: seenGuideVersion,
        required: seenGuideVersion < GUIDE_VERSION
      },
      home: {
        followingShelf,
        friendSuggestions
      }
    }, { 'Set-Cookie': sessionCookie(makeSession(user)) });
  }

  if (pathname === '/api/guide/complete' && req.method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    const requestedVersion = Math.max(0, Math.min(GUIDE_VERSION, Math.floor(Number(body.version) || GUIDE_VERSION)));
    const current = social.profiles[user] || { tag:user, displayName:user, avatar:'', bio:'', createdAt:new Date().toISOString() };
    current.guideVersion = Math.max(Number(current.guideVersion) || 0, requestedVersion);
    current.guideCompletedAt = new Date().toISOString();
    social.profiles[user] = current;
    await writeSocial(social);
    return json(res, 200, {
      guide: {
        version: GUIDE_VERSION,
        seenVersion: current.guideVersion,
        required: current.guideVersion < GUIDE_VERSION
      }
    });
  }

  if (pathname === '/api/notifications' && req.method === 'GET') {
    return json(res, 200, notificationSnapshot(social, user));
  }

  if (pathname === '/api/notifications/read' && req.method === 'POST') {
    social.notificationHub ||= {};
    social.notificationHub[user] = {
      ...(social.notificationHub[user] || {}),
      lastSeenAt: new Date().toISOString()
    };
    await writeSocial(social);
    const snapshot = notificationSnapshot(social, user);
    return json(res, 200, {
      unreadCount: snapshot.unreadCount,
      pendingInviteCount: snapshot.pendingInviteCount
    });
  }

  if (pathname === '/api/preferences' && req.method === 'PUT') {
    const body = await readBody(req, 64 * 1024);
    const appearanceMode = ['light','night'].includes(body.appearanceMode) ? body.appearanceMode : null;
    if (!appearanceMode) return json(res, 400, { error:'Invalid appearance mode.' });
    const current = social.profiles[user] || { tag:user, displayName:user, avatar:'', bio:'', createdAt:new Date().toISOString() };
    current.appearanceMode = appearanceMode;
    social.profiles[user] = current;
    await writeSocial(social);
    return json(res, 200, { appearanceMode });
  }

  if (pathname === '/api/profile' && req.method === 'PUT') {
    const body = await readBody(req, 128 * 1024);
    const requestedTag = body.tag === undefined ? user : slugTag(body.tag);
    if (!validTag(requestedTag)) {
      return json(res, 400, { error:'Tag must be 3–24 characters using letters, numbers, dot, dash or underscore.' });
    }

    let effectiveUser = user;
    let workingSocial = social;
    let current = workingSocial.profiles[user] || { tag:user, createdAt:new Date().toISOString() };
    const previousBio = String(current.bio || '');

    if (requestedTag !== user) {
      if (PENDING_SIGNUP_TAGS.has(requestedTag) || await accountExists(requestedTag)) {
        return json(res, 409, { error:'That @tag is already taken.' });
      }

      const accounts = await readAccounts();
      const accountIndex = accounts.findIndex(account => account.tag === user && account.disabled !== true);
      if (accountIndex >= 0) {
        accounts[accountIndex] = { ...accounts[accountIndex], tag:requestedTag, updatedAt:new Date().toISOString() };
      } else if (BOOTSTRAP_USERS.has(user)) {
        const legacy = BOOTSTRAP_USERS.get(user);
        accounts.push({
          tag:requestedTag,
          ...(legacy.type === 'sha256' ? { type:'sha256', hash:legacy.hash } : legacy),
          createdAt:current.createdAt || new Date().toISOString(),
          updatedAt:new Date().toISOString()
        });
        // Reserve and disable the old bootstrap tag so it cannot still sign in.
        accounts.push({
          tag:user,
          disabled:true,
          renamedTo:requestedTag,
          createdAt:new Date().toISOString()
        });
      } else {
        return json(res, 409, { error:'This account cannot change its @tag right now.' });
      }

      const entries = await readEntries();
      workingSocial = renameExactTagDeep(workingSocial, user, requestedTag);
      const renamedEntries = renameExactTagDeep(entries, user, requestedTag);
      current = workingSocial.profiles[requestedTag] || { ...current, tag:requestedTag };
      current.tag = requestedTag;
      workingSocial.profiles[requestedTag] = current;

      await writeAccounts(accounts);
      await writeEntries(renamedEntries);
      effectiveUser = requestedTag;
    }

    const nextBio = String(body.bio || '').trim().slice(0, 220);
    current.displayName = String(body.displayName || current.displayName || effectiveUser).trim().slice(0, 60);
    current.bio = nextBio;
    current.tag = effectiveUser;
    if (String(body.avatar || '').startsWith('/uploads/')) current.avatar = String(body.avatar);
    workingSocial.profiles[effectiveUser] = current;

    await appendMentionNotifications(workingSocial, {
      from:effectiveUser,
      text:nextBio,
      previousText:previousBio,
      kind:'profile'
    });
    await writeSocial(workingSocial);

    return json(
      res,
      200,
      { profile:profileFor(workingSocial,effectiveUser), tagChanged:effectiveUser !== user },
      effectiveUser !== user ? { 'Set-Cookie':sessionCookie(makeSession(effectiveUser)) } : {}
    );
  }

  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    if (!PUSH_READY) return json(res, 503, { error: 'Push notifications are not configured yet.' });
    const body = await readBody(req, 256 * 1024);
    const subscription = body.subscription;
    if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return json(res, 400, { error: 'Invalid push subscription.' });
    }
    social.pushSubscriptions = social.pushSubscriptions.filter(s => s.endpoint !== subscription.endpoint);
    social.pushSubscriptions.push({
      id: crypto.randomUUID(),
      tag: user,
      endpoint: subscription.endpoint,
      subscription: {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime || null,
        keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) }
      },
      createdAt: new Date().toISOString()
    });
    const current = social.notificationSettings[user] || {};
    social.notificationSettings[user] = {
      ...current,
      enabled: body.enabled !== false,
      reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.reminderTime || '')) ? body.reminderTime : (current.reminderTime || '20:00'),
      timezone: String(body.timezone || current.timezone || 'UTC').slice(0, 80)
    };
    await writeSocial(social);
    return json(res, 200, { ok: true, settings: profileFor(social, user).notifications });
  }

  if (pathname === '/api/push/settings' && req.method === 'PUT') {
    const body = await readBody(req, 64 * 1024);
    const current = social.notificationSettings[user] || {};
    const reminderTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.reminderTime || '')) ? String(body.reminderTime) : (current.reminderTime || '20:00');
    const timezone = String(body.timezone || current.timezone || 'UTC').slice(0, 80);
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date()); }
    catch { return json(res, 400, { error: 'Invalid timezone.' }); }
    social.notificationSettings[user] = {
      ...current,
      enabled: body.enabled === true,
      reminderTime,
      timezone
    };
    await writeSocial(social);
    return json(res, 200, { settings: profileFor(social, user).notifications });
  }

  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    const endpoint = String(body.endpoint || '');
    social.pushSubscriptions = social.pushSubscriptions.filter(s => !(s.tag === user && (!endpoint || s.endpoint === endpoint)));
    const current = social.notificationSettings[user] || {};
    social.notificationSettings[user] = { ...current, enabled: false };
    await writeSocial(social);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/people' && req.method === 'GET') {
    const q = slugTag(url.searchParams.get('q') || '');
    let tags = (await allKnownTags()).filter(t => t !== user);
    if (q) tags = tags.filter(t => t.includes(q) || String(publicProfileFor(social, t).displayName || '').toLowerCase().includes(q));
    tags.sort((a,b) => {
      const ar = Number(isFollowing(social,user,a) || isFollowing(social,a,user) || isActivePartner(social,user,a));
      const br = Number(isFollowing(social,user,b) || isFollowing(social,b,user) || isActivePartner(social,user,b));
      return br - ar || String(publicProfileFor(social,a).displayName || a).localeCompare(String(publicProfileFor(social,b).displayName || b));
    });
    tags = tags.slice(0, 12);
    return json(res, 200, {
      people: tags.map(t => ({
        ...publicProfileFor(social, t),
        isFollowing: isFollowing(social, user, t),
        followsYou: isFollowing(social, t, user),
        isPartner: isActivePartner(social, user, t)
      }))
    });
  }

  if (pathname === '/api/preview/freedom-wall' && req.method === 'GET') {
    const posts = [...social.freedomWall]
      .sort((a,b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      .slice(-250);
    const profiles = Object.fromEntries(
      [...new Set(posts.map(post => post.author).filter(Boolean))]
        .map(tag => [tag, publicProfileFor(social, tag)])
    );
    return json(res, 200, { posts, profiles });
  }

  if (pathname === '/api/preview/freedom-wall' && req.method === 'POST') {
    const body = await readBody(req, 256 * 1024);
    const text = String(body.text || '').trim().slice(0, 900);
    const image = String(body.image || '');
    const safeImage = image.startsWith('/uploads/') ? image : '';
    if (!text && !safeImage) return json(res, 400, { error:'Write something or add one photo.' });
    const post = {
      id:crypto.randomUUID(),
      author:user,
      text,
      image:safeImage,
      createdAt:new Date().toISOString()
    };
    social.freedomWall.push(post);
    if (social.freedomWall.length > 1200) social.freedomWall = social.freedomWall.slice(-1200);
    await writeSocial(social);
    for (const tag of LIVE_CLIENTS.keys()) emitLiveEvent(tag,'wall',{ type:'wall_posted', postId:post.id, from:user });
    return json(res, 201, { post, profile:publicProfileFor(social,user) });
  }

  const freedomWallDeleteMatch = pathname.match(/^\/api\/preview\/freedom-wall\/([a-f0-9-]+)$/i);
  if (freedomWallDeleteMatch && req.method === 'DELETE') {
    const index = social.freedomWall.findIndex(post => post.id === freedomWallDeleteMatch[1]);
    if (index < 0) return notFound(res);
    const post = social.freedomWall[index];
    if (post.author !== user && !isPlatformOwner(social,user)) return forbidden(res,'You can only remove your own wall post.');
    social.freedomWall.splice(index,1);
    await writeSocial(social);
    for (const tag of LIVE_CLIENTS.keys()) emitLiveEvent(tag,'wall',{ type:'wall_deleted', postId:post.id, from:user });
    return json(res,200,{ ok:true });
  }

  const personProfileMatch = pathname.match(/^\/api\/people\/([^/]+)\/profile$/);
  if (personProfileMatch && req.method === 'GET') {
    const target = slugTag(personProfileMatch[1]);
    if (!target || !(await accountExists(target))) return json(res, 404, { error: 'That profile no longer exists.' });
    const viewerIsOwner = isPlatformOwner(social, user);
    const overrideActive = viewerIsOwner && target !== user && url.searchParams.get('override') === '1';

    const followingTags = [...new Set(social.follows.filter(f => f.follower === target).map(f => f.following))];
    const followerTags = [...new Set(social.follows.filter(f => f.following === target).map(f => f.follower))];
    const relationProfile = tag => ({
      ...publicProfileFor(social, tag),
      isFollowing: isFollowing(social, user, tag),
      followsYou: isFollowing(social, tag, user),
      isPartner: isActivePartner(social, user, tag)
    });

    const personalBooks = social.scrapbooks
      .filter(book => book.type === 'personal' && book.owner === target)
      .sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

    const personalScrapbooks = personalBooks
      .filter(book => overrideActive || canViewBook(social, book, user))
      .map(book => ({
        ...decorateBook(social, book, user, {
          overrideAccess:overrideActive && !canViewBook(social, book, user)
        }),
        profiles:[publicProfileFor(social, target)],
        accessible:true,
        locked:false
      }));

    const hasLockedPersonalScrapbooks = overrideActive
      ? false
      : personalBooks.some(book => !canViewBook(social, book, user));
    const personalScrapbook = personalScrapbooks[0] || (hasLockedPersonalScrapbooks
      ? { type:'personal', owner:target, accessible:false, locked:true }
      : null);

    return json(res, 200, {
      profile: publicProfileFor(social, target),
      isSelf: target === user,
      viewerIsOwner,
      overrideAvailable: viewerIsOwner && target !== user,
      overrideActive,
      isFollowing: target !== user && isFollowing(social, user, target),
      followsYou: target !== user && isFollowing(social, target, user),
      isPartner: target !== user && isActivePartner(social, user, target),
      followerCount: followerTags.length,
      followingCount: followingTags.length,
      followers: followerTags.map(relationProfile),
      following: followingTags.map(relationProfile),
      personalScrapbooks,
      hasLockedPersonalScrapbooks,
      personalScrapbook
    });
  }

  const followMatch = pathname.match(/^\/api\/people\/([^/]+)\/follow$/);
  if (followMatch && req.method === 'POST') {
    const target = slugTag(followMatch[1]);
    if (!target || target === user) return json(res, 400, { error: 'You cannot follow yourself.' });
    if (!(await accountExists(target))) return json(res, 404, { error: `We could not find ${displayTag(target)}.` });
    if (!isFollowing(social, user, target)) {
      social.follows.push({ follower:user, following:target, createdAt:new Date().toISOString() });
      const actor = publicProfileFor(social, user);
      await sendUserPush(social, {
        to:target,
        title:`${actor.displayName || displayTag(user)} followed you`,
        body:'Open the scrapbook to view their profile.',
        tag:`follow-${user}-${target}`
      });
      emitLiveEvent(target, 'notification', { type:'follow', from:user });
      emitLiveEvent(target, 'social', { type:'followers_changed' });
      await writeSocial(social);
    }
    return json(res, 200, { following:true, profile:{ ...publicProfileFor(social,target), isFollowing:true, followsYou:isFollowing(social,target,user), isPartner:isActivePartner(social,user,target) } });
  }
  if (followMatch && req.method === 'DELETE') {
    const target = slugTag(followMatch[1]);
    const before = social.follows.length;
    social.follows = social.follows.filter(f => !(f.follower === user && f.following === target));
    if (social.follows.length !== before) {
      await writeSocial(social);
      emitLiveEvent(target, 'social', { type:'followers_changed' });
    }
    return json(res, 200, { following:false });
  }

  if (pathname === '/api/follows' && req.method === 'GET') {
    return json(res, 200, {
      following: social.follows.filter(f => f.follower === user).map(f => publicProfileFor(social, f.following)),
      followers: social.follows.filter(f => f.following === user).map(f => publicProfileFor(social, f.follower))
    });
  }

  if (pathname === '/api/scrapbooks' && req.method === 'POST') {
    const body = await readBody(req, 128 * 1024);
    const type = body.type === 'couple' ? 'couple' : (body.type === 'personal' ? 'personal' : 'group');
    if (type === 'couple' && userHasOtherCouple(social, user)) return json(res, 409, { error: 'You are already bound in a lovers scrapbook. Leave that binding before creating another.' });
    const privacy = ['followers','partner','private'].includes(body.privacy) ? body.privacy : 'private';
    const coverTheme = ['rose','midnight','forest','ocean','sunset','classic'].includes(body.coverTheme) ? body.coverTheme : 'rose';
    const defaultName = type === 'couple' ? 'Our Love Story' : (type === 'personal' ? 'My Personal Scrapbook' : 'Our Scrapbook');
    const book = {
      id: crypto.randomUUID(),
      type,
      name: String(body.name || defaultName).trim().slice(0, 80),
      coverTheme,
      owner: user,
      members: [user],
      admins: type === 'group' ? [user] : undefined,
      privacy: type === 'personal' ? privacy : undefined,
      createdAt: new Date().toISOString()
    };
    social.scrapbooks.push(book);
    if (type === 'group') {
      social.chats.push({
        id:crypto.randomUUID(),
        type:'group',
        scrapbookId:book.id,
        createdAt:new Date().toISOString()
      });
    }
    await writeSocial(social);
    return json(res, 201, { scrapbook: decorateBook(social, book, user) });
  }

  const deleteRespondMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/delete-request\/respond$/i);
  if (deleteRespondMatch && req.method === 'POST') {
    const book = social.scrapbooks.find(item => item.id === deleteRespondMatch[1]);
    if (!book || book.type !== 'group') return notFound(res);
    if (book.owner !== user) return forbidden(res, 'Only the group owner can approve a deletion request.');
    const request = book.deleteRequest;
    if (!request || request.status !== 'pending') return json(res, 404, { error:'There is no pending group deletion request.' });
    const body = await readBody(req, 64 * 1024);
    if (body.approve !== true) {
      const requester = request.requestedBy;
      book.deleteRequestHistory = Array.isArray(book.deleteRequestHistory) ? book.deleteRequestHistory : [];
      book.deleteRequestHistory.push({ ...request, status:'declined', respondedBy:user, respondedAt:new Date().toISOString() });
      delete book.deleteRequest;
      social.activityNotifications = social.activityNotifications.filter(item =>
        !(item.type === 'group_delete_request' && item.scrapbookId === book.id && item.to === user)
      );
      appendActivityNotification(social, { to:requester, from:user, type:'group_delete_declined', scrapbookId:book.id, scrapbookName:book.name });
      await sendUserPush(social, {
        to:requester,
        title:`Deletion request declined · ${book.name}`,
        body:'The group owner kept the scrapbook.',
        tag:`group-delete-declined-${book.id}`
      });
      await writeSocial(social);
      emitLiveEvent(requester, 'notification', { type:'group_delete_declined', from:user, scrapbookId:book.id });
      emitLiveMany(book.members, 'social', { type:'group_delete_request_closed', scrapbookId:book.id });
      return json(res, 200, { deleted:false, scrapbook:decorateBook(social,book,user) });
    }
    const requester = request.requestedBy;
    await sendUserPush(social, {
      to:requester,
      title:`Group deletion approved · ${book.name}`,
      body:'The owner approved your request. The group scrapbook has been deleted.',
      tag:`group-delete-approved-${book.id}`
    });
    const result = await deleteScrapbookCompletely(social, book, user);
    return json(res, 200, result);
  }

  const deleteScrapbookMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)$/i);
  if (deleteScrapbookMatch && req.method === 'DELETE') {
    const book = social.scrapbooks.find(item => item.id === deleteScrapbookMatch[1]);
    if (!book) return notFound(res);

    if (book.type === 'group' && book.owner !== user) {
      if (!isGroupAdmin(book,user)) return forbidden(res, 'Only a group admin can request deletion.');
      if (book.deleteRequest?.status === 'pending') {
        return json(res, 409, { error:'A group deletion request is already waiting for the owner.' });
      }
      book.deleteRequest = {
        id:crypto.randomUUID(),
        status:'pending',
        requestedBy:user,
        createdAt:new Date().toISOString()
      };
      appendActivityNotification(social, {
        to:book.owner,
        from:user,
        type:'group_delete_request',
        scrapbookId:book.id,
        scrapbookName:book.name,
        excerpt:'An admin requested to delete this Group scrapbook.'
      });
      const requester = publicProfileFor(social,user);
      await sendUserPush(social, {
        to:book.owner,
        title:`${requester.displayName || displayTag(user)} requested group deletion`,
        body:`Approve or decline deletion of ${book.name}.`,
        tag:`group-delete-request-${book.id}`,
        url:'/?notifications=1'
      });
      await writeSocial(social);
      emitLiveEvent(book.owner, 'notification', { type:'group_delete_request', from:user, scrapbookId:book.id });
      emitLiveMany(book.members, 'social', { type:'group_delete_request', scrapbookId:book.id, from:user });
      return json(res, 202, { approvalRequired:true, request:book.deleteRequest });
    }

    if (book.owner !== user) return forbidden(res, 'Only the scrapbook owner can delete this scrapbook.');
    const result = await deleteScrapbookCompletely(social, book, user);
    return json(res, 200, result);
  }

  const coverThemeMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/cover-theme$/i);
  if (coverThemeMatch && req.method === 'PUT') {
    const book = social.scrapbooks.find(item => item.id === coverThemeMatch[1]);
    if (!book || !canViewBook(social, book, user)) return notFound(res);
    if (book.owner !== user) return forbidden(res, 'Only the scrapbook owner can change the shared cover theme.');
    const body = await readBody(req, 64 * 1024);
    const coverTheme = ['rose','midnight','forest','ocean','sunset','classic'].includes(body.coverTheme) ? body.coverTheme : null;
    if (!coverTheme) return json(res, 400, { error:'Invalid cover theme.' });
    book.coverTheme = coverTheme;
    await writeSocial(social);
    emitLiveMany(realtimeBookViewers(social, book), 'social', { type:'cover_theme_changed', scrapbookId:book.id });
    return json(res, 200, { scrapbook:decorateBook(social, book, user) });
  }

  if (pathname === '/api/personal/privacy' && req.method === 'PUT') {
    const body = await readBody(req, 64 * 1024);
    if (!['followers','partner','private'].includes(body.privacy)) {
      return json(res, 400, { error:'Invalid privacy setting.' });
    }

    const books = social.scrapbooks.filter(book => book.type === 'personal' && book.owner === user);
    if (!books.length) return json(res, 404, { error:'You do not have any Personal scrapbooks yet.' });

    for (const book of books) book.privacy = body.privacy;
    await writeSocial(social);

    const affected = new Set([user]);
    social.follows
      .filter(follow => follow.following === user)
      .forEach(follow => affected.add(follow.follower));
    const partner = activePartnerTag(social, user);
    if (partner) affected.add(partner);

    emitLiveMany([...affected], 'social', {
      type:'personal_privacy_bulk_changed',
      owner:user,
      privacy:body.privacy,
      scrapbookIds:books.map(book => book.id)
    });

    return json(res, 200, {
      privacy:body.privacy,
      scrapbooks:books.map(book => decorateBook(social, book, user))
    });
  }

  const privacyMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/privacy$/i);
  if (privacyMatch && req.method === 'PUT') {
    const book = social.scrapbooks.find(b => b.id === privacyMatch[1]);
    if (!book || book.type !== 'personal') return notFound(res);
    if (book.owner !== user) return forbidden(res, 'Only the owner can change personal scrapbook privacy.');
    const body = await readBody(req, 64 * 1024);
    if (!['followers','partner','private'].includes(body.privacy)) return json(res, 400, { error: 'Invalid privacy setting.' });
    book.privacy = body.privacy;
    await writeSocial(social);

    const affected = new Set([book.owner]);
    social.follows
      .filter(follow => follow.following === book.owner)
      .forEach(follow => affected.add(follow.follower));
    const partner = activePartnerTag(social, book.owner);
    if (partner) affected.add(partner);
    emitLiveMany([...affected], 'social', {
      type:'personal_privacy_changed',
      scrapbookId:book.id,
      owner:book.owner,
      privacy:book.privacy
    });

    return json(res, 200, { scrapbook: decorateBook(social, book, user) });
  }

  const groupAdminMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/admins\/([^/]+)$/i);
  if (groupAdminMatch && ['PUT','DELETE'].includes(req.method)) {
    const book = social.scrapbooks.find(item => item.id === groupAdminMatch[1]);
    if (!book || book.type !== 'group') return notFound(res);
    if (book.owner !== user) return forbidden(res, 'Only the group owner can manage admins.');
    const target = slugTag(groupAdminMatch[2]);
    if (!target || !book.members.includes(target)) return json(res, 404, { error:'That person is not a group member.' });
    if (target === book.owner) return json(res, 409, { error:'The group owner is always an admin.' });
    const admins = new Set(groupAdminTags(book));
    if (req.method === 'PUT') admins.add(target);
    else admins.delete(target);
    book.admins = [...admins];
    appendActivityNotification(social, {
      to:target,
      from:user,
      type:req.method === 'PUT' ? 'group_admin_added' : 'group_admin_removed',
      scrapbookId:book.id,
      scrapbookName:book.name
    });
    await writeSocial(social);
    emitLiveMany(book.members, 'social', { type:'group_admins_changed', scrapbookId:book.id, from:user });
    emitLiveEvent(target, 'notification', { type:req.method === 'PUT' ? 'group_admin_added' : 'group_admin_removed', from:user, scrapbookId:book.id });
    return json(res, 200, { scrapbook:decorateBook(social,book,user) });
  }

  const groupMemberMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/members\/([^/]+)$/i);
  if (groupMemberMatch && req.method === 'DELETE') {
    const book = social.scrapbooks.find(item => item.id === groupMemberMatch[1]);
    if (!book || book.type !== 'group') return notFound(res);
    if (!isGroupAdmin(book,user)) return forbidden(res, 'Only a group admin can remove members.');
    const target = slugTag(groupMemberMatch[2]);
    if (!target || !book.members.includes(target)) return json(res, 404, { error:'That person is not a group member.' });
    if (target === book.owner) return json(res, 409, { error:'The group owner cannot be removed.' });
    if (target === user) return json(res, 409, { error:'Use Leave group to remove yourself.' });

    book.members = book.members.filter(tag => tag !== target);
    book.admins = groupAdminTags(book).filter(tag => tag !== target);
    const groupChat = social.chats.find(chat => chat.type === 'group' && chat.scrapbookId === book.id);
    if (groupChat && social.chatRead?.[target]) delete social.chatRead[target][groupChat.id];

    appendActivityNotification(social, { to:target, from:user, type:'group_removed', scrapbookId:book.id, scrapbookName:book.name });
    await sendUserPush(social, {
      to:target,
      title:`Removed from ${book.name}`,
      body:'A group admin removed you from the scrapbook.',
      tag:`group-removed-${book.id}`
    });
    await writeSocial(social);
    emitLiveEvent(target, 'notification', { type:'group_removed', from:user, scrapbookId:book.id });
    emitLiveEvent(target, 'social', { type:'group_removed', scrapbookId:book.id, from:user });
    emitLiveMany(book.members, 'social', { type:'scrapbook_members_changed', scrapbookId:book.id, from:user });
    return json(res, 200, { scrapbook:decorateBook(social,book,user) });
  }

  const groupLeaveMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/leave$/i);
  if (groupLeaveMatch && req.method === 'POST') {
    const book = social.scrapbooks.find(item => item.id === groupLeaveMatch[1]);
    if (!book || book.type !== 'group' || !book.members.includes(user)) return notFound(res);
    if (book.owner === user) return json(res, 409, { error:'The group owner cannot leave. Delete the group or keep ownership.' });
    book.members = book.members.filter(tag => tag !== user);
    book.admins = groupAdminTags(book).filter(tag => tag !== user);
    const groupChat = social.chats.find(chat => chat.type === 'group' && chat.scrapbookId === book.id);
    if (groupChat && social.chatRead?.[user]) delete social.chatRead[user][groupChat.id];
    appendActivityNotification(social, { to:book.owner, from:user, type:'group_member_left', scrapbookId:book.id, scrapbookName:book.name });
    await writeSocial(social);
    emitLiveEvent(book.owner, 'notification', { type:'group_member_left', from:user, scrapbookId:book.id });
    emitLiveEvent(user, 'social', { type:'group_left', scrapbookId:book.id, from:user });
    emitLiveMany(book.members, 'social', { type:'scrapbook_members_changed', scrapbookId:book.id, from:user });
    return json(res, 200, { left:true, scrapbookId:book.id });
  }

  const inviteMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/invite$/i);
  if (inviteMatch && req.method === 'POST') {
    const book = bookForUser(social, inviteMatch[1], user);
    if (!book) return forbidden(res);
    if (book.type === 'personal') return json(res, 409, { error: 'Personal scrapbooks use privacy and followers instead of invitations.' });
    if (book.type === 'group' && !isGroupAdmin(book,user)) return forbidden(res, 'Only a group admin can invite new members.');
    const body = await readBody(req, 64 * 1024);
    const target = slugTag(body.tag);
    if (!target || target === user) return json(res, 400, { error: 'Enter another person’s @tag.' });
    if (!(await accountExists(target))) return json(res, 404, { error: `We could not find ${displayTag(target)}.` });
    if (book.members.includes(target)) return json(res, 409, { error: `${displayTag(target)} is already in this scrapbook.` });
    if (book.type === 'couple') {
      const pending = social.invites.filter(i => i.scrapbookId === book.id && i.status === 'pending').length;
      if (book.members.length + pending >= 2) return json(res, 409, { error: 'A lovers scrapbook can only bind two people.' });
      if (userHasOtherCouple(social, target)) return json(res, 409, { error: `${displayTag(target)} is already bound in another lovers scrapbook.` });
    }
    const existing = social.invites.find(i => i.scrapbookId === book.id && i.to === target && i.status === 'pending');
    if (existing) return json(res, 409, { error: 'That invitation is already waiting for them.' });
    const invite = { id: crypto.randomUUID(), scrapbookId: book.id, type: book.type, from: user, to: target, status: 'pending', createdAt: new Date().toISOString() };
    social.invites.push(invite);
    const inviter = publicProfileFor(social, user);
    await sendUserPush(social, {
      to:target,
      title:`${inviter.displayName || displayTag(user)} invited you`,
      body:book.type === 'couple' ? 'You received a Lovers scrapbook invitation.' : `You were invited to ${book.name}.`,
      tag:`invite-${invite.id}`
    });
    emitLiveEvent(target, 'notification', { type:book.type === 'couple' ? 'couple_invite' : 'group_invite', from:user, inviteId:invite.id });
    await writeSocial(social);
    return json(res, 201, { invite });
  }

  const respondMatch = pathname.match(/^\/api\/invites\/([a-f0-9-]+)\/respond$/i);
  if (respondMatch && req.method === 'POST') {
    const invite = social.invites.find(i => i.id === respondMatch[1] && i.to === user && i.status === 'pending');
    if (!invite) return notFound(res);
    const body = await readBody(req, 64 * 1024);
    if (body.accept !== true) {
      invite.status = 'declined'; invite.respondedAt = new Date().toISOString();
      const responder = publicProfileFor(social, user);
      appendActivityNotification(social, { to:invite.from, from:user, type:'invite_declined', scrapbookId:invite.scrapbookId });
      await sendUserPush(social, {
        to:invite.from,
        title:`${responder.displayName || displayTag(user)} declined your invitation`,
        body:'Open your scrapbook to see the latest status.',
        tag:`invite-response-${invite.id}`
      });
      emitLiveEvent(invite.from, 'notification', { type:'invite_declined', from:user, scrapbookId:invite.scrapbookId });
      emitLiveEvent(user, 'notification', { type:'invite_removed' });
      await writeSocial(social);
      return json(res, 200, { accepted: false });
    }
    const book = social.scrapbooks.find(b => b.id === invite.scrapbookId);
    if (!book) return notFound(res);
    if (book.type === 'couple') {
      if (book.members.length >= 2) return json(res, 409, { error: 'This lovers scrapbook is already complete.' });
      if (userHasOtherCouple(social, user, book.id)) return json(res, 409, { error: 'You are already bound in another lovers scrapbook.' });
    }
    if (!book.members.includes(user)) book.members.push(user);
    invite.status = 'accepted'; invite.respondedAt = new Date().toISOString();
    if (book.type === 'couple' && book.members.length >= 2 && !book.boundAt) book.boundAt = invite.respondedAt;
    const responder = publicProfileFor(social, user);
    appendActivityNotification(social, { to:invite.from, from:user, type:'invite_accepted', scrapbookId:book.id, scrapbookName:book.name });
    await sendUserPush(social, {
      to:invite.from,
      title:`${responder.displayName || displayTag(user)} accepted your invitation`,
      body:`${book.name} is ready to use together.`,
      tag:`invite-response-${invite.id}`
    });
    emitLiveEvent(invite.from, 'notification', { type:'invite_accepted', from:user, scrapbookId:book.id });
    emitLiveEvent(user, 'notification', { type:'invite_removed' });
    emitLiveMany(book.members, 'social', { type:'scrapbook_members_changed', scrapbookId:book.id });
    await writeSocial(social);
    return json(res, 200, { accepted: true, scrapbook: decorateBook(social, book, user) });
  }

  const unbindRequestMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/unbind\/request$/i);
  if (unbindRequestMatch && req.method === 'POST') {
    const book = bookForUser(social, unbindRequestMatch[1], user);
    if (!book) return forbidden(res);
    if (book.type !== 'couple' || book.members.length !== 2) return json(res, 409, { error: 'Only a fully bound lovers scrapbook can be unbound.' });
    if ((book.bindingStatus || 'bound') === 'unbound') return json(res, 409, { error: 'This lovers scrapbook is already unbound.' });
    if (book.unbindRequest?.status === 'pending') {
      return json(res, 409, { error: book.unbindRequest.requestedBy === user ? 'Your unbind request is already waiting for your partner.' : 'Your partner already requested an unbind. Please approve or decline it.' });
    }
    book.unbindRequest = {
      id: crypto.randomUUID(),
      status: 'pending',
      requestedBy: user,
      approvals: [user],
      createdAt: new Date().toISOString()
    };
    await writeSocial(social);
    return json(res, 201, { scrapbook: decorateBook(social, book, user) });
  }

  const unbindRespondMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/unbind\/respond$/i);
  if (unbindRespondMatch && req.method === 'POST') {
    const book = bookForUser(social, unbindRespondMatch[1], user);
    if (!book) return forbidden(res);
    const request = book.unbindRequest;
    if (!request || request.status !== 'pending') return json(res, 404, { error: 'There is no pending unbind request.' });
    const body = await readBody(req, 64 * 1024);
    if (body.approve !== true) {
      book.unbindHistory = Array.isArray(book.unbindHistory) ? book.unbindHistory : [];
      book.unbindHistory.push({ ...request, status: request.requestedBy === user ? 'cancelled' : 'declined', respondedBy: user, respondedAt: new Date().toISOString() });
      delete book.unbindRequest;
      await writeSocial(social);
      return json(res, 200, { unbound: false, scrapbook: decorateBook(social, book, user) });
    }
    request.approvals = Array.isArray(request.approvals) ? request.approvals : [];
    if (!request.approvals.includes(user)) request.approvals.push(user);
    const everyoneApproved = book.members.every(tag => request.approvals.includes(tag));
    if (everyoneApproved) {
      book.bindingStatus = 'unbound';
      book.unboundAt = new Date().toISOString();
      book.unbindHistory = Array.isArray(book.unbindHistory) ? book.unbindHistory : [];
      book.unbindHistory.push({ ...request, status: 'approved', respondedBy: user, respondedAt: book.unboundAt });
      delete book.unbindRequest;
    }
    await writeSocial(social);
    return json(res, 200, { unbound: everyoneApproved, scrapbook: decorateBook(social, book, user) });
  }

  if (pathname === '/api/chats' && req.method === 'GET') {
    const chats = social.chats
      .filter(chat => canAccessChat(social, chat, user) && !chatHiddenForUser(social,chat,user))
      .map(chat => decorateChat(social, chat, user))
      .sort((a,b) => Number(b.pinned) - Number(a.pinned) || String(b.lastMessage?.createdAt || '').localeCompare(String(a.lastMessage?.createdAt || '')) || String(a.name || '').localeCompare(String(b.name || '')));
    return json(res, 200, { chats, unreadCount:totalChatUnread(social, user) });
  }

  if (pathname === '/api/chats/private' && req.method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    const target = slugTag(body.tag);
    if (!target || target === user) return json(res, 400, { error:'Choose another person to message.' });
    if (!(await accountExists(target))) return json(res, 404, { error:`We could not find ${displayTag(target)}.` });
    let chat = social.chats.find(item =>
      item.type === 'private' &&
      Array.isArray(item.members) &&
      item.members.length === 2 &&
      item.members.includes(user) &&
      item.members.includes(target)
    );
    if (!chat) {
      chat = {
        id:crypto.randomUUID(),
        type:'private',
        members:[user,target].sort(),
        createdAt:new Date().toISOString()
      };
      social.chats.push(chat);
      await writeSocial(social);
      emitLiveEvent(target, 'chat', { type:'chat_created', chatId:chat.id, from:user });
    }
    return json(res, 200, { chat:decorateChat(social, chat, user) });
  }

  const emptyPrivateChatMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)$/i);
  if (emptyPrivateChatMatch && req.method === 'DELETE') {
    const chat = social.chats.find(item => item.id === emptyPrivateChatMatch[1]);
    if (!chat || !canAccessChat(social, chat, user)) return forbidden(res, 'You do not have access to this chat.');
    if (chat.type !== 'private') return json(res, 409, { error:'Only empty private chats can be discarded.' });
    const hasMessages = social.chatMessages.some(message => message.chatId === chat.id);
    if (hasMessages) return json(res, 409, { error:'This conversation already has messages.' });
    const members = Array.isArray(chat.members) ? [...chat.members] : [];
    social.chats = social.chats.filter(item => item.id !== chat.id);
    for (const member of members) {
      if (social.chatRead?.[member]) delete social.chatRead[member][chat.id];
      emitLiveEvent(member, 'chat', { type:'chat_removed', chatId:chat.id, from:user });
    }
    await writeSocial(social);
    return json(res, 200, { discarded:true });
  }

  const chatPreferenceMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/preferences$/i);
  if (chatPreferenceMatch && req.method === 'PATCH') {
    const chat = social.chats.find(item => item.id === chatPreferenceMatch[1]);
    if (!chat || !canAccessChat(social,chat,user)) return forbidden(res, 'You do not have access to this chat.');
    const body = await readBody(req, 32 * 1024);
    const action = String(body.action || '').toLowerCase();
    const pref = ensureChatPreference(social,user,chat.id);

    if (action === 'pin') pref.pinned = body.value !== false;
    else if (action === 'mute') pref.muted = body.value !== false;
    else if (action === 'restrict') pref.restricted = body.value !== false;
    else if (action === 'delete') {
      pref.deletedAt = new Date().toISOString();
      social.chatRead[user] ||= {};
      social.chatRead[user][chat.id] = pref.deletedAt;
    } else if (action === 'block') {
      if (chat.type !== 'private') return json(res, 409, { error:'Only private conversations can be blocked.' });
      const other = chatMembers(social,chat).find(tag => tag !== user);
      if (!other) return json(res, 409, { error:'This conversation cannot be blocked.' });
      social.blockedUsers ||= {};
      const current = new Set(blockedTagsFor(social,user));
      if (body.value === false) current.delete(other); else current.add(other);
      social.blockedUsers[user] = [...current];
    } else {
      return json(res, 400, { error:'Unsupported conversation action.' });
    }

    await writeSocial(social);
    return json(res, 200, { chat:decorateChat(social,chat,user) });
  }

  const chatMessagesMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/messages$/i);
  if (chatMessagesMatch && req.method === 'GET') {
    const chat = social.chats.find(item => item.id === chatMessagesMatch[1]);
    if (!chat || !canAccessChat(social, chat, user)) return forbidden(res, 'You do not have access to this chat.');
    const rawMessages = social.chatMessages
      .filter(message => message.chatId === chat.id)
      .slice(-500);
    const previousReadAt = social.chatRead?.[user]?.[chat.id] || null;
    const latestMessageAt = rawMessages.length ? rawMessages[rawMessages.length - 1].createdAt : null;
    const previousReadMs = Date.parse(previousReadAt || '') || 0;
    const latestMessageMs = Date.parse(latestMessageAt || '') || 0;

    social.chatRead[user] ||= {};
    if (latestMessageAt && latestMessageMs > previousReadMs) {
      social.chatRead[user][chat.id] = latestMessageAt;
      await writeSocial(social);
      for (const target of chatMembers(social,chat)) {
        if (target !== user) emitLiveEvent(target, 'chat', { type:'seen', chatId:chat.id, from:user, seenAt:latestMessageAt });
      }
    }

    const messages = rawMessages.map(message => decorateChatMessage(social,message,user));
    return json(res, 200, {
      chat:decorateChat(social, chat, user),
      messages,
      previousReadAt,
      readThroughAt:latestMessageAt || previousReadAt || null,
      unreadCount:totalChatUnread(social, user)
    });
  }

  if (chatMessagesMatch && req.method === 'POST') {
    const chat = social.chats.find(item => item.id === chatMessagesMatch[1]);
    if (!chat || !canAccessChat(social, chat, user)) return forbidden(res, 'You do not have access to this chat.');
    if (chat.type === 'private') {
      const other = chatMembers(social,chat).find(tag => tag !== user);
      if (other && isBlockedBetween(social,user,other)) return forbidden(res, 'Messaging is unavailable for this conversation.');
    }
    const body = await readBody(req, 128 * 1024);
    const text = String(body.text || '').trim().slice(0, 2000);
    const requestedImages = [
      ...(Array.isArray(body.images) ? body.images : []),
      body.image || ''
    ].map(value => String(value || '')).filter(Boolean);
    const uniqueImages = [...new Set(requestedImages)];
    if (uniqueImages.length > 10) return json(res, 400, { error:'You can send up to 10 photos at once.' });
    const images = uniqueImages.slice(0,10);
    const image = images[0] || '';
    const audio = String(body.audio || '');
    const replyTo = String(body.replyTo || '');
    const repliedMessage = replyTo ? social.chatMessages.find(item => item.id === replyTo && item.chatId === chat.id) : null;
    if (replyTo && (!repliedMessage || repliedMessage.deletedAt)) return json(res, 400, { error:'That replied message is no longer available.' });
    if (!text && !images.length && !audio) return json(res, 400, { error:'Write a message or attach media.' });
    for (const src of images) {
      if (!src.startsWith('/uploads/')) return json(res, 400, { error:'Chat photos must be uploaded first.' });
      if (social.uploadOwners?.[src] !== user) return forbidden(res, 'You can only send photos you uploaded.');
    }
    if (audio) {
      if (!audio.startsWith('/uploads/')) return json(res, 400, { error:'Chat audio must be uploaded first.' });
      if (social.uploadOwners?.[audio] !== user) return forbidden(res, 'You can only send audio you recorded.');
    }
    const message = {
      id:crypto.randomUUID(),
      chatId:chat.id,
      author:user,
      text,
      images,
      image,
      audio,
      replyTo:repliedMessage?.id || null,
      reactions:{},
      createdAt:new Date().toISOString()
    };
    social.chatMessages.push(message);
    social.chatRead[user] ||= {};
    social.chatRead[user][chat.id] = message.createdAt;
    const recipients = chatMembers(social, chat).filter(tag => tag !== user);
    const mentionedTargets = new Set();
    if (chat.type === 'group' && text) {
      const book = social.scrapbooks.find(item => item.id === chat.scrapbookId && item.type === 'group');
      const allowedTargets = new Set(book?.members || []);
      for (const tag of mentionTags(text)) {
        if (tag !== user && allowedTargets.has(tag)) mentionedTargets.add(tag);
      }
      await appendMentionNotifications(social, {
        from:user,
        text,
        kind:'chat',
        scrapbookId:book?.id || null,
        chatId:chat.id,
        messageId:message.id,
        allowedTargets
      });
    }
    const actor = publicProfileFor(social, user);
    for (const target of recipients) {
      const targetPref = chatPreferenceFor(social,target,chat.id);
      const suppressPush = targetPref.muted === true || targetPref.restricted === true || (chat.type === 'private' && isBlockedBetween(social,user,target));
      if (!mentionedTargets.has(target) && !suppressPush) {
        await sendUserPush(social, {
          to:target,
          title:chat.type === 'group'
            ? `${actor.displayName || displayTag(user)} · ${decorateChat(social,chat,target).name}`
            : `${actor.displayName || displayTag(user)} sent you a message`,
          body:text || (images.length ? (images.length === 1 ? 'Sent a photo' : `Sent ${images.length} photos`) : 'Sent a voice message'),
          tag:`chat-${chat.id}`,
          url:`/?messages=${encodeURIComponent(chat.id)}`
        });
      }
      emitLiveEvent(target, 'chat', { type:'message', chatId:chat.id, from:user, messageId:message.id });
    }
    emitLiveEvent(user, 'chat', { type:'message_sent', chatId:chat.id, from:user, messageId:message.id });
    await writeSocial(social);
    return json(res, 201, {
      message:decorateChatMessage(social,message,user),
      unreadCount:totalChatUnread(social,user)
    });
  }

  const chatEditMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/messages\/([a-f0-9-]+)$/i);
  if (chatEditMatch && req.method === 'PATCH') {
    const chat = social.chats.find(item => item.id === chatEditMatch[1]);
    if (!chat || !canAccessChat(social,chat,user)) return forbidden(res, 'You do not have access to this chat.');
    const message = social.chatMessages.find(item => item.id === chatEditMatch[2] && item.chatId === chat.id);
    if (!message) return notFound(res);
    if (message.author !== user) return forbidden(res, 'You can only edit messages you sent.');
    if (message.deletedAt) return json(res, 409, { error:'Deleted messages cannot be edited.' });
    const createdMs = Date.parse(message.createdAt || '') || 0;
    if (!createdMs || Date.now() > createdMs + (15 * 60 * 1000)) {
      return json(res, 409, { error:'Messages can only be edited within 15 minutes of sending.' });
    }
    const body = await readBody(req, 64 * 1024);
    const nextText = String(body.text || '').trim().slice(0,2000);
    const hasMedia = Boolean(
      message.audio ||
      message.image ||
      (Array.isArray(message.images) && message.images.length)
    );
    if (!nextText && !hasMedia) return json(res, 400, { error:'A message cannot be empty.' });
    const previousText = String(message.text || '');
    message.text = nextText;
    message.editedAt = new Date().toISOString();

    if (chat.type === 'group' && nextText) {
      const book = social.scrapbooks.find(item => item.id === chat.scrapbookId && item.type === 'group');
      const allowedTargets = new Set(book?.members || []);
      await appendMentionNotifications(social, {
        from:user,
        text:nextText,
        previousText,
        kind:'chat',
        scrapbookId:book?.id || null,
        chatId:chat.id,
        messageId:message.id,
        allowedTargets
      });
    }
    await writeSocial(social);
    for (const target of chatMembers(social,chat)) {
      emitLiveEvent(target, 'chat', { type:'message_edited', chatId:chat.id, from:user, messageId:message.id });
    }
    return json(res, 200, { message:decorateChatMessage(social,message,user) });
  }

  const chatPinMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/messages\/([a-f0-9-]+)\/pin$/i);
  if (chatPinMatch && req.method === 'POST') {
    const chat = social.chats.find(item => item.id === chatPinMatch[1]);
    if (!chat || !canAccessChat(social,chat,user)) return forbidden(res, 'You do not have access to this chat.');
    const message = social.chatMessages.find(item => item.id === chatPinMatch[2] && item.chatId === chat.id);
    if (!message) return notFound(res);
    if (message.deletedAt) return json(res, 409, { error:'Deleted messages cannot be pinned.' });
    const body = await readBody(req, 32 * 1024);
    const shouldPin = body.pinned !== false;
    message.pinnedAt = shouldPin ? new Date().toISOString() : null;
    message.pinnedBy = shouldPin ? user : null;
    await writeSocial(social);
    for (const target of chatMembers(social,chat)) {
      emitLiveEvent(target, 'chat', { type:shouldPin?'message_pinned':'message_unpinned', chatId:chat.id, from:user, messageId:message.id });
    }
    return json(res, 200, { message:decorateChatMessage(social,message,user) });
  }

  const chatDeleteMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/messages\/([a-f0-9-]+)$/i);
  if (chatDeleteMatch && req.method === 'DELETE') {
    const chat = social.chats.find(item => item.id === chatDeleteMatch[1]);
    if (!chat || !canAccessChat(social,chat,user)) return forbidden(res, 'You do not have access to this chat.');
    const message = social.chatMessages.find(item => item.id === chatDeleteMatch[2] && item.chatId === chat.id);
    if (!message) return notFound(res);
    if (message.author !== user) return forbidden(res, 'You can only delete messages you sent.');
    if (message.deletedAt) return json(res, 200, { message:decorateChatMessage(social,message,user) });

    const removedAssets = [...new Set([
      ...(Array.isArray(message.images) ? message.images : []),
      message.image || '',
      message.audio || ''
    ].filter(src => typeof src === 'string' && src.startsWith('/uploads/')))];
    message.text = '';
    message.images = [];
    message.image = '';
    message.audio = '';
    message.reactions = {};
    message.deletedAt = new Date().toISOString();
    message.deletedBy = user;

    social.mentions = social.mentions.filter(item =>
      !(item.kind === 'chat' && item.chatId === chat.id && item.messageId === message.id)
    );

    // A forwarded message may reference the same stored attachment. Only
    // remove the physical upload after the last scrapbook/chat reference is gone.
    const allEntries = await readEntries();
    const stillReferenced = src =>
      social.chatMessages.some(other =>
        other.id !== message.id &&
        (
          other?.image === src ||
          (Array.isArray(other?.images) && other.images.includes(src)) ||
          other?.audio === src
        )
      ) ||
      allEntries.some(entry =>
        (Array.isArray(entry.photos) && entry.photos.some(photo => photo?.src === src)) ||
        (Array.isArray(entry.canvasItems) && entry.canvasItems.some(item => item?.type === 'photo' && item?.src === src))
      ) ||
      Object.values(social.profiles || {}).some(profile => profile?.avatar === src);
    const orphanedAssets = removedAssets.filter(src => !stillReferenced(src));

    for (const src of orphanedAssets) {
      if (social.uploadOwners?.[src] === user) delete social.uploadOwners[src];
    }
    await writeSocial(social);
    for (const src of orphanedAssets) {
      try { await fsp.unlink(path.join(UPLOADS, path.basename(src))); }
      catch (err) { if (err?.code !== 'ENOENT') console.warn('Could not remove deleted chat attachment:', src, err?.message || err); }
    }
    for (const target of chatMembers(social,chat)) {
      emitLiveEvent(target, 'chat', { type:'message_deleted', chatId:chat.id, from:user, messageId:message.id });
    }
    return json(res, 200, { message:decorateChatMessage(social,message,user) });
  }

  const chatReactionMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/messages\/([a-f0-9-]+)\/reactions$/i);
  if (chatReactionMatch && req.method === 'POST') {
    const chat = social.chats.find(item => item.id === chatReactionMatch[1]);
    if (!chat || !canAccessChat(social,chat,user)) return forbidden(res, 'You do not have access to this chat.');
    const message = social.chatMessages.find(item => item.id === chatReactionMatch[2] && item.chatId === chat.id);
    if (!message) return notFound(res);
    if (message.deletedAt) return json(res, 409, { error:'Deleted messages cannot be reacted to.' });
    const body = await readBody(req, 64 * 1024);
    const emoji = ['❤️','👍','😂','😮','😢','😡'].includes(String(body.emoji || '')) ? String(body.emoji) : '';
    if (!emoji) return json(res, 400, { error:'Choose a supported reaction.' });
    message.reactions = message.reactions && typeof message.reactions === 'object' ? message.reactions : {};
    const alreadyHadChosen = Array.isArray(message.reactions[emoji]) && message.reactions[emoji].includes(user);
    for (const key of Object.keys(message.reactions)) {
      const next = [...new Set((Array.isArray(message.reactions[key]) ? message.reactions[key] : []).filter(tag => tag && tag !== user))];
      if (next.length) message.reactions[key] = next;
      else delete message.reactions[key];
    }
    if (!alreadyHadChosen) {
      const current = new Set(Array.isArray(message.reactions[emoji]) ? message.reactions[emoji] : []);
      current.add(user);
      message.reactions[emoji] = [...current];
    }
    await writeSocial(social);
    for (const target of chatMembers(social,chat)) {
      emitLiveEvent(target, 'chat', { type:'reaction', chatId:chat.id, from:user, messageId:message.id });
    }
    return json(res, 200, { message:decorateChatMessage(social,message,user) });
  }

  if (pathname === '/api/entries' && req.method === 'GET') {
    const scrapbookId = String(url.searchParams.get('scrapbookId') || '');
    const rawBook = social.scrapbooks.find(book => book.id === scrapbookId);
    const overrideAccess = url.searchParams.get('override') === '1' &&
      isPlatformOwner(social, user) &&
      rawBook?.type === 'personal' &&
      rawBook.owner !== user &&
      !canViewBook(social, rawBook, user);
    const book = bookForViewer(social, scrapbookId, user) || (overrideAccess ? rawBook : null);
    if (!book) return forbidden(res);
    const entries = (await readEntries()).filter(e => e.scrapbookId === scrapbookId);
    entries.sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const baseTags = book.type === 'personal' ? [book.owner] : book.members;
    const entryAuthors = entries.map(entry => entry.author);
    const commentTags = entries.flatMap(entry => Array.isArray(entry.comments) ? entry.comments.map(comment => comment.author) : []);
    const reactionTags = entries.flatMap(entry => Array.isArray(entry.comments)
      ? entry.comments.flatMap(comment => Object.values(comment?.reactions || {}).flatMap(tags => Array.isArray(tags) ? tags : []))
      : []);
    const profileTags = [...new Set([...baseTags, ...entryAuthors, ...commentTags, ...reactionTags].filter(Boolean))];
    const profiles = Object.fromEntries(profileTags.map(tag => [tag, publicProfileFor(social, tag)]));
    return json(res, 200, {
      entries,
      profiles,
      scrapbook: {
        ...decorateBook(social, book, user, { overrideAccess }),
        canComment:canCommentBook(social, book, user)
      }
    });
  }

  if (pathname === '/api/entries' && req.method === 'POST') {
    const body = await readBody(req);
    const book = social.scrapbooks.find(b => b.id === String(body.scrapbookId || ''));
    if (!book || !canWriteBook(book, user)) return forbidden(res, 'This scrapbook is read-only for you.');
    const entries = await readEntries();
    const entry = cleanEntry(body, user);
    entries.push(entry); await writeEntries(entries);
    emitLiveMany(realtimeBookViewers(social, book), 'entries', { type:'entry_added', scrapbookId:book.id, entryId:entry.id, from:user });
    return json(res, 201, { entry });
  }

  const commentMatch = pathname.match(/^\/api\/entries\/([a-f0-9-]+)\/comments$/i);
  if (commentMatch && req.method === 'POST') {
    const entries = await readEntries();
    const entry = entries.find(e => e.id === commentMatch[1]);
    if (!entry) return notFound(res);
    const book = bookForViewer(social, entry.scrapbookId, user);
    if (!book || !canCommentBook(social, book, user)) return forbidden(res, 'Comments are available on Personal, Lovers, and Group scrapbooks you can access.');
    const body = await readBody(req, 64 * 1024);
    const text = String(body.text || '').trim().slice(0, 600);
    if (!text) return json(res, 400, { error:'Write something before posting your comment.' });
    entry.comments = Array.isArray(entry.comments) ? entry.comments : [];
    const requestedParentId = String(body.parentId || '');
    const requestedParent = requestedParentId ? entry.comments.find(item => item.id === requestedParentId) : null;
    if (requestedParentId && !requestedParent) return json(res, 400, { error:'That comment is no longer available.' });
    const parentId = requestedParent ? (requestedParent.parentId || requestedParent.id) : null;
    const comment = {
      id: crypto.randomUUID(),
      author: user,
      text,
      parentId,
      reactions:{},
      createdAt: new Date().toISOString()
    };
    entry.comments.push(comment);
    if (entry.comments.length > 300) entry.comments = entry.comments.slice(-300);
    const allowedMentionTargets = new Set(mentionTags(text).filter(target => canViewBook(social, book, target)));
    await appendMentionNotifications(social, {
      from:user,
      text,
      kind:'comment',
      scrapbookId:book.id,
      entryId:entry.id,
      allowedTargets:allowedMentionTargets
    });

    const genericRecipients = (book.type === 'group' || book.type === 'couple')
      ? (book.members || []).filter(tag => tag !== user && !allowedMentionTargets.has(tag))
      : [book.owner].filter(tag => tag && tag !== user && !allowedMentionTargets.has(tag));
    const actor = publicProfileFor(social, user);
    for (const target of genericRecipients) {
      appendActivityNotification(social, {
        to:target,
        from:user,
        type:'comment',
        scrapbookId:book.id,
        entryId:entry.id,
        scrapbookName:book.name,
        excerpt:text
      });
      await sendUserPush(social, {
        to:target,
        title:`${actor.displayName || displayTag(user)} commented in ${book.name}`,
        body:text,
        tag:`comment-${entry.id}-${comment.id}-${target}`
      });
      emitLiveEvent(target, 'notification', { type:'comment', from:user, scrapbookId:book.id, entryId:entry.id });
    }

    await writeEntries(entries);
    await writeSocial(social);
    emitLiveMany(realtimeBookViewers(social, book), 'entries', { type:'comment_added', scrapbookId:book.id, entryId:entry.id, from:user });
    return json(res, 201, { comment, profile:publicProfileFor(social, user) });
  }

  const commentReactionMatch = pathname.match(/^\/api\/entries\/([a-f0-9-]+)\/comments\/([a-f0-9-]+)\/reactions$/i);
  if (commentReactionMatch && req.method === 'POST') {
    const entries = await readEntries();
    const entry = entries.find(item => item.id === commentReactionMatch[1]);
    if (!entry) return notFound(res);
    const book = bookForViewer(social, entry.scrapbookId, user);
    if (!book || !canCommentBook(social, book, user)) return forbidden(res);
    const comment = (Array.isArray(entry.comments) ? entry.comments : []).find(item => item.id === commentReactionMatch[2]);
    if (!comment) return notFound(res);
    const body = await readBody(req, 64 * 1024);
    const emoji = ['👍','❤️','😂','😮','😢','😡'].includes(String(body.emoji || '')) ? String(body.emoji) : '';
    if (!emoji) return json(res, 400, { error:'Choose a supported reaction.' });
    comment.reactions = comment.reactions && typeof comment.reactions === 'object' ? comment.reactions : {};
    const alreadyHadChosen = Array.isArray(comment.reactions[emoji]) && comment.reactions[emoji].includes(user);
    for (const key of Object.keys(comment.reactions)) {
      const next = [...new Set((Array.isArray(comment.reactions[key]) ? comment.reactions[key] : []).filter(tag => tag && tag !== user))];
      if (next.length) comment.reactions[key] = next;
      else delete comment.reactions[key];
    }
    if (!alreadyHadChosen) {
      const current = new Set(Array.isArray(comment.reactions[emoji]) ? comment.reactions[emoji] : []);
      current.add(user);
      comment.reactions[emoji] = [...current];
    }
    await writeEntries(entries);
    emitLiveMany(realtimeBookViewers(social, book), 'entries', { type:'comment_reaction', scrapbookId:book.id, entryId:entry.id, commentId:comment.id, from:user });
    return json(res, 200, { ok:true });
  }

  const deleteCommentMatch = pathname.match(/^\/api\/entries\/([a-f0-9-]+)\/comments\/([a-f0-9-]+)$/i);
  if (deleteCommentMatch && req.method === 'DELETE') {
    const entries = await readEntries();
    const entry = entries.find(e => e.id === deleteCommentMatch[1]);
    if (!entry) return notFound(res);
    const book = bookForViewer(social, entry.scrapbookId, user);
    if (!book || !canCommentBook(social, book, user)) return forbidden(res);
    const comments = Array.isArray(entry.comments) ? entry.comments : [];
    const comment = comments.find(item => item.id === deleteCommentMatch[2]);
    if (!comment) return notFound(res);
    if (comment.author !== user && book.owner !== user) return forbidden(res, 'Only the comment writer or scrapbook owner can remove this comment.');
    const deleteIds = new Set([comment.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of comments) {
        if (item.parentId && deleteIds.has(item.parentId) && !deleteIds.has(item.id)) {
          deleteIds.add(item.id);
          grew = true;
        }
      }
    }
    entry.comments = comments.filter(item => !deleteIds.has(item.id));
    await writeEntries(entries);
    emitLiveMany(realtimeBookViewers(social, book), 'entries', { type:'comment_deleted', scrapbookId:book.id, entryId:entry.id, from:user });
    return json(res, 200, { ok:true });
  }

  const entryMatch = pathname.match(/^\/api\/entries\/([a-f0-9-]+)$/i);
  if (entryMatch && ['PUT','DELETE'].includes(req.method)) {
    const entries = await readEntries();
    const idx = entries.findIndex(e => e.id === entryMatch[1]);
    if (idx < 0) return notFound(res);
    const entry = entries[idx];
    const entryBook = social.scrapbooks.find(b => b.id === entry.scrapbookId);
    if (!entryBook || !canWriteBook(entryBook, user)) return forbidden(res, 'This scrapbook is read-only for you.');
    if (entry.author !== user) return forbidden(res, 'Only the person who wrote this memory can change it.');
    if (req.method === 'DELETE') {
      entries.splice(idx,1);
      await writeEntries(entries);
      emitLiveMany(realtimeBookViewers(social, entryBook), 'entries', { type:'entry_deleted', scrapbookId:entryBook.id, entryId:entry.id, from:user });
      return json(res, 200, { ok:true });
    }
    const body = await readBody(req);
    entries[idx] = cleanEntry(body, user, entry);
    await writeEntries(entries);
    emitLiveMany(realtimeBookViewers(social, entryBook), 'entries', { type:'entry_updated', scrapbookId:entryBook.id, entryId:entry.id, from:user });
    return json(res, 200, { entry: entries[idx] });
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    const body = await readBody(req, 14 * 1024 * 1024);
    const dataUrl = String(body.dataUrl || '');
    const imageMatch = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    const audioMatch = dataUrl.match(/^data:audio\/(webm|ogg|mpeg|mp3|mp4|m4a|wav|x-m4a);(?:codecs=[^;,]+;)?base64,([A-Za-z0-9+/=]+)$/i);
    const match = imageMatch || audioMatch;
    if (!match) return json(res, 400, { error: 'Please choose a supported image or audio recording.' });
    let ext = match[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'mpeg') ext = 'mp3';
    if (ext === 'x-m4a') ext = 'm4a';
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 8 * 1024 * 1024) return json(res, 413, { error: 'Each attachment must be 8 MB or smaller.' });
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    await fsp.writeFile(path.join(UPLOADS, filename), bytes);
    const src = `/uploads/${filename}`;
    await recordUploadOwner(src, user);
    return json(res, 201, { src });
  }

  notFound(res);
}

function localClock(timezone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const get = type => parts.find(p => p.type === type)?.value || '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: Number(get('hour')) * 60 + Number(get('minute'))
    };
  } catch {
    return null;
  }
}
function reminderMinutes(value) {
  const match = String(value || '20:00').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 20 * 60;
}
async function sendDailyReminders() {
  if (!PUSH_READY) return;
  const social = await readSocial();
  const entries = await readEntries();
  let changed = false;
  for (const [tag, settings] of Object.entries(social.notificationSettings || {})) {
    if (!settings?.enabled) continue;
    const subscriptions = social.pushSubscriptions.filter(s => s.tag === tag);
    if (!subscriptions.length) continue;
    const clock = localClock(settings.timezone || 'UTC');
    if (!clock || clock.minutes < reminderMinutes(settings.reminderTime) || settings.lastSentDate === clock.date) continue;
    if (entries.some(entry => entry.author === tag && entry.date === clock.date)) continue;

    let sent = false;
    const payload = JSON.stringify({
      title: 'Your scrapbook is waiting ♡',
      body: 'No journey yet today. Add a little memory before the day ends.',
      url: '/?newMemory=1',
      tag: 'daily-journey-reminder'
    });
    for (const item of [...subscriptions]) {
      try {
        await webpush.sendNotification(item.subscription, payload, { TTL: 60 * 60 * 6 });
        sent = true;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          social.pushSubscriptions = social.pushSubscriptions.filter(s => s.endpoint !== item.endpoint);
          changed = true;
        } else {
          console.warn('Push reminder failed:', err?.statusCode || err?.message || err);
        }
      }
    }
    if (sent) {
      social.notificationSettings[tag] = { ...settings, lastSentDate: clock.date };
      changed = true;
    }
  }
  if (changed) await writeSocial(social);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");

    if (pathname.startsWith('/api/')) { url.pathname = pathname; return await handleApi(req, res, url); }
    if (pathname.startsWith('/uploads/')) {
      const viewer = await getUser(req);
      if (!viewer) return json(res, 401, { error: 'Locked' });
      const assetPath = `/uploads/${path.basename(pathname)}`;
      const social = await readSocial();
      const entries = await readEntries();
      const entry = entries.find(e =>
        (Array.isArray(e.photos) && e.photos.some(photo => photo?.src === assetPath)) ||
        (Array.isArray(e.canvasItems) && e.canvasItems.some(item => item?.type === 'photo' && item?.src === assetPath))
      );
      if (entry) {
        const book = social.scrapbooks.find(b => b.id === entry.scrapbookId);
        if (!book || !canViewBook(social, book, viewer)) return forbidden(res, 'You do not have access to this scrapbook photo.');
      } else {
        const chatMessage = social.chatMessages?.find(message =>
          message?.image === assetPath ||
          (Array.isArray(message?.images) && message.images.includes(assetPath))
        );
        if (chatMessage) {
          const chat = social.chats?.find(item => item.id === chatMessage.chatId);
          if (!chat || !canAccessChat(social, chat, viewer)) return forbidden(res, 'You do not have access to this chat photo.');
        } else {
          const isProfileAvatar = Object.values(social.profiles || {}).some(profile => profile?.avatar === assetPath);
          const isOwnedPendingUpload = social.uploadOwners?.[assetPath] === viewer;
          if (!isProfileAvatar && !isOwnedPendingUpload) return forbidden(res, 'You do not have access to this photo.');
        }
      }
      return serveFile(res, path.join(UPLOADS, path.basename(pathname)));
    }
    if (pathname === '/' || pathname === '/index.html') return serveFile(res, path.join(PUBLIC, 'index.html'));
    if (pathname.startsWith('/assets/')) {
      const assetName = path.basename(pathname);
      if (!assetName || assetName !== pathname.slice('/assets/'.length)) return notFound(res);
      return serveFile(res, path.join(PUBLIC, 'assets', assetName));
    }
    if (pathname === '/vendor/html2canvas.min.js') {
      return serveFile(res, path.join(ROOT, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'));
    }
    const safeName = path.basename(pathname);
    if (['styles.css','app.js','sw.js'].includes(safeName)) return serveFile(res, path.join(PUBLIC, safeName));
    return notFound(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
    else res.end();
  }
});

ensureStorage().then(async () => {
  await backupJsonDataOnce();
  if (PROD && !process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is not set.');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Private journal running at http://localhost:${PORT}`);
    if (PUSH_READY) {
      setTimeout(() => sendDailyReminders().catch(err => console.error('Initial reminder check failed:', err)), 30 * 1000);
      setInterval(() => sendDailyReminders().catch(err => console.error('Reminder check failed:', err)), 10 * 60 * 1000);
    }
  });
}).catch(err => { console.error(err); process.exit(1); });
