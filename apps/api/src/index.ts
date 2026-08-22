import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { hashPin, labaRugi, arusKas, type PayMethod } from "@sklamini/shared";
import { eq, gte, sql } from "drizzle-orm";
import { db } from "./db/index.ts";
import {
  attendances,
  cashShifts,
  customerPayments,
  customers,
  employees,
  expenses,
  opnameItems,
  opnames,
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
  users,
} from "./db/schema.ts";

const app = new Hono();
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
app.use("*", cors({ origin: corsOrigin === "*" ? "*" : corsOrigin.split(",").map((s) => s.trim()) }));

const API_TOKEN = process.env.API_TOKEN ?? "";

app.use("/v1/*", async (c, next) => {
  if (!API_TOKEN) return next();
  const hdr = c.req.header("authorization") ?? "";
  const sent = hdr.replace(/^Bearer\s+/i, "").trim();
  if (sent !== API_TOKEN) return c.json({ error: "Unauthorized" }, 401);
  return next();
});

app.get("/health", (c) => c.json({ ok: true, name: "TOKO SKLAMINI API" }));

app.post("/v1/auth/login", async (c) => {
  const body = await c.req.json<{ pin?: string }>().catch(() => ({ pin: "" }));
  const pin = String(body.pin ?? "");
  const hash = await hashPin(pin);
  const [user] = await db.select().from(users).where(eq(users.pinHash, hash));
  if (!user || !user.active) {
    return c.json({ error: "PIN salah" }, 401);
  }
  return c.json({
    token: `local.${user.id}`,
    user: { id: user.id, name: user.name, role: user.role },
  });
});

app.get("/v1/sync/pull", async (c) => {
  const since = c.req.query("since") ?? "1970-01-01T00:00:00.000Z";
  const sinceDate = new Date(since);
  const [prod, ev, usr, emp, set, cust] = await Promise.all([
    db.select().from(products).where(gte(products.updatedAt, sinceDate)),
    db.select().from(stockEvents).where(gte(stockEvents.createdAt, sinceDate)),
    db.select().from(users).where(gte(users.updatedAt, sinceDate)),
    db.select().from(employees).where(gte(employees.updatedAt, sinceDate)),
    db.select().from(settings),
    db.select().from(customers).where(gte(customers.updatedAt, sinceDate)),
  ]);
  return c.json({
    cursor: new Date().toISOString(),
    products: prod,
    stockEvents: ev,
    users: usr,
    employees: emp,
    settings: set,
    customers: cust,
  });
});

app.post("/v1/sync/push", async (c) => {
  const body = await c.req.json<{
    deviceId?: string;
    items?: { id: string; entity: string; payload: Record<string, unknown> }[];
  }>();
  const accepted: string[] = [];
  for (const item of body.items ?? []) {
    try {
      await applyItem(item.entity, item.payload);
      accepted.push(item.id);
    } catch (err) {
      console.error("sync item", item.id, err);
    }
  }
  return c.json({ accepted });
});

