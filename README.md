# 🟠 Akasha — Ruang Kerja Tim

> Satu ruang untuk tugas, divisi, dan tenggat. Mentor membagikan tugas ke seluruh tim, per divisi, atau per orang. Anggota mengirim laporan, mentor memvalidasi. Semua tercatat.

Aplikasi web kolaborasi tim berbasis **HTML + CSS + JavaScript vanilla** dengan **Firebase (Auth & Firestore)** — tanpa framework, tanpa build tool. Dilengkapi modul **produktivitas pribadi** (habit tracker & mood check-in) yang berjalan offline via `localStorage`.

---

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Tech Stack](#-tech-stack)
- [Struktur Proyek](#-struktur-proyek)
- [Cara Menjalankan](#-cara-menjalankan)
- [Setup Firebase](#-setup-firebase)
- [Skema Data Firestore](#-skema-data-firestore)
- [Alur Status & Tenggat Tugas](#-alur-status--tenggat-tugas)
- [Produktivitas Pribadi](#-produktivitas-pribadi)
- [Tema & Responsivitas](#-tema--responsivitas)
- [Batasan Diketahui](#-batasan-diketahui)
- [Roadmap Pengembangan](#-roadmap-pengembangan)
- [Kontribusi](#-kontribusi)

---

## ✨ Fitur

### Kolaborasi Tim (Firebase)

| Area | Kemampuan |
|---|---|
| **Autentikasi** | Email/kata sandi, login Google, "Ingat saya" (persistence lokal vs sesi), lupa sandi |
| **Ruang kerja** | Buat ruang (otomatis jadi mentor), gabung via kode undangan 6 karakter, maks. 20 anggota per ruang |
| **Peran** | *Mentor/Lead* (buat tugas, validasi, kelola divisi & anggota) dan *Member/worker* (mengerjakan tugas, kirim laporan) |
| **Tugas** | Penugasan ke semua member / per divisi / per orang, tingkat kesulitan, tanggal mulai & tenggat, instruksi, sub-tugas (maks. 30), lampiran tautan (maks. 20), sumber Google Drive |
| **Alur kerja** | Belum dimulai → Berjalan → Siap dicek → Selesai / Revisi (dengan catatan mentor) |
| **Riwayat** | Setiap laporan, revisi, dan validasi tercatat per tugas |
| **Kalender** | Chip tugas per tanggal tenggat, navigasi bulan, expand hari penuh |
| **Aktivitas** | 100 kejadian terbaru ruang kerja, real-time |
| **Pengumuman** | Posting, sematkan (pin), edit, hapus (khusus mentor) |
| **Divisi** | Buat/hapus divisi; anggota divisi terhapus dipindah ke "Umum" |
| **Kehadiran** | Denyut (*heartbeat*) 60 detik → status "Aktif sekarang" / terakhir aktif |
| **Notifikasi** | Per pengguna, badge belum dibaca (maks. tampilan `99+`), tandai semua dibaca |
| **Manajemen anggota** | Ubah peran & divisi, keluarkan anggota, ganti nama (ikut memperbarui semua tugas) |

### Produktivitas Pribadi (localStorage, per perangkat)

- ✅ **Kebiasaan harian** — checklist dengan streak & streak terpanjang, graf kontribusi ala GitHub (105 sel, 4 level intensitas)
- 😊 **Mood check-in** — 5 ekspresi + catatan satu kalimat, grafik tren SVG 14 entri terakhir
- 📊 **Kartu statistik dashboard** — Total tugas, Selesai, Tenggat mendekat, Terlambat
- 📅 **Mini kalender tenggat** — 7 hari ke depan dari semua ruang kerja
- 📋 **Daftar tugas terdekat** — urut tenggat, lintas ruang kerja

### Pengalaman Pengguna

- Dialog in-app pengganti `alert/confirm/prompt` (konfirmasi, input tervalidasi)
- Custom select dengan navigasi keyboard & ARIA (`listbox`, `option`)
- Toast notifikasi, skip-link, `sr-only`, `:focus-visible`, dukungan `prefers-reduced-motion`

---

## 🧰 Tech Stack

| Lapisan | Teknologi |
|---|---|
| Markup | HTML5 semantik |
| Gaya | CSS3 murni — custom properties (design token), grid/flex, animasi |
| Logika | JavaScript ES Modules (vanilla) |
| Backend | Firebase 10.8.0 via CDN gstatic — **Authentication** + **Cloud Firestore** |
| Penyimpanan lokal | `localStorage` (mode gelap, data produktivitas) |
| Build tool | **Tidak ada** — cukup browser + server statis |

---

## 📁 Struktur Proyek

```
akasha/
├── index.html   # Seluruh view (auth, dashboard, workspace), modal, dan dialog in-app
├── style.css    # Design token, komponen, dark mode, breakpoint responsif
└── script.js    # Konfigurasi Firebase, state, render, event listener, utilitas
```

---

## 🚀 Cara Menjalankan

### Prasyarat

- Browser modern (Chrome/Edge/Firefox/Safari)
- Koneksi internet (modul Firebase dimuat dari CDN)
- Server statis lokal — **ES Modules tidak berjalan lewat `file://`**

### Langkah

1. Salin ketiga file ke satu folder.
2. Buat proyek Firebase dan ganti objek `firebaseConfig` di `script.js` dengan milik Anda.
3. Jalankan server lokal, pilih salah satu:
   ```bash
   npx serve .
   # atau
   python -m http.server 8080
   # atau ekstensi "Live Server" di VS Code
   ```
4. Buka `http://localhost:8080` (atau port sesuai server Anda).
5. Daftar akun baru atau masuk dengan Google.

---

## 🔥 Setup Firebase

1. **Authentication** → aktifkan provider *Email/Password* dan *Google*.
2. **Firestore Database** → buat database (mode produksi disarankan, lalu terapkan rules di bawah).
3. **Rules referensi** (sesuaikan kebutuhan):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isMember(ws) {
      return exists(/databases/$(database)/documents/workspaces/$(ws)/members/$(request.auth.uid));
    }
    function isOwner(ws) {
      return get(/databases/$(database)/documents/workspaces/$(ws)).data.ownerUid == request.auth.uid;
    }

    match /users/{uid} {
      allow read, create, update: if signedIn() && request.auth.uid == uid;
      match /notifications/{nid} {
        allow read, update, delete: if signedIn() && request.auth.uid == uid;
        allow create: if signedIn();
      }
    }

    match /workspaces/{wsId} {
      allow read:   if signedIn() && isMember(wsId);
      allow create: if signedIn();
      allow update: if signedIn() && isMember(wsId);
      allow delete: if signedIn() && isOwner(wsId);
      match /{document=**} {
        allow read, write: if signedIn() && isMember(wsId);
      }
    }
  }
}
```

> ⚠️ Kunci API Firebase memang terlihat di sisi klien — itu normal. Keamanan sesungguhnya ditegakkan oleh **Security Rules** di atas. Untuk produksi, pertimbangkan menambahkan **App Check**.

---

## 🗄️ Skema Data Firestore

### `users/{uid}`
| Field | Tipe | Keterangan |
|---|---|---|
| `email` | string | Email akun |
| `displayName` | string | Nama tampilan |
| `workspaceIds` | array<string> | Daftar ruang yang diikuti |
| `createdAt` | timestamp | Waktu pendaftaran |

### `users/{uid}/notifications/{id}`
`kind` (`task`·`report`·`revision`·`done`·`file`·`announce`·`start`), `title`, `body`, `taskId`, `workspaceId`, `workspaceName`, `read` (bool), `createdAt`

### `workspaces/{wsId}`
`name`, `ownerUid`, `joinCode` (6 karakter unik), `driveLink`, `createdAt`

### `workspaces/{wsId}/members/{uid}`
`uid`, `email`, `name`, `role` (`mentor`·`worker`), `division`, `dailyGoal`, `goalDate`, `lastActive` (heartbeat), `joinedAt`

### `workspaces/{wsId}/tasks/{id}`
| Field | Keterangan |
|---|---|
| `title`, `desc` | Judul & instruksi |
| `assignee` | Nama member penerima |
| `difficulty` | `rendah` · `sedang` · `tinggi` |
| `startDate`, `endDate` | Periode pengerjaan |
| `status` | `todo` · `progress` · `review` · `done` |
| `driveSource`, `reportFileLink`, `reportNotes` | Sumber Drive & laporan anggota |
| `revisionNotes` | Catatan revisi mentor |
| `subtasks[]` | `{id, text, done}` |
| `attachments[]` | `{id, name, url, by, uid, at}` |
| `history[]` | `{type: laporan·revisi·selesai, by, text, at}` |
| `createdAt`, `updatedAt` | timestamp |

### `workspaces/{wsId}/divisions/{id}` — `name`, `desc`, `createdAt`
### `workspaces/{wsId}/activities/{id}` — `type`, `text`, `taskId`, `by`, `uid`, `at`
### `workspaces/{wsId}/announcements/{id}` — `title`, `body`, `pinned`, `by`, `uid`, `createdAt`, `updatedAt`

### `localStorage` — key `akasha_productivity_v2`
```json
{
  "habits":        [{ "id": "...", "name": "Ngoding 1 jam", "streak": 12, "longest": 21, "doneToday": true }],
  "habitHistory":  [{ "date": "2026-11-17", "level": 3 }],
  "moodToday":     4,
  "moodNote":      "Kelar bug login, lega banget.",
  "moodHistory":   [{ "date": "2026-11-17", "mood": 4 }]
}
```

---

## 🔁 Alur Status & Tenggat Tugas

**Status**

| Nilai | Label UI | Pill |
|---|---|---|
| `todo` | Belum Dimulai | abu-abu |
| `progress` | Berjalan *(atau "Revisi" bila ada catatan mentor)* | kuning / merah |
| `review` | Siap Dicek | oranye |
| `done` | Selesai | hijau |

**Tenggat** (dihitung dari `endDate` vs tanggal lokal)

| Level | Kondisi | Label |
|---|---|---|
| `overdue` | < 0 hari | `Terlambat N hari` |
| `urgent` | ≤ 1 hari | `Hari ini` / `Besok` |
| `soon` | ≤ 3 hari | `H-N` |

---

## 🌱 Produktivitas Pribadi

Modul ini **tidak menyentuh Firestore** — seluruh datanya di `localStorage` sehingga privat per perangkat.

- **Graf kontribusi**: 105 sel (15 kolom × 7 baris); level 0–4 dihitung dari rasio kebiasaan tercentang hari itu.
- **Streak**: naik saat centang, turun saat dibatalkan; `longest` menyimpan rekor.
- **Mood**: nilai 1–5; entri hari yang sama ditimpa (update), bukan duplikat.
- **Grafik tren**: SVG inline tanpa library, 14 entri terakhir.

---

## 🎨 Tema & Responsivitas

- **Design token**: palet *ember orange* (`#F97316` dst.) + *warm stone*; seluruh warna komponen memakai `var(--...)`.
- **Mode gelap**: kelas `body.dark-mode`, preferensi tersimpan di `localStorage('darkMode')`, toggle di modal Pengaturan Akun.
- **Breakpoint**: 1200px (grid dashboard 1 kolom) · 1100px (statistik 2 kolom) · 960px (hero auth disembunyikan) · 768px (sidebar → bottom nav, sidebar workspace → tab horizontal) · 480px · 360px (label menu ikon saja).

---

## ⚠️ Batasan Diketahui

1. Data habit & mood tersimpan **per perangkat** — belum sinkron antar perangkat.
2. `ensureProdToday()` masih kosong: `doneToday` belum otomatis reset saat ganti tanggal, dan streak tidak putus meski berhari-hari tidak dicentang.
3. Catatan mood (`moodNote`) tersimpan tetapi belum ditampilkan kembali sebagai jurnal.
4. Grafik mood terbatas 14 titik terakhir; belum ada tampilan bulanan.
5. Query notifikasi dibatasi `limit(60)`, sehingga penghitung belum dibaca tidak pernah mencapai ≥ 100.
6. Baris kebiasaan hanya bisa di-toggle; belum ada detail/riwayat per kebiasaan.

---

## 🗺️ Roadmap Pengembangan

**Tahap 1 — Fondasi data**
- Roll-over harian (`lastRollDate`, reset `doneToday`, streak putus)
- Riwayat per kebiasaan (`history` per habit)
- Jurnal mood (menampilkan kembali catatan lama)

**Tahap 2 — Pendalaman**
- Heatmap mini per kebiasaan (56 sel) & statistik penyelesaian 30 hari
- Target frekuensi (`daily` / `weekly` / hari tertentu)
- Ikon, kategori, dan arsip kebiasaan
- Grafik mood bulanan + tag pemicu mood

**Tahap 3 — Insight & gamifikasi**
- Kartu insight korelasi kebiasaan × mood
- Rekap bulanan + tombol salin rekap
- Milestone streak (7/21/30/66/100 hari), freeze token ❄, pengingat lembut sore hari

**Notifikasi**
- Badge sembunyi total saat 0 belum dibaca; `99+` saat ≥ 100 (naikkan limit atau query unread terpisah)

---

## 🤝 Kontribusi

1. Pertahankan gaya kode yang ada: helper `escapeHtml()`, `localDate()`, `toast()`, serta dialog in-app (`showAlert`, `askConfirm`, `askText`) — **jangan** memakai `alert/confirm/prompt` bawaan.
2. Semua konten pengguna wajib lewat `escapeHtml()` sebelum masuk `innerHTML`.
3. UI baru harus kompatibel `body.dark-mode` dan breakpoint yang sudah ada; gunakan design token `var(--...)`, jangan warna hardcoded.
4. Tidak menambah library eksternal tanpa diskusi.

---

## 📄 Lisensi

Proyek pembelajaran — bebas digunakan dan dimodifikasi untuk keperluan edukasi.

---

<div align="center">
<strong>Akasha</strong> · dibuat dengan 🧡 dan Firebase
</div>
