import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, limit, serverTimestamp, arrayUnion, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, updatePassword, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEZ_9ni_0u9WY5fQCSsHt8RZFlijetLgs",
  authDomain: "workspace-1146e.firebaseapp.com",
  projectId: "workspace-1146e",
  storageBucket: "workspace-1146e.firebasestorage.app",
  messagingSenderId: "617778820449",
  appId: "1:617778820449:web:8f239651dda6dfd0f8c120",
  measurementId: "G-YZGE0SBE5V"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let state = {
  user: null, workspaceId: null, workspaceName: null, role: null, workerName: null,
  driveLink: '', members: [], tasks: [], divisions: []
};
let unsubscribers = [];
let dashboardWorkspaces = [];
let dashboardStatus = 'loading';
let dashboardNotifications = [];
let heartbeatInterval = null;
let activities = [], announcements = [];
let notifications = [], notifUnsub = null;
let currentDetailId = null;
const autoStarted = new Set();
const $ = (id) => document.getElementById(id);

/* ══════════ UTIL ══════════ */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
  } catch { return ''; }
}
function localDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const daysLeft = t => !t.endDate ? null : Math.round((new Date(t.endDate + 'T00:00:00') - new Date(localDate() + 'T00:00:00')) / 864e5);
function dueLevel(t) {
  if (t.status === 'done') return null;
  const d = daysLeft(t);
  return d === null ? null : d < 0 ? 'overdue' : d <= 1 ? 'urgent' : d <= 3 ? 'soon' : null;
}
function dueLabel(t) {
  const d = daysLeft(t);
  return d < 0 ? `Terlambat ${-d} hari` : d === 0 ? 'Hari ini' : d === 1 ? 'Besok' : `H-${d}`;
}
const needsAction = (t, role, name) => role === 'mentor'
  ? t.status === 'review'
  : t.assignee === name && (t.status === 'todo' || (t.status === 'progress' && t.revisionNotes));
function statusInfo(t) {
  if (t.status === 'done') return ['Selesai', 's-done'];
  if (t.status === 'review') return ['Siap Dicek', 's-check'];
  if (t.status === 'progress') return t.revisionNotes ? ['Revisi', 's-review'] : ['Berjalan', 's-progress'];
  return ['Belum Dimulai', 's-todo'];
}
function toast(msg, type = 'info') {
  const c = $('toastContainer'); if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
}
const fmtTime = ts => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'baru saja';
};
function timeAgo(ts) {
  if (!ts) return '-';
  const t = ts?.toDate ? ts.toDate() : new Date(ts);
  const s = (Date.now() - t.getTime()) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}
function isOnline(lastActive) {
  if (!lastActive) return false;
  const t = lastActive?.toDate ? lastActive.toDate() : new Date(lastActive);
  return (Date.now() - t.getTime()) < 120000;
}
const newId = () => Math.random().toString(36).slice(2, 9);

/* ══════════ IN-APP DIALOG ══════════ */
let dialogResolve = null, dialogValidator = null;
function openDialog(o) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    dialogValidator = o.validate || null;
    $('appDialogTitle').textContent = o.title || 'Konfirmasi';
    $('appDialogMessage').textContent = o.message || '';
    $('appDialogMessage').classList.toggle('hidden', !o.message);
    $('appDialogFieldWrap').classList.toggle('hidden', !o.input);
    $('appDialogLabel').textContent = o.label || 'Nilai';
    const inp = $('appDialogInput');
    inp.value = o.value || ''; inp.placeholder = o.placeholder || '';
    inp.classList.toggle('code-field', !!o.code);
    inp.maxLength = o.code ? 6 : 500;
    $('appDialogError').classList.add('hidden');
    $('appDialogCancel').classList.toggle('hidden', !!o.alertOnly);
    const ok = $('appDialogConfirm');
    ok.textContent = o.confirmText || (o.input ? 'Simpan' : 'Ya, lanjut');
    ok.className = 'btn-sm ' + (o.danger ? 'btn-danger' : 'btn-solid');
    $('appDialog').dataset.mode = o.input ? 'input' : (o.alertOnly ? 'alert' : 'confirm');
    $('appDialog').classList.remove('hidden');
    setTimeout(() => (o.input ? inp : ok).focus(), 40);
  });
}
function closeDialog(val) {
  $('appDialog').classList.add('hidden');
  const r = dialogResolve; dialogResolve = null; dialogValidator = null;
  if (r) r(val);
}
function submitDialog() {
  const mode = $('appDialog').dataset.mode;
  if (mode === 'input') {
    const v = $('appDialogInput').value;
    if (dialogValidator) {
      const err = dialogValidator(v);
      if (err) { const e = $('appDialogError'); e.textContent = err; e.classList.remove('hidden'); return; }
    }
    closeDialog(v);
  } else closeDialog(true);
}
const showAlert = (message, title = 'Perhatian') => openDialog({ title, message, alertOnly: true, confirmText: 'Mengerti' });
const askConfirm = (message, o = {}) => openDialog({ title: o.title || 'Konfirmasi', message, confirmText: o.confirmText || 'Ya, lanjut', danger: o.danger });
const askText = o => openDialog({ ...o, input: true });

