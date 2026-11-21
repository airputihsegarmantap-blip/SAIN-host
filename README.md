# SAIN · Sambung Kain — Prototipe Website

Prototipe website SAIN untuk lomba. Semua fitur (katalog, kustom perca, keranjang, checkout, setor preloved, pesanan komunitas, daftar mitra) berjalan sebagai **simulasi di browser**. Tidak ada data yang dikirim atau disimpan ke server.

Website ini juga bisa dipasang di HP seperti aplikasi (PWA) dan tetap bisa dibuka saat offline.

## Online gratis lewat GitHub Pages (tanpa kartu kredit)

1. Buka repo ini di GitHub → **Settings** → **Pages**.
2. Di **Build and deployment → Source**, pilih **Deploy from a branch**.
3. Pilih branch `ccr-fe64e30d-r18jo2`, folder **/ (root)**, lalu **Save**.
4. Tunggu 1–2 menit. Alamat website muncul di halaman yang sama:
   `https://airputihsegarmantap-blip.github.io/SAIN-host/`

Setiap perubahan yang di-push ke branch itu otomatis ikut ter-update.

## Isi folder

```
index.html             website SAIN
manifest.webmanifest   data aplikasi (nama, ikon, warna)
sw.js                  service worker (agar bisa dibuka offline)
icons/                 ikon aplikasi
```
