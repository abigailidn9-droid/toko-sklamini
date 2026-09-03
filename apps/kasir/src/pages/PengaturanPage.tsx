import { useEffect, useMemo, useRef, useState } from "react";
import type { StoreSettings, UserRole } from "@sklamini/shared";
import { bluetoothSupported, scanBluetoothPrinters, type BtPrinter } from "../lib/bluetoothPrinters.ts";
import { cashDrawerSupported, listWindowsPrinters, openCashDrawer, type WinPrinter } from "../lib/cashDrawer.ts";
import { persistNow, exportBackup, importBackup } from "../lib/db.ts";
import { printTestStruk } from "../lib/print.ts";
import {
  RESET_KIND_LABEL,
  RESET_KINDS,
  findProductByBarcode,
  listUsers,
  ownerPinOk,
  resetLocalData,
  saveSettings,
  upsertUser,
  type ResetKind,
  type Session,
} from "../lib/repo.ts";
import { syncNow } from "../lib/sync.ts";
import { listScanners, scannerKindLabel, scannersSupported, type WinScanner } from "../lib/scanners.ts";
import { scanBeep } from "../lib/beep.ts";
import { useScanFocus } from "../lib/useScanFocus.ts";
import { NAV, defaultMenus, type Page } from "../types.ts";
import { Button, Field, H2, PinDots, PinPad, Select, Text } from "../ui/primitives.tsx";
import { PageHeader } from "../components/PageHeader.tsx";
import { useToast } from "../ui/toast.tsx";

type Section = "identitas" | "struk" | "printer" | "scanner" | "pembayaran" | "pajak" | "pengguna" | "data";

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: "identitas", label: "Identitas toko", hint: "Nama, alamat, dan logo di struk serta laporan." },
  { id: "struk", label: "Struk & nota", hint: "Tulisan di bawah total struk dan nota." },
  { id: "printer", label: "Printer", hint: "Sambungan, kertas, dan laci kasir." },
  { id: "scanner", label: "Scanner", hint: "Pilih perangkat, lalu uji scan di kolom ini." },
  { id: "pembayaran", label: "Pembayaran", hint: "Rekening hanya untuk pembayaran transfer." },
  { id: "pajak", label: "PPN", hint: "Ditambah di keranjang, struk, dan nota." },
  { id: "pengguna", label: "Pengguna & PIN", hint: "Setiap user punya PIN dan menu sendiri." },
  { id: "data", label: "Data", hint: "Backup, pulihkan, dan reset data toko." },
];

