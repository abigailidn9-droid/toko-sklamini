import {
  arusKas,
  DEFAULT_SETTINGS,
  EXPENSE_CATEGORIES,
  EXPENSE_LABEL,
  PAY_METHODS,
  PAY_METHOD_LABEL,
  hashPin,
  labaRugi,
  lineRefund,
  localDayFromIso,
  localNo,
  newId,
  roundQty,
  todayIso,
  inIsoRange,
  type CartLine,
  type CartSnapshot,
  type Customer,
  type CustomerPayment,
  type Draft,
  type Employee,
  type Expense,
  type ExpenseCategory,
  type PayMethod,
  type Product,
  type Sale,
  type SaleItem,
  type SalePayment,
  type SaleReturn,
  type SaleReturnItem,
  type StockIn,
  type StoreSettings,
  type UserRole,
  type CashShift,
  type Opname,
  type OpnameItem,
} from "@sklamini/shared";
import { all, one, run, tx } from "./db.ts";
import { defaultMenus, parseMenus, type Page } from "../types.ts";

export type Session = {
  id: string;
  name: string;
  role: UserRole;
  menus: string[];
};

export type AttendanceRow = {
  id: string;
  name: string;
  jobRole: string;
  inTime: string | null;
  outTime: string | null;
};

type ProductRow = {
  id: string;
  barcode: string;
  name: string;
  unit: string;
  category: string;
  buy_price: number;
  sell_price: number;
  active: number;
  updated_at: string;
  stock: number;
};

function mapProduct(r: ProductRow): Product {
  return {
    id: r.id,
    barcode: r.barcode,
    name: r.name,
    unit: r.unit,
    category: r.category,
    buyPrice: r.buy_price,
    sellPrice: r.sell_price,
    active: r.active === 1,
    updatedAt: r.updated_at,
    stock: r.stock,
  };
}

export function deviceId(): string {
  return (
    one<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'device_id'")
      ?.value ?? "local"
  );
}

function enqueue(entity: string, payload: unknown): void {
  run(
    `INSERT INTO sync_outbox (id, entity, payload, created_at, attempts) VALUES (?, ?, ?, ?, 0)`,
    [newId(), entity, JSON.stringify(payload), new Date().toISOString()],
  );
}

export function pendingCount(): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM sync_outbox")?.n ?? 0;
}

export async function loginByPin(pin: string): Promise<Session | null> {
  const hash = await hashPin(pin);
  const row = one<{ id: string; name: string; role: UserRole; menus: string }>(
    `SELECT id, name, role, menus FROM users WHERE pin_hash = ? AND active = 1`,
    [hash],
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    menus: parseMenus(row.menus, row.role),
  };
}

export type AppUser = {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  menus: Page[];
  active: boolean;
};

export function listUsers(): AppUser[] {
  const rows = all<{ id: string; name: string; role: UserRole; pin: string; menus: string; active: number }>(
    `SELECT id, name, role, pin, menus, active FROM users ORDER BY name`,
  );
  for (const row of rows) {
    if (!row.menus) {
      const menus = defaultMenus(row.role);
      run(`UPDATE users SET menus = ? WHERE id = ?`, [JSON.stringify(menus), row.id]);
      row.menus = JSON.stringify(menus);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    pin: "",
    menus: parseMenus(r.menus, r.role),
    active: Boolean(r.active),
  }));
}

function usersWithPengaturan(exceptId?: string) {
  return listUsers().filter((u) => u.active && u.menus.includes("pengaturan") && u.id !== exceptId);
}

export async function upsertUser(input: {
  id?: string;
  name: string;
  role: UserRole;
  pin?: string;
  menus: Page[];
  active: boolean;
}): Promise<{ ok: true; user: AppUser } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama wajib diisi" };
  const menus = [...new Set(input.menus)];
  if (!menus.length) return { ok: false, error: "Pilih minimal satu menu" };

  const id = input.id ?? newId();
  const existing = input.id
    ? one<{ id: string; pin_hash: string; pin: string }>(`SELECT id, pin_hash, pin FROM users WHERE id = ?`, [id])
    : null;
  if (input.id && !existing) return { ok: false, error: "User tidak ditemukan" };

  if (!input.active || !menus.includes("pengaturan")) {
    if (usersWithPengaturan(id).length === 0) {
      return { ok: false, error: "Minimal satu user aktif harus bisa membuka Pengaturan" };
    }
  }

  let pinHash = existing?.pin_hash;
  const pin = "";
  if (input.pin) {
    if (!/^\d{6}$/.test(input.pin)) return { ok: false, error: "PIN harus 6 digit angka" };
    pinHash = await hashPin(input.pin);
    const clash = one<{ id: string }>(
      `SELECT id FROM users WHERE pin_hash = ? AND id != ?`,
      [pinHash, id],
    );
    if (clash) return { ok: false, error: "PIN sudah dipakai user lain" };
  }
  if (!pinHash) return { ok: false, error: "PIN wajib diisi untuk user baru" };

  const now = new Date().toISOString();
  const payload = {
    id,
    name,
    role: input.role,
    menus,
    active: input.active,
    updatedAt: now,
  };
  if (existing) {
    run(
      `UPDATE users SET name = ?, role = ?, pin_hash = ?, pin = ?, menus = ?, active = ?, updated_at = ? WHERE id = ?`,
      [name, input.role, pinHash, pin, JSON.stringify(menus), input.active ? 1 : 0, now, id],
    );
  } else {
    run(
      `INSERT INTO users (id, name, role, pin_hash, pin, menus, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, input.role, pinHash, pin, JSON.stringify(menus), input.active ? 1 : 0, now],
    );
  }
  enqueue("user", payload);
  return {
    ok: true,
    user: { id, name, role: input.role, pin, menus, active: input.active },
  };
}

export async function backfillUserPins(): Promise<void> {
  const rows = all<{ id: string; pin_hash: string; pin: string }>(
    `SELECT id, pin_hash, pin FROM users WHERE pin IS NULL OR pin = ''`,
  );
  if (!rows.length) return;
  const known = ["123456", "111111", "222222"];
  const hashes = await Promise.all(known.map(async (p) => ({ p, h: await hashPin(p) })));
  for (const row of rows) {
    const hit = hashes.find((x) => x.h === row.pin_hash);
    if (hit) run(`UPDATE users SET pin = ? WHERE id = ?`, [hit.p, row.id]);
  }
}

export async function ownerPinOk(pin: string): Promise<boolean> {
  const hash = await hashPin(pin);
  const row = one(
    `SELECT id FROM users WHERE role = 'owner' AND pin_hash = ? AND active = 1`,
    [hash],
  );
  return Boolean(row);
}

export function listProducts(includeInactive = false): Product[] {
  const sql = includeInactive
    ? `SELECT p.*, COALESCE((SELECT SUM(e.qty) FROM stock_events e WHERE e.product_id = p.id), 0) AS stock
       FROM products p ORDER BY p.category, p.name`
    : `SELECT p.*, COALESCE((SELECT SUM(e.qty) FROM stock_events e WHERE e.product_id = p.id), 0) AS stock
       FROM products p WHERE p.active = 1 ORDER BY p.category, p.name`;
  return all<ProductRow>(sql).map(mapProduct);
}

export function findProductByBarcode(barcode: string): Product | null {
  const row = one<ProductRow>(
    `SELECT p.*, COALESCE((SELECT SUM(e.qty) FROM stock_events e WHERE e.product_id = p.id), 0) AS stock
     FROM products p WHERE p.barcode = ? AND p.active = 1`,
    [barcode],
  );
  return row ? mapProduct(row) : null;
}

export function getProduct(id: string): Product | null {
  const row = one<ProductRow>(
    `SELECT p.*, COALESCE((SELECT SUM(e.qty) FROM stock_events e WHERE e.product_id = p.id), 0) AS stock
     FROM products p WHERE p.id = ?`,
    [id],
  );
  return row ? mapProduct(row) : null;
}

export function upsertProduct(input: {
  id?: string;
  barcode: string;
  name: string;
  unit: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  active?: boolean;
}): { ok: true; id: string } | { ok: false; error: string } {
  const barcode = input.barcode.trim();
  const name = input.name.trim();
  if (!barcode || !name) return { ok: false, error: "Barcode dan nama wajib diisi" };
  const now = new Date().toISOString();
  const byBarcode = one<{ id: string }>(`SELECT id FROM products WHERE barcode = ?`, [barcode]);

  if (input.id) {
    const existing = one<{ id: string }>(`SELECT id FROM products WHERE id = ?`, [input.id]);
    if (!existing) return { ok: false, error: "Produk tidak ditemukan" };
    if (byBarcode && byBarcode.id !== input.id) {
      return { ok: false, error: "Barcode sudah dipakai produk lain" };
    }
    run(
      `UPDATE products SET barcode=?, name=?, unit=?, category=?, buy_price=?, sell_price=?, active=?, updated_at=? WHERE id=?`,
      [
        barcode,
        name,
        input.unit,
        input.category,
        input.buyPrice,
        input.sellPrice,
        input.active === false ? 0 : 1,
        now,
        input.id,
      ],
    );
    enqueue("product", {
      id: input.id,
      barcode,
      name,
      unit: input.unit,
      category: input.category,
      buyPrice: input.buyPrice,
      sellPrice: input.sellPrice,
      active: input.active !== false,
      updatedAt: now,
    });
    return { ok: true, id: input.id };
  }

  const id = byBarcode?.id ?? newId();
  if (byBarcode) {
    run(
      `UPDATE products SET name=?, unit=?, category=?, buy_price=?, sell_price=?, active=?, updated_at=? WHERE id=?`,
      [
        name,
        input.unit,
        input.category,
        input.buyPrice,
        input.sellPrice,
        input.active === false ? 0 : 1,
        now,
        id,
      ],
    );
  } else {
    run(
      `INSERT INTO products (id, barcode, name, unit, category, buy_price, sell_price, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, barcode, name, input.unit, input.category, input.buyPrice, input.sellPrice, now],
    );
  }
  enqueue("product", {
    id,
    barcode,
    name,
    unit: input.unit,
    category: input.category,
    buyPrice: input.buyPrice,
    sellPrice: input.sellPrice,
    active: input.active !== false,
    updatedAt: now,
  });
  return { ok: true, id };
}

