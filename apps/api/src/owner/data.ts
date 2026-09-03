import {
  DEFAULT_SETTINGS,
  EXPENSE_CATEGORIES,
  EXPENSE_FUND_LABEL,
  EXPENSE_LABEL,
  MEMBER_VISIT_GOAL,
  PAY_METHODS,
  PAY_METHOD_LABEL,
  arusKas,
  asExpenseFund,
  labaRugi,
  saleMethodLabel,
  salePaymentsOf,
  type ExpenseCategory,
  type ExpenseFund,
  type PayMethod,
  type SaleStatus,
  type StoreSettings,
} from "@sklamini/shared";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import {
  attendances,
  cashShifts,
  customerPayments,
  customers,
  employees,
  expenses,
  memberRewards,
  products,
  returnItems,
  returns,
  saleItems,
  salePayments,
  sales,
  settings,
  stockEvents,
  stockInItems,
  stockIns,
} from "../db/schema.ts";

const TZ = "Asia/Jakarta";

function iso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function isoReq(v: Date | string | null | undefined): string {
  return iso(v) ?? new Date().toISOString();
}

export function dayOf(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function todayJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function inDayRange(value: Date | string, from: string, to: string) {
  const day = dayOf(value);
  return day >= from && day <= to;
}

function asPay(raw: string): PayMethod {
  return (PAY_METHODS as readonly string[]).includes(raw) ? (raw as PayMethod) : "tunai";
}

function asCat(raw: string): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(raw) ? (raw as ExpenseCategory) : "lain";
}

function asStatus(raw: string): SaleStatus {
  return raw === "void" ? "void" : "selesai";
}

export type OwnerSaleItem = {
  id: string;
  productId: string;
  barcode: string;
  name: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
};

export type OwnerSalePayment = {
  id: string;
  saleId: string;
  method: PayMethod;
  amount: number;
};

export type OwnerSale = {
  id: string;
  localNo: string;
  cashierId: string;
  cashierName: string;
  customerId: string | null;
  method: PayMethod;
  subtotal: number;
  discount: number;
  deliveryCost: number;
  ppn: number;
  ppnRate: number;
  note: string;
  total: number;
  paid: number;
  changeAmount: number;
  status: SaleStatus;
  createdAt: string;
  voidedAt: string | null;
  items: OwnerSaleItem[];
  payments: OwnerSalePayment[];
};

export type OwnerExpense = {
  id: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  fund: ExpenseFund;
  createdAt: string;
  cashierName: string;
};

export type OwnerReturn = {
  id: string;
  localNo: string;
  saleId: string;
  cashierName: string;
  method: PayMethod;
  total: number;
  note: string;
  createdAt: string;
  items: OwnerSaleItem[];
};

export type OwnerShift = {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  kasAwal: number;
  kasHitung: number | null;
  kasSistem: number | null;
  selisih: number | null;
  note: string;
  status: "open" | "closed";
};

type RawBundle = {
  sales: OwnerSale[];
  expenses: OwnerExpense[];
  returns: OwnerReturn[];
  shifts: OwnerShift[];
  memberFees: { id: string; amount: number; method: PayMethod; createdAt: string }[];
  settings: StoreSettings;
};

function mapSale(
  s: typeof sales.$inferSelect,
  items: OwnerSaleItem[],
  payments: OwnerSalePayment[],
): OwnerSale {
  const method = asPay(s.method);
  const total = s.total;
  const pays =
    payments.length > 0
      ? payments
      : [{ id: "", saleId: s.id, method, amount: total }];
  return {
    id: s.id,
    localNo: s.localNo,
    cashierId: s.cashierId,
    cashierName: s.cashierName,
    customerId: s.customerId,
    method,
    subtotal: s.subtotal,
    discount: s.discount,
    deliveryCost: s.deliveryCost,
    ppn: s.ppn,
    ppnRate: s.ppnRate,
    note: s.note,
    total,
    paid: s.paid,
    changeAmount: s.changeAmount,
    status: asStatus(s.status),
    createdAt: isoReq(s.createdAt),
    voidedAt: iso(s.voidedAt),
    items,
    payments: pays,
  };
}

export async function loadStoreSettings(): Promise<StoreSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "store"));
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<StoreSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed, apiToken: "" };
  } catch {
    return { ...DEFAULT_SETTINGS, apiToken: "" };
  }
}

