"use strict";
/*
 * Server SAIN (Sambung Kain)
 * - Menyajikan website dari folder public/
 * - API untuk pesanan, setoran preloved, pesanan komunitas, dan pendaftaran mitra
 * - Halaman admin di /admin (dilindungi ADMIN_TOKEN)
 * Data disimpan sebagai file JSON di DATA_DIR (default ./data).
 */
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- Penyimpanan JSON sederhana ---------- */
const COLLECTIONS = ["orders", "setoran", "komunitas", "mitra"];
const db = {};
for (const name of COLLECTIONS) {
  const file = path.join(DATA_DIR, name + ".json");
  try { db[name] = JSON.parse(fs.readFileSync(file, "utf8")); } catch { db[name] = []; }
}
const writing = {};
function save(name) {
  // Tulis atomik: file sementara lalu rename, agar data tidak rusak bila proses mati di tengah jalan
  if (writing[name]) { writing[name] = "again"; return; }
  writing[name] = true;
  const file = path.join(DATA_DIR, name + ".json");
  const tmp = file + ".tmp";
  fs.writeFile(tmp, JSON.stringify(db[name], null, 2), (err) => {
    if (err) console.error("Gagal menyimpan", name, err);
    else fs.renameSync(tmp, file);
    const again = writing[name] === "again";
    writing[name] = false;
    if (again) save(name);
  });
}
function insert(name, rec) { db[name].push(rec); save(name); return rec; }

/* ---------- Utilitas ---------- */
const rand4 = () => String(crypto.randomInt(1000, 10000));
const newId = (prefix) => prefix + "-" + Date.now().toString(36).toUpperCase().slice(-5) + rand4();
const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const WA_RE = /^(08|628|\+628)\d{8,12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normWa = (v) => str(v, 30).replace(/[\s-]/g, "");

const COURIERS = {
  jne: { name: "JNE REG", price: 22000, prefix: "JN" },
  jnt: { name: "J&T Express", price: 20000, prefix: "JT" },
  lokal: { name: "Kurir lokal", price: 12000, prefix: "LK" },
  ambil: { name: "Ambil di tempat", price: 0, prefix: "" },
};

/* Pembatas laju sederhana per IP (mencegah spam form) */
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path, now = Date.now();
    const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) return res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi beberapa menit lagi." });
    h.push(now); hits.set(key, h); next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

/* ---------- App ---------- */
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
  });
  next();
});
app.use(express.json({ limit: "200kb" }));

app.get("/healthz", (req, res) => res.json({ ok: true }));

/* Pesanan / checkout */
app.post("/api/orders", rateLimit(20, 600e3), (req, res) => {
  const b = req.body || {}, buyer = b.buyer || {};
  const errors = [];
  const nama = str(buyer.nama, 100), wa = normWa(buyer.wa), email = str(buyer.email, 120);
  const alamat = str(buyer.alamat, 400), kota = str(buyer.kota, 100), prov = str(buyer.prov, 100), pos = str(buyer.pos, 5);
  if (nama.length < 3) errors.push("Nama penerima belum diisi.");
  if (!WA_RE.test(wa)) errors.push("Nomor WhatsApp tidak valid.");
  if (!EMAIL_RE.test(email)) errors.push("Email tidak valid.");
  if (alamat.length < 10) errors.push("Alamat belum lengkap.");
  if (kota.length < 3 || prov.length < 3) errors.push("Kota/provinsi belum diisi.");
  if (!/^\d{5}$/.test(pos)) errors.push("Kode pos harus 5 angka.");
  const courier = COURIERS[b.courier];
  if (!courier) errors.push("Kurir tidak dikenal.");
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  if (!items.length) errors.push("Keranjang kosong.");
  const clean = items.map((it) => ({
    id: str(it.id, 40), name: str(it.name, 120), kind: str(it.kind, 20),
    qty: Math.max(1, Math.min(5, parseInt(it.qty, 10) || 1)),
    size: it.size ? str(it.size, 10) : null,
    price: Math.max(0, Math.min(10_000_000, Math.round(Number(it.price) || 0))),
    edition: it.edition ? str(it.edition, 120) : null,
    cfg: it.cfg && typeof it.cfg === "object" ? {
      title: str(it.cfg.title, 40), type: str(it.cfg.type, 30), size: it.cfg.size ? str(it.cfg.size, 10) : null,
      note: str(it.cfg.note, 500), colors: Array.isArray(it.cfg.colors) ? it.cfg.colors.slice(0, 12).map((c) => str(c, 7)).filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : [],
    } : null,
  }));
  if (clean.some((it) => !it.price)) errors.push("Harga produk tidak valid.");
  if (errors.length) return res.status(400).json({ error: errors[0], errors });

  const subtotal = clean.reduce((s, it) => s + it.price * it.qty, 0);
  const dueNow = clean.reduce((s, it) => s + it.price * it.qty * (it.kind === "custom" ? 0.5 : 1), 0);
  const total = Math.round(dueNow + courier.price);
  const order = "SAIN-" + rand4() + rand4().slice(0, 2);
  const resi = b.courier === "ambil" ? "AMBIL-" + rand4() : courier.prefix + rand4() + rand4() + rand4();
  insert("orders", {
    order, resi, status: "menunggu_pembayaran", createdAt: new Date().toISOString(),
    buyer: { nama, wa, email, alamat, kota, prov, pos },
    payment: str(b.payment, 80), courier: { id: b.courier, ...courier },
    items: clean, subtotal, dueNow: Math.round(dueNow), total, sedekah: Math.round(subtotal * 0.07),
  });
  res.status(201).json({ order, resi, total });
});

