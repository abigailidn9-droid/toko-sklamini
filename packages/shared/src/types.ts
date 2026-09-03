export const PAY_METHODS = ["tunai", "qris", "transfer", "kartu"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const USER_ROLES = ["owner", "kasir"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STOCK_EVENT_TYPES = [
  "sale",
  "sale_void",
  "return",
  "stock_in",
  "adjust",
] as const;
export type StockEventType = (typeof STOCK_EVENT_TYPES)[number];

export const SALE_STATUSES = ["selesai", "void"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "pembelian",
  "listrik",
  "sewa",
  "gaji",
  "atk",
  "lain",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_FUNDS = ["laci", "toko"] as const;
export type ExpenseFund = (typeof EXPENSE_FUNDS)[number];

export const PRODUCT_CATEGORIES = [
  "Hot Wheels",
  "Diecast",
  "Action Figure",
  "Building",
  "Kartu",
  "Boneka",
  "Kreatif",
  "Puzzle",
] as const;

/** Katalog dummy lama. Tidak diisi lagi; dipakai untuk menghapus sisa di kasir. */
export const SAMPLE_PRODUCTS = [
  { barcode: "899999900001", name: "Hot Wheels Basic Assortment" },
  { barcode: "8998866200112", name: "Hot Wheels Premium Car Culture" },
  { barcode: "899999900088", name: "Hot Wheels 5-Pack" },
  { barcode: "899999900102", name: "Hot Wheels Track Set Loop" },
  { barcode: "899999900115", name: "Hot Wheels Mystery Models" },
  { barcode: "8998866100470", name: "Tomica Regular" },
  { barcode: "8991008123456", name: "Matchbox Basic" },
  { barcode: "899999902001", name: "Mini GT 1:64" },
  { barcode: "899999902014", name: "Kartu Pokemon Booster" },
  { barcode: "8991002101234", name: "Pokemon Battle Figure" },
  { barcode: "899999903001", name: "Marvel Titan Hero" },
  { barcode: "899999903018", name: "LEGO Classic Creative" },
  { barcode: "899999903025", name: "LEGO Duplo My First" },
  { barcode: "899999904001", name: "Boneka Karakter 25cm" },
  { barcode: "899999904018", name: "Play-Doh 4 Pack" },
  { barcode: "899999904025", name: "Puzzle 100 pcs" },
] as const;

export type Product = {
  id: string;
  barcode: string;
  name: string;
  unit: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  active: boolean;
  updatedAt: string;
  stock: number;
};

export type CartLine = {
  productId: string;
  barcode: string;
  name: string;
  unit: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
};

export type SaleItem = {
  id: string;
  saleId: string;
  productId: string;
  barcode: string;
  name: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
};

export type SalePayment = {
  id: string;
  saleId: string;
  method: PayMethod;
  amount: number;
};

export type Sale = {
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
  items: SaleItem[];
  payments: SalePayment[];
};

export type CartSnapshot = {
  items: CartLine[];
  discount: number;
  deliveryCost: number;
  note: string;
};

export type Draft = {
  id: string;
  cashierId: string;
  cashierName: string;
  note: string;
  discount: number;
  deliveryCost: number;
  items: CartLine[];
  createdAt: string;
};

export type Expense = {
  id: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  fund: ExpenseFund;
  createdAt: string;
  cashierName: string;
};

export type StockInItem = {
  id: string;
  stockInId: string;
  productId: string;
  barcode: string;
  name: string;
  qty: number;
  buyPrice: number;
};

export type StockIn = {
  id: string;
  localNo: string;
  cashierId: string;
  cashierName: string;
  createdAt: string;
  items: StockInItem[];
};

export type Employee = {
  id: string;
  name: string;
  jobRole: string;
  active: boolean;
};

export const MEMBER_FEE = 0;
export const MEMBER_MIN_SPEND = 50_000;
export const MEMBER_VISIT_GOAL = 30;
export const MEMBER_REWARD_NAME = "Hot Wheels Premium";

export type Member = {
  id: string;
  name: string;
  phone: string;
  note: string;
  active: boolean;
  updatedAt: string;
};

export type MemberFee = {
  id: string;
  memberId: string;
  amount: number;
  method: PayMethod;
  createdAt: string;
  cashierId: string;
  cashierName: string;
};

export type MemberReward = {
  id: string;
  memberId: string;
  visits: number;
  createdAt: string;
  cashierId: string;
  cashierName: string;
};

export type Attendance = {
  id: string;
  employeeId: string;
  type: "in" | "out";
  createdAt: string;
};

export type CashShift = {
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

export type SaleReturnItem = {
  id: string;
  returnId: string;
  saleItemId: string;
  productId: string;
  barcode: string;
  name: string;
  qty: number;
  sellPrice: number;
  costPrice: number;
};

export type SaleReturn = {
  id: string;
  localNo: string;
  saleId: string;
  cashierId: string;
  cashierName: string;
  method: PayMethod;
  total: number;
  note: string;
  createdAt: string;
  items: SaleReturnItem[];
};

export type OpnameItem = {
  id: string;
  opnameId: string;
  productId: string;
  barcode: string;
  name: string;
  unit: string;
  sistem: number;
  fisik: number;
  selisih: number;
};

export type Opname = {
  id: string;
  localNo: string;
  cashierId: string;
  cashierName: string;
  note: string;
  createdAt: string;
  items: OpnameItem[];
};

export type StoreSettings = {
  storeName: string;
  address: string;
  phone: string;
  logoDataUrl: string;
  receiptFooter: string;
  printer58: string;
  printerA4: string;
  paperWidth: "58" | "80";
  autoPrint: "ask" | "58mm" | "A4" | "both" | "skip";
  printerConnection: "usb" | "bluetooth";
  printerBtId: string;
  printerBtName: string;
  printerWinName: string;
  scannerId: string;
  scannerName: string;
  ppnEnabled: boolean;
  ppnRate: number;
  apiUrl: string;
  apiToken: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  bookOpening: number;
  bookOpeningDate: string;
};

export type LabaRugi = {
  penjualan: number;
  hpp: number;
  labaKotor: number;
  pengeluaran: number;
  labaBersih: number;
};

export type ArusKas = {
  tunaiMasuk: number;
  qris: number;
  transfer: number;
  kartu: number;
  nonTunai: number;
  pengeluaran: number;
  restockTunai: number;
  kasKeluar: number;
  kasLaci: number;
};

export type SyncOutboxItem = {
  id: string;
  entity: string;
  payload: unknown;
  createdAt: string;
};

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "TOKO SKLAMINI",
  address: "Jl. Contoh No. 12, Jakarta",
  phone: "0812-0000-0000",
  logoDataUrl: "",
  receiptFooter: "Terima kasih telah berbelanja",
  printer58: "generic",
  printerA4: "a4",
  paperWidth: "58",
  autoPrint: "58mm",
  printerConnection: "usb",
  printerBtId: "",
  printerBtName: "",
  printerWinName: "",
  scannerId: "",
  scannerName: "",
  ppnEnabled: false,
  ppnRate: 11,
  apiUrl: "http://147.139.209.86:8787",
  apiToken: "sklamini-toko-7c4e91a2b8d3",
  bankName: "BCA",
  bankAccount: "1234567890",
  bankHolder: "TOKO SKLAMINI",
  bookOpening: 0,
  bookOpeningDate: "",
};

export function calcPpn(subtotal: number, discount: number, enabled: boolean, rate: number) {
  if (!enabled) return 0;
  const r = Math.min(100, Math.max(0, Number(rate) || 0));
  const base = Math.max(0, subtotal - discount);
  return Math.round((base * r) / 100);
}

export function ppnLabel(rate: number) {
  const r = Number(rate) || 0;
  if (!r) return "PPN";
  const n = Number.isInteger(r) ? String(r) : String(r);
  return `PPN ${n}%`;
}

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  kartu: "Kartu",
};

export function salePaymentsOf(sale: Pick<Sale, "method" | "total" | "payments">): SalePayment[] {
  if (sale.payments?.length) return sale.payments.filter((p) => p.amount > 0);
  return [
    {
      id: "",
      saleId: "",
      method: sale.method,
      amount: sale.total,
    },
  ];
}

export function saleMethodLabel(sale: Pick<Sale, "method" | "total" | "payments">): string {
  const methods = [...new Set(salePaymentsOf(sale).map((p) => p.method))];
  if (methods.length <= 1) return PAY_METHOD_LABEL[methods[0] ?? sale.method];
  return methods.map((m) => PAY_METHOD_LABEL[m]).join(" + ");
}

/** Faktor nilai barang setelah diskon+PPN, tanpa ongkir. */
export function merchandiseFactor(sale: { subtotal: number; discount: number; ppn: number }): number {
  if (sale.subtotal <= 0) return 1;
  return (sale.subtotal - sale.discount + sale.ppn) / sale.subtotal;
}

export function lineRefund(
  sale: { subtotal: number; discount: number; ppn: number },
  sellPrice: number,
  qty: number,
): number {
  return Math.round(sellPrice * qty * merchandiseFactor(sale));
}

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  pembelian: "Pembelian barang",
  listrik: "Listrik",
  sewa: "Sewa",
  gaji: "Gaji",
  atk: "ATK",
  lain: "Lain-lain",
};

export const EXPENSE_FUND_LABEL: Record<ExpenseFund, string> = {
  laci: "Laci kasir",
  toko: "Kas toko",
};

export function asExpenseFund(raw: unknown): ExpenseFund {
  return raw === "toko" ? "toko" : "laci";
}