async function loadBundle(): Promise<RawBundle> {
  const [saleRows, itemRows, payRows, expRows, retRows, retItemRows, shiftRows, feeRows, store] =
    await Promise.all([
      db.select().from(sales).orderBy(desc(sales.createdAt)),
      db.select().from(saleItems),
      db.select().from(salePayments),
      db.select().from(expenses).orderBy(desc(expenses.createdAt)),
      db.select().from(returns).orderBy(desc(returns.createdAt)),
      db.select().from(returnItems),
      db.select().from(cashShifts).orderBy(desc(cashShifts.openedAt)),
      db.select().from(customerPayments).orderBy(desc(customerPayments.createdAt)),
      loadStoreSettings(),
    ]);

  const itemsBySale = new Map<string, OwnerSaleItem[]>();
  for (const it of itemRows) {
    const list = itemsBySale.get(it.saleId) ?? [];
    list.push({
      id: it.id,
      productId: it.productId,
      barcode: it.barcode,
      name: it.name,
      qty: Number(it.qty),
      sellPrice: it.sellPrice,
      costPrice: it.costPrice,
    });
    itemsBySale.set(it.saleId, list);
  }
  const paysBySale = new Map<string, OwnerSalePayment[]>();
  for (const p of payRows) {
    const list = paysBySale.get(p.saleId) ?? [];
    list.push({ id: p.id, saleId: p.saleId, method: asPay(p.method), amount: p.amount });
    paysBySale.set(p.saleId, list);
  }
  const mappedSales = saleRows.map((s) => mapSale(s, itemsBySale.get(s.id) ?? [], paysBySale.get(s.id) ?? []));

  const retItemsBy = new Map<string, OwnerSaleItem[]>();
  for (const it of retItemRows) {
    const list = retItemsBy.get(it.returnId) ?? [];
    list.push({
      id: it.id,
      productId: it.productId,
      barcode: it.barcode,
      name: it.name,
      qty: Number(it.qty),
      sellPrice: it.sellPrice,
      costPrice: it.costPrice,
    });
    retItemsBy.set(it.returnId, list);
  }

  return {
    sales: mappedSales,
    expenses: expRows.map((e) => ({
      id: e.id,
      category: asCat(e.category),
      amount: e.amount,
      note: e.note,
      fund: asExpenseFund(e.fund),
      createdAt: isoReq(e.createdAt),
      cashierName: e.cashierName,
    })),
    returns: retRows.map((r) => ({
      id: r.id,
      localNo: r.localNo,
      saleId: r.saleId,
      cashierName: r.cashierName,
      method: asPay(r.method),
      total: r.total,
      note: r.note,
      createdAt: isoReq(r.createdAt),
      items: retItemsBy.get(r.id) ?? [],
    })),
    shifts: shiftRows.map((s) => ({
      id: s.id,
      cashierId: s.cashierId,
      cashierName: s.cashierName,
      openedAt: isoReq(s.openedAt),
      closedAt: iso(s.closedAt),
      kasAwal: s.kasAwal,
      kasHitung: s.kasHitung,
      kasSistem: s.kasSistem,
      selisih: s.selisih,
      note: s.note,
      status: s.status === "open" ? "open" : "closed",
    })),
    memberFees: feeRows
      .filter((f) => f.note === "Pendaftaran member")
      .map((f) => ({
        id: f.id,
        amount: f.amount,
        method: asPay(f.method),
        createdAt: isoReq(f.createdAt),
      })),
    settings: store,
  };
}

function saleCashIn(sale: OwnerSale): number {
  return salePaymentsOf(sale).reduce((n, p) => n + p.amount, 0);
}

function tunaiShare(sale: OwnerSale): number {
  const tunai = sale.payments.filter((p) => p.method === "tunai").reduce((n, p) => n + p.amount, 0);
  if (sale.total <= 0) return tunai > 0 ? 1 : 0;
  return Math.min(1, tunai / sale.total);
}

function tunaiOutForReturn(total: number, sale: OwnerSale | null): number {
  if (!sale) return 0;
  return Math.round(total * tunaiShare(sale));
}

