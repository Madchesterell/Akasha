import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, limit, serverTimestamp, arrayUnion, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
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
const storage = getStorage(app);

let state = {
  user: null, workspaceId: null, workspaceName: null, role: null, workerName: null,
  driveLink: '', members: [], tasks: [], divisions: []
};

let unsubscribers = [];
let dashboardWorkspaces = [];
let dashboardNotifications = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
  } catch { return ''; }
}

function dueDiff(t) {
  if (!t.endDate) return null;
  return (new Date(t.endDate + 'T23:59:59') - new Date()) / 864e5;
}

const needsAction = (t, role, name) => role === 'mentor'
  ? t.status === 'review'
  : t.assignee === name && (t.status === 'todo' || (t.status === 'progress' && t.revisionNotes));

function applyTaskFilters(list) {
  const q = ($('taskSearch')?.value || '').trim().toLowerCase();
  const st = $('filterStatus')?.value;
  const df = $('filterDifficulty')?.value;
  const as = $('filterAssignee')?.value;
  return list.filter(t => {
    if (q && !((t.title || '') + ' ' + (t.desc || '')).toLowerCase().includes(q)) return false;
    if (st && t.status !== st) return false;
    if (df && (t.difficulty || 'sedang').toLowerCase() !== df) return false;
    if (as && t.assignee !== as) return false;
    return true;
  });
}

function summarizeTasks(tasks, role, myName) {
  const mine = role === 'worker' ? tasks.filter(t => t.assignee === myName) : tasks;
  const c = { todo: 0, progress: 0, review: 0, done: 0, overdue: 0 };
  mine.forEach(t => {
    c[t.status] = (c[t.status] || 0) + 1;
    const d = dueDiff(t);
    if (t.status !== 'done' && d !== null && d < 0) c.overdue++;
  });
  return { c, total: mine.length, action: tasks.filter(t => needsAction(t, role, myName)).length };
}

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* =========================================
   DARK MODE — Fitur Baru
========================================= */
function initDarkMode() {
  const saved = localStorage.getItem('darkMode');
  const isDark = saved === 'true';
  if (isDark) {
    document.body.classList.add('dark-mode');
  }
  const toggle = $('darkModeToggle');
  if (toggle) {
    toggle.checked = isDark;
    toggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      document.body.classList.toggle('dark-mode', enabled);
      localStorage.setItem('darkMode', enabled ? 'true' : 'false');
    });
  }
}

function showAuthView() {
  $('authView').classList.remove('hidden');
  $('dashboardView').classList.add('hidden');
  $('workspaceView').classList.add('hidden');
}

function showDashboardView() {
  $('authView').classList.add('hidden');
  $('dashboardView').classList.remove('hidden');
  $('workspaceView').classList.add('hidden');
  
  const name = state.user?.displayName || state.user?.email || 'Pengguna';
  const roleText = 'Anggota';
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  
  if ($('topbarUserName')) $('topbarUserName').textContent = name;
  if ($('topbarUserRole')) $('topbarUserRole').textContent = roleText;
  if ($('topbarUserAvatar')) $('topbarUserAvatar').textContent = initials || 'WP';

  loadUserWorkspaces();
  switchDashboardSection('home');
}

function switchDashboardSection(section) {
  const panels = { home: 'dashboardHomePanel', workspaces: 'myWorkspacesPanel', notifications: 'notificationsPanel' };
  Object.entries(panels).forEach(([key, id]) => $(id)?.classList.toggle('hidden', key !== section));
  $('dashboardNavBtn')?.classList.toggle('active', section === 'home');
  $('myWorkspacesNavBtn')?.classList.toggle('active', section === 'workspaces');
  $('notificationsNavBtn')?.classList.toggle('active', section === 'notifications');
  $('dashboardPageTitle').textContent = ({ home: 'Dashboard', workspaces: 'Ruang Kerja Saya', notifications: 'Notifikasi' })[section] || 'Dashboard';
  
  if (section === 'notifications') {
    renderDashboardNotifications();
  }
}

function renderWorkspaceList(workspaces) {
  const cardMarkup = (ws) => `
    <div class="workspace-card" role="button" tabindex="0" onclick="openWorkspace('${ws.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openWorkspace('${ws.id}')}">
      <h3>${escapeHtml(ws.name)}</h3>
      <span class="role-badge ${ws.role}">${ws.role === 'mentor' ? 'MENTOR' : 'ANGGOTA'}</span>
    </div>`;
  const empty = '<p class="empty-hint">Belum ada ruang kerja. Silakan buat atau gabung terlebih dahulu.</p>';
  
  if ($('workspaceList')) {
    $('workspaceList').innerHTML = workspaces.length ? `<div class="workspace-grid">${workspaces.map(ws => cardMarkup(ws)).join('')}</div>` : empty;
  }
  if ($('dashboardWorkspacePreview')) {
    $('dashboardWorkspacePreview').innerHTML = workspaces.length ? `<div class="workspace-grid">${workspaces.slice(0, 3).map(ws => cardMarkup(ws)).join('')}</div>` : empty;
  }
}

function showWorkspaceView() {
  $('authView').classList.add('hidden');
  $('dashboardView').classList.add('hidden');
  $('workspaceView').classList.remove('hidden');
  $('workspaceTitle').textContent = state.workspaceName || 'Ruang Kerja';
  
  const isMentor = state.role === 'mentor';
  const divTab = $('tabDivisionView');
  if (divTab) divTab.classList.toggle('hidden', !isMentor);
  const taskLabel = $('tabTaskLabel');
  if (taskLabel) taskLabel.textContent = isMentor ? 'Papan Tugas' : 'Tugas Saya';
  
  $('mentorPanel').classList.toggle('hidden', !isMentor);
  $('mentorTaskCreator').classList.toggle('hidden', !isMentor);
  $('announceCreator').classList.toggle('hidden', !isMentor);
  renderAnnouncements();
  
  const dailyGoalSection = $('dailyGoalSection');
  if (dailyGoalSection) dailyGoalSection.classList.toggle('hidden', isMentor);
  
  $('roleControls').innerHTML = `<span>${isMentor ? 'Mentor / Admin' : 'Anggota'} · <strong>${escapeHtml(state.workerName)}</strong></span>`;
  switchWorkspaceTab('task');
}

function switchWorkspaceTab(tabName) {
  Object.entries(WS_TABS).forEach(([k, [panel, btn]]) => {
    $(panel)?.classList.toggle('hidden', k !== tabName);
    $(btn)?.classList.toggle('active', k === tabName);
  });
  if (tabName === 'division') renderDivisionManagement();
  if (tabName === 'calendar') renderCalendar();
}

function toggleAuthMode() {
  const isLogin = !$('loginForm').classList.contains('hidden');
  $('loginForm').classList.toggle('hidden', isLogin);
  $('registerForm').classList.toggle('hidden', !isLogin);
  if (isLogin) {
    $('authTitle').innerHTML = 'Buat <span>Akun Baru</span>';
    $('authSubtitle').textContent = 'Daftar untuk mulai mengelola ruang kerja Anda.';
  } else {
    $('authTitle').innerHTML = 'Selamat <span>Datang</span>';
    $('authSubtitle').textContent = 'Masuk untuk mengakses dashboard Anda.';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = '⏳ Masuk...';
  try {
    await setPersistence(auth, $('rememberMe').checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    alert('Gagal masuk: ' + (err.code || err.message));
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = $('registerName').value.trim();
  const email = $('registerEmail').value.trim();
  const password = $('registerPassword').value;
  const btn = $('registerBtn');
  btn.disabled = true; btn.textContent = '⏳ Mendaftar...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      email, displayName: name, workspaceIds: [], createdAt: serverTimestamp()
    });
  } catch (err) {
    alert('Gagal daftar: ' + (err.code || err.message));
  } finally {
    btn.disabled = false; btn.textContent = 'Daftar';
  }
}

async function handleLogout() {
  if (!confirm('Keluar dari akun?')) return;
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  await signOut(auth);
}

