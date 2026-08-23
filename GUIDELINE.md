# Guideline: membuat aplikasi kasir dari 0 sampai rilis

Panduan ini mengikuti arsitektur **TOKO SKLAMINI**: kasir desktop Windows (React + Tauri), data dulu ke **SQLite lokal**, lalu antri sync ke **API Hono + PostgreSQL** di VPS. Toko tetap bisa jualan saat internet putus.

Baca dulu prinsip di bawah, lalu kerjakan **berurutan dari Fase 0 sampai Fase 12**. Jangan lompat ke cetak struk atau deploy sebelum alur bayar lokal berjalan.

---

## Prinsip yang tidak boleh dilanggar

1. **Offline-first.** Setiap penjualan, retur, restock, opname, dan pengeluaran ditulis ke database lokal dulu. Server hanya menerima salinan.
2. **Uang dalam satuan rupiah bulat (integer).** Jangan pakai float untuk harga. Stok boleh desimal (`REAL`) karena ada barang per kg.
3. **ID dibuat di klien** (UUID). Server memakai `INSERT … ON CONFLICT DO NOTHING` supaya sync ulang tidak mendobel data.
4. **Stok = jumlah `stock_events`, bukan kolom di produk.** Penjualan mengurangi stok, restock menambah, void/retur/opname menyesuaikan. Jangan update kolom `products.stock`.
5. **PIN di-hash.** PIN kasir/owner tidak disimpan polos di server.
6. **Owner vs kasir.** Menu produk, pengeluaran, laporan, pengaturan hanya untuk owner.

```
[Scanner / kasir] --> SQLite lokal --> tabel outbox --> API /v1/sync/push --> PostgreSQL
                         ^                                         |
                         +------------- /v1/sync/pull <------------+
```

---

## Peta fase (susunan pembuatan)

| Fase | Apa | Hasil yang harus ada sebelum lanjut |
|------|-----|-------------------------------------|
| 0 | Putuskan arsitektur & fitur MVP | Daftar fitur, peran, alur uang |
| 1 | Pasang alat | Node, Git, Docker, Rust (untuk .exe) |
| 2 | Scaffold monorepo | `npm run dev` membuka halaman kosong |
| 3 | Paket `shared` | Tipe, format rupiah, hash PIN, rumus laba |
| 4 | Database lokal + seed | Login PIN berhasil, ada produk dummy |
| 5 | Halaman kasir (inti) | Scan → keranjang → bayar → stok berkurang |
| 6 | Modul toko lain | Riwayat, void, restock, opname, retur, kas, absen, laporan |
| 7 | Hardware | Struk 58mm, nota A4, laci kas, beep scan |
| 8 | API + PostgreSQL | `GET /health` hidup, skema ter-push |
| 9 | Sync offline | Antrian terkirim, pull produk dari server |
| 10 | Uji end-to-end | Skenario toko lolos, termasuk mode offline |
| 11 | Deploy API ke VPS | Kasir di toko bisa ping URL publik |
| 12 | Build installer & rilis | File `.exe` / NSIS terpasang di PC kasir |

---

## Fase 0 — Rancang dulu, baru ketik kode

### 0.1 Fitur MVP (wajib sebelum buka toko)

- Login PIN (owner / kasir)
- Master produk: barcode, nama, satuan, harga beli, harga jual
- Kasir: scan, qty, diskon, ongkir, PPN, bayar (tunai / QRIS / transfer / kartu / campur)
- Tahan transaksi (draft) dan lanjutkan
- Cetak struk 58mm + pilihan nota A4
- Riwayat + void (PIN owner)
- Restock (barang masuk)
- Stok opname
- Retur
- Pengeluaran
- Settlement kas (buka/tutup shift)
- Absen karyawan
- Laporan laba rugi & arus kas
- Pengaturan: nama toko, URL API, token, backup/restore DB
- Sync antrian saat online

### 0.2 Yang sengaja ditunda (bukan MVP)

- Multi-cabang dengan stok terpisah
- Akuntansi lengkap (jurnal)
- Aplikasi Android kasir
- Marketplace / e-commerce

### 0.3 Peran

| Peran | Bisa |
|-------|------|
| Kasir | Jualan, draft, riwayat, retur, restock, opname, settlement, absen |
| Owner | Semua milik kasir + produk, pengeluaran, laporan, pengaturan, void |