/* ══════════ CUSTOM SELECT ══════════ */
function closeAllSelects(except) {
  document.querySelectorAll('.select-panel').forEach(p => {
    if (p === except) return;
    p.classList.add('hidden');
    p.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}
function enhanceSelect(sel) {
  if (sel.dataset.enhanced) return;
  sel.dataset.enhanced = '1';
  sel.removeAttribute('required');
  const shell = document.createElement('div'); shell.className = 'select-shell';
  sel.parentNode.insertBefore(shell, sel);
  shell.appendChild(sel);
  sel.classList.add('select-native');
  sel.setAttribute('tabindex', '-1');
  sel.setAttribute('aria-hidden', 'true');

  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const val = document.createElement('span'); val.className = 'select-value';
  const caret = document.createElement('span'); caret.className = 'select-caret'; caret.textContent = '▾'; caret.setAttribute('aria-hidden', 'true');
  trigger.append(val, caret);

  const panel = document.createElement('div');
  panel.className = 'select-panel hidden'; panel.setAttribute('role', 'listbox');
  shell.append(trigger, panel);

  const labelFor = () => {
    const o = sel.options[sel.selectedIndex];
    val.textContent = o ? o.textContent.trim() : 'Pilih…';
    val.classList.toggle('placeholder', !o || !sel.value);
  };
  const build = () => {
    panel.innerHTML = '';
    const add = (opt) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'select-option'; b.setAttribute('role', 'option');
      b.dataset.value = opt.value; b.disabled = opt.disabled;
      b.setAttribute('aria-selected', String(opt.value === sel.value));
      const t = document.createElement('span'); t.textContent = opt.textContent.trim();
      b.appendChild(t);
      if (opt.value === sel.value) { const c = document.createElement('span'); c.className = 'select-check'; c.textContent = '✓'; b.appendChild(c); }
      b.addEventListener('click', () => {
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        closeAllSelects(); trigger.focus(); sync();
      });
      panel.appendChild(b);
    };
    Array.from(sel.children).forEach(n => {
      if (n.tagName === 'OPTGROUP') {
        const g = document.createElement('div'); g.className = 'select-group'; g.textContent = n.label;
        panel.appendChild(g);
        Array.from(n.children).forEach(add);
      } else if (n.tagName === 'OPTION') add(n);
    });
    labelFor();
  };
  const sync = () => { build(); };

  trigger.addEventListener('click', () => {
    const open = panel.classList.contains('hidden');
    closeAllSelects();
    panel.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', String(open));
  });
  sel.addEventListener('change', sync);
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  sync();
}
function enhanceAllSelects() { document.querySelectorAll('select[data-enhance]').forEach(enhanceSelect); }

/* ══════════ THEME ══════════ */
function initTheme() {
  const t = localStorage.getItem('akasha_theme') || (localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light');
  applyTheme(t);
  document.querySelectorAll('#themePicker .theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === t);
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      document.querySelectorAll('#themePicker .theme-opt').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
}
function applyTheme(t) {
  document.body.classList.remove('dark-mode', 'theme-playful');
  if (t === 'dark') document.body.classList.add('dark-mode');
  if (t === 'playful') document.body.classList.add('theme-playful');
  localStorage.setItem('akasha_theme', t);
  localStorage.setItem('darkMode', t === 'dark' ? 'true' : 'false');
}

/* ══════════ HEARTBEAT ══════════ */
function startHeartbeat() {
  stopHeartbeat();
  const beat = async () => {
    if (!state.user || !state.workspaceId) return;
    try { await updateDoc(doc(db, 'workspaces', state.workspaceId, 'members', state.user.uid), { lastActive: serverTimestamp() }); }
    catch (e) { console.warn('Heartbeat gagal:', e); }
  };
  beat();
  heartbeatInterval = setInterval(beat, 60000);
}
function stopHeartbeat() { if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; } }

/* ══════════ VIEWS ══════════ */
function showAuthView() {
  $('authView').classList.remove('hidden');
  $('dashboardView').classList.add('hidden');
  $('workspaceView').classList.add('hidden');
}
function showDashboardView() {
  $('authView').classList.add('hidden');
  $('dashboardView').classList.remove('hidden');
  $('workspaceView').classList.add('hidden');
  dashboardStatus = 'loading';
  const name = state.user?.displayName || state.user?.email || 'Pengguna';
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  if ($('topbarUserName')) $('topbarUserName').textContent = name;
  if ($('topbarUserRole')) $('topbarUserRole').textContent = 'Member';
  if ($('topbarUserAvatar')) $('topbarUserAvatar').textContent = initials || 'A';
  renderGreeting();
  loadUserWorkspaces();
  switchDashboardSection('home');
}
function switchDashboardSection(section) {
  const panels = { home: 'dashboardHomePanel', workspaces: 'myWorkspacesPanel', notifications: 'notificationsPanel' };
  Object.entries(panels).forEach(([k, id]) => $(id)?.classList.toggle('hidden', k !== section));
  $('dashboardNavBtn')?.classList.toggle('active', section === 'home');
  $('myWorkspacesNavBtn')?.classList.toggle('active', section === 'workspaces');
  $('notificationsNavBtn')?.classList.toggle('active', section === 'notifications');
  $('dashboardPageTitle').textContent = ({ home: 'Dashboard', workspaces: 'Ruang Kerja Saya', notifications: 'Notifikasi' })[section] || 'Dashboard';
  if (section === 'notifications') renderFullNotifications();
}
function showWorkspaceView() {
  $('authView').classList.add('hidden');
  $('dashboardView').classList.add('hidden');
  $('workspaceView').classList.remove('hidden');
  $('workspaceTitle').textContent = state.workspaceName || 'Ruang Kerja';
  const isLead = state.role === 'mentor';
  $('tabDivisionView')?.classList.toggle('hidden', !isLead);
  $('tabTaskLabel').textContent = isLead ? 'Papan Tugas' : 'Tugas Saya';
  $('mentorPanel').classList.toggle('hidden', !isLead);
  $('mentorTaskCreator').classList.toggle('hidden', !isLead);
  $('announceCreator').classList.toggle('hidden', !isLead);
  $('dailyGoalSection')?.classList.toggle('hidden', isLead);
  $('roleControls').innerHTML = `<span>${isLead ? 'Lead' : 'Member'} · <strong>${escapeHtml(state.workerName)}</strong></span>`;
  startHeartbeat();
  switchWorkspaceTab('task');
}
const WS_TABS = {
  task: ['mainTaskContainer', 'tabTaskView'],
  calendar: ['calendarPanel', 'tabCalendarView'],
  activity: ['activityPanel', 'tabActivityView'],
  announce: ['announcementPanel', 'tabAnnouncementView'],
  division: ['divisionManagementPanel', 'tabDivisionView'],
  team: ['teamPanel', 'tabTeamView']
};
function switchWorkspaceTab(tab) {
  Object.entries(WS_TABS).forEach(([k, [p, b]]) => {
    $(p)?.classList.toggle('hidden', k !== tab);
    $(b)?.classList.toggle('active', k === tab);
  });
  if (tab === 'division') renderDivisionManagement();
  if (tab === 'calendar') renderCalendar();
  if (tab === 'team') renderTeamPanel();
}

/* ══════════ AUTH ══════════ */
function toggleAuthMode() {
  const isLogin = !$('loginForm').classList.contains('hidden');
  $('loginForm').classList.toggle('hidden', isLogin);
  $('registerForm').classList.toggle('hidden', !isLogin);
  $('authTitle').innerHTML = isLogin ? 'Buat <span>Akun</span>' : 'Selamat <span>Datang</span>';
  $('authSubtitle').textContent = isLogin ? 'Daftar untuk membuat atau bergabung ke ruang kerja.' : 'Masuk untuk membuka ruang kerja Anda.';
}
async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = '⏳ Masuk…';
  try {
    await setPersistence(auth, $('rememberMe').checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) { await showAlert('Gagal masuk: ' + (err.code || err.message), 'Tidak bisa masuk'); }
  finally { btn.disabled = false; btn.textContent = 'Masuk ke ruang kerja'; }
}
async function handleRegister(e) {
  e.preventDefault();
  const name = $('registerName').value.trim();
  const email = $('registerEmail').value.trim();
  const password = $('registerPassword').value;
  const btn = $('registerBtn');
  btn.disabled = true; btn.textContent = '⏳ Mendaftar…';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), { email, displayName: name, workspaceIds: [], createdAt: serverTimestamp() });
  } catch (err) { await showAlert('Gagal daftar: ' + (err.code || err.message), 'Tidak bisa mendaftar'); }
  finally { btn.disabled = false; btn.textContent = 'Buat akun'; }
}
async function handleLogout() {
  if (!await askConfirm('Keluar dari akun ini?', { title: 'Keluar', confirmText: 'Keluar', danger: true })) return;
  stopHeartbeat();
  unsubscribers.forEach(u => u()); unsubscribers = [];
  await signOut(auth);
}

