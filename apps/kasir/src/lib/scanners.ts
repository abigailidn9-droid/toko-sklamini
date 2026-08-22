import { tauriInvoke } from "./tauri.ts";

export type WinScanner = { id: string; name: string; kind: "usb" | "com" | "bluetooth" | string };

export function scannersSupported() {
  return Boolean(tauriInvoke());
}

function asScanners(raw: unknown): WinScanner[] {
  if (!Array.isArray(raw)) return [];
  const out: WinScanner[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = "id" in row ? String(row.id ?? "").trim() : "";
    const name = "name" in row ? String(row.name ?? "").trim() : "";
    if (!id || !name) continue;
    const kind = "kind" in row ? String(row.kind ?? "usb") : "usb";
    out.push({ id, name, kind });
  }
  return out;
}

export async function listScanners(): Promise<WinScanner[]> {
  const invoke = tauriInvoke();
  if (!invoke) return [];
  return asScanners(await invoke("list_scanners"));
}

export function scannerKindLabel(kind: string) {
  if (kind === "com") return "COM";
  if (kind === "bluetooth") return "Bluetooth";
  return "";
}