async function applyItem(entity: string, payload: Record<string, unknown>) {
  const asDate = (v: unknown) => new Date(String(v ?? new Date().toISOString()));
  if (entity === "sale") {
    const sale = payload.sale as Record<string, unknown>;
    const items = payload.items as Record<string, unknown>[];
    const events = payload.events as Record<string, unknown>[];
    const payments = payload.payments as Record<string, unknown>[] | undefined;
    await db
      .insert(sales)
      .values({
        id: String(sale.id),
        localNo: String(sale.localNo),
        cashierId: String(sale.cashierId),
        cashierName: String(sale.cashierName),
        customerId: sale.customerId ? String(sale.customerId) : null,
        method: String(sale.method),
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        deliveryCost: Number(sale.deliveryCost ?? 0),
        ppn: Number(sale.ppn ?? 0),
        ppnRate: Number(sale.ppnRate ?? 0),
        note: String(sale.note ?? ""),
        total: Number(sale.total),
        paid: Number(sale.paid),
        changeAmount: Number(sale.changeAmount),
        status: String(sale.status),
        createdAt: asDate(sale.createdAt),
        voidedAt: sale.voidedAt ? asDate(sale.voidedAt) : null,
      })
      .onConflictDoNothing();
    if (items?.length) {
      await db
        .insert(saleItems)
        .values(
          items.map((it) => ({
            id: String(it.id),
            saleId: String(it.saleId),
            productId: String(it.productId),
            barcode: String(it.barcode),
            name: String(it.name),
            qty: Number(it.qty),
            sellPrice: Number(it.sellPrice),
            costPrice: Number(it.costPrice),
          })),
        )
        .onConflictDoNothing();
    }
    if (payments?.length) {
      await db
        .insert(salePayments)
        .values(
          payments.map((p) => ({
            id: String(p.id),
            saleId: String(p.saleId),
            method: String(p.method),
            amount: Number(p.amount),
          })),
        )
        .onConflictDoNothing();
    }
    if (events?.length) {
      await db
        .insert(stockEvents)
        .values(
          events.map((e) => ({
            id: String(e.id),
            productId: String(e.productId),
            type: String(e.type),
            qty: Number(e.qty),
            refId: e.refId == null ? null : String(e.refId),
            deviceId: String(e.deviceId),
            createdAt: asDate(e.createdAt),
          })),
        )
        .onConflictDoNothing();
    }
    return;
  }
  if (entity === "sale_void") {
    const id = String(payload.id);
    await db
      .update(sales)
      .set({ status: "void", voidedAt: payload.voidedAt ? asDate(payload.voidedAt) : new Date() })
      .where(eq(sales.id, id));
    const events = payload.events as Record<string, unknown>[];
    if (events?.length) {
      await db
        .insert(stockEvents)
        .values(
          events.map((e) => ({
            id: String(e.id),
            productId: String(e.productId),
            type: String(e.type),
            qty: Number(e.qty),
            refId: e.refId == null ? null : String(e.refId),
            deviceId: String(e.deviceId),
            createdAt: asDate(e.createdAt),
          })),
        )
        .onConflictDoNothing();
    }
    return;
  }
  if (entity === "product") {
    const p = payload;
    await db
      .insert(products)
      .values({
        id: String(p.id),
        barcode: String(p.barcode),
        name: String(p.name),
        unit: String(p.unit),
        category: String(p.category),
        buyPrice: Number(p.buyPrice),
        sellPrice: Number(p.sellPrice),
        active: p.active !== false,
        updatedAt: asDate(p.updatedAt),
      })
      .onConflictDoUpdate({
        target: products.id,
        set: {
          barcode: String(p.barcode),
          name: String(p.name),
          unit: String(p.unit),
          category: String(p.category),
          buyPrice: Number(p.buyPrice),
          sellPrice: Number(p.sellPrice),
          active: p.active !== false,
          updatedAt: asDate(p.updatedAt),
        },
      });
    return;
  }
  if (entity === "expense") {
    await db
      .insert(expenses)
      .values({
        id: String(payload.id),
        category: String(payload.category),
        amount: Number(payload.amount),
        note: String(payload.note ?? ""),
        createdAt: asDate(payload.createdAt),
        cashierName: String(payload.cashierName ?? ""),
      })
      .onConflictDoNothing();
    return;
  }
  if (entity === "stock_in") {
    const doc = payload.doc as Record<string, unknown>;
    const items = payload.items as Record<string, unknown>[];
    const events = payload.events as Record<string, unknown>[];
    await db
      .insert(stockIns)
      .values({
        id: String(doc.id),
        localNo: String(doc.localNo),
        cashierId: String(doc.cashierId),
        cashierName: String(doc.cashierName),
        createdAt: asDate(doc.createdAt),
      })
      .onConflictDoNothing();
    if (items?.length) {
      await db
        .insert(stockInItems)
        .values(
          items.map((it) => ({
            id: String(it.id),
            stockInId: String(it.stockInId),
            productId: String(it.productId),
            barcode: String(it.barcode),
            name: String(it.name),
            qty: Number(it.qty),
            buyPrice: Number(it.buyPrice),
          })),
        )
        .onConflictDoNothing();
    }
    if (events?.length) {
      await db
        .insert(stockEvents)
        .values(
          events.map((e) => ({
            id: String(e.id),
            productId: String(e.productId),
            type: String(e.type),
            qty: Number(e.qty),
            refId: e.refId == null ? null : String(e.refId),
            deviceId: String(e.deviceId),
            createdAt: asDate(e.createdAt),
          })),
        )
        .onConflictDoNothing();
    }
    return;
  }
  if (entity === "stock_in_delete") {
    const id = String(payload.id);
    await db.delete(stockEvents).where(eq(stockEvents.refId, id));
    await db.delete(stockInItems).where(eq(stockInItems.stockInId, id));
    await db.delete(stockIns).where(eq(stockIns.id, id));
    return;
  }
  if (entity === "attendance") {
    await db
      .insert(attendances)
      .values({
        id: String(payload.id),
        employeeId: String(payload.employeeId),
        type: String(payload.type),
        createdAt: asDate(payload.createdAt),
      })
      .onConflictDoNothing();
    return;
  }
  if (entity === "user") {
    await db
      .update(users)
      .set({
        name: String(payload.name),
        role: String(payload.role ?? "kasir"),
        active: payload.active !== false,
        updatedAt: asDate(payload.updatedAt),
      })
      .where(eq(users.id, String(payload.id)));
    return;
  }
  if (entity === "employee" || entity === "employee_delete") {
    if (entity === "employee_delete") {
      await db.delete(attendances).where(eq(attendances.employeeId, String(payload.id)));
      await db.delete(employees).where(eq(employees.id, String(payload.id)));
      return;
    }
    await db
      .insert(employees)
      .values({
        id: String(payload.id),
        name: String(payload.name),
        jobRole: String(payload.jobRole ?? ""),
        pinHash: String(payload.pinHash ?? "x"),
        active: payload.active !== false,
        updatedAt: asDate(payload.updatedAt),
      })
      .onConflictDoUpdate({
        target: employees.id,
        set: {
          name: String(payload.name),
          jobRole: String(payload.jobRole ?? ""),
          active: payload.active !== false,
          updatedAt: asDate(payload.updatedAt),
        },
      });
    return;
  }
  if (entity === "customer") {
    await db
      .insert(customers)
      .values({
        id: String(payload.id),
        name: String(payload.name),
        phone: String(payload.phone ?? ""),
        note: String(payload.note ?? ""),
        active: payload.active !== false,
        updatedAt: asDate(payload.updatedAt),
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: String(payload.name),
          phone: String(payload.phone ?? ""),
          note: String(payload.note ?? ""),
          active: payload.active !== false,
          updatedAt: asDate(payload.updatedAt),
        },
      });
    return;
  }
  if (entity === "customer_payment") {
    await db
      .insert(customerPayments)
      .values({
        id: String(payload.id),
        customerId: String(payload.customerId),
        amount: Number(payload.amount),
        method: String(payload.method),
        note: String(payload.note ?? ""),
        createdAt: asDate(payload.createdAt),
        cashierId: String(payload.cashierId),
        cashierName: String(payload.cashierName),
      })
      .onConflictDoNothing();
    return;
  }
  if (entity === "cash_shift") {
    await db
      .insert(cashShifts)
      .values({
        id: String(payload.id),
        cashierId: String(payload.cashierId),
        cashierName: String(payload.cashierName),
        openedAt: asDate(payload.openedAt),
        closedAt: payload.closedAt ? asDate(payload.closedAt) : null,
        kasAwal: Number(payload.kasAwal),
        kasHitung: payload.kasHitung == null ? null : Number(payload.kasHitung),
        kasSistem: payload.kasSistem == null ? null : Number(payload.kasSistem),
        selisih: payload.selisih == null ? null : Number(payload.selisih),
        note: String(payload.note ?? ""),
        status: String(payload.status),
      })
      .onConflictDoUpdate({
        target: cashShifts.id,
        set: {
          closedAt: payload.closedAt ? asDate(payload.closedAt) : null,
          kasHitung: payload.kasHitung == null ? null : Number(payload.kasHitung),
          kasSistem: payload.kasSistem == null ? null : Number(payload.kasSistem),
          selisih: payload.selisih == null ? null : Number(payload.selisih),
          note: String(payload.note ?? ""),
          status: String(payload.status),
        },
      });
    return;
  }
  if (entity === "sale_return") {
    const doc = payload.doc as Record<string, unknown>;
    const items = payload.items as Record<string, unknown>[];
    const events = payload.events as Record<string, unknown>[];
    await db
      .insert(returns)
      .values({
        id: String(doc.id),
        localNo: String(doc.localNo),
        saleId: String(doc.saleId),
        cashierId: String(doc.cashierId),
        cashierName: String(doc.cashierName),
        method: String(doc.method),
        total: Number(doc.total),
        note: String(doc.note ?? ""),
        createdAt: asDate(doc.createdAt),
      })
      .onConflictDoNothing();
    if (items?.length) {
      await db
        .insert(returnItems)
        .values(
          items.map((it) => ({
            id: String(it.id),
            returnId: String(it.returnId),
            saleItemId: String(it.saleItemId),
            productId: String(it.productId),
            barcode: String(it.barcode),
            name: String(it.name),
            qty: Number(it.qty),
            sellPrice: Number(it.sellPrice),
            costPrice: Number(it.costPrice),
          })),
        )
        .onConflictDoNothing();
    }
    if (events?.length) {
      await db
        .insert(stockEvents)
        .values(
          events.map((e) => ({
            id: String(e.id),
            productId: String(e.productId),
            type: String(e.type),
            qty: Number(e.qty),
            refId: e.refId == null ? null : String(e.refId),
            deviceId: String(e.deviceId),
            createdAt: asDate(e.createdAt),
          })),
        )
        .onConflictDoNothing();
    }
    return;
  }
  if (entity === "opname") {
    const doc = payload.doc as Record<string, unknown>;
    const items = payload.items as Record<string, unknown>[];
    const events = payload.events as Record<string, unknown>[];
    await db
      .insert(opnames)
      .values({
        id: String(doc.id),
        localNo: String(doc.localNo),
        cashierId: String(doc.cashierId),
        cashierName: String(doc.cashierName),
        note: String(doc.note ?? ""),
        createdAt: asDate(doc.createdAt),
      })
      .onConflictDoNothing();
    if (items?.length) {
      await db
        .insert(opnameItems)
        .values(
          items.map((it) => ({
            id: String(it.id),
            opnameId: String(it.opnameId),
            productId: String(it.productId),
            barcode: String(it.barcode),
            name: String(it.name),
            unit: String(it.unit),
            sistem: Number(it.sistem),
            fisik: Number(it.fisik),
            selisih: Number(it.selisih),
          })),
        )
        .onConflictDoNothing();
    }
    if (events?.length) {
      await db
        .insert(stockEvents)
        .values(
          events.map((e) => ({
            id: String(e.id),
            productId: String(e.productId),
            type: String(e.type),
            qty: Number(e.qty),
            refId: e.refId == null ? null : String(e.refId),
            deviceId: String(e.deviceId),
            createdAt: asDate(e.createdAt),
          })),
        )
        .onConflictDoNothing();
    }
    return;
  }
  if (entity === "settings") {
    await db
      .insert(settings)
      .values({ key: "store", value: JSON.stringify(payload.value ?? payload) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(payload.value ?? payload) } });
    return;
  }
  throw new Error(`Entity tidak dikenali: ${entity}`);
}