function inShift(isoAt: string, shift: OwnerShift, until = shift.closedAt ?? new Date().toISOString()) {
  return isoAt >= shift.openedAt && isoAt <= until;
}

function expectedDrawer(bundle: RawBundle, fromIso: string, toIso?: string): number {
  const to = toIso ?? new Date().toISOString();
  const tunaiIn = bundle.sales
    .filter((s) => s.createdAt >= fromIso && s.createdAt <= to)
    .reduce((n, s) => n + s.payments.filter((p) => p.method === "tunai").reduce((m, p) => m + p.amount, 0), 0);
  const tunaiVoid = bundle.sales
    .filter((s) => s.status === "void" && (s.voidedAt ?? s.createdAt) >= fromIso && (s.voidedAt ?? s.createdAt) <= to)
    .reduce((n, s) => n + s.payments.filter((p) => p.method === "tunai").reduce((m, p) => m + p.amount, 0), 0);
  const saleById = new Map(bundle.sales.map((s) => [s.id, s]));
  const tunaiRetur = bundle.returns
    .filter((r) => r.createdAt >= fromIso && r.createdAt <= to)
    .reduce((n, r) => n + tunaiOutForReturn(r.total, saleById.get(r.saleId) ?? null), 0);
  const keluar = bundle.expenses
    .filter((e) => e.fund === "laci" && e.createdAt >= fromIso && e.createdAt <= to)
    .reduce((n, e) => n + e.amount, 0);
  const memberTunai = bundle.memberFees
    .filter((f) => f.createdAt >= fromIso && f.createdAt <= to && f.method === "tunai")
    .reduce((n, f) => n + f.amount, 0);
  return tunaiIn + memberTunai - tunaiVoid - tunaiRetur - keluar;
}

export type ShiftProductLine = {
  productId: string;
  name: string;
  barcode: string;
  qty: number;
  total: number;
};

export type ShiftSnapshot = {
  shift: OwnerShift;
  expected: number;
  byMethod: { method: PayMethod; label: string; count: number; total: number }[];
  products: ShiftProductLine[];
  notaCount: number;
  itemQty: number;
  omzet: number;
  voidTotal: number;
  returTotal: number;
  tunaiMasuk: number;
  returTunai: number;
  pengeluaran: number;
};