async function loadUserWorkspaces() {
  const list = $('workspaceList');
  if (list) list.innerHTML = '<p class="empty-hint">Memuat daftar ruang kerja...</p>';
  try {
    const userSnap = await getDoc(doc(db, 'users', state.user.uid));
    const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
    if (!ids.length) {
      dashboardWorkspaces = [];
      dashboardNotifications = [];
      renderWorkspaceList([]);
      renderDashboardNotifications();
      return;
    }
    const workspaces = await Promise.all(ids.map(async id => {
      const wsSnap = await getDoc(doc(db, 'workspaces', id));
      if (!wsSnap.exists()) return null;
      const memberSnap = await getDoc(doc(db, 'workspaces', id, 'members', state.user.uid));
      if (!memberSnap.exists()) return null;
      const member = memberSnap.data();
      let tasks = [];
      try {
        const taskSnap = await getDocs(collection(db, 'workspaces', id, 'tasks'));
        tasks = taskSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('Ringkasan gagal:', e); }
      return { id, ...wsSnap.data(), role: member.role || 'worker', workerName: member.name, tasks, stats: summarizeTasks(tasks, member.role || 'worker', member.name) };
    }));
    dashboardWorkspaces = workspaces.filter(Boolean);
    
    syncDeadlineNotifications();

    renderWorkspaceList(dashboardWorkspaces);
    renderDashboardNotifications();
  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = `<p class="empty-hint">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

async function handleCreateWorkspace(e) {
  e.preventDefault();
  const name = $('newWorkspaceName').value.trim();
  const codeInput = ($('newWorkspaceCode')?.value || '').trim().toUpperCase();
  const drive = ($('newWorkspaceDrive')?.value || '').trim();
  if (!name || codeInput.length !== 6) return alert('Nama dan kode 6 karakter wajib diisi.');
  
  const btn = $('createWorkspaceSubmitBtn');
  btn.disabled = true; btn.textContent = '⏳ Membuat...';
  try {
    const existing = await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', codeInput), limit(1)));
    if (!existing.empty) return alert('Kode undangan sudah digunakan.');
    
    const uid = state.user.uid;
    const mentorName = state.user.displayName || 'Mentor';
    const wsRef = doc(collection(db, 'workspaces'));
    const batch = writeBatch(db);
    batch.set(wsRef, { name, ownerUid: uid, joinCode: codeInput, driveLink: drive ? safeUrl(drive) : '', createdAt: serverTimestamp() });
    batch.set(doc(db, 'workspaces', wsRef.id, 'members', uid), { uid, email: state.user.email, name: mentorName, role: 'mentor', division: 'Manajemen', joinedAt: serverTimestamp() });
    batch.set(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsRef.id) }, { merge: true });
    await batch.commit();
    
    state.workspaceId = wsRef.id;
    state.workspaceName = name;
    state.role = 'mentor';
    state.workerName = mentorName;
    $('createWorkspaceModal').classList.add('hidden');
    $('createWorkspaceForm').reset();
    showWorkspaceView();
    subscribeToWorkspace();
  } catch (err) {
    alert('Gagal membuat ruang kerja: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Buat Ruang Kerja';
  }
}

async function handleJoinWorkspace(e) {
  e.preventDefault();
  const code = $('joinCodeInput').value.trim().toUpperCase();
  if (code.length !== 6) return alert('Kode harus 6 karakter.');
  
  const btn = $('joinWorkspaceSubmitBtn');
  btn.disabled = true; btn.textContent = '⏳ Mencari...';
  try {
    const snap = await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', code), limit(1)));
    if (snap.empty) return alert('Kode undangan tidak valid.');
    const wsDoc = snap.docs[0];
    const wsData = wsDoc.data();
    const uid = state.user.uid;
    const myMemberRef = doc(db, 'workspaces', wsDoc.id, 'members', uid);
    const existingMe = await getDoc(myMemberRef);
    const myName = state.user.displayName || state.user.email.split('@')[0];
    
    if (existingMe.exists()) {
      await setDoc(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
      state.role = existingMe.data().role || 'worker';
      state.workerName = existingMe.data().name || myName;
    } else {
      const membersSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'members'));
      if (membersSnap.docs.filter(d => d.data().role === 'worker').length >= 20) return alert('Ruang kerja penuh.');
      const batch = writeBatch(db);
      batch.set(myMemberRef, { uid, email: state.user.email, name: myName, role: 'worker', division: 'Umum', joinedAt: serverTimestamp() });
      batch.set(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
      await batch.commit();
      state.role = 'worker'; justJoined = true;
      state.workerName = myName;
    }
    
    state.workspaceId = wsDoc.id;
    state.workspaceName = wsData.name;
    if (justJoined) { justJoined = false; logActivity('join', `${state.workerName} bergabung ke ruang kerja`); }
    $('joinWorkspaceModal').classList.add('hidden');
    $('joinWorkspaceForm').reset();
    showWorkspaceView();
    subscribeToWorkspace();
  } catch (err) {
    alert('Gagal bergabung: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Gabung Ruang Kerja';
  }
}

window.openWorkspace = async (workspaceId) => {
  try {
    const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
    if (!wsSnap.exists()) return alert('Ruang kerja tidak ditemukan.');
    const memberSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'members', state.user.uid));
    if (!memberSnap.exists()) return alert('Anda bukan anggota ruang kerja ini.');
    state.workspaceId = workspaceId;
    state.workspaceName = wsSnap.data().name;
    state.role = memberSnap.data().role;
    state.workerName = memberSnap.data().name || state.user.displayName || 'User';
    showWorkspaceView();
    subscribeToWorkspace();
  } catch (err) {
    alert('Gagal membuka ruang kerja: ' + err.message);
  }
};

function backToDashboard() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  state.workspaceId = null; state.workspaceName = null; state.role = null;
  pendingTaskId = null; activities = []; announcements = [];
  state.members = []; state.tasks = []; state.divisions = [];
  showDashboardView();
}

function subscribeToWorkspace() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];

  unsubscribers.push(onSnapshot(collection(db, 'workspaces', state.workspaceId, 'members'), (snap) => {
    state.members = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
    const me = state.members.find(m => m.id === state.user.uid);
    if (me) {
      state.workerName = me.name || state.workerName;
      if (me.role !== state.role) { state.role = me.role; showWorkspaceView(); }
    }
    renderTasks();
    if (!$('divisionManagementPanel').classList.contains('hidden')) renderDivisionManagement();
    updateAssigneeSelect();
    loadDailyGoal();
  }));

  unsubscribers.push(onSnapshot(collection(db, 'workspaces', state.workspaceId, 'divisions'), (snap) => {
    state.divisions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDivisionOptions();
    if (!$('divisionManagementPanel').classList.contains('hidden')) renderDivisionManagement();
  }));

  unsubscribers.push(onSnapshot(query(collection(db, 'workspaces', state.workspaceId, 'tasks'), orderBy('createdAt', 'desc')), (snap) => {
    state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    afterTasksUpdate();
    renderTasks();
  }));

  unsubscribers.push(onSnapshot(query(collection(db, 'workspaces', state.workspaceId, 'activities'), orderBy('at', 'desc'), limit(100)), (snap) => {
    activities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderActivities();
  }, err => console.warn('Aktivitas gagal dimuat:', err)));

  unsubscribers.push(onSnapshot(query(collection(db, 'workspaces', state.workspaceId, 'announcements'), orderBy('createdAt', 'desc')), (snap) => {
    announcements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnnouncements();
  }, err => console.warn('Pengumuman gagal dimuat:', err)));

  unsubscribers.push(onSnapshot(doc(db, 'workspaces', state.workspaceId), (docSnap) => {
    if (docSnap.exists()) {
      state.driveLink = docSnap.data().driveLink || '';
      updateDriveStatus();
    }
  }));
}

function updateAssigneeSelect() {
  const select = $('taskAssignee');
  if (!select) return;
  const workers = state.members.filter(m => m.role === 'worker');
  const fa = $('filterAssignee');
  if (fa) {
    const pv = fa.value;
    fa.innerHTML = '<option value="">Semua anggota</option>' + workers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    fa.value = pv; fa.classList.toggle('hidden', state.role !== 'mentor');
  }
  const prev = select.value;
  select.innerHTML = workers.length ? workers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('') : '<option value="">(Belum ada pekerja)</option>';
  if (prev && [...select.options].some(o => o.value === prev)) select.value = prev;
}

function updateDriveStatus(liveValue = null) {
  const statusEl = $('driveStatusText');
  const inputEl = $('driveLinkInput');
  if (!statusEl) return;
  const currentVal = liveValue !== null ? liveValue.trim() : (state.driveLink || '').trim();
  const savedVal = (state.driveLink || '').trim();
  if (!currentVal) {
    statusEl.textContent = 'Belum ada folder yang tertaut.';
    statusEl.classList.remove('linked');
  } else {
    const href = safeUrl(currentVal);
    statusEl.innerHTML = href ? `✅ Folder tertaut: <a href="${escapeHtml(href)}" target="_blank" style="color:inherit;text-decoration:underline;">${escapeHtml(currentVal)}</a>` : '⚠️ Tautan tidak valid';
    statusEl.classList.add('linked');
  }
  if (liveValue === null && inputEl && document.activeElement !== inputEl) inputEl.value = savedVal;
}

function renderDivisionOptions() {
  const selectDiv = $('editMemberDivision');
  if (!selectDiv) return;
  selectDiv.innerHTML = '<option value="Umum">Umum</option>' + state.divisions.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
}

function renderTasks() {
  const tbody = $('taskTableBody');
  if (!tbody) return;
  
  let filteredTasks = state.role === 'worker' ? state.tasks.filter(t => t.assignee === state.workerName) : [...state.tasks];
  renderDeadlineBanner(filteredTasks);
  filteredTasks = applyTaskFilters(filteredTasks);
  
  if (filteredTasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#6b7280;">Belum ada tugas dalam daftar.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredTasks.map(task => {
    const lv = dueLevel(task), prog = subProgress(task);
    const isOverdue = task.endDate && new Date(task.endDate + 'T23:59:59') < new Date() && task.status !== 'done';
    
    let statusText = 'Belum Mulai';
    let statusClass = 's-todo';
    
    if (task.status === 'progress') {
      if (task.revisionNotes) {
        statusText = 'Revisi';
        statusClass = 's-review';
      } else {
        statusText = 'Berjalan';
        statusClass = 's-progress';
      }
    } else if (task.status === 'review') {
      statusText = 'Revisi';
      statusClass = 's-review';
    } else if (task.status === 'done') {
      statusText = 'Selesai';
      statusClass = 's-done';
    }

    const shortDesc = task.desc ? (task.desc.length > 60 ? task.desc.substring(0, 60) + '...' : task.desc) : '-';

    return `
      <tr class="${lv ? 'row-due-' + lv : ''}" onclick="openTaskDetailModal('${task.id}')">
        <td><div style="font-weight:600; font-size:0.9rem;">${escapeHtml(task.title)}${(task.attachments || []).length ? ` <span class="clip-count" title="Lampiran">📎${task.attachments.length}</span>` : ''}</div>${prog ? progressBar(prog) : ''}</td>
        <td class="task-desc-cell"><div class="task-desc" title="${escapeHtml(task.desc || '')}">${escapeHtml(shortDesc)}</div></td>
        <td style="font-size:0.85rem; color:#4b5563;">${escapeHtml(task.assignee)}</td>
        <td class="col-center">
          <span class="stat-pill diff-${(task.difficulty || 'sedang').toLowerCase()}">${(task.difficulty || 'Sedang').charAt(0).toUpperCase() + (task.difficulty || 'sedang').slice(1)}</span>
        </td>
        <td class="col-center">
          <span class="stat-pill ${statusClass}">${statusText}${isOverdue ? ' (Terlambat)' : ''}</span>
        </td>
        <td style="font-size:0.85rem; color:${isOverdue ? '#dc2626' : '#4b5563'}; font-weight:${isOverdue ? '600' : '400'};">
          ${escapeHtml(task.endDate || '-')}${lv ? ` <span class="due-badge due-${lv}">${dueLabel(task)}</span>` : ''}
        </td>
      </tr>`;
  }).join('');
}

/* =========================================
   PERBAIKAN 1: Modal Detail Tugas dengan Tombol Aksi yang Berfungsi
   Semua fungsi global dipasang di window agar bisa diakses dari onclick
========================================= */
window.openTaskDetailModal = (taskId) => {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  $('detailTaskTitle').textContent = task.title;
  $('detailTaskAssignee').textContent = task.assignee;
  { const lv = dueLevel(task);
    $('detailTaskDates').innerHTML = `📅 ${escapeHtml(task.startDate || '?')} s/d ${escapeHtml(task.endDate || '?')}` + (lv ? ` <span class="due-badge due-${lv}">${dueLabel(task)}</span>` : ''); }
  $('detailTaskDesc').textContent = task.desc || 'Tidak ada deskripsi tambahan.';
  
  let statusText = 'Belum Mulai';
  let statusClass = 's-todo';
  if (task.status === 'progress') { statusText = task.revisionNotes ? 'Revisi' : 'Berjalan'; statusClass = task.revisionNotes ? 's-review' : 's-progress'; }
  else if (task.status === 'review') { statusText = 'Revisi'; statusClass = 's-review'; }
  else if (task.status === 'done') { statusText = 'Selesai'; statusClass = 's-done'; }
  
  $('detailTaskStatus').className = `stat-pill ${statusClass}`;
  $('detailTaskStatus').textContent = statusText;
  
  const diff = (task.difficulty || 'sedang').toLowerCase();
  $('detailTaskDifficulty').className = `stat-pill diff-${diff}`;
  $('detailTaskDifficulty').textContent = diff.charAt(0).toUpperCase() + diff.slice(1);

  const driveHref = safeUrl(task.reportFileLink || (task.driveSource === 'workspace' ? state.driveLink : ''));
  $('detailTaskDrive').innerHTML = driveHref 
    ? `<a href="${escapeHtml(driveHref)}" target="_blank" rel="noopener noreferrer" class="btn-drive-modal">🔗 Buka Tautan Drive</a>` 
    : '<span style="color:var(--text-faint); font-size: 0.85rem;">Belum ada tautan</span>';

  const revBox = $('detailRevisionBox');
  if (task.revisionNotes) {
    revBox.classList.remove('hidden');
    $('detailRevisionNotes').textContent = task.revisionNotes;
  } else {
    revBox.classList.add('hidden');
  }

  const histList = $('detailHistoryList');
  const history = task.history || [];
  if (history.length > 0) {
    const label = { laporan: '📤 Laporan', revisi: '↩ Revisi', selesai: '✅ Divalidasi' };
    histList.innerHTML = [...history].sort((a, b) => b.at - a.at).map(h => `
      <div class="hist-item hist-${escapeHtml(h.type)}">
        <div class="hist-head"><strong>${label[h.type] || h.type}</strong> · ${escapeHtml(h.by || '')} <span>${new Date(h.at).toLocaleString('id-ID')}</span></div>
        ${h.text ? `<div style="margin-top:4px;">${escapeHtml(h.text)}</div>` : ''}
      </div>`).join('');
  } else {
    histList.innerHTML = '<p class="empty-hint">Belum ada riwayat.</p>';
  }

  // Render tombol aksi berdasarkan role dan status tugas
  const actionContainer = $('detailActionButtons');
  actionContainer.innerHTML = '';
  
  const isWorker = state.role === 'worker' && task.assignee === state.workerName;
  const isMentor = state.role === 'mentor';

  if (isWorker && task.status === 'todo') {
    actionContainer.innerHTML = `
      <button class="btn-sm" onclick="window.moveTask('${task.id}','progress'); window.closeTaskDetailModal()">▶ Mulai Dikerjakan</button>
    `;
  } else if (isWorker && task.status === 'progress') {
    actionContainer.innerHTML = `
      <button class="btn-sm" onclick="window.openReportModalFromDetail('${task.id}')">📤 Kirim Laporan</button>
    `;
  } else if (isMentor && task.status === 'review') {
    actionContainer.innerHTML = `
      <div class="action-group">
        <button class="btn-sm btn-warning" onclick="window.openReviewModalFromDetail('${task.id}', true)">↩ Minta Revisi</button>
        <button class="btn-sm btn-success" onclick="window.openReviewModalFromDetail('${task.id}', false)">✅ Validasi Selesai</button>
      </div>
    `;
  } else if (isMentor && task.status === 'done') {
    actionContainer.innerHTML = `
      <div class="action-group">
        <button class="btn-sm btn-ghost" onclick="window.openEditTaskModal('${task.id}'); window.closeTaskDetailModal()">✏️ Edit</button>
        <button class="btn-sm btn-warning" onclick="window.moveTask('${task.id}','review'); window.closeTaskDetailModal()">↩ Buka Kembali</button>
        <button class="btn-sm btn-warning" onclick="window.deleteTask('${task.id}'); window.closeTaskDetailModal()">🗑 Hapus</button>
      </div>
    `;
  } else if (isMentor) {
    actionContainer.innerHTML = `
      <div class="action-group">
        <button class="btn-sm btn-ghost" onclick="window.openEditTaskModal('${task.id}'); window.closeTaskDetailModal()">✏️ Edit Tugas</button>
        <button class="btn-sm btn-warning" onclick="window.deleteTask('${task.id}'); window.closeTaskDetailModal()">🗑 Hapus</button>
      </div>
    `;
  }

  currentDetailId = task.id;
  renderTaskExtras(task);
  $('taskDetailModal').classList.remove('hidden');
};

// Fungsi global untuk menutup modal
window.closeTaskDetailModal = () => {
  $('taskDetailModal').classList.add('hidden');
};

// Fungsi global untuk membuka modal laporan dari detail
window.openReportModalFromDetail = (taskId) => {
  window.closeTaskDetailModal();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const link = prompt("Masukkan tautan Google Drive bukti pekerjaan:");
  if (link === null) return;
  if (!safeUrl(link)) return alert('Tautan harus diawali http:// atau https://');
  
  const notes = prompt("Catatan progres (opsional):") || '';
  
  updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
    status: 'review',
    reportFileLink: link,
    reportNotes: notes,
    history: arrayUnion({ type: 'laporan', by: state.workerName, text: notes, link: link, at: Date.now() }),
    revisionNotes: '',
    updatedAt: serverTimestamp()
  }).then(() => {
    logActivity('report', `${state.workerName} mengirim laporan “${task.title}”`, taskId);
    notify(mentorUids(), { kind: 'report', title: `${state.workerName} mengirim laporan`, body: task.title, taskId });
    alert('✅ Laporan terkirim ke Mentor!');
  });
};

// Fungsi global untuk membuka modal review dari detail
window.openReviewModalFromDetail = (taskId, isRevision) => {
  window.closeTaskDetailModal();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  if (isRevision) {
    const notes = prompt("Masukkan catatan revisi untuk pekerja:");
    if (notes === null) return;
    if (!notes.trim()) return alert('Catatan revisi wajib diisi.');
    
    updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
      status: 'progress',
      revisionNotes: notes,
      history: arrayUnion({ type: 'revisi', by: state.workerName, text: notes, at: Date.now() }),
      updatedAt: serverTimestamp()
    }).then(() => {
      logActivity('revision', `${state.workerName} meminta revisi “${task.title}”`, taskId);
      notify([memberUid(task.assignee)], { kind: 'revision', title: 'Tugas perlu revisi', body: task.title, taskId });
      alert('↩ Catatan revisi dikirimkan ke pekerja!');
    });
  } else {
    const notes = prompt("Catatan validasi (opsional, kosongkan jika sempurna):") || '';
    
    updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
      status: 'done',
      revisionNotes: '',
      history: arrayUnion({ type: 'selesai', by: state.workerName, text: notes, at: Date.now() }),
      updatedAt: serverTimestamp()
    }).then(() => {
      logActivity('done', `${state.workerName} memvalidasi “${task.title}” selesai`, taskId);
      notify([memberUid(task.assignee)], { kind: 'done', title: 'Tugas divalidasi selesai', body: task.title, taskId });
      alert('✅ Tugas divalidasi selesai!');
    });
  }
};

// Fungsi global untuk memindahkan status tugas
window.moveTask = async (taskId, newStatus) => {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const ok = (state.role === 'worker' && t.assignee === state.workerName && t.status === 'todo' && newStatus === 'progress')
    || (state.role === 'mentor' && t.status === 'done' && newStatus === 'review');
  if (!ok) return alert('Perubahan status ini tidak diizinkan.');
  try {
    await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), { status: newStatus, updatedAt: serverTimestamp() });
    if (newStatus === 'progress') logActivity('start', `${state.workerName} mulai mengerjakan “${t.title}”`, taskId);
    else { logActivity('reopen', `${state.workerName} membuka kembali “${t.title}”`, taskId); notify([memberUid(t.assignee)], { kind: 'revision', title: 'Tugas dibuka kembali', body: t.title, taskId }); }
  } catch (err) { alert('Gagal: ' + err.message); }
};

// Fungsi global untuk menghapus tugas
window.deleteTask = async (id) => {
  if (state.role !== 'mentor' || !confirm('Hapus tugas ini? Tindakan tidak bisa dibatalkan.')) return;
  try {
    const t = state.tasks.find(x => x.id === id);
    await Promise.all((t?.attachments || []).map(f => deleteObject(sRef(storage, f.path)).catch(() => {})));
    await deleteDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', id));
    if (t) logActivity('delete', `${state.workerName} menghapus tugas “${t.title}”`);
  }
  catch (err) { alert('Gagal: ' + err.message); }
};

// Fungsi global untuk membuka modal edit tugas
window.openEditTaskModal = (id) => {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  // Buat modal edit sederhana menggunakan prompt untuk konsistensi
  const newTitle = prompt("Judul tugas:", t.title);
  if (newTitle === null) return;
  const newDesc = prompt("Deskripsi:", t.desc || '');
  if (newDesc === null) return;
  
  updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', id), {
    title: newTitle.trim(),
    desc: newDesc.trim(),
    updatedAt: serverTimestamp()
  }).then(() => alert('✅ Tugas diperbarui!'));
};

function loadDailyGoal() {
  const me = state.members.find(m => m.id === state.user?.uid);
  const today = localDate();
  const display = $('dailyGoalDisplay');
  if (!display) return;
  if (me && me.goalDate === today && me.dailyGoal) {
    display.textContent = `🎯 ${me.dailyGoal}`;
  } else {
    display.textContent = '';
  }
}

function setDefaultDates() {
  const startEl = $('startDate');
  const endEl = $('endDate');
  if (startEl) startEl.value = localDate();
  if (endEl) endEl.value = localDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

function renderDivisionManagement() {
  const divListContainer = $('divisionListContainer');
  if (divListContainer) {
    divListContainer.innerHTML = state.divisions.length === 0 ? '<p class="empty-hint">Belum ada divisi terdaftar.</p>' :
      state.divisions.map(d => {
        const countEmp = state.members.filter(m => m.division === d.name).length;
        return `<div style="border:1px solid #e5e7eb; padding:12px; border-radius:8px; margin-bottom:10px; background:#fff; display:flex; justify-content:space-between; align-items:center;">
          <div><h4 style="margin:0; font-size:1rem;">${escapeHtml(d.name)}</h4><p style="margin:4px 0 0; font-size:0.8rem; color:#6b7280;">${escapeHtml(d.desc || 'Tidak ada deskripsi.')}</p></div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:600;">${countEmp} Anggota</span>
            <button class="btn-sm btn-warning" onclick="deleteDivision('${d.id}')" style="font-size:0.7rem;">Hapus</button>
          </div>
        </div>`;
      }).join('');
  }
  
  const tableBody = $('memberSettingsTableBody');
  if (tableBody) {
    tableBody.innerHTML = state.members.map(m => `
      <tr>
        <td style="padding:10px; font-weight:500;">${escapeHtml(m.name)}</td>
        <td style="padding:10px; color:#6b7280; font-size:0.85rem;">${escapeHtml(m.email)}</td>
        <td class="col-center" style="padding:10px;"><span class="role-badge ${m.role}">${m.role === 'mentor' ? 'Mentor' : 'Anggota'}</span></td>
        <td class="col-divisi" style="padding:10px;">${escapeHtml(m.division || 'Umum')}</td>
        <td class="col-center" style="padding:10px;">
          <div style="display:inline-flex; flex-direction:row; gap:0.5rem; align-items:center; justify-content:center; flex-wrap:nowrap;">
            <button class="btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button>
            ${m.id !== state.user.uid ? `<button class="btn-sm btn-warning" onclick="removeMember('${m.id}')">Keluarkan</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
  }
}

window.deleteDivision = async (divId) => {
  if (!confirm('Hapus divisi ini? Anggota akan dipindahkan ke "Umum".')) return;
  try {
    const batch = writeBatch(db);
    const div = state.divisions.find(d => d.id === divId);
    if (div) {
      state.members.filter(m => m.division === div.name).forEach(m => batch.update(doc(db, 'workspaces', state.workspaceId, 'members', m.id), { division: 'Umum' }));
    }
    batch.delete(doc(db, 'workspaces', state.workspaceId, 'divisions', divId));
    await batch.commit();
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.openEditMemberModal = (memberId) => {
  const mem = state.members.find(m => m.id === memberId);
  if (!mem) return;
  $('editMemberId').value = mem.id;
  $('editMemberNameDisplay').value = mem.name;
  $('editMemberRole').value = mem.role;
  $('editMemberDivision').value = mem.division || 'Umum';
  $('editMemberModal').classList.remove('hidden');
};

window.removeMember = async (memberId) => {
  const m = state.members.find(x => x.id === memberId);
  if (!m || memberId === state.user.uid || !confirm(`Keluarkan ${m.name}?`)) return;
  try { await deleteDoc(doc(db, 'workspaces', state.workspaceId, 'members', memberId)); }
  catch (err) { alert('Gagal: ' + err.message); }
};

async function leaveWorkspace() {
  if (state.role === 'mentor' && state.members.filter(m => m.role === 'mentor').length <= 1) return alert('Anda mentor terakhir.');
  if (!confirm('Keluar dari ruang kerja ini?')) return;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'workspaces', state.workspaceId, 'members', state.user.uid));
    batch.set(doc(db, 'users', state.user.uid), { workspaceIds: arrayRemove(state.workspaceId) }, { merge: true });
    await batch.commit();
    backToDashboard();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function changeJoinCode() {
  const input = prompt('Kode undangan baru (6 huruf/angka). Kosongkan untuk acak:');
  if (input === null) return;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = (input.trim() || Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return alert('Kode harus 6 huruf/angka.');
  try {
    if (!(await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', code), limit(1)))).empty) return alert('Kode sudah dipakai.');
    await updateDoc(doc(db, 'workspaces', state.workspaceId), { joinCode: code });
    alert('✅ Kode diganti menjadi ' + code);
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function deleteWorkspace() {
  const typed = prompt(`Hapus ruang kerja? Ketik "${state.workspaceName}" untuk konfirmasi:`);
  if (typed !== state.workspaceName) return alert('Nama tidak cocok.');
  try {
    const refs = [];
    for (const sub of ['tasks', 'divisions', 'members', 'activities', 'announcements']) {
      (await getDocs(collection(db, 'workspaces', state.workspaceId, sub))).forEach(d => refs.push(d.ref));
    }
    refs.push(doc(db, 'workspaces', state.workspaceId));
    unsubscribers.forEach(u => u()); unsubscribers = [];
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach(r => batch.delete(r));
      await batch.commit();
    }
    await setDoc(doc(db, 'users', state.user.uid), { workspaceIds: arrayRemove(state.workspaceId) }, { merge: true });
    backToDashboard();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function renameUser(newName, oldName) {
  await updateProfile(auth.currentUser, { displayName: newName });
  const userSnap = await getDoc(doc(db, 'users', state.user.uid));
  const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
  await setDoc(doc(db, 'users', state.user.uid), { displayName: newName }, { merge: true });
  for (const id of ids) {
    const mRef = doc(db, 'workspaces', id, 'members', state.user.uid);
    if (!(await getDoc(mRef)).exists()) continue;
    const tasks = await getDocs(query(collection(db, 'workspaces', id, 'tasks'), where('assignee', '==', oldName)));
    const batch = writeBatch(db);
    batch.update(mRef, { name: newName });
    tasks.forEach(t => batch.update(t.ref, { assignee: newName }));
    await batch.commit();
  }
  state.user = auth.currentUser;
  $('topbarUserName').textContent = newName;
}

/* =========================================
   FITUR BARU — Aktivitas, Notifikasi, Sub-tugas, Tenggat,
   Kalender, Lampiran, Pengumuman
========================================= */
const MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'];
const WS_TABS = {
  task: ['mainTaskContainer', 'tabTaskView'], calendar: ['calendarPanel', 'tabCalendarView'],
  activity: ['activityPanel', 'tabActivityView'], announce: ['announcementPanel', 'tabAnnouncementView'],
  division: ['divisionManagementPanel', 'tabDivisionView']
};
let notifications = [], notifUnsub = null, pendingTaskId = null, currentDetailId = null, justJoined = false;
let activities = [], announcements = [], calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1), calExpanded = null;

const taskRef = (id) => doc(db, 'workspaces', state.workspaceId, 'tasks', id);
const newId = () => Math.random().toString(36).slice(2, 9);
const fmtTime = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'baru saja';
};
const fmtSize = (b) => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fileIcon = (n) => {
  const e = (n.split('.').pop() || '').toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e) ? '🖼' : e === 'pdf' ? '📕' : e === 'zip' ? '🗜' : ['xls', 'xlsx', 'csv'].includes(e) ? '📊' : '📄';
};
const memberUid = (name) => state.members.find(m => m.name === name)?.id;
const mentorUids = () => state.members.filter(m => m.role === 'mentor').map(m => m.id);

/* ---------- Deadline warning ---------- */
function daysLeft(t) {
  if (!t.endDate) return null;
  return Math.round((new Date(t.endDate + 'T00:00:00') - new Date(localDate() + 'T00:00:00')) / 864e5);
}
function dueLevel(t) {
  if (t.status === 'done') return null;
  const d = daysLeft(t);
  return d === null ? null : d < 0 ? 'overdue' : d <= 1 ? 'urgent' : d <= 3 ? 'soon' : null;
}
function dueLabel(t) {
  const d = daysLeft(t);
  return d < 0 ? `Terlambat ${-d} hari` : d === 0 ? 'Hari ini' : d === 1 ? 'Besok' : `H-${d}`;
}
function renderDeadlineBanner(tasks) {
  const el = $('deadlineBanner'); if (!el) return;
  const o = tasks.filter(t => dueLevel(t) === 'overdue').length;
  const u = tasks.filter(t => ['urgent', 'soon'].includes(dueLevel(t))).length;
  if (!o && !u) return el.classList.add('hidden');
  el.className = 'deadline-banner ' + (o ? 'due-overdue' : 'due-urgent');
  el.textContent = [o ? `${o} tugas melewati tenggat` : '', u ? `${u} tugas mendekati tenggat (3 hari ke depan)` : ''].filter(Boolean).join(' dan ');
}

/* ---------- Aktivitas ---------- */
const ACT_ICON = { task: '🆕', start: '▶', report: '📤', revision: '↩', done: '✅', reopen: '🔄', delete: '🗑', file: '📎', join: '👋', announce: '📢', subtask: '☑' };
function logActivity(type, text, taskId = null) {
  if (!state.workspaceId) return;
  addDoc(collection(db, 'workspaces', state.workspaceId, 'activities'), {
    type, text, taskId, by: state.workerName || '', uid: state.user.uid, at: serverTimestamp()
  }).catch(e => console.warn('Aktivitas gagal dicatat:', e));
}
function renderActivities() {
  const el = $('activityList'); if (!el) return;
  el.innerHTML = activities.length ? activities.map(a => `
    <div class="act-item act-${escapeHtml(a.type)}">
      <span class="act-icon">${ACT_ICON[a.type] || '•'}</span>
      <div><div>${escapeHtml(a.text)}</div><span class="act-time">${fmtTime(a.at)}</span></div>
    </div>`).join('') : '<p class="empty-hint">Belum ada aktivitas. Aktivitas baru akan muncul di sini.</p>';
}

/* ---------- Notification center ---------- */
const NOTIF_ICON = { task: '🆕', report: '📤', revision: '↩', done: '✅', announce: '📢', file: '📎', due: '⏰' };
function notify(uids, data) {
  [...new Set(uids)].filter(u => u && u !== state.user.uid).forEach(uid => {
    addDoc(collection(db, 'users', uid, 'notifications'), {
      ...data, workspaceId: state.workspaceId, workspaceName: state.workspaceName, read: false, createdAt: serverTimestamp()
    }).catch(e => console.warn('Notifikasi gagal dikirim:', e));
  });
}
function startNotifications() {
  stopNotifications();
  notifUnsub = onSnapshot(query(collection(db, 'users', state.user.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(60)), (snap) => {
    notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNotifications();
  }, err => console.warn('Notifikasi gagal dimuat:', err));
}
function stopNotifications() {
  if (notifUnsub) { notifUnsub(); notifUnsub = null; }
  notifications = []; renderNotifications();
}
function renderNotifications() {
  const unread = notifications.filter(n => !n.read).length;
  const badge = $('notifBadge');
  if (badge) { badge.textContent = unread > 99 ? '99+' : unread; badge.classList.toggle('hidden', !unread); }
  const list = $('dashboardNotificationsList'); if (!list) return;
  $('markAllReadBtn')?.classList.toggle('hidden', !unread);
  list.innerHTML = notifications.length ? notifications.map(n => `
    <button type="button" class="notif-item ${n.read ? '' : 'unread'}" onclick="openNotification('${n.id}')">
      <span class="notif-icon">${NOTIF_ICON[n.kind] || '🔔'}</span>
      <span class="notif-copy"><strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.body || '')}</span><small>${escapeHtml(n.workspaceName || '')} · ${fmtTime(n.createdAt)}</small></span>
      ${n.read ? '' : '<span class="notif-dot" aria-label="Belum dibaca"></span>'}
    </button>`).join('') : '<p class="empty-hint">Belum ada notifikasi. Tugas baru, laporan, pengumuman, dan tenggat akan muncul di sini.</p>';
}
function renderDashboardNotifications() { renderNotifications(); }
async function markAllRead() {
  const un = notifications.filter(n => !n.read); if (!un.length) return;
  const b = writeBatch(db);
  un.forEach(n => b.update(doc(db, 'users', state.user.uid, 'notifications', n.id), { read: true }));
  try { await b.commit(); } catch (err) { alert('Gagal: ' + err.message); }
}
window.openNotification = async (id) => {
  const n = notifications.find(x => x.id === id); if (!n) return;
  if (!n.read) updateDoc(doc(db, 'users', state.user.uid, 'notifications', id), { read: true }).catch(() => {});
  if (!n.workspaceId) return;
  pendingTaskId = n.taskId || null;
  await window.openWorkspace(n.workspaceId);
  if (state.workspaceId !== n.workspaceId) { pendingTaskId = null; return; }
  if (n.kind === 'announce') switchWorkspaceTab('announce');
};
// Notifikasi tenggat dibuat sekali per tugas per tingkat peringatan (id deterministik)
async function syncDeadlineNotifications() {
  const items = [];
  dashboardWorkspaces.forEach(ws => (ws.tasks || []).forEach(t => {
    if (ws.role !== 'mentor' && t.assignee !== ws.workerName) return;
    const lv = dueLevel(t);
    if (lv) items.push({ ws, t, lv });
  }));
  await Promise.all(items.map(async ({ ws, t, lv }) => {
    const ref = doc(db, 'users', state.user.uid, 'notifications', `due_${t.id}_${lv}`);
    try {
      if ((await getDoc(ref)).exists()) return;
      await setDoc(ref, {
        kind: 'due', title: lv === 'overdue' ? 'Tugas melewati tenggat' : 'Tenggat mendekat',
        body: `${t.title} · ${dueLabel(t)}`, workspaceId: ws.id, workspaceName: ws.name, taskId: t.id, read: false, createdAt: serverTimestamp()
      });
    } catch (e) { console.warn('Notifikasi tenggat gagal:', e); }
  }));
}

/* ---------- Sub-tugas & progres otomatis ---------- */
const subProgress = (t) => {
  const s = t.subtasks || []; if (!s.length) return null;
  const d = s.filter(x => x.done).length;
  return { done: d, total: s.length, pct: Math.round(d / s.length * 100) };
};
const progressBar = (p) => `<div class="progress-row"><div class="progress-track"><div class="progress-fill ${p.pct === 100 ? 'full' : ''}" style="width:${p.pct}%"></div></div><span>${p.pct}%</span></div>`;
const parseSubtasks = (text) => text.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 30).map(x => ({ id: newId(), text: x.slice(0, 120), done: false }));
const canEditTask = (t) => state.role === 'mentor' || (state.role === 'worker' && t.assignee === state.workerName);

window.toggleSubtask = async (taskId, subId, checked) => {
  const t = state.tasks.find(x => x.id === taskId); if (!t || !canEditTask(t)) return;
  const before = subProgress(t);
  const subtasks = (t.subtasks || []).map(s => s.id === subId ? { ...s, done: checked } : s);
  try {
    await updateDoc(taskRef(taskId), { subtasks, updatedAt: serverTimestamp() });
    if (checked && subtasks.every(s => s.done) && before.pct < 100) logActivity('subtask', `${state.workerName} menyelesaikan semua sub-tugas “${t.title}”`, taskId);
  } catch (err) { alert('Gagal: ' + err.message); }
};
window.deleteSubtask = async (taskId, subId) => {
  const t = state.tasks.find(x => x.id === taskId); if (!t || state.role !== 'mentor') return;
  try { await updateDoc(taskRef(taskId), { subtasks: (t.subtasks || []).filter(s => s.id !== subId), updatedAt: serverTimestamp() }); }
  catch (err) { alert('Gagal: ' + err.message); }
};
async function addSubtaskFromModal() {
  const t = state.tasks.find(x => x.id === currentDetailId); const input = $('subtaskInput');
  const text = input.value.trim(); if (!t || !text || state.role !== 'mentor') return;
  if ((t.subtasks || []).length >= 30) return alert('Maksimal 30 sub-tugas.');
  try { await updateDoc(taskRef(t.id), { subtasks: [...(t.subtasks || []), { id: newId(), text: text.slice(0, 120), done: false }], updatedAt: serverTimestamp() }); input.value = ''; }
  catch (err) { alert('Gagal: ' + err.message); }
}

/* ---------- Detail tugas: sub-tugas & lampiran ---------- */
function renderTaskExtras(task) {
  const isMentor = state.role === 'mentor', canEdit = canEditTask(task);
  const subs = task.subtasks || [], p = subProgress(task);
  $('detailSubtaskBox').classList.toggle('hidden', !subs.length && !isMentor);
  $('detailProgressFill').style.width = (p ? p.pct : 0) + '%';
  $('detailProgressFill').classList.toggle('full', !!p && p.pct === 100);
  $('detailProgressText').textContent = p ? `${p.done}/${p.total} · ${p.pct}%` : '0%';
  $('detailSubtaskAdd').classList.toggle('hidden', !isMentor);
  $('detailSubtaskList').innerHTML = subs.length ? subs.map(s => `
    <label class="subtask-item ${s.done ? 'done' : ''}">
      <input type="checkbox" ${s.done ? 'checked' : ''} ${canEdit ? '' : 'disabled'} onchange="toggleSubtask('${task.id}','${s.id}',this.checked)" />
      <span>${escapeHtml(s.text)}</span>
      ${isMentor ? `<button type="button" class="icon-del" title="Hapus sub-tugas" onclick="event.preventDefault();deleteSubtask('${task.id}','${s.id}')">×</button>` : ''}
    </label>`).join('') : '<p class="empty-hint">Belum ada sub-tugas.</p>';

  const files = task.attachments || [];
  $('attachUploader').classList.toggle('hidden', !canEdit);
  $('detailAttachList').innerHTML = files.length ? files.map(f => {
    const href = safeUrl(f.url), canDel = isMentor || f.uid === state.user.uid;
    return `<div class="attach-item"><span>${fileIcon(f.name)}</span>
      <div class="attach-meta"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(f.name)}</a><small>${fmtSize(f.size)} · ${escapeHtml(f.by || '')} · ${fmtTime(f.at)}</small></div>
      ${canDel ? `<button type="button" class="icon-del" title="Hapus lampiran" onclick="deleteAttachment('${task.id}','${f.id}')">×</button>` : ''}</div>`;
  }).join('') : '<p class="empty-hint">Belum ada lampiran.</p>';
}
function afterTasksUpdate() {
  renderCalendar();
  if (currentDetailId && !$('taskDetailModal').classList.contains('hidden') && !$('attachProgress').classList.contains('uploading')) {
    if (state.tasks.some(t => t.id === currentDetailId)) window.openTaskDetailModal(currentDetailId);
    else window.closeTaskDetailModal();
  }
  if (pendingTaskId && state.tasks.some(t => t.id === pendingTaskId)) {
    const id = pendingTaskId; pendingTaskId = null; window.openTaskDetailModal(id);
  }
}

async function uploadAttachment(file) {
  const t = state.tasks.find(x => x.id === currentDetailId); if (!t || !canEditTask(t)) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return alert('Tipe file tidak didukung. Gunakan: ' + ALLOWED_EXT.join(', '));
  if (file.size > MAX_UPLOAD) return alert('Ukuran file maksimal 10 MB.');
  const id = newId(), path = `workspaces/${state.workspaceId}/tasks/${t.id}/${id}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const bar = $('attachProgress'), fill = $('attachProgressFill'), txt = $('attachProgressText');
  bar.classList.remove('hidden'); bar.classList.add('uploading'); fill.style.width = '0%'; txt.textContent = '0%';
  try {
    const task = uploadBytesResumable(sRef(storage, path), file);
    await new Promise((res, rej) => task.on('state_changed', (s) => {
      const pct = Math.round(s.bytesTransferred / s.totalBytes * 100); fill.style.width = pct + '%'; txt.textContent = pct + '%';
    }, rej, res));
    const url = await getDownloadURL(task.snapshot.ref);
    await updateDoc(taskRef(t.id), {
      attachments: arrayUnion({ id, name: file.name, size: file.size, type: file.type, url, path, by: state.workerName, uid: state.user.uid, at: Date.now() }),
      updatedAt: serverTimestamp()
    });
    logActivity('file', `${state.workerName} melampirkan “${file.name}” pada “${t.title}”`, t.id);
    notify(state.role === 'mentor' ? [memberUid(t.assignee)] : mentorUids(), { kind: 'file', title: 'Lampiran baru', body: `${file.name} · ${t.title}`, taskId: t.id });
  } catch (err) { alert('Gagal mengunggah: ' + (err.code || err.message)); }
  finally { bar.classList.remove('uploading'); bar.classList.add('hidden'); afterTasksUpdate(); }
}
window.deleteAttachment = async (taskId, fid) => {
  const t = state.tasks.find(x => x.id === taskId); const f = (t?.attachments || []).find(x => x.id === fid); if (!f) return;
  if (!(state.role === 'mentor' || f.uid === state.user.uid) || !confirm(`Hapus lampiran "${f.name}"?`)) return;
  try {
    await deleteObject(sRef(storage, f.path)).catch(e => { if (e.code !== 'storage/object-not-found') throw e; });
    await updateDoc(taskRef(taskId), { attachments: arrayRemove(f), updatedAt: serverTimestamp() });
  } catch (err) { alert('Gagal: ' + (err.code || err.message)); }
};