async function fileToLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal membaca gambar"));
      el.src = url;
    });
    const max = 256;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const mime = file.type.includes("png") ? "image/png" : "image/jpeg";
    return canvas.toDataURL(mime, 0.84);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PengaturanPage({
  settings,
  session,
  onSave,
  onSessionChange,
}: {
  settings: StoreSettings;
  session: Session;
  onSave: (s: StoreSettings) => void;
  onSessionChange: (s: Session) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [section, setSection] = useState<Section>("identitas");

  useEffect(() => setForm(settings), [settings]);

  function set<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    saveSettings(form);
    onSave(form);
    toast.show("Pengaturan tersimpan", "ok", "Perubahan sudah dipakai di kasir.");
  }

  async function restore(file: File) {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      await importBackup(buf);
      toast.show("Backup dipulihkan", "ok", "Aplikasi akan dimuat ulang.");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      toast.show("Gagal pulihkan", "error", e instanceof Error ? e.message : "File tidak valid.");
    }
  }

  async function backup() {
    const bytes = await exportBackup();
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sklamini-${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    toast.show("Backup diunduh", "ok", "Simpan file SQLite di tempat aman.");
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="settings-wrap">
      <PageHeader page="pengaturan" title="Pengaturan" hint={current.hint}>
        {section !== "pengguna" && section !== "data" ? (
          <Button variant="primary" onClick={save}>
            Simpan
          </Button>
        ) : null}
      </PageHeader>
      <div className="settings-page">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-btn ${section === s.id ? "on" : ""}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <section className="settings-panel">
          <div className="settings-panel-body">
          {section === "identitas" ? (
            <div className="settings-card">
              <div className="logo-pick">
                {form.logoDataUrl ? (
                  <img src={form.logoDataUrl} alt="Logo toko" />
                ) : (
                  <div className="logo-empty">Logo</div>
                )}
                <div className="logo-actions">
                  <div className="row">
                    <label className="logo-file">
                      Pilih gambar
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            set("logoDataUrl", await fileToLogo(file));
                          } catch {
                            toast.show("Gagal membaca logo", "error", "Gunakan file PNG atau JPG.");
                          }
                        }}
                      />
                    </label>
                    {form.logoDataUrl ? (
                      <Button onClick={() => set("logoDataUrl", "")}>Hapus</Button>
                    ) : null}
                  </div>
                  <span>PNG atau JPG. Tampil di header, struk, dan laporan.</span>
                </div>
              </div>
              <label className="field-label">
                <span>Nama toko</span>
                <Field value={form.storeName} onChange={(e) => set("storeName", e.target.value)} />
              </label>
              <div className="settings-addr">
                <label className="field-label">
                  <span>Alamat</span>
                  <Field value={form.address} onChange={(e) => set("address", e.target.value)} />
                </label>
                <label className="field-label">
                  <span>Telepon</span>
                  <Field value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}
          {section === "struk" ? (
            <div className="settings-card">
              <label className="field-label">
                <span>Footer struk / nota</span>
                <Field
                  value={form.receiptFooter}
                  onChange={(e) => set("receiptFooter", e.target.value)}
                  placeholder="Terima kasih telah berbelanja"
                />
              </label>
            </div>
          ) : null}
          {section === "printer" ? <PrinterPanel form={form} set={set} /> : null}
          {section === "scanner" ? <ScannerPanel form={form} set={set} /> : null}
          {section === "pembayaran" ? (
            <div className="settings-card">
              <label className="field-label">
                <span>Bank</span>
                <Field value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
              </label>
              <div className="settings-addr">
                <label className="field-label">
                  <span>Nomor rekening</span>
                  <Field value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
                </label>
                <label className="field-label">
                  <span>Atas nama</span>
                  <Field value={form.bankHolder} onChange={(e) => set("bankHolder", e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}
          {section === "pajak" ? (
            <div className="settings-card">
              <div className="switch-row">
                <div>
                  <b>PPN</b>
                  <span>Masuk ke keranjang, struk, dan nota</span>
                </div>
                <button
                  type="button"
                  className={`switch ${form.ppnEnabled ? "on" : ""}`}
                  role="switch"
                  aria-checked={form.ppnEnabled}
                  onClick={() => set("ppnEnabled", !form.ppnEnabled)}
                >
                  <span />
                </button>
              </div>
              <label className="field-label settings-narrow">
                <span>Tarif (%)</span>
                <Field
                  inputMode="decimal"
                  value={String(form.ppnRate)}
                  disabled={!form.ppnEnabled}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(",", "."));
                    set("ppnRate", Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
                  }}
                />
              </label>
              <p className="settings-note">
                Harga katalog belum termasuk PPN. Dihitung dari subtotal setelah diskon, sebelum ongkir.
              </p>
            </div>
          ) : null}
          {section === "pengguna" ? (
            <UsersSection session={session} onSessionChange={onSessionChange} />
          ) : null}
          {section === "data" ? (
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-data">
                  <div>
                    <b>Backup database</b>
                    <span>Unduh salinan SQLite dari komputer ini.</span>
                  </div>
                  <Button onClick={() => void backup()}>Unduh backup</Button>
                </div>
                <div className="settings-data">
                  <div>
                    <b>Pulihkan backup</b>
                    <span>Ganti data kasir ini dengan file SQLite. Tidak bisa dibatalkan.</span>
                  </div>
                  <label className="logo-file">
                    Pilih file
                    <input
                      type="file"
                      accept=".sqlite,.db,application/octet-stream"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void restore(file);
                      }}
                    />
                  </label>
                </div>
              </div>
              <DataResetCard />
            </div>
          ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function ScannerPanel({
  form,
  set,
}: {
  form: StoreSettings;
  set: <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => void;
}) {
  const toast = useToast();
  const [devices, setDevices] = useState<WinScanner[]>([]);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState("");
  const { ref: scanRef, focus: focusScan } = useScanFocus(true, { restoreOnWindowFocus: true });

  async function refresh(showToast = false) {
    setBusy(true);
    try {
      const rows = await listScanners();
      setDevices(rows);
      if (showToast) {
        if (!rows.length) {
          toast.show(
            "Tidak ada scanner",
            "info",
            scannersSupported()
              ? "Colok scanner USB, atau pasangkan scanner Bluetooth di Windows, lalu pindai lagi."
              : "Buka aplikasi kasir Windows agar perangkat terdeteksi.",
          );
        } else {
          toast.show(`${rows.length} perangkat ditemukan`, "ok", "Pilih scanner, lalu Simpan.");
        }
      }
    } catch (e) {
      toast.show("Gagal memindai scanner", "error", e instanceof Error ? e.message : "Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh(false);
  }, []);

  function pick(id: string) {
    const hit = devices.find((d) => d.id === id);
    set("scannerId", id);
    set("scannerName", hit?.name ?? form.scannerName);
  }

  return (
    <div className="settings-card">
      <div className="settings-split">
        <label className="field-label">
          <span>Scanner barcode</span>
          <Select value={form.scannerId} onChange={(e) => pick(e.target.value)}>
            <option value="">Pilih scanner</option>
            {form.scannerId && !devices.some((d) => d.id === form.scannerId) ? (
              <option value={form.scannerId}>{form.scannerName || form.scannerId}</option>
            ) : null}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {scannerKindLabel(d.kind) ? `${d.name} (${scannerKindLabel(d.kind)})` : d.name}
              </option>
            ))}
          </Select>
        </label>
        <Button disabled={busy} onClick={() => void refresh(true)}>
          {busy ? "Memindai…" : "Pindai perangkat"}
        </Button>
      </div>
      <label className="field-label">
        <span>Uji scan</span>
        <Field
          ref={scanRef}
          value={test}
          placeholder="Arahkan scanner ke kolom ini"
          onChange={(e) => {
            const v = e.target.value;
            const hit = findProductByBarcode(v.trim());
            if (hit) {
              scanBeep();
              setTest("");
              toast.show(hit.name, "ok", `${hit.barcode} ketemu`);
              focusScan(true);
              return;
            }
            setTest(v);
          }}
        />
      </label>
      <p className="settings-note">
        Scan langsung masuk di Kasir dan Restock, tanpa Enter.
        {scannersSupported()
          ? " USB dan Bluetooth yang sudah dipasangkan di Windows ikut terdaftar."
          : " Daftar perangkat hanya di aplikasi Windows."}
      </p>
    </div>
  );
}

