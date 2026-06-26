/* global Quill, io */
let token = localStorage.getItem('token');
let notes = [];
let currentNoteId = null;
let quill = null;
let socket = null;
let searchHighlights = [];
let searchIndex = -1;
let globalSearchTerm = '';
let savedContent = '';

// ===== TEMA =====
function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('btn-theme').innerHTML = '&#9790; Koyu';
  } else {
    document.body.classList.remove('light-theme');
    document.getElementById('btn-theme').innerHTML = '&#9788; Acik';
  }
  localStorage.setItem('theme', theme);
}
applyTheme(localStorage.getItem('theme') || 'dark');

document.getElementById('btn-theme').addEventListener('click', () => {
  const current = localStorage.getItem('theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ===== LOGIN =====
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-password').focus(); });

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  if (!username || !password) { errorEl.textContent = 'Kullanici adi ve sifre gerekli'; return; }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Giris basarisiz'; return; }
    token = data.token;
    localStorage.setItem('token', token);
    showApp();
  } catch (e) { errorEl.textContent = 'Baglanti hatasi'; }
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  token = null;
  localStorage.removeItem('token');
  if (socket) socket.disconnect();
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
});

// ===== APP =====
async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  initQuill();
  connectSocket();
  await loadNotes();
  showEditorPanel(false);
}

function initQuill() {
  if (quill) return;
  quill = new Quill('#editor', {
    modules: { toolbar: '#quill-toolbar' },
    theme: 'snow',
    placeholder: 'Notunuzu yazin...'
  });
}

// ===== SOCKET (JWT auth) =====
function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token: token } });
  const dot = document.getElementById('sync-status');

  socket.on('connect', () => {
    dot.classList.add('connected');
    dot.classList.remove('disconnected');
    dot.title = 'Bagli';
  });
  socket.on('disconnect', () => {
    dot.classList.remove('connected');
    dot.classList.add('disconnected');
    dot.title = 'Baglanti kesildi';
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'Gecersiz token' || err.message === 'Token gerekli') {
      document.getElementById('btn-logout').click();
    }
  });

  socket.on('note:created', note => {
    if (!notes.find(n => n.id === note.id)) notes.unshift(note);
    renderNotesList();
  });
  socket.on('note:updated', note => {
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx !== -1) notes[idx] = note;
    else notes.unshift(note);
    renderNotesList();
    if (currentNoteId === note.id) loadNoteIntoEditor(note);
  });
  socket.on('note:deleted', ({ id }) => {
    notes = notes.filter(n => n.id !== id);
    renderNotesList();
    if (currentNoteId === id) { currentNoteId = null; showEditorPanel(false); }
  });
}

// ===== NOTES =====
async function loadNotes() {
  try {
    const res = await fetch('/api/notes', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status === 401) { document.getElementById('btn-logout').click(); return; }
    notes = await res.json();
    renderNotesList();
  } catch (e) { console.error('Notlar yuklenemedi:', e); }
}

function renderNotesList() {
  const list = document.getElementById('notes-list');
  const sorted = [...notes].sort((a, b) => {
    if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
  if (sorted.length === 0) {
    list.innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--text-dim)">Henuz not yok.<br>"+ Yeni" ile baslayin.</div>';
    return;
  }
  list.innerHTML = sorted.map(note => {
    const preview = stripHtml(note.content).substring(0, 80);
    const colorBar = note.color && note.color !== '#ffffff'
      ? '<div class="note-item-color" style="background:' + esc(note.color) + '"></div>' : '';
    return '<div class="note-item ' + (note.id === currentNoteId ? 'active' : '') + '" data-id="' + note.id + '">'
      + colorBar
      + '<h4>' + (note.pinned ? '<span class="pin-badge">&#128204;</span> ' : '') + esc(note.title) + '</h4>'
      + '<div class="note-item-preview">' + esc(preview) + '</div>'
      + '<div class="note-item-meta">' + formatDate(note.updated_at) + '</div>'
      + '</div>';
  }).join('');
  list.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', () => openNote(Number(el.dataset.id)));
  });
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// ===== EDITOR =====
function showEditorPanel(show) {
  document.getElementById('empty-state').classList.toggle('hidden', show);
  document.getElementById('editor-area').classList.toggle('hidden', !show);
  if (!show && window.innerWidth <= 768) document.getElementById('editor-panel').classList.add('hidden-mobile');
  else document.getElementById('editor-panel').classList.remove('hidden-mobile');
}

function loadNoteIntoEditor(note) {
  document.getElementById('note-title').value = note.title || '';
  document.getElementById('note-color').value = note.color || '#ffffff';
  document.getElementById('btn-pin').dataset.pinned = note.pinned ? '1' : '0';
  document.getElementById('btn-pin').style.opacity = note.pinned ? '1' : '0.5';
  document.getElementById('note-date').textContent = 'Son guncelleme: ' + formatDate(note.updated_at);
  savedContent = note.content || '';
  if (quill) {
    quill.root.innerHTML = savedContent || '<p><br></p>';
  }
}

function openNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  currentNoteId = id;
  clearNoteSearch();
  loadNoteIntoEditor(note);
  showEditorPanel(true);
  renderNotesList();
  if (globalSearchTerm) {
    setTimeout(() => {
      document.getElementById('note-search').value = globalSearchTerm;
      doNoteSearch();
    }, 200);
  }
}

document.getElementById('btn-new-note').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ title: 'Yeni Not', content: '', color: '#ffffff' })
    });
    if (res.status === 401) { document.getElementById('btn-logout').click(); return; }
    const note = await res.json();
    if (!notes.find(n => n.id === note.id)) notes.unshift(note);
    renderNotesList();
    openNote(note.id);
    document.getElementById('note-title').focus();
    document.getElementById('note-title').select();
  } catch (e) { alert('Not olusturulamadi: ' + e.message); }
});