function shiftSnapshot(bundle: RawBundle, shift: OwnerShift): ShiftSnapshot {
  const all = bundle.sales.filter((s) => inShift(s.createdAt, shift));
  const selesai = all.filter((s) => s.status === "selesai");
  const voids = all.filter((s) => s.status === "void");
  const rets = bundle.returns.filter((r) => inShift(r.createdAt, shift));
  const exps = bundle.expenses.filter((e) => inShift(e.createdAt, shift));
  const byMethod = PAY_METHODS.map((method) => ({
    method,
    label: PAY_METHOD_LABEL[method],
    count: selesai.filter((s) => s.payments.some((p) => p.method === method && p.amount > 0)).length,
    total: selesai.reduce(
      (n, s) => n + s.payments.filter((p) => p.method === method).reduce((m, p) => m + p.amount, 0),
      0,
    ),
  }));
  const map = new Map<string, ShiftProductLine>();
  for (const s of selesai) {
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
  for (const r of rets) {
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
  const productsSold = [...map.values()]
    .filter((p) => p.qty !== 0 || p.total !== 0)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  const tunaiMasuk = byMethod.find((m) => m.method === "tunai")?.total ?? 0;
  const returTunai = rets.filter((r) => r.method === "tunai").reduce((n, r) => n + r.total, 0);
  const pengeluaran = exps.filter((e) => e.fund === "laci").reduce((n, e) => n + e.amount, 0);
  const expected = shift.kasAwal + expectedDrawer(bundle, shift.openedAt, shift.closedAt ?? undefined);
  return {
    shift,
    expected,
    byMethod,
    products: productsSold,
    notaCount: selesai.length,
    itemQty: productsSold.reduce((n, p) => n + p.qty, 0),
    omzet: selesai.reduce((n, s) => n + s.total, 0),
    voidTotal: voids.reduce((n, s) => n + s.total, 0),
    returTotal: rets.reduce((n, r) => n + r.total, 0),
    tunaiMasuk,
    returTunai,
    pengeluaran,
  };
}

function dayBeforeIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function cashBookNet(bundle: RawBundle, from: string, to: string): number {
  if (from > to) return 0;
  let n = 0;
  for (const s of bundle.sales) {
    if (inDayRange(s.createdAt, from, to)) n += saleCashIn(s);
    if (s.status === "void" && s.voidedAt && inDayRange(s.voidedAt, from, to)) n -= saleCashIn(s);
  }
  for (const r of bundle.returns) {
    if (inDayRange(r.createdAt, from, to)) n -= r.total;
  }
  for (const e of bundle.expenses) {
    if (inDayRange(e.createdAt, from, to)) n -= e.amount;
  }
  for (const f of bundle.memberFees) {
    if (inDayRange(f.createdAt, from, to)) n += f.amount;
  }
  return n;
}

function periodKasAwal(bundle: RawBundle, from: string, shiftKasAwal: number): number {
  const start = (bundle.settings.bookOpeningDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return shiftKasAwal;
  let opening = Math.max(0, Math.round(bundle.settings.bookOpening || 0));
  if (from > start) {
    const priorTo = dayBeforeIso(from);
    if (priorTo >= start) opening += cashBookNet(bundle, start, priorTo);
  }
  return opening;
}

function last7DaysOmzet(allSales: OwnerSale[]) {
  const days: { label: string; iso: string; tunai: number; non: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toLocaleDateString("en-CA", { timeZone: TZ });
    const label = d.toLocaleDateString("id-ID", { weekday: "short", timeZone: TZ });
    const of = allSales.filter((s) => s.status === "selesai" && dayOf(s.createdAt) === day);
    days.push({
      label,
      iso: day,
      tunai: of.filter((s) => s.method === "tunai").reduce((n, s) => n + s.total, 0),
      non: of.filter((s) => s.method !== "tunai").reduce((n, s) => n + s.total, 0),
    });
  }
  return days;
}

export async function ownerOverview() {
  const bundle = await loadBundle();
  const today = todayJakarta();
  const open = bundle.shifts.find((s) => s.status === "open") ?? null;
  const live = open ? shiftSnapshot(bundle, open) : null;
  const todaySales = bundle.sales.filter((s) => inDayRange(s.createdAt, today, today));
  const selesai = todaySales.filter((s) => s.status === "selesai");
  const voids = todaySales.filter((s) => s.status === "void");
  const todayRetur = bundle.returns.filter((r) => inDayRange(r.createdAt, today, today));
  const todayExp = bundle.expenses.filter((e) => inDayRange(e.createdAt, today, today));
  const payAmt = (method: PayMethod) =>
    selesai.reduce((n, s) => n + s.payments.filter((p) => p.method === method).reduce((m, p) => m + p.amount, 0), 0);
  const hpp = selesai.reduce((n, s) => n + s.items.reduce((m, it) => m + it.costPrice * it.qty, 0), 0);
  const penjualan = selesai.reduce((n, s) => n + s.total, 0);
  const beban = todayExp.filter((e) => e.category !== "pembelian").reduce((n, e) => n + e.amount, 0);
  const labaKotor = penjualan - hpp;
  const [empRows, attRows, stockRows] = await Promise.all([
    db.select().from(employees).orderBy(employees.name),
    db.select().from(attendances),
    db
      .select({
        id: products.id,
        barcode: products.barcode,
        name: products.name,
        unit: products.unit,
        stock: sql<number>`coalesce(sum(${stockEvents.qty}), 0)`,
        active: products.active,
      })
      .from(products)
      .leftJoin(stockEvents, eq(stockEvents.productId, products.id))
      .groupBy(products.id),
  ]);
  const attendance = empRows
    .filter((e) => e.active)
    .map((e) => {
      const inn = attRows.find((a) => a.employeeId === e.id && a.type === "in" && dayOf(a.createdAt) === today);
      const out = attRows.find((a) => a.employeeId === e.id && a.type === "out" && dayOf(a.createdAt) === today);
      return {
        id: e.id,
        name: e.name,
        jobRole: e.jobRole,
        inTime: inn ? isoReq(inn.createdAt) : null,
        outTime: out ? isoReq(out.createdAt) : null,
      };
    });
  const lowStock = stockRows
    .filter((p) => p.active && Number(p.stock) <= 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      unit: p.unit,
      stock: Number(p.stock),
    }))
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "id"))
    .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    store: {
      storeName: bundle.settings.storeName,
      address: bundle.settings.address,
      phone: bundle.settings.phone,
      logoDataUrl: bundle.settings.logoDataUrl,
    },
    shift: live
      ? {
          id: live.shift.id,
          cashierName: live.shift.cashierName,
          openedAt: live.shift.openedAt,
          kasAwal: live.shift.kasAwal,
          expected: live.expected,
          omzet: live.omzet,
          notaCount: live.notaCount,
          tunaiMasuk: live.tunaiMasuk,
          returTunai: live.returTunai,
          pengeluaran: live.pengeluaran,
          byMethod: live.byMethod,
        }
      : null,
    today: {
      omzet: penjualan,
      notaCount: selesai.length,
      voidCount: voids.length,
      returTotal: todayRetur.reduce((n, r) => n + r.total, 0),
      pengeluaran: todayExp.reduce((n, e) => n + e.amount, 0),
      labaKotor,
      labaBersih: labaKotor - beban,
      tunai: payAmt("tunai"),
      qris: payAmt("qris"),
      transfer: payAmt("transfer"),
      kartu: payAmt("kartu"),
    },
    recentSales: bundle.sales.slice(0, 12).map((s) => ({
      id: s.id,
      localNo: s.localNo,
      cashierName: s.cashierName,
      total: s.total,
      methodLabel: saleMethodLabel(s),
      status: s.status,
      createdAt: s.createdAt,
    })),
    attendance,
    lowStock,
    daily: last7DaysOmzet(bundle.sales),
  };
}

