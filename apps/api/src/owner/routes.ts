import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { eq } from "drizzle-orm";
import { hashPin } from "@sklamini/shared";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import {
  ownerAttendance,
  ownerExpenses,
  ownerMembers,
  ownerOverview,
  ownerReports,
  ownerRestocks,
  ownerSaleDetail,
  ownerSales,
  ownerShiftDetail,
  ownerShifts,
  ownerStock,
  todayJakarta,
} from "./data.ts";

const JWT_SECRET = process.env.JWT_SECRET ?? "ganti-dengan-rahasia-panjang";
const TOKEN_TTL = 60 * 60 * 24 * 7;

type OwnerToken = {
  sub: string;
  name: string;
  role: "owner";
  exp: number;
};

type OwnerEnv = { Variables: { owner: OwnerToken } };

function rangeFromQuery(from?: string, to?: string) {
  const today = todayJakarta();
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function isLogin(path: string, method: string) {
  return method === "POST" && path.replace(/\/+$/, "").endsWith("/login");
}

export const ownerApp = new Hono<OwnerEnv>();

ownerApp.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Gagal memuat data toko" }, 503);
});

ownerApp.use("*", async (c, next) => {
  if (isLogin(c.req.path, c.req.method)) return next();
  const hdr = c.req.header("authorization") ?? "";
  const sent = hdr.replace(/^Bearer\s+/i, "").trim();
  if (!sent) return c.json({ error: "Unauthorized" }, 401);
  try {
    const payload = (await verify(sent, JWT_SECRET, "HS256")) as OwnerToken;
    if (payload.role !== "owner" || !payload.sub) return c.json({ error: "Unauthorized" }, 401);
    c.set("owner", payload);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

ownerApp.post("/login", async (c) => {
  const body = await c.req.json<{ pin?: string }>().catch(() => ({ pin: "" }));
  const pin = String(body.pin ?? "");
  if (!/^\d{6}$/.test(pin)) return c.json({ error: "PIN salah" }, 401);
  try {
    const hash = await hashPin(pin);
    const [user] = await db.select().from(users).where(eq(users.pinHash, hash));
    if (!user || !user.active || user.role !== "owner") {
      return c.json({ error: "PIN salah" }, 401);
    }
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      { sub: user.id, name: user.name, role: "owner", exp: now + TOKEN_TTL } satisfies OwnerToken,
      JWT_SECRET,
      "HS256",
    );
    return c.json({
      token,
      user: { id: user.id, name: user.name, role: "owner" as const },
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Server toko tidak siap" }, 503);
  }
});

ownerApp.get("/me", (c) => {
  const payload = c.get("owner");
  return c.json({ user: { id: payload.sub, name: payload.name, role: "owner" as const } });
});

ownerApp.get("/overview", async (c) => c.json(await ownerOverview()));

ownerApp.get("/shifts", async (c) => c.json(await ownerShifts()));

ownerApp.get("/shifts/:id", async (c) => {
  const row = await ownerShiftDetail(c.req.param("id"));
  if (!row) return c.json({ error: "Sesi tidak ditemukan" }, 404);
  return c.json(row);
});

ownerApp.get("/sales", async (c) => {
  const { from, to } = rangeFromQuery(c.req.query("from"), c.req.query("to"));
  return c.json(await ownerSales(from, to));
});

ownerApp.get("/sales/:id", async (c) => {
  const row = await ownerSaleDetail(c.req.param("id"));
  if (!row) return c.json({ error: "Nota tidak ditemukan" }, 404);
  return c.json(row);
});

ownerApp.get("/reports", async (c) => {
  const { from, to } = rangeFromQuery(c.req.query("from"), c.req.query("to"));
  return c.json(await ownerReports(from, to));
});

ownerApp.get("/stock", async (c) => {
  const { from, to } = rangeFromQuery(c.req.query("from"), c.req.query("to"));
  return c.json(await ownerStock(from, to));
});

ownerApp.get("/expenses", async (c) => {
  const { from, to } = rangeFromQuery(c.req.query("from"), c.req.query("to"));
  return c.json(await ownerExpenses(from, to));
});

ownerApp.get("/attendance", async (c) => {
  const day = c.req.query("date");
  const when = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayJakarta();
  return c.json(await ownerAttendance(when));
});

ownerApp.get("/members", async (c) => c.json(await ownerMembers()));

ownerApp.get("/restocks", async (c) => {
  const { from, to } = rangeFromQuery(c.req.query("from"), c.req.query("to"));
  return c.json(await ownerRestocks(from, to));
});
