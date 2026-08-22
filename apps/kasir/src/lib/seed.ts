import {
  DEFAULT_SETTINGS,
  hashPin,
  type StoreSettings,
} from "@sklamini/shared";
import { all, one, run } from "./db.ts";
import { defaultMenus } from "../types.ts";

export const SEED_PRODUCTS = [
  { barcode: "899999900001", name: "Beras Ramos 5kg", unit: "sak", category: "Sembako", buy: 68000, sell: 75000, stock: 18 },
  { barcode: "8998866200112", name: "Minyak Kita 2L", unit: "btl", category: "Sembako", buy: 28000, sell: 32500, stock: 22 },
  { barcode: "899999900088", name: "Gula Pasir 1kg", unit: "kg", category: "Sembako", buy: 14000, sell: 16500, stock: 35 },
  { barcode: "899999900102", name: "Tepung Segitiga 1kg", unit: "kg", category: "Sembako", buy: 11000, sell: 13500, stock: 20 },
  { barcode: "899999900115", name: "Garam Kapal 500g", unit: "pcs", category: "Sembako", buy: 2500, sell: 4000, stock: 40 },
  { barcode: "8998866100470", name: "Aqua 600ml", unit: "btl", category: "Minuman", buy: 2500, sell: 4000, stock: 120 },
  { barcode: "8991008123456", name: "Teh Botol Sosro", unit: "btl", category: "Minuman", buy: 3500, sell: 5000, stock: 40 },
  { barcode: "899999902001", name: "Coca-Cola 390ml", unit: "btl", category: "Minuman", buy: 4500, sell: 6500, stock: 36 },
  { barcode: "899999902014", name: "Kopi Kapal Api", unit: "pcs", category: "Minuman", buy: 1500, sell: 2000, stock: 80 },
  { barcode: "8991002101234", name: "Indomie Goreng", unit: "pcs", category: "Makanan", buy: 2800, sell: 3500, stock: 48 },
  { barcode: "899999903001", name: "Chitato Sapi Panggang", unit: "pcs", category: "Makanan", buy: 8500, sell: 11000, stock: 24 },
  { barcode: "899999903018", name: "Roti Tawar Sari Roti", unit: "pcs", category: "Makanan", buy: 12000, sell: 15000, stock: 12 },
  { barcode: "899999903025", name: "Telur ayam 1kg", unit: "kg", category: "Makanan", buy: 26000, sell: 30000, stock: 15 },
  { barcode: "899999904001", name: "Rinso 800g", unit: "pcs", category: "Rumah tangga", buy: 18000, sell: 22000, stock: 16 },
  { barcode: "899999904018", name: "Lifebuoy 85g", unit: "pcs", category: "Rumah tangga", buy: 3500, sell: 5000, stock: 30 },
  { barcode: "899999904025", name: "Pepsodent 75g", unit: "pcs", category: "Rumah tangga", buy: 7000, sell: 9500, stock: 22 },
];

export async function seedIfEmpty(): Promise<void> {
  const count = one<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  if (count && count.n > 0) return;

  const now = new Date().toISOString();
  run(
    `INSERT INTO users (id, name, role, pin_hash, pin, menus, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    ["user-owner", "Budi", "owner", await hashPin("123456"), "", JSON.stringify(defaultMenus("owner")), now],
  );
  run(
    `INSERT INTO users (id, name, role, pin_hash, pin, menus, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    ["user-kasir", "Siti", "kasir", await hashPin("111111"), "", JSON.stringify(defaultMenus("kasir")), now],
  );
  run(
    `INSERT INTO employees (id, name, job_role, pin_hash, active, updated_at) VALUES (?, ?, ?, ?, 1, ?)`,
    ["emp-siti", "Siti", "Kasir", await hashPin("111111"), now],
  );
  run(
    `INSERT INTO employees (id, name, job_role, pin_hash, active, updated_at) VALUES (?, ?, ?, ?, 1, ?)`,
    ["emp-andi", "Andi", "Gudang", await hashPin("222222"), now],
  );
  run(
    `INSERT INTO employees (id, name, job_role, pin_hash, active, updated_at) VALUES (?, ?, ?, ?, 1, ?)`,
    ["emp-budi", "Budi", "Owner", await hashPin("123456"), now],
  );

  for (const p of SEED_PRODUCTS) {
    const id = `prd-${p.barcode}`;
    run(
      `INSERT INTO products (id, barcode, name, unit, category, buy_price, sell_price, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, p.barcode, p.name, p.unit, p.category, p.buy, p.sell, now],
    );
    run(
      `INSERT INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
       VALUES (?, ?, 'adjust', ?, 'seed', 'local', ?)`,
      [`seed-stok-${p.barcode}`, id, p.stock, now],
    );
  }

  const settings: StoreSettings = {
    ...DEFAULT_SETTINGS,
    apiUrl: import.meta.env.VITE_API_URL || DEFAULT_SETTINGS.apiUrl,
  };
  run(`INSERT INTO settings (key, value) VALUES ('store', ?)`, [
    JSON.stringify(settings),
  ]);
  run(`INSERT INTO sync_meta (key, value) VALUES ('device_id', ?)`, [
    crypto.randomUUID(),
  ]);
  run(`INSERT INTO sync_meta (key, value) VALUES ('cursor', ?)`, [
    "1970-01-01T00:00:00.000Z",
  ]);

  void all;
}