/* ---------- Kalender tenggat ---------- */
const chipClass = (t) => t.status === 'done' ? 'chip-done' : ({ overdue: 'due-overdue', urgent: 'due-urgent', soon: 'due-soon' }[dueLevel(t)] || 'chip-normal');
window.expandCalDay = (k) => { calExpanded = calExpanded === k ? null : k; renderCalendar(); };
function renderCalendar() {
  const grid = $('calGrid'); if (!grid || $('calendarPanel').classList.contains('hidden')) return;
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), today = localDate();
  $('calTitle').textContent = calMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const offset = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const tasks = (state.role === 'worker' ? state.tasks.filter(t => t.assignee === state.workerName) : state.tasks).filter(t => t.endDate);
  const byDay = {}; tasks.forEach(t => (byDay[t.endDate] = byDay[t.endDate] || []).push(t));
  let html = '<div class="cal-cell empty"></div>'.repeat(offset);
  for (let d = 1; d <= days; d++) {
    const key = localDate(new Date(y, m, d)), list = byDay[key] || [], max = key === calExpanded ? 99 : 3;
    html += `<div class="cal-cell ${key === today ? 'today' : ''}"><span class="cal-day">${d}</span>`
      + list.slice(0, max).map(t => `<button type="button" class="cal-chip ${chipClass(t)}" onclick="openTaskDetailModal('${t.id}')" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</button>`).join('')
      + (list.length > 3 ? `<button type="button" class="cal-more" onclick="expandCalDay('${key}')">${key === calExpanded ? 'Ringkas' : `+${list.length - 3} lagi`}</button>` : '') + '</div>';
  }
  grid.innerHTML = html;
}

