const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'client');
const STORAGE = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(__dirname, 'storage');
const UPLOADS = path.join(STORAGE, 'uploads');
const DATA_FILE = path.join(STORAGE, 'journal.json');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-this-before-deploying';
const JOURNAL_TITLE = process.env.JOURNAL_TITLE || 'Our Little Book of Us';
const JOURNAL_SUBTITLE = process.env.JOURNAL_SUBTITLE || 'Every ordinary day deserves to be remembered.';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function parseUsers() {
  const raw = process.env.JOURNAL_USERS || (PROD ? '' : 'you:love123,girlfriend:journal123');
  const users = new Map();
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf(':');
    if (idx <= 0) continue;
    const username = pair.slice(0, idx).trim();
    const password = pair.slice(idx + 1).trim();
    if (username && password) users.set(username, password);
  }
  return users;
}
const USERS = parseUsers();

async function ensureStorage() {
  await fsp.mkdir(UPLOADS, { recursive: true });
  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}
function safeEqual(a, b) {
  const A = sha256(a);
  const B = sha256(b);
  return crypto.timingSafeEqual(A, B);
}
function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}
function makeSession(username) {
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + SESSION_MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function getCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function getUser(req) {
  const token = getCookies(req).journal_session;
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sign(payload), sig)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.username || !USERS.has(session.username) || Date.now() > session.exp) return null;
    return session.username;
  } catch {
    return null;
  }
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
function notFound(res) {
  json(res, 404, { error: 'Not found' });
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}
async function readBody(req, maxBytes = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
async function readEntries() {
  try {
    const text = await fsp.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function writeEntries(entries) {
  const tmp = `${DATA_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(entries, null, 2), 'utf8');
  await fsp.rename(tmp, DATA_FILE);
}
function cleanPhoto(photo) {
  if (!photo || typeof photo !== 'object') return null;
  const src = String(photo.src || '');
  if (!src.startsWith('/uploads/')) return null;
  return {
    id: String(photo.id || crypto.randomUUID()),
    src,
    side: photo.side === 'right' ? 'right' : 'left',
    width: Math.max(24, Math.min(70, Number(photo.width) || 42)),
    caption: String(photo.caption || '').slice(0, 240)
  };
}
function cleanEntry(input, author, existing = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : new Date().toISOString().slice(0, 10);
  const photos = Array.isArray(input.photos) ? input.photos.map(cleanPhoto).filter(Boolean).slice(0, 12) : [];
  return {
    id: existing.id || crypto.randomUUID(),
    date,
    title: String(input.title || 'Untitled memory').trim().slice(0, 120),
    text: String(input.text || '').slice(0, 20000),
    photos,
    author: existing.author || author,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function requireAuth(req, res) {
  const user = getUser(req);
  if (!user) {
    json(res, 401, { error: 'Please unlock the journal first.' });
    return null;
  }
  return user;
}
async function serveFile(res, file) {
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return notFound(res);
    res.writeHead(200, {
      'Content-Type': contentType(file),
      'Content-Length': stat.size,
      'Cache-Control': file.includes(`${path.sep}uploads${path.sep}`) ? 'private, max-age=86400' : 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    notFound(res);
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/config' && req.method === 'GET') {
    return json(res, 200, { title: JOURNAL_TITLE, subtitle: JOURNAL_SUBTITLE, production: PROD });
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    if (!USERS.size) return json(res, 503, { error: 'No journal users are configured.' });
    const body = await readBody(req, 64 * 1024);
    const username = String(body.username || '').trim();
    const supplied = String(body.password || '');
    const expected = USERS.get(username);
    if (!expected || !safeEqual(expected, supplied)) return json(res, 401, { error: 'That key does not open this journal.' });
    return json(res, 200, { username }, { 'Set-Cookie': sessionCookie(makeSession(username)) });
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }
  if (pathname === '/api/me' && req.method === 'GET') {
    const user = getUser(req);
    return json(res, 200, { authenticated: Boolean(user), username: user || null });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (pathname === '/api/entries' && req.method === 'GET') {
    const entries = await readEntries();
    entries.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    return json(res, 200, { entries });
  }
  if (pathname === '/api/entries' && req.method === 'POST') {
    const body = await readBody(req);
    const entries = await readEntries();
    const entry = cleanEntry(body, user);
    entries.push(entry);
    await writeEntries(entries);
    return json(res, 201, { entry });
  }
  const entryMatch = pathname.match(/^\/api\/entries\/([a-f0-9-]+)$/i);
  if (entryMatch && req.method === 'PUT') {
    const body = await readBody(req);
    const entries = await readEntries();
    const idx = entries.findIndex(e => e.id === entryMatch[1]);
    if (idx < 0) return notFound(res);
    entries[idx] = cleanEntry(body, user, entries[idx]);
    await writeEntries(entries);
    return json(res, 200, { entry: entries[idx] });
  }
  if (entryMatch && req.method === 'DELETE') {
    const entries = await readEntries();
    const next = entries.filter(e => e.id !== entryMatch[1]);
    if (next.length === entries.length) return notFound(res);
    await writeEntries(next);
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/upload' && req.method === 'POST') {
    const body = await readBody(req, 14 * 1024 * 1024);
    const dataUrl = String(body.dataUrl || '');
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return json(res, 400, { error: 'Please choose a PNG, JPG, WEBP, or GIF image.' });
    const mimeExt = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 8 * 1024 * 1024) return json(res, 413, { error: 'Each photo must be 8 MB or smaller.' });
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${mimeExt}`;
    await fsp.writeFile(path.join(UPLOADS, filename), bytes);
    return json(res, 201, { src: `/uploads/${filename}` });
  }
  notFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");

    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (pathname.startsWith('/uploads/')) {
      if (!getUser(req)) return json(res, 401, { error: 'Locked' });
      const file = path.join(UPLOADS, path.basename(pathname));
      return serveFile(res, file);
    }
    if (pathname === '/' || pathname === '/index.html') return serveFile(res, path.join(PUBLIC, 'index.html'));
    const safeName = path.basename(pathname);
    if (['styles.css', 'app.js'].includes(safeName)) return serveFile(res, path.join(PUBLIC, safeName));
    return notFound(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
    else res.end();
  }
});

ensureStorage().then(() => {
  if (PROD && !process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is not set. Set a strong secret before production use.');
  if (PROD && !USERS.size) console.warn('WARNING: JOURNAL_USERS is empty. Nobody will be able to log in.');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Private journal running at http://localhost:${PORT}`);
    if (!PROD && !process.env.JOURNAL_USERS) console.log('Demo logins: you / love123  OR  girlfriend / journal123');
  });
}).catch(err => {
  console.error(err);
  process.exit(1);
});
