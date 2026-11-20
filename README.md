# Akasha: Ruang Kerja Tim

> Satu ruang untuk tugas, divisi, dan tenggat. Mentor membagikan tugas ke seluruh tim, per divisi, atau per orang. Anggota mengirim laporan, mentor memvalidasi. Semua tercatat.

**Demo:** https://madchesterell.github.io/Akasha/

Aplikasi web kolaborasi tim berbasis **HTML + CSS + JavaScript vanilla** dengan **Firebase (Authentication & Firestore)**. Tanpa framework dan tanpa build tool. Dilengkapi modul **produktivitas pribadi** (pelacak kebiasaan dan mood check-in) yang disimpan di `localStorage` dan disinkronkan ke akun pengguna di Firestore.

---

## Daftar Isi

- [Latar Belakang dan Masalah](#latar-belakang-dan-masalah)
- [Fitur](#fitur)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Cara Menjalankan](#cara-menjalankan)
- [Setup Firebase](#setup-firebase)
- [Login dengan Google](#login-dengan-google)
- [Deploy ke GitHub Pages](#deploy-ke-github-pages)
- [Skema Data Firestore](#skema-data-firestore)
- [Alur Status dan Tenggat Tugas](#alur-status-dan-tenggat-tugas)
- [Produktivitas Pribadi](#produktivitas-pribadi)
- [Tema dan Responsivitas](#tema-dan-responsivitas)
- [Pemecahan Masalah](#pemecahan-masalah)
- [Batasan Diketahui](#batasan-diketahui)
- [Roadmap](#roadmap)
- [Kontribusi](#kontribusi)

---

## Latar Belakang dan Masalah

Akasha lahir dari kebutuhan nyata di sebuah **proyek animasi**. Produksi animasi dikerjakan banyak orang dengan tahap yang saling bergantung, dan awalnya seluruh pipeline-nya dikelola di **spreadsheet**: daftar tugas, siapa yang mengerjakan, tenggat, status, dan tautan file hasil kerja semuanya ditulis manual di sel.

Cara itu bisa jalan saat tim kecil, tetapi makin lama makin menyulitkan.

### Masalah pada pipeline berbasis spreadsheet

| Masalah | Dampak pada proyek |
|---|---|
| Status tugas diubah manual di sel | Status sering tidak diperbarui, sehingga mentor tidak tahu posisi pekerjaan sebenarnya |
| Tenggat hanya berupa tanggal biasa | Tidak ada penanda tugas yang mendekati tenggat atau sudah terlambat, jadi harus dicek satu per satu |
| Tidak ada alur laporan dan validasi | Anggota mengabari lewat chat terpisah, lalu mentor mencocokkannya ke sheet secara manual |
| Catatan revisi tercecer | Masukan mentor ada di chat, komentar sel, atau ingatan, sehingga mudah terlewat |
| Tautan file Drive tersebar di banyak kolom | Mencari folder kerja atau hasil akhir memakan waktu |
| Semua orang melihat sheet yang sama | Anggota harus menyaring sendiri baris miliknya |
| Tidak ada riwayat yang rapi | Sulit menelusuri siapa mengirim apa dan kapan disetujui |
| Perubahan bersamaan saling menimpa | Risiko data terhapus atau salah edit saat banyak orang membuka sheet |

### Cara Akasha menyederhanakannya

| Di spreadsheet | Di Akasha |
|---|---|
| Baris tugas dengan kolom status | Alur status baku: Belum dimulai, Berjalan, Siap dicek, Selesai atau Revisi |
| Kolom tanggal | Tenggat dihitung otomatis dengan penanda `Terlambat`, `Hari ini`, `Besok`, dan `H-N`, plus kalender tenggat |
| Laporan lewat chat | Anggota mengirim laporan langsung dari tugas, mentor memvalidasi atau meminta revisi |
| Catatan revisi di komentar | Catatan revisi tersimpan di tugas dan riwayatnya |
| Kolom tautan Drive | Tautan folder dan hasil kerja ada di detail tugas, bisa per ruang, per tugas, atau per orang |
| Filter manual per nama | Penugasan ke semua anggota, per divisi, atau per orang. Anggota langsung melihat tugasnya sendiri |
| Tidak ada jejak | Riwayat per tugas dan aktivitas ruang kerja terbaru yang diperbarui real-time |
| Kabar lewat chat pribadi | Notifikasi per pengguna dan papan pengumuman dengan penanda siapa yang sudah membaca |

Hasilnya, mentor cukup membuka satu tempat untuk melihat siapa mengerjakan apa, apa yang menunggu dicek, dan apa yang sudah lewat tenggat. Anggota tinggal membuka tugasnya, mengerjakan, lalu mengirim laporan.

> Istilah seperti "divisi" bersifat bebas. Pada tim animasi, divisi bisa dipakai untuk membedakan kelompok kerja yang berbeda, misalnya tahap praproduksi dan produksi. Nama dan jumlahnya diatur sendiri oleh mentor di Manajemen Divisi.

---

## Fitur

### Kolaborasi Tim (Firebase)

| Area | Kemampuan |
|---|---|
| **Autentikasi** | Email dan kata sandi, login Google, "Ingat saya" (persistence lokal atau sesi), lupa sandi |
| **Ruang kerja** | Buat ruang (otomatis jadi mentor), gabung lewat kode undangan 6 karakter, maksimal 20 anggota per ruang |
| **Peran** | *Mentor/Lead* (buat tugas, validasi, kelola divisi dan anggota) dan *Member/worker* (mengerjakan tugas, kirim laporan) |
| **Tugas** | Penugasan ke semua member, per divisi, atau per orang. Tingkat kesulitan, tanggal mulai dan tenggat, instruksi, sub-tugas (maks. 30), lampiran tautan (maks. 20) |
| **Tautan Drive** | Folder Google Drive per ruang kerja, per tugas, atau per individu, ditambah tautan hasil kerja. Hak ubah tautan mengikuti peran |
| **Alur kerja** | Belum dimulai, Berjalan, Siap dicek, Selesai atau Revisi (dengan catatan mentor) |
| **Riwayat** | Setiap laporan, revisi, dan validasi tercatat per tugas |
| **Kalender** | Chip tugas per tanggal tenggat, navigasi bulan, expand hari penuh |
| **Aktivitas** | 100 kejadian terbaru ruang kerja, real-time |
| **Pengumuman** | Posting, sematkan (pin), edit, hapus (khusus mentor). Pelacak "dibaca oleh" menandai pengumuman saat kartunya benar-benar terlihat |
| **Divisi** | Buat dan hapus divisi. Anggota divisi yang dihapus dipindah ke "Umum" |
| **Kehadiran** | Heartbeat 60 detik menampilkan "Aktif sekarang" atau waktu terakhir aktif |
| **Notifikasi** | Per pengguna, badge belum dibaca (`99+` bila 100 atau lebih), tandai semua dibaca, pembersihan otomatis notifikasi terbaca lebih dari 30 hari |
| **Profil** | Halaman profil bergaya media sosial: tagline, bio, institusi, lokasi, hingga 3 tautan, dan logo institusi |
| **Manajemen anggota** | Ubah peran dan divisi, keluarkan anggota, ganti nama (ikut memperbarui semua tugas) |

### Produktivitas Pribadi (localStorage dan sinkron cloud)

- **Kebiasaan harian**: checklist dengan streak dan streak terpanjang, jadwal, kategori, arsip, freeze token, dan graf kontribusi ala GitHub (105 sel, 4 level intensitas)
- **Mood check-in**: 5 ekspresi dan catatan satu kalimat, grafik tren SVG, jurnal dan grafik bulanan
- **Insight dan rekap**: insight korelasi kebiasaan dan mood, rekap bulanan, milestone streak
- **Kartu statistik dashboard**: Total tugas, Selesai, Tenggat mendekat, Terlambat
- **Mini kalender tenggat**: 7 hari ke depan dari semua ruang kerja
- **Daftar tugas terdekat**: urut tenggat, lintas ruang kerja

### Pengalaman Pengguna

- Dialog in-app pengganti `alert`, `confirm`, dan `prompt` (konfirmasi dan input tervalidasi)
- Custom select dengan navigasi keyboard dan ARIA (`listbox`, `option`)
- Toast notifikasi, skip-link, `sr-only`, `:focus-visible`, dukungan `prefers-reduced-motion`
- Tiga tema: Terang, Gelap, dan Playful

---

## Tech Stack

| Lapisan | Teknologi |
|---|---|
| Markup | HTML5 semantik |
| Gaya | CSS3 murni: custom properties (design token), grid dan flex, animasi |
| Logika | JavaScript ES Modules (vanilla) |
| Backend | Firebase 10.8.0 lewat CDN gstatic: **Authentication** dan **Cloud Firestore** |
| Penyimpanan lokal | `localStorage` (tema, cache produktivitas) |
| Tipografi | Figtree dan Young Serif (Google Fonts) |
| Build tool | **Tidak ada**: cukup browser dan server statis |

---

## Struktur Proyek

```
akasha/
├── index.html          # Seluruh view (auth, dashboard, workspace), modal, dan dialog in-app
├── style.css           # Design token, komponen, tiga tema, breakpoint responsif
├── script.js           # Konfigurasi Firebase, state, autentikasi, render, event listener, produktivitas
├── notifications.js    # Notifikasi per pengguna: badge, panel, tandai dibaca, pembersihan
├── announcements.js    # Papan pengumuman dan pelacak "dibaca oleh"
├── drive.js            # Tautan Drive per tugas dan aturan siapa boleh mengubahnya
├── profile.js          # Profil pengguna dan pemrosesan logo institusi
└── README.md
```

Modul di luar `script.js` tidak menyentuh state global secara langsung. Dependensinya (`db`, `$`, `escapeHtml`, `toast`, dan sejenisnya) dikirim lewat parameter fungsi pembuatnya.

---

## Cara Menjalankan

### Prasyarat

- Browser modern (Chrome, Edge, Firefox, Safari)
- Koneksi internet (modul Firebase dan font dimuat dari CDN)
- Server statis lokal: **ES Modules tidak berjalan lewat `file://`**

### Langkah

1. Salin semua file proyek ke satu folder.
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

> Gunakan `localhost`, bukan `127.0.0.1`. Hanya `localhost` yang otomatis terdaftar sebagai domain yang diizinkan di Firebase.

---

## Setup Firebase

1. **Authentication**: aktifkan provider *Email/Password* dan *Google*.
2. **Firestore Database**: buat database (mode produksi disarankan, lalu terapkan rules di bawah).
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

    // Data pribadi: profil akun, notifikasi, produktivitas (users/{uid}/productivity/data)
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

    // Profil publik: dibaca semua pengguna login, hanya ditulis pemiliknya
    match /profiles/{uid} {
      allow read: if signedIn();
      allow write: if signedIn() && request.auth.uid == uid;
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

> Kunci API Firebase memang terlihat di sisi klien, dan itu normal. Keamanan sesungguhnya ditegakkan oleh **Security Rules** di atas. Untuk produksi, pertimbangkan menambahkan **App Check**.

---

## Login dengan Google

Tombol dan logikanya sudah tersedia (`#googleLoginBtn` di `index.html`, `signInWithPopup` di `script.js`). Agar berfungsi, siapkan hal berikut di luar kode:

1. **Firebase Console, Authentication, Sign-in method**: aktifkan **Google** dan isi *Project support email*.
2. **Authentication, Settings, Authorized domains**: daftarkan setiap domain tempat aplikasi dibuka. `localhost` sudah ada secara bawaan. Tambahkan domain produksi, misalnya `madchesterell.github.io`.
   - Tulis **domainnya saja**: tanpa `https://`, tanpa port, tanpa path (`/Akasha/`).
3. **Google Cloud Console, APIs & Services, OAuth consent screen** (pilih proyek Firebase Anda): isi nama aplikasi, logo, dan email dukungan agar layar persetujuan Google tampil rapi. OAuth client web dibuat otomatis oleh Firebase.

Jika muncul `auth/unauthorized-domain`, artinya langkah 2 belum dilakukan untuk alamat yang sedang Anda pakai.

---

## Deploy ke GitHub Pages

1. Unggah **semua** file proyek ke repositori, di folder yang sama dengan `index.html`. Jangan lupa `notifications.js`, `announcements.js`, `drive.js`, dan `profile.js`.
2. Buka **Settings, Pages**, pilih sumber *Deploy from a branch*, lalu pilih branch dan folder root.
3. Tunggu proses selesai. Alamatnya berbentuk `https://<username>.github.io/<nama-repo>/`.
4. Daftarkan `<username>.github.io` di **Firebase, Authentication, Settings, Authorized domains**.

---

## Skema Data Firestore

### `users/{uid}`
| Field | Tipe | Keterangan |
|---|---|---|
| `email` | string | Email akun |
| `displayName` | string | Nama tampilan |
| `workspaceIds` | array\<string\> | Daftar ruang yang diikuti |
| `createdAt` | timestamp | Waktu pendaftaran |

### `users/{uid}/notifications/{id}`
`kind` (`task`, `report`, `revision`, `done`, `file`, `announce`, `start`), `title`, `body`, `taskId`, `workspaceId`, `workspaceName`, `read` (bool), `createdAt`

### `profiles/{uid}`
Profil publik. Data pribadi seperti mood dan kebiasaan tidak pernah disimpan atau ditampilkan di sini.

| Field | Batas | Keterangan |
|---|---|---|
| `displayName` | | Nama tampilan |
| `tagline` | 80 karakter | Kalimat singkat |
| `bio` | 280 karakter | Tentang saya |
| `institution` | 60 karakter | Institusi |
| `location` | 60 karakter | Lokasi |
| `links[]` | maks. 3, label maks. 24 karakter | Tautan pribadi |
| `logo` | | `{kind: 'data' atau 'link', src}`. Unggahan diubah menjadi WebP maksimal 256 px dan 60.000 karakter. Hanya data-URL gambar atau tautan `https` yang diterima saat ditampilkan |

### `workspaces/{wsId}`
`name`, `ownerUid`, `joinCode` (6 karakter unik), `driveLink`, `createdAt`

### `workspaces/{wsId}/members/{uid}`
`uid`, `email`, `name`, `role` (`mentor`, `worker`), `division`, `dailyGoal`, `goalDate`, `lastActive` (heartbeat), `joinedAt`

### `workspaces/{wsId}/tasks/{id}`
| Field | Keterangan |
|---|---|
| `title`, `desc` | Judul dan instruksi |
| `assignee` | Nama member penerima |
| `difficulty` | `rendah`, `sedang`, `tinggi` |
| `startDate`, `endDate` | Periode pengerjaan |
| `status` | `todo`, `progress`, `review`, `done` |
| `driveSource` | `workspace`, `task`, atau `individual` (menentukan folder mana yang dipakai dan siapa boleh mengubahnya) |
| `driveUrl` | Tautan folder khusus tugas atau individu |
| `reportFileLink`, `reportNotes` | Tautan hasil kerja dan catatan laporan anggota |
| `revisionNotes` | Catatan revisi mentor |
| `subtasks[]` | `{id, text, done}` |
| `attachments[]` | `{id, name, url, by, uid, at}` |
| `history[]` | `{type: laporan, revisi, selesai, by, text, at}` |
| `createdAt`, `updatedAt` | timestamp |

### `workspaces/{wsId}/divisions/{id}`
`name`, `desc`, `createdAt`

### `workspaces/{wsId}/activities/{id}`
`type`, `text`, `taskId`, `by`, `uid`, `at`

### `workspaces/{wsId}/announcements/{id}`
`title`, `body`, `pinned`, `by`, `uid`, `readBy[]` (uid anggota yang sudah melihat), `createdAt`, `updatedAt`

### `localStorage`
Kunci `akasha_productivity_v3` (migrasi otomatis dari v2, cadangan di `users/{uid}/productivity/data`), `akasha_theme`, dan `darkMode` (warisan, hanya dibaca sebagai nilai awal tema).

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

## Alur Status dan Tenggat Tugas

**Status**

| Nilai | Label UI | Pill |
|---|---|---|
| `todo` | Belum Dimulai | abu-abu |
| `progress` | Berjalan *(atau "Revisi" bila ada catatan mentor)* | kuning atau merah |
| `review` | Siap Dicek | oranye |
| `done` | Selesai | hijau |

**Tenggat** (dihitung dari `endDate` terhadap tanggal lokal)

| Level | Kondisi | Label |
|---|---|---|
| `overdue` | kurang dari 0 hari | `Terlambat N hari` |
| `urgent` | 1 hari atau kurang | `Hari ini` atau `Besok` |
| `soon` | 3 hari atau kurang | `H-N` |

---

## Produktivitas Pribadi

Data utama ada di `localStorage`, lalu disinkronkan (jeda 600 ms) ke `users/{uid}/productivity/data` agar ikut berpindah antar perangkat. Hanya pemilik akun yang bisa membacanya.

- **Graf kontribusi**: 105 sel (15 kolom x 7 baris). Level 0 sampai 4 dihitung dari rasio kebiasaan yang tercentang pada hari itu.
- **Streak**: naik saat dicentang, turun saat dibatalkan. `longest` menyimpan rekor.
- **Mood**: nilai 1 sampai 5. Entri pada hari yang sama ditimpa, bukan diduplikasi.
- **Grafik tren**: SVG inline tanpa library.

---

## Tema dan Responsivitas

- **Arah desain**: token warna di awal `style.css` (`--bg`, `--surface`, `--accent`, `--text`, dan seterusnya). Komponen hanya memakai token, bukan warna tetap, sehingga tema bisa diganti tanpa menyentuh komponen.
- **Tiga tema**: Terang (bawaan), Gelap (`body.dark-mode`), dan Playful (`body.theme-playful`). Pilihan tersimpan di `localStorage('akasha_theme')` dan diatur lewat Pengaturan Akun. Jika belum ada pilihan, tema mengikuti preferensi sistem.
- **Breakpoint**: 1200px (grid dashboard 1 kolom), 1100px (statistik 2 kolom), 960px (hero auth disembunyikan), 768px (sidebar menjadi bottom nav, sidebar workspace menjadi tab horizontal), 480px, 360px (label menu hanya ikon).

---

## Pemecahan Masalah

| Gejala | Penyebab dan solusi |
|---|---|
| `auth/unauthorized-domain` | Domain belum terdaftar. Tambahkan di Authentication, Settings, Authorized domains (domain saja, tanpa `https://` dan path). |
| `auth/operation-not-allowed` | Provider Google atau Email belum diaktifkan di Sign-in method. |
| `auth/popup-blocked` | Browser memblokir popup. Izinkan popup untuk situs ini. |
| Halaman kosong atau tombol tidak merespons | Ada file JS yang belum diunggah, atau halaman dibuka lewat `file://`. Buka konsol browser (F12) untuk melihat modul yang gagal dimuat. |
| `permission-denied` saat membaca data | Rules Firestore belum diterapkan atau belum mencakup koleksi tersebut (mis. `profiles`). |
| Status "dibaca" pengumuman tidak tersimpan | Rules menolak penulisan `readBy`. Pelacakan dimatikan otomatis dan peringatan dicatat di konsol. |

---

## Batasan Diketahui

1. Sinkron produktivitas memakai strategi sederhana (data cloud menimpa lokal). Belum ada penggabungan per kebiasaan bila dua perangkat diedit bersamaan.
2. Notifikasi dimuat dengan `limit(300)`, sehingga penghitung belum dibaca tidak melampaui 300.
3. Rules `workspaces/{id}` mengizinkan anggota mana pun memperbarui dokumen ruang. Untuk produksi, batasi field sensitif (`ownerUid`, `joinCode`) dan pertimbangkan **App Check**.
4. Belum ada pengingat push. Pengingat lembut hanya tampil saat aplikasi dibuka.

---

## Roadmap

**Sudah selesai:** roll-over harian, riwayat per kebiasaan, jurnal dan grafik mood bulanan, target frekuensi, kategori dan arsip, insight korelasi, rekap bulanan, milestone streak, freeze token, sinkron cloud, profil pengguna, tautan Drive per tugas, pelacak "dibaca oleh".

**Berikutnya:** pengingat web push, penggabungan data lintas perangkat per kebiasaan, query notifikasi belum dibaca terpisah, rules per field untuk dokumen ruang kerja.

---

## Kontribusi

0. Ikuti aturan antislop: tanpa em dash dan emoji dekoratif, kontras minimal 4.5:1, kontrol interaktif memakai `<button>` atau `<a href>`, angka hanya dari data nyata.
1. Pertahankan gaya kode yang ada: helper `escapeHtml()`, `localDate()`, `toast()`, serta dialog in-app (`showAlert`, `askConfirm`, `askText`). **Jangan** memakai `alert`, `confirm`, atau `prompt` bawaan.
2. Semua konten pengguna wajib lewat `escapeHtml()` sebelum masuk `innerHTML`. Tautan dan gambar dari database dianggap tidak tepercaya dan harus lewat `safeUrl()` atau `safeLogoSrc()`.
3. UI baru harus kompatibel dengan ketiga tema dan breakpoint yang sudah ada. Gunakan design token `var(--...)`, jangan warna tetap.
4. Logika baru yang berdiri sendiri sebaiknya dibuat sebagai modul terpisah seperti `drive.js`, dengan dependensi dikirim lewat parameter.
5. Tidak menambah library eksternal tanpa diskusi.

---

## Lisensi

Proyek pembelajaran: bebas digunakan dan dimodifikasi untuk keperluan edukasi.

---

**Akasha** · dibuat dengan Firebase