/* ---------- Papan pengumuman ---------- */
function renderAnnouncements() {
  const el = $('announceList'); if (!el) return;
  const isMentor = state.role === 'mentor';
  const list = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  el.innerHTML = list.length ? list.map(a => `
    <article class="announce-item ${a.pinned ? 'pinned' : ''}">
      <div class="announce-head"><h4>${a.pinned ? '📌 ' : ''}${escapeHtml(a.title)}</h4>
        ${isMentor ? `<div class="announce-actions">
          <button type="button" class="btn-sm btn-ghost" onclick="togglePinAnnouncement('${a.id}')">${a.pinned ? 'Lepas pin' : 'Sematkan'}</button>
          <button type="button" class="btn-sm btn-ghost" onclick="editAnnouncement('${a.id}')">Edit</button>
          <button type="button" class="btn-sm btn-warning" onclick="deleteAnnouncement('${a.id}')">Hapus</button></div>` : ''}
      </div>
      <p>${escapeHtml(a.body)}</p><small>${escapeHtml(a.by || 'Mentor')} · ${fmtTime(a.createdAt)}</small>
    </article>`).join('') : '<p class="empty-hint">Belum ada pengumuman dari mentor.</p>';
}
const annRef = (id) => doc(db, 'workspaces', state.workspaceId, 'announcements', id);
window.togglePinAnnouncement = (id) => { const a = announcements.find(x => x.id === id); if (a && state.role === 'mentor') updateDoc(annRef(id), { pinned: !a.pinned }).catch(e => alert('Gagal: ' + e.message)); };
window.editAnnouncement = (id) => {
  const a = announcements.find(x => x.id === id); if (!a || state.role !== 'mentor') return;
  const title = prompt('Judul pengumuman:', a.title); if (title === null) return;
  const body = prompt('Isi pengumuman:', a.body); if (body === null) return;
  if (!title.trim() || !body.trim()) return alert('Judul dan isi wajib diisi.');
  updateDoc(annRef(id), { title: title.trim(), body: body.trim(), updatedAt: serverTimestamp() }).catch(e => alert('Gagal: ' + e.message));
};
window.deleteAnnouncement = (id) => { if (state.role === 'mentor' && confirm('Hapus pengumuman ini?')) deleteDoc(annRef(id)).catch(e => alert('Gagal: ' + e.message)); };
async function postAnnouncement(e) {
  e.preventDefault(); if (state.role !== 'mentor') return;
  const title = $('announceTitle').value.trim(), body = $('announceBody').value.trim(); if (!title || !body) return;
  try {
    await addDoc(collection(db, 'workspaces', state.workspaceId, 'announcements'), {
      title, body, pinned: $('announcePinned').checked, by: state.workerName, uid: state.user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    e.target.reset();
    logActivity('announce', `${state.workerName} memposting pengumuman “${title}”`);
    notify(state.members.map(m => m.id), { kind: 'announce', title: 'Pengumuman baru', body: title });
  } catch (err) { alert('Gagal: ' + err.message); }
}

function setupNewFeatureListeners() {
  $('markAllReadBtn').addEventListener('click', markAllRead);
  const shift = (n) => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1); calExpanded = null; renderCalendar(); };
  $('calPrev').addEventListener('click', () => shift(-1));
  $('calNext').addEventListener('click', () => shift(1));
  $('calToday').addEventListener('click', () => { calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderCalendar(); });
  $('tabCalendarView').addEventListener('click', () => switchWorkspaceTab('calendar'));
  $('tabActivityView').addEventListener('click', () => switchWorkspaceTab('activity'));
  $('tabAnnouncementView').addEventListener('click', () => switchWorkspaceTab('announce'));
  $('addSubtaskBtn').addEventListener('click', addSubtaskFromModal);
  $('subtaskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtaskFromModal(); } });
  $('attachInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadAttachment(f); });
  $('announceForm').addEventListener('submit', postAnnouncement);
}

function setupEventListeners() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('registerForm').addEventListener('submit', handleRegister);
  $('authToggleLink').addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });
  const authToggleLink2 = $('authToggleLink2');
  if (authToggleLink2) authToggleLink2.addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });
  $('logoutBtn').addEventListener('click', handleLogout);
  $('googleLoginBtn').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { if (err.code !== 'auth/popup-closed-by-user') alert('Gagal: ' + err.code); }
  });
  $('forgotPasswordLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    if (!email) return alert('Isi email terlebih dahulu.');
    try { await sendPasswordResetEmail(auth, email); alert('Tautan reset dikirim.'); }
    catch (err) { alert('Gagal: ' + err.code); }
  });

  $('createWorkspaceBtn').addEventListener('click', () => $('createWorkspaceModal').classList.remove('hidden'));
  $('joinWorkspaceBtn').addEventListener('click', () => $('joinWorkspaceModal').classList.remove('hidden'));
  $('accountBtn').addEventListener('click', () => {
    $('accountName').value = state.user.displayName || state.user.email.split('@')[0];
    $('accountPassword').value = '';
    $('accountModal').classList.remove('hidden');
  });

  $('dashboardNavBtn').addEventListener('click', () => switchDashboardSection('home'));
  $('myWorkspacesNavBtn').addEventListener('click', () => switchDashboardSection('workspaces'));
  $('notificationsNavBtn').addEventListener('click', () => switchDashboardSection('notifications'));
  $('createWorkspaceForm').addEventListener('submit', handleCreateWorkspace);
  $('joinWorkspaceForm').addEventListener('submit', handleJoinWorkspace);
  $('backToDashboardBtn').addEventListener('click', backToDashboard);
  $('tabTaskView').addEventListener('click', () => switchWorkspaceTab('task'));
  $('tabDivisionView').addEventListener('click', () => switchWorkspaceTab('division'));
  
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => { $(btn.dataset.close).classList.add('hidden'); });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  });

  if ($('saveDriveBtn')) {
    $('saveDriveBtn').addEventListener('click', async () => {
      const link = ($('driveLinkInput')?.value || '').trim();
      if (state.role !== 'mentor') return;
      if (link && !safeUrl(link)) return alert('Tautan harus http:// atau https://');
      try {
        await updateDoc(doc(db, 'workspaces', state.workspaceId), { driveLink: link });
        state.driveLink = link;
        updateDriveStatus();
        alert(link ? '✅ Link disimpan!' : 'Link dihapus.');
      } catch (err) { alert('Gagal: ' + err.message); }
    });
  }
  if ($('driveLinkInput')) {
    $('driveLinkInput').addEventListener('input', (e) => updateDriveStatus(e.target.value));
  }

  function toggleWorkspaceDriveGroup() {
    const group = $('workspaceDriveGroup');
    const source = $('taskDriveSource');
    if (group && source) group.classList.toggle('hidden', source.value !== 'workspace');
  }
  if ($('taskDriveSource')) {
    $('taskDriveSource').addEventListener('change', toggleWorkspaceDriveGroup);
    toggleWorkspaceDriveGroup();
  }

  function syncEndDateMin() {
    const startEl = $('startDate'), endEl = $('endDate');
    if (startEl && endEl && startEl.value) {
      endEl.min = startEl.value;
      if (endEl.value && endEl.value < startEl.value) endEl.value = startEl.value;
    }
  }
  if ($('startDate')) $('startDate').addEventListener('change', syncEndDateMin);

  $('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.role !== 'mentor') return;
    const startDate = $('startDate').value, endDate = $('endDate').value;
    if (startDate && endDate && endDate < startDate) return alert('Tenggat tidak boleh lebih awal dari mulai.');
    try {
      const taskTitle = $('taskTitle').value.trim(), assigneeName = $('taskAssignee').value;
      const newRef = await addDoc(collection(db, 'workspaces', state.workspaceId, 'tasks'), {
        title: $('taskTitle').value.trim(),
        assignee: $('taskAssignee').value,
        difficulty: $('taskDifficulty').value,
        startDate, endDate,
        desc: $('taskDesc').value.trim(),
        driveSource: $('taskDriveSource').value,
        status: 'todo', reportNotes: '', reportFileLink: '', revisionNotes: '',
        subtasks: parseSubtasks($('taskSubtasks').value), attachments: [],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      e.target.reset();
      $('taskDifficulty').value = 'sedang';
      logActivity('task', `${state.workerName} membuat tugas “${taskTitle}” untuk ${assigneeName}`, newRef.id);
      notify([memberUid(assigneeName)], { kind: 'task', title: 'Tugas baru untuk Anda', body: taskTitle, taskId: newRef.id });
      setDefaultDates();
      toggleWorkspaceDriveGroup();
      alert('✅ Tugas dibagikan!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  ['taskSearch', 'filterStatus', 'filterDifficulty', 'filterAssignee'].forEach(id =>
    $(id)?.addEventListener(id === 'taskSearch' ? 'input' : 'change', renderTasks));

  $('leaveWorkspaceBtn').addEventListener('click', leaveWorkspace);
  $('changeCodeBtn').addEventListener('click', changeJoinCode);
  $('deleteWorkspaceBtn').addEventListener('click', deleteWorkspace);

  $('editMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const memId = $('editMemberId').value;
    const target = state.members.find(m => m.id === memId);
    if (target?.role === 'mentor' && $('editMemberRole').value !== 'mentor' && state.members.filter(m => m.role === 'mentor').length <= 1) {
      return alert('Tidak bisa menurunkan mentor terakhir.');
    }
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'members', memId), {
        role: $('editMemberRole').value, division: $('editMemberDivision').value
      });
      $('editMemberModal').classList.add('hidden');
      alert('✅ Data diperbarui!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = $('accountName').value.trim(), newPw = $('accountPassword').value;
    const oldName = state.user.displayName || state.user.email.split('@')[0];
    try {
      if (newPw) await updatePassword(auth.currentUser, newPw);
      if (newName && newName !== oldName) await renameUser(newName, oldName);
      $('accountModal').classList.add('hidden');
      alert('✅ Akun diperbarui!');
    } catch (err) {
      alert(err.code === 'auth/requires-recent-login' ? 'Keluar dan masuk lagi untuk ganti password.' : 'Gagal: ' + err.message);
    }
  });

  $('createDivisionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('newDivisionName').value.trim();
    if (!name || name.toLowerCase() === 'umum' || state.divisions.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      return alert('Nama divisi tidak valid atau sudah ada.');
    }
    try {
      await addDoc(collection(db, 'workspaces', state.workspaceId, 'divisions'), {
        name, desc: $('newDivisionDesc').value.trim(), createdAt: serverTimestamp()
      });
      e.target.reset();
      alert('✅ Divisi dibuat!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('saveDailyGoalBtn').addEventListener('click', async () => {
    const goal = $('dailyGoalInput').value.trim();
    if (!goal) return;
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'members', state.user.uid), { dailyGoal: goal, goalDate: localDate() });
      $('dailyGoalInput').value = '';
      loadDailyGoal();
    } catch (err) { alert('Gagal: ' + err.message); }
  });
}

function init() {
  setDefaultDates();
  initDarkMode(); // Inisialisasi Dark Mode
  setupEventListeners();
  setupNewFeatureListeners();
  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.user = user;
      startNotifications();
      const userRef = doc(db, 'users', user.uid);
      getDoc(userRef).then(snap => {
        if (!snap.exists()) {
          setDoc(userRef, { email: user.email, displayName: user.displayName || user.email.split('@')[0], workspaceIds: [], createdAt: serverTimestamp() });
        }
      }).finally(() => showDashboardView());
    } else {
      unsubscribers.forEach(u => u());
      unsubscribers = [];
      stopNotifications();
      state = { user: null, workspaceId: null, workspaceName: null, role: null, workerName: null, driveLink: '', members: [], tasks: [], divisions: [] };
      showAuthView();
    }
  });
}

init();
