export function rp(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export function parseRupiah(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function formatRupiahInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
}

export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Tanggal kalender lokal dari ISO (bukan potongan UTC). */
export function localDayFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return todayIso(d);
}

export function monthStartIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function inIsoRange(iso: string, from: string, to: string) {
  const day = localDayFromIso(iso);
  return day >= from && day <= to;
}

export function formatQty(n: number): string {
  const r = Math.round((Number(n) || 0) * 1000) / 1000;
  if (Number.isInteger(r)) return String(r);
  return String(r).replace(".", ",");
}

export function parseQty(raw: string): number {
  const n = Number(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000) / 1000;
}

export function roundQty(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function formatDateId(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

export function localNo(prefix: string, seq: number, d = new Date()): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${prefix}-${yy}${mm}${dd}-${String(seq).padStart(4, "0")}`;
}

export function newId(): string {
  return crypto.randomUUID();
}

const PIN_PEPPER = "toko-sklamini-pin-v1";

export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${PIN_PEPPER}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const next = await hashPin(pin);
  return next === hash;
}

/** Barcode EAN/UPC umum: 8, 12, atau 13 digit. */
export function looksLikeCompleteBarcode(value: string): boolean {
  return /^\d{8}$|^\d{12}$|^\d{13}$/.test(value.trim());
}