export function nextLocalNo(prefix: string, table: "sales" | "stock_ins" | "returns" | "opnames"): string {
  const today = todayIso();
  const n = all<{ created_at: string }>(`SELECT created_at FROM ${table}`).filter(
    (r) => localDayFromIso(r.created_at) === today,
  ).length;
  return localNo(prefix, n + 1);
}

export function checkout(input: {
  lines: CartLine[];
  method: PayMethod;
  paid: number;
  cashier: Session;
  discount?: number;
  deliveryCost?: number;
  ppn?: number;
  ppnRate?: number;
  note?: string;
  customerId?: string | null;
  payments?: { method: PayMethod; amount: number }[];
}): Sale {
  if (!currentOpenShift()) {
    throw new Error("Buka kasir dulu. Isi kas awal di menu Settlement.");
  }
  if (input.lines.length === 0) throw new Error("Keranjang kosong");
  for (const line of input.lines) {
    const qty = roundQty(line.qty);
    if (qty <= 0) throw new Error(`Jumlah ${line.name} tidak valid`);
    const product = getProduct(line.productId);
    if (!product || !product.active) {
      throw new Error(`${line.name} tidak tersedia`);
    }
    if (product.stock + 1e-9 < qty) {
      throw new Error(`Stok ${line.name} tidak cukup (sisa ${product.stock})`);
    }
  }
  const subtotal = input.lines.reduce((n, l) => n + l.sellPrice * roundQty(l.qty), 0);
  const discount = Math.min(Math.max(0, Math.round(input.discount ?? 0)), subtotal);
  const deliveryCost = Math.max(0, Math.round(input.deliveryCost ?? 0));
  const ppn = Math.max(0, Math.round(input.ppn ?? 0));
  const ppnRate = Math.max(0, Number(input.ppnRate) || 0);
  const note = (input.note ?? "").trim();
  const total = Math.max(0, subtotal - discount + ppn + deliveryCost);
  const paymentsIn = (input.payments ?? [])
    .map((p) => ({ method: p.method, amount: Math.max(0, Math.round(p.amount)) }))
    .filter((p) => p.amount > 0);
  const payList = paymentsIn.length ? paymentsIn : [{ method: input.method, amount: total }];
  const paySum = payList.reduce((n, p) => n + p.amount, 0);
  if (paySum !== total) throw new Error("Jumlah pembayaran harus sama dengan total");
  const hutangAmt = payList.filter((p) => p.method === "hutang").reduce((n, p) => n + p.amount, 0);
  const customerId = input.customerId?.trim() || null;
  if (hutangAmt > 0 && !customerId) throw new Error("Pilih pelanggan untuk hutang");
  if (customerId && !getCustomer(customerId)) throw new Error("Pelanggan tidak ditemukan");
  const tunaiNeed = payList.filter((p) => p.method === "tunai").reduce((n, p) => n + p.amount, 0);
  const paid = tunaiNeed > 0 ? input.paid : total;
  if (tunaiNeed > 0 && paid < tunaiNeed) throw new Error("Uang tunai kurang");
  const now = new Date().toISOString();
  const id = newId();
  const local = nextLocalNo("SKL", "sales");
  const changeAmount = Math.max(0, paid - tunaiNeed);
  const method = payList.slice().sort((a, b) => b.amount - a.amount)[0]?.method ?? input.method;
  const items: SaleItem[] = input.lines.map((l) => ({
    id: newId(),
    saleId: id,
    productId: l.productId,
    barcode: l.barcode,
    name: l.name,
    qty: roundQty(l.qty),
    sellPrice: l.sellPrice,
    costPrice: l.costPrice,
  }));
  const payments: SalePayment[] = payList.map((p) => ({
    id: newId(),
    saleId: id,
    method: p.method,
    amount: p.amount,
  }));
  const events = items.map((it) => ({
    id: newId(),
    productId: it.productId,
    type: "sale" as const,
    qty: -it.qty,
    refId: id,
    deviceId: deviceId(),
    createdAt: now,
  }));
  const customerName = customerId ? (getCustomer(customerId)?.name ?? "") : "";

  tx(() => {
    run(
      `INSERT INTO sales (id, local_no, cashier_id, cashier_name, customer_id, method, subtotal, discount, delivery_cost, ppn, ppn_rate, note, total, paid, change_amount, status, created_at, voided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'selesai', ?, NULL)`,
      [
        id,
        local,
        input.cashier.id,
        input.cashier.name,
        customerId,
        method,
        subtotal,
        discount,
        deliveryCost,
        ppn,
        ppnRate,
        note,
        total,
        paid,
        changeAmount,
        now,
      ],
    );
    for (const it of items) {
      run(
        `INSERT INTO sale_items (id, sale_id, product_id, barcode, name, qty, sell_price, cost_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [it.id, it.saleId, it.productId, it.barcode, it.name, it.qty, it.sellPrice, it.costPrice],
      );
    }
    for (const p of payments) {
      run(`INSERT INTO sale_payments (id, sale_id, method, amount) VALUES (?, ?, ?, ?)`, [
        p.id,
        p.saleId,
        p.method,
        p.amount,
      ]);
    }
    for (const ev of events) {
      run(
        `INSERT INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ev.id, ev.productId, ev.type, ev.qty, ev.refId, ev.deviceId, ev.createdAt],
      );
    }
    enqueue("sale", {
      sale: {
        id,
        localNo: local,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        customerId,
        method,
        subtotal,
        discount,
        deliveryCost,
        ppn,
        ppnRate,
        note,
        total,
        paid,
        changeAmount,
        status: "selesai",
        createdAt: now,
        voidedAt: null,
      },
      items,
      payments,
      events,
    });
  });

  return {
    id,
    localNo: local,
    cashierId: input.cashier.id,
    cashierName: input.cashier.name,
    customerId,
    customerName,
    method,
    subtotal,
    discount,
    deliveryCost,
    ppn,
    ppnRate,
    note,
    total,
    paid,
    changeAmount,
    status: "selesai",
    createdAt: now,
    voidedAt: null,
    items,
    payments,
  };
}

function saleItemsOf(saleId: string): SaleItem[] {
  return all<SaleItem>(
    `SELECT id, sale_id AS saleId, product_id AS productId, barcode, name, qty, sell_price AS sellPrice, cost_price AS costPrice
     FROM sale_items WHERE sale_id = ?`,
    [saleId],
  );
}

function paymentsOf(saleId: string): SalePayment[] {
  return all<SalePayment>(
    `SELECT id, sale_id AS saleId, method, amount FROM sale_payments WHERE sale_id = ?`,
    [saleId],
  );
}

type SaleRow = {
  id: string;
  local_no: string;
  cashier_id: string;
  cashier_name: string;
  customer_id?: string | null;
  method: PayMethod;
  subtotal: number;
  discount: number;
  delivery_cost?: number;
  ppn?: number;
  ppn_rate?: number;
  note?: string;
  total: number;
  paid: number;
  change_amount: number;
  status: "selesai" | "void";
  created_at: string;
  voided_at?: string | null;
};

