import { tauriInvoke } from "./tauri.ts";

type SqlValue = string | number | null | Uint8Array;
type SqlJsDatabase = {
  run: (sql: string, params?: SqlValue[]) => void;
  prepare: (sql: string) => {
    bind: (params: SqlValue[]) => void;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  export: () => Uint8Array;
};
type SqlJsStatic = { Database: new (data?: ArrayLike<number>) => SqlJsDatabase };

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
  }
}

const IDB_NAME = "sklamini";
const IDB_STORE = "kv";
const DB_KEY = "kasir.sqlite";

let SQL: SqlJsStatic | null = null;
let db: SqlJsDatabase | null = null;
let persistTimer: number | null = null;
let persistHooked = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.initSqlJs === "function") {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Gagal memuat mesin SQLite"));
    document.head.appendChild(el);
  });
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadBytesIdb(): Promise<Uint8Array | null> {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveBytesIdb(bytes: Uint8Array): Promise<void> {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(raw: string): Uint8Array {
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadBytesDisk(): Promise<Uint8Array | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  try {
    const raw = await invoke("load_sqlite");
    if (typeof raw !== "string" || !raw) return null;
    return base64ToBytes(raw);
  } catch {
    return null;
  }
}

async function saveBytesDisk(bytes: Uint8Array): Promise<void> {
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    await invoke("save_sqlite", { data: bytesToBase64(bytes) });
  } catch {
    /* IndexedDB tetap jadi cadangan */
  }
}

async function loadBytes(): Promise<Uint8Array | null> {
  const disk = await loadBytesDisk();
  if (disk?.length) return disk;
  return loadBytesIdb();
}

async function saveBytes(bytes: Uint8Array): Promise<void> {
  await Promise.all([saveBytesIdb(bytes), saveBytesDisk(bytes)]);
}

function hookPersist() {
  if (persistHooked) return;
  persistHooked = true;
  window.addEventListener("beforeunload", () => {
    if (!db) return;
    void persistNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void persistNow();
  });
}

export async function openDb(): Promise<SqlJsDatabase> {
  if (db) return db;
  await loadScript("/sql-wasm.js");
  const init = window.initSqlJs;
  if (!init) throw new Error("SQLite tidak tersedia di browser ini");
  SQL ??= await init({ locateFile: (file) => `/${file}` });
  const bytes = await loadBytes();
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  const { SCHEMA_SQL } = await import("./schema.ts");
  db.run(SCHEMA_SQL);
  migrateSchema(db);
  hookPersist();
  await persistNow();
  return db;
}

function tableCols(database: SqlJsDatabase, table: string): string[] {
  const stmt = database.prepare(`PRAGMA table_info(${table})`);
  const cols: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name?: string };
    if (row.name) cols.push(row.name);
  }
  stmt.free();
  return cols;
}

function addCol(database: SqlJsDatabase, table: string, col: string, ddl: string) {
  if (!tableCols(database, table).includes(col)) {
    database.run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function migrateSchema(database: SqlJsDatabase) {
  const users = tableCols(database, "users");
  if (!users.includes("menus")) {
    database.run(`ALTER TABLE users ADD COLUMN menus TEXT NOT NULL DEFAULT ''`);
  }
  if (!users.includes("pin")) {
    database.run(`ALTER TABLE users ADD COLUMN pin TEXT NOT NULL DEFAULT ''`);
  }
  addCol(database, "sales", "delivery_cost", "delivery_cost INTEGER NOT NULL DEFAULT 0");
  addCol(database, "sales", "note", "note TEXT NOT NULL DEFAULT ''");
  addCol(database, "sales", "ppn", "ppn INTEGER NOT NULL DEFAULT 0");
  addCol(database, "sales", "ppn_rate", "ppn_rate REAL NOT NULL DEFAULT 0");
  addCol(database, "sales", "customer_id", "customer_id TEXT");
  addCol(database, "sales", "voided_at", "voided_at TEXT");
  database.run(`UPDATE users SET pin = '' WHERE pin IS NOT NULL AND pin != ''`);
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error("Database belum siap");
  return db;
}

export async function persistNow(): Promise<void> {
  if (!db) return;
  await saveBytes(db.export());
}

export function persistSoon(): void {
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void persistNow();
  }, 80);
}

export function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as SqlValue[]);
  persistSoon();
}

export function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  stmt.bind(params as SqlValue[]);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function one<T>(sql: string, params: unknown[] = []): T | null {
  return all<T>(sql, params)[0] ?? null;
}

export function tx(fn: () => void): void {
  const database = getDb();
  database.run("BEGIN");
  try {
    fn();
    database.run("COMMIT");
    persistSoon();
  } catch (err) {
    database.run("ROLLBACK");
    throw err;
  }
}

export async function exportBackup(): Promise<Uint8Array> {
  await persistNow();
  return getDb().export();
}

export async function importBackup(bytes: Uint8Array): Promise<void> {
  if (!SQL) {
    await loadScript("/sql-wasm.js");
    const init = window.initSqlJs;
    if (!init) throw new Error("SQLite tidak tersedia");
    SQL = await init({ locateFile: (file) => `/${file}` });
  }
  const next = new SQL.Database(bytes);
  const probe = next.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sales'`);
  const ok = probe.step();
  probe.free();
  if (!ok) {
    next.run("SELECT 1");
    throw new Error("File bukan backup kasir SKLAMINI");
  }
  const { SCHEMA_SQL } = await import("./schema.ts");
  next.run(SCHEMA_SQL);
  migrateSchema(next);
  db = next;
  await persistNow();
}
