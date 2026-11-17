// =====================================================================
// AKASHA — CORE ENGINE & INTEGRATED PRODUCTIVITY SUITE
// Firebase Auth + Firestore Realtime + Habit/Mood Tracker + Hero Banners + Table/Kanban Board
// =====================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── FIREBASE CONFIG (Isi dengan konfigurasi Firebase project Anda) ──
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let app = null;
let auth = null;
let db = null;
let isDemoMode = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    isDemoMode = true;
  }
} catch (err) {
  console.warn("Firebase init fallback ke Demo Mode:", err);
  isDemoMode = true;
}

// ── GLOBAL STATE ──
const state = {
  user: null,
  route: "dashboard",
  wsTab: "tasks",
  boardViewMode: "table", // 'table' | 'kanban'
  isCreateFormCollapsed: false,
  workspaces: [],
  activeWorkspaceId: null,
  members: [],
  divisions: [],
  tasks: [],
  allMyTasks: [],
  activities: [],
  announcements: [],
  notifications: [],
  selectedTaskId: null,
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelectedDate: toDateKey(new Date()),
  quickReviewOnly: false,
  unsubscribers: [],
  allTasksUnsubscribers: [],
  personal: {
    theme: "light",
    habits: [],
    habitLogs: {}, // { 'YYYY-MM-DD': ['habitId1', ...] }
    moodLogs: {},  // { 'YYYY-MM-DD': { score: 4, note: '...' } }
    wsDailyGoals: {} // { 'wsId_YYYY-MM-DD': 'Target teks' }
  }
};

// ── DATE & FORMAT HELPERS ──
function toDateKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLongIndoDate(d = new Date()) {
  const days = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
  const months = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return "Tanpa tenggat";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(parts[2])} ${months[Number(parts[1]) - 1]} ${parts[0]}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg) {
  const el = document.getElementById("global-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function setCircularRingProgress(circleId, textId, percent) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const circle = document.getElementById(circleId);
  const label = document.getElementById(textId);
  if (circle) {
    const circumference = 2 * Math.PI * 28; // r=28 -> 175.93
    const offset = circumference - (clamped / 100) * circumference;
    circle.style.strokeDasharray = circumference.toFixed(2);
    circle.style.strokeDashoffset = offset.toFixed(2);
  }
  if (label) {
    label.textContent = `${clamped}%`;
  }
}

// ── LABELS & MAPS ──
const STATUS_LABELS = {
  todo: "Belum dimulai",
  in_progress: "Berjalan",
  in_review: "Siap direviu",
  revision: "Revisi",
  done: "Selesai"
};

const DIFF_LABELS = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi"
};

const MOOD_EMOJIS = {
  5: "😄",
  4: "🙂",
  3: "😐",
  2: "😔",
  1: "😫"
};

// ── LOCAL STORAGE PERSISTENCE (v3 + Demo Data) ──
function getPersonalStorageKey() {
  const uid = state.user?.uid || "guest";
  return `akasha_productivity_v3_${uid}`;
}

function loadPersonalState() {
  try {
    const raw = localStorage.getItem(getPersonalStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      state.personal = {
        theme: parsed.theme || "light",
        habits: Array.isArray(parsed.habits) ? parsed.habits : [],
        habitLogs: parsed.habitLogs || {},
        moodLogs: parsed.moodLogs || {},
        wsDailyGoals: parsed.wsDailyGoals || {}
      };
    } else {
      // Seed default starter habits if empty
      state.personal.habits = [
        { id: "hab_1", name: "Tinjau prioritas tugas pagi", category: "Produktivitas", freq: "daily", createdAt: toDateKey() },
        { id: "hab_2", name: "Selesaikan 1 sesi fokus mendalam", category: "Produktivitas", freq: "daily", createdAt: toDateKey() },
        { id: "hab_3", name: "Refleksi & evaluasi harian", category: "Kesejahteraan", freq: "daily", createdAt: toDateKey() }
      ];
      savePersonalState();
    }
  } catch (e) {
    console.warn("Gagal memuat state personal:", e);
  }
  applyTheme(state.personal.theme);
}

async function savePersonalState() {
  try {
    localStorage.setItem(getPersonalStorageKey(), JSON.stringify(state.personal));
    if (!isDemoMode && db && state.user) {
      await setDoc(doc(db, "userPersonal", state.user.uid), state.personal, { merge: true });
    }
  } catch (e) {
    console.warn("Gagal menyimpan state personal:", e);
  }
}

function applyTheme(themeName) {
  const valid = ["light", "dark", "playful"].includes(themeName) ? themeName : "light";
  state.personal.theme = valid;
  document.documentElement.setAttribute("data-theme", valid);
  document.querySelectorAll("[data-theme-select]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeSelect === valid);
  });
}

// ── DEMO SEED DATA (Agar langsung bisa dicoba tanpa config Firebase) ──
function initDemoSession() {
  const today = toDateKey();
  state.user = {
    uid: "demo_mentor_01",
    displayName: "Greaven",
    email: "greaven.kei@gmail.com"
  };

  const demoWsId = "ws_animasi_3d";
  state.workspaces = [
    {
      id: demoWsId,
      name: "Tim Produksi Animasi 3D",
      description: "Produksi animasi pendek & aset karakter",
      inviteCode: "AKSH3D",
      ownerId: "demo_mentor_01",
      driveUrl: "https://drive.google.com"
    }
  ];
  state.activeWorkspaceId = demoWsId;

  state.divisions = [
    { id: "div_anim", name: "Divisi Animasi", color: "#ea580c" },
    { id: "div_edit", name: "Divisi Editing", color: "#d97706" },
    { id: "div_story", name: "Divisi Story", color: "#2563eb" }
  ];

  state.members = [
    { uid: "demo_mentor_01", name: "Greaven", email: "greaven.kei@gmail.com", role: "mentor", divisionId: "div_anim", online: true },
    { uid: "mem_raka", name: "Raka Pratama", email: "raka@studio.id", role: "member", divisionId: "div_anim", online: true },
    { uid: "mem_nadia", name: "Nadia Putri", email: "nadia@studio.id", role: "member", divisionId: "div_edit", online: false }
  ];

  state.tasks = [
    {
      id: "task_1",
      workspaceId: demoWsId,
      workspaceName: "Tim Produksi Animasi 3D",
      title: "Blocking Scene 04 Karakter Utama",
      description: "Fokus pada pose kunci, antisipasi, dan timing gerakan lompat sebelum masuk tahap spline.",
      assigneeId: "mem_raka",
      assigneeName: "Raka Pratama",
      divisionId: "div_anim",
      difficulty: "high",
      status: "in_progress",
      startDate: today,
      dueDate: today,
      driveUrl: "https://drive.google.com",
      subtasks: [
        { id: "s1", text: "Key pose kontak awal & takeoff", done: true },
        { id: "s2", text: "Breakdown pose puncak di udara", done: false },
        { id: "s3", text: "Follow-through pendaratan", done: false }
      ],
      attachments: [],
      comments: [
        { author: "Greaven", text: "Pastikan arc lompatan terbaca jelas dari kamera utama.", time: "09:15" }
      ],
      createdAt: Date.now() - 3600000
    },
    {
      id: "task_2",
      workspaceId: demoWsId,
      workspaceName: "Tim Produksi Animasi 3D",
      title: "Color Grading Teaser Trailer",
      description: "Sesuaikan tone warna dengan referensi moodboard golden hour.",
      assigneeId: "mem_nadia",
      assigneeName: "Nadia Putri",
      divisionId: "div_edit",
      difficulty: "medium",
      status: "in_review",
      startDate: today,
      dueDate: today,
      driveUrl: "https://drive.google.com",
      subtasks: [],
      attachments: [{ label: "Draft Render v2", url: "https://drive.google.com" }],
      comments: [],
      createdAt: Date.now() - 7200000
    },
    {
      id: "task_3",
      workspaceId: demoWsId,
      workspaceName: "Tim Produksi Animasi 3D",
      title: "Finalisasi Rigging Wajah",
      description: "Cek kontrol ekspresi alis dan lip-sync dasar untuk dialog pembuka.",
      assigneeId: "mem_raka",
      assigneeName: "Raka Pratama",
      divisionId: "div_anim",
      difficulty: "low",
      status: "done",
      startDate: today,
      dueDate: today,
      driveUrl: "",
      subtasks: [],
      attachments: [],
      comments: [],
      createdAt: Date.now() - 10800000
    },
    {
      id: "task_4",
      workspaceId: demoWsId,
      workspaceName: "Tim Produksi Animasi 3D",
      title: "Susun Storyboard Episode 2",
      description: "Lengkapi catatan transisi kamera dan durasi per panel.",
      assigneeId: "mem_nadia",
      assigneeName: "Nadia Putri",
      divisionId: "div_story",
      difficulty: "medium",
      status: "todo",
      startDate: today,
      dueDate: today,
      driveUrl: "",
      subtasks: [],
      attachments: [],
      comments: [],
      createdAt: Date.now() - 14400000
    }
  ];

  state.allMyTasks = [...state.tasks];
  state.activities = [
    { text: "Nadia Putri menandai 'Color Grading Teaser Trailer' sebagai Siap direviu", time: "10 menit lalu" },
    { text: "Raka Pratama menyelesaikan 'Finalisasi Rigging Wajah'", time: "1 jam lalu" }
  ];
  state.announcements = [
    { title: "Review Mingguan Animasi & Editing", body: "Harap unggah progres terbaru ke folder Drive ruang kerja sebelum pukul 16.00 WIB.", author: "Greaven", time: "Hari ini" }
  ];
  state.notifications = [
    { id: "n1", text: "Tugas 'Color Grading Teaser Trailer' siap Anda tinjau.", read: false, wsId: demoWsId }
  ];

  enterAppShell();
}

