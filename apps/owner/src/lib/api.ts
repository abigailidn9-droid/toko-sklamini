import { DEFAULT_SETTINGS, type PayMethod, type SaleStatus } from "@sklamini/shared";

const SESSION_KEY = "sklamini.owner";

export type OwnerUser = { id: string; name: string; role: "owner" };
export type OwnerSession = { token: string; user: OwnerUser };

function apiBase(): string {
  const fromEnv = String(import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "";
  return DEFAULT_SETTINGS.apiUrl.replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function loadSession(): OwnerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OwnerSession;
    if (!parsed?.token || parsed.user?.role !== "owner") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: OwnerSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function api<T>(path: string, opts?: RequestInit & { token?: string | null }): Promise<T> {
  const token = opts?.token !== undefined ? opts.token : loadSession()?.token;
  const headers = new Headers(opts?.headers);
  if (opts?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${apiBase()}${path}`, { ...opts, headers });
  if (res.status === 401) {
    clearSession();
    throw new ApiError(401, "Sesi berakhir");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "Gagal memuat");
  }
  return res.json() as Promise<T>;
}

export async function loginOwner(pin: string) {
  return api<{ token: string; user: OwnerUser }>("/v1/owner/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
    token: null,
  });
}

export type Overview = {
  generatedAt: string;
  store: { storeName: string; address: string; phone: string; logoDataUrl: string };
  shift: null | {
    id: string;
    cashierName: string;
    openedAt: string;
    kasAwal: number;
    expected: number;
    omzet: number;
    notaCount: number;
    tunaiMasuk: number;
    returTunai: number;
    pengeluaran: number;
    byMethod: { method: PayMethod; label: string; count: number; total: number }[];
  };
  today: {
    omzet: number;
    notaCount: number;
    voidCount: number;
    returTotal: number;
    pengeluaran: number;
    labaKotor: number;
    labaBersih: number;
    tunai: number;
    qris: number;
    transfer: number;
    kartu: number;
  };
  recentSales: {
    id: string;
    localNo: string;
    cashierName: string;
    total: number;
    methodLabel: string;
    status: SaleStatus;
    createdAt: string;
  }[];
  attendance: { id: string; name: string; jobRole: string; inTime: string | null; outTime: string | null }[];
  lowStock: { id: string; name: string; barcode: string; unit: string; stock: number }[];
  daily: { label: string; iso: string; tunai: number; non: number }[];
};

export type ShiftListItem = {
  shift: {
    id: string;
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
  expected: number;
  notaCount: number;
  omzet: number;
  selisih: number | null;
};

export type ShiftDetail = {
  shift: ShiftListItem["shift"];
  expected: number;
  byMethod: { method: PayMethod; label: string; count: number; total: number }[];
  products: { productId: string; name: string; barcode: string; qty: number; total: number }[];
  notaCount: number;
  itemQty: number;
  omzet: number;
  voidTotal: number;
  returTotal: number;
  tunaiMasuk: number;
  returTunai: number;
  pengeluaran: number;
  sales: Overview["recentSales"];
};

export type SaleRow = {
  id: string;
  localNo: string;
  cashierName: string;
  total: number;
  discount: number;
  status: SaleStatus;
  createdAt: string;
  methodLabel: string;
  items: { id: string; name: string; qty: number; sellPrice: number }[];
  payments: { method: PayMethod; amount: number }[];
};

export type ReportData = {
  store: Overview["store"];
  rincian: {
    penjualanKotor: number;
    retur: number;
    pendapatanBersih: number;
    hppKotor: number;
    hppRetur: number;
    hppBersih: number;
    labaKotor: number;
    beban: { key: string; label: string; amount: number }[];
    pengeluaran: number;
    labaBersih: number;
  };
  bukuKas: { no: number | null; tanggal: string; ket: string; debit: number; kredit: number; saldo: number }[];
};

export type StockData = {
  rows: {
    productId: string;
    barcode: string;
    name: string;
    unit: string;
    category: string;
    awal: number;
    masuk: number;
    keluar: number;
    akhir: number;
  }[];
  totals: { awal: number; masuk: number; keluar: number; akhir: number };
};

export type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  note: string;
  fund: string;
  createdAt: string;
  cashierName: string;
};

export type AttendanceRow = {
  id: string;
  name: string;
  jobRole: string;
  inTime: string | null;
  outTime: string | null;
};

export type MemberRow = {
  id: string;
  name: string;
  phone: string;
  note: string;
  visits: number;
  spent: number;
  rewards: number;
  pending: number;
};

export type RestockRow = {
  id: string;
  localNo: string;
  cashierName: string;
  createdAt: string;
  itemCount: number;
  qty: number;
  nilai: number;
};

export const fetchOverview = () => api<Overview>("/v1/owner/overview");
export const fetchShifts = () => api<ShiftListItem[]>("/v1/owner/shifts");
export const fetchShift = (id: string) => api<ShiftDetail>(`/v1/owner/shifts/${id}`);
export const fetchSales = (from: string, to: string) =>
  api<SaleRow[]>(`/v1/owner/sales?from=${from}&to=${to}`);
export const fetchSale = (id: string) => api<SaleRow>(`/v1/owner/sales/${id}`);
export const fetchReports = (from: string, to: string) =>
  api<ReportData>(`/v1/owner/reports?from=${from}&to=${to}`);
export const fetchStock = (from: string, to: string) =>
  api<StockData>(`/v1/owner/stock?from=${from}&to=${to}`);
export const fetchExpenses = (from: string, to: string) =>
  api<ExpenseRow[]>(`/v1/owner/expenses?from=${from}&to=${to}`);
export const fetchAttendance = (date: string) => api<AttendanceRow[]>(`/v1/owner/attendance?date=${date}`);
export const fetchMembers = () => api<MemberRow[]>("/v1/owner/members");
export const fetchRestocks = (from: string, to: string) =>
  api<RestockRow[]>(`/v1/owner/restocks?from=${from}&to=${to}`);
