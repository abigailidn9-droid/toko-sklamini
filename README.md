# TOKO SKLAMINI — Kasir

Aplikasi kasir Windows (online + offline) untuk satu toko. Data penjualan ditulis ke **SQLite lokal** dulu, lalu mengantri sync ke API di VPS.

## Jalankan kasir (Mac / Windows)

```bash
cd "TOKO SKLAMINI"
npm install
npm run dev
```

Buka http://localhost:1420

**PIN awal**

| Peran | PIN |
| --- | --- |
| Owner (Budi) | `123456` |
| Kasir (Siti) | `111111` |

PIN absen karyawan: Siti `111111` · Andi `222222` · Budi `123456`

Data tersimpan di IndexedDB browser. Backup: menu **Pengaturan → Backup database lokal**.

## Fitur

- Kasir: scan barcode (tanpa Enter), keranjang, Bayar F12, Tahan F11
- Setelah Simpan: cetak struk 58mm, nota A4, keduanya, atau selesai
- Draft, riwayat, void (PIN owner), restock, absen, laporan, produk (owner)
- Offline: tetap jualan; antrian **Sync N** terkirim saat API hidup

## API (opsional, untuk sync)

Butuh PostgreSQL. Contoh Docker:

```bash
docker compose up -d
cd apps/api
# dari root:
cp .env.example .env
npm run db:push -w @sklamini/api
npm run db:seed -w @sklamini/api
npm run dev:api
```

Isi **URL API** di Pengaturan kasir: `http://127.0.0.1:8787`

## File `.exe` Windows (Tauri)

1. Pasang [Rust](https://rustup.rs) di PC Windows (WebView2 sudah ada di Windows 10/11).
2. `npm install`
3. `npm run tauri:dev` untuk uji, atau `npm run tauri -w @sklamini/kasir -- build` untuk installer.

Di Mac, `npm run dev` cukup untuk uji UI dan database. Build installer Windows harus di Windows.

## Folder

- `apps/kasir` — UI React + SQLite (sql.js) + pembungkus Tauri
- `apps/api` — Hono + PostgreSQL
- `packages/shared` — tipe, format rupiah, rumus laba rugi / arus kas