// ── AUTHENTICATION FLOW ──
function initAuth() {
  if (isDemoMode) {
    initDemoSession();
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.user = {
        uid: user.uid,
        displayName: user.displayName || user.email?.split("@")[0] || "Pengguna",
        email: user.email || ""
      };
      await enterAppShell();
    } else {
      cleanupListeners();
      state.user = null;
      document.getElementById("app-view").classList.add("hidden");
      document.getElementById("auth-view").classList.remove("hidden");
    }
  });
}

async function enterAppShell() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  const firstName = (state.user.displayName || "Anda").split(" ")[0];
  document.getElementById("topbar-user-name").textContent = state.user.displayName;
  document.getElementById("topbar-avatar").textContent = firstName.charAt(0).toUpperCase();
  document.getElementById("profile-name-input").value = state.user.displayName;
  document.getElementById("profile-email-display").value = state.user.email;

  loadPersonalState();

  if (!isDemoMode && db) {
    try {
      const snap = await getDoc(doc(db, "userPersonal", state.user.uid));
      if (snap.exists()) {
        const cloud = snap.data();
        state.personal = {
          theme: cloud.theme || state.personal.theme,
          habits: Array.isArray(cloud.habits) ? cloud.habits : state.personal.habits,
          habitLogs: cloud.habitLogs || state.personal.habitLogs,
          moodLogs: cloud.moodLogs || state.personal.moodLogs,
          wsDailyGoals: cloud.wsDailyGoals || state.personal.wsDailyGoals
        };
        applyTheme(state.personal.theme);
      }
    } catch (e) {
      console.warn("Sync cloud personal dilewati:", e);
    }
    subscribeWorkspaces();
    subscribeNotifications();
  }

  renderAll();
}

function cleanupListeners() {
  state.unsubscribers.forEach((u) => typeof u === "function" && u());
  state.unsubscribers = [];
  state.allTasksUnsubscribers.forEach((u) => typeof u === "function" && u());
  state.allTasksUnsubscribers = [];
}

// ── FIRESTORE REALTIME SUBSCRIPTIONS ──
function subscribeWorkspaces() {
  const q = query(collection(db, "workspaces"), where("memberIds", "array-contains", state.user.uid));
  const unsub = onSnapshot(q, (snap) => {
    state.workspaces = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!state.activeWorkspaceId && state.workspaces.length > 0) {
      state.activeWorkspaceId = state.workspaces[0].id;
    } else if (state.activeWorkspaceId && !state.workspaces.some((w) => w.id === state.activeWorkspaceId)) {
      state.activeWorkspaceId = state.workspaces[0]?.id || null;
    }
    subscribeAllMyTasks();
    if (state.activeWorkspaceId) {
      subscribeActiveWorkspaceDetails(state.activeWorkspaceId);
    }
    renderAll();
  });
  state.unsubscribers.push(unsub);
}

function subscribeAllMyTasks() {
  state.allTasksUnsubscribers.forEach((u) => u());
  state.allTasksUnsubscribers = [];
  const taskMap = new Map();

  state.workspaces.forEach((ws) => {
    const q = query(collection(db, "workspaces", ws.id, "tasks"));
    const u = onSnapshot(q, (snap) => {
      // Remove old tasks from this ws
      for (const [k, v] of taskMap.entries()) {
        if (v.workspaceId === ws.id) taskMap.delete(k);
      }
      snap.docs.forEach((d) => {
        taskMap.set(d.id, { id: d.id, workspaceId: ws.id, workspaceName: ws.name, ...d.data() });
      });
      state.allMyTasks = Array.from(taskMap.values());
      renderDashboard();
    });
    state.allTasksUnsubscribers.push(u);
  });
}

let activeWsUnsubs = [];
function subscribeActiveWorkspaceDetails(wsId) {
  activeWsUnsubs.forEach((u) => u());
  activeWsUnsubs = [];
  if (!wsId || isDemoMode) return;

  activeWsUnsubs.push(
    onSnapshot(collection(db, "workspaces", wsId, "members"), (snap) => {
      state.members = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      renderWorkspace();
    }),
    onSnapshot(collection(db, "workspaces", wsId, "divisions"), (snap) => {
      state.divisions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderWorkspace();
    }),
    onSnapshot(query(collection(db, "workspaces", wsId, "tasks"), orderBy("createdAt", "desc")), (snap) => {
      const wsObj = state.workspaces.find((w) => w.id === wsId);
      state.tasks = snap.docs.map((d) => ({ id: d.id, workspaceId: wsId, workspaceName: wsObj?.name || "", ...d.data() }));
      renderWorkspace();
      if (state.selectedTaskId) renderTaskDetailModal(state.selectedTaskId);
    }),
    onSnapshot(query(collection(db, "workspaces", wsId, "activities"), orderBy("createdAt", "desc"), limit(30)), (snap) => {
      state.activities = snap.docs.map((d) => d.data());
      renderWorkspaceActivity();
    }),
    onSnapshot(query(collection(db, "workspaces", wsId, "announcements"), orderBy("createdAt", "desc")), (snap) => {
      state.announcements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderWorkspaceAnnouncements();
    })
  );
}

function subscribeNotifications() {
  const q = query(collection(db, "users", state.user.uid, "notifications"), orderBy("createdAt", "desc"), limit(20));
  const unsub = onSnapshot(q, (snap) => {
    state.notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderNotifications();
  });
  state.unsubscribers.push(unsub);
}

