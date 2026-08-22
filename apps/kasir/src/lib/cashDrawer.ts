import type { StoreSettings } from "@sklamini/shared";
import { tauriInvoke } from "./tauri.ts";

export type WinPrinter = { name: string; default: boolean };

export function cashDrawerSupported() {
  return Boolean(tauriInvoke());
}

function asPrinters(raw: unknown): WinPrinter[] {
  if (!Array.isArray(raw)) return [];
  const out: WinPrinter[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = "name" in row ? String(row.name ?? "").trim() : "";
    if (!name) continue;
    out.push({
      name,
      default: "default" in row ? Boolean(row.default) : false,
    });
  }
  return out;
}

export async function listWindowsPrinters(): Promise<WinPrinter[]> {
  const invoke = tauriInvoke();
  if (!invoke) return [];
  return asPrinters(await invoke("list_windows_printers"));
}

export function drawerPrinterName(settings: StoreSettings) {
  const win = settings.printerWinName.trim();
  if (win) return win;
  if (settings.printerConnection === "bluetooth") return settings.printerBtName.trim();
  return "";
}

export async function openCashDrawer(settings: StoreSettings): Promise<void> {
  const invoke = tauriInvoke();
  if (!invoke) return;
  const printerName = drawerPrinterName(settings) || null;
  try {
    await invoke("open_cash_drawer", { printerName });
  } catch (e) {
    const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Gagal membuka laci kasir";
    throw new Error(msg);
  }
}
