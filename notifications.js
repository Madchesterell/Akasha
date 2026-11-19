// Notifikasi pengguna. Satu sumber data, koleksi users/{uid}/notifications, dipakai badge dan panel.
import {
  collection, doc, onSnapshot, query, orderBy, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const KINDS = {
  task: { label: 'Tugas baru', tone: 'action' },
  report: { label: 'Laporan masuk', tone: 'action' },
  revision: { label: 'Perlu revisi', tone: 'action' },
  start: { label: 'Dimulai', tone: 'info' },
  file: { label: 'Lampiran', tone: 'info' },
  announce: { label: 'Pengumuman', tone: 'info' },
  done: { label: 'Selesai', tone: 'done' }
};
const KEEP_DAYS = 30;
const PRUNE_BATCH = 40;

const millis = ts => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : typeof ts === 'number' ? ts : 0);

function relTime(ts) {
  const ms = millis(ts);
  if (!ms) return 'baru saja';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export function createNotifications({ db, getUid, $, escapeHtml, toast, showAlert, onOpen }) {
  let items = [];
  let unsub = null;
  let pruned = false;

  const colRef = () => collection(db, 'users', getUid(), 'notifications');
  const unread = () => items.filter(n => !n.read);

  function renderBadge() {
    const n = unread().length;
    const text = n >= 100 ? '99+' : String(n);
    document.querySelectorAll('.nav-badge').forEach(b => {
      b.classList.toggle('hidden', !n);
      b.textContent = n ? text : '';
    });
    const label = n ? `Notifikasi, ${text} belum dibaca` : 'Notifikasi';
    ['notificationsNavBtn', 'notificationsNavBtnTop'].forEach(id => $(id)?.setAttribute('aria-label', label));
  }

  function itemHtml(n) {
    const kind = KINDS[n.kind] || { label: 'Info', tone: 'info' };
    const sub = [n.workspaceName, n.body].filter(Boolean).map(escapeHtml).join(' · ');
    return `<button type="button" class="dashboard-notification-item${n.read ? ' is-read' : ''}" data-notif-id="${escapeHtml(n.id)}" data-ws="${escapeHtml(n.workspaceId || '')}">
      <span class="notification-status-dot ${n.read ? 'is-read' : 'is-action'}" aria-hidden="true"></span>
      <span class="dashboard-notification-copy">
        <strong>${escapeHtml(n.title || 'Notifikasi')}</strong>
        <span class="notif-sub">${sub}</span>
        <span class="notif-time">${n.read ? '' : '<span class="sr-only">Belum dibaca, </span>'}${relTime(n.createdAt)}</span>
      </span>
      <span class="notification-kind ${kind.tone}">${kind.label}</span>
    </button>`;
  }

  function renderPreview() {
    const el = $('dashboardNotificationsList'); if (!el) return;
    const latest = [...unread(), ...items.filter(n => n.read)].slice(0, 5);
    el.innerHTML = latest.length
      ? latest.map(itemHtml).join('')
      : '<p class="empty-hint">Belum ada notifikasi. Aktivitas tugas dan pengumuman akan muncul di sini.</p>';
  }

  function renderFull() {
    const el = $('dashboardNotificationsListFull'); if (!el) return;
    const fresh = unread(), old = items.filter(n => n.read);
    if (!items.length) { el.innerHTML = '<p class="empty-hint">Belum ada notifikasi.</p>'; return; }
    el.innerHTML = (fresh.length ? `<h3 class="notif-group">Baru (${fresh.length})</h3>${fresh.map(itemHtml).join('')}` : '<p class="empty-hint">Semua notifikasi sudah dibaca.</p>')
      + (old.length ? `<h3 class="notif-group">Sebelumnya</h3>${old.map(itemHtml).join('')}` : '');
    const btn = $('markAllReadBtn'); if (btn) btn.disabled = !fresh.length;
  }

  function renderAll() {
    renderBadge(); renderPreview();
    if (!$('notificationsPanel')?.classList.contains('hidden')) renderFull();
  }

  async function markRead(id) {
    const n = items.find(x => x.id === id);
    if (!n || n.read) return;
    n.read = true; renderAll();
    try {
      const b = writeBatch(db);
      b.update(doc(db, 'users', getUid(), 'notifications', id), { read: true });
      await b.commit();
    } catch (err) {
      n.read = false; renderAll();
      console.warn('Gagal menandai dibaca:', err);
      showAlert('Status baca tidak tersimpan: ' + (err.code || err.message));
    }
  }

  async function markAll() {
    const un = unread(); if (!un.length) return;
    try {
      const b = writeBatch(db);
      un.forEach(n => b.update(doc(db, 'users', getUid(), 'notifications', n.id), { read: true }));
      await b.commit();
      un.forEach(n => { n.read = true; });
      renderAll();
      toast('Semua notifikasi dibaca', 'success');
    } catch (err) { await showAlert('Gagal menandai dibaca: ' + (err.code || err.message)); }
  }

  // Hapus notifikasi lama yang sudah dibaca agar koleksi tidak membengkak.
  async function prune() {
    if (pruned) return; pruned = true;
    const limitMs = Date.now() - KEEP_DAYS * 864e5;
    const old = items.filter(n => n.read && millis(n.createdAt) && millis(n.createdAt) < limitMs).slice(0, PRUNE_BATCH);
    if (!old.length) return;
    try {
      const b = writeBatch(db);
      old.forEach(n => b.delete(doc(db, 'users', getUid(), 'notifications', n.id)));
      await b.commit();
    } catch (err) { console.warn('Pembersihan notifikasi dilewati:', err.code || err.message); }
  }

  function handleClick(e) {
    const btn = e.target.closest('[data-notif-id]'); if (!btn) return;
    markRead(btn.dataset.notifId);
    if (btn.dataset.ws) onOpen(btn.dataset.ws);
  }
  ['dashboardNotificationsList', 'dashboardNotificationsListFull'].forEach(id => $(id)?.addEventListener('click', handleClick));

  function start() {
    stop();
    unsub = onSnapshot(query(colRef(), orderBy('createdAt', 'desc'), limit(300)), snap => {
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll(); prune();
    }, err => console.warn('Notifikasi gagal dimuat:', err));
  }
  function stop() {
    if (unsub) { unsub(); unsub = null; }
    items = []; pruned = false; renderAll();
  }

  return { start, stop, renderPreview, renderFull, markAll, markRead, unreadCount: () => unread().length };
}