// Kaydet - arama highlight'larini once temizle
document.getElementById('btn-save').addEventListener('click', saveNote);
async function saveNote() {
  if (!currentNoteId || !quill) return;
  removeSearchHighlights();
  const title = document.getElementById('note-title').value.trim() || 'Basliksiz Not';
  const content = quill.root.innerHTML;
  const color = document.getElementById('note-color').value;
  const pinned = document.getElementById('btn-pin').dataset.pinned === '1';
  try {
    const res = await fetch('/api/notes/' + currentNoteId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ title, content, color, pinned })
    });
    if (res.status === 401) { document.getElementById('btn-logout').click(); return; }
    const note = await res.json();
    savedContent = note.content;
    const idx = notes.findIndex(n => n.id === note.id);
    if (idx !== -1) notes[idx] = note;
    document.getElementById('note-date').textContent = 'Son guncelleme: ' + formatDate(note.updated_at);
    renderNotesList();
  } catch (e) { alert('Kaydetme hatasi: ' + e.message); }
}

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Bu notu silmek istediginize emin misiniz?')) return;
  try {
    await fetch('/api/notes/' + currentNoteId, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    notes = notes.filter(n => n.id !== currentNoteId);
    currentNoteId = null;
    showEditorPanel(false);
    renderNotesList();
  } catch (e) { alert('Silme hatasi: ' + e.message); }
});

document.getElementById('btn-pin').addEventListener('click', () => {
  const btn = document.getElementById('btn-pin');
  const p = btn.dataset.pinned === '1' ? '0' : '1';
  btn.dataset.pinned = p;
  btn.style.opacity = p === '1' ? '1' : '0.5';
});

document.getElementById('btn-back').addEventListener('click', () => {
  currentNoteId = null;
  showEditorPanel(false);
  renderNotesList();
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveNote(); }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); document.getElementById('btn-new-note').click(); }
});

// ===== NOT ICI ARAMA =====
document.getElementById('note-search').addEventListener('input', doNoteSearch);
document.getElementById('note-search-next').addEventListener('click', () => navigateSearch(1));
document.getElementById('note-search-prev').addEventListener('click', () => navigateSearch(-1));
document.getElementById('note-search-clear').addEventListener('click', clearNoteSearch);

function doNoteSearch() {
  const query = document.getElementById('note-search').value.trim();
  const countEl = document.getElementById('note-search-count');

  removeSearchHighlights();

  if (!query || !quill) {
    countEl.textContent = '';
    searchHighlights = [];
    searchIndex = -1;
    return;
  }

  const text = quill.getText();
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matches = [];
  let pos = 0;
  while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
    matches.push(pos);
    pos += lowerQuery.length;
  }

  if (matches.length === 0) {
    countEl.textContent = 'Bulunamadi';
    searchHighlights = [];
    searchIndex = -1;
    return;
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    quill.formatText(matches[i], query.length, 'background', '#facc15');
  }

  searchHighlights = matches;
  searchIndex = 0;
  countEl.textContent = matches.length + ' sonuc';
  highlightActive(0);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeSearchHighlights() {
  if (!quill || searchHighlights.length === 0) return;
  quill.root.innerHTML = savedContent || '<p><br></p>';
  searchHighlights = [];
  searchIndex = -1;
}

function highlightActive(idx) {
  if (!quill || searchHighlights.length === 0) return;
  const query = document.getElementById('note-search').value.trim();
  for (let i = 0; i < searchHighlights.length; i++) {
    quill.formatText(searchHighlights[i], query.length, 'background', i === idx ? '#f97316' : '#facc15');
  }
  const bounds = quill.getBounds(searchHighlights[idx], query.length);
  if (bounds) {
    quill.root.parentElement.scrollTop = bounds.top - quill.root.parentElement.clientHeight / 2;
  }
}

function navigateSearch(dir) {
  if (searchHighlights.length === 0) return;
  searchIndex = (searchIndex + dir + searchHighlights.length) % searchHighlights.length;
  highlightActive(searchIndex);
  document.getElementById('note-search-count').textContent = (searchIndex + 1) + ' / ' + searchHighlights.length;
}

function clearNoteSearch() {
  document.getElementById('note-search').value = '';
  document.getElementById('note-search-count').textContent = '';
  removeSearchHighlights();
}

// ===== GLOBAL ARAMA =====
let globalSearchTimeout = null;
document.getElementById('global-search').addEventListener('input', () => {
  clearTimeout(globalSearchTimeout);
  globalSearchTimeout = setTimeout(doGlobalSearch, 300);
});
async function doGlobalSearch() {
  const q = document.getElementById('global-search').value.trim();
  globalSearchTerm = q;
  if (!q) { await loadNotes(); return; }
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q), { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status === 401) { document.getElementById('btn-logout').click(); return; }
    notes = await res.json();
    renderNotesList();
  } catch (e) { console.error('Arama hatasi:', e); }
}

// ===== MOBIL =====
window.addEventListener('resize', () => {
  if (window.innerWidth <= 768 && !currentNoteId) {
    document.getElementById('editor-panel').classList.add('hidden-mobile');
  }
});

// ===== PWA =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ===== BASLANGIC =====
if (token) {
  fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => { if (r.ok) showApp(); else document.getElementById('btn-logout').click(); })
    .catch(() => showApp());
} else {
  document.getElementById('login-screen').classList.remove('hidden');
}