function PrinterPanel({
  form,
  set,
}: {
  form: StoreSettings;
  set: <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => void;
}) {
  const toast = useToast();
  const [found, setFound] = useState<BtPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [winPrinters, setWinPrinters] = useState<WinPrinter[]>([]);
  const [testingDrawer, setTestingDrawer] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const bt = form.printerConnection === "bluetooth";

  useEffect(() => {
    let alive = true;
    void listWindowsPrinters()
      .then((rows) => {
        if (alive) setWinPrinters(rows);
      })
      .catch(() => {
        if (alive) setWinPrinters([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function scan(showToast = true) {
    setScanning(true);
    try {
      const rows = await scanBluetoothPrinters();
      setFound(rows);
      if (!showToast) return;
      if (!rows.length) {
        toast.show(
          "Tidak ada printer Bluetooth",
          "info",
          "Pasangkan printer di Pengaturan Windows → Bluetooth, nyalakan printer, lalu pindai lagi dari aplikasi kasir.",
        );
        return;
      }
      toast.show(`${rows.length} perangkat ditemukan`, "ok", "Pilih printer dari daftar, lalu Simpan.");
    } catch (e) {
      if (showToast) {
        toast.show("Gagal memindai", "error", e instanceof Error ? e.message : "Coba lagi.");
      }
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (bt) void scan(false);
  }, [bt]);

  function pick(p: BtPrinter) {
    set("printerBtId", p.id);
    set("printerBtName", p.name);
    if (p.id.startsWith("prn:")) set("printerWinName", p.name);
  }

  async function testPrint() {
    setTestingPrint(true);
    try {
      const ok = await printTestStruk(form);
      if (ok) {
        toast.show("Struk tes terkirim", "ok", "Cek printer thermal. Pastikan logo toko sudah diunggah di Identitas.");
      } else {
        toast.show(
          "Gagal cetak tes",
          "error",
          "Pilih printer thermal di Printer Windows, lalu coba lagi.",
        );
      }
    } catch (e) {
      toast.show("Gagal cetak tes", "error", e instanceof Error ? e.message : "Coba pilih printer, lalu Simpan.");
    } finally {
      setTestingPrint(false);
    }
  }

  async function testDrawer() {
    setTestingDrawer(true);
    try {
      await openCashDrawer(form);
      toast.show("Perintah laci terkirim", "ok", "Laci kasir harus terbuka jika kabel RJ11 terpasang ke printer struk.");
    } catch (e) {
      toast.show("Gagal membuka laci", "error", e instanceof Error ? e.message : "Coba pilih printer Windows, lalu Simpan.");
    } finally {
      setTestingDrawer(false);
    }
  }

  return (
    <div className="settings-card wide">
      <label className="field-label">
        <span>Sambungan</span>
        <div className="conn-seg" role="group" aria-label="Sambungan printer">
          <button
            type="button"
            className={form.printerConnection === "usb" ? "on" : ""}
            onClick={() => set("printerConnection", "usb")}
          >
            USB
          </button>
          <button type="button" className={bt ? "on" : ""} onClick={() => set("printerConnection", "bluetooth")}>
            Bluetooth
          </button>
        </div>
      </label>

      {bt ? (
        <div className="bt-box">
          <div className="row wrap">
            <div className="grow">
              <Text small tone="secondary">
                {form.printerBtName
                  ? `Terpilih: ${form.printerBtName}`
                  : "Belum ada printer Bluetooth yang dipilih."}
              </Text>
            </div>
            <Button variant="primary" disabled={scanning} onClick={() => void scan()}>
              {scanning ? "Memindai…" : "Pindai printer"}
            </Button>
          </div>
          <p className="settings-note">
            {!bluetoothSupported()
              ? "Pindai Bluetooth hanya di aplikasi kasir Windows. Pasangkan printer di Pengaturan Windows, lalu buka aplikasi kasir."
              : "Pasangkan printer di Pengaturan Windows, pastikan menyala, lalu pindai."}
          </p>
          {found.length ? (
            <div className="bt-list">
              {found.map((p) => {
                const on = form.printerBtId === p.id;
                return (
                  <button key={p.id} type="button" className={`bt-item ${on ? "on" : ""}`} onClick={() => pick(p)}>
                    <b>{p.name}</b>
                    <span>{on ? "Dipilih" : "Pilih"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-2">
        <label className="field-label">
          <span>Printer Windows</span>
          <Select value={form.printerWinName} onChange={(e) => set("printerWinName", e.target.value)}>
            <option value="">Printer default Windows</option>
            {form.printerWinName && !winPrinters.some((p) => p.name === form.printerWinName) ? (
              <option value={form.printerWinName}>{form.printerWinName}</option>
            ) : null}
            {winPrinters.map((p) => (
              <option key={p.name} value={p.name}>
                {p.default ? `${p.name} (default)` : p.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="field-label">
          <span>Lebar kertas</span>
          <Select
            value={form.paperWidth}
            onChange={(e) => set("paperWidth", e.target.value as StoreSettings["paperWidth"])}
          >
            <option value="58">58 mm</option>
            <option value="80">80 mm</option>
          </Select>
        </label>
      </div>
      <label className="field-label">
        <span>Setelah transaksi</span>
        <Select
          value={form.autoPrint}
          onChange={(e) => set("autoPrint", e.target.value as StoreSettings["autoPrint"])}
        >
          <option value="58mm">Cetak struk langsung</option>
          <option value="A4">Cetak nota A4</option>
          <option value="both">Struk dan nota</option>
          <option value="skip">Jangan cetak</option>
        </Select>
      </label>
      <div className="row wrap">
        <Button variant="primary" disabled={testingPrint} onClick={() => void testPrint()}>
          {testingPrint ? "Mencetak…" : "Uji cetak struk"}
        </Button>
        <Button disabled={testingDrawer} onClick={() => void testDrawer()}>
          {testingDrawer ? "Mengirim…" : "Uji buka laci"}
        </Button>
      </div>
      <p className="settings-note">
        Struk 58mm dikirim langsung ke printer thermal, tanpa jendela cetak Windows.
        Pilih printer di atas. Laci kasir terbuka otomatis lewat printer struk (kabel RJ11).
        {!cashDrawerSupported() ? " Buka aplikasi Windows agar perintah laci dan cetak langsung terkirim." : ""}
      </p>
    </div>
  );
}

function UsersSection({
  session,
  onSessionChange,
}: {
  session: Session;
  onSessionChange: (s: Session) => void;
}) {
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const users = useMemo(() => listUsers(), [tick]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("kasir");
  const [pin, setPin] = useState("");
  const [menus, setMenus] = useState<Page[]>(defaultMenus("kasir"));
  const [active, setActive] = useState(true);
  const [err, setErr] = useState("");

  function startNew() {
    setEditingId(null);
    setName("");
    setRole("kasir");
    setPin("");
    setMenus(defaultMenus("kasir"));
    setActive(true);
    setErr("");
    setOpen(true);
  }

  function startEdit(id: string) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    setEditingId(u.id);
    setName(u.name);
    setRole(u.role);
    setPin("");
    setMenus(u.menus);
    setActive(u.active);
    setErr("");
    setOpen(true);
  }

  function toggleMenu(id: Page) {
    setMenus((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function saveUser() {
    const res = await upsertUser({
      id: editingId ?? undefined,
      name,
      role,
      pin: pin.trim() || undefined,
      menus,
      active,
    });
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setOpen(false);
    setTick((n) => n + 1);
    toast.show(editingId ? "User diperbarui" : "User ditambahkan", "ok");
    if (res.user.id === session.id) {
      onSessionChange({
        id: res.user.id,
        name: res.user.name,
        role: res.user.role,
        menus: res.user.menus,
      });
    }
  }

  return (
    <div className="settings-card wide settings-users">
      <div className="settings-card-head">
        <div>
          <b>Daftar user</b>
          <span>Klik baris untuk mengubah PIN atau menu.</span>
        </div>
        <Button variant="primary" onClick={startNew}>
          Tambah user
        </Button>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Peran</th>
            <th>PIN</th>
            <th>Menu</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="clickable striped" onClick={() => startEdit(u.id)}>
              <td>
                <b>{u.name}</b>
                {u.id === session.id ? <span className="faint"> · Anda</span> : null}
              </td>
              <td>{u.role === "owner" ? "Owner" : "Kasir"}</td>
              <td className="tabular pin-cell">••••••</td>
              <td>{u.menus.map((id) => NAV.find((n) => n.id === id)?.label).filter(Boolean).join(", ")}</td>
              <td>
                <span className={`status-pill ${u.active ? "ok" : "wait"}`}>{u.active ? "Aktif" : "Nonaktif"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 480 }}>
            <div className="stack">
              <div className="row">
                <H2>{editingId ? "Ubah user" : "Tambah user"}</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Tutup
                </Button>
              </div>
              <label className="field-label">
                <span>Nama</span>
                <Field value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="grid grid-2">
                <label className="field-label">
                  <span>Peran</span>
                  <Select
                    value={role}
                    onChange={(e) => {
                      const next = e.target.value as UserRole;
                      setRole(next);
                      if (!editingId) setMenus(defaultMenus(next));
                    }}
                  >
                    <option value="kasir">Kasir</option>
                    <option value="owner">Owner</option>
                  </Select>
                </label>
                <label className="field-label">
                  <span>PIN 6 digit</span>
                  <Field
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    placeholder={editingId ? "Kosongkan jika tidak diubah" : "000000"}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </label>
              </div>
              <label className="field-label">
                <span>Status</span>
                <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </Select>
              </label>
              <label className="field-label">
                <span>Menu yang bisa diakses</span>
                <div className="settings-menus">
                  {NAV.map((n) => {
                    const on = menus.includes(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={`menu-check ${on ? "on" : ""}`}
                        onClick={() => toggleMenu(n.id)}
                      >
                        {n.label}
                      </button>
                    );
                  })}
                </div>
              </label>
              {err ? (
                <p className="muted" style={{ color: "var(--danger)", margin: 0 }}>
                  {err}
                </p>
              ) : null}
              <Button variant="primary" onClick={() => void saveUser()}>
                Simpan user
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const RESET_OPTIONS: { id: ResetKind; hint: string }[] = [
  { id: "transaksi", hint: "Nota, retur, draft, dan settlement. Stok dari penjualan dikembalikan." },
  { id: "produk", hint: "Katalog, restock, dan opname." },
  { id: "member", hint: "Daftar member dan hadiah." },
  { id: "pengeluaran", hint: "Catatan pengeluaran toko." },
  { id: "absen", hint: "Catatan masuk/pulang. Daftar karyawan tetap ada." },
];

function DataResetCard() {
  const toast = useToast();
  const [picked, setPicked] = useState<ResetKind[]>([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const locking = useRef(false);

  const allOn = picked.length === RESET_KINDS.length;

  function toggle(kind: ResetKind) {
    setPicked((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
  }

  function closePin() {
    locking.current = false;
    setPinOpen(false);
    setPin("");
    setBad(false);
  }

  async function confirm(current: string) {
    if (current.length !== 6 || locking.current || busy) return;
    locking.current = true;
    const ok = await ownerPinOk(current);
    if (!ok) {
      locking.current = false;
      setBad(true);
      setPin("");
      toast.show("PIN owner salah", "error", "Reset dibatalkan.");
      return;
    }
    setBusy(true);
    const res = resetLocalData(picked);
    if (!res.ok) {
      setBusy(false);
      locking.current = false;
      toast.show("Tidak terhapus", "error", res.error);
      closePin();
      return;
    }
    await persistNow();
    void syncNow();
    toast.show("Data direset", "ok", res.labels.join(", "));
    window.setTimeout(() => window.location.reload(), 500);
  }

  useEffect(() => {
    if (!pinOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setBad(false);
        setPin((p) => (p.length >= 6 ? p : p + e.key));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePin();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinOpen]);

  useEffect(() => {
    if (!pinOpen || pin.length !== 6) return;
    void confirm(pin);
  }, [pin, pinOpen]);

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <b>Reset data</b>
            <span>Hapus data terpilih dari kasir ini. Tidak bisa dibatalkan. Backup dulu.</span>
          </div>
        </div>
        <div className="reset-opts">
          <button type="button" className="reset-all" onClick={() => setPicked(allOn ? [] : [...RESET_KINDS])}>
            {allOn ? "Hapus semua pilihan" : "Pilih semua"}
          </button>
          {RESET_OPTIONS.map((opt) => {
            const on = picked.includes(opt.id);
            return (
              <label key={opt.id} className={`reset-opt${on ? " on" : ""}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(opt.id)} />
                <span>
                  <b>{RESET_KIND_LABEL[opt.id]}</b>
                  <span>{opt.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <Button
          variant="danger"
          disabled={!picked.length || busy}
          onClick={() => {
            setPin("");
            setBad(false);
            setPinOpen(true);
          }}
        >
          Reset data terpilih
        </Button>
      </div>
      {pinOpen ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <div className="modal pin-modal">
            <div className="stack">
              <div className="row">
                <H2>Reset data</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={closePin} disabled={busy}>
                  Tutup
                </Button>
              </div>
              <Text tone="secondary">
                Masukkan PIN owner. Akan dihapus: {picked.map((k) => RESET_KIND_LABEL[k]).join(", ")}.
              </Text>
              <PinDots length={pin.length} />
              {bad ? (
                <p className="muted" style={{ color: "var(--danger)", margin: 0 }}>
                  PIN owner salah.
                </p>
              ) : null}
              <PinPad
                onDigit={(d) => {
                  if (busy) return;
                  setBad(false);
                  setPin((p) => (p.length >= 6 ? p : p + d));
                }}
                onClear={() => {
                  setPin("");
                  setBad(false);
                }}
                onBack={() => setPin((p) => p.slice(0, -1))}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