function mapSale(r: SaleRow): Sale {
  const payments = paymentsOf(r.id);
  const customerId = r.customer_id ?? null;
  const customerName = customerId
    ? (one<{ name: string }>(`SELECT name FROM customers WHERE id = ?`, [customerId])?.name ?? "")
    : "";
  return {
    id: r.id,
    localNo: r.local_no,
    cashierId: r.cashier_id,
    cashierName: r.cashier_name,
    customerId,
    customerName,
    method: r.method,
    subtotal: r.subtotal,
    discount: r.discount ?? 0,
    deliveryCost: r.delivery_cost ?? 0,
    ppn: r.ppn ?? 0,
    ppnRate: r.ppn_rate ?? 0,
    note: r.note ?? "",
    total: r.total,
    paid: r.paid,
    changeAmount: r.change_amount,
    status: r.status,
    createdAt: r.created_at,
    voidedAt: r.voided_at ?? null,
    items: saleItemsOf(r.id),
    payments: payments.length
      ? payments
      : [{ id: "", saleId: r.id, method: r.method, amount: r.total }],
  };
}

export function listSales(date: string | "all"): Sale[] {
  const rows = all<SaleRow>(`SELECT * FROM sales ORDER BY created_at DESC`);
  const mapped = rows.map(mapSale);
  if (date === "all") return mapped;
  return mapped.filter((s) => localDayFromIso(s.createdAt) === date);
}

export function getSale(id: string): Sale | null {
  const r = one<SaleRow>(`SELECT * FROM sales WHERE id = ?`, [id]);
  return r ? mapSale(r) : null;
}

export function findSaleByLocalNo(no: string): Sale | null {
  const code = no.trim();
  if (!code) return null;
  const exact = one<{ id: string }>(`SELECT id FROM sales WHERE local_no = ?`, [code]);
  if (exact) return getSale(exact.id);
  if (code.length < 4) return null;
  const row = one<{ id: string }>(
    `SELECT id FROM sales WHERE local_no LIKE ? ORDER BY created_at DESC`,
    [`%${code}`],
  );
  return row ? getSale(row.id) : null;
}

export function latestCompletedSale(): Sale | null {
  const row = one<{ id: string }>(
    `SELECT id FROM sales WHERE status = 'selesai' ORDER BY created_at DESC LIMIT 1`,
  );
  return row ? getSale(row.id) : null;
}

