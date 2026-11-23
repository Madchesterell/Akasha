// Profil pengguna: tampilan gaya media sosial, edit biodata, dan logo institusi.
// Data publik profil ada di koleksi profiles/{uid}. Data pribadi (mood, kebiasaan) tidak pernah ditampilkan di sini.
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const LIMITS = { tagline: 80, bio: 280, institution: 60, location: 60, linkLabel: 24, links: 3 };
const LOGO = { side: 256, maxChars: 60000, maxFileBytes: 3 * 1024 * 1024, loadTimeoutMs: 8000 };
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const initials = name => (name || '?').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?';
const clip = (v, n) => String(v || '').trim().slice(0, n);
const fmtDate = d => d ? d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '';

/** Logo dari database dianggap tidak tepercaya: hanya data-URL gambar atau tautan https yang lolos. */
export function safeLogoSrc(logo, safeUrl) {
  if (!logo || typeof logo.src !== 'string') return '';
  if (logo.kind === 'data') return DATA_URL.test(logo.src) && logo.src.length <= LOGO.maxChars + 2000 ? logo.src : '';
  if (logo.kind === 'link') { const u = safeUrl(logo.src); return u.startsWith('https://') ? u : ''; }
  return '';
}

function rasterize(source, w, h) {
  const scale = Math.min(1, LOGO.side / Math.max(w, h, 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const out = c.toDataURL('image/webp', q);
    if (out.startsWith('data:image/webp') && out.length <= LOGO.maxChars) return out;
  }
  const png = c.toDataURL('image/png');
  if (png.length <= LOGO.maxChars) return png;
  throw new Error('Gambar terlalu rumit untuk disimpan. Coba gambar yang lebih sederhana.');
}

function loadImage(src, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => reject(new Error('timeout')), LOGO.loadTimeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('gagal dimuat')); };
    img.src = src;
  });
}

export async function logoFromFile(file) {
  if (!FILE_TYPES.includes(file.type)) throw new Error('Format harus PNG, JPG, WebP, atau GIF.');
  if (file.size > LOGO.maxFileBytes) throw new Error('Ukuran file maksimal 3 MB.');
  const bmp = await createImageBitmap(file);
  try { return { kind: 'data', src: rasterize(bmp, bmp.width, bmp.height) }; } finally { bmp.close?.(); }
}

/** Coba salin gambar dari web. Bila situs sumber melarang (CORS), simpan tautannya saja. */
export async function logoFromUrl(raw, safeUrl) {
  const url = safeUrl(raw);
  if (!url.startsWith('https://')) throw new Error('Tautan logo harus diawali https://');
  let img = null;
  try { img = await loadImage(url, true); } catch { /* lanjut ke mode tautan */ }
  if (img) return { logo: { kind: 'data', src: rasterize(img, img.naturalWidth || LOGO.side, img.naturalHeight || LOGO.side) }, copied: true };
  try { await loadImage(url, false); } catch { throw new Error('Gambar tidak bisa dimuat dari tautan itu.'); }
  return { logo: { kind: 'link', src: url }, copied: false };
}

