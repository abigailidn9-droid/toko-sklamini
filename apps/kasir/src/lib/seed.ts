import {
  DEFAULT_SETTINGS,
  SAMPLE_PRODUCTS,
  hashPin,
  type StoreSettings,
} from "@sklamini/shared";
import { all, one, run } from "./db.ts";
import { CLOUD_API_TOKEN, CLOUD_API_URL } from "./cloud.ts";
import { defaultMenus } from "../types.ts";
import { deactivateProduct, ensureSyncMeta } from "./repo.ts";

export const SEED_MEMBERS = [
  { id: "mem-dummy-01", name: "Andi Pratama", phone: "081234500001" },
  { id: "mem-dummy-02", name: "Bima Nugroho", phone: "081234500002" },
  { id: "mem-dummy-03", name: "Citra Lestari", phone: "081234500003" },
  { id: "mem-dummy-04", name: "Dedi Saputra", phone: "081234500004" },
  { id: "mem-dummy-05", name: "Eka Wulandari", phone: "081234500005" },
  { id: "mem-dummy-06", name: "Fajar Hidayat", phone: "081234500006" },
  { id: "mem-dummy-07", name: "Gita Maharani", phone: "081234500007" },
  { id: "mem-dummy-08", name: "Hendra Wijaya", phone: "081234500008" },
  { id: "mem-dummy-09", name: "Intan Permata", phone: "081234500009" },
  { id: "mem-dummy-10", name: "Joko Santoso", phone: "081234500010" },
  { id: "mem-dummy-11", name: "Kirana Putri", phone: "081234500011" },
  { id: "mem-dummy-12", name: "Lutfi Ramadhan", phone: "081234500012" },
  { id: "mem-dummy-13", name: "Maya Sari", phone: "081234500013" },
  { id: "mem-dummy-14", name: "Nanda Prasetyo", phone: "081234500014" },
  { id: "mem-dummy-15", name: "Oki Firmansyah", phone: "081234500015" },
  { id: "mem-dummy-16", name: "Putri Azzahra", phone: "081234500016" },
  { id: "mem-dummy-17", name: "Rizky Maulana", phone: "081234500017" },
  { id: "mem-dummy-18", name: "Salsa Amelia", phone: "081234500018" },
  { id: "mem-dummy-19", name: "Taufik Rahman", phone: "081234500019" },
  { id: "mem-dummy-20", name: "Vina Oktaviani", phone: "081234500020" },
] as const;

function insertSeedMembers(now: string) {
  for (const m of SEED_MEMBERS) {
    const exists = one<{ id: string }>(
      `SELECT id FROM customers WHERE id = ? OR phone = ?`,
      [m.id, m.phone],
    );
    if (exists) continue;
    run(
      `INSERT INTO customers (id, name, phone, note, active, updated_at) VALUES (?, ?, ?, 'sample', 1, ?)`,
      [m.id, m.name, m.phone, now],
    );
  }
}

/** Isi 20 member sample jika belum ada. Tidak menambah biaya kas. */
export function ensureDummyMembers(): void {
  insertSeedMembers(new Date().toISOString());
}

/** Hapus sisa katalog dummy dari kasir. Nota lama tetap ada. */
export function removeSampleProducts(): void {
  const ids = new Set<string>();
  for (const p of SAMPLE_PRODUCTS) {
    for (const row of all<{ id: string }>(
      `SELECT id FROM products WHERE active = 1 AND name = ? AND (barcode = ? OR barcode LIKE ?)`,
      [p.name, p.barcode, `${p.barcode}~%`],
    )) {
      ids.add(row.id);
    }
  }
  for (const row of all<{ id: string }>(
    `SELECT id FROM products WHERE active = 1 AND name = ?`,
    ["Beras Ramos 5kg"],
  )) {
    ids.add(row.id);
  }
  for (const id of ids) deactivateProduct(id);
}

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

  if (!one<{ id: string }>("SELECT id FROM customers LIMIT 1")) insertSeedMembers(now);

  const settings: StoreSettings = {
    ...DEFAULT_SETTINGS,
    apiUrl: CLOUD_API_URL,
    apiToken: CLOUD_API_TOKEN,
  };
  run(`INSERT INTO settings (key, value) VALUES ('store', ?)`, [
    JSON.stringify(settings),
  ]);
  ensureSyncMeta();
}
