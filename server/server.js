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
  const data = await readJson(SOCIAL_FILE, { profiles: {}, scrapbooks: [], invites: [], pushSubscriptions: [], notificationSettings: {} });
  data.profiles ||= {};
  data.scrapbooks = Array.isArray(data.scrapbooks) ? data.scrapbooks : [];
  data.invites = Array.isArray(data.invites) ? data.invites : [];
  data.pushSubscriptions = Array.isArray(data.pushSubscriptions) ? data.pushSubscriptions : [];
  data.notificationSettings = data.notificationSettings && typeof data.notificationSettings === 'object' ? data.notificationSettings : {};
  return data;
}
async function writeSocial(social) { await writeJson(SOCIAL_FILE, social); }

async function ensureStorage() {
  await fsp.mkdir(UPLOADS, { recursive: true });
  await ensureFile(DATA_FILE, []);
  await ensureFile(ACCOUNTS_FILE, []);
  await ensureFile(SOCIAL_FILE, { profiles: {}, scrapbooks: [], invites: [], pushSubscriptions: [], notificationSettings: {} });

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
  return `journal_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Strict${PROD ? '; Secure' : ''}`;
}
function clearCookie() {
  return `journal_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${PROD ? '; Secure' : ''}`;
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
function cleanEntry(input, author, existing = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : new Date().toISOString().slice(0, 10);
  return {
    id: existing.id || crypto.randomUUID(),
    scrapbookId: existing.scrapbookId || String(input.scrapbookId || ''),
    date,
    title: String(input.title || 'Untitled memory').trim().slice(0, 120),
    text: String(input.text || '').slice(0, 20000),
    photos: Array.isArray(input.photos) ? input.photos.map(cleanPhoto).filter(Boolean).slice(0, 12) : [],
    author: existing.author || author,
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
    notifications: {
      enabled: notify.enabled === true,
      reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(notify.reminderTime || '')) ? notify.reminderTime : '20:00',
      timezone: String(notify.timezone || '')
    }
  };
}
function bookForUser(social, id, tag) {
  const book = social.scrapbooks.find(b => b.id === id);
  if (!book || !book.members.includes(tag)) return null;
  return book;
}
function decorateBook(social, book, viewer) {
  return {
    id: book.id,
    type: book.type,
    name: book.name,
    owner: book.owner,
    members: book.members,
    createdAt: book.createdAt,
    isOwner: book.owner === viewer,
    bindingStatus: book.bindingStatus || 'bound',
    unboundAt: book.unboundAt || null,
    unbindRequest: book.unbindRequest ? {
      status: book.unbindRequest.status,
      requestedBy: book.unbindRequest.requestedBy,
      approvals: Array.isArray(book.unbindRequest.approvals) ? book.unbindRequest.approvals : [],
      createdAt: book.unbindRequest.createdAt
    } : null,
    profiles: book.members.map(tag => profileFor(social, tag))
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
    if (await accountExists(tag)) return json(res, 409, { error: 'That @tag is already taken.' });
    const accounts = await readAccounts();
    accounts.push({ tag, passwordHash: await scryptHash(password), createdAt: new Date().toISOString() });
    await writeAccounts(accounts);
    const social = await readSocial();
    social.profiles[tag] = { tag, displayName: displayName || tag, avatar: '', bio: '', createdAt: new Date().toISOString() };
    await writeSocial(social);
    return json(res, 201, { tag }, { 'Set-Cookie': sessionCookie(makeSession(tag)) });
  }

  if (pathname === '/api/logout' && req.method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });

  const user = await requireAuth(req, res);
  if (!user) return;
  const social = await readSocial();

  if (pathname === '/api/me' && req.method === 'GET') {
    const books = social.scrapbooks.filter(b => b.members.includes(user)).map(b => decorateBook(social, b, user));
    const invites = social.invites.filter(i => i.to === user && i.status === 'pending').map(i => ({
      ...i,
      fromProfile: profileFor(social, i.from),
      scrapbook: social.scrapbooks.find(b => b.id === i.scrapbookId) ? decorateBook(social, social.scrapbooks.find(b => b.id === i.scrapbookId), user) : null
    }));
    return json(res, 200, { authenticated: true, profile: profileFor(social, user), scrapbooks: books, invites });
  }

  if (pathname === '/api/profile' && req.method === 'PUT') {
    const body = await readBody(req, 128 * 1024);
    const current = social.profiles[user] || { tag: user, createdAt: new Date().toISOString() };
    current.displayName = String(body.displayName || current.displayName || user).trim().slice(0, 60);
    current.bio = String(body.bio || '').trim().slice(0, 220);
    if (String(body.avatar || '').startsWith('/uploads/')) current.avatar = String(body.avatar);
    social.profiles[user] = current;
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
    if (q.length < 2) return json(res, 200, { people: [] });
    const tags = (await allKnownTags()).filter(t => t !== user && t.includes(q)).slice(0, 8);
    return json(res, 200, { people: tags.map(t => profileFor(social, t)) });
  }

  if (pathname === '/api/scrapbooks' && req.method === 'POST') {
    const body = await readBody(req, 128 * 1024);
    const type = body.type === 'couple' ? 'couple' : 'group';
    if (type === 'couple' && userHasOtherCouple(social, user)) return json(res, 409, { error: 'You are already bound in a lovers scrapbook. Leave that binding before creating another.' });
    const book = { id: crypto.randomUUID(), type, name: String(body.name || (type === 'couple' ? 'Our Love Story' : 'Our Scrapbook')).trim().slice(0, 80), owner: user, members: [user], createdAt: new Date().toISOString() };
    social.scrapbooks.push(book);
    await writeSocial(social);
    return json(res, 201, { scrapbook: decorateBook(social, book, user) });
  }

  const inviteMatch = pathname.match(/^\/api\/scrapbooks\/([a-f0-9-]+)\/invite$/i);
  if (inviteMatch && req.method === 'POST') {
    const book = bookForUser(social, inviteMatch[1], user);
    if (!book) return forbidden(res);
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

  if (pathname === '/api/entries' && req.method === 'GET') {
    const scrapbookId = String(url.searchParams.get('scrapbookId') || '');
    const book = bookForUser(social, scrapbookId, user);
    if (!book) return forbidden(res);
    const entries = (await readEntries()).filter(e => e.scrapbookId === scrapbookId);
    entries.sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    const profiles = Object.fromEntries(book.members.map(tag => [tag, profileFor(social, tag)]));
    return json(res, 200, { entries, profiles });
  }

  if (pathname === '/api/entries' && req.method === 'POST') {
    const body = await readBody(req);
    const book = bookForUser(social, String(body.scrapbookId || ''), user);
    if (!book) return forbidden(res);
    const entries = await readEntries();
    const entry = cleanEntry(body, user);
    entries.push(entry); await writeEntries(entries);
    return json(res, 201, { entry });
  }

  const entryMatch = pathname.match(/^\/api\/entries\/([a-f0-9-]+)$/i);
  if (entryMatch && ['PUT','DELETE'].includes(req.method)) {
    const entries = await readEntries();
    const idx = entries.findIndex(e => e.id === entryMatch[1]);
    if (idx < 0) return notFound(res);
    const entry = entries[idx];
    if (!bookForUser(social, entry.scrapbookId, user)) return forbidden(res);
    if (entry.author !== user) return forbidden(res, 'Only the person who wrote this memory can change it.');
    if (req.method === 'DELETE') {
      entries.splice(idx,1); await writeEntries(entries); return json(res, 200, { ok:true });
    }
    const body = await readBody(req);
    entries[idx] = cleanEntry(body, user, entry); await writeEntries(entries);
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
    return json(res, 201, { src: `/uploads/${filename}` });
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
      if (!(await getUser(req))) return json(res, 401, { error: 'Locked' });
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

ensureStorage().then(() => {
  if (PROD && !process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is not set.');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Private journal running at http://localhost:${PORT}`);
    if (PUSH_READY) {
      setTimeout(() => sendDailyReminders().catch(err => console.error('Initial reminder check failed:', err)), 30 * 1000);
      setInterval(() => sendDailyReminders().catch(err => console.error('Reminder check failed:', err)), 10 * 60 * 1000);
    }
  });
}).catch(err => { console.error(err); process.exit(1); });