export async function ownerShifts() {
  const bundle = await loadBundle();
  return bundle.shifts.map((shift) => {
    const snap = shiftSnapshot(bundle, shift);
    return {
      shift,
      expected: shift.status === "closed" && shift.kasSistem != null ? shift.kasSistem : snap.expected,
      notaCount: snap.notaCount,
      omzet: snap.omzet,
      selisih: shift.selisih,
    };
  });
}

export async function ownerShiftDetail(id: string) {
  const bundle = await loadBundle();
  const shift = bundle.shifts.find((s) => s.id === id);
  if (!shift) return null;
  const snap = shiftSnapshot(bundle, shift);
  return {
    ...snap,
    sales: bundle.sales
      .filter((s) => inShift(s.createdAt, shift))
      .map((s) => ({
        id: s.id,
        localNo: s.localNo,
        cashierName: s.cashierName,
        total: s.total,
        methodLabel: saleMethodLabel(s),
        status: s.status,
        createdAt: s.createdAt,
      })),
  };
}

export async function ownerSales(from: string, to: string) {
  const bundle = await loadBundle();
  return bundle.sales
    .filter((s) => inDayRange(s.createdAt, from, to))
    .map((s) => ({
      ...s,
      methodLabel: saleMethodLabel(s),
    }));
}

export async function ownerSaleDetail(id: string) {
  const bundle = await loadBundle();
  const sale = bundle.sales.find((s) => s.id === id);
  if (!sale) return null;
  return { ...sale, methodLabel: saleMethodLabel(sale) };
}

