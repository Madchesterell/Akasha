# Akasha — Ringkasan percakapan & konteks untuk AI berikutnya

**Tanggal konteks:** 23 November 2026  
**Aplikasi:** Akasha (ruang kerja tim) — HTML/CSS/JS + Firebase  
**Bahasa UI:** Indonesia  

## Tujuan terakhir yang diminta user

1. **Mobile ≤760px pada `#workspaceView` / `#mainTaskContainer`**
   - Tidak ada scroll horizontal
   - Tampilan lebih ringkas
   - Pilihan user yang disetujui:
     - **1B** Form “Buat tugas baru” **collapsible** di mobile (default tertutup), desktop selalu terbuka
     - **2C** Kartu tugas mobile: **sembunyikan Instruksi**; **gabung Kesulitan + Status** satu baris
     - **3B** Target harian lebih ringkas (subtitle disembunyikan, form satu baris, tombol “Simpan”)

2. **Animasi entrance saat pindah tab** (permintaan terbaru, belum diimplementasi final menunggu klarifikasi)
   - Per **section** (bukan per item/kartu)
   - Fade-in + slide-up lembut
   - Count-up halus untuk angka statistik
   - Grafik/indikator terisi mulus
   - **File terpisah** (JS/CSS khusus), jalur relatif aman GitHub Pages
   - Jangan ubah struktur, layout, warna, teks, logika/fitur
   - Hormati `prefers-reduced-motion`
   - Tidak memblokir interaksi / merusak event listener & state

## Struktur file proyek (yang diketahui)

- `index.html` — UI lengkap (auth, dashboard, workspace, modal)
- `style.css` — tema Pesisir (light / dark / playful)
- `script.js` — modul ES (`type="module"`), Firebase Auth + Firestore
- Modul terkait (di-import dari script.js): `notifications.js`, `announcements.js`, `drive.js`, `profile.js` (tidak dilampirkan di sesi ini)

Jalur di HTML saat ini:
```html
<link rel="stylesheet" href="style.css" />
<script type="module" src="script.js"></script>
```

## Cara perpindahan tab (penting untuk animasi)

### Dashboard (`script.js`)
- Fungsi: `switchDashboardSection(section)`
- Section keys → panel id:
  - `home` → `dashboardHomePanel`
  - `workspaces` → `myWorkspacesPanel`
  - `productivity` → `productivityPanel`
  - `notifications` → `notificationsPanel`
  - `profile` → `profilePanel`
- Mekanisme: `classList.toggle('hidden', k !== section)` pada panel
- Dipanggil dari sidebar/topbar buttons & `data-goto`

### Workspace
- `showWsSection(tab)` → mobile pakai group, desktop pakai tab
- `switchWorkspaceTab(tab)` / `switchWorkspaceGroup(group)`
- `WS_TABS`: task, calendar, activity, announce, division, team
- Panel id: `mainTaskContainer`, `calendarPanel`, `activityPanel`, `announcementPanel`, `divisionManagementPanel`, `teamPanel`
- Mobile ≤760px: bottom nav + `WS_GROUPS` (beberapa panel bisa tampil bersamaan = `ws-combo`)

### Catatan teknis animasi
- `script.js` adalah **ES module** → fungsi switch **tidak** ada di `window`
- Hook tanpa menyentuh logika utama paling aman: **MutationObserver** pada class `hidden` panel, atau file motion yang di-import minimal
- Re-render konten (Firestore `onSnapshot`, `renderTasks`, dll.) bisa menimpa node — animasi sebaiknya di level **section/card wrapper**, dan count-up hanya sekali per show tab

## Patch mobile yang sudah dirancang (isi inti)

### HTML
- `#mentorTaskCreator`: tombol `#toggleTaskFormBtn`, wrapper `#createTaskFormWrap`
- Tombol target harian: teks “Simpan”

### JS
- Toggle form + default `is-collapsed` di mobile
- Setelah bagikan tugas sukses → collapse lagi di mobile
- `renderTasks`: class `task-diff-cell`, `task-status-cell`, pill `.task-diff-inline` untuk mobile gabungan

### CSS (≤760px)
- Containment `overflow-x: hidden` di `#workspaceView` / content
- Sembunyikan Instruksi + kolom kesulitan terpisah; tampilkan `.task-diff-inline`
- Daily goal form row; subtitle disembunyikan
- Form collapsible: `#createTaskFormWrap.is-collapsed { display:none }` hanya mobile
- Desktop: form selalu terlihat, toggle disembunyikan

**Peringatan sesi:** file di `/attachments` sempat kembali ke ukuran original; versi ter-patch terakhir yang diverifikasi ada di artifacts (~index 56451 B, style 70318 B, script 129042 B). Sebelum lanjut, samakan sumber kebenaran file.

## Rekomendasi teknis animasi (usulan, belum di-code final)

| Parameter | Usulan |
|-----------|--------|
| Durasi section | 280–360 ms |
| Easing | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Stagger antar section | 50–70 ms |
| Cap total satu kali pindah tab | ≤ 500–600 ms |
| Count-up | 400–500 ms, ease-out, hanya elemen `.num` / metrik terlihat |
| Reduced motion | Skip transform & count-up; opsional opacity singkat atau langsung tampil |
| File | `akasha-motion.css` + `akasha-motion.js`, link relatif `./` |

## Yang diminta user di pesan terakhir (belum final)

- Klarifikasi jika struktur tab / repo GitHub belum jelas → **tanyakan dulu**
- Buat file tentang percakapan ini untuk handoff AI lain → **file ini**

## Preferensi user yang sudah jelas

- Jangan rusak desktop / fitur / listener
- Mobile workspace: no horizontal overflow + ringkas
- Animasi: per section, file terpisah, GitHub Pages friendly


## Animasi entrance (diimplementasi)

**Pilihan user:** 1C (Dashboard + Workspace + Auth→Dashboard), section sesuai usulan, sisanya disesuaikan.

**File baru (relatif, root repo / GitHub Pages):**
- `akasha-motion.css`
- `akasha-motion.js`

**Link di index.html:**
```html
<link rel="stylesheet" href="akasha-motion.css" />
<script type="module" src="akasha-motion.js"></script>
```

**Mekanisme:** MutationObserver pada class `hidden` panel & view — tidak memodifikasi fungsi switch di script.js.

**Parameter:** duration ~320ms, stagger 55ms (cap index 6), count-up ~450ms pada `.summary-item .num`, `.ring-num`, `.profile-stats dd`. `prefers-reduced-motion` menonaktifkan gerak.
