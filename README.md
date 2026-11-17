# Akasha: Ruang Kerja Tim

> Satu ruang untuk tugas, divisi, dan tenggat. Mentor membagikan tugas ke seluruh tim, per divisi, atau per orang. Anggota mengirim laporan, mentor memvalidasi. Semua tercatat.

Aplikasi web kolaborasi tim berbasis **HTML + CSS + JavaScript vanilla** dengan **Firebase (Auth & Firestore)**: tanpa framework, tanpa build tool. Dilengkapi modul **produktivitas pribadi** (habit tracker & mood check-in) yang disimpan di `localStorage` dan disinkronkan ke akun Anda di Firestore.

---

## Daftar Isi

- [Fitur](#fitur)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Cara Menjalankan](#cara-menjalankan)
- [Setup Firebase](#setup-firebase)
- [Skema Data Firestore](#skema-data-firestore)
- [Alur Status & Tenggat Tugas](#alur-status--tenggat-tugas)
- [Produktivitas Pribadi](#produktivitas-pribadi)
- [Tema & Responsivitas](#tema--responsivitas)
- [Batasan Diketahui](#batasan-diketahui)
- [Roadmap Pengembangan](#roadmap-pengembangan)
- [Kontribusi](#kontribusi)

---

## Fitur

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
| **Notifikasi** | Per pengguna, badge belum dibaca (`99+` bila 100 atau lebih), tandai semua dibaca |
| **Manajemen anggota** | Ubah peran & divisi, keluarkan anggota, ganti nama (ikut memperbarui semua tugas) |

### Produktivitas Pribadi (localStorage + sinkron cloud)

-  **Kebiasaan harian**: checklist dengan streak & streak terpanjang, graf kontribusi ala GitHub (105 sel, 4 level intensitas)
-  **Mood check-in**: 5 ekspresi + catatan satu kalimat, grafik tren SVG 14 entri terakhir
-  **Kartu statistik dashboard**: Total tugas, Selesai, Tenggat mendekat, Terlambat
-  **Mini kalender tenggat**: 7 hari ke depan dari semua ruang kerja
-  **Daftar tugas terdekat**: urut tenggat, lintas ruang kerja

### Pengalaman Pengguna

- Dialog in-app pengganti `alert/confirm/prompt` (konfirmasi, input tervalidasi)
- Custom select dengan navigasi keyboard & ARIA (`listbox`, `option`)
- Toast notifikasi, skip-link, `sr-only`, `:focus-visible`, dukungan `prefers-reduced-motion`

---

## Tech Stack

| Lapisan | Teknologi |
|---|---|
| Markup | HTML5 semantik |
| Gaya | CSS3 murni: custom properties (design token), grid/flex, animasi |
| Logika | JavaScript ES Modules (vanilla) |
| Backend | Firebase 10.8.0 via CDN gstatic: **Authentication** + **Cloud Firestore** |
| Penyimpanan lokal | `localStorage` (tema, cache produktivitas) |
| Tipografi | Plus Jakarta Sans (Google Fonts) |
| Build tool | **Tidak ada**: cukup browser + server statis |

---

## Struktur Proyek

```
akasha/
├── index.html   # Seluruh view (auth, dashboard, workspace), modal, dan dialog in-app
├── style.css    # Design token, komponen, dark mode, breakpoint responsif
└── script.js    # Konfigurasi Firebase, state, render, event listener, utilitas
```

---

## Cara Menjalankan

### Prasyarat

- Browser modern (Chrome/Edge/Firefox/Safari)
- Koneksi internet (modul Firebase dimuat dari CDN)
- Server statis lokal: **ES Modules tidak berjalan lewat `file://`**

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

## Setup Firebase

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

    // Data pribadi: profil, notifikasi, produktivitas (users/{uid}/productivity/data)
    match /users/{uid} {
      allow read, create, update: if signedIn() && request.auth.uid == uid;
      match /notifications/{nid} {
        allow read, update, delete: if signedIn() && request.auth.uid == uid;
        allow create: if signedIn();   // pengguna lain mengirim notifikasi ke Anda
      }
      match /productivity/{doc} {
        allow read, write: if signedIn() && request.auth.uid == uid;
      }
    }

    match /workspaces/{wsId} {
      // Baca terbuka untuk pengguna login agar "gabung via kode" (query joinCode) bisa jalan.
      // Kode 6 karakter bertindak sebagai kata sandi ruang; jangan simpan data sensitif di dokumen ruang.
      allow read:   if signedIn();
      allow create: if signedIn();
      allow update: if signedIn() && isMember(wsId);
      allow delete: if signedIn() && isOwner(wsId);

      match /members/{uid} {
        allow read: if signedIn() && isMember(wsId);
        allow create: if signedIn() && request.auth.uid == uid;   // proses gabung
        allow update, delete: if signedIn() && isMember(wsId);
      }
      match /{col}/{doc=**} {
        allow read, write: if signedIn() && isMember(wsId);
      }
    }
  }
}
```

>  Kunci API Firebase memang terlihat di sisi klien: itu normal. Keamanan sesungguhnya ditegakkan oleh **Security Rules** di atas. Untuk produksi, pertimbangkan menambahkan **App Check**.

---

## Skema Data Firestore

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

### `workspaces/{wsId}/divisions/{id}`: `name`, `desc`, `createdAt`
### `workspaces/{wsId}/activities/{id}`: `type`, `text`, `taskId`, `by`, `uid`, `at`
### `workspaces/{wsId}/announcements/{id}`: `title`, `body`, `pinned`, `by`, `uid`, `createdAt`, `updatedAt`

### `localStorage`: key `akasha_productivity_v3` (migrasi otomatis dari v2; cadangan di `users/{uid}/productivity/data`)
```json
{
  "habits":       [{ "id": "...", "name": "Ngoding 1 jam", "streak": 12, "longest": 21, "doneToday": true,
                    "history": { "2026-11-17": true }, "schedule": { "type": "daily" },
                    "category": "belajar", "archived": false, "freezes": 1 }],
  "habitHistory": [{ "date": "2026-11-17", "level": 3 }],
  "moodToday":    4,
  "moodHistory":  [{ "date": "2026-11-17", "mood": 4, "note": "Kelar bug login", "tags": [] }],
  "lastRollDate": "2026-11-17",
  "celebratedMilestones": { "<habitId>": [7, 21] }
}
```

---

## Alur Status & Tenggat Tugas

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

## Produktivitas Pribadi

Data utama di `localStorage`, lalu disinkronkan (jeda 600 ms) ke `users/{uid}/productivity/data` agar ikut berpindah antar perangkat. Hanya pemilik akun yang bisa membacanya.

- **Graf kontribusi**: 105 sel (15 kolom × 7 baris); level 0–4 dihitung dari rasio kebiasaan tercentang hari itu.
- **Streak**: naik saat centang, turun saat dibatalkan; `longest` menyimpan rekor.
- **Mood**: nilai 1–5; entri hari yang sama ditimpa (update), bukan duplikat.
- **Grafik tren**: SVG inline tanpa library, 14 entri terakhir.

---

## Tema & Responsivitas

- **Arah desain** (blok "ARAH DESAIN" di akhir `style.css`): satu aksen ember oranye di atas netral warm-stone. Teks di atas aksen memakai `var(--on-accent)` agar kontras tetap 4.5:1 di mode terang dan gelap. Tanpa gradien, glow, atau kaca; bayangan hanya untuk modal, menu, dan kartu sapaan.
- **Tiga tema**: Terang, Gelap, dan Playful (datar, satu aksen mawar). Ketiganya diperiksa kontrasnya.
- **Mode gelap**: kelas `body.dark-mode`, preferensi tersimpan di `localStorage('darkMode')`, toggle di modal Pengaturan Akun.
- **Breakpoint**: 1200px (grid dashboard 1 kolom) · 1100px (statistik 2 kolom) · 960px (hero auth disembunyikan) · 768px (sidebar → bottom nav, sidebar workspace → tab horizontal) · 480px · 360px (label menu ikon saja).

---

## Batasan Diketahui

1. Sinkron produktivitas memakai strategi sederhana (data cloud menimpa lokal); belum ada penggabungan per kebiasaan bila dua perangkat diedit bersamaan.
2. Notifikasi dimuat dengan `limit(300)`; penghitung belum dibaca tidak melampaui 300.
3. Rules `workspaces/{id}` mengizinkan anggota mana pun memperbarui dokumen ruang. Untuk produksi, batasi field sensitif (`ownerUid`, `joinCode`) dan pertimbangkan **App Check**.
4. Belum ada pengingat push; pengingat lembut hanya tampil saat aplikasi dibuka.

---

## Roadmap

Sudah selesai: roll-over harian, riwayat per kebiasaan, jurnal dan grafik mood bulanan, target frekuensi, kategori dan arsip, insight korelasi, rekap bulanan, milestone streak, freeze token, sinkron cloud.

Berikutnya: pengingat web push, penggabungan data lintas perangkat per kebiasaan, query notifikasi belum dibaca terpisah, rules per field untuk dokumen ruang kerja.

---

## Kontribusi

0. Ikuti aturan antislop: tanpa em dash dan emoji dekoratif, kontras minimal 4.5:1, kontrol interaktif memakai `<button>` atau `<a href>`, angka hanya dari data nyata.
1. Pertahankan gaya kode yang ada: helper `escapeHtml()`, `localDate()`, `toast()`, serta dialog in-app (`showAlert`, `askConfirm`, `askText`): **jangan** memakai `alert/confirm/prompt` bawaan.
2. Semua konten pengguna wajib lewat `escapeHtml()` sebelum masuk `innerHTML`.
3. UI baru harus kompatibel `body.dark-mode` dan breakpoint yang sudah ada; gunakan design token `var(--...)`, jangan warna hardcoded.
4. Tidak menambah library eksternal tanpa diskusi.

---

## Lisensi

Proyek pembelajaran: bebas digunakan dan dimodifikasi untuk keperluan edukasi.

---

<div align="center">
<strong>Akasha</strong> · dibuat dengan  dan Firebase
</div>