---

## Fase 1 — Pasang alat

Kerjakan di Mac (untuk pengembangan UI) dan nanti di Windows (untuk build `.exe`).

### 1.1 Cek versi

```bash
node -v          # butuh v20 atau lebih baru
npm -v
git --version
docker --version
```

Kalau Node belum ada (Mac):

```bash
brew install node git
```

Kalau Docker belum ada: pasang [Docker Desktop](https://www.docker.com/products/docker-desktop/).

### 1.2 Rust + Tauri (hanya wajib saat membuat installer Windows)

Di **PC Windows** (build `.exe` tidak bisa dari Mac):

1. Pasang [Rust](https://rustup.rs): buka PowerShell, jalankan skrip `rustup-init`.
2. Pasang [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (workload *Desktop development with C++*).
3. WebView2 sudah ada di Windows 10/11.
4. Cek:

```powershell
rustc --version
cargo --version
```

Di Mac, `npm run dev` cukup untuk uji UI. `npm run tauri:dev` juga bisa di Mac, tapi hasilnya aplikasi Mac, bukan `.exe`.

### 1.3 Editor

Cursor / VS Code + ekstensi:

- ESLint (opsional)
- rust-analyzer (kalau menyentuh `src-tauri`)

---

## Fase 2 — Scaffold monorepo

Struktur target:

```
TOKO SKLAMINI/
  package.json              # workspace root
  docker-compose.yml        # PostgreSQL lokal
  .env.example
  packages/shared/          # tipe & rumus, tanpa UI
  apps/kasir/               # React + Vite + sql.js + Tauri
  apps/api/                 # Hono + Drizzle + PostgreSQL
```

### 2.1 Inisialisasi (kalau mulai folder kosong)

```bash
mkdir "TOKO SKLAMINI"
cd "TOKO SKLAMINI"
git init
npm init -y
```

Isi `package.json` root kurang lebih:

```json
{
  "name": "toko-sklamini",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "npm run dev -w @sklamini/kasir",
    "dev:kasir": "npm run dev -w @sklamini/kasir",
    "dev:api": "npm run dev -w @sklamini/api",
    "build": "npm run build -w @sklamini/shared && npm run build -w @sklamini/kasir",
    "tauri": "npm run tauri -w @sklamini/kasir",
    "tauri:dev": "npm run tauri:dev -w @sklamini/kasir"
  }
}
```

### 2.2 Paket shared

```bash
mkdir -p packages/shared/src
cd packages/shared
npm init -y
```

`packages/shared/package.json`: `"name": "@sklamini/shared"`, `"type": "module"`, export `./src/index.ts`.

### 2.3 Aplikasi kasir (Vite + React + TypeScript)

Dari root:

```bash
cd apps
npm create vite@latest kasir -- --template react-ts
cd kasir
npm install
```

Ubah nama paket menjadi `@sklamini/kasir`. Tambah dependensi:

```bash
cd apps/kasir
npm install sql.js
npm install -D @types/sql.js @tauri-apps/cli
```

Port dev **1420** (bukan 5173), supaya Tauri dan browser sama. Di `vite.config.ts` set `server.port: 1420`.

Dari root:

```bash
npm install
npm run dev
```

Buka http://localhost:1420 — harus ada halaman Vite default.

### 2.4 Bungkus Tauri

```bash
cd apps/kasir
npx @tauri-apps/cli init
```

Isi saat ditanya:

- Window title: `TOKO SKLAMINI — Kasir`
- Identifier: `com.tokosklamini.kasir`
- Dev URL: `http://localhost:1420`
- Frontend dist: `../dist`

`tauri.conf.json` bundle target untuk Windows: `["nsis", "msi"]`.

### 2.5 API

```bash
mkdir -p apps/api/src/db
cd apps/api
npm init -y
npm install hono @hono/node-server drizzle-orm postgres
npm install -D typescript tsx @types/node
```

Nama paket: `@sklamini/api`. Script:

```json
{
  "dev": "tsx watch src/index.ts",
  "start": "tsx src/index.ts",
  "db:push": "tsx src/db/push.ts",
  "db:seed": "tsx src/db/seed.ts"
}
```

### 2.6 PostgreSQL lokal

`docker-compose.yml` di root (sudah ada di repo ini):

```bash
docker compose up -d
docker compose ps
```

`.env` (disalin dari `.env.example`):

```bash
cp .env.example .env
```

Isi:

```
DATABASE_URL=postgres://sklamini:sklamini@127.0.0.1:5432/sklamini
JWT_SECRET=ganti-dengan-rahasia-panjang
PORT=8787
API_TOKEN=
CORS_ORIGIN=*
VITE_API_URL=http://127.0.0.1:8787
```

Jangan commit `.env`.

---

## Fase 3 — Paket `@sklamini/shared` (kerjakan duluan)

File yang dibuat:

- `packages/shared/src/types.ts` — Product, Sale, CartLine, PayMethod, UserRole, …
- `packages/shared/src/ids.ts` — `newId()` UUID
- `packages/shared/src/reports.ts` — `labaRugi()`, `arusKas()`, `formatRp()`
- `packages/shared/src/index.ts` — re-export + `hashPin()`

Aturan tipe:

```ts
export const PAY_METHODS = ["tunai", "qris", "transfer", "kartu"] as const;
export const USER_ROLES = ["owner", "kasir"] as const;
export const STOCK_EVENT_TYPES = [
  "sale", "sale_void", "return", "stock_in", "adjust",
] as const;
```

`hashPin` harus **identik** di kasir dan API, supaya login lokal dan login server memakai hash yang sama.

Uji rumus di kertas dulu:

- Penjualan tunai 100.000, HPP 70.000, listrik 10.000
- Laba kotor = 30.000, laba bersih = 20.000
- Arus kas tunai masuk 100.000, keluar 10.000 (+ pembelian jika ada)

Baru setelah rumus benar, pakai di UI dan API.

---

## Fase 4 — Database lokal SQLite

Kasir memakai **sql.js** (SQLite di WebAssembly). File DB disimpan di IndexedDB browser / filesystem Tauri.

### 4.1 Urutan file

1. `apps/kasir/src/lib/schema.ts` — `CREATE TABLE`
2. `apps/kasir/src/lib/db.ts` — buka DB, persist
3. `apps/kasir/src/lib/repo.ts` — semua query (satu pintu)
4. `apps/kasir/src/lib/seed.ts` — user + produk contoh kalau DB kosong

### 4.2 Tabel wajib (urut pembuatan)

Buat dalam urutan ini, karena tabel belakangan merujuk yang di atas:

1. `users`, `employees`
2. `products`
3. `stock_events`
4. `sales`, `sale_items`, `sale_payments`
5. `customers`, `customer_payments`
6. `expenses`
7. `stock_ins`, `stock_in_items`
8. `returns`, `return_items`
9. `opnames`, `opname_items`
10. `attendances`
11. `cash_shifts`
12. `settings`
13. `outbox` — antrian sync (`id`, `entity`, `payload`, `created_at`)
14. `sync_state` — cursor pull terakhir

Stok **tidak** disimpan di `products`. Hitung:

```sql
SELECT COALESCE(SUM(qty), 0) FROM stock_events WHERE product_id = ?
```

### 4.3 Seed

Minimal:

| Nama | Peran | PIN (hanya untuk uji) |
|------|--------|------------------------|
| Owner | owner | 123456 |
| Kasir | kasir | 111111 |

Plus 5–10 produk dummy dengan barcode unik. Ganti PIN sebelum toko buka.

### 4.4 Boot aplikasi

Di `App.tsx`:

1. `openDb()`
2. `seedIfEmpty()`
3. Restore session dari `localStorage` (opsional)
4. Baru render login / kasir

Kalau DB gagal buka, tampilkan error — jangan layar putih.

Uji:

```bash
npm run dev
```

Login PIN `123456` harus masuk.

---

## Fase 5 — Halaman kasir (inti produk)

Kerjakan **satu alur sampai selesai** sebelum halaman lain. Urutan di dalam fase ini:

### 5.1 Login

- Input PIN, tekan Enter
- `loginByPin(pin)` bandingkan hash
- Simpan session `{ id, name, role }`
- Kasir tidak melihat menu owner

### 5.2 Master produk (owner) — kerjakan sebelum kasir

Tanpa produk, kasir tidak bisa diuji.

- Daftar + cari nama/barcode
- Tambah / edit: barcode unik, harga beli < harga jual (peringatkan, jangan blokir)
- Nonaktifkan produk (jangan hapus — riwayat penjualan merujuk ID)
- Import Excel (`xlsx`) opsional, setelah input manual jalan

### 5.3 Layar kasir

Urutan implementasi di `KasirPage.tsx`:

1. Input barcode + fokus otomatis (scanner USB mengetik sangat cepat lalu Enter atau tidak — dukung keduanya)
2. Cari produk, masuk keranjang; scan barang yang sama = qty +1
3. Ubah qty, hapus baris
4. Subtotal, diskon, ongkir, PPN, total
5. Dialog bayar (F12): metode, jumlah dibayar, kembalian
6. Multi-metode (mis. tunai + QRIS) lewat `sale_payments`
7. Simpan:
   - insert `sales` + `sale_items` + `sale_payments`
   - insert `stock_events` type `sale` qty negatif
   - insert `outbox` entity `sale`
   - kosongkan keranjang
8. Tahan (F11) = simpan snapshot keranjang sebagai draft, tanpa mengurangi stok
9. Shortcut: F12 bayar, F11 tahan, Esc batal dialog

### 5.4 Aturan uang

```
total = subtotal - diskon + ongkir + ppn
kembalian = dibayar - total     (hanya tunai; selain tunai dibayar = total)
```

Semua integer. Qty boleh 0.5 untuk barang kiloan.

**Stop di sini.** Jangan lanjut laporan atau sync sebelum: scan → bayar → stok berkurang → muncul di riwayat lokal.

---

## Fase 6 — Modul toko (urutan disarankan)

Kerjakan satu halaman sampai CRUD-nya benar, baru halaman berikutnya.

| Urutan | Halaman | Kenapa urutan ini |
|--------|---------|-------------------|
| 1 | Riwayat | Cek penjualan Fase 5 |
| 2 | Void | Butuh riwayat; tulis `sale_void` (qty positif) + status `void` |
| 3 | Draft | Lanjutkan keranjang tertahan |
| 4 | Restock | `stock_in` qty positif; harga beli boleh berubah |
| 5 | Opname | Bandingkan stok sistem vs fisik; `adjust` selisih |
| 6 | Retur | Barang kembali; `return` qty positif |
| 7 | Pengeluaran | Kategori: pembelian, listrik, sewa, gaji, atk, lain |
| 8 | Settlement kas | Buka shift (modal), tutup (hitung tunai vs sistem) |
| 9 | Absen | PIN karyawan, masuk/pulang |
| 10 | Laporan | Pakai fungsi `shared` (laba rugi, arus kas, per metode) |
| 11 | Pengaturan | Nama toko, footer struk, URL API, token, backup DB |

Setiap dokumen yang mengubah stok **wajib** menulis `stock_events` dan baris `outbox`.

Backup: menu Pengaturan mengekspor file SQLite. Restore menimpa DB lokal — konfirmasi dua kali.

---

## Fase 7 — Hardware toko

Kerjakan setelah alur bayar stabil. Gagal cetak **tidak boleh** membatalkan penjualan yang sudah tersimpan.

### 7.1 Printer thermal 58mm

- Driver Windows atau Bluetooth SPP
- Setelah Simpan: dialog pilih Struk / Nota A4 / keduanya / selesai
- Struk: nama toko, no lokal, item, total, metode, footer
- Uji di printer sungguhan, bukan hanya preview

### 7.2 Scanner barcode USB

- Mode HID keyboard
- Input kasir selalu di-fokus ulang setelah bayar/dialog
- Beep sukses / gagal (barang tidak ketemu)

### 7.3 Laci kas (cash drawer)

- Biasanya kick-code lewat printer (`ESC p`)
- Buka laci hanya untuk pembayaran tunai, atau tombol manual owner

Jangan blokir penjualan kalau printer/laci error — tampilkan toast, data sudah aman di SQLite.

---

## Fase 8 — API server

API **bukan** sumber kebenaran saat kasir offline. API adalah replika + sumber pull master data.

### 8.1 Skema PostgreSQL

Mirror tabel lokal (`apps/api/src/db/schema.ts`) dengan Drizzle. Tipe kolom:

- Uang: `integer`
- Qty: `doublePrecision`
- Waktu: `timestamp with time zone`
- ID: `text` (UUID dari klien)

### 8.2 Endpoint minimal

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/health` | Ping dari kasir |
| POST | `/v1/auth/login` | Cek PIN (opsional; kasir sudah login lokal) |
| GET | `/v1/sync/pull?since=` | Produk, user, employee, stock_events, settings baru |
| POST | `/v1/sync/push` | Terima batch outbox `{ deviceId, items[] }` |
| GET | `/v1/reports/summary` | Laba rugi / arus kas dari data server |
| GET | `/v1/stock` | Stok agregat per produk |

Auth: header `Authorization: Bearer <API_TOKEN>` jika `API_TOKEN` di-set. Kosong = terbuka (hanya untuk dev).

### 8.3 Push harus idempotent

```ts
await db.insert(sales).values({...}).onConflictDoNothing();
```

Entity yang diterima: `sale`, `expense`, `stock_in`, `attendance`, `return`, `opname`, `settings`, `cash_shift`, `customer`, … — samakan dengan `outbox.entity` di kasir.

### 8.4 Perintah API lokal

```bash
docker compose up -d
cp .env.example .env          # jika belum
npm run db:push -w @sklamini/api
npm run db:seed -w @sklamini/api
npm run dev:api
```

Uji:

```bash
curl http://127.0.0.1:8787/health
```

Harus: `{"ok":true,"name":"TOKO SKLAMINI API"}`.

---

## Fase 9 — Menghubungkan kasir ke server

### 9.1 Di aplikasi

Pengaturan → **URL API** `http://127.0.0.1:8787` (lokal) atau `https://api.toko-anda.com` (produksi) → **Token** jika ada.

### 9.2 Alur sync (`apps/kasir/src/lib/sync.ts`)

1. `persistNow()` — pastikan SQLite ter-flush
2. `GET /health` — kalau gagal, berhenti (pending tetap dihitung)
3. `POST /v1/sync/push` — kirim isi `outbox`
4. Hapus item yang `accepted`
5. `GET /v1/sync/pull?since=<cursor>` — terapkan produk/user baru ke SQLite
6. Simpan cursor baru

Jalankan: saat boot, setiap N detik, dan tombol **Sync**.

### 9.3 Uji offline

1. Matikan API (`Ctrl+C` di terminal API)
2. Jual 2 transaksi di kasir
3. Lihat antrian **Sync N** (N ≥ 2)
4. Hidupkan API
5. Tekan Sync — N jadi 0
6. Cek di PostgreSQL:

```bash
docker exec -it sklamini-pg psql -U sklamini -d sklamini -c "SELECT local_no, total, status FROM sales;"
```

---

## Fase 10 — Uji end-to-end (sebelum VPS)

Jalankan kasir + API bersamaan:

```bash
# terminal 1
docker compose up -d
npm run dev:api

# terminal 2
npm run dev
```

### Checklist toko

- [ ] Login owner & kasir, PIN salah ditolak
- [ ] Tambah produk, scan di kasir, qty +1 jika scan ulang
- [ ] Bayar tunai, kembalian benar, stok berkurang
- [ ] Bayar QRIS, tidak ada kembalian
- [ ] Campur tunai + transfer jumlahnya = total
- [ ] Tahan F11, buka draft, lanjut bayar
- [ ] Void dengan PIN owner, stok kembali
- [ ] Restock, stok bertambah
- [ ] Opname selisih −2, stok sistem ikut −2
- [ ] Retur 1 item, stok +1
- [ ] Pengeluaran listrik masuk laporan
- [ ] Tutup shift: tunai sistem vs hitungan fisik
- [ ] Absen masuk/pulang
- [ ] Laporan laba = penjualan − HPP − beban (bukan pembelian stok)
- [ ] Backup DB, restore di browser lain/profil baru
- [ ] Jualan offline lalu sync, tidak dobel
- [ ] Printer: struk terbaca, potong kertas benar

Baru setelah checklist ini hijau, naik ke server.

---

## Fase 11 — Deploy API ke VPS

Contoh: Ubuntu 24.04, 1 vCPU, 1–2 GB RAM, Docker, Nginx, HTTPS.

### 11.1 Di laptop: siapkan kode di Git

```bash
git add .
git status
git commit -m "Siap deploy API kasir"
# git remote add origin <url>
# git push -u origin main
```

(Hanya commit jika Anda memang minta; jangan commit `.env`.)

### 11.2 Di VPS (SSH)

```bash
ssh root@IP_VPS
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git
systemctl enable --now docker
```

Clone repo:

```bash
git clone <URL_REPO> /opt/sklamini
cd /opt/sklamini
```

PostgreSQL di VPS (bisa pakai `docker compose` yang sama, **ganti password**):

```bash
nano docker-compose.yml    # POSTGRES_PASSWORD yang kuat
docker compose up -d
```

`.env` produksi:

```
DATABASE_URL=postgres://sklamini:PASSWORD_KUAT@127.0.0.1:5432/sklamini
JWT_SECRET=string-acak-panjang
PORT=8787
API_TOKEN=token-panjang-acak
CORS_ORIGIN=https://kasir.tidak-dipakai,http://tauri.localhost
```

Generate token:

```bash
openssl rand -hex 32
```

Pasang Node 20+ di VPS, atau jalankan API dengan systemd:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
cd /opt/sklamini
npm install
npm run db:push -w @sklamini/api
npm run db:seed -w @sklamini/api    # sekali saja; ganti PIN setelahnya
```

### 11.3 Systemd

`/etc/systemd/system/sklamini-api.service`:

```ini
[Unit]
Description=TOKO SKLAMINI API
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/opt/sklamini
EnvironmentFile=/opt/sklamini/.env
ExecStart=/usr/bin/npm run start -w @sklamini/api
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now sklamini-api
systemctl status sklamini-api
curl http://127.0.0.1:8787/health
```

### 11.4 Nginx + HTTPS

Arahkan DNS `api.toko-anda.com` ke IP VPS.

`/etc/nginx/sites-available/sklamini-api`:

```nginx
server {
    listen 80;
    server_name api.toko-anda.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 8m;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/sklamini-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.toko-anda.com
```

Uji dari laptop toko:

```bash
curl https://api.toko-anda.com/health
```

Firewall:

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

**Jangan** buka port 5432 ke internet.

### 11.5 Hubungkan kasir produksi

Di PC kasir: Pengaturan → URL API `https://api.toko-anda.com` → tempel `API_TOKEN` → Sync.

---

## Fase 12 — Build installer Windows & rilis

Harus di **mesin Windows** dengan Rust + C++ Build Tools.

```powershell
cd "TOKO SKLAMINI"
npm install
npm run tauri:dev
```

Kalau jendela aplikasi terbuka dan kasir jalan, build rilis:

```powershell
npm run tauri -w @sklamini/kasir -- build
```

Hasil biasanya:

```
apps/kasir/src-tauri/target/release/bundle/nsis/TOKO SKLAMINI_0.1.0_x64-setup.exe
apps/kasir/src-tauri/target/release/bundle/msi/TOKO SKLAMINI_0.1.0_x64_en-US.msi
```

### 12.1 Sebelum dibagikan ke toko

1. Naikkan `version` di `apps/kasir/src-tauri/tauri.conf.json` dan `package.json` (semver: `0.1.0` → `1.0.0` untuk rilis pertama).
2. Ganti PIN seed / nonaktifkan user dummy.
3. Isi nama toko, alamat, footer struk.
4. Set URL API + token produksi.
5. Import produk nyata (Excel atau input).
6. Opname stok awal (semua qty fisik = stok sistem).
7. Backup DB kosong-berisi-produk, simpan di USB.

### 12.2 Instal di PC kasir

1. Pasang `.exe` NSIS (per komputer).
2. Hubungkan scanner USB, printer 58mm, laci.
3. Uji 1 penjualan tunai + cetak + sync.
4. Uji cabut internet, jual 1x, colok lagi, sync.

### 12.3 Operasional harian

| Kapan | Apa |
|-------|-----|
| Buka toko | Buka shift, cek Sync 0, cek kertas printer |
| Selama jualan | Kalau Sync N naik terus, cek internet/API |
| Tutup toko | Tutup shift, cocokkan tunai, backup DB (Pengaturan) |
| Mingguan | Bandingkan laporan lokal vs server |
| Update aplikasi | Installer baru, **backup dulu**, baru pasang |

### 12.4 Update API di VPS

```bash
ssh root@IP_VPS
cd /opt/sklamini
git pull
npm install
npm run db:push -w @sklamini/api    # hanya jika skema berubah
systemctl restart sklamini-api
curl -s https://api.toko-anda.com/health
```

Migrasi skema harus **additive** (tambah kolom/tabel), jangan hapus kolom yang masih dipakai kasir lama.

---

## Perintah harian (lembar contekan)

```bash
# --- pengembangan di laptop ---
cd "TOKO SKLAMINI"
npm install
docker compose up -d
npm run db:push -w @sklamini/api
npm run db:seed -w @sklamini/api          # sekali
npm run dev:api                           # terminal 1
npm run dev                               # terminal 2 → http://localhost:1420
npm run tauri:dev                         # jendela desktop (butuh Rust)

# --- cek ---
curl http://127.0.0.1:8787/health
docker compose logs -f postgres
docker exec -it sklamini-pg psql -U sklamini -d sklamini

# --- build Windows (di PC Windows) ---
npm run tauri -w @sklamini/kasir -- build

# --- VPS ---
systemctl status sklamini-api
systemctl restart sklamini-api
journalctl -u sklamini-api -f
```

PIN uji (ganti sebelum produksi): owner `123456`, kasir `111111`.

---

## Urutan file yang biasanya dibuat (kalau dari 0)

1. `packages/shared/src/types.ts`
2. `packages/shared/src/ids.ts` + `reports.ts` + `index.ts`
3. `apps/kasir/src/lib/schema.ts` + `db.ts`
4. `apps/kasir/src/lib/seed.ts` + `repo.ts`
5. `apps/kasir/src/pages/LoginPage.tsx`
6. `apps/kasir/src/pages/ProdukPage.tsx`
7. `apps/kasir/src/pages/KasirPage.tsx`
8. `apps/kasir/src/lib/print.ts` + `pdf.ts`
9. `RiwayatPage` → `ReturPage` → `RestockPage` → `OpnamePage`
10. `PengeluaranPage` → `KasPage` → `AbsenPage` → `LaporanPage` → `PengaturanPage`
11. `apps/kasir/src/lib/sync.ts`
12. `apps/api/src/db/schema.ts` + `push.ts` + `seed.ts` + `index.ts`
13. `docker-compose.yml`, `.env`, systemd, Nginx
14. `tauri.conf.json` bundle NSIS/MSI

Jangan mulai dari laporan atau dari deploy. Mulai dari **tipe → DB lokal → login → produk → bayar**.

---

## Masalah yang sering muncul

| Gejala | Cek |
|--------|-----|
| `npm run dev` gagal | `npm install` di root, Node ≥ 20 |
| API `connection refused` | `docker compose up -d`, `DATABASE_URL`, `npm run dev:api` |
| Sync N tidak turun | URL API, token, CORS, `journalctl -u sklamini-api` |
| Stok tidak cocok | Ada penjualan tanpa `stock_events`? Hitung ulang `SUM(qty)` |
| Penjualan dobel di server | Push tanpa `onConflictDoNothing`, atau ID tidak UUID stabil |
| Printer diam | Driver, Bluetooth pairing, penjualan tetap harus tersimpan |
| Build Tauri gagal di Mac untuk Windows | Build `.exe` di mesin Windows |
| Kasir kosong setelah update | Restore backup; cek IndexedDB / path file Tauri |

---

## Definisi “rilis 1.0” untuk toko ini

Aplikasi boleh dianggap rilis kalau:

1. Satu hari penuh toko memakai kasir tanpa Excel/buku cadangan (kecuali darurat).
2. Semua transaksi hari itu sampai ke PostgreSQL (`Sync 0`).
3. Tutup shift tunai cocok ± selisih yang disepakati.
4. Ada file installer bervesi + backup DB di USB/cloud.
5. PIN dummy sudah diganti, `API_TOKEN` aktif, HTTPS hidup.

Sampai lima poin itu belum terpenuhi, itu masih **uji coba**, bukan rilis.
