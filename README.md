# SAIN · Sambung Kain — Website + Server

Website SAIN yang sudah menjadi aplikasi server sungguhan (Node.js + Express).

## Yang dikerjakan server

| Fitur di website | Endpoint | Disimpan ke |
|---|---|---|
| Checkout keranjang | `POST /api/orders` | `data/orders.json` (nomor pesanan & resi dibuat server, total dihitung ulang di server) |
| Setor preloved + foto | `POST /api/setoran` | `data/setoran.json` + `data/uploads/` |
| Pesanan komunitas | `POST /api/komunitas` | `data/komunitas.json` |
| Daftar mitra konveksi/penjahit | `POST /api/mitra` | `data/mitra.json` |

Semua input divalidasi ulang di server dan ada pembatas laju untuk mencegah spam.

**Halaman admin:** buka `/admin`, masukkan `ADMIN_TOKEN`. Di sana semua pesanan, setoran (beserta foto), permintaan komunitas, dan pendaftar mitra bisa dilihat dan diubah statusnya. Nomor WhatsApp bisa diklik untuk langsung chat.

## Menjalankan di komputer

```bash
npm install
ADMIN_TOKEN=rahasia-anda npm start
# buka http://localhost:3000 dan http://localhost:3000/admin
```

## Hosting gratis di Render.com

1. Daftar di https://render.com (bisa login dengan akun GitHub).
2. **New → Blueprint**, pilih repo `SAIN-host`. Render membaca `render.yaml` otomatis.
3. Klik **Apply**. Setelah beberapa menit website aktif di `https://sain-xxxx.onrender.com`.
4. Lihat `ADMIN_TOKEN` yang dibuat otomatis di menu **Environment** layanan `sain`.

Setiap kali ada push ke repo, Render men-deploy ulang otomatis.

### Batasan paket gratis (penting)

- Server "tidur" setelah 15 menit tanpa pengunjung; kunjungan pertama berikutnya butuh ±30–60 detik.
- **Disk tidak permanen.** File di `data/` hilang saat server di-deploy ulang atau dinyalakan ulang. Untuk data yang harus tersimpan selamanya, pilih salah satu:
  - tambahkan Persistent Disk di Render (berbayar) dan isi `DATA_DIR` dengan path disk tersebut, atau
  - sambungkan ke database gratis (mis. Supabase/Turso), atau
  - rutin unduh data lewat `/api/admin/data` (format JSON).

## Konfigurasi

| Variabel | Fungsi | Default |
|---|---|---|
| `PORT` | Port server | `3000` |
| `ADMIN_TOKEN` | Kata sandi halaman admin | (kosong = admin nonaktif) |
| `DATA_DIR` | Folder penyimpanan data | `./data` |

## Struktur

```
server.js            server Express + API
public/index.html    website SAIN
public/sw.js         service worker (PWA, bisa dibuka offline)
public/manifest.webmanifest, public/icons/
admin/index.html     dasbor admin
render.yaml          konfigurasi hosting Render
Dockerfile           alternatif hosting berbasis Docker
```