export async function ownerReports(from: string, to: string) {
  const bundle = await loadBundle();
  const saleRows = bundle.sales.filter((s) => inDayRange(s.createdAt, from, to));
  const expRows = bundle.expenses.filter((e) => inDayRange(e.createdAt, from, to));
  const returDocs = bundle.returns.filter((r) => inDayRange(r.createdAt, from, to));
  const shifts = bundle.shifts.filter((s) => inDayRange(s.openedAt, from, to));

  const selesai = saleRows.filter((s) => s.status === "selesai");
  const voids = saleRows.filter((s) => s.status === "void");
  const hppOf = (list: OwnerSale[]) =>
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
    amount: expRows.filter((e) => e.category === c).reduce((n, e) => n + e.amount, 0),
  }));
  const pengeluaran = beban.reduce((n, b) => n + b.amount, 0);
  const labaKotor = pendapatanBersih - hppBersih;
  const labaBersih = labaKotor - pengeluaran;

  const mapped = saleRows.map((s) => ({
    method: s.method,
    total: s.total,
    status: s.status,
    hpp: s.items.reduce((n, it) => n + it.costPrice * it.qty, 0),
  }));
  const firstShift = [...shifts].sort((a, b) => a.openedAt.localeCompare(b.openedAt))[0];
  const kasAwal = periodKasAwal(bundle, from, firstShift?.kasAwal ?? 0);
  const payAmt = (list: OwnerSale[], method: PayMethod) =>
    list.reduce((n, s) => n + s.payments.filter((p) => p.method === method).reduce((m, p) => m + p.amount, 0), 0);
  const memberFees = bundle.memberFees.filter((f) => inDayRange(f.createdAt, from, to));
  const feeOf = (m: PayMethod) => memberFees.filter((f) => f.method === m).reduce((n, f) => n + f.amount, 0);
  const kas = arusKas(
    mapped,
    expRows.map((e) => ({ amount: e.amount })),
    [],
  );
  kas.tunaiMasuk = payAmt(selesai, "tunai") + feeOf("tunai");
  kas.qris = payAmt(selesai, "qris") + feeOf("qris");
  kas.transfer = payAmt(selesai, "transfer") + feeOf("transfer");
  kas.kartu = payAmt(selesai, "kartu") + feeOf("kartu");
  kas.nonTunai = kas.qris + kas.transfer + kas.kartu;
  const saleById = new Map(bundle.sales.map((s) => [s.id, s]));
  const tunaiRetur = returDocs.reduce((n, r) => n + tunaiOutForReturn(r.total, saleById.get(r.saleId) ?? null), 0);
  const allVoids = bundle.sales.filter((s) => s.status === "void" && s.voidedAt && inDayRange(s.voidedAt, from, to));
  const tunaiVoid = allVoids.reduce(
    (n, s) => n + s.payments.filter((p) => p.method === "tunai").reduce((m, p) => m + p.amount, 0),
    0,
  );
  const laciKeluar = expRows.filter((e) => e.fund === "laci").reduce((n, e) => n + e.amount, 0);
  kas.kasKeluar = laciKeluar;
  kas.kasLaci = kasAwal + kas.tunaiMasuk - tunaiRetur - tunaiVoid - laciKeluar;

  type Raw = { at: string; ket: string; debit: number; kredit: number };
  const raw: Raw[] = [];
  for (const s of saleRows) {
    const masuk = saleCashIn(s);
    if (masuk) {
      raw.push({
        at: s.createdAt,
        ket: `Penjualan: ${s.localNo} · ${saleMethodLabel(s)}`,
        debit: masuk,
        kredit: 0,
      });
    }
  }
  for (const s of allVoids) {
    const keluar = saleCashIn(s);
    if (keluar) {
      raw.push({
        at: s.voidedAt ?? s.createdAt,
        ket: `Void: ${s.localNo} · ${saleMethodLabel(s)}`,
        debit: 0,
        kredit: keluar,
      });
    }
  }
  for (const r of returDocs) {
    if (!r.total) continue;
    raw.push({
      at: r.createdAt,
      ket: `Retur: ${r.localNo} · ${PAY_METHOD_LABEL[r.method]}`,
      debit: 0,
      kredit: r.total,
    });
  }
  for (const e of expRows) {
    raw.push({
      at: e.createdAt,
      ket: `Pengeluaran: ${EXPENSE_LABEL[e.category]} · ${EXPENSE_FUND_LABEL[e.fund]}${e.note ? ` — ${e.note}` : ""}`,
      debit: 0,
      kredit: e.amount,
    });
  }
  for (const f of memberFees) {
    raw.push({
      at: f.createdAt,
      ket: `Pendaftaran member · ${PAY_METHOD_LABEL[f.method]}`,
      debit: f.amount,
      kredit: 0,
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
        tanggal: dayOf(e.at),
        ket: e.ket,
        debit: e.debit,
        kredit: e.kredit,
        saldo,
      };
    }),
  ];

  return {
    store: {
      storeName: bundle.settings.storeName,
      address: bundle.settings.address,
      phone: bundle.settings.phone,
      logoDataUrl: bundle.settings.logoDataUrl,
    },
    labaRugi: labaRugi(
      mapped,
      expRows.filter((e) => e.category !== "pembelian").map((e) => ({ amount: e.amount })),
    ),
    arusKas: kas,
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
    periodeDari: from,
    periodeSampai: to,
  };
}