// ── HERO BANNER RENDERERS (PERSONAL & WORKSPACE) ──
function renderPersonalHeroBanner() {
  const now = new Date();
  const todayKey = toDateKey(now);
  const firstName = (state.user?.displayName || "Anda").split(" ")[0];

  const dateEl = document.getElementById("dash-hero-date");
  const greetEl = document.getElementById("dash-greeting");
  const actionCountEl = document.getElementById("dash-hero-action-count");

  if (dateEl) dateEl.textContent = formatLongIndoDate(now);
  if (greetEl) greetEl.textContent = `Halo, ${firstName}! Siap menuntaskan target hari ini?`;

  // Calculate tasks relevant to user across workspaces
  const relevantTasks = state.allMyTasks.filter(
    (t) => t.assigneeId === state.user?.uid || t.assigneeId === "ALL" || isUserMentorInWs(t.workspaceId)
  );
  const total = relevantTasks.length;
  const done = relevantTasks.filter((t) => t.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // "Perlu Tindakan" = tasks not done (overdue, revision, in_review, or active)
  const needAction = relevantTasks.filter((t) => t.status !== "done").length;

  setCircularRingProgress("dash-hero-ring-fill", "dash-hero-percent", pct);
  if (actionCountEl) actionCountEl.textContent = String(needAction);
}

function renderWorkspaceHeroBanner() {
  const ws = getActiveWorkspace();
  if (!ws) return;

  const now = new Date();
  const isMentor = isCurrentUserMentor();
  const kickerEl = document.getElementById("ws-hero-kicker");
  const titleEl = document.getElementById("ws-hero-title");
  const subEl = document.getElementById("ws-hero-subtitle");
  const ratioEl = document.getElementById("ws-hero-done-ratio");
  const pendingEl = document.getElementById("ws-hero-pending-count");

  if (kickerEl) kickerEl.textContent = `${ws.name.toUpperCase()} · ${formatLongIndoDate(now)}`;
  if (titleEl) {
    titleEl.textContent = isMentor
      ? `Dasbor Mentor — ${ws.name}`
      : `Dasbor Anggota — ${ws.name}`;
  }
  if (subEl) {
    subEl.textContent = isMentor
      ? "Pantau distribusi tugas tim, tinjau laporan masuk, dan kelola tenggat."
      : "Kerjakan tugas Anda, perbarui progres sub-tugas, dan laporkan hasil tepat waktu.";
  }

  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const pending = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  setCircularRingProgress("ws-hero-ring-fill", "ws-hero-percent", pct);
  if (ratioEl) ratioEl.textContent = `${done}/${total}`;
  if (pendingEl) pendingEl.textContent = String(pending);
}

// ── WORKSPACE HELPERS ──
function getActiveWorkspace() {
  return state.workspaces.find((w) => w.id === state.activeWorkspaceId) || null;
}

function isUserMentorInWs(wsId) {
  const ws = state.workspaces.find((w) => w.id === wsId);
  return ws && ws.ownerId === state.user?.uid;
}

function isCurrentUserMentor() {
  const ws = getActiveWorkspace();
  if (!ws || !state.user) return false;
  if (ws.ownerId === state.user.uid) return true;
  const me = state.members.find((m) => m.uid === state.user.uid);
  return me?.role === "mentor";
}

function getDivisionById(divId) {
  return state.divisions.find((d) => d.id === divId) || null;
}

// ── MAIN RENDER ORCHESTRATOR ──
function renderAll() {
  renderDashboard();
  renderWorkspace();
  renderNotifications();
}

// ── RENDER DASHBOARD ──
function renderDashboard() {
  renderPersonalHeroBanner();

  const todayKey = toDateKey();
  const activeTasks = state.allMyTasks.filter((t) => t.status !== "done");
  const habits = state.personal.habits || [];
  const todayCompletedHabits = state.personal.habitLogs[todayKey] || [];
  const doneHabitsCount = habits.filter((h) => todayCompletedHabits.includes(h.id)).length;

  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const maxDueKey = toDateKey(sevenDaysLater);
  const dueSoonTasks = activeTasks.filter((t) => t.dueDate && t.dueDate >= todayKey && t.dueDate <= maxDueKey);

  document.getElementById("stat-workspaces").textContent = String(state.workspaces.length);
  document.getElementById("stat-active-tasks").textContent = String(activeTasks.length);
  document.getElementById("stat-habits-today").textContent = `${doneHabitsCount}/${habits.length}`;
  document.getElementById("stat-due-soon").textContent = String(dueSoonTasks.length);

  renderHabits();
  renderHabitHeatmap();
  renderMoodTracker();
  renderCorrelationInsight();
  renderDashboardTaskList();
  renderDashboardDeadlines(dueSoonTasks);
  renderWorkspacesPreview();
}

function renderHabits() {
  const listEl = document.getElementById("habit-list");
  const todayKey = toDateKey();
  const completedIds = state.personal.habitLogs[todayKey] || [];

  if (!state.personal.habits.length) {
    listEl.innerHTML = `<p class="muted-text">Belum ada kebiasaan harian. Klik <strong>+ Kebiasaan</strong> untuk memulai.</p>`;
    return;
  }

  listEl.innerHTML = state.personal.habits
    .map((h) => {
      const isDone = completedIds.includes(h.id);
      const streak = computeHabitStreak(h.id);
      return `
        <div class="habit-item ${isDone ? "completed" : ""}">
          <div class="habit-left" data-toggle-habit="${escapeHtml(h.id)}">
            <span class="habit-check">${isDone ? "✓" : ""}</span>
            <div class="habit-info">
              <strong>${escapeHtml(h.name)}</strong>
              <div class="habit-meta-tags">
                <span>${escapeHtml(h.category || "Umum")}</span>
                <span>•</span>
                <span>${h.freq === "weekdays" ? "Hari Kerja" : "Setiap Hari"}</span>
              </div>
            </div>
          </div>
          <div class="header-actions">
            <span class="streak-pill">🔥 ${streak} hari</span>
            <button type="button" class="btn btn-ghost btn-sm text-danger" data-delete-habit="${escapeHtml(h.id)}" title="Hapus kebiasaan">&times;</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function computeHabitStreak(habitId) {
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = toDateKey(cursor);
    const logs = state.personal.habitLogs[key] || [];
    if (logs.includes(habitId)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Allow today not yet checked without breaking yesterday's streak
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderHabitHeatmap() {
  const grid = document.getElementById("habit-heatmap-grid");
  if (!grid) return;
  const totalHabits = Math.max(1, state.personal.habits.length);
  const cols = [];
  const today = new Date();
  // 14 weeks = 98 days
  const start = new Date(today);
  start.setDate(today.getDate() - 97);

  for (let w = 0; w < 14; w++) {
    let cells = "";
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + d);
      const key = toDateKey(cur);
      const count = (state.personal.habitLogs[key] || []).length;
      const ratio = count / totalHabits;
      let lvl = "l0";
      if (count > 0 && ratio <= 0.25) lvl = "l1";
      else if (ratio > 0.25 && ratio <= 0.5) lvl = "l2";
      else if (ratio > 0.5 && ratio < 1) lvl = "l3";
      else if (ratio >= 1 && count > 0) lvl = "l4";

      cells += `<i class="hm-cell ${lvl}" title="${key}: ${count} kebiasaan selesai"></i>`;
    }
    cols.push(`<div class="hm-col">${cells}</div>`);
  }
  grid.innerHTML = cols.join("");
}

function renderMoodTracker() {
  const todayKey = toDateKey();
  const entry = state.personal.moodLogs[todayKey] || null;
  document.querySelectorAll(".mood-btn").forEach((btn) => {
    btn.classList.toggle("selected", entry && Number(btn.dataset.mood) === Number(entry.score));
  });
  const journalInput = document.getElementById("daily-journal-input");
  if (journalInput && document.activeElement !== journalInput) {
    journalInput.value = entry?.note || "";
  }

  // Render 30-day SVG trend
  const chartEl = document.getElementById("mood-trend-chart");
  const avgEl = document.getElementById("mood-avg-label");
  const points = [];
  const scores = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = toDateKey(d);
    const item = state.personal.moodLogs[k];
    if (item && item.score) {
      scores.push(Number(item.score));
      const x = ((29 - i) / 29) * 280 + 10;
      const y = 66 - ((Number(item.score) - 1) / 4) * 52;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
  }

  if (avgEl) {
    if (scores.length) {
      const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
      avgEl.textContent = `Rata-rata: ${avg}/5`;
    } else {
      avgEl.textContent = "Rata-rata: -";
    }
  }

  if (chartEl) {
    if (points.length >= 2) {
      chartEl.innerHTML = `
        <svg viewBox="0 0 300 76" preserveAspectRatio="none">
          <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points.join(" ")}" />
        </svg>
      `;
    } else {
      chartEl.innerHTML = `<p class="muted-xs">Catat suasana hati minimal 2 hari untuk menampilkan grafik tren.</p>`;
    }
  }
}

function renderCorrelationInsight() {
  const el = document.getElementById("correlation-insight-body");
  if (!el) return;
  const moodKeys = Object.keys(state.personal.moodLogs);
  if (moodKeys.length < 3 || state.personal.habits.length === 0) {
    el.innerHTML = `<p class="muted-text">Catat kebiasaan dan suasana hati selama beberapa hari untuk melihat korelasi personal Anda.</p>`;
    return;
  }

  let highHabitMoodSum = 0, highHabitDays = 0;
  let lowHabitMoodSum = 0, lowHabitDays = 0;
  const totalH = Math.max(1, state.personal.habits.length);

  moodKeys.forEach((k) => {
    const m = state.personal.moodLogs[k]?.score;
    if (!m) return;
    const done = (state.personal.habitLogs[k] || []).length;
    if (done / totalH >= 0.5) {
      highHabitMoodSum += m;
      highHabitDays++;
    } else {
      lowHabitMoodSum += m;
      lowHabitDays++;
    }
  });

  if (highHabitDays > 0 && lowHabitDays > 0) {
    const avgHigh = (highHabitMoodSum / highHabitDays).toFixed(1);
    const avgLow = (lowHabitMoodSum / lowHabitDays).toFixed(1);
    el.innerHTML = `
      <p>Pada hari ketika Anda menyelesaikan <strong>&ge;50% kebiasaan harian</strong>, rata-rata skor suasana hati Anda mencapai <strong>${avgHigh}/5</strong> (dibandingkan <strong>${avgLow}/5</strong> pada hari dengan penyelesaian lebih rendah).</p>
    `;
  } else {
    el.innerHTML = `<p>Anda telah mencatat mood selama <strong>${moodKeys.length} hari</strong>. Teruskan konsistensi untuk perbandingan pola yang lebih tajam.</p>`;
  }
}

function renderDashboardTaskList() {
  const listEl = document.getElementById("dash-task-list");
  const filter = document.getElementById("dash-task-filter")?.value || "all";
  const today = toDateKey();

  let filtered = [...state.allMyTasks];
  if (filter === "pending") filtered = filtered.filter((t) => t.status !== "done");
  else if (filter === "review") filtered = filtered.filter((t) => t.status === "in_review");
  else if (filter === "overdue") filtered = filtered.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today);

  if (!filtered.length) {
    listEl.innerHTML = `<p class="muted-text">Tidak ada tugas pada kategori ini.</p>`;
    return;
  }

  listEl.innerHTML = filtered.slice(0, 8).map((t) => `
    <div class="list-row-item clickable" data-jump-ws="${escapeHtml(t.workspaceId)}" data-jump-task="${escapeHtml(t.id)}">
      <div class="list-row-main">
        <strong>${escapeHtml(t.title)}</strong>
        <span>${escapeHtml(t.workspaceName || "Ruang Kerja")} • Tenggat: ${formatShortDate(t.dueDate)}</span>
      </div>
      <span class="badge badge-${escapeHtml(t.status || "todo")}">${STATUS_LABELS[t.status] || "Belum dimulai"}</span>
    </div>
  `).join("");
}

function renderDashboardDeadlines(dueSoonTasks) {
  const el = document.getElementById("dash-deadlines-list");
  if (!dueSoonTasks.length) {
    el.innerHTML = `<p class="muted-text">Tidak ada tenggat dalam 7 hari ke depan.</p>`;
    return;
  }
  el.innerHTML = dueSoonTasks.slice(0, 5).map((t) => `
    <div class="list-row-item clickable" data-jump-ws="${escapeHtml(t.workspaceId)}" data-jump-task="${escapeHtml(t.id)}">
      <div class="list-row-main">
        <strong>${escapeHtml(t.title)}</strong>
        <span>${escapeHtml(t.workspaceName)}</span>
      </div>
      <span class="badge badge-in_review">${formatShortDate(t.dueDate)}</span>
    </div>
  `).join("");
}

function renderWorkspacesPreview() {
  const el = document.getElementById("dash-workspaces-preview");
  if (!state.workspaces.length) {
    el.innerHTML = `<p class="muted-text">Belum tergabung dalam ruang kerja mana pun.</p>`;
    return;
  }
  el.innerHTML = state.workspaces.map((w) => `
    <div class="list-row-item clickable" data-select-ws="${escapeHtml(w.id)}">
      <div class="list-row-main">
        <strong>${escapeHtml(w.name)}</strong>
        <span>Kode: ${escapeHtml(w.inviteCode || "-")} • ${w.ownerId === state.user?.uid ? "Mentor" : "Anggota"}</span>
      </div>
      <span class="btn btn-ghost btn-sm">Buka &rarr;</span>
    </div>
  `).join("");
}

function renderNotifications() {
  const listEl = document.getElementById("dash-notif-list");
  const badgeEl = document.getElementById("notif-badge");
  const unread = state.notifications.filter((n) => !n.read).length;

  if (badgeEl) {
    badgeEl.textContent = String(unread);
    badgeEl.classList.toggle("hidden", unread === 0);
  }

  if (!listEl) return;
  if (!state.notifications.length) {
    listEl.innerHTML = `<p class="muted-text">Belum ada notifikasi baru.</p>`;
    return;
  }
  listEl.innerHTML = state.notifications.slice(0, 6).map((n) => `
    <div class="list-row-item">
      <div class="list-row-main">
        <strong>${escapeHtml(n.text)}</strong>
        <span>${n.read ? "Sudah dibaca" : "Baru"}</span>
      </div>
    </div>
  `).join("");
}

// ── RENDER WORKSPACE ──
function renderWorkspace() {
  const selectEl = document.getElementById("workspace-select");
  if (selectEl) {
    selectEl.innerHTML = state.workspaces.length
      ? state.workspaces.map((w) => `<option value="${escapeHtml(w.id)}" ${w.id === state.activeWorkspaceId ? "selected" : ""}>${escapeHtml(w.name)}</option>`).join("")
      : `<option value="">Pilih Ruang Kerja...</option>`;
  }

  const ws = getActiveWorkspace();
  const emptyHero = document.getElementById("workspace-empty-state");
  const activeContent = document.getElementById("workspace-active-content");
  const inviteBtn = document.getElementById("copy-invite-code-btn");
  const leaveBtn = document.getElementById("ws-leave-btn");
  const deleteBtn = document.getElementById("ws-delete-btn");

  if (!ws) {
    emptyHero?.classList.remove("hidden");
    activeContent?.classList.add("hidden");
    inviteBtn?.classList.add("hidden");
    leaveBtn?.classList.add("hidden");
    deleteBtn?.classList.add("hidden");
    return;
  }

  emptyHero?.classList.add("hidden");
  activeContent?.classList.remove("hidden");

  inviteBtn?.classList.remove("hidden");
  document.getElementById("ws-invite-code-text").textContent = ws.inviteCode || "------";

  const isMentor = isCurrentUserMentor();
  leaveBtn?.classList.toggle("hidden", isMentor);
  deleteBtn?.classList.toggle("hidden", !isMentor);

  // Mentor-only controls
  document.getElementById("ws-tab-divisions-btn")?.classList.toggle("hidden", !isMentor);
  document.getElementById("mentor-create-task-card")?.classList.toggle("hidden", !isMentor);
  document.getElementById("mentor-announcement-box")?.classList.toggle("hidden", !isMentor);

  // Update Create Form Collapse State
  const createForm = document.getElementById("create-task-form");
  const toggleFormBtn = document.getElementById("toggle-create-task-form-btn");
  if (createForm && toggleFormBtn) {
    createForm.classList.toggle("hidden", state.isCreateFormCollapsed);
    toggleFormBtn.textContent = state.isCreateFormCollapsed ? "Tampilkan Form" : "Sembunyikan Form";
  }

  // Render Workspace Hero Banner
  renderWorkspaceHeroBanner();

  // Render Workspace Daily Goal
  renderWorkspaceDailyGoal(ws.id);

  // Populate Dropdowns (Assignees & Divisions)
  populateWorkspaceDropdowns();

  // Render Tasks Board (Kanban & Table)
  renderTasksBoard();

  // Render Other Tabs
  renderCalendar();
  renderWorkspaceActivity();
  renderWorkspaceAnnouncements();
  renderWorkspaceMembers();
  renderWorkspaceDivisions();
}

function renderWorkspaceDailyGoal(wsId) {
  const key = `${wsId}_${toDateKey()}`;
  const savedGoal = state.personal.wsDailyGoals[key] || "";
  const inputEl = document.getElementById("ws-daily-goal-input");
  const dispEl = document.getElementById("ws-daily-goal-display");
  const badgeEl = document.getElementById("ws-goal-status-badge");

  if (inputEl && document.activeElement !== inputEl && !inputEl.value && savedGoal) {
    inputEl.value = savedGoal;
  }
  if (dispEl) {
    dispEl.innerHTML = savedGoal
      ? `Target hari ini: <strong>${escapeHtml(savedGoal)}</strong>`
      : "Belum ada target tersimpan untuk hari ini.";
  }
  if (badgeEl) {
    badgeEl.classList.toggle("hidden", !savedGoal);
  }
}

function populateWorkspaceDropdowns() {
  const assigneeSel = document.getElementById("task-assignee-select");
  const filterAssigneeSel = document.getElementById("task-filter-assignee");
  const filterDivSel = document.getElementById("task-filter-division");

  if (assigneeSel) {
    const prev = assigneeSel.value;
    let html = `<option value="ALL">Seluruh anggota (${state.members.length})</option>`;
    state.divisions.forEach((d) => {
      html += `<option value="DIV:${escapeHtml(d.id)}">Divisi: ${escapeHtml(d.name)}</option>`;
    });
    state.members.forEach((m) => {
      html += `<option value="${escapeHtml(m.uid)}">${escapeHtml(m.name)} (${m.role === "mentor" ? "Mentor" : "Anggota"})</option>`;
    });
    assigneeSel.innerHTML = html;
    if ([...assigneeSel.options].some((o) => o.value === prev)) assigneeSel.value = prev;
  }

  if (filterAssigneeSel) {
    const prev = filterAssigneeSel.value;
    filterAssigneeSel.innerHTML =
      `<option value="all">Semua angg...</option>` +
      state.members.map((m) => `<option value="${escapeHtml(m.uid)}">${escapeHtml(m.name)}</option>`).join("");
    if ([...filterAssigneeSel.options].some((o) => o.value === prev)) filterAssigneeSel.value = prev;
  }

  if (filterDivSel) {
    const prev = filterDivSel.value;
    filterDivSel.innerHTML =
      `<option value="all">Semua divisi</option>` +
      state.divisions.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("");
    if ([...filterDivSel.options].some((o) => o.value === prev)) filterDivSel.value = prev;
  }
}

function getFilteredWorkspaceTasks() {
  const search = (document.getElementById("task-search-input")?.value || "").toLowerCase().trim();
  const statusF = document.getElementById("task-filter-status")?.value || "all";
  const diffF = document.getElementById("task-filter-difficulty")?.value || "all";
  const divF = document.getElementById("task-filter-division")?.value || "all";
  const assigneeF = document.getElementById("task-filter-assignee")?.value || "all";
  const sortBy = document.getElementById("task-sort-select")?.value || "newest";

  let list = [...state.tasks];

  if (search) {
    list = list.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(search) ||
        (t.description || "").toLowerCase().includes(search)
    );
  }
  if (state.quickReviewOnly) {
    list = list.filter((t) => t.status === "in_review");
  } else if (statusF !== "all") {
    list = list.filter((t) => t.status === statusF);
  }
  if (diffF !== "all") list = list.filter((t) => t.difficulty === diffF);
  if (divF !== "all") list = list.filter((t) => t.divisionId === divF);
  if (assigneeF !== "all") list = list.filter((t) => t.assigneeId === assigneeF);

  const diffWeight = { high: 3, medium: 2, low: 1 };
  if (sortBy === "due_asc") {
    list.sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"));
  } else if (sortBy === "difficulty_desc") {
    list.sort((a, b) => (diffWeight[b.difficulty] || 0) - (diffWeight[a.difficulty] || 0));
  } else {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  return list;
}

function renderTasksBoard() {
  const tasks = getFilteredWorkspaceTasks();
  const today = toDateKey();

  // Urgent / Overdue banner
  const urgentCount = state.tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate <= today).length;
  const bannerEl = document.getElementById("board-urgent-banner");
  if (bannerEl) {
    if (urgentCount > 0) {
      bannerEl.textContent = `${urgentCount} tugas jatuh tempo hari ini atau sudah melewati tenggat.`;
      bannerEl.classList.remove("hidden");
    } else {
      bannerEl.classList.add("hidden");
    }
  }

  // Toggle View Containers
  const kanbanEl = document.getElementById("tasks-board-grid");
  const tableWrapEl = document.getElementById("tasks-table-wrap");
  const tableBodyEl = document.getElementById("tasks-table-body");

  document.querySelectorAll("[data-board-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.boardView === state.boardViewMode);
  });

  if (state.boardViewMode === "kanban") {
    kanbanEl?.classList.remove("hidden");
    tableWrapEl?.classList.add("hidden");
  } else {
    kanbanEl?.classList.add("hidden");
    tableWrapEl?.classList.remove("hidden");
  }

  // Render Kanban Cards
  if (kanbanEl) {
    if (!tasks.length) {
      kanbanEl.innerHTML = `<p class="muted-text">Tidak ada tugas yang cocok dengan filter saat ini.</p>`;
    } else {
      kanbanEl.innerHTML = tasks.map((t) => {
        const divObj = getDivisionById(t.divisionId);
        const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
        const subDone = subs.filter((s) => s.done).length;
        return `
          <article class="task-card" data-open-task="${escapeHtml(t.id)}">
            <div>
              <div class="task-card-top">
                <span class="badge diff-${escapeHtml(t.difficulty || "medium")}">${DIFF_LABELS[t.difficulty] || "Sedang"}</span>
                <span class="badge badge-${escapeHtml(t.status || "todo")}">${STATUS_LABELS[t.status] || "Belum dimulai"}</span>
              </div>
              <h3 class="task-card-title">${escapeHtml(t.title)}</h3>
              <p class="task-card-desc">${escapeHtml(t.description || "Tidak ada instruksi tambahan.")}</p>
            </div>
            <div class="task-card-footer">
              <span>${escapeHtml(t.assigneeName || "Seluruh tim")}${divObj ? ` • <strong>${escapeHtml(divObj.name)}</strong>` : ""}</span>
              <span>${subs.length ? `☑ ${subDone}/${subs.length} • ` : ""}${formatShortDate(t.dueDate)}</span>
            </div>
          </article>
        `;
      }).join("");
    }
  }

  // Render Table Rows
  if (tableBodyEl) {
    if (!tasks.length) {
      tableBodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px;" class="muted-text">Tidak ada tugas yang cocok dengan filter saat ini.</td></tr>`;
    } else {
      tableBodyEl.innerHTML = tasks.map((t) => {
        const divObj = getDivisionById(t.divisionId);
        const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
        const subDone = subs.filter((s) => s.done).length;
        const divBadge = divObj
          ? `<span class="div-tag" style="background:${divObj.color}18; color:${divObj.color};">${escapeHtml(divObj.name)}</span>`
          : "";

        return `
          <tr data-open-task="${escapeHtml(t.id)}">
            <td>
              <span class="tbl-task-title">${escapeHtml(t.title)}</span>
              ${subs.length ? `<span class="tbl-subtask-hint">☑ ${subDone}/${subs.length} sub-tugas</span>` : ""}
            </td>
            <td class="tbl-instruction">${escapeHtml(t.description || "-")}</td>
            <td>
              <div class="tbl-member-cell">
                <span>${escapeHtml(t.assigneeName || "Seluruh anggota")}</span>
                ${divBadge}
              </div>
            </td>
            <td><span class="badge diff-${escapeHtml(t.difficulty || "medium")}">${DIFF_LABELS[t.difficulty] || "Sedang"}</span></td>
            <td><span class="badge badge-${escapeHtml(t.status || "todo")}">${STATUS_LABELS[t.status] || "Belum dimulai"}</span></td>
            <td style="white-space:nowrap;">${formatShortDate(t.dueDate)}</td>
          </tr>
        `;
      }).join("");
    }
  }
}

