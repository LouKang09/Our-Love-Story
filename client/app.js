const $ = sel => document.querySelector(sel);
const lockScreen = $('#lockScreen');
const journalApp = $('#journalApp');
const coverStage = $('#coverStage');
const bookView = $('#bookView');
const streamView = $('#streamView');
const noSpaceView = $('#noSpaceView');
const emptyState = $('#emptyState');
const leftPage = $('#leftPage');
const rightPage = $('#rightPage');
const bookShell = $('#bookShell');
const editorDialog = $('#editorDialog');
const loginForm = $('#loginForm');
const signupForm = $('#signupForm');
const entryForm = $('#entryForm');
const photoControls = $('#photoControls');
const preview = $('#entryPreview');

let entries = [];
let spaces = [];
let invites = [];
let activeSpace = null;
let spreadIndex = 0;
let currentMode = 'cover';
let editingId = null;
let editingPhotos = [];
let me = null;
let pendingProfileDataUrl = '';
let config = { title:'Our Little Book of Us', subtitle:'Every ordinary day deserves to be remembered.' };
let toastTimer;

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials:'same-origin',
    headers:{ 'Content-Type':'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function normalizeTag(value = '') {
  return String(value).trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0,24);
}
function formatDate(dateString) {
  const d = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(d);
}
function paragraphHtml(text) {
  const clean = escapeHtml(text || '').trim();
  if (!clean) return '<p><em class="muted">No words were needed for this memory.</em></p>';
  return clean.split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
}
function avatarHtml(user, className='avatar') {
  if (user?.avatar) return `<img class="${className}" src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.displayName || user.tag)}" />`;
  const initial = escapeHtml((user?.displayName || user?.tag || '♡').slice(0,1).toUpperCase());
  return `<span class="${className} avatar-fallback">${initial}</span>`;
}
function photoHtml(photo, draggable = false) {
  return `<figure class="memory-photo ${photo.side || 'left'} ${draggable ? 'preview-draggable' : ''}" style="width:${Number(photo.width) || 42}%" ${draggable ? `data-photo-id="${escapeHtml(photo.id)}"` : ''}>
    <img src="${escapeHtml(photo.src)}" alt="Journal memory" loading="lazy" draggable="false" />
    ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}
  </figure>`;
}
function bodyHtml(entry, draggable = false) {
  return `${(entry.photos || []).map(p => photoHtml(p, draggable)).join('')}${paragraphHtml(entry.text)}`;
}
function authorLine(entry) {
  const p = entry.authorProfile;
  const name = p?.displayName || entry.author || 'someone special';
  const tag = p?.tag ? ` @${p.tag}` : '';
  return `written by ${escapeHtml(name)}${escapeHtml(tag)}`;
}
function canEdit(entry) { return Boolean(me && entry.authorId === me.id); }
function pageHtml(entry) {
  if (!entry) return '<div class="blank-page"><div><strong>A blank page.</strong><span>Some days are only waiting to happen.</span></div></div>';
  return `<div class="entry-page">
    <div class="entry-date">${formatDate(entry.date)}</div>
    <h2>${escapeHtml(entry.title)}</h2>
    <div class="entry-author">${avatarHtml(entry.authorProfile,'author-avatar')}<span>${authorLine(entry)}</span></div>
    <div class="entry-body">${bodyHtml(entry)}</div>
    ${canEdit(entry) ? `<div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this page</button></div>` : ''}
  </div>`;
}
function chronologicalEntries() {
  return [...entries].sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
function isMobileBook() { return window.matchMedia('(max-width:800px)').matches; }

function renderBook() {
  const ordered = chronologicalEntries();
  const mobile = isMobileBook();
  const step = mobile ? 1 : 2;
  const maxIndex = Math.max(0, ordered.length - 1);
  spreadIndex = Math.max(0, Math.min(spreadIndex, mobile ? maxIndex : Math.max(0, ordered.length - (ordered.length % 2 ? 1 : 2))));
  if (mobile) {
    leftPage.innerHTML = '';
    rightPage.innerHTML = pageHtml(ordered[spreadIndex]);
    $('#pageCounter').textContent = ordered.length ? `Page ${spreadIndex+1} of ${ordered.length}` : 'Empty book';
  } else {
    leftPage.innerHTML = pageHtml(ordered[spreadIndex]);
    rightPage.innerHTML = pageHtml(ordered[spreadIndex+1]);
    $('#pageCounter').textContent = ordered.length ? `Pages ${spreadIndex+1}–${Math.min(spreadIndex+2,ordered.length)} of ${ordered.length}` : 'Empty book';
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
      <div class="entry-author">${avatarHtml(entry.authorProfile,'author-avatar')}<span>${authorLine(entry)}</span></div>
      <div class="entry-body">${bodyHtml(entry)}</div>
      ${canEdit(entry) ? `<div class="page-actions"><button class="ghost edit-entry" data-id="${entry.id}">Edit this memory</button></div>` : ''}
    </div>
  </article>`).join('');
  wireEntryButtons($('#timeline'));
}
function wireEntryButtons(root) {
  root.querySelectorAll('.edit-entry').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
}

function relationshipHtml(space, compact=false) {
  if (!space) return '';
  const members = space.members || [];
  if (space.type === 'lover') {
    const first = members[0];
    const second = members[1];
    return `<div class="lover-bond ${compact?'compact-bond':''}">
      <div class="bond-person">${avatarHtml(first,'bond-avatar')}<strong>${escapeHtml(first?.displayName || 'You')}</strong><span>@${escapeHtml(first?.tag || '')}</span></div>
      <div class="bond-heart">♡</div>
      <div class="bond-person ${second?'':'pending-person'}">${second ? avatarHtml(second,'bond-avatar') : '<span class="bond-avatar avatar-fallback">?</span>'}<strong>${escapeHtml(second?.displayName || 'Waiting for your person')}</strong><span>${second ? '@'+escapeHtml(second.tag) : 'invite by @tagname'}</span></div>
    </div>`;
  }
  const viewer = members.find(m => m.id === me?.id) || members[0];
  const others = members.filter(m => m.id !== viewer?.id);
  const positions = [[50,6],[83,27],[83,67],[50,86],[17,67],[17,27]];
  const nodes = others.slice(0,6).map((m,i) => `<div class="group-node friend-node" style="--x:${positions[i][0]}%;--y:${positions[i][1]}%">${avatarHtml(m,'group-avatar')}<span>@${escapeHtml(m.tag)}</span></div>`).join('');
  const lines = others.slice(0,6).map((m,i) => {
    const [x,y] = positions[i];
    const dx=x-50, dy=y-50;
    const len=Math.sqrt(dx*dx+dy*dy);
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    return `<i class="bond-line" style="--len:${len}%;--angle:${angle}deg"></i>`;
  }).join('');
  return `<div class="group-bond ${compact?'compact-group-bond':''}">${lines}<div class="group-node center-node">${avatarHtml(viewer,'group-avatar')}<strong>You</strong><span>@${escapeHtml(viewer?.tag || '')}</span></div>${nodes}${others.length>6 ? `<div class="more-members">+${others.length-6}</div>`:''}</div>`;
}
function renderRelationship() {
  $('#relationshipPanel').innerHTML = activeSpace ? relationshipHtml(activeSpace,true) : '';
  $('#peopleRelationship').innerHTML = activeSpace ? relationshipHtml(activeSpace,false) : '';
  $('#memberList').innerHTML = activeSpace ? (activeSpace.members || []).map(m => `<div class="member-row">${avatarHtml(m,'member-avatar')}<div><strong>${escapeHtml(m.displayName)}</strong><span>@${escapeHtml(m.tag)}</span></div>${m.id===activeSpace.ownerId?'<small>Owner</small>':''}</div>`).join('') : '';
  if (activeSpace) {
    $('#peopleHeading').textContent = activeSpace.type === 'lover' ? 'The two of you' : 'Your scrapbook circle';
    const fullLover = activeSpace.type === 'lover' && activeSpace.memberCount >= 2;
    $('#inviteForm').classList.toggle('hidden', fullLover);
  }
}
function renderSpaceSwitcher() {
  const sel = $('#spaceSwitcher');
  sel.innerHTML = spaces.map(s => `<option value="${s.id}" ${activeSpace?.id===s.id?'selected':''}>${s.type==='lover'?'♡':'✦'} ${escapeHtml(s.name)}</option>`).join('');
  sel.classList.toggle('hidden', !spaces.length);
}
function renderProfileChip() {
  $('#profileChipName').textContent = me?.displayName || 'Profile';
  const holder = $('#profileChipAvatar');
  if (me?.avatar) holder.innerHTML = `<img src="${escapeHtml(me.avatar)}" alt="Profile" />`;
  else holder.textContent = (me?.displayName || me?.tag || '♡').slice(0,1).toUpperCase();
}
function renderInviteBanner() {
  const el = $('#inviteBanner');
  if (!invites.length) { el.classList.add('hidden'); el.innerHTML=''; return; }
  el.classList.remove('hidden');
  el.innerHTML = invites.map(inv => `<div class="invite-card" data-invite-id="${inv.id}">
    <div>${avatarHtml(inv.from,'invite-avatar')}<p><strong>${escapeHtml(inv.from?.displayName || '@'+inv.from?.tag)}</strong> invited you to <b>${escapeHtml(inv.space?.name || 'a scrapbook')}</b> <span class="space-kind">${inv.space?.type==='lover'?'♡ Lover':'✦ Group'}</span></p></div>
    <span><button class="ghost decline-invite">Decline</button><button class="primary accept-invite">Join</button></span>
  </div>`).join('');
  el.querySelectorAll('.invite-card').forEach(card => {
    const id=card.dataset.inviteId;
    card.querySelector('.accept-invite').addEventListener('click',()=>respondInvite(id,'accept'));
    card.querySelector('.decline-invite').addEventListener('click',()=>respondInvite(id,'decline'));
  });
}
async function respondInvite(id, action) {
  try {
    await api(`/api/invites/${id}/${action}`,{method:'POST',body:'{}'});
    await refreshHome();
    if (action==='accept') showToast('You joined the scrapbook.');
  } catch(err){ showToast(err.message); }
}

function showView(mode) {
  currentMode = mode;
  const hasSpace = Boolean(activeSpace);
  noSpaceView.classList.toggle('hidden', hasSpace);
  coverStage.classList.toggle('hidden', !hasSpace || mode !== 'cover');
  bookView.classList.toggle('hidden', !hasSpace || mode !== 'book');
  streamView.classList.toggle('hidden', !hasSpace || mode !== 'stream');
  emptyState.classList.toggle('hidden', !hasSpace || entries.length > 0 || mode === 'cover');
  $('#bookModeBtn').classList.toggle('active',mode==='book');
  $('#streamModeBtn').classList.toggle('active',mode==='stream');
  if (!hasSpace) return;
  if (!entries.length && mode !== 'cover') {
    bookView.classList.add('hidden'); streamView.classList.add('hidden');
  } else if (mode==='book') renderBook();
  else if (mode==='stream') renderTimeline();
}
async function refreshEntries() {
  if (!activeSpace) { entries=[]; return; }
  const data = await api(`/api/entries?spaceId=${encodeURIComponent(activeSpace.id)}`);
  entries = data.entries || [];
  activeSpace = data.space || activeSpace;
  const idx = spaces.findIndex(s=>s.id===activeSpace.id);
  if (idx>=0) spaces[idx]=activeSpace;
  renderRelationship();
  if (currentMode==='book') renderBook();
  if (currentMode==='stream') renderTimeline();
}
async function refreshHome(preferredSpaceId=null) {
  const data=await api('/api/me');
  if (!data.authenticated) return false;
  me=data.user; spaces=data.spaces||[]; invites=data.invites||[];
  const saved=preferredSpaceId || localStorage.getItem('journal.activeSpace');
  activeSpace=spaces.find(s=>s.id===saved) || spaces[0] || null;
  if (activeSpace) localStorage.setItem('journal.activeSpace',activeSpace.id);
  renderProfileChip(); renderSpaceSwitcher(); renderInviteBanner(); renderRelationship();
  if (activeSpace) {
    $('#brandTitle').textContent=activeSpace.name;
    $('#coverTitle').textContent=activeSpace.name;
    $('#coverType').textContent=activeSpace.type==='lover'?'OUR LOVER SCRAPBOOK':'OUR GROUP SCRAPBOOK';
    await refreshEntries();
  } else {
    entries=[]; $('#brandTitle').textContent='My Scrapbooks';
  }
  showView(activeSpace ? currentMode : 'cover');
  return true;
}

function resetEditor(entry=null) {
  editingId=entry?.id||null;
  editingPhotos=(entry?.photos||[]).map(p=>({...p}));
  $('#editorHeading').textContent=entry?'Edit this memory':'Write today down';
  $('#entryDate').value=entry?.date||new Date().toISOString().slice(0,10);
  $('#entryTitle').value=entry?.title||'';
  $('#entryText').value=entry?.text||'';
  $('#deleteEntryBtn').classList.toggle('hidden',!entry);
  $('#editorError').textContent='';
  renderPhotoControls(); renderPreview();
}
function openEditor(id=null) {
  if (!activeSpace) return;
  const entry=id?entries.find(e=>e.id===id):null;
  if (entry && !canEdit(entry)) return showToast('Only the author can edit this memory.');
  resetEditor(entry||null); editorDialog.showModal();
  setTimeout(()=>$('#entryTitle').focus(),50);
}
function closeEditor(){ if(editorDialog.open) editorDialog.close(); }
function currentDraft(){
  return { id:editingId, spaceId:activeSpace?.id, date:$('#entryDate').value, title:$('#entryTitle').value||'Untitled memory', text:$('#entryText').value, photos:editingPhotos };
}
function renderPreview(){
  const draft=currentDraft();
  preview.innerHTML=`<div class="entry-date">${draft.date?formatDate(draft.date):'Someday'}</div><h2>${escapeHtml(draft.title)}</h2>${bodyHtml(draft,true)}`;
  wirePreviewPhotoDragging();
}
function movePhoto(id, direction) {
  const i=editingPhotos.findIndex(p=>String(p.id)===String(id));
  if(i<0) return;
  const next=Math.max(0,Math.min(editingPhotos.length-1,i+direction));
  if(next===i) return;
  const [photo]=editingPhotos.splice(i,1); editingPhotos.splice(next,0,photo);
}
function wirePreviewPhotoDragging(){
  preview.querySelectorAll('.preview-draggable').forEach(fig=>{
    const id=fig.dataset.photoId;
    let startX=0,startY=0,lastOrderMove=0,dragging=false;
    fig.addEventListener('pointerdown',e=>{
      dragging=true; startX=e.clientX; startY=e.clientY; fig.setPointerCapture(e.pointerId); fig.classList.add('is-dragging'); e.preventDefault();
    });
    fig.addEventListener('pointermove',e=>{
      if(!dragging) return;
      const photo=editingPhotos.find(p=>String(p.id)===String(id)); if(!photo) return;
      const dx=e.clientX-startX, dy=e.clientY-startY;
      if(Math.abs(dx)>35){ photo.side=dx<0?'left':'right'; startX=e.clientX; }
      if(Math.abs(dy)>55 && Date.now()-lastOrderMove>180){ movePhoto(id,dy<0?-1:1); startY=e.clientY; lastOrderMove=Date.now(); }
      fig.style.transform=`translate(${Math.max(-18,Math.min(18,dx/4))}px,${Math.max(-12,Math.min(12,dy/5))}px) rotate(${photo.side==='left'?'-.4deg':'.5deg'})`;
    });
    const finish=()=>{ if(!dragging)return; dragging=false; renderPhotoControls(); renderPreview(); };
    fig.addEventListener('pointerup',finish); fig.addEventListener('pointercancel',finish);
  });
}
function renderPhotoControls(){
  if(!editingPhotos.length){ photoControls.innerHTML='<div class="muted photo-empty">No photos yet. Add one or several to turn this into a scrapbook page.</div>'; return; }
  photoControls.innerHTML=editingPhotos.map((p,i)=>`<div class="photo-control" data-index="${i}">
    <img class="control-photo" src="${escapeHtml(p.src)}" alt="Photo ${i+1}" />
    <div class="photo-order">Photo ${i+1}</div>
    <div class="photo-row"><button type="button" class="side-btn ${p.side==='left'?'active':''}" data-side="left">← Left</button><button type="button" class="side-btn ${p.side==='right'?'active':''}" data-side="right">Right →</button></div>
    <label class="range-label"><span>Size <b class="size-value">${p.width}%</b></span><input class="size-range" type="range" min="18" max="90" value="${p.width}" /></label>
    <div class="photo-row"><button type="button" class="order-btn" data-dir="-1" ${i===0?'disabled':''}>↑ Earlier</button><button type="button" class="order-btn" data-dir="1" ${i===editingPhotos.length-1?'disabled':''}>↓ Later</button></div>
    <input class="caption-input" type="text" maxlength="240" value="${escapeHtml(p.caption||'')}" placeholder="Optional little caption" />
    <button type="button" class="remove-photo">Remove photo</button>
  </div>`).join('');
  photoControls.querySelectorAll('.photo-control').forEach(card=>{
    const i=Number(card.dataset.index);
    card.querySelectorAll('.side-btn').forEach(btn=>btn.addEventListener('click',()=>{editingPhotos[i].side=btn.dataset.side;renderPhotoControls();renderPreview();}));
    card.querySelector('.size-range').addEventListener('input',e=>{editingPhotos[i].width=Number(e.target.value);card.querySelector('.size-value').textContent=`${e.target.value}%`;renderPreview();});
    card.querySelectorAll('.order-btn').forEach(btn=>btn.addEventListener('click',()=>{const dir=Number(btn.dataset.dir);const [p]=editingPhotos.splice(i,1);editingPhotos.splice(i+dir,0,p);renderPhotoControls();renderPreview();}));
    card.querySelector('.caption-input').addEventListener('input',e=>{editingPhotos[i].caption=e.target.value;renderPreview();});
    card.querySelector('.remove-photo').addEventListener('click',()=>{editingPhotos.splice(i,1);renderPhotoControls();renderPreview();});
  });
}
async function fileToDataUrl(file){ return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);}); }

function setAuthMode(mode){
  const login=mode==='login';
  loginForm.classList.toggle('hidden',!login); signupForm.classList.toggle('hidden',login);
  $('#loginTab').classList.toggle('active',login); $('#signupTab').classList.toggle('active',!login);
}
$('#loginTab').addEventListener('click',()=>setAuthMode('login'));
$('#signupTab').addEventListener('click',()=>setAuthMode('signup'));
loginForm.addEventListener('submit',async e=>{
  e.preventDefault(); $('#loginError').textContent='';
  try{ await api('/api/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})}); await enterApp(); }
  catch(err){$('#loginError').textContent=err.message;}
});
signupForm.addEventListener('submit',async e=>{
  e.preventDefault(); $('#signupError').textContent='';
  try{ await api('/api/signup',{method:'POST',body:JSON.stringify({displayName:$('#signupName').value,tag:normalizeTag($('#signupTag').value),password:$('#signupPassword').value})}); await enterApp(); showToast('Welcome. Create your first scrapbook.'); }
  catch(err){$('#signupError').textContent=err.message;}
});
async function enterApp(){ lockScreen.classList.add('hidden');journalApp.classList.remove('hidden');currentMode='cover';await refreshHome(); }
$('#logoutBtn').addEventListener('click',async()=>{await api('/api/logout',{method:'POST',body:'{}'}).catch(()=>{});localStorage.removeItem('journal.activeSpace');location.reload();});

$('#spaceSwitcher').addEventListener('change',async e=>{
  activeSpace=spaces.find(s=>s.id===e.target.value)||null; spreadIndex=0; currentMode='cover';
  if(activeSpace){localStorage.setItem('journal.activeSpace',activeSpace.id);$('#brandTitle').textContent=activeSpace.name;$('#coverTitle').textContent=activeSpace.name;$('#coverType').textContent=activeSpace.type==='lover'?'OUR LOVER SCRAPBOOK':'OUR GROUP SCRAPBOOK';await refreshEntries();}
  $('#introBook').classList.remove('open');renderRelationship();showView('cover');
});
$('#brandButton').addEventListener('click',()=>{$('#introBook').classList.remove('open');showView(activeSpace?'cover':'cover');});
$('#openBookBtn').addEventListener('click',()=>{$('#introBook').classList.add('open');setTimeout(()=>showView('book'),720);});
$('#bookModeBtn').addEventListener('click',()=>showView('book'));
$('#streamModeBtn').addEventListener('click',()=>showView('stream'));
$('#newEntryBtn').addEventListener('click',()=>openEditor());
$('#emptyAddBtn').addEventListener('click',()=>openEditor());
$('#closeEditorBtn').addEventListener('click',closeEditor);
$('#cancelEditorBtn').addEventListener('click',closeEditor);

function turn(direction){
  const ordered=chronologicalEntries(); const step=isMobileBook()?1:2; const next=spreadIndex+(direction==='next'?step:-step);
  if(next<0||next>=ordered.length)return;
  const page=direction==='next'?rightPage:(isMobileBook()?rightPage:leftPage); page.classList.add(direction==='next'?'flip-forward':'flip-back');
  setTimeout(()=>{spreadIndex=next;renderBook();},315); setTimeout(()=>page.classList.remove('flip-forward','flip-back'),680);
}
$('#prevBtn').addEventListener('click',()=>turn('prev')); $('#nextBtn').addEventListener('click',()=>turn('next'));
window.addEventListener('keydown',e=>{if(editorDialog.open||currentMode!=='book')return;if(e.key==='ArrowRight')turn('next');if(e.key==='ArrowLeft')turn('prev');});
window.addEventListener('resize',()=>{if(currentMode==='book')renderBook();if(activeSpace)renderRelationship();});
['entryDate','entryTitle','entryText'].forEach(id=>$(`#${id}`).addEventListener('input',renderPreview));
$('#photoInput').addEventListener('change',async e=>{
  const files=[...e.target.files].slice(0,Math.max(0,20-editingPhotos.length)); $('#editorError').textContent='';
  try{
    for(const file of files){
      if(file.size>8*1024*1024)throw new Error(`${file.name} is larger than 8 MB.`);
      const uploaded=await api('/api/upload',{method:'POST',body:JSON.stringify({dataUrl:await fileToDataUrl(file),name:file.name})});
      editingPhotos.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),src:uploaded.src,side:editingPhotos.length%2?'right':'left',width:42,caption:''});
    }
    renderPhotoControls();renderPreview();
  }catch(err){$('#editorError').textContent=err.message;} e.target.value='';
});
entryForm.addEventListener('submit',async e=>{
  e.preventDefault(); $('#editorError').textContent='';
  try{const draft=currentDraft();await api(editingId?`/api/entries/${editingId}`:'/api/entries',{method:editingId?'PUT':'POST',body:JSON.stringify(draft)});await refreshEntries();closeEditor();showView(currentMode==='cover'?'book':currentMode);showToast(editingId?'Memory updated.':'Memory added to the scrapbook.');}
  catch(err){$('#editorError').textContent=err.message;}
});
$('#deleteEntryBtn').addEventListener('click',async()=>{
  if(!editingId||!confirm('Delete this memory from the scrapbook?'))return;
  try{await api(`/api/entries/${editingId}`,{method:'DELETE',body:'{}'});await refreshEntries();closeEditor();showToast('Memory deleted.');if(!entries.length)showView('book');}
  catch(err){$('#editorError').textContent=err.message;}
});

