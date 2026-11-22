// Tampilan papan pengumuman dan pelacak "dibaca oleh". Modul ini tidak menyentuh Firestore langsung:
// penulisan status baca dilakukan lewat fungsi mark() yang dikirim dari script.js.

const initials = name => (name || '?').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?';
// Keamanan: ID hanya boleh huruf, angka, _ dan - sebelum masuk ke atribut handler inline.
const sid = v => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '');
const isLong = body => body.length > 220 || body.split('\n').length > 3;

/** Hitung pembaca yang sah: anggota saat ini, selain penulis. */
export function readStats(a, members) {
  const audience = members.filter(m => m.id !== a.uid);
  const readers = audience.filter(m => (a.readBy || []).includes(m.id));
  return { total: audience.length, readers };
}

function readsHtml(a, { members, isLead, showReads, escapeHtml }) {
  if (!showReads) return '';
  const { total, readers } = readStats(a, members);
  if (!total) return '';
  const label = `Dibaca oleh ${readers.length} dari ${total} anggota`;
  if (!isLead || !readers.length) return `<span class="ann-reads">${label}</span>`;
  return `<details class="ann-reads"><summary>${label}</summary><ul>${readers.map(m => `<li>${escapeHtml(m.name)}</li>`).join('')}</ul></details>`;
}

function actionsHtml(a, isLead) {
  if (!isLead) return '';
  return `<div class="announce-actions">
    <button type="button" class="btn-sm btn-ghost" onclick="togglePinAnnouncement('${sid(a.id)}')">${a.pinned ? 'Lepas pin' : 'Sematkan'}</button>
    <button type="button" class="btn-sm btn-ghost" onclick="editAnnouncement('${sid(a.id)}')">Edit</button>
    <button type="button" class="btn-sm btn-ghost" onclick="deleteAnnouncement('${sid(a.id)}')">Hapus</button>
  </div>`;
}

function cardHtml(a, ctx) {
  const { escapeHtml, fmtTime, uid } = ctx;
  const unseen = a.uid !== uid && !(a.readBy || []).includes(uid);
  const body = String(a.body || '');
  const long = isLong(body);
  return `<article class="ann-card${a.pinned ? ' ann-pinned' : ''}${unseen ? ' ann-unseen' : ''}" data-ann-id="${escapeHtml(a.id)}">
    <header class="ann-head">
      <span class="ann-avatar" aria-hidden="true">${escapeHtml(initials(a.by))}</span>
      <span class="ann-who"><strong>${escapeHtml(a.by || 'Lead')}</strong><span>${escapeHtml(fmtTime(a.createdAt))}</span></span>
      ${a.pinned ? '<span class="ann-flag">Disematkan</span>' : ''}
      ${unseen ? '<span class="ann-flag ann-new">Baru</span>' : ''}
    </header>
    <h3 class="ann-title">${escapeHtml(a.title)}</h3>
    <p class="ann-body${long ? ' is-clamped' : ''}">${escapeHtml(body)}</p>
    ${long ? '<button type="button" class="ann-more" aria-expanded="false">Selengkapnya</button>' : ''}
    <footer class="ann-foot">${readsHtml(a, ctx)}${actionsHtml(a, ctx.isLead)}</footer>
  </article>`;
}

export function announcementFeedHtml(list, ctx) {
  if (!list.length) return '<p class="empty-hint">Belum ada pengumuman dari mentor.</p>';
  const sorted = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return `<div class="ann-feed">${sorted.map(a => cardHtml(a, ctx)).join('')}</div>`;
}

/** Buka atau lipat isi pengumuman panjang. Dipasang sekali pada kontainer. */
export function bindAnnouncementList(el) {
  el.addEventListener('click', e => {
    const btn = e.target.closest('.ann-more'); if (!btn) return;
    const body = btn.closest('.ann-card').querySelector('.ann-body');
    const open = body.classList.toggle('is-clamped') === false;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Ringkas' : 'Selengkapnya';
  });
}

/**
 * Tandai pengumuman dibaca saat kartunya benar-benar terlihat. Tiap pengumuman hanya ditulis sekali per sesi.
 * Bila penulisan ditolak (mis. aturan Firestore), pelacakan dimatikan dan onUnavailable() dipanggil.
 */
export function createReadTracker({ getUid, mark, onUnavailable }) {
  const sent = new Set();
  let observer = null, ok = true;
  const dispose = () => { observer?.disconnect(); observer = null; };

  async function send(id) {
    if (!ok || sent.has(id)) return;
    sent.add(id);
    try { await mark(id); }
    catch (err) {
      ok = false; dispose();
      console.warn('Status "dibaca" tidak bisa disimpan:', err.code || err.message);
      onUnavailable?.();
    }
  }

  function observe(root, list) {
    dispose();
    if (!ok || !('IntersectionObserver' in window)) return;
    const pending = new Map(list.filter(a => a.uid !== getUid() && !(a.readBy || []).includes(getUid())).map(a => [a.id, a]));
    if (!pending.size) return;
    observer = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      const id = en.target.dataset.annId;
      if (pending.has(id)) { observer?.unobserve(en.target); send(id); }
    }), { threshold: 0.6 });
    root.querySelectorAll('.ann-card').forEach(c => { if (pending.has(c.dataset.annId)) observer.observe(c); });
  }

  return { observe, dispose, get available() { return ok; } };
}