// ── CALENDAR TAB ──
function renderCalendar() {
  const titleEl = document.getElementById("calendar-month-title");
  const gridEl = document.getElementById("calendar-days-grid");
  if (!titleEl || !gridEl) return;

  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  titleEl.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateKey();

  let html = "";
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day other-month"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayTasks = state.tasks.filter((t) => t.dueDate === key);
    const isToday = key === todayKey;
    const isSelected = key === state.calendarSelectedDate;

    html += `
      <div class="cal-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" data-cal-date="${key}">
        <span class="cal-day-num">${day}</span>
        <div class="cal-dots">
          ${dayTasks.map(() => `<span class="cal-dot"></span>`).join("")}
        </div>
      </div>
    `;
  }
  gridEl.innerHTML = html;

  const selLabel = document.getElementById("calendar-selected-date-label");
  const selList = document.getElementById("calendar-selected-tasks");
  const matching = state.tasks.filter((t) => t.dueDate === state.calendarSelectedDate);
  if (selLabel) selLabel.textContent = `Tugas jatuh tempo pada ${formatShortDate(state.calendarSelectedDate)}`;
  if (selList) {
    selList.innerHTML = matching.length
      ? matching.map((t) => `
          <div class="list-row-item clickable" data-open-task="${escapeHtml(t.id)}">
            <div class="list-row-main">
              <strong>${escapeHtml(t.title)}</strong>
              <span>Penanggung jawab: ${escapeHtml(t.assigneeName || "-")}</span>
            </div>
            <span class="badge badge-${escapeHtml(t.status || "todo")}">${STATUS_LABELS[t.status]}</span>
          </div>
        `).join("")
      : `<p class="muted-text">Tidak ada tenggat tugas pada tanggal ini.</p>`;
  }
}