/* ══════════ DASHBOARD DATA & GREETING ══════════ */
function summarizeTasks(tasks, role, myName) {
  const mine = role === 'worker' ? tasks.filter(t => t.assignee === myName) : tasks;
  const c = { todo: 0, progress: 0, review: 0, done: 0, overdue: 0 };
  mine.forEach(t => {
    c[t.status] = (c[t.status] || 0) + 1;
    const d = daysLeft(t);
    if (t.status !== 'done' && d !== null && d < 0) c.overdue++;
  });
  return { c, total: mine.length, action: tasks.filter(t => needsAction(t, role, myName)).length };
}
async function loadUserWorkspaces() {
  const list = $('workspaceList');
  if (list) list.innerHTML = '<p class="empty-hint">Memuat daftar ruang kerja…</p>';
  try {
    const userSnap = await getDoc(doc(db, 'users', state.user.uid));
    const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
    if (!ids.length) {
      dashboardWorkspaces = [];
      dashboardStatus = 'ready';
      renderWorkspaceList([]); renderDashboardNotifications(); renderMiniCalendar(); renderDashboardSummary();
      return;
    }
    const workspaces = await Promise.all(ids.map(async id => {
      const wsSnap = await getDoc(doc(db, 'workspaces', id));
      if (!wsSnap.exists()) return null;
      const memberSnap = await getDoc(doc(db, 'workspaces', id, 'members', state.user.uid));
      if (!memberSnap.exists()) return null;
      const member = memberSnap.data();
      let tasks = [];
      try { tasks = (await getDocs(collection(db, 'workspaces', id, 'tasks'))).docs.map(d => ({ id: d.id, ...d.data() })); }
      catch (e) { console.warn('Ringkasan gagal:', e); }
      const role = member.role || 'worker';
      return { id, ...wsSnap.data(), role, workerName: member.name, tasks, stats: summarizeTasks(tasks, role, member.name) };
    }));
    dashboardWorkspaces = workspaces.filter(Boolean);
    dashboardStatus = 'ready';
    renderWorkspaceList(dashboardWorkspaces); renderDashboardNotifications(); renderMiniCalendar(); renderDashboardSummary();
  } catch (err) {
    console.error(err);
    dashboardStatus = 'error';
    renderGreeting();
    if (list) list.innerHTML = `<p class="empty-hint">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}
function renderWorkspaceList(workspaces) {
  const card = ws => {
    const code = ws.joinCode || '';
    const s = ws.stats || { c: {}, total: 0, action: 0 };
    const total = s.total || 0;
    const done = s.c?.done || 0;
    const progress = total ? Math.round((done / total) * 100) : 0;
    const waiting = s.action || 0;
    const roleLabel = ws.role === 'mentor' ? 'Mentor' : 'Member';
    const roleClass = ws.role === 'mentor' ? 'badge-role-mentor' : 'badge-role-member';
    return `<div class="ws-card-item" role="button" tabindex="0" onclick="openWorkspace('${ws.id}')">
      <div class="ws-card-top">
        <div>
          <div class="ws-card-name">${escapeHtml(ws.name)}</div>
          <div class="ws-card-meta">${escapeHtml(ws.role === 'mentor' ? 'Kamu pengelolanya' : 'Anggota')}</div>
        </div>
        <span class="${roleClass}">${roleLabel}</span>
      </div>
      <div>
        <div class="ws-progress-bar"><div class="ws-progress-fill" style="width:${progress}%"></div></div>
        <div class="ws-progress-text">${progress}% selesai · ${waiting} tugas menunggu kamu</div>
      </div>
      <div class="ws-card-foot">
        <span class="ws-code-label">KODE ${escapeHtml(code || '-')}</span>
        <button type="button" class="btn-sm btn-ghost" onclick="event.stopPropagation();openWorkspace('${ws.id}')">Buka ruang</button>
      </div>
    </div>`;
  };
  const empty = '<p class="empty-hint">Belum ada ruang kerja. Buat atau gabung dengan kode undangan.</p>';
  const joinCard = `<div class="ws-card-item ws-join-card-item">
    <h3 style="font-size:.95rem;font-weight:700">Punya kode undangan?</h3>
    <p style="font-size:.8rem;color:var(--text-muted)">Masukkan 6 karakter dari mentormu.</p>
    <div class="ws-join-form">
      <input type="text" id="inlineJoinCode" maxlength="6" class="field code-field" placeholder="ABC123" />
      <button type="button" class="btn-sm btn-solid" id="inlineJoinBtn">Gabung</button>
    </div>
  </div>`;
  if ($('workspaceList')) {
    $('workspaceList').innerHTML = workspaces.length ? workspaces.map(card).join('') + joinCard : empty + joinCard;
    const btn = $('inlineJoinBtn');
    if (btn) btn.onclick = () => {
      const code = ($('inlineJoinCode')?.value || '').trim().toUpperCase();
      if (code.length === 6) { $('joinCodeInput').value = code; $('joinWorkspaceModal').classList.remove('hidden'); }
      else toast('Kode harus 6 karakter', 'info');
    };
  }
}
function notifMarkup(item) {
  return `<article class="dashboard-notification-item" onclick="openWorkspace('${item.workspaceId}')">
    <span class="notification-status-dot ${item.kind === 'done' ? 'is-done' : 'is-action'}"></span>
    <div class="dashboard-notification-copy">
      <strong>${escapeHtml(item.title || 'Tugas tanpa judul')}</strong>
      <p>${escapeHtml(item.workspaceName)} · ${item.kind === 'done' ? 'Tugas selesai' : (item.role === 'mentor' ? 'Menunggu penilaian' : 'Perlu tindakan')}</p>
    </div>
    <span class="notification-kind ${item.kind}">${item.kind === 'done' ? 'Selesai' : 'Perlu tindakan'}</span>
  </article>`;
}
function renderDashboardNotifications() {
  dashboardNotifications = [];
  dashboardWorkspaces.forEach(ws => (ws.tasks || []).forEach(task => {
    if (!(ws.role === 'mentor' || task.assignee === ws.workerName)) return;
    if (needsAction(task, ws.role, ws.workerName)) dashboardNotifications.push({ ...task, workspaceId: ws.id, workspaceName: ws.name, kind: 'action', role: ws.role });
    if (task.status === 'done') dashboardNotifications.push({ ...task, workspaceId: ws.id, workspaceName: ws.name, kind: 'done', role: ws.role });
  }));
  dashboardNotifications.sort((a, b) => a.kind === b.kind ? String(b.endDate || '').localeCompare(String(a.endDate || '')) : a.kind === 'action' ? -1 : 1);
  const list = $('dashboardNotificationsList'); if (!list) return;
  list.innerHTML = dashboardNotifications.length ? dashboardNotifications.slice(0, 8).map(notifMarkup).join('') : '<p class="empty-hint">Belum ada notifikasi.</p>';
}
function renderFullNotifications() {
  const list = $('dashboardNotificationsListFull'); if (!list) return;
  list.innerHTML = dashboardNotifications.length ? dashboardNotifications.map(notifMarkup).join('') : '<p class="empty-hint">Belum ada notifikasi.</p>';
}
function renderMiniCalendar() {
  const el = $('miniCalendarList'); if (!el) return;
  const end = new Date(); end.setDate(end.getDate() + 7);
  const items = [];
  dashboardWorkspaces.forEach(ws => (ws.tasks || []).forEach(t => {
    if (t.status === 'done' || !t.endDate) return;
    if (ws.role !== 'mentor' && t.assignee !== ws.workerName) return;
    const d = new Date(t.endDate + 'T00:00:00');
    if (d >= new Date(localDate() + 'T00:00:00') && d <= end) items.push({ t, ws, date: d });
  }));
  items.sort((a, b) => a.date - b.date);
  if (!items.length) { el.innerHTML = '<div class="mini-cal-empty">Tidak ada tenggat dalam 7 hari ke depan.</div>'; return; }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  el.innerHTML = items.slice(0, 8).map(({ t, ws, date }) => {
    const lv = dueLevel(t);
    return `<div class="mini-cal-item ${lv ? 'due-' + lv : ''}" onclick="openWorkspace('${ws.id}')">
      <div class="mini-cal-date"><span class="day">${date.getDate()}</span><span class="mon">${months[date.getMonth()]}</span></div>
      <div class="mini-cal-info"><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(ws.name)} · ${escapeHtml(t.assignee)}</small></div>
      ${lv ? `<span class="due-badge due-${lv}">${dueLabel(t)}</span>` : ''}
    </div>`;
  }).join('');
}
function renderDashboardSummary() {
  const el = $('dashboardSummary'); if (!el) return;
  let total = 0, done = 0, soon = 0, overdue = 0;
  dashboardWorkspaces.forEach(ws => {
    const s = ws.stats || { c: {}, total: 0 };
    total += s.total; done += (s.c.done || 0); overdue += (s.c.overdue || 0);
    (ws.tasks || []).forEach(t => {
      if (t.status === 'done') return;
      const d = daysLeft(t);
      if (d !== null && d >= 0 && d <= 7) soon++;
    });
  });
  el.innerHTML = `
    <div class="summary-item"><div class="num">${total}</div><div class="lbl">Total tugas</div></div>
    <div class="summary-item stat-success"><div class="num">${done}</div><div class="lbl">Selesai</div></div>
    <div class="summary-item stat-warning"><div class="num">${soon}</div><div class="lbl">Tenggat mendekat</div></div>
    <div class="summary-item stat-danger"><div class="num">${overdue}</div><div class="lbl">Terlambat</div></div>`;
  renderDashboardTaskList();
  renderHabits();
  renderMoodUI();
  renderGreeting();
}
function renderDashboardTaskList() {
  const el = $('dashboardTaskList'); if (!el) return;
  const items = [];
  dashboardWorkspaces.forEach(ws => (ws.tasks || []).forEach(t => {
    if (ws.role === 'worker' && t.assignee !== ws.workerName) return;
    items.push({ ...t, workspaceName: ws.name, workspaceId: ws.id });
  }));
  items.sort((a, b) => String(a.endDate || '9999').localeCompare(String(b.endDate || '9999')));
  const top = items.slice(0, 6);
  if (!top.length) { el.innerHTML = '<p class="empty-hint">Belum ada tugas untukmu.</p>'; return; }
  el.innerHTML = top.map(t => {
    const [label, cls] = statusInfo(t);
    const due = t.endDate ? dueLabel(t) : '-';
    const dueCls = dueLevel(t);
    return `<button type="button" class="dash-task-row" onclick="openWorkspace('${t.workspaceId}')">
      <span class="dash-task-info">
        <span class="dash-task-title">${escapeHtml(t.title)}</span>
        <span class="dash-task-meta">${escapeHtml(t.workspaceName)}${t.assignee ? ', ' + escapeHtml(t.assignee) : ''}</span>
      </span>
      <span class="dash-task-badges">
        <span class="stat-pill ${cls}">${label}</span>
        ${dueCls ? `<span class="due-badge due-${dueCls}">${due}</span>` : `<span class="stat-pill s-todo">${due}</span>`}
      </span>
    </button>`;
  }).join('');
}
function renderGreeting() {
  const title = $('greetTitle'); if (!title) return;
  const text = $('welcomeText'), facts = $('greetFacts'), ring = $('greetRing');
  const first = ((state.user?.displayName || '').trim().split(/\s+/)[0]) || '';
  const hr = new Date().getHours();
  const sapa = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam';
  title.textContent = first ? `${sapa}, ${first}` : sapa;

  if (dashboardStatus === 'error') {
    text.textContent = 'Ringkasan gagal dimuat.';
    facts.innerHTML = ''; ring.innerHTML = ''; return;
  }
  const habits = (prodData?.habits || []).filter(x => !x.archived);
  const done = habits.filter(x => x.doneToday).length;
  const pct = habits.length ? Math.round(done / habits.length * 100) : 0;
  const best = habits.reduce((m, x) => Math.max(m, x.streak || 0), 0);
  let soon = 0, late = 0;
  dashboardWorkspaces.forEach(ws => {
    late += ws.stats?.c?.overdue || 0;
    (ws.tasks || []).forEach(t => {
      if (t.status === 'done') return;
      const d = daysLeft(t);
      if (d !== null && d >= 0 && d <= 7) soon++;
    });
  });

  let msg;
  if (dashboardStatus === 'loading') msg = 'Memuat ringkasan tugas dan kebiasaanmu.';
  else if (late) msg = `${late} tugas sudah lewat tenggat. Mulai dari yang paling lama.`;
  else if (soon) msg = `${soon} tugas jatuh tempo dalam 7 hari ke depan.`;
  else if (habits.length && done < habits.length) msg = `Tinggal ${habits.length - done} kebiasaan lagi untuk hari ini.`;
  else if (habits.length) msg = 'Semua kebiasaan hari ini sudah tercentang.';
  else msg = 'Belum ada kebiasaan. Tambah satu di bawah untuk mulai mencatat.';
  text.textContent = msg;

  const items = [];
  if (best) items.push(`Streak terpanjang ${best} hari`);
  if (dashboardStatus === 'ready' && soon) items.push(`${soon} tenggat minggu ini`);
  if (habits.length) items.push(`${done} dari ${habits.length} kebiasaan`);
  facts.innerHTML = items.map(i => `<li>${i}</li>`).join('');

  // Lencana konsistensi baru
  let badgeWrap = $('greetBadges');
  if (!badgeWrap) {
    badgeWrap = document.createElement('div');
    badgeWrap.id = 'greetBadges';
    badgeWrap.className = 'greet-badges';
    facts.after(badgeWrap);
  }
  const badges = [];
  if (best >= 30) badges.push('Master Konsisten · 30+ Hari');
  else if (best >= 7) badges.push('Ritme Terjaga · 7+ Hari');
  else if (best >= 3) badges.push('Mulai Stabil · 3+ Hari');
  if (habits.length > 0 && done === habits.length) badges.push('Target Hari Ini Tuntas');
  badgeWrap.innerHTML = badges.map(b => `<span class="streak-badge">${escapeHtml(b)}</span>`).join('');

  if (!habits.length) { ring.innerHTML = ''; ring.classList.add('hidden'); return; }
  ring.classList.remove('hidden');
  const C = 2 * Math.PI * 34;
  ring.setAttribute('aria-label', `Progres kebiasaan hari ini: ${pct} persen`);
  ring.innerHTML = `<svg viewBox="0 0 80 80" width="96" height="96" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="34"/><circle class="ring-fg" cx="40" cy="40" r="34" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg><span class="ring-num" aria-hidden="true">${pct}%</span>`;
}

/* ══════════ WORKSPACE & LAINNYA ══════════ */
async function handleCreateWorkspace(e) {
  e.preventDefault();
  const name = $('newWorkspaceName').value.trim();
  const codeInput = ($('newWorkspaceCode')?.value || '').trim().toUpperCase();
  const drive = ($('newWorkspaceDrive')?.value || '').trim();
  if (!name || codeInput.length !== 6) return showAlert('Nama dan kode 6 karakter wajib diisi.');
  const btn = $('createWorkspaceSubmitBtn');
  btn.disabled = true; btn.textContent = '⏳ Membuat…';
  try {
    if (!(await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', codeInput), limit(1)))).empty) {
      return showAlert('Kode undangan sudah digunakan.');
    }
    const uid = state.user.uid;
    const mentorName = state.user.displayName || 'Lead';
    const wsRef = doc(collection(db, 'workspaces'));
    const batch = writeBatch(db);
    batch.set(wsRef, { name, ownerUid: uid, joinCode: codeInput, driveLink: drive ? safeUrl(drive) : '', createdAt: serverTimestamp() });
    batch.set(doc(db, 'workspaces', wsRef.id, 'members', uid), { uid, email: state.user.email, name: mentorName, role: 'mentor', division: 'Manajemen', joinedAt: serverTimestamp(), lastActive: serverTimestamp() });
    batch.set(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsRef.id) }, { merge: true });
    await batch.commit();
    state.workspaceId = wsRef.id; state.workspaceName = name; state.role = 'mentor'; state.workerName = mentorName;
    $('createWorkspaceModal').classList.add('hidden');
    $('createWorkspaceForm').reset();
    showWorkspaceView(); subscribeToWorkspace();
  } catch (err) { await showAlert('Gagal membuat ruang kerja: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Buat ruang kerja'; }
}
async function handleJoinWorkspace(e) {
  e.preventDefault();
  const code = $('joinCodeInput').value.trim().toUpperCase();
  if (code.length !== 6) return showAlert('Kode harus 6 karakter.');
  const btn = $('joinWorkspaceSubmitBtn');
  btn.disabled = true; btn.textContent = '⏳ Mencari…';
  try {
    const snap = await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', code), limit(1)));
    if (snap.empty) return showAlert('Kode undangan tidak valid.');
    const wsDoc = snap.docs[0], wsData = wsDoc.data(), uid = state.user.uid;
    const myMemberRef = doc(db, 'workspaces', wsDoc.id, 'members', uid);
    const existingMe = await getDoc(myMemberRef);
    const myName = state.user.displayName || state.user.email.split('@')[0];
    let justJoined = false;
    if (existingMe.exists()) {
      await setDoc(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
      state.role = existingMe.data().role || 'worker';
      state.workerName = existingMe.data().name || myName;
    } else {
      const membersSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'members'));
      if (membersSnap.docs.filter(d => d.data().role === 'worker').length >= 20) return showAlert('Ruang kerja penuh.');
      const batch = writeBatch(db);
      batch.set(myMemberRef, { uid, email: state.user.email, name: myName, role: 'worker', division: 'Umum', joinedAt: serverTimestamp(), lastActive: serverTimestamp() });
      batch.set(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
      await batch.commit();
      state.role = 'worker'; state.workerName = myName; justJoined = true;
    }
    state.workspaceId = wsDoc.id; state.workspaceName = wsData.name;
    if (justJoined) logActivity('join', `${state.workerName} bergabung ke ruang kerja`);
    $('joinWorkspaceModal').classList.add('hidden');
    $('joinWorkspaceForm').reset();
    showWorkspaceView(); subscribeToWorkspace();
  } catch (err) { await showAlert('Gagal bergabung: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Gabung ruang kerja'; }
}
window.openWorkspace = async (workspaceId) => {
  try {
    const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
    if (!wsSnap.exists()) return showAlert('Ruang kerja tidak ditemukan.');
    const memberSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'members', state.user.uid));
    if (!memberSnap.exists()) return showAlert('Anda bukan anggota ruang kerja ini.');
    state.workspaceId = workspaceId;
    state.workspaceName = wsSnap.data().name;
    state.role = memberSnap.data().role;
    state.workerName = memberSnap.data().name || state.user.displayName || 'User';
    showWorkspaceView(); subscribeToWorkspace();
  } catch (err) { await showAlert('Gagal membuka ruang kerja: ' + err.message); }
};
function backToDashboard() {
  stopHeartbeat();
  unsubscribers.forEach(u => u()); unsubscribers = [];
  state.workspaceId = null; state.workspaceName = null; state.role = null;
  state.members = []; state.tasks = []; state.divisions = [];
  currentDetailId = null; activities = []; announcements = [];
  showDashboardView();
}
function subscribeToWorkspace() {
  unsubscribers.forEach(u => u()); unsubscribers = [];
  const ws = state.workspaceId;
  unsubscribers.push(onSnapshot(collection(db, 'workspaces', ws, 'members'), snap => {
    state.members = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
    renderTasks();
  }));
  unsubscribers.push(onSnapshot(query(collection(db, 'workspaces', ws, 'tasks'), orderBy('createdAt', 'desc')), snap => {
    state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
  }));
}
function renderTasks() {
  const tbody = $('taskTableBody'); if (!tbody) return;
  let list = state.role === 'worker' ? state.tasks.filter(t => t.assignee === state.workerName) : [...state.tasks];
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Belum ada tugas.</td></tr>'; return; }
  tbody.innerHTML = list.map(task => {
    const [statusText, statusClass] = statusInfo(task);
    const diff = (task.difficulty || 'sedang').toLowerCase();
    return `<tr onclick="openTaskDetailModal('${task.id}')">
      <td><div style="font-weight:600;font-size:.9rem">${escapeHtml(task.title)}</div></td>
      <td class="task-desc-cell"><div class="task-desc">${escapeHtml(task.desc || '-')}</div></td>
      <td>${escapeHtml(task.assignee)}</td>
      <td class="col-center"><span class="stat-pill diff-${diff}">${diff}</span></td>
      <td class="col-center"><span class="stat-pill ${statusClass}">${statusText}</span></td>
      <td>${escapeHtml(task.endDate || '-')}</td>
    </tr>`;
  }).join('');
}
window.openTaskDetailModal = (taskId) => {
  const task = state.tasks.find(t => t.id === taskId); if (!task) return;
  $('detailTaskTitle').textContent = task.title;
  $('detailTaskAssignee').textContent = task.assignee;
  $('detailTaskDesc').textContent = task.desc || '';
  currentDetailId = task.id;
  $('taskDetailModal').classList.remove('hidden');
};
window.closeTaskDetailModal = () => { $('taskDetailModal').classList.add('hidden'); currentDetailId = null; };

/* ══════════ PRODUKTIVITAS PRIBADI (Habits & Mood & Scratchpad) ══════════ */
const PROD_KEY = 'akasha_productivity_v3';
let prodData = null;
let selectedMood = null;
let selectedMoodTags = [];
let habitCatFilter = 'all';
let expandedHabitId = null;

function emptyProd() {
  return { habits: [], habitHistory: [], moodToday: null, moodNote: '', moodHistory: [], lastRollDate: localDate(), celebratedMilestones: {} };
}
function loadProdLocal() {
  try {
    const raw = localStorage.getItem(PROD_KEY);
    if (raw) { prodData = JSON.parse(raw); return true; }
  } catch (_) {}
  prodData = emptyProd();
  saveProdLocal();
  return true;
}
function saveProdLocal() { try { localStorage.setItem(PROD_KEY, JSON.stringify(prodData)); } catch (_) {} }
function saveProd() { saveProdLocal(); }
function activeHabits() { return (prodData.habits || []).filter(h => !h.archived && (habitCatFilter === 'all' || h.category === habitCatFilter)); }

function renderHabits() {
  const list = $('habitList'); if (!list) return;
  const habits = activeHabits();
  if (!habits.length) { list.innerHTML = '<p class="empty-hint">Belum ada kebiasaan.</p>'; return; }
  list.innerHTML = habits.map(h => {
    const icon = h.icon || (h.name || '#').trim().charAt(0).toUpperCase();
    return `<div class="habit-item ${h.doneToday ? 'done' : ''}">
      <button type="button" class="habit-check" onclick="toggleHabit('${h.id}')">${h.doneToday ? '✓' : ''}</button>
      <span class="habit-icon">${escapeHtml(icon)}</span>
      <span class="habit-name">${escapeHtml(h.name)}</span>
      <span class="habit-days">${h.streak} hari</span>
    </div>`;
  }).join('');
}
window.toggleHabit = (id) => {
  const h = prodData.habits.find(x => x.id === id); if (!h) return;
  h.doneToday = !h.doneToday;
  h.streak = h.doneToday ? h.streak + 1 : Math.max(0, h.streak - 1);
  saveProd();
  renderHabits();
  renderGreeting();
};
function renderMoodUI() {
  document.querySelectorAll('#moodPicker .mood-btn').forEach(b => {
    b.classList.toggle('selected', Number(b.dataset.mood) === prodData.moodToday);
  });
}
function setupProductivityEvents() {
  $('addHabitBtn')?.addEventListener('click', () => {
    askText({ title: 'Tambah kebiasaan', label: 'Nama kebiasaan', placeholder: 'Misal: Ngoding 1 jam' }).then(name => {
      if (!name || !name.trim()) return;
      prodData.habits.push({ id: newId(), name: name.trim(), streak: 0, longest: 0, doneToday: false, history: {}, category: 'kerja', archived: false, freezes: 1 });
      saveProd(); renderHabits(); renderGreeting();
      toast('Kebiasaan ditambahkan', 'success');
    });
  });

  document.querySelectorAll('#moodPicker .mood-btn').forEach(b => {
    b.addEventListener('click', () => {
      const mood = Number(b.dataset.mood);
      prodData.moodToday = mood;
      saveProd(); renderMoodUI();
      toast('Mood disimpan', 'success');
    });
  });

  // Logika simpan otomatis Catatan Kilat (Scratchpad)
  const scratchInput = $('scratchpadInput');
  const scratchStatus = $('scratchStatus');
  if (scratchInput) {
    scratchInput.value = localStorage.getItem('akasha_scratchpad') || '';
    let scratchTimer = null;
    scratchInput.addEventListener('input', () => {
      if (scratchStatus) scratchStatus.textContent = 'Menyimpan…';
      clearTimeout(scratchTimer);
      scratchTimer = setTimeout(() => {
        localStorage.setItem('akasha_scratchpad', scratchInput.value);
        if (scratchStatus) scratchStatus.textContent = 'Tersimpan';
      }, 400);
    });
  }
}

/* ══════════ INIT ══════════ */
function setupEventListeners() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('registerForm').addEventListener('submit', handleRegister);
  $('authToggleLink').addEventListener('click', e => { e.preventDefault(); toggleAuthMode(); });
  $('logoutBtn').addEventListener('click', handleLogout);
  $('createWorkspaceBtn').addEventListener('click', () => $('createWorkspaceModal').classList.remove('hidden'));
  $('joinWorkspaceBtn').addEventListener('click', () => $('joinWorkspaceModal').classList.remove('hidden'));
  $('createWorkspaceForm').addEventListener('submit', handleCreateWorkspace);
  $('joinWorkspaceForm').addEventListener('submit', handleJoinWorkspace);
  $('backToDashboardBtn').addEventListener('click', backToDashboard);

  $('dashboardNavBtn').addEventListener('click', () => switchDashboardSection('home'));
  $('myWorkspacesNavBtn').addEventListener('click', () => switchDashboardSection('workspaces'));
  $('notificationsNavBtn').addEventListener('click', () => switchDashboardSection('notifications'));

  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden')));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));
}

function init() {
  initTheme();
  enhanceAllSelects();
  loadProdLocal();
  setupEventListeners();
  setupProductivityEvents();
  onAuthStateChanged(auth, async user => {
    if (user) {
      state.user = user;
      showDashboardView();
      renderHabits();
      renderMoodUI();
    } else {
      stopHeartbeat();
      state = { user: null, workspaceId: null, workspaceName: null, role: null, workerName: null, driveLink: '', members: [], tasks: [], divisions: [] };
      showAuthView();
    }
  });
}
init();