/* Setoran preloved (dengan foto) */
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif" }[file.mimetype] || ".img";
      cb(null, Date.now() + "-" + crypto.randomBytes(6).toString("hex") + ext);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 8, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
app.post("/api/setoran", rateLimit(10, 600e3), (req, res) => {
  upload.array("foto", 8)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Foto maksimal 8 MB per file." : "Unggahan foto gagal." });
    const b = req.body || {};
    const opsi = str(b.opsi, 20), jumlah = parseInt(b.jumlah, 10);
    const cleanup = () => (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
    if (!["jual", "poin", "sedekah"].includes(opsi)) { cleanup(); return res.status(400).json({ error: "Pilihan setoran tidak valid." }); }
    if (!(jumlah >= 1 && jumlah <= 20)) { cleanup(); return res.status(400).json({ error: "Jumlah barang 1–20." }); }
    if (b.akad !== "1") { cleanup(); return res.status(400).json({ error: "Persetujuan akad wajib dicentang." }); }
    const rec = insert("setoran", {
      id: newId("STR"), status: "baru", createdAt: new Date().toISOString(),
      jenis: str(b.jenis, 80), jumlah, opsi, foto: (req.files || []).map((f) => f.filename),
    });
    res.status(201).json({ id: rec.id });
  });
});

/* Pesanan komunitas */
app.post("/api/komunitas", rateLimit(10, 600e3), (req, res) => {
  const b = req.body || {};
  const nama = str(b.nama, 120), qty = parseInt(b.qty, 10);
  if (!nama) return res.status(400).json({ error: "Isi nama lembaga atau komunitas." });
  if (!(qty >= 12 && qty <= 100000)) return res.status(400).json({ error: "Pesanan komunitas mulai 12 pcs." });
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(b.tanggal || "") ? b.tanggal : null;
  const rec = insert("komunitas", {
    id: newId("KOM"), status: "baru", createdAt: new Date().toISOString(),
    nama, produk: str(b.produk, 40), qty, tanggal, catatan: str(b.catatan, 1000),
  });
  res.status(201).json({ id: rec.id });
});

/* Pendaftaran mitra (konveksi / penjahit) */
app.post("/api/mitra", rateLimit(10, 600e3), (req, res) => {
  const b = req.body || {};
  const jenis = str(b.jenis, 20), nama = str(b.nama, 120), wa = normWa(b.wa), kota = str(b.kota, 100);
  if (!["konveksi", "penjahit"].includes(jenis)) return res.status(400).json({ error: "Jenis mitra tidak valid." });
  if (nama.length < 3) return res.status(400).json({ error: "Isi nama." });
  if (!WA_RE.test(wa)) return res.status(400).json({ error: "Nomor WhatsApp diawali 08 atau +62, 10–14 digit." });
  if (kota.length < 3) return res.status(400).json({ error: "Isi kota atau kabupaten." });
  if (b.setuju !== true) return res.status(400).json({ error: "Centang kesediaan mengikuti ketentuan." });
  const rec = insert("mitra", { id: newId("MTR"), status: "baru", createdAt: new Date().toISOString(), jenis, nama, wa, kota });
  res.status(201).json({ id: rec.id });
});

/* ---------- Admin ---------- */
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: "ADMIN_TOKEN belum diatur di server." });
  const h = req.get("authorization") || "";
  const given = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : String(req.query.token || ""));
  const want = Buffer.from(ADMIN_TOKEN);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: "Token admin salah." });
  next();
}
app.get("/api/admin/data", requireAdmin, (req, res) => res.json(db));
app.patch("/api/admin/:col/:id", requireAdmin, (req, res) => {
  const col = req.params.col;
  if (!COLLECTIONS.includes(col)) return res.status(404).json({ error: "Koleksi tidak ada." });
  const rec = db[col].find((r) => (r.order || r.id) === req.params.id);
  if (!rec) return res.status(404).json({ error: "Data tidak ditemukan." });
  rec.status = str((req.body || {}).status, 40) || rec.status;
  rec.updatedAt = new Date().toISOString();
  save(col);
  res.json(rec);
});
app.get("/api/admin/uploads/:file", requireAdmin, (req, res) => {
  const f = path.basename(req.params.file);
  res.sendFile(path.join(UPLOAD_DIR, f), (err) => err && res.status(404).end());
});
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin", "index.html")));

/* ---------- File statis ---------- */
app.get("/sw.js", (req, res, next) => { res.set("Cache-Control", "no-cache"); next(); });
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", index: "index.html" }));
app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint tidak ditemukan." }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`SAIN berjalan di http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) console.warn("Peringatan: ADMIN_TOKEN belum diatur, halaman /admin tidak bisa dipakai.");
});