// ── ACTIVITY, ANNOUNCEMENTS, MEMBERS, DIVISIONS ──
function renderWorkspaceActivity() {
  const el = document.getElementById("activity-feed-list");
  if (!el) return;
  el.innerHTML = state.activities.length
    ? state.activities.map((a) => `
        <div class="list-row-item">
          <div class="list-row-main">
            <strong>${escapeHtml(a.text)}</strong>
            <span>${escapeHtml(a.time || "Baru saja")}</span>
          </div>
        </div>
      `).join("")
    : `<p class="muted-text">Belum ada aktivitas tercatat.</p>`;
}

function renderWorkspaceAnnouncements() {
  const el = document.getElementById("announcements-list");
  if (!el) return;
  el.innerHTML = state.announcements.length
    ? state.announcements.map((a) => `
        <div class="list-row-item">
          <div class="list-row-main">
            <strong>${escapeHtml(a.title)}</strong>
            <span>${escapeHtml(a.body)}</span>
            <span style="margin-top:4px;">Oleh ${escapeHtml(a.author || "Mentor")} • ${escapeHtml(a.time || "")}</span>
          </div>
        </div>
      `).join("")
    : `<p class="muted-text">Belum ada pengumuman di ruang kerja ini.</p>`;
}

function renderWorkspaceMembers() {
  const el = document.getElementById("members-list");
  if (!el) return;
  const isMentor = isCurrentUserMentor();
  el.innerHTML = state.members.map((m) => {
    const divObj = getDivisionById(m.divisionId);
    return `
      <div class="member-card">
        <div class="member-card-head">
          <span class="avatar">${escapeHtml((m.name || "U").charAt(0).toUpperCase())}</span>
          <div style="flex:1; min-width:0;">
            <strong style="display:flex; align-items:center; gap:6px;">
              ${escapeHtml(m.name)}
              <span class="presence-dot ${m.online ? "online" : ""}" title="${m.online ? "Online" : "Offline"}"></span>
            </strong>
            <span class="muted-xs">${m.role === "mentor" ? "Mentor" : "Anggota"}${divObj ? ` • ${escapeHtml(divObj.name)}` : ""}</span>
          </div>
        </div>
        ${isMentor && m.role !== "mentor" ? `
          <select class="select-sm" data-assign-member-div="${escapeHtml(m.uid)}">
            <option value="">Tanpa Divisi</option>
            ${state.divisions.map((d) => `<option value="${escapeHtml(d.id)}" ${m.divisionId === d.id ? "selected" : ""}>${escapeHtml(d.name)}</option>`).join("")}
          </select>
        ` : ""}
      </div>
    `;
  }).join("");
}

