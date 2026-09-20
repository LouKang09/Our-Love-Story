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
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
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
  return data;
}
async function writeSocial(social) { await writeJson(SOCIAL_FILE, social); }

async function ensureStorage() {
  await fsp.mkdir(UPLOADS, { recursive: true });
  await ensureFile(DATA_FILE, []);
  await ensureFile(ACCOUNTS_FILE, []);
  await ensureFile(SOCIAL_FILE, { profiles: {}, scrapbooks: [], invites: [], follows: [], pushSubscriptions: [], notificationSettings: {}, notificationHub: {}, mentions: [], activityNotifications: [], chats: [], chatMessages: [], chatRead: {} });

  const social = await readSocial();
  const bootstrapTags = [...BOOTSTRAP_USERS.keys()];
  let changed = false;
  for (const tag of bootstrapTags) {
    if (!social.profiles[tag]) {
      social.profiles[tag] = { tag, displayName: tag === 'girlfriend' ? 'Girlfriend' : tag === 'you' ? 'You' : tag, avatar: '', bio: '', createdAt: new Date().toISOString() };
      changed = true;
    }
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
}

async function scryptHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = await new Promise((resolve, reject) => crypto.scrypt(String(password), salt, 64, (err, derived) => err ? reject(err) : resolve(derived)));
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyCredential(stored, supplied) {
  if (!stored) return false;
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
  if (BOOTSTRAP_USERS.has(tag)) return BOOTSTRAP_USERS.get(tag);
  const accounts = await readAccounts();
  return accounts.find(a => a.tag === tag) || null;
}
async function accountExists(tag) {
  return Boolean(await getCredential(tag));
}
async function allKnownTags() {
  const accounts = await readAccounts();
  return [...new Set([...BOOTSTRAP_USERS.keys(), ...accounts.map(a => a.tag)])];
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
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml', '.ico':'image/x-icon'
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
    if (face.includes('georgia') || face.includes('times')) classes.push('fmt-font-serif');
    else if (face.includes('arial') || face.includes('helvetica') || face.includes('sans')) classes.push('fmt-font-sans');
    else if (face.includes('segoe print') || face.includes('comic sans') || face.includes('bradley')) classes.push('fmt-font-hand');
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
      .filter(cls => /^fmt-font-(serif|sans|hand|mono)$/.test(cls) || /^fmt-size-[1-7]$/.test(cls));
    return allowed.length ? `<span class="${[...new Set(allowed)].join(' ')}">` : '<span>';
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
      caption: String(item.caption || '').slice(0,240)
    };
  }

  const font = ['serif','sans','hand','mono'].includes(item.font) ? item.font : 'serif';
  return {
    ...common,
    html: sanitizeRichText(item.html || ''),
    font,
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
function profileFor(social, tag) {
  const p = social.profiles[tag] || { tag, displayName: tag, avatar: '', bio: '' };
  const notify = social.notificationSettings?.[tag] || {};
  return {
    tag,
    tagLabel: displayTag(tag),
    displayName: p.displayName || tag,
    avatar: p.avatar || '',
    bio: p.bio || '',
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
    bio: p.bio || ''
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
async function sendMentionPush(social, { to, from, kind, excerpt = '' }) {
  const actor = publicProfileFor(social, from);
  const name = actor.displayName || displayTag(from);
  const profileMention = kind === 'profile';
  await sendUserPush(social, {
    to,
    title:profileMention ? `${name} mentioned you in their profile` : `${name} mentioned you in a scrapbook comment`,
    body:excerpt || (profileMention ? 'Open the scrapbook to see the mention.' : 'Open the memory to see the comment.'),
    tag:`mention-${kind}-${from}-${to}`
  });
}
async function appendMentionNotifications(social, { from, text, kind, scrapbookId = null, entryId = null, previousText = '', allowedTargets = null }) {
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
      excerpt,
      createdAt: new Date().toISOString()
    });
    await sendMentionPush(social, { to:target, from, kind, excerpt });
    emitLiveEvent(target, 'notification', { type:kind === 'profile' ? 'profile_mention' : 'comment_mention', from, scrapbookId, entryId });
  }
  if (social.mentions.length > 2000) social.mentions = social.mentions.slice(-2000);
}
function appendActivityNotification(social, { to, from, type, scrapbookId = null, entryId = null, scrapbookName = '', excerpt = '' }) {
  if (!to || to === from) return null;
  const item = {
    id:crypto.randomUUID(),
    to,
    from,
    type,
    scrapbookId,
    entryId,
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
  if (book.type === 'group') return Array.isArray(book.members) && book.members.includes(viewer);
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
      type: item.kind === 'profile' ? 'profile_mention' : 'comment_mention',
      createdAt: item.createdAt || '',
      unread: (Date.parse(item.createdAt || '') || 0) > seenMs,
      actor: publicProfileFor(social, item.from),
      scrapbookId: item.scrapbookId || null,
      entryId: item.entryId || null,
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
function chatUnreadCount(social, chat, user) {
  if (!canAccessChat(social, chat, user)) return 0;
  const seenMs = Date.parse(social.chatRead?.[user]?.[chat.id] || '') || 0;
  return social.chatMessages.filter(message =>
    message.chatId === chat.id &&
    message.author !== user &&
    (Date.parse(message.createdAt || '') || 0) > seenMs
  ).length;
}
function decorateChat(social, chat, user) {
  const members = chatMembers(social, chat);
  const lastMessage = [...social.chatMessages].reverse().find(message => message.chatId === chat.id) || null;
  if (chat.type === 'group') {
    const book = social.scrapbooks.find(item => item.id === chat.scrapbookId);
    return {
      id:chat.id,
      type:'group',
      scrapbookId:chat.scrapbookId,
      name:book?.name || 'Group chat',
      members:members.map(tag => publicProfileFor(social, tag)),
      unreadCount:chatUnreadCount(social, chat, user),
      lastMessage:lastMessage ? {
        id:lastMessage.id,
        author:lastMessage.author,
        text:lastMessage.text || '',
        image:lastMessage.image || '',
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
    unreadCount:chatUnreadCount(social, chat, user),
    lastMessage:lastMessage ? {
      id:lastMessage.id,
      author:lastMessage.author,
      text:lastMessage.text || '',
      image:lastMessage.image || '',
      createdAt:lastMessage.createdAt
    } : null
  };
}
function totalChatUnread(social, user) {
  return social.chats
    .filter(chat => canAccessChat(social, chat, user))
    .reduce((sum, chat) => sum + chatUnreadCount(social, chat, user), 0);
}
function decorateBook(social, book, viewer) {
  const viewingAsFollower = book.type === 'personal' && book.owner !== viewer && isFollowing(social, viewer, book.owner);
  const viewingAsPartner = book.type === 'personal' && book.owner !== viewer && isActivePartner(social, viewer, book.owner);
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
    canWrite: canWriteBook(book, viewer),
    accessReason: book.owner === viewer ? 'owner' : (viewingAsPartner ? 'partner' : (viewingAsFollower ? 'follower' : 'member')),
    bindingStatus: book.bindingStatus || 'bound',
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
      return json(res, 201, { tag }, { 'Set-Cookie': sessionCookie(makeSession(tag)) });
    } finally {
      PENDING_SIGNUP_TAGS.delete(tag);
    }
  }

  if (pathname === '/api/logout' && req.method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });

  const user = await requireAuth(req, res);
  if (!user) return;
  if (pathname === '/api/events' && req.method === 'GET') {
    registerLiveClient(req, res, user);
    return;
  }
  const social = await readSocial();

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

    const books = social.scrapbooks
      .filter(b => canViewBook(social, b, user))
      .sort((a,b) => {
        const ao = a.owner === user ? 0 : 1;
        const bo = b.owner === user ? 0 : 1;
        return ao - bo || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      })
      .map(b => decorateBook(social, b, user));
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
    const current = social.profiles[user] || { tag: user, createdAt: new Date().toISOString() };
    const previousBio = String(current.bio || '');
    const nextBio = String(body.bio || '').trim().slice(0, 220);
    current.displayName = String(body.displayName || current.displayName || user).trim().slice(0, 60);
    current.bio = nextBio;
    if (String(body.avatar || '').startsWith('/uploads/')) current.avatar = String(body.avatar);
    social.profiles[user] = current;
    await appendMentionNotifications(social, {
      from:user,
      text:nextBio,
      previousText:previousBio,
      kind:'profile'
    });
    await writeSocial(social);
    return json(res, 200, { profile: profileFor(social, user) });
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

  const personProfileMatch = pathname.match(/^\/api\/people\/([^/]+)\/profile$/);
  if (personProfileMatch && req.method === 'GET') {
    const target = slugTag(personProfileMatch[1]);
    if (!target || !(await accountExists(target))) return json(res, 404, { error: 'That profile no longer exists.' });

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
      .filter(book => canViewBook(social, book, user))
      .map(book => ({
        ...decorateBook(social, book, user),
        profiles:[publicProfileFor(social, target)],
        accessible:true,
        locked:false
      }));

    const hasLockedPersonalScrapbooks = personalBooks.some(book => !canViewBook(social, book, user));
    const personalScrapbook = personalScrapbooks[0] || (hasLockedPersonalScrapbooks
      ? { type:'personal', owner:target, accessible:false, locked:true }
      : null);

    return json(res, 200, {
      profile: publicProfileFor(social, target),
      isSelf: target === user,
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

  const inviteMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/invite$/i);
  if (inviteMatch && req.method === 'POST') {
    const book = bookForUser(social, inviteMatch[1], user);
    if (!book) return forbidden(res);
    if (book.type === 'personal') return json(res, 409, { error: 'Personal scrapbooks use privacy and followers instead of invitations.' });
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
      .filter(chat => canAccessChat(social, chat, user))
      .map(chat => decorateChat(social, chat, user))
      .sort((a,b) => String(b.lastMessage?.createdAt || '').localeCompare(String(a.lastMessage?.createdAt || '')) || String(a.name || '').localeCompare(String(b.name || '')));
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

  const chatMessagesMatch = pathname.match(/^\/api\/chats\/([a-f0-9-]+)\/messages$/i);
  if (chatMessagesMatch && req.method === 'GET') {
    const chat = social.chats.find(item => item.id === chatMessagesMatch[1]);
    if (!chat || !canAccessChat(social, chat, user)) return forbidden(res, 'You do not have access to this chat.');
    const messages = social.chatMessages
      .filter(message => message.chatId === chat.id)
      .slice(-500)
      .map(message => ({
        id:message.id,
        author:message.author,
        profile:publicProfileFor(social, message.author),
        text:message.text || '',
        image:message.image || '',
        createdAt:message.createdAt
      }));
    social.chatRead[user] ||= {};
    social.chatRead[user][chat.id] = new Date().toISOString();
    await writeSocial(social);
    return json(res, 200, { chat:decorateChat(social, chat, user), messages, unreadCount:totalChatUnread(social, user) });
  }

  if (chatMessagesMatch && req.method === 'POST') {
    const chat = social.chats.find(item => item.id === chatMessagesMatch[1]);
    if (!chat || !canAccessChat(social, chat, user)) return forbidden(res, 'You do not have access to this chat.');
    const body = await readBody(req, 128 * 1024);
    const text = String(body.text || '').trim().slice(0, 2000);
    const image = String(body.image || '');
    if (!text && !image) return json(res, 400, { error:'Write a message or attach a photo.' });
    if (image) {
      if (!image.startsWith('/uploads/')) return json(res, 400, { error:'Chat attachments must be uploaded images.' });
      if (social.uploadOwners?.[image] !== user) return forbidden(res, 'You can only send photos you uploaded.');
    }
    const message = {
      id:crypto.randomUUID(),
      chatId:chat.id,
      author:user,
      text,
      image,
      createdAt:new Date().toISOString()
    };
    social.chatMessages.push(message);
    social.chatRead[user] ||= {};
    social.chatRead[user][chat.id] = message.createdAt;
    const recipients = chatMembers(social, chat).filter(tag => tag !== user);
    const actor = publicProfileFor(social, user);
    for (const target of recipients) {
      await sendUserPush(social, {
        to:target,
        title:chat.type === 'group'
          ? `${actor.displayName || displayTag(user)} · ${decorateChat(social,chat,target).name}`
          : `${actor.displayName || displayTag(user)} sent you a message`,
        body:text || 'Sent a photo',
        tag:`chat-${chat.id}`,
        url:`/?messages=${encodeURIComponent(chat.id)}`
      });
      emitLiveEvent(target, 'chat', { type:'message', chatId:chat.id, from:user, messageId:message.id });
    }
    emitLiveEvent(user, 'chat', { type:'message_sent', chatId:chat.id, from:user, messageId:message.id });
    await writeSocial(social);
    return json(res, 201, {
      message:{
        id:message.id,
        author:message.author,
        profile:publicProfileFor(social,user),
        text:message.text,
        image:message.image,
        createdAt:message.createdAt
      },
      unreadCount:totalChatUnread(social,user)
    });
  }

  if (pathname === '/api/entries' && req.method === 'GET') {
    const scrapbookId = String(url.searchParams.get('scrapbookId') || '');
    const book = bookForViewer(social, scrapbookId, user);
    if (!book) return forbidden(res);
    const entries = (await readEntries()).filter(e => e.scrapbookId === scrapbookId);
    entries.sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const baseTags = book.type === 'personal' ? [book.owner] : book.members;
    const commentTags = entries.flatMap(entry => Array.isArray(entry.comments) ? entry.comments.map(comment => comment.author) : []);
    const profileTags = [...new Set([...baseTags, ...commentTags].filter(Boolean))];
    const profiles = Object.fromEntries(profileTags.map(tag => [tag, publicProfileFor(social, tag)]));
    return json(res, 200, {
      entries,
      profiles,
      scrapbook: { ...decorateBook(social, book, user), canComment:canCommentBook(social, book, user) }
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
    if (!book || !canCommentBook(social, book, user)) return forbidden(res, 'Comments are available on Personal and Group scrapbooks you can access.');
    const body = await readBody(req, 64 * 1024);
    const text = String(body.text || '').trim().slice(0, 600);
    if (!text) return json(res, 400, { error:'Write something before posting your comment.' });
    entry.comments = Array.isArray(entry.comments) ? entry.comments : [];
    const comment = {
      id: crypto.randomUUID(),
      author: user,
      text,
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

    const genericRecipients = book.type === 'group'
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
    entry.comments = comments.filter(item => item.id !== comment.id);
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
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return json(res, 400, { error: 'Please choose a PNG, JPG, WEBP, or GIF image.' });
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 8 * 1024 * 1024) return json(res, 413, { error: 'Each photo must be 8 MB or smaller.' });
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    await fsp.writeFile(path.join(UPLOADS, filename), bytes);
    const src = `/uploads/${filename}`;
    social.uploadOwners[src] = user;
    await writeSocial(social);
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
        const chatMessage = social.chatMessages?.find(message => message?.image === assetPath);
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
