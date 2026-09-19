const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'client');
const STORAGE = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, 'storage');
const UPLOADS = path.join(STORAGE, 'uploads');
const DATA_FILE = path.join(STORAGE, 'journal.json');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-this-before-deploying';
const JOURNAL_TITLE = process.env.JOURNAL_TITLE || 'Our Little Book of Us';
const JOURNAL_SUBTITLE = process.env.JOURNAL_SUBTITLE || 'Every ordinary day deserves to be remembered.';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest(); }
function safeText(value, max = 120) { return String(value || '').trim().slice(0, max); }
function normalizeTag(value) { return String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 24); }

function parseEnvUsers() {
  const users = new Map();
  const hashed = process.env.JOURNAL_USERS_HASHED || '';
  for (const pair of hashed.split(',')) {
    const idx = pair.indexOf(':');
    if (idx <= 0) continue;
    const tag = normalizeTag(pair.slice(0, idx));
    const hash = pair.slice(idx + 1).trim().toLowerCase();
    if (tag && /^[a-f0-9]{64}$/.test(hash)) users.set(tag, Buffer.from(hash, 'hex'));
  }
  if (!users.size && !PROD) {
    const raw = process.env.JOURNAL_USERS || 'you:love123,girlfriend:journal123';
    for (const pair of raw.split(',')) {
      const idx = pair.indexOf(':');
      if (idx <= 0) continue;
      const tag = normalizeTag(pair.slice(0, idx));
      const secret = pair.slice(idx + 1);
      if (tag && secret) users.set(tag, sha256(secret));
    }
  }
  return users;
}
const ENV_USERS = parseEnvUsers();