export async function ownerStock(from: string, to: string) {
  const [prodRows, eventRows] = await Promise.all([
    db.select().from(products).orderBy(products.category, products.name),
    db.select({ productId: stockEvents.productId, qty: stockEvents.qty, createdAt: stockEvents.createdAt }).from(stockEvents),
  ]);
  const rows = prodRows.map((p) => {
    const ev = eventRows.filter((e) => e.productId === p.id);
    const awal = ev.filter((e) => dayOf(e.createdAt) < from).reduce((n, e) => n + Number(e.qty), 0);
    const period = ev.filter((e) => inDayRange(e.createdAt, from, to));
    const masuk = period.filter((e) => Number(e.qty) > 0).reduce((n, e) => n + Number(e.qty), 0);
    const keluar = period.filter((e) => Number(e.qty) < 0).reduce((n, e) => n + -Number(e.qty), 0);
    return {
      productId: p.id,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      category: p.category,
      active: p.active,
      buyPrice: p.buyPrice,
      sellPrice: p.sellPrice,
      awal,
      masuk,
      keluar,
      akhir: awal + masuk - keluar,
    };
  });
  const shown = rows.filter((r) => r.active);
  const totals = shown.reduce(
    (n, r) => ({
      awal: n.awal + r.awal,
      masuk: n.masuk + r.masuk,
      keluar: n.keluar + r.keluar,
      akhir: n.akhir + r.akhir,
    }),
    { awal: 0, masuk: 0, keluar: 0, akhir: 0 },
  );
  return { rows: shown, totals, periodeDari: from, periodeSampai: to };
}

export async function ownerExpenses(from: string, to: string) {
  const bundle = await loadBundle();
  return bundle.expenses.filter((e) => inDayRange(e.createdAt, from, to));
}

export async function ownerAttendance(day: string) {
  const [empRows, attRows] = await Promise.all([
    db.select().from(employees).orderBy(employees.name),
    db.select().from(attendances),
  ]);
  return empRows
    .filter((e) => e.active)
    .map((e) => {
      const inn = attRows.find((a) => a.employeeId === e.id && a.type === "in" && dayOf(a.createdAt) === day);
      const out = attRows.find((a) => a.employeeId === e.id && a.type === "out" && dayOf(a.createdAt) === day);
      return {
        id: e.id,
        name: e.name,
        jobRole: e.jobRole,
        inTime: inn ? isoReq(inn.createdAt) : null,
        outTime: out ? isoReq(out.createdAt) : null,
      };
    });
}

export async function ownerMembers() {
  const [custRows, saleRows, rewardRows] = await Promise.all([
    db.select().from(customers).orderBy(customers.name),
    db.select({ id: sales.id, customerId: sales.customerId, status: sales.status, total: sales.total }).from(sales),
    db.select().from(memberRewards),
  ]);
  return custRows
    .filter((c) => c.active)
    .map((c) => {
      const visits = saleRows.filter((s) => s.customerId === c.id && s.status === "selesai").length;
      const spent = saleRows
        .filter((s) => s.customerId === c.id && s.status === "selesai")
        .reduce((n, s) => n + s.total, 0);
      const rewards = rewardRows.filter((r) => r.customerId === c.id).length;
      const pending = Math.max(0, Math.floor(visits / MEMBER_VISIT_GOAL) - rewards);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        note: c.note,
        visits,
        spent,
        rewards,
        pending,
      };
    });
}

export async function ownerRestocks(from: string, to: string) {
  const [docs, items] = await Promise.all([
    db.select().from(stockIns).orderBy(desc(stockIns.createdAt)),
    db.select().from(stockInItems),
  ]);
  return docs
    .filter((d) => inDayRange(isoReq(d.createdAt), from, to))
    .map((d) => {
      const lines = items.filter((it) => it.stockInId === d.id);
      return {
        id: d.id,
        localNo: d.localNo,
        cashierName: d.cashierName,
        createdAt: isoReq(d.createdAt),
        itemCount: lines.length,
        qty: lines.reduce((n, it) => n + Number(it.qty), 0),
        nilai: lines.reduce((n, it) => n + Math.round(Number(it.qty) * it.buyPrice), 0),
      };
    });
}