app.get("/v1/reports/summary", async (c) => {
  const from = c.req.query("from") ?? "1970-01-01";
  const saleRows = await db
    .select()
    .from(sales)
    .where(gte(sales.createdAt, new Date(from)));
  const items = await db.select().from(saleItems);
  const hppBySale = new Map<string, number>();
  for (const it of items) {
    hppBySale.set(it.saleId, (hppBySale.get(it.saleId) ?? 0) + it.costPrice * it.qty);
  }
  const exp = await db.select().from(expenses).where(gte(expenses.createdAt, new Date(from)));
  const lr = labaRugi(
    saleRows.map((s) => ({
      method: s.method as PayMethod,
      total: s.total,
      status: s.status as "selesai" | "void",
      hpp: hppBySale.get(s.id) ?? 0,
    })),
    exp.filter((e) => e.category !== "pembelian").map((e) => ({ amount: e.amount })),
  );
  const kas = arusKas(
    saleRows.map((s) => ({
      method: s.method as PayMethod,
      total: s.total,
      status: s.status as "selesai" | "void",
      hpp: hppBySale.get(s.id) ?? 0,
    })),
    exp.map((e) => ({ amount: e.amount })),
    [],
  );
  return c.json({ labaRugi: lr, arusKas: kas });
});

app.get("/v1/stock", async (c) => {
  const rows = await db.execute(sql`
    SELECT p.id, COALESCE(SUM(e.qty), 0)::int AS stock
    FROM products p
    LEFT JOIN stock_events e ON e.product_id = p.id
    GROUP BY p.id
  `);
  return c.json(rows);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API TOKO SKLAMINI di http://127.0.0.1:${port}`);
});
