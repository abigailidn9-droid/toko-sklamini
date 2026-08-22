import { isTauriRuntime, tauriInvoke } from "./tauri.ts";

export type BtPrinter = { id: string; name: string };

type BluetoothLike = {
  getDevices?: () => Promise<Array<{ id: string; name?: string }>>;
  requestDevice: (opts: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }) => Promise<{ id: string; name?: string }>;
};

export function bluetoothSupported() {
  return Boolean(
    tauriInvoke() ||
      isTauriRuntime() ||
      (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth,
  );
}

function asPrinters(raw: unknown): BtPrinter[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = "id" in row ? String(row.id ?? "").trim() : "";
    const name = "name" in row ? String(row.name ?? "").trim() : "";
    if (id && name) map.set(id, name);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export async function scanBluetoothPrinters(): Promise<BtPrinter[]> {
  const invoke = tauriInvoke();
  if (invoke || isTauriRuntime()) {
    if (!invoke) {
      throw new Error("Aplikasi kasir belum siap memindai Bluetooth. Tutup lalu buka lagi.");
    }
    try {
      return asPrinters(await invoke("list_bluetooth_printers"));
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Gagal memindai Bluetooth";
      throw new Error(msg);
    }
  }

  const bt = (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth;
  if (!bt) {
    throw new Error("Pindai Bluetooth hanya di aplikasi kasir Windows. Pasangkan printer di Pengaturan Windows, lalu buka aplikasi kasir.");
  }

  const map = new Map<string, string>();
  try {
    const granted = (await bt.getDevices?.()) ?? [];
    for (const d of granted) map.set(d.id, d.name?.trim() || "Printer Bluetooth");
  } catch {
    /* getDevices hanya setelah izin sebelumnya */
  }

  try {
    const device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        "000018f0-0000-1000-8000-00805f9b34fb",
        "0000ff00-0000-1000-8000-00805f9b34fb",
        "battery_service",
        "device_information",
      ],
    });
    map.set(device.id, device.name?.trim() || "Printer Bluetooth");
  } catch (e) {
    if (map.size) return [...map.entries()].map(([id, name]) => ({ id, name }));
    const msg = e instanceof Error ? e.message : "Pemindaian dibatalkan";
    const cancelled = /cancel|abort|not found/i.test(msg);
    throw new Error(cancelled ? "Pemindaian dibatalkan" : msg);
  }

  return [...map.entries()].map(([id, name]) => ({ id, name }));
}