function renderWorkspaceDivisions() {
  const el = document.getElementById("divisions-list");
  if (!el) return;
  el.innerHTML = state.divisions.length
    ? state.divisions.map((d) => `
        <div class="list-row-item">
          <div class="list-row-main">
            <strong style="color:${escapeHtml(d.color || "#ea580c")};">● ${escapeHtml(d.name)}</strong>
            <span>${state.members.filter((m) => m.divisionId === d.id).length} anggota tergabung</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm text-danger" data-delete-div="${escapeHtml(d.id)}">Hapus</button>
        </div>
      `).join("")
    : `<p class="muted-text">Belum ada divisi yang dibuat.</p>`;
}

// ── TASK DETAIL MODAL ──
function renderTaskDetailModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId) || state.allMyTasks.find((t) => t.id === taskId);
  if (!task) return;
  state.selectedTaskId = taskId;

  document.getElementById("modal-task-title").textContent = task.title;
  document.getElementById("modal-task-badges").innerHTML = `
    <span class="badge diff-${escapeHtml(task.difficulty || "medium")}">${DIFF_LABELS[task.difficulty] || "Sedang"}</span>
    <span class="badge badge-${escapeHtml(task.status || "todo")}">${STATUS_LABELS[task.status] || "Belum dimulai"}</span>
  `;
  document.getElementById("modal-task-meta").innerHTML = `
    <span><strong>Penerima:</strong> ${escapeHtml(task.assigneeName || "-")}</span>
    <span><strong>Mulai:</strong> ${formatShortDate(task.startDate)}</span>
    <span><strong>Tenggat:</strong> ${formatShortDate(task.dueDate)}</span>
    ${task.driveUrl ? `<a href="${escapeHtml(task.driveUrl)}" target="_blank" rel="noopener" class="text-link">Buka Folder Drive &rarr;</a>` : ""}
  `;
  document.getElementById("modal-task-desc").textContent = task.description || "Tidak ada instruksi tambahan.";
  document.getElementById("modal-task-status-select").value = task.status || "todo";

  const isMentor = isCurrentUserMentor();
  document.getElementById("mentor-review-actions")?.classList.toggle("hidden", !isMentor);

  // Subtasks
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const subDone = subs.filter((s) => s.done).length;
  document.getElementById("modal-subtask-progress").textContent = `${subDone}/${subs.length}`;
  document.getElementById("modal-subtasks-list").innerHTML = subs.length
    ? subs.map((s, idx) => `
        <div class="subtask-row ${s.done ? "done" : ""}">
          <label>
            <input type="checkbox" data-toggle-subtask="${idx}" ${s.done ? "checked" : ""} />
            <span>${escapeHtml(s.text)}</span>
          </label>
        </div>
      `).join("")
    : `<p class="muted-xs">Belum ada sub-tugas.</p>`;

  // Attachments
  const atts = Array.isArray(task.attachments) ? task.attachments : [];
  document.getElementById("modal-attachments-list").innerHTML = atts.length
    ? atts.map((a) => `
        <div class="list-row-item">
          <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener" class="text-link">${escapeHtml(a.label)} &rarr;</a>
        </div>
      `).join("")
    : `<p class="muted-xs">Belum ada lampiran tautan.</p>`;

  // Comments
  const comments = Array.isArray(task.comments) ? task.comments : [];
  document.getElementById("modal-comments-list").innerHTML = comments.length
    ? comments.map((c) => `
        <div class="comment-bubble">
          <div class="comment-head">
            <strong>${escapeHtml(c.author)}</strong>
            <span>${escapeHtml(c.time || "")}</span>
          </div>
          <p>${escapeHtml(c.text)}</p>
        </div>
      `).join("")
    : `<p class="muted-xs">Belum ada diskusi pada tugas ini.</p>`;

  document.getElementById("task-detail-modal").classList.remove("hidden");
}