export function createProfile(ctx) {
  const { db, $, escapeHtml: esc, safeUrl, toast, showAlert } = ctx;
  const cache = new Map();
  let editing = false;
  let draftLogo;          // undefined = tidak berubah, null = dihapus, objek = logo baru
  let draftLogoNote = '';

  async function load(uid) {
    if (cache.has(uid)) return { ok: true, data: cache.get(uid) };
    try {
      const snap = await getDoc(doc(db, 'profiles', uid));
      const data = snap.exists() ? snap.data() : {};
      cache.set(uid, data);
      return { ok: true, data };
    } catch (err) {
      console.warn('Profil gagal dimuat:', err.code || err.message);
      return { ok: false, data: {} };
    }
  }

  const logoHtml = (p, cls = 'profile-logo') => {
    const src = safeLogoSrc(p.logo, safeUrl);
    return src ? `<img class="${cls}" src="${esc(src)}" alt="Logo ${esc(p.institution || 'institusi')}" width="28" height="28" referrerpolicy="no-referrer" decoding="async" data-logo>` : '';
  };

  function ownStats() {
    const today = ctx.localDate();
    let done = 0, active = 0, late = 0;
    ctx.getWorkspaces().forEach(ws => (ws.tasks || []).filter(t => t.assignee === ws.workerName).forEach(t => {
      if (t.status === 'done') done++;
      else { active++; if (t.endDate && t.endDate < today) late++; }
    }));
    return [['Ruang kerja', ctx.getWorkspaces().length], ['Tugas selesai', done], ['Sedang berjalan', active], ['Terlambat', late]];
  }
  function memberStats(m) {
    const st = ctx.getState(), today = ctx.localDate();
    if (m.role === 'mentor') {
      return [['Anggota dibimbing', st.members.filter(x => x.role === 'worker').length], ['Tugas di ruang ini', st.tasks.length], ['Menunggu validasi', st.tasks.filter(t => t.status === 'review').length]];
    }
    const mine = st.tasks.filter(t => t.assignee === m.name);
    const open = mine.filter(t => t.status !== 'done');
    return [['Tugas selesai', mine.length - open.length], ['Sedang berjalan', open.length], ['Terlambat', open.filter(t => t.endDate && t.endDate < today).length]];
  }

  function viewHtml({ name, chips, profile, stats, rows, since, own, unavailable }) {
    const links = (profile.links || []).map(l => ({ label: clip(l.label, LIMITS.linkLabel), url: safeUrl(l.url) })).filter(l => l.url);
    const org = [profile.institution, profile.location].filter(Boolean).map(esc).join(' · ');
    return `<article class="profile-card">
      <div class="profile-cover"><svg class="scene" aria-hidden="true" focusable="false"><use href="#scene" width="100%" height="100%"/></svg></div>
      <div class="profile-main">
        <div class="profile-avatar" aria-hidden="true">${esc(initials(name))}</div>
        <div class="profile-id">
          <h2 class="profile-name"${own ? ' id="profileName"' : ''} tabindex="-1">${esc(name)}</h2>
          ${profile.tagline ? `<p class="profile-tagline">${esc(profile.tagline)}</p>` : (own ? '<p class="profile-tagline is-empty">Tambahkan deskripsi singkat tentang dirimu.</p>' : '')}
          <ul class="profile-chips">${chips.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
          ${(org || logoHtml(profile)) ? `<p class="profile-org">${logoHtml(profile)}<span>${org || ''}</span></p>` : ''}
        </div>
                ${own ? '<div class="profile-actions"><button type="button" class="btn-sm btn-solid" data-pf="edit">Edit profil</button><button type="button" class="btn-sm btn-ghost" data-pf="settings">Pengaturan akun</button><button type="button" class="btn-sm btn-danger" data-pf="logout">Keluar</button></div>' : ''}
      </div>
      ${unavailable ? '<p class="profile-note" role="status">Biodata belum bisa dimuat. Info dasar tetap ditampilkan.</p>' : ''}
      <dl class="profile-stats">${stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="profile-grid">
        <section class="profile-box"><h3>Tentang</h3>${profile.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : `<p class="empty-hint">${own ? 'Belum ada bio. Ceritakan peran dan minatmu.' : 'Belum ada bio.'}</p>`}</section>
        <section class="profile-box"><h3>Ruang kerja dan divisi</h3>${rows.length ? `<ul class="profile-rows">${rows.map(r => `<li><span>${esc(r.name)}</span><span class="role-badge ${r.role}">${r.role === 'mentor' ? 'Lead' : 'Member'}</span><span class="profile-div">${esc(r.division)}</span></li>`).join('')}</ul>` : '<p class="empty-hint">Belum bergabung ke ruang kerja.</p>'}</section>
        <section class="profile-box"><h3>Tautan</h3>${links.length ? `<ul class="profile-links">${links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l.label || new URL(l.url).hostname)}</a></li>`).join('')}</ul>` : '<p class="empty-hint">Belum ada tautan.</p>'}${since ? `<p class="profile-since">Bergabung sejak ${esc(since)}</p>` : ''}</section>
      </div>
    </article>`;
  }

  function hideBrokenLogos(root) {
    root.querySelectorAll('img[data-logo]').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  }

  async function renderOwn() {
    const host = $('profileView'); if (!host) return;
    const user = ctx.getUser(); if (!user) return;
    if (editing) return renderEdit();
    const { ok, data } = await load(user.uid);
    const name = user.displayName || user.email?.split('@')[0] || 'Pengguna';
    const rows = ctx.getWorkspaces().map(ws => ({ name: ws.name, role: ws.role, division: ws.division || 'Umum' }));
    const chips = [...new Set(rows.map(r => r.division))].slice(0, 4);
    const since = fmtDate(user.metadata?.creationTime ? new Date(user.metadata.creationTime) : null);
    host.innerHTML = viewHtml({ name, chips, profile: data, stats: ownStats(), rows, since, own: true, unavailable: !ok });
    hideBrokenLogos(host);
  }

  async function openMember(uid) {
    const user = ctx.getUser(); if (!user) return;
    if (uid === user.uid) return ctx.goOwnProfile();
    const st = ctx.getState();
    const m = st.members.find(x => x.id === uid); if (!m) return;
    const modal = $('profileModal'), body = $('profileModalBody');
    body.innerHTML = '<p class="empty-hint">Memuat profil…</p>';
    modal.classList.remove('hidden');
    const { ok, data } = await load(uid);
    const since = fmtDate(m.joinedAt?.toDate ? m.joinedAt.toDate() : null);
    const rows = [{ name: st.workspaceName, role: m.role, division: m.division || 'Umum' }];
    body.innerHTML = viewHtml({ name: m.name, chips: [m.role === 'mentor' ? 'Lead' : 'Member', m.division || 'Umum'], profile: data, stats: memberStats(m), rows, since, own: false, unavailable: !ok });
    hideBrokenLogos(body);
    body.querySelector('.profile-name')?.focus();
  }

  // ---------- Mode edit ----------
  function logoPreview() {
    const user = ctx.getUser();
    const current = cache.get(user.uid)?.logo;
    const logo = draftLogo === undefined ? current : draftLogo;
    const src = safeLogoSrc(logo, safeUrl);
    $('pfLogoPreview').innerHTML = src
      ? `<img src="${esc(src)}" alt="Pratinjau logo" width="64" height="64" referrerpolicy="no-referrer">`
      : '<span class="pf-logo-empty">Belum ada logo</span>';
    $('pfLogoRemove').disabled = !src;
    $('pfLogoStatus').textContent = draftLogoNote;
  }

  function renderEdit() {
    const user = ctx.getUser(); const p = cache.get(user.uid) || {};
    const link = i => p.links?.[i] || { label: '', url: '' };
    const row = i => `<div class="form-row pf-link"><div class="form-group"><label for="pfLinkLabel${i}">Nama tautan ${i + 1}</label><input id="pfLinkLabel${i}" type="text" maxlength="${LIMITS.linkLabel}" value="${esc(link(i).label)}" placeholder="Portofolio"></div><div class="form-group"><label for="pfLinkUrl${i}">Alamat tautan ${i + 1}</label><input id="pfLinkUrl${i}" type="url" value="${esc(link(i).url)}" placeholder="https://"></div></div>`;
    $('profileView').innerHTML = `<form class="card profile-edit" id="profileForm" novalidate>
      <div class="section-head"><div><h2 id="profileName" tabindex="-1">Edit profil</h2><p class="subtitle">Profil ini bisa dilihat anggota satu ruang kerja denganmu. Mood dan kebiasaan tidak ikut tampil.</p></div></div>
      <div class="form-group"><label for="pfTagline">Deskripsi singkat</label><input id="pfTagline" type="text" maxlength="${LIMITS.tagline}" value="${esc(p.tagline)}" placeholder="Contoh: Editor video, suka cerita pendek"></div>
      <div class="form-group"><label for="pfBio">Bio <span class="pf-count" id="pfBioCount"></span></label><textarea id="pfBio" rows="4" maxlength="${LIMITS.bio}" placeholder="Ceritakan peran, minat, dan hal yang sedang kamu kerjakan.">${esc(p.bio)}</textarea></div>
      <div class="form-row"><div class="form-group"><label for="pfInstitution">Institusi atau organisasi</label><input id="pfInstitution" type="text" maxlength="${LIMITS.institution}" value="${esc(p.institution)}"></div><div class="form-group"><label for="pfLocation">Lokasi</label><input id="pfLocation" type="text" maxlength="${LIMITS.location}" value="${esc(p.location)}"></div></div>
      <fieldset class="pf-logo"><legend>Logo institusi</legend>
        <div class="pf-logo-row"><div class="pf-logo-preview" id="pfLogoPreview"></div>
          <div class="pf-logo-actions">
            <label class="btn-sm btn-ghost file-btn"><span>Unggah gambar</span><input type="file" id="pfLogoFile" class="sr-only" accept="image/png,image/jpeg,image/webp,image/gif"></label>
            <button type="button" class="btn-sm btn-ghost" id="pfLogoRemove">Hapus logo</button>
          </div></div>
        <div class="form-group"><label for="pfLogoUrl">Atau tautkan dari web (https)</label><div class="input-with-btn"><input id="pfLogoUrl" type="url" placeholder="https://situs.id/logo.png"><button type="button" class="btn-sm btn-solid" id="pfLogoFetch">Ambil logo</button></div></div>
        <p class="status-text" id="pfLogoStatus" role="status"></p>
        <p class="status-text">Gambar diperkecil di perangkatmu dan disimpan sebagai salinan. Bila situs sumber melarang penyalinan, yang tersimpan hanya tautannya dan gambar bisa hilang jika situs itu berubah.</p>
      </fieldset>
      <fieldset class="pf-links"><legend>Tautan (maksimal ${LIMITS.links})</legend>${[0, 1, 2].map(row).join('')}</fieldset>
      <div class="dialog-actions"><button type="button" class="btn-sm btn-ghost" data-pf="cancel">Batal</button><button type="submit" class="btn-sm btn-solid" id="pfSave">Simpan profil</button></div>
    </form>`;
    const bio = $('pfBio'), count = () => { $('pfBioCount').textContent = `${bio.value.length}/${LIMITS.bio}`; };
    bio.addEventListener('input', count); count();
    logoPreview();
    $('pfTagline').focus();
  }

  async function chooseLogo(task) {
    const btns = [$('pfLogoFetch'), $('pfLogoFile'), $('pfSave')];
    btns.forEach(b => { if (b) b.disabled = true; });
    $('pfLogoStatus').textContent = 'Memproses gambar…';
    try { const r = await task(); draftLogo = r.logo; draftLogoNote = r.note || ''; }
    catch (err) { draftLogoNote = err.message; }
    btns.forEach(b => { if (b) b.disabled = false; });
    logoPreview();
  }

  async function save(e) {
    e.preventDefault();
    const user = ctx.getUser();
    const links = [0, 1, 2].map(i => ({ label: clip($(`pfLinkLabel${i}`).value, LIMITS.linkLabel), url: $(`pfLinkUrl${i}`).value.trim() })).filter(l => l.url);
    if (links.some(l => !safeUrl(l.url))) return showAlert('Alamat tautan harus diawali http:// atau https://');
    const prev = cache.get(user.uid) || {};
    const data = {
      displayName: user.displayName || '', tagline: clip($('pfTagline').value, LIMITS.tagline), bio: clip($('pfBio').value, LIMITS.bio),
      institution: clip($('pfInstitution').value, LIMITS.institution), location: clip($('pfLocation').value, LIMITS.location),
      links: links.map(l => ({ label: l.label, url: safeUrl(l.url) })),
      logo: draftLogo === undefined ? (prev.logo || null) : draftLogo,
      updatedAt: serverTimestamp()
    };
    $('pfSave').disabled = true;
    try {
      await setDoc(doc(db, 'profiles', user.uid), data, { merge: true });
      cache.set(user.uid, { ...data, updatedAt: null });
      editing = false; draftLogo = undefined; draftLogoNote = '';
      toast('Profil disimpan', 'success');
      await renderOwn(); $('profileName')?.focus();
    } catch (err) {
      $('pfSave').disabled = false;
      await showAlert(err.code === 'permission-denied'
        ? 'Profil belum bisa disimpan karena aturan Firestore belum mengizinkan koleksi "profiles". Lihat catatan pemasangan.'
        : 'Gagal menyimpan profil: ' + (err.code || err.message));
    }
  }

  function bind() {
    const host = $('profileView');
    host?.addEventListener('click', async e => {
      const a = e.target.closest('[data-pf]')?.dataset.pf;
            if (a === 'edit') { await load(ctx.getUser().uid); editing = true; draftLogo = undefined; draftLogoNote = ''; renderEdit(); }
      else if (a === 'cancel') { editing = false; draftLogo = undefined; draftLogoNote = ''; await renderOwn(); $('profileName')?.focus(); }
      else if (a === 'settings') ctx.openAccountSettings();
      else if (a === 'logout') $('logoutBtn')?.click();
      else if (e.target.id === 'pfLogoRemove') { draftLogo = null; draftLogoNote = 'Logo akan dihapus saat disimpan.'; logoPreview(); }
      else if (e.target.id === 'pfLogoFetch') {
        const raw = $('pfLogoUrl').value.trim(); if (!raw) { draftLogoNote = 'Isi alamat gambar dulu.'; return logoPreview(); }
        chooseLogo(async () => { const r = await logoFromUrl(raw, safeUrl); return { logo: r.logo, note: r.copied ? 'Logo disalin dan siap disimpan.' : 'Situs sumber melarang penyalinan. Hanya tautan yang akan disimpan.' }; });
      }
    });
    host?.addEventListener('change', e => {
      if (e.target.id !== 'pfLogoFile' || !e.target.files[0]) return;
      const file = e.target.files[0]; e.target.value = '';
      chooseLogo(async () => ({ logo: await logoFromFile(file), note: 'Logo siap disimpan.' }));
    });
    host?.addEventListener('submit', e => { if (e.target.id === 'profileForm') save(e); });
    $('profileModalBody')?.addEventListener('click', e => { if (e.target.closest('[data-pf="settings"]')) ctx.openAccountSettings(); });
  }
  bind();

  return { renderOwn, openMember, refreshIfVisible: () => { if (!$('profilePanel')?.classList.contains('hidden')) renderOwn(); }, forget: uid => cache.delete(uid) };
}