export function voidSale(id: string): void {
  const sale = getSale(id);
  if (!sale || sale.status === "void") return;
  if (returnedQtyBySale(id).total > 0) {
    throw new Error("Nota ini sudah ada retur. Pakai menu Retur untuk barang tersisa.");
  }
  const now = new Date().toISOString();
  const events = sale.items.map((it) => ({
    id: newId(),
    productId: it.productId,
    type: "sale_void" as const,
    qty: it.qty,
    refId: id,
    deviceId: deviceId(),
    createdAt: now,
  }));
  tx(() => {
    run(`UPDATE sales SET status = 'void', voided_at = ? WHERE id = ?`, [now, id]);
    for (const ev of events) {
      run(
        `INSERT INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ev.id, ev.productId, ev.type, ev.qty, ev.refId, ev.deviceId, ev.createdAt],
      );
    }
    enqueue("sale_void", { id, voidedAt: now, events });
  });
}

function parseDraftPayload(json: string): CartSnapshot {
  const raw = JSON.parse(json) as unknown;
  if (Array.isArray(raw)) {
    return { items: raw as CartLine[], discount: 0, deliveryCost: 0, note: "" };
  }
  const obj = raw as Partial<CartSnapshot> & { items?: CartLine[] };
  return {
    items: Array.isArray(obj.items) ? obj.items : [],
    discount: Number(obj.discount) || 0,
    deliveryCost: Number(obj.deliveryCost) || 0,
    note: String(obj.note ?? ""),
  };
}

export function saveDraft(input: {
  cashier: Session;
} & CartSnapshot): void {
  const note = input.note.trim();
  run(
    `INSERT INTO drafts (id, cashier_id, cashier_name, note, items_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.cashier.id,
      input.cashier.name,
      note,
      JSON.stringify({
        items: input.items,
        discount: input.discount,
        deliveryCost: input.deliveryCost,
        note,
      }),
      new Date().toISOString(),
    ],
  );
}

export function listDrafts(): Draft[] {
  return all<{
    id: string;
    cashier_id: string;
    cashier_name: string;
    note: string;
    items_json: string;
    created_at: string;
  }>(`SELECT * FROM drafts ORDER BY created_at DESC`).map((r) => {
    const payload = parseDraftPayload(r.items_json);
    return {
      id: r.id,
      cashierId: r.cashier_id,
      cashierName: r.cashier_name,
      note: payload.note || r.note,
      discount: payload.discount,
      deliveryCost: payload.deliveryCost,
      items: payload.items,
      createdAt: r.created_at,
    };
  });
}

export function deleteDraft(id: string): void {
  run(`DELETE FROM drafts WHERE id = ?`, [id]);
}

function mapShift(r: {
  id: string;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  kas_awal: number;
  kas_hitung: number | null;
  kas_sistem: number | null;
  selisih: number | null;
  note: string;
  status: "open" | "closed";
}): CashShift {
  return {
    id: r.id,
    cashierId: r.cashier_id,
    cashierName: r.cashier_name,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    kasAwal: r.kas_awal,
    kasHitung: r.kas_hitung,
    kasSistem: r.kas_sistem,
    selisih: r.selisih,
    note: r.note ?? "",
    status: r.status,
  };
}

export function currentOpenShift(): CashShift | null {
  const r = one<{
    id: string;
    cashier_id: string;
    cashier_name: string;
    opened_at: string;
    closed_at: string | null;
    kas_awal: number;
    kas_hitung: number | null;
    kas_sistem: number | null;
    selisih: number | null;
    note: string;
    status: "open" | "closed";
  }>(`SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC`);
  return r ? mapShift(r) : null;
}

export function lastClosedShift(): CashShift | null {
  const r = one<{
    id: string;
    cashier_id: string;
    cashier_name: string;
    opened_at: string;
    closed_at: string | null;
    kas_awal: number;
    kas_hitung: number | null;
    kas_sistem: number | null;
    selisih: number | null;
    note: string;
    status: "open" | "closed";
  }>(`SELECT * FROM cash_shifts WHERE status = 'closed' ORDER BY closed_at DESC`);
  return r ? mapShift(r) : null;
}

export function listCashShifts(): CashShift[] {
  return all<{
    id: string;
    cashier_id: string;
    cashier_name: string;
    opened_at: string;
    closed_at: string | null;
    kas_awal: number;
    kas_hitung: number | null;
    kas_sistem: number | null;
    selisih: number | null;
    note: string;
    status: "open" | "closed";
  }>(`SELECT * FROM cash_shifts ORDER BY opened_at DESC`).map(mapShift);
}

export function expectedDrawer(fromIso: string, toIso?: string): number {
  const to = toIso ?? new Date().toISOString();
  const sales = listSales("all");
  const tunaiIn = sales
    .filter((s) => s.createdAt >= fromIso && s.createdAt <= to)
    .reduce((n, s) => n + s.payments.filter((p) => p.method === "tunai").reduce((m, p) => m + p.amount, 0), 0);
  const tunaiVoid = sales
    .filter((s) => s.status === "void" && (s.voidedAt ?? s.createdAt) >= fromIso && (s.voidedAt ?? s.createdAt) <= to)
    .reduce((n, s) => n + s.payments.filter((p) => p.method === "tunai").reduce((m, p) => m + p.amount, 0), 0);
  const tunaiRetur = listReturns()
    .filter((r) => r.createdAt >= fromIso && r.createdAt <= to && r.method === "tunai")
    .reduce((n, r) => n + r.total, 0);
  const keluar = listExpenses()
    .filter((e) => e.createdAt >= fromIso && e.createdAt <= to)
    .reduce((n, e) => n + e.amount, 0);
  const pelunasan = listCustomerPayments()
    .filter((p) => p.createdAt >= fromIso && p.createdAt <= to && p.method === "tunai")
    .reduce((n, p) => n + p.amount, 0);
  return tunaiIn - tunaiVoid - tunaiRetur - keluar + pelunasan;
}

export function shiftExpected(shift: CashShift): number {
  return shift.kasAwal + expectedDrawer(shift.openedAt, shift.closedAt ?? undefined);
}

export function openCashShift(input: { cashier: Session; kasAwal: number; note?: string }): CashShift {
  if (currentOpenShift()) throw new Error("Masih ada sesi kasir yang terbuka. Tutup dulu.");
  const kasAwal = Math.max(0, Math.round(input.kasAwal));
  const now = new Date().toISOString();
  const row: CashShift = {
    id: newId(),
    cashierId: input.cashier.id,
    cashierName: input.cashier.name,
    openedAt: now,
    closedAt: null,
    kasAwal,
    kasHitung: null,
    kasSistem: null,
    selisih: null,
    note: (input.note ?? "").trim(),
    status: "open",
  };
  run(
    `INSERT INTO cash_shifts (id, cashier_id, cashier_name, opened_at, closed_at, kas_awal, kas_hitung, kas_sistem, selisih, note, status)
     VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, ?, 'open')`,
    [row.id, row.cashierId, row.cashierName, row.openedAt, row.kasAwal, row.note],
  );
  enqueue("cash_shift", row);
  return row;
}

export function closeCashShift(input: { kasHitung: number; note?: string }): CashShift {
  const open = currentOpenShift();
  if (!open) throw new Error("Tidak ada sesi kasir yang terbuka");
  const kasHitung = Math.max(0, Math.round(input.kasHitung));
  const kasSistem = shiftExpected(open);
  const selisih = kasHitung - kasSistem;
  const now = new Date().toISOString();
  const note = (input.note ?? "").trim();
  run(
    `UPDATE cash_shifts SET closed_at = ?, kas_hitung = ?, kas_sistem = ?, selisih = ?, note = ?, status = 'closed' WHERE id = ?`,
    [now, kasHitung, kasSistem, selisih, note || open.note, open.id],
  );
  const closed: CashShift = {
    ...open,
    closedAt: now,
    kasHitung,
    kasSistem,
    selisih,
    note: note || open.note,
    status: "closed",
  };
  enqueue("cash_shift", closed);
  return closed;
}

export type ShiftProductLine = {
  productId: string;
  name: string;
  barcode: string;
  qty: number;
  total: number;
};

export type ShiftSettlement = {
  shift: CashShift;
  sales: Sale[];
  voids: Sale[];
  returns: SaleReturn[];
  expenses: Expense[];
  byMethod: { method: PayMethod; label: string; count: number; total: number }[];
  products: ShiftProductLine[];
  notaCount: number;
  itemQty: number;
  omzet: number;
  subtotal: number;
  discount: number;
  ppn: number;
  ongkir: number;
  voidTotal: number;
  returTotal: number;
  tunaiMasuk: number;
  returTunai: number;
  pengeluaran: number;
};

function inShift(iso: string, shift: CashShift) {
  const to = shift.closedAt ?? new Date().toISOString();
  return iso >= shift.openedAt && iso <= to;
}

export function shiftSettlement(shift: CashShift): ShiftSettlement {
  const allSales = listSales("all").filter((s) => inShift(s.createdAt, shift));
  const sales = allSales.filter((s) => s.status === "selesai");
  const voids = allSales.filter((s) => s.status === "void");
  const returns = listReturns().filter((r) => inShift(r.createdAt, shift));
  const expenses = listExpenses().filter((e) => inShift(e.createdAt, shift));
  const byMethod = PAY_METHODS.map((method) => ({
    method,
    label: PAY_METHOD_LABEL[method],
    count: sales.filter((s) => s.payments.some((p) => p.method === method && p.amount > 0)).length,
    total: sales.reduce(
      (n, s) => n + s.payments.filter((p) => p.method === method).reduce((m, p) => m + p.amount, 0),
      0,
    ),
  }));
  const map = new Map<string, ShiftProductLine>();
  for (const s of sales) {
    for (const it of s.items) {
      const cur = map.get(it.productId) ?? {
        productId: it.productId,
        name: it.name,
        barcode: it.barcode,
        qty: 0,
        total: 0,
      };
      cur.qty += it.qty;
      cur.total += it.sellPrice * it.qty;
      map.set(it.productId, cur);
    }
  }
  for (const r of returns) {
    for (const it of r.items) {
      const cur = map.get(it.productId) ?? {
        productId: it.productId,
        name: it.name,
        barcode: it.barcode,
        qty: 0,
        total: 0,
      };
      cur.qty -= it.qty;
      cur.total -= it.sellPrice * it.qty;
      map.set(it.productId, cur);
    }
  }
  const products = [...map.values()]
    .filter((p) => p.qty !== 0 || p.total !== 0)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const tunaiMasuk = byMethod.find((m) => m.method === "tunai")?.total ?? 0;
  const returTunai = returns.filter((r) => r.method === "tunai").reduce((n, r) => n + r.total, 0);
  const pengeluaran = expenses.reduce((n, e) => n + e.amount, 0);
  return {
    shift,
    sales,
    voids,
    returns,
    expenses,
    byMethod,
    products,
    notaCount: sales.length,
    itemQty: products.reduce((n, p) => n + p.qty, 0),
    omzet: sales.reduce((n, s) => n + s.total, 0),
    subtotal: sales.reduce((n, s) => n + s.subtotal, 0),
    discount: sales.reduce((n, s) => n + s.discount, 0),
    ppn: sales.reduce((n, s) => n + s.ppn, 0),
    ongkir: sales.reduce((n, s) => n + s.deliveryCost, 0),
    voidTotal: voids.reduce((n, s) => n + s.total, 0),
    returTotal: returns.reduce((n, r) => n + r.total, 0),
    tunaiMasuk,
    returTunai,
    pengeluaran,
  };
}

function returnItemsOf(returnId: string): SaleReturnItem[] {
  return all<SaleReturnItem>(
    `SELECT id, return_id AS returnId, sale_item_id AS saleItemId, product_id AS productId, barcode, name, qty, sell_price AS sellPrice, cost_price AS costPrice
     FROM return_items WHERE return_id = ?`,
    [returnId],
  );
}

export function listReturns(): SaleReturn[] {
  return all<{
    id: string;
    local_no: string;
    sale_id: string;
    cashier_id: string;
    cashier_name: string;
    method: PayMethod;
    total: number;
    note: string;
    created_at: string;
  }>(`SELECT * FROM returns ORDER BY created_at DESC`).map((r) => ({
    id: r.id,
    localNo: r.local_no,
    saleId: r.sale_id,
    cashierId: r.cashier_id,
    cashierName: r.cashier_name,
    method: r.method,
    total: r.total,
    note: r.note ?? "",
    createdAt: r.created_at,
    items: returnItemsOf(r.id),
  }));
}

export function returnedQtyBySale(saleId: string): { total: number; byItem: Record<string, number> } {
  const rows = all<{ sale_item_id: string; qty: number }>(
    `SELECT sale_item_id, SUM(qty) AS qty FROM return_items
     WHERE return_id IN (SELECT id FROM returns WHERE sale_id = ?)
     GROUP BY sale_item_id`,
    [saleId],
  );
  const byItem: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byItem[r.sale_item_id] = r.qty;
    total += r.qty;
  }
  return { total, byItem };
}

export function createReturn(input: {
  saleId: string;
  cashier: Session;
  lines: { saleItemId: string; qty: number }[];
  note?: string;
}): SaleReturn {
  const sale = getSale(input.saleId);
  if (!sale) throw new Error("Nota tidak ditemukan");
  if (sale.status === "void") throw new Error("Nota sudah di-void");
  if (!currentOpenShift()) throw new Error("Buka kasir dulu sebelum retur.");
  const already = returnedQtyBySale(sale.id);
  const items: SaleReturnItem[] = [];
  for (const line of input.lines) {
    const qty = roundQty(line.qty);
    if (qty <= 0) continue;
    const src = sale.items.find((it) => it.id === line.saleItemId);
    if (!src) throw new Error("Barang tidak ada di nota");
    const sisa = roundQty(src.qty - (already.byItem[src.id] ?? 0));
    if (qty - sisa > 1e-9) throw new Error(`Retur ${src.name} melebihi sisa (${sisa})`);
    items.push({
      id: newId(),
      returnId: "",
      saleItemId: src.id,
      productId: src.productId,
      barcode: src.barcode,
      name: src.name,
      qty,
      sellPrice: src.sellPrice,
      costPrice: src.costPrice,
    });
  }
  if (!items.length) throw new Error("Pilih barang yang dikembalikan");
  const after: Record<string, number> = { ...already.byItem };
  for (const it of items) after[it.saleItemId] = roundQty((after[it.saleItemId] ?? 0) + it.qty);
  const allBack = sale.items.every((it) => roundQty(after[it.id] ?? 0) + 1e-9 >= it.qty);
  const merchandise = items.reduce((n, it) => n + lineRefund(sale, it.sellPrice, it.qty), 0);
  const total = merchandise + (allBack ? sale.deliveryCost : 0);
  const hutangOnSale = sale.payments.filter((p) => p.method === "hutang").reduce((n, p) => n + p.amount, 0);
  const hutangRetur = listReturns()
    .filter((r) => r.saleId === sale.id && r.method === "hutang")
    .reduce((n, r) => n + r.total, 0);
  const remainingHutang = Math.max(0, hutangOnSale - hutangRetur);
  let method: PayMethod = sale.method;
  if (remainingHutang >= total && total > 0) method = "hutang";
  else if (sale.payments.some((p) => p.method === "tunai" && p.amount > 0)) method = "tunai";
  else method = sale.payments.find((p) => p.method !== "hutang")?.method ?? sale.method;
  const now = new Date().toISOString();
  const id = newId();
  const local = nextLocalNo("RTR", "returns");
  const events = items.map((it) => ({
    id: newId(),
    productId: it.productId,
    type: "return" as const,
    qty: it.qty,
    refId: id,
    deviceId: deviceId(),
    createdAt: now,
  }));
  tx(() => {
    run(
      `INSERT INTO returns (id, local_no, sale_id, cashier_id, cashier_name, method, total, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, local, sale.id, input.cashier.id, input.cashier.name, method, total, (input.note ?? "").trim(), now],
    );
    for (const it of items) {
      run(
        `INSERT INTO return_items (id, return_id, sale_item_id, product_id, barcode, name, qty, sell_price, cost_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [it.id, id, it.saleItemId, it.productId, it.barcode, it.name, it.qty, it.sellPrice, it.costPrice],
      );
    }
    for (const ev of events) {
      run(
        `INSERT INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ev.id, ev.productId, ev.type, ev.qty, ev.refId, ev.deviceId, ev.createdAt],
      );
    }
    enqueue("sale_return", {
      doc: {
        id,
        localNo: local,
        saleId: sale.id,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        method,
        total,
        note: (input.note ?? "").trim(),
        createdAt: now,
      },
      items: items.map((it) => ({ ...it, returnId: id })),
      events,
    });
  });
  return {
    id,
    localNo: local,
    saleId: sale.id,
    cashierId: input.cashier.id,
    cashierName: input.cashier.name,
    method,
    total,
    note: (input.note ?? "").trim(),
    createdAt: now,
    items: items.map((it) => ({ ...it, returnId: id })),
  };
}

export function listOpnames(): Opname[] {
  return all<{
    id: string;
    local_no: string;
    cashier_id: string;
    cashier_name: string;
    note: string;
    created_at: string;
  }>(`SELECT * FROM opnames ORDER BY created_at DESC`).map((r) => ({
    id: r.id,
    localNo: r.local_no,
    cashierId: r.cashier_id,
    cashierName: r.cashier_name,
    note: r.note ?? "",
    createdAt: r.created_at,
    items: all<OpnameItem>(
      `SELECT id, opname_id AS opnameId, product_id AS productId, barcode, name, unit, sistem, fisik, selisih
       FROM opname_items WHERE opname_id = ?`,
      [r.id],
    ),
  }));
}

export function saveOpname(input: {
  cashier: Session;
  note?: string;
  lines: { product: Product; fisik: number }[];
}): Opname {
  const items = input.lines
    .map((l) => {
      const fisik = Math.max(0, roundQty(l.fisik));
      const sistem = l.product.stock;
      return {
        id: newId(),
        opnameId: "",
        productId: l.product.id,
        barcode: l.product.barcode,
        name: l.product.name,
        unit: l.product.unit,
        sistem,
        fisik,
        selisih: fisik - sistem,
      };
    })
    .filter((it) => it.selisih !== 0);
  if (!items.length) throw new Error("Tidak ada selisih stok untuk disimpan");
  const now = new Date().toISOString();
  const id = newId();
  const local = nextLocalNo("OPN", "opnames");
  const events = items.map((it) => ({
    id: newId(),
    productId: it.productId,
    type: "adjust" as const,
    qty: it.selisih,
    refId: id,
    deviceId: deviceId(),
    createdAt: now,
  }));
  tx(() => {
    run(
      `INSERT INTO opnames (id, local_no, cashier_id, cashier_name, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, local, input.cashier.id, input.cashier.name, (input.note ?? "").trim(), now],
    );
    for (const it of items) {
      run(
        `INSERT INTO opname_items (id, opname_id, product_id, barcode, name, unit, sistem, fisik, selisih)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [it.id, id, it.productId, it.barcode, it.name, it.unit, it.sistem, it.fisik, it.selisih],
      );
    }
    for (const ev of events) {
      run(
        `INSERT INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ev.id, ev.productId, ev.type, ev.qty, ev.refId, ev.deviceId, ev.createdAt],
      );
    }
    enqueue("opname", {
      doc: {
        id,
        localNo: local,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        note: (input.note ?? "").trim(),
        createdAt: now,
      },
      items: items.map((it) => ({ ...it, opnameId: id })),
      events,
    });
  });
  return {
    id,
    localNo: local,
    cashierId: input.cashier.id,
    cashierName: input.cashier.name,
    note: (input.note ?? "").trim(),
    createdAt: now,
    items: items.map((it) => ({ ...it, opnameId: id })),
  };
}

export function saveRestock(input: {
  cashier: Session;
  lines: { product: Product; qty: number }[];
}): StockIn {
  const now = new Date().toISOString();
  const id = newId();
  const local = nextLocalNo("RST", "stock_ins");
  const items = input.lines
    .filter((l) => l.qty > 0)
    .map((l) => ({
      id: newId(),
      stockInId: id,
      productId: l.product.id,
      barcode: l.product.barcode,
      name: l.product.name,
      qty: roundQty(l.qty),
      buyPrice: l.product.buyPrice,
    }));
  const events = items.map((it) => ({
    id: newId(),
    productId: it.productId,
    type: "stock_in" as const,
    qty: it.qty,
    refId: id,
    deviceId: deviceId(),
    createdAt: now,
  }));
  tx(() => {
    run(
      `INSERT INTO stock_ins (id, local_no, cashier_id, cashier_name, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, local, input.cashier.id, input.cashier.name, now],
    );
    for (const it of items) {
      run(
        `INSERT INTO stock_in_items (id, stock_in_id, product_id, barcode, name, qty, buy_price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [it.id, it.stockInId, it.productId, it.barcode, it.name, it.qty, it.buyPrice],
      );
    }
    for (const ev of events) {
      run(
        `INSERT INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ev.id, ev.productId, ev.type, ev.qty, ev.refId, ev.deviceId, ev.createdAt],
      );
    }
    enqueue("stock_in", {
      doc: {
        id,
        localNo: local,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        createdAt: now,
      },
      items,
      events,
    });
  });
  return {
    id,
    localNo: local,
    cashierId: input.cashier.id,
    cashierName: input.cashier.name,
    createdAt: now,
    items,
  };
}

export function deleteRestock(id: string): { ok: true } | { ok: false; error: string } {
  const doc = one<{ id: string; local_no: string }>(`SELECT id, local_no FROM stock_ins WHERE id = ?`, [id]);
  if (!doc) return { ok: false, error: "Nota restock tidak ditemukan" };
  tx(() => {
    run(`DELETE FROM stock_events WHERE ref_id = ?`, [id]);
    run(`DELETE FROM stock_in_items WHERE stock_in_id = ?`, [id]);
    run(`DELETE FROM stock_ins WHERE id = ?`, [id]);
    enqueue("stock_in_delete", { id });
  });
  return { ok: true };
}

export function listRestocks(date: string | "all"): StockIn[] {
  const docs = all<{
    id: string;
    local_no: string;
    cashier_id: string;
    cashier_name: string;
    created_at: string;
  }>(`SELECT * FROM stock_ins ORDER BY created_at DESC`);
  const mapped = docs.map((d) => ({
    id: d.id,
    localNo: d.local_no,
    cashierId: d.cashier_id,
    cashierName: d.cashier_name,
    createdAt: d.created_at,
    items: all<StockIn["items"][number]>(
      `SELECT id, stock_in_id AS stockInId, product_id AS productId, barcode, name, qty, buy_price AS buyPrice
       FROM stock_in_items WHERE stock_in_id = ?`,
      [d.id],
    ),
  }));
  if (date === "all") return mapped;
  return mapped.filter((d) => localDayFromIso(d.createdAt) === date);
}

export function addExpense(input: {
  category: ExpenseCategory;
  amount: number;
  note: string;
  cashierName: string;
}): void {
  const row: Expense = {
    id: newId(),
    category: input.category,
    amount: input.amount,
    note: input.note,
    createdAt: new Date().toISOString(),
    cashierName: input.cashierName,
  };
  run(
    `INSERT INTO expenses (id, category, amount, note, created_at, cashier_name) VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.category, row.amount, row.note, row.createdAt, row.cashierName],
  );
  enqueue("expense", row);
}

export function listExpenses(): Expense[] {
  return all<Expense>(
    `SELECT id, category, amount, note, created_at AS createdAt, cashier_name AS cashierName
     FROM expenses ORDER BY created_at DESC`,
  );
}

export function listEmployees(includeInactive = false): Employee[] {
  const sql = includeInactive
    ? `SELECT id, name, job_role AS jobRole, active FROM employees ORDER BY name`
    : `SELECT id, name, job_role AS jobRole, active FROM employees WHERE active = 1 ORDER BY name`;
  return all<{ id: string; name: string; jobRole: string; active: number }>(sql).map((r) => ({
    id: r.id,
    name: r.name,
    jobRole: r.jobRole,
    active: r.active === 1,
  }));
}

export async function upsertEmployee(input: {
  id?: string;
  name: string;
  jobRole: string;
  pin?: string;
  active: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim();
  const jobRole = input.jobRole.trim();
  if (!name) return { ok: false, error: "Nama wajib diisi" };
  if (!jobRole) return { ok: false, error: "Jabatan wajib diisi" };

  const id = input.id ?? newId();
  const existing = input.id
    ? one<{ id: string; pin_hash: string }>(`SELECT id, pin_hash FROM employees WHERE id = ?`, [id])
    : null;
  if (input.id && !existing) return { ok: false, error: "Karyawan tidak ditemukan" };

  let pinHash = existing?.pin_hash;
  if (input.pin) {
    if (!/^\d{6}$/.test(input.pin)) return { ok: false, error: "PIN harus 6 digit angka" };
    pinHash = await hashPin(input.pin);
    const clash = one<{ id: string }>(`SELECT id FROM employees WHERE pin_hash = ? AND id != ?`, [pinHash, id]);
    if (clash) return { ok: false, error: "PIN sudah dipakai karyawan lain" };
  }
  if (!pinHash) return { ok: false, error: "PIN wajib diisi untuk karyawan baru" };

  const now = new Date().toISOString();
  if (existing) {
    run(
      `UPDATE employees SET name = ?, job_role = ?, pin_hash = ?, active = ?, updated_at = ? WHERE id = ?`,
      [name, jobRole, pinHash, input.active ? 1 : 0, now, id],
    );
  } else {
    run(
      `INSERT INTO employees (id, name, job_role, pin_hash, active, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, jobRole, pinHash, input.active ? 1 : 0, now],
    );
  }
  enqueue("employee", { id, name, jobRole, active: input.active, updatedAt: now });
  return { ok: true };
}

export function deleteEmployee(id: string): { ok: true } | { ok: false; error: string } {
  const existing = one<{ id: string; name: string }>(`SELECT id, name FROM employees WHERE id = ?`, [id]);
  if (!existing) return { ok: false, error: "Karyawan tidak ditemukan" };
  tx(() => {
    run(`DELETE FROM attendances WHERE employee_id = ?`, [id]);
    run(`DELETE FROM employees WHERE id = ?`, [id]);
    enqueue("employee_delete", { id });
  });
  return { ok: true };
}

export async function clockEmployee(
  employeeId: string,
  pin: string,
  type: "in" | "out",
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const emp = one<{ id: string; name: string; pin_hash: string }>(
    `SELECT id, name, pin_hash FROM employees WHERE id = ? AND active = 1`,
    [employeeId],
  );
  if (!emp) return { ok: false, error: "Karyawan tidak ditemukan" };
  const hash = await hashPin(pin);
  if (hash !== emp.pin_hash) return { ok: false, error: "PIN salah" };
  const today = todayIso();
  const already = all<{ created_at: string }>(
    `SELECT created_at FROM attendances WHERE employee_id = ? AND type = ?`,
    [employeeId, type],
  ).some((r) => localDayFromIso(r.created_at) === today);
  if (already) {
    return {
      ok: false,
      error: type === "in" ? "Sudah absen masuk hari ini" : "Sudah absen pulang hari ini",
    };
  }
  if (type === "out") {
    const masuk = all<{ created_at: string }>(
      `SELECT created_at FROM attendances WHERE employee_id = ? AND type = 'in'`,
      [employeeId],
    ).some((r) => localDayFromIso(r.created_at) === today);
    if (!masuk) return { ok: false, error: "Belum absen masuk" };
  }
  const row = {
    id: newId(),
    employeeId,
    type,
    createdAt: new Date().toISOString(),
  };
  run(
    `INSERT INTO attendances (id, employee_id, type, created_at) VALUES (?, ?, ?, ?)`,
    [row.id, row.employeeId, row.type, row.createdAt],
  );
  enqueue("attendance", row);
  return { ok: true, name: emp.name };
}

export function attendanceToday(): AttendanceRow[] {
  const today = todayIso();
  const emps = listEmployees();
  return emps.map((e) => {
    const inn = all<{ created_at: string }>(
      `SELECT created_at FROM attendances WHERE employee_id = ? AND type = 'in'`,
      [e.id],
    ).find((r) => localDayFromIso(r.created_at) === today);
    const out = all<{ created_at: string }>(
      `SELECT created_at FROM attendances WHERE employee_id = ? AND type = 'out'`,
      [e.id],
    ).find((r) => localDayFromIso(r.created_at) === today);
    return {
      id: e.id,
      name: e.name,
      jobRole: e.jobRole,
      inTime: inn?.created_at ?? null,
      outTime: out?.created_at ?? null,
    };
  });
}

export function loadSettings(): StoreSettings {
  const row = one<{ value: string }>(`SELECT value FROM settings WHERE key = 'store'`);
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<StoreSettings>) };
}

export function saveSettings(s: StoreSettings): void {
  run(`INSERT INTO settings (key, value) VALUES ('store', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
    JSON.stringify(s),
  ]);
  enqueue("settings", { key: "store", value: s });
}

export function reportSummary(range: { from: string; to: string }) {
  const { from, to } = range;
  const sales = listSales("all").filter((s) => inIsoRange(s.createdAt, from, to));
  const expenses = listExpenses().filter((e) => inIsoRange(e.createdAt, from, to));
  const returDocs = listReturns().filter((r) => inIsoRange(r.createdAt, from, to));
  const shifts = listCashShifts().filter((s) => inIsoRange(s.openedAt, from, to));

  const selesai = sales.filter((s) => s.status === "selesai");
  const voids = sales.filter((s) => s.status === "void");
  const hppOf = (list: Sale[]) =>
    list.reduce((n, s) => n + s.items.reduce((m, it) => m + it.costPrice * it.qty, 0), 0);
  const hppReturDocs = returDocs.reduce((n, r) => n + r.items.reduce((m, it) => m + it.costPrice * it.qty, 0), 0);
  const nilaiReturDocs = returDocs.reduce((n, r) => n + r.total, 0);

  const penjualanKotor = selesai.reduce((n, s) => n + s.total, 0) + voids.reduce((n, s) => n + s.total, 0);
  const retur = voids.reduce((n, s) => n + s.total, 0) + nilaiReturDocs;
  const pendapatanBersih = penjualanKotor - retur;
  const hppKotor = hppOf(selesai) + hppOf(voids);
  const hppRetur = hppOf(voids) + hppReturDocs;
  const hppBersih = hppKotor - hppRetur;
  const beban = EXPENSE_CATEGORIES.filter((c) => c !== "pembelian").map((c) => ({
    key: c,
    label: EXPENSE_LABEL[c],
    amount: expenses.filter((e) => e.category === c).reduce((n, e) => n + e.amount, 0),
  }));
  const pengeluaran = beban.reduce((n, b) => n + b.amount, 0);
  const labaKotor = pendapatanBersih - hppBersih;
  const labaBersih = labaKotor - pengeluaran;

  const mapped = sales.map((s) => ({
    method: s.method,
    total: s.total,
    status: s.status,
    hpp: s.items.reduce((n, it) => n + it.costPrice * it.qty, 0),
  }));
  const kasAwal = shifts[0] ? [...shifts].sort((a, b) => a.openedAt.localeCompare(b.openedAt))[0].kasAwal : 0;
  const payAmt = (list: Sale[], method: PayMethod) =>
    list.reduce((n, s) => n + s.payments.filter((p) => p.method === method).reduce((m, p) => m + p.amount, 0), 0);
  const tunaiMasuk = payAmt(selesai, "tunai");
  const qris = payAmt(selesai, "qris");
  const transfer = payAmt(selesai, "transfer");
  const kartu = payAmt(selesai, "kartu");
  const hutang = payAmt(selesai, "hutang");
  const pelunasanRows = listCustomerPayments().filter((p) => inIsoRange(p.createdAt, from, to));
  const pelunasan = pelunasanRows.reduce((n, p) => n + p.amount, 0);
  const pelunasanTunai = pelunasanRows.filter((p) => p.method === "tunai").reduce((n, p) => n + p.amount, 0);
  const kas = arusKas(mapped, expenses.map((e) => ({ amount: e.amount })), []);
  kas.tunaiMasuk = tunaiMasuk + pelunasanTunai;
  kas.qris = qris;
  kas.transfer = transfer;
  kas.kartu = kartu;
  kas.hutang = hutang;
  kas.pelunasan = pelunasan;
  kas.nonTunai = qris + transfer + kartu;
  const tunaiRetur = returDocs.filter((r) => r.method === "tunai").reduce((n, r) => n + r.total, 0);
  const allVoids = listSales("all").filter(
    (s) => s.status === "void" && s.voidedAt && inIsoRange(s.voidedAt, from, to),
  );
  const tunaiVoid = allVoids.reduce(
    (n, s) => n + s.payments.filter((p) => p.method === "tunai").reduce((m, p) => m + p.amount, 0),
    0,
  );
  kas.kasLaci = kasAwal + tunaiMasuk + pelunasanTunai - tunaiRetur - tunaiVoid - kas.kasKeluar;

  type Raw = { at: string; ket: string; debit: number; kredit: number };
  const raw: Raw[] = [];
  for (const s of listSales("all").filter((s) => inIsoRange(s.createdAt, from, to))) {
    const tunai = s.payments.filter((p) => p.method === "tunai").reduce((n, p) => n + p.amount, 0);
    if (tunai) raw.push({ at: s.createdAt, ket: `Penjualan: ${s.localNo}`, debit: tunai, kredit: 0 });
  }
  for (const s of allVoids) {
    const tunai = s.payments.filter((p) => p.method === "tunai").reduce((n, p) => n + p.amount, 0);
    if (tunai) raw.push({ at: s.voidedAt ?? s.createdAt, ket: `Void: ${s.localNo}`, debit: 0, kredit: tunai });
  }
  for (const r of returDocs.filter((x) => x.method === "tunai")) {
    raw.push({ at: r.createdAt, ket: `Retur: ${r.localNo}`, debit: 0, kredit: r.total });
  }
  for (const p of pelunasanRows.filter((x) => x.method === "tunai")) {
    raw.push({ at: p.createdAt, ket: `Pelunasan hutang`, debit: p.amount, kredit: 0 });
  }
  for (const e of expenses) {
    raw.push({
      at: e.createdAt,
      ket: `Pengeluaran: ${EXPENSE_LABEL[e.category]}${e.note ? ` — ${e.note}` : ""}`,
      debit: 0,
      kredit: e.amount,
    });
  }
  raw.sort((a, b) => a.at.localeCompare(b.at));
  let saldo = kasAwal;
  const bukuKas = [
    { no: null as number | null, tanggal: "", ket: "SALDO AWAL PERIODE", debit: kasAwal, kredit: 0, saldo: kasAwal },
    ...raw.map((e, i) => {
      saldo += e.debit - e.kredit;
      return {
        no: i + 1,
        tanggal: localDayFromIso(e.at),
        ket: e.ket,
        debit: e.debit,
        kredit: e.kredit,
        saldo,
      };
    }),
  ];

  const allDates = [
    ...listSales("all").map((s) => localDayFromIso(s.createdAt)),
    ...listExpenses().map((e) => localDayFromIso(e.createdAt)),
    ...listRestocks("all").map((r) => localDayFromIso(r.createdAt)),
    ...listReturns().map((r) => localDayFromIso(r.createdAt)),
    ...listCashShifts().map((s) => localDayFromIso(s.openedAt)),
    ...listCustomerPayments().map((p) => localDayFromIso(p.createdAt)),
  ].sort();
  const dates = [...new Set(allDates)].reverse();

  return {
    labaRugi: labaRugi(
      mapped,
      expenses.filter((e) => e.category !== "pembelian").map((e) => ({ amount: e.amount })),
    ),
    arusKas: kas,
    daily: last7DaysOmzet(listSales("all")),
    rincian: {
      penjualanKotor,
      retur,
      pendapatanBersih,
      hppKotor,
      hppRetur,
      hppBersih,
      labaKotor,
      beban,
      pengeluaran,
      labaBersih,
    },
    bukuKas,
    dates,
    periodeDari: from,
    periodeSampai: to,
  };
}

function last7DaysOmzet(sales: Sale[]) {
  const days: { label: string; iso: string; tunai: number; non: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = todayIso(d);
    const label = d.toLocaleDateString("id-ID", { weekday: "short" });
    const of = sales.filter(
      (s) => s.status === "selesai" && localDayFromIso(s.createdAt) === iso,
    );
    days.push({
      label,
      iso,
      tunai: of.filter((s) => s.method === "tunai").reduce((n, s) => n + s.total, 0),
      non: of.filter((s) => s.method !== "tunai").reduce((n, s) => n + s.total, 0),
    });
  }
  return days;
}

export function outboxItems() {
  return all<{ id: string; entity: string; payload: string }>(
    `SELECT id, entity, payload FROM sync_outbox ORDER BY created_at`,
  );
}

export function removeOutbox(ids: string[]): void {
  for (const id of ids) run(`DELETE FROM sync_outbox WHERE id = ?`, [id]);
}

export function setCursor(cursor: string): void {
  run(
    `INSERT INTO sync_meta (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [cursor],
  );
}

export function getCursor(): string {
  return one<{ value: string }>(`SELECT value FROM sync_meta WHERE key = 'cursor'`)?.value ?? "1970-01-01T00:00:00.000Z";
}

export type StockMovementRow = {
  productId: string;
  barcode: string;
  name: string;
  unit: string;
  category: string;
  awal: number;
  masuk: number;
  keluar: number;
  akhir: number;
};

export function stockReport(range: { from: string; to: string }) {
  const { from, to } = range;
  const products = listProducts(true);
  const events = all<{ product_id: string; qty: number; created_at: string }>(
    `SELECT product_id, qty, created_at FROM stock_events`,
  );
  const dates = [...new Set(events.map((e) => localDayFromIso(e.created_at)))].sort();
  const activeIds = new Set(products.filter((p) => p.active).map((p) => p.id));

  const rows: StockMovementRow[] = products.map((p) => {
    const ev = events.filter((e) => e.product_id === p.id);
    const awal = ev.filter((e) => localDayFromIso(e.created_at) < from).reduce((n, e) => n + e.qty, 0);
    const period = ev.filter((e) => inIsoRange(e.created_at, from, to));
    const masuk = period.filter((e) => e.qty > 0).reduce((n, e) => n + e.qty, 0);
    const keluar = period.filter((e) => e.qty < 0).reduce((n, e) => n + -e.qty, 0);
    return {
      productId: p.id,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      category: p.category,
      awal,
      masuk,
      keluar,
      akhir: awal + masuk - keluar,
    };
  });

  const shown = rows.filter(
    (r) => r.awal || r.masuk || r.keluar || r.akhir || activeIds.has(r.productId),
  );
  const totals = shown.reduce(
    (n, r) => ({
      awal: n.awal + r.awal,
      masuk: n.masuk + r.masuk,
      keluar: n.keluar + r.keluar,
      akhir: n.akhir + r.akhir,
    }),
    { awal: 0, masuk: 0, keluar: 0, akhir: 0 },
  );

  return {
    rows: shown,
    totals,
    dates: [...dates].reverse(),
    periodeDari: from,
    periodeSampai: to,
  };
}

export function uniqueDates(table: "sales" | "stock_ins"): string[] {
  return [
    ...new Set(
      all<{ created_at: string }>(`SELECT created_at FROM ${table}`).map((r) => localDayFromIso(r.created_at)),
    ),
  ]
    .sort()
    .reverse();
}

export function getCustomer(id: string): Customer | null {
  const r = one<{ id: string; name: string; phone: string; note: string; active: number; updated_at: string }>(
    `SELECT id, name, phone, note, active, updated_at FROM customers WHERE id = ?`,
    [id],
  );
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    note: r.note ?? "",
    active: r.active === 1,
    updatedAt: r.updated_at,
    debt: customerDebt(r.id),
  };
}

export function listCustomerPayments(): CustomerPayment[] {
  return all<CustomerPayment>(
    `SELECT id, customer_id AS customerId, amount, method, note, created_at AS createdAt, cashier_id AS cashierId, cashier_name AS cashierName
     FROM customer_payments ORDER BY created_at DESC`,
  );
}

export function customerDebt(customerId: string): number {
  const sales = listSales("all").filter((s) => s.customerId === customerId && s.status === "selesai");
  const hutangIn = sales.reduce((n, s) => n + s.payments.filter((p) => p.method === "hutang").reduce((m, p) => m + p.amount, 0), 0);
  const hutangRetur = listReturns()
    .filter((r) => r.method === "hutang" && sales.some((s) => s.id === r.saleId))
    .reduce((n, r) => n + r.total, 0);
  const bayar = listCustomerPayments()
    .filter((p) => p.customerId === customerId)
    .reduce((n, p) => n + p.amount, 0);
  return Math.max(0, hutangIn - hutangRetur - bayar);
}

export function listCustomers(includeInactive = false): Customer[] {
  const sql = includeInactive
    ? `SELECT id, name, phone, note, active, updated_at FROM customers ORDER BY name`
    : `SELECT id, name, phone, note, active, updated_at FROM customers WHERE active = 1 ORDER BY name`;
  return all<{ id: string; name: string; phone: string; note: string; active: number; updated_at: string }>(sql).map(
    (r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? "",
      note: r.note ?? "",
      active: r.active === 1,
      updatedAt: r.updated_at,
      debt: customerDebt(r.id),
    }),
  );
}

export function upsertCustomer(input: {
  id?: string;
  name: string;
  phone?: string;
  note?: string;
  active?: boolean;
}): { ok: true; customer: Customer } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Nama wajib diisi" };
  const now = new Date().toISOString();
  const id = input.id ?? newId();
  const existing = input.id ? one<{ id: string }>(`SELECT id FROM customers WHERE id = ?`, [id]) : null;
  if (input.id && !existing) return { ok: false, error: "Pelanggan tidak ditemukan" };
  const phone = (input.phone ?? "").trim();
  const note = (input.note ?? "").trim();
  const active = input.active !== false;
  if (existing) {
    run(`UPDATE customers SET name=?, phone=?, note=?, active=?, updated_at=? WHERE id=?`, [
      name,
      phone,
      note,
      active ? 1 : 0,
      now,
      id,
    ]);
  } else {
    run(`INSERT INTO customers (id, name, phone, note, active, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      id,
      name,
      phone,
      note,
      active ? 1 : 0,
      now,
    ]);
  }
  enqueue("customer", { id, name, phone, note, active, updatedAt: now });
  return { ok: true, customer: { id, name, phone, note, active, updatedAt: now, debt: customerDebt(id) } };
}

export function addCustomerPayment(input: {
  customerId: string;
  amount: number;
  method: PayMethod;
  note?: string;
  cashier: Session;
}): CustomerPayment {
  if (!currentOpenShift()) throw new Error("Buka kasir dulu sebelum terima pelunasan.");
  const cust = getCustomer(input.customerId);
  if (!cust) throw new Error("Pelanggan tidak ditemukan");
  const amount = Math.max(0, Math.round(input.amount));
  if (amount <= 0) throw new Error("Nominal pelunasan wajib diisi");
  if (amount > cust.debt) throw new Error(`Melebihi sisa hutang (${cust.debt})`);
  if (input.method === "hutang") throw new Error("Metode pelunasan tidak valid");
  const row: CustomerPayment = {
    id: newId(),
    customerId: input.customerId,
    amount,
    method: input.method,
    note: (input.note ?? "").trim(),
    createdAt: new Date().toISOString(),
    cashierId: input.cashier.id,
    cashierName: input.cashier.name,
  };
  run(
    `INSERT INTO customer_payments (id, customer_id, amount, method, note, created_at, cashier_id, cashier_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.customerId, row.amount, row.method, row.note, row.createdAt, row.cashierId, row.cashierName],
  );
  enqueue("customer_payment", row);
  return row;
}

function isoOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

function pick(obj: Record<string, unknown>, camel: string, snake: string) {
  return obj[camel] ?? obj[snake];
}

export function applyPullPayload(data: Record<string, unknown>): void {
  const did = deviceId();
  const productsIn = Array.isArray(data.products) ? data.products : [];
  const usersIn = Array.isArray(data.users) ? data.users : [];
  const employeesIn = Array.isArray(data.employees) ? data.employees : [];
  const eventsIn = Array.isArray(data.stockEvents) ? data.stockEvents : [];
  const customersIn = Array.isArray(data.customers) ? data.customers : [];
  tx(() => {
    for (const raw of productsIn) {
      const p = raw as Record<string, unknown>;
      const id = String(p.id ?? "");
      if (!id) continue;
      const updatedAt = isoOf(pick(p, "updatedAt", "updated_at"));
      const local = one<{ updated_at: string }>(`SELECT updated_at FROM products WHERE id = ?`, [id]);
      if (local && local.updated_at >= updatedAt) continue;
      const barcode = String(pick(p, "barcode", "barcode") ?? "");
      const clash = one<{ id: string }>(`SELECT id FROM products WHERE barcode = ? AND id != ?`, [barcode, id]);
      if (clash) continue;
      run(
        `INSERT INTO products (id, barcode, name, unit, category, buy_price, sell_price, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET barcode=excluded.barcode, name=excluded.name, unit=excluded.unit,
           category=excluded.category, buy_price=excluded.buy_price, sell_price=excluded.sell_price,
           active=excluded.active, updated_at=excluded.updated_at`,
        [
          id,
          barcode,
          String(p.name ?? ""),
          String(p.unit ?? "pcs"),
          String(p.category ?? ""),
          Number(pick(p, "buyPrice", "buy_price") ?? 0),
          Number(pick(p, "sellPrice", "sell_price") ?? 0),
          pick(p, "active", "active") === false || pick(p, "active", "active") === 0 ? 0 : 1,
          updatedAt,
        ],
      );
    }
    for (const raw of usersIn) {
      const u = raw as Record<string, unknown>;
      const id = String(u.id ?? "");
      if (!id) continue;
      const updatedAt = isoOf(pick(u, "updatedAt", "updated_at"));
      const local = one<{ updated_at: string }>(`SELECT updated_at FROM users WHERE id = ?`, [id]);
      if (local && local.updated_at >= updatedAt) continue;
      const pinHash = String(pick(u, "pinHash", "pin_hash") ?? "");
      const menus = u.menus != null ? (typeof u.menus === "string" ? u.menus : JSON.stringify(u.menus)) : "";
      const existing = one<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [id]);
      if (existing) {
        run(`UPDATE users SET name=?, role=?, pin_hash=?, menus=?, active=?, updated_at=? WHERE id=?`, [
          String(u.name ?? ""),
          String(u.role ?? "kasir"),
          pinHash || one<{ pin_hash: string }>(`SELECT pin_hash FROM users WHERE id = ?`, [id])?.pin_hash,
          menus,
          pick(u, "active", "active") === false || pick(u, "active", "active") === 0 ? 0 : 1,
          updatedAt,
          id,
        ]);
      } else if (pinHash) {
        run(
          `INSERT INTO users (id, name, role, pin_hash, pin, menus, active, updated_at) VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
          [
            id,
            String(u.name ?? ""),
            String(u.role ?? "kasir"),
            pinHash,
            menus,
            pick(u, "active", "active") === false || pick(u, "active", "active") === 0 ? 0 : 1,
            updatedAt,
          ],
        );
      }
    }
    for (const raw of employeesIn) {
      const e = raw as Record<string, unknown>;
      const id = String(e.id ?? "");
      if (!id) continue;
      const updatedAt = isoOf(pick(e, "updatedAt", "updated_at"));
      const local = one<{ updated_at: string }>(`SELECT updated_at FROM employees WHERE id = ?`, [id]);
      if (local && local.updated_at >= updatedAt) continue;
      const pinHash = String(pick(e, "pinHash", "pin_hash") ?? "");
      const existing = one<{ id: string }>(`SELECT id FROM employees WHERE id = ?`, [id]);
      if (existing) {
        run(`UPDATE employees SET name=?, job_role=?, active=?, updated_at=? WHERE id=?`, [
          String(e.name ?? ""),
          String(pick(e, "jobRole", "job_role") ?? ""),
          pick(e, "active", "active") === false || pick(e, "active", "active") === 0 ? 0 : 1,
          updatedAt,
          id,
        ]);
      } else if (pinHash) {
        run(`INSERT INTO employees (id, name, job_role, pin_hash, active, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
          id,
          String(e.name ?? ""),
          String(pick(e, "jobRole", "job_role") ?? ""),
          pinHash,
          pick(e, "active", "active") === false || pick(e, "active", "active") === 0 ? 0 : 1,
          updatedAt,
        ]);
      }
    }
    for (const raw of customersIn) {
      const c = raw as Record<string, unknown>;
      const id = String(c.id ?? "");
      if (!id) continue;
      const updatedAt = isoOf(pick(c, "updatedAt", "updated_at"));
      const local = one<{ updated_at: string }>(`SELECT updated_at FROM customers WHERE id = ?`, [id]);
      if (local && local.updated_at >= updatedAt) continue;
      run(
        `INSERT INTO customers (id, name, phone, note, active, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone, note=excluded.note,
           active=excluded.active, updated_at=excluded.updated_at`,
        [
          id,
          String(c.name ?? ""),
          String(c.phone ?? ""),
          String(c.note ?? ""),
          pick(c, "active", "active") === false || pick(c, "active", "active") === 0 ? 0 : 1,
          updatedAt,
        ],
      );
    }
    for (const raw of eventsIn) {
      const e = raw as Record<string, unknown>;
      const id = String(e.id ?? "");
      const device = String(pick(e, "deviceId", "device_id") ?? "");
      if (!id || device === did) continue;
      run(
        `INSERT OR IGNORE INTO stock_events (id, product_id, type, qty, ref_id, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(pick(e, "productId", "product_id") ?? ""),
          String(e.type ?? "adjust"),
          Number(e.qty ?? 0),
          pick(e, "refId", "ref_id") == null ? null : String(pick(e, "refId", "ref_id")),
          device,
          isoOf(pick(e, "createdAt", "created_at")),
        ],
      );
    }
    const cursor = data.cursor;
    if (typeof cursor === "string" && cursor) {
      run(
        `INSERT INTO sync_meta (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [cursor],
      );
    }
  });
}

export { parseCsvProducts } from "./importProducts.ts";