// ── EVENT BINDINGS ──
function bindEvents() {
  // Navigation tabs (Dasbor | Ruang Kerja)
  document.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchRoute(btn.dataset.route);
    });
  });
  document.getElementById("brand-home-btn")?.addEventListener("click", () => switchRoute("dashboard"));

  // Theme Switchers
  document.querySelectorAll("[data-theme-select]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themeSelect);
      savePersonalState();
      showToast(`Tema diubah ke ${btn.textContent.trim()}`);
    });
  });

  // Workspace Sub-tabs
  document.querySelectorAll("[data-ws-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.wsTab = btn.dataset.wsTab;
      document.querySelectorAll("[data-ws-tab]").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".ws-panel").forEach((p) => p.classList.add("hidden"));
      document.getElementById(`ws-panel-${state.wsTab}`)?.classList.remove("hidden");
    });
  });

  // Toggle Collapsible Create Task Form ("Sembunyikan Form" / "Tampilkan Form")
  document.getElementById("toggle-create-task-form-btn")?.addEventListener("click", () => {
    state.isCreateFormCollapsed = !state.isCreateFormCollapsed;
    renderWorkspace();
  });

  // Toggle Board View Mode ("Kanban" | "Tabel")
  document.querySelectorAll("[data-board-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.boardViewMode = btn.dataset.boardView;
      renderTasksBoard();
    });
  });

  // Save Target Hari Ini (Workspace)
  document.getElementById("ws-save-goal-btn")?.addEventListener("click", () => {
    const ws = getActiveWorkspace();
    if (!ws) return;
    const val = document.getElementById("ws-daily-goal-input").value.trim();
    const key = `${ws.id}_${toDateKey()}`;
    state.personal.wsDailyGoals[key] = val;
    savePersonalState();
    renderWorkspaceDailyGoal(ws.id);
    showToast("Target hari ini berhasil disimpan.");
  });

  // Create Task Submit
  document.getElementById("create-task-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ws = getActiveWorkspace();
    if (!ws) return;

    const title = document.getElementById("task-title-input").value.trim();
    if (!title) return;

    const assigneeVal = document.getElementById("task-assignee-select").value;
    const difficulty = document.getElementById("task-difficulty-select").value;
    const driveMode = document.getElementById("task-drive-mode").value;
    const driveInput = document.getElementById("task-drive-url-input").value.trim();
    const startDate = document.getElementById("task-start-input").value;
    const dueDate = document.getElementById("task-due-input").value;
    const description = document.getElementById("task-desc-input").value.trim();
    const rawSubs = document.getElementById("task-subtasks-input").value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const driveUrl =
      driveMode === "none" ? "" : driveMode === "custom" ? driveInput : driveInput || ws.driveUrl || "";

    // Expand recipients if ALL or DIV:id
    let targets = [];
    if (assigneeVal === "ALL") {
      targets = state.members.filter((m) => m.role !== "mentor");
      if (!targets.length) targets = state.members;
    } else if (assigneeVal.startsWith("DIV:")) {
      const divId = assigneeVal.slice(4);
      targets = state.members.filter((m) => m.divisionId === divId);
    } else {
      const m = state.members.find((x) => x.uid === assigneeVal);
      if (m) targets = [m];
    }

    if (!targets.length) {
      showToast("Tidak ada anggota pada pilihan target tersebut.");
      return;
    }

    for (const target of targets) {
      const newTask = {
        workspaceId: ws.id,
        workspaceName: ws.name,
        title,
        description,
        assigneeId: target.uid,
        assigneeName: target.name,
        divisionId: target.divisionId || "",
        difficulty,
        status: "todo",
        startDate,
        dueDate,
        driveUrl,
        subtasks: rawSubs.map((text, idx) => ({ id: `sub_${Date.now()}_${idx}`, text, done: false })),
        attachments: [],
        comments: [],
        createdAt: Date.now()
      };

      if (isDemoMode) {
        newTask.id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        state.tasks.unshift(newTask);
        state.allMyTasks.unshift(newTask);
      } else if (db) {
        await addDoc(collection(db, "workspaces", ws.id, "tasks"), newTask);
      }
    }

    e.target.reset();
    renderAll();
    showToast(`Tugas dibagikan kepada ${targets.length} penerima.`);
  });

  // Save Workspace Drive URL
  document.getElementById("save-ws-drive-btn")?.addEventListener("click", async () => {
    const ws = getActiveWorkspace();
    if (!ws) return;
    const url = document.getElementById("task-drive-url-input").value.trim();
    ws.driveUrl = url;
    if (!isDemoMode && db) {
      await updateDoc(doc(db, "workspaces", ws.id), { driveUrl: url });
    }
    showToast("Tautan folder Drive utama disimpan.");
  });

  // Board Filters
  ["task-search-input", "task-filter-status", "task-filter-difficulty", "task-filter-division", "task-filter-assignee", "task-sort-select"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", renderTasksBoard);
    document.getElementById(id)?.addEventListener("change", renderTasksBoard);
  });

  document.getElementById("quick-review-filter-btn")?.addEventListener("click", (e) => {
    state.quickReviewOnly = !state.quickReviewOnly;
    e.currentTarget.classList.toggle("btn-primary", state.quickReviewOnly);
    renderTasksBoard();
  });

  // Delegated Clicks (Open Task, Toggle Habit, Jump WS, Close Modal, etc.)
  document.addEventListener("click", async (e) => {
    // Open Task Detail
    const openTaskEl = e.target.closest("[data-open-task]");
    if (openTaskEl) {
      renderTaskDetailModal(openTaskEl.dataset.openTask);
      return;
    }

    // Jump to Workspace & Task from Dashboard
    const jumpWsEl = e.target.closest("[data-jump-ws]");
    if (jumpWsEl) {
      state.activeWorkspaceId = jumpWsEl.dataset.jumpWs;
      if (!isDemoMode) subscribeActiveWorkspaceDetails(state.activeWorkspaceId);
      switchRoute("workspace");
      if (jumpWsEl.dataset.jumpTask) {
        renderTaskDetailModal(jumpWsEl.dataset.jumpTask);
      }
      return;
    }

    // Select Workspace from Dashboard Preview
    const selWsEl = e.target.closest("[data-select-ws]");
    if (selWsEl) {
      state.activeWorkspaceId = selWsEl.dataset.selectWs;
      if (!isDemoMode) subscribeActiveWorkspaceDetails(state.activeWorkspaceId);
      switchRoute("workspace");
      return;
    }

    // Toggle Habit
    const toggleHabEl = e.target.closest("[data-toggle-habit]");
    if (toggleHabEl) {
      const id = toggleHabEl.dataset.toggleHabit;
      const key = toDateKey();
      const arr = state.personal.habitLogs[key] || [];
      if (arr.includes(id)) {
        state.personal.habitLogs[key] = arr.filter((x) => x !== id);
      } else {
        state.personal.habitLogs[key] = [...arr, id];
      }
      savePersonalState();
      renderDashboard();
      return;
    }

    // Delete Habit
    const delHabEl = e.target.closest("[data-delete-habit]");
    if (delHabEl) {
      const id = delHabEl.dataset.deleteHabit;
      state.personal.habits = state.personal.habits.filter((h) => h.id !== id);
      savePersonalState();
      renderDashboard();
      return;
    }

    // Mood Button Select
    const moodBtn = e.target.closest("[data-mood]");
    if (moodBtn) {
      const score = Number(moodBtn.dataset.mood);
      const key = toDateKey();
      const existing = state.personal.moodLogs[key] || {};
      state.personal.moodLogs[key] = { score, note: existing.note || "" };
      savePersonalState();
      renderDashboard();
      showToast("Suasana hati hari ini dicatat.");
      return;
    }

    // Calendar Date Select
    const calDayEl = e.target.closest("[data-cal-date]");
    if (calDayEl) {
      state.calendarSelectedDate = calDayEl.dataset.calDate;
      renderCalendar();
      return;
    }

    // Close Modal
    const closeBtn = e.target.closest("[data-close-modal]");
    if (closeBtn) {
      document.getElementById(closeBtn.dataset.closeModal)?.classList.add("hidden");
      state.selectedTaskId = null;
      return;
    }
    if (e.target.classList.contains("modal-backdrop")) {
      e.target.classList.add("hidden");
      state.selectedTaskId = null;
    }
  });

  // Save Mood Journal Note
  document.getElementById("save-mood-journal-btn")?.addEventListener("click", () => {
    const key = toDateKey();
    const note = document.getElementById("daily-journal-input").value.trim();
    const existing = state.personal.moodLogs[key] || { score: 4 };
    state.personal.moodLogs[key] = { ...existing, note };
    savePersonalState();
    renderDashboard();
    showToast("Catatan jurnal harian disimpan.");
  });

  // Add Habit Modal & Form
  document.getElementById("open-add-habit-btn")?.addEventListener("click", () => {
    document.getElementById("habit-form").reset();
    document.getElementById("habit-modal").classList.remove("hidden");
  });

  document.getElementById("habit-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("habit-name-input").value.trim();
    if (!name) return;
    state.personal.habits.push({
      id: `hab_${Date.now()}`,
      name,
      category: document.getElementById("habit-category-select").value,
      freq: document.getElementById("habit-freq-select").value,
      createdAt: toDateKey()
    });
    savePersonalState();
    document.getElementById("habit-modal").classList.add("hidden");
    renderDashboard();
    showToast("Kebiasaan baru ditambahkan.");
  });

  // Profile Modal
  document.getElementById("open-profile-btn")?.addEventListener("click", () => {
    document.getElementById("profile-modal").classList.remove("hidden");
  });

  // Dashboard Task Filter
  document.getElementById("dash-task-filter")?.addEventListener("change", renderDashboardTaskList);

  // Dashboard Quick Buttons -> Jump to Workspace
  document.getElementById("dash-new-ws-btn")?.addEventListener("click", () => {
    state.activeWorkspaceId = null;
    switchRoute("workspace");
  });
  document.getElementById("dash-join-ws-btn")?.addEventListener("click", () => {
    state.activeWorkspaceId = null;
    switchRoute("workspace");
  });

  // Workspace Selector Change
  document.getElementById("workspace-select")?.addEventListener("change", (e) => {
    state.activeWorkspaceId = e.target.value || null;
    if (!isDemoMode && state.activeWorkspaceId) subscribeActiveWorkspaceDetails(state.activeWorkspaceId);
    renderWorkspace();
  });

  // Copy Invite Code
  document.getElementById("copy-invite-code-btn")?.addEventListener("click", () => {
    const code = document.getElementById("ws-invite-code-text").textContent;
    navigator.clipboard?.writeText(code);
    showToast(`Kode undangan ${code} disalin!`);
  });

  // Modal Task Status Save & Subtasks & Comments
  document.getElementById("modal-save-status-btn")?.addEventListener("click", async () => {
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    if (!task) return;
    const newStatus = document.getElementById("modal-task-status-select").value;
    task.status = newStatus;
    if (!isDemoMode && db) {
      await updateDoc(doc(db, "workspaces", task.workspaceId, "tasks", task.id), { status: newStatus });
    }
    renderAll();
    renderTaskDetailModal(task.id);
    showToast(`Status diubah menjadi ${STATUS_LABELS[newStatus]}.`);
  });

  document.getElementById("mentor-approve-btn")?.addEventListener("click", async () => {
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    if (!task) return;
    task.status = "done";
    if (!isDemoMode && db) {
      await updateDoc(doc(db, "workspaces", task.workspaceId, "tasks", task.id), { status: "done" });
    }
    renderAll();
    renderTaskDetailModal(task.id);
    showToast("Tugas disetujui selesai.");
  });

  document.getElementById("mentor-revision-btn")?.addEventListener("click", async () => {
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    if (!task) return;
    task.status = "revision";
    if (!isDemoMode && db) {
      await updateDoc(doc(db, "workspaces", task.workspaceId, "tasks", task.id), { status: "revision" });
    }
    renderAll();
    renderTaskDetailModal(task.id);
    showToast("Tugas dikembalikan untuk revisi.");
  });

  document.getElementById("modal-add-comment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    const input = document.getElementById("modal-comment-input");
    const text = input.value.trim();
    if (!task || !text) return;
    const comment = {
      author: state.user?.displayName || "Pengguna",
      text,
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    };
    task.comments = [...(task.comments || []), comment];
    if (!isDemoMode && db) {
      await updateDoc(doc(db, "workspaces", task.workspaceId, "tasks", task.id), { comments: arrayUnion(comment) });
    }
    input.value = "";
    renderTaskDetailModal(task.id);
  });

  // Calendar Prev / Today / Next
  document.getElementById("cal-prev-btn")?.addEventListener("click", () => {
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById("cal-next-btn")?.addEventListener("click", () => {
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  document.getElementById("cal-today-btn")?.addEventListener("click", () => {
    const now = new Date();
    state.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    state.calendarSelectedDate = toDateKey(now);
    renderCalendar();
  });

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    if (!isDemoMode && auth) {
      await signOut(auth);
    } else {
      showToast("Sedang dalam mode pratinjau lokal.");
    }
  });
}

function switchRoute(route) {
  state.route = route;
  document.querySelectorAll("[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
  document.getElementById("dashboard-view")?.classList.toggle("hidden", route !== "dashboard");
  document.getElementById("workspace-view")?.classList.toggle("hidden", route !== "workspace");
  renderAll();
}

// ── BOOT ──
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initAuth();
});