function passwordRecord(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(secret, record) {
  try {
    if (!record?.salt || !record?.hash) return false;
    const actual = crypto.scryptSync(String(secret), record.salt, 64);
    const expected = Buffer.from(record.hash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function sign(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function makeSession(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + SESSION_MAX_AGE * 1000 })).toString('base64url');
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
function sessionCookie(token) { return `journal_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Strict${PROD ? '; Secure' : ''}`; }
function clearCookie() { return `journal_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${PROD ? '; Secure' : ''}`; }
function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function notFound(res) { json(res, 404, { error:'Not found' }); }
function forbidden(res, message='You do not have access to this scrapbook.') { json(res, 403, { error:message }); }

function defaultDb() { return { version:2, users:[], spaces:[], invites:[], entries:[] }; }
function publicUser(user) {
  return user ? { id:user.id, tag:user.tag, displayName:user.displayName || user.tag, avatar:user.avatar || '', createdAt:user.createdAt } : null;
}
function memberProfiles(db, space) {
  return (space.memberIds || []).map(id => publicUser(db.users.find(u => u.id === id))).filter(Boolean);
}
function decorateSpace(db, space, viewerId) {
  if (!space) return null;
  const members = memberProfiles(db, space);
  return { id:space.id, type:space.type, name:space.name, ownerId:space.ownerId, members, memberCount:members.length, isOwner:space.ownerId===viewerId, createdAt:space.createdAt };
}
function ensureEnvProfiles(db) {
  for (const tag of ENV_USERS.keys()) {
    if (!db.users.some(u => u.tag === tag)) {
      db.users.push({
        id:crypto.randomUUID(),
        tag,
        displayName:tag === 'you' ? 'You' : tag === 'girlfriend' ? 'Girlfriend' : tag,
        avatar:'',
        externalAuth:true,
        createdAt:new Date().toISOString()
      });
    }
  }
}
function migrateLegacy(parsed) {
  if (!Array.isArray(parsed)) return parsed;
  const db = defaultDb();
  ensureEnvProfiles(db);
  const envProfiles = [...ENV_USERS.keys()].map(tag => db.users.find(u => u.tag === tag)).filter(Boolean);
  const fallback = envProfiles[0] || { id:crypto.randomUUID(), tag:'journalkeeper', displayName:'Journal Keeper', avatar:'', externalAuth:true, createdAt:new Date().toISOString() };
  if (!envProfiles.length) db.users.push(fallback);
  const members = envProfiles.length ? envProfiles.slice(0,2) : [fallback];
  const space = { id:crypto.randomUUID(), type:'lover', name:JOURNAL_TITLE, ownerId:members[0].id, memberIds:members.map(u=>u.id), createdAt:new Date().toISOString() };
  db.spaces.push(space);
  db.entries = parsed.map(old => {
    const authorTag = normalizeTag(old.author);
    const author = db.users.find(u => u.tag === authorTag) || members[0];
    return { ...old, id:old.id || crypto.randomUUID(), spaceId:space.id, authorId:author.id, author:author.displayName, createdAt:old.createdAt || new Date().toISOString(), updatedAt:old.updatedAt || new Date().toISOString() };
  });
  return db;
}
async function writeDb(db) {
  const tmp = `${DATA_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fsp.rename(tmp, DATA_FILE);
}
async function readDb() {
  try {
    const parsed = JSON.parse(await fsp.readFile(DATA_FILE, 'utf8'));
    const db = migrateLegacy(parsed);
    if (!db || typeof db !== 'object') return defaultDb();
    db.version=2;
    db.users=Array.isArray(db.users)?db.users:[];
    db.spaces=Array.isArray(db.spaces)?db.spaces:[];
    db.invites=Array.isArray(db.invites)?db.invites:[];
    db.entries=Array.isArray(db.entries)?db.entries:[];
    const before=db.users.length;
    ensureEnvProfiles(db);
    if (Array.isArray(parsed) || before !== db.users.length) await writeDb(db);
    return db;
  } catch {
    const db=defaultDb(); ensureEnvProfiles(db); await writeDb(db); return db;
  }
}
async function ensureStorage() {
  await fsp.mkdir(UPLOADS,{recursive:true});
  try { await fsp.access(DATA_FILE); } catch { const db=defaultDb(); ensureEnvProfiles(db); await writeDb(db); }
  await readDb();
}
async function getSessionUser(req) {
  const token=getCookies(req).journal_session;
  if (!token || !token.includes('.')) return null;
  const splitAt=token.lastIndexOf('.');
  const payload=token.slice(0,splitAt), sig=token.slice(splitAt+1);
  if (!payload || !sig) return null;
  const expected=Buffer.from(sign(payload)), actual=Buffer.from(sig);
  if (expected.length!==actual.length || !crypto.timingSafeEqual(expected,actual)) return null;
  try {
    const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if (!session.userId || Date.now()>session.exp) return null;
    const db=await readDb();
    return db.users.find(u=>u.id===session.userId) || null;
  } catch { return null; }
}
async function requireAuth(req,res) {
  const user=await getSessionUser(req);
  if (!user) { json(res,401,{error:'Please sign in first.'}); return null; }
  return user;
}
function findSpaceForUser(db,spaceId,userId) { return db.spaces.find(s=>s.id===spaceId && (s.memberIds||[]).includes(userId)); }

function cleanPhoto(photo) {
  if (!photo || typeof photo !== 'object') return null;
  const src=String(photo.src||'');
  if (!src.startsWith('/uploads/')) return null;
  return { id:String(photo.id||crypto.randomUUID()), src, side:photo.side==='right'?'right':'left', width:Math.max(18,Math.min(90,Number(photo.width)||42)), caption:String(photo.caption||'').slice(0,240) };
}
function cleanEntry(input,author,spaceId,existing={}) {
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||''))?input.date:new Date().toISOString().slice(0,10);
  return {
    id:existing.id||crypto.randomUUID(), spaceId, date, title:safeText(input.title||'Untitled memory',120),
    text:String(input.text||'').slice(0,20000),
    photos:Array.isArray(input.photos)?input.photos.map(cleanPhoto).filter(Boolean).slice(0,20):[],
    authorId:existing.authorId||author.id, author:existing.author||author.displayName||author.tag,
    createdAt:existing.createdAt||new Date().toISOString(), updatedAt:new Date().toISOString()
  };
}
function decorateEntry(db,entry) { return { ...entry, authorProfile:publicUser(db.users.find(u=>u.id===entry.authorId)) }; }

function contentType(file) {
  const ext=path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon'})[ext]||'application/octet-stream';
}
async function serveFile(res,file) {
  try {
    const stat=await fsp.stat(file);
    if (!stat.isFile()) return notFound(res);
    res.writeHead(200,{'Content-Type':contentType(file),'Content-Length':stat.size,'Cache-Control':file.includes(`${path.sep}uploads${path.sep}`)?'private, max-age=86400':'no-cache'});
    fs.createReadStream(file).pipe(res);
  } catch { notFound(res); }
}
async function readBody(req,maxBytes=16*1024*1024) {
  return new Promise((resolve,reject)=>{
    let size=0; const chunks=[];
    req.on('data',chunk=>{ size+=chunk.length; if(size>maxBytes){reject(Object.assign(new Error('Payload too large'),{status:413}));req.destroy();return;} chunks.push(chunk); });
    req.on('end',()=>{ try{const raw=Buffer.concat(chunks).toString('utf8');resolve(raw?JSON.parse(raw):{});}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));} });
    req.on('error',reject);
  });
}
async function storeImageDataUrl(dataUrl) {
  const match=String(dataUrl||'').match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/i);
  if(!match) throw Object.assign(new Error('Please choose a PNG, JPG, WEBP, or GIF image.'),{status:400});
  const ext=match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase();
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length>8*1024*1024) throw Object.assign(new Error('Each photo must be 8 MB or smaller.'),{status:413});
  const filename=`${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  await fsp.writeFile(path.join(UPLOADS,filename),bytes);
  return `/uploads/${filename}`;
}

async function handleApi(req,res,pathname,url) {
  if(pathname==='/api/config'&&req.method==='GET') return json(res,200,{title:JOURNAL_TITLE,subtitle:JOURNAL_SUBTITLE,production:PROD});

  if(pathname==='/api/signup'&&req.method==='POST') {
    const body=await readBody(req,128*1024);
    const tag=normalizeTag(body.tag), displayName=safeText(body.displayName||tag,60), secret=String(body.password||'');
    if(tag.length<3) return json(res,400,{error:'Your @tagname must be at least 3 characters.'});
    if(secret.length<8) return json(res,400,{error:'Use a password with at least 8 characters.'});
    const db=await readDb();
    if(db.users.some(u=>u.tag===tag)||ENV_USERS.has(tag)) return json(res,409,{error:'That @tagname is already taken.'});
    const user={id:crypto.randomUUID(),tag,displayName,avatar:'',password:passwordRecord(secret),createdAt:new Date().toISOString()};
    db.users.push(user); await writeDb(db);
    return json(res,201,{user:publicUser(user)},{'Set-Cookie':sessionCookie(makeSession(user.id))});
  }

  if(pathname==='/api/login'&&req.method==='POST') {
    const body=await readBody(req,64*1024);
    const tag=normalizeTag(body.username||body.tag), supplied=String(body.password||'');
    const db=await readDb();
    let user=db.users.find(u=>u.tag===tag);
    let ok=user?verifyPassword(supplied,user.password):false;
    if(!ok&&ENV_USERS.has(tag)){ok=crypto.timingSafeEqual(sha256(supplied),ENV_USERS.get(tag));user=db.users.find(u=>u.tag===tag);}
    if(!ok||!user) return json(res,401,{error:'That @tagname or password is not correct.'});
    return json(res,200,{user:publicUser(user)},{'Set-Cookie':sessionCookie(makeSession(user.id))});
  }

  if(pathname==='/api/logout'&&req.method==='POST') return json(res,200,{ok:true},{'Set-Cookie':clearCookie()});

  if(pathname==='/api/me'&&req.method==='GET') {
    const user=await getSessionUser(req);
    if(!user) return json(res,200,{authenticated:false,user:null});
    const db=await readDb();
    const spaces=db.spaces.filter(s=>s.memberIds?.includes(user.id)).map(s=>decorateSpace(db,s,user.id));
    const invites=db.invites.filter(i=>i.targetUserId===user.id&&i.status==='pending').map(i=>({...i,from:publicUser(db.users.find(u=>u.id===i.fromUserId)),space:decorateSpace(db,db.spaces.find(s=>s.id===i.spaceId),user.id)}));
    return json(res,200,{authenticated:true,user:publicUser(user),spaces,invites});
  }

  const user=await requireAuth(req,res);
  if(!user)return;

  if(pathname==='/api/profile'&&req.method==='PUT') {
    const body=await readBody(req,12*1024*1024), db=await readDb(), target=db.users.find(u=>u.id===user.id);
    if(!target)return notFound(res);
    if(body.displayName!==undefined)target.displayName=safeText(body.displayName,60)||target.displayName;
    if(body.avatarDataUrl)target.avatar=await storeImageDataUrl(body.avatarDataUrl);
    await writeDb(db);
    return json(res,200,{user:publicUser(target)});
  }

  if(pathname==='/api/spaces'&&req.method==='GET') {
    const db=await readDb();
    return json(res,200,{spaces:db.spaces.filter(s=>s.memberIds?.includes(user.id)).map(s=>decorateSpace(db,s,user.id))});
  }

  if(pathname==='/api/spaces'&&req.method==='POST') {
    const body=await readBody(req,128*1024), type=body.type==='group'?'group':'lover', db=await readDb();
    if(type==='lover'&&db.spaces.some(s=>s.type==='lover'&&s.memberIds?.includes(user.id))) return json(res,409,{error:'You are already bound to a lover scrapbook.'});
    const space={id:crypto.randomUUID(),type,name:safeText(body.name||(type==='lover'?'Our Story':'Our Scrapbook'),80),ownerId:user.id,memberIds:[user.id],createdAt:new Date().toISOString()};
    db.spaces.push(space); await writeDb(db);
    return json(res,201,{space:decorateSpace(db,space,user.id)});
  }

  const spaceMatch=pathname.match(/^\/api\/spaces\/([a-f0-9-]+)$/i);
  if(spaceMatch&&req.method==='GET') {
    const db=await readDb(), space=findSpaceForUser(db,spaceMatch[1],user.id);
    if(!space)return forbidden(res);
    return json(res,200,{space:decorateSpace(db,space,user.id)});
  }

  const inviteMatch=pathname.match(/^\/api\/spaces\/([a-f0-9-]+)\/invite$/i);
  if(inviteMatch&&req.method==='POST') {
    const body=await readBody(req,64*1024), tag=normalizeTag(body.tag), db=await readDb(), space=findSpaceForUser(db,inviteMatch[1],user.id);
    if(!space)return forbidden(res);
    if(space.ownerId!==user.id&&space.type==='lover')return forbidden(res,'Only the scrapbook owner can invite the lover.');
    const target=db.users.find(u=>u.tag===tag);
    if(!target)return json(res,404,{error:`No account found for @${tag}.`});
    if(target.id===user.id||space.memberIds.includes(target.id))return json(res,409,{error:'That person is already in this scrapbook.'});
    if(space.type==='lover'){
      const pending=db.invites.filter(i=>i.spaceId===space.id&&i.status==='pending').length;
      if(space.memberIds.length+pending>=2)return json(res,409,{error:'A lover scrapbook can only have two people.'});
      if(db.spaces.some(s=>s.type==='lover'&&s.memberIds?.includes(target.id)))return json(res,409,{error:`@${tag} is already bound to another lover scrapbook.`});
    }
    if(db.invites.some(i=>i.spaceId===space.id&&i.targetUserId===target.id&&i.status==='pending'))return json(res,409,{error:'An invitation is already waiting for them.'});
    const invite={id:crypto.randomUUID(),spaceId:space.id,fromUserId:user.id,targetUserId:target.id,status:'pending',createdAt:new Date().toISOString()};
    db.invites.push(invite); await writeDb(db); return json(res,201,{inviteId:invite.id});
  }

  const inviteAction=pathname.match(/^\/api\/invites\/([a-f0-9-]+)\/(accept|decline)$/i);
  if(inviteAction&&req.method==='POST') {
    const db=await readDb(), invite=db.invites.find(i=>i.id===inviteAction[1]&&i.targetUserId===user.id&&i.status==='pending');
    if(!invite)return notFound(res);
    if(inviteAction[2]==='decline'){invite.status='declined';await writeDb(db);return json(res,200,{ok:true});}
    const space=db.spaces.find(s=>s.id===invite.spaceId);
    if(!space)return notFound(res);
    if(space.type==='lover'){
      if(space.memberIds.length>=2)return json(res,409,{error:'That lover scrapbook is already complete.'});
      if(db.spaces.some(s=>s.type==='lover'&&s.memberIds?.includes(user.id)))return json(res,409,{error:'You are already bound to another lover scrapbook.'});
    }
    if(!space.memberIds.includes(user.id))space.memberIds.push(user.id);
    invite.status='accepted'; await writeDb(db); return json(res,200,{space:decorateSpace(db,space,user.id)});
  }

  if(pathname==='/api/entries'&&req.method==='GET') {
    const db=await readDb(), spaceId=String(url.searchParams.get('spaceId')||''), space=findSpaceForUser(db,spaceId,user.id);
    if(!space)return forbidden(res);
    const entries=db.entries.filter(e=>e.spaceId===space.id).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt).localeCompare(String(b.createdAt))).map(e=>decorateEntry(db,e));
    return json(res,200,{entries,space:decorateSpace(db,space,user.id)});
  }

  if(pathname==='/api/entries'&&req.method==='POST') {
    const body=await readBody(req), db=await readDb(), space=findSpaceForUser(db,String(body.spaceId||''),user.id);
    if(!space)return forbidden(res);
    const entry=cleanEntry(body,user,space.id); db.entries.push(entry); await writeDb(db);
    return json(res,201,{entry:decorateEntry(db,entry)});
  }

  const entryMatch=pathname.match(/^\/api\/entries\/([a-f0-9-]+)$/i);
  if(entryMatch&&(req.method==='PUT'||req.method==='DELETE')) {
    const db=await readDb(), idx=db.entries.findIndex(e=>e.id===entryMatch[1]);
    if(idx<0)return notFound(res);
    const entry=db.entries[idx];
    if(!findSpaceForUser(db,entry.spaceId,user.id))return forbidden(res);
    if(entry.authorId!==user.id)return forbidden(res,'Only the person who wrote this memory can edit or delete it.');
    if(req.method==='DELETE'){db.entries.splice(idx,1);await writeDb(db);return json(res,200,{ok:true});}
    const body=await readBody(req); db.entries[idx]=cleanEntry(body,user,entry.spaceId,entry); await writeDb(db);
    return json(res,200,{entry:decorateEntry(db,db.entries[idx])});
  }

  if(pathname==='/api/upload'&&req.method==='POST') {
    const body=await readBody(req,14*1024*1024), src=await storeImageDataUrl(body.dataUrl);
    return json(res,201,{src});
  }

  notFound(res);
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`), pathname=decodeURIComponent(url.pathname);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
    if(pathname.startsWith('/api/'))return await handleApi(req,res,pathname,url);
    if(pathname.startsWith('/uploads/')){
      if(!(await getSessionUser(req)))return json(res,401,{error:'Locked'});
      return serveFile(res,path.join(UPLOADS,path.basename(pathname)));
    }
    if(pathname==='/'||pathname==='/index.html')return serveFile(res,path.join(PUBLIC,'index.html'));
    const safeName=path.basename(pathname);
    if(['styles.css','app.js'].includes(safeName))return serveFile(res,path.join(PUBLIC,safeName));
    return notFound(res);
  }catch(err){
    console.error(err);
    if(!res.headersSent)json(res,err.status||500,{error:err.status?err.message:'Something went wrong.'});
    else res.end();
  }
});

ensureStorage().then(()=>{
  if(PROD&&!process.env.SESSION_SECRET)console.warn('WARNING: SESSION_SECRET is not set.');
  server.listen(PORT,'0.0.0.0',()=>console.log(`Scrapbook journal running at http://localhost:${PORT}`));
}).catch(err=>{console.error(err);process.exit(1);});
