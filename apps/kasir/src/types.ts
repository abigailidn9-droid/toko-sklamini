export type Page =
  | "kasir"
  | "kas"
  | "draft"
  | "riwayat"
  | "retur"
  | "produk"
  | "restock"
  | "opname"
  | "pengeluaran"
  | "pelanggan"
  | "absen"
  | "laporan"
  | "pengaturan";

export const NAV: { id: Page; label: string; ownerOnly: boolean }[] = [
  { id: "kasir", label: "Kasir", ownerOnly: false },
  { id: "kas", label: "Settlement", ownerOnly: false },
  { id: "draft", label: "Draft", ownerOnly: false },
  { id: "riwayat", label: "Riwayat", ownerOnly: false },
  { id: "retur", label: "Retur", ownerOnly: false },
  { id: "restock", label: "Restock", ownerOnly: false },
  { id: "opname", label: "Opname", ownerOnly: false },
  { id: "produk", label: "Produk", ownerOnly: true },
  { id: "pengeluaran", label: "Pengeluaran", ownerOnly: true },
  { id: "pelanggan", label: "Pelanggan", ownerOnly: false },
  { id: "absen", label: "Absen", ownerOnly: false },
  { id: "laporan", label: "Laporan", ownerOnly: true },
  { id: "pengaturan", label: "Pengaturan", ownerOnly: true },
];

const NEW_PAGES: Page[] = ["pelanggan"];

export function defaultMenus(role: "owner" | "kasir"): Page[] {
  if (role === "owner") return NAV.map((n) => n.id);
  return NAV.filter((n) => !n.ownerOnly).map((n) => n.id);
}

export function parseMenus(raw: string | null | undefined, role: "owner" | "kasir"): Page[] {
  const fallback = defaultMenus(role);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const allowed = new Set(NAV.map((n) => n.id));
    const menus = parsed.filter((id): id is Page => typeof id === "string" && allowed.has(id as Page));
    if (!menus.length) return fallback;
    const extras = NEW_PAGES.filter((id) => fallback.includes(id) && !menus.includes(id));
    const selected = new Set([...menus, ...extras]);
    return NAV.map((n) => n.id).filter((id) => selected.has(id));
  } catch {
    return fallback;
  }
}