function openSpaceDialog(type='lover'){
  $('#spaceError').textContent=''; $('#spaceName').value=type==='lover'?'Our Story':'Our Scrapbook';
  document.querySelector(`input[name="spaceType"][value="${type}"]`).checked=true; $('#spaceDialog').showModal();
}
$('#newSpaceBtn').addEventListener('click',()=>openSpaceDialog('group'));
document.querySelectorAll('[data-create-space]').forEach(btn=>btn.addEventListener('click',()=>openSpaceDialog(btn.dataset.createSpace)));
$('#closeSpaceBtn').addEventListener('click',()=>$('#spaceDialog').close());
$('#spaceForm').addEventListener('submit',async e=>{
  e.preventDefault(); $('#spaceError').textContent='';
  try{const type=document.querySelector('input[name="spaceType"]:checked').value;const data=await api('/api/spaces',{method:'POST',body:JSON.stringify({type,name:$('#spaceName').value})});$('#spaceDialog').close();await refreshHome(data.space.id);currentMode='cover';showView('cover');showToast('Scrapbook created. Invite someone with their @tagname.');}
  catch(err){$('#spaceError').textContent=err.message;}
});

$('#peopleBtn').addEventListener('click',()=>{if(!activeSpace)return;renderRelationship();$('#inviteError').textContent='';$('#inviteTag').value='';$('#peopleDialog').showModal();});
$('#closePeopleBtn').addEventListener('click',()=>$('#peopleDialog').close());
$('#inviteForm').addEventListener('submit',async e=>{
  e.preventDefault();$('#inviteError').textContent='';
  try{await api(`/api/spaces/${activeSpace.id}/invite`,{method:'POST',body:JSON.stringify({tag:normalizeTag($('#inviteTag').value)})});$('#inviteTag').value='';showToast('Invitation sent.');}
  catch(err){$('#inviteError').textContent=err.message;}
});

function renderProfileDialog(){
  pendingProfileDataUrl=''; $('#profileDisplayName').value=me?.displayName||''; $('#profileTag').value=me?'@'+me.tag:''; $('#profileError').textContent='';
  const img=$('#profileAvatarPreview'),fallback=$('#profileAvatarFallback');
  if(me?.avatar){img.src=me.avatar;img.classList.remove('hidden');fallback.classList.add('hidden');}else{img.removeAttribute('src');img.classList.add('hidden');fallback.classList.remove('hidden');fallback.textContent=(me?.displayName||me?.tag||'♡').slice(0,1).toUpperCase();}
}
$('#profileBtn').addEventListener('click',()=>{renderProfileDialog();$('#profileDialog').showModal();});
$('#closeProfileBtn').addEventListener('click',()=>$('#profileDialog').close());
$('#profilePhotoInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  if(file.size>8*1024*1024){$('#profileError').textContent='Profile picture must be 8 MB or smaller.';return;}
  pendingProfileDataUrl=await fileToDataUrl(file);$('#profileAvatarPreview').src=pendingProfileDataUrl;$('#profileAvatarPreview').classList.remove('hidden');$('#profileAvatarFallback').classList.add('hidden');
});
$('#profileForm').addEventListener('submit',async e=>{
  e.preventDefault();$('#profileError').textContent='';
  try{const data=await api('/api/profile',{method:'PUT',body:JSON.stringify({displayName:$('#profileDisplayName').value,avatarDataUrl:pendingProfileDataUrl||undefined})});me=data.user;$('#profileDialog').close();await refreshHome(activeSpace?.id);showToast('Profile updated.');}
  catch(err){$('#profileError').textContent=err.message;}
});

(async function boot(){
  try{
    config=await api('/api/config'); document.title=config.title; $('#lockTitle').textContent=config.title; $('#lockSubtitle').textContent=config.subtitle;
    const session=await api('/api/me');
    if(session.authenticated){ lockScreen.classList.add('hidden');journalApp.classList.remove('hidden');me=session.user;spaces=session.spaces||[];invites=session.invites||[];currentMode='cover';await refreshHome(); }
  }catch(err){$('#loginError').textContent='The scrapbook could not start. Please check the server.';console.error(err);}
})();