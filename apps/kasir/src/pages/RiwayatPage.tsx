import { useMemo, useState } from "react";
import {
  formatDateId,
  inIsoRange,
  monthStartIso,
  ppnLabel,
  rp,
  saleMethodLabel,
  todayIso,
  type Sale,
} from "@sklamini/shared";
import { Button, Callout, Field, H2, PinDots, PinPad, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { getSale, listSales, ownerPinOk, voidSale } from "../lib/repo.ts";
import { printNota, printStruk, saleChange } from "../lib/print.ts";
import type { StoreSettings } from "@sklamini/shared";
import { useToast } from "../ui/toast.tsx";
import { useScanFocus } from "../lib/useScanFocus.ts";

type RangeMode = "hari" | "7hari" | "bulan" | "custom";

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayIso(d);
}

function rangeOf(mode: RangeMode, from: string, to: string) {
  const today = todayIso();
  if (mode === "hari") return { from: today, to: today };
  if (mode === "7hari") return { from: daysAgoIso(6), to: today };
  if (mode === "bulan") return { from: monthStartIso(), to: today };
  return from <= to ? { from, to } : { from: to, to: from };
}

function statusLabel(s: Sale["status"]) {
  return s === "void" ? "Dibatalkan" : "Selesai";
}

function saleMatches(sale: Sale, raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (sale.localNo.toLowerCase().includes(q)) return true;
  return sale.items.some(
    (it) => it.name.toLowerCase().includes(q) || it.barcode.toLowerCase().includes(q),
  );
}

export function RiwayatPage({
  settings,
  tick,
  onChange,
  onRetur,
}: {
  settings: StoreSettings;
  tick: number;
  onChange: () => void;
  onRetur: (saleId: string) => void;
}) {
  const [mode, setMode] = useState<RangeMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(() => rangeOf(mode, customFrom, customTo), [mode, customFrom, customTo]);
  const [q, setQ] = useState("");
  const [cari, setCari] = useState("");
  const sales = useMemo(() => {
    const all = listSales("all");
    if (cari.trim()) return all.filter((s) => saleMatches(s, cari));
    return all.filter((s) => inIsoRange(s.createdAt, range.from, range.to));
  }, [tick, range, cari]);
  const shown = sales;
  const [openId, setOpenId] = useState<string | null>(null);
  const sale = openId ? getSale(openId) : null;
  const { ref: scanRef } = useScanFocus(!openId);
  const omzet = shown.filter((s) => s.status === "selesai").reduce((n, s) => n + s.total, 0);
  const searching = Boolean(cari.trim());
  const multiDay = searching || range.from !== range.to;
  const periode = searching
    ? `Pencarian “${cari.trim()}”`
    : range.from === range.to
      ? formatDateId(range.from)
      : `${formatDateId(range.from)} – ${formatDateId(range.to)}`;

  return (
    <PageShell
      page="riwayat"
      title="Riwayat transaksi"
      hint="Nota penjualan per periode."
      actions={
        <>
          <div className="tabs">
            <button className={`tab ${mode === "hari" ? "on" : ""}`} type="button" onClick={() => setMode("hari")}>
              Hari ini
            </button>
            <button className={`tab ${mode === "7hari" ? "on" : ""}`} type="button" onClick={() => setMode("7hari")}>
              7 hari
            </button>
            <button className={`tab ${mode === "bulan" ? "on" : ""}`} type="button" onClick={() => setMode("bulan")}>
              Bulan ini
            </button>
            <button
              className={`tab ${mode === "custom" ? "on" : ""}`}
              type="button"
              onClick={() => {
                setCustomFrom(range.from);
                setCustomTo(range.to);
                setMode("custom");
              }}
            >
              Custom
            </button>
          </div>
          {mode === "custom" ? (
            <div className="period-range">
              <input
                className="field"
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value || todayIso())}
              />
              <span>s.d.</span>
              <input
                className="field"
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value || todayIso())}
              />
            </div>
          ) : null}
        </>
      }
    >
      <div className="riwayat-toolbar">
        <div className="pay-total">
          <span>Omzet · {periode}</span>
          <b className="tabular">{rp(omzet)}</b>
        </div>
        <form
          className="riwayat-search"
          onSubmit={(e) => {
            e.preventDefault();
            setCari(q);
          }}
        >
          <Field
            ref={scanRef}
            value={q}
            placeholder="Nomor nota atau nama produk…"
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="primary">
            Cari
          </Button>
          {cari ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ("");
                setCari("");
              }}
            >
              Reset
            </Button>
          ) : null}
        </form>
      </div>
      {shown.length === 0 ? (
        <Callout title={searching ? "Tidak ketemu" : "Belum ada transaksi"}>
          {searching
            ? "Tidak ada nota atau produk yang cocok. Coba nomor nota atau nama barang lain."
            : "Tidak ada nota di periode ini."}
        </Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nota</th>
              <th>Waktu</th>
              <th>Kasir</th>
              <th>Metode</th>
              <th className="r">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="clickable striped" onClick={() => setOpenId(s.id)}>
                <td><b>{s.localNo}</b></td>
                <td>
                  {multiDay
                    ? new Date(s.createdAt).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : new Date(s.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td>{s.cashierName}</td>
                <td>{saleMethodLabel(s)}</td>
                <td className="r tabular">{rp(s.total)}</td>
                <td>
                  <span className={`status-pill ${s.status === "void" ? "void" : "ok"}`}>
                    {statusLabel(s.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sale ? (
        <SaleDetail
          sale={sale}
          settings={settings}
          onClose={() => setOpenId(null)}
          onRetur={() => onRetur(sale.id)}
          onVoided={() => {
            setOpenId(null);
            onChange();
          }}
        />
      ) : null}
    </PageShell>
  );
}

function SaleDetail({
  sale,
  settings,
  onClose,
  onRetur,
  onVoided,
}: {
  sale: Sale;
  settings: StoreSettings;
  onClose: () => void;
  onRetur: () => void;
  onVoided: () => void;
}) {
  const toast = useToast();
  const [voidOpen, setVoidOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmVoid(current = pin) {
    if (current.length !== 6 || busy) return;
    setBusy(true);
    const ok = await ownerPinOk(current);
    setBusy(false);
    if (!ok) {
      setBad(true);
      setPin("");
      return;
    }
    try {
      voidSale(sale.id);
      onVoided();
    } catch (e) {
      toast.show("Tidak bisa void", "error", e instanceof Error ? e.message : "Coba retur barang.");
    }
  }

  const kembali = saleChange(sale);

  return (
    <>
    <div
      className="overlay"
      style={{ position: "fixed", inset: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal detail-modal">
        <div className="stack">
          <div className="detail-head">
            <div>
              <H2>{sale.localNo}</H2>
              <span className={`status-pill ${sale.status === "void" ? "void" : "ok"}`}>
                {statusLabel(sale.status)}
              </span>
            </div>
            <Button variant="ghost" onClick={onClose}>
              Tutup
            </Button>
          </div>
          <div className="sale-meta">
            <div>
              <span>Waktu</span>
              <b>{new Date(sale.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</b>
            </div>
            <div>
              <span>Kasir</span>
              <b>{sale.cashierName}</b>
            </div>
            <div>
              <span>Metode</span>
              <b>{saleMethodLabel(sale)}</b>
            </div>
          </div>
          <div className="detail-items">
            {sale.items.map((it) => (
              <div key={it.id} className="detail-line">
                <div>
                  <b>{it.name}</b>
                  <span>
                    {it.qty} × {rp(it.sellPrice)}
                  </span>
                </div>
                <strong className="tabular">{rp(it.sellPrice * it.qty)}</strong>
              </div>
            ))}
          </div>
          <div className="sale-sum">
            <div className="sale-sum-row">
              <span>Subtotal</span>
              <b className="tabular">{rp(sale.subtotal)}</b>
            </div>
            {sale.discount ? (
              <div className="sale-sum-row">
                <span>Diskon</span>
                <b className="tabular">-{rp(sale.discount)}</b>
              </div>
            ) : null}
            {sale.ppn ? (
              <div className="sale-sum-row">
                <span>{ppnLabel(sale.ppnRate)}</span>
                <b className="tabular">{rp(sale.ppn)}</b>
              </div>
            ) : null}
            {sale.deliveryCost ? (
              <div className="sale-sum-row">
                <span>Ongkir</span>
                <b className="tabular">{rp(sale.deliveryCost)}</b>
              </div>
            ) : null}
            {sale.note ? (
              <div className="sale-sum-row note">
                <span>Catatan</span>
                <b>{sale.note}</b>
              </div>
            ) : null}
            <div className="sale-sum-row total">
              <span>Total</span>
              <b className="tabular">{rp(sale.total)}</b>
            </div>
            <div className="sale-sum-row">
              <span>Bayar</span>
              <b className="tabular">{rp(sale.paid)}</b>
            </div>
            {kembali > 0 ? (
              <div className="sale-sum-row">
                <span>Kembali</span>
                <b className="tabular">{rp(kembali)}</b>
              </div>
            ) : null}
          </div>
          <div className="detail-actions">
            <Button onClick={() => printStruk(sale, settings)}>Cetak struk 58mm</Button>
            <Button onClick={() => printNota(sale, settings)}>Cetak nota A4</Button>
            {sale.status !== "void" ? (
              <Button
                className="span-2"
                onClick={() => {
                  onClose();
                  onRetur();
                }}
              >
                Retur barang
              </Button>
            ) : null}
            {sale.status !== "void" ? (
              <Button
                variant="danger"
                className="span-2"
                onClick={() => {
                  setPin("");
                  setBad(false);
                  setVoidOpen(true);
                }}
              >
                Void transaksi
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
      {voidOpen ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0 }}>
          <div className="modal pin-modal">
            <div className="stack">
              <div className="row">
                <H2>Void transaksi</H2>
                <span className="grow" />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setVoidOpen(false);
                    setPin("");
                    setBad(false);
                  }}
                >
                  Tutup
                </Button>
              </div>
              <Text tone="secondary">
                Masukkan PIN owner untuk void. Stok dikembalikan, nota tidak dihapus.
              </Text>
              <PinDots length={pin.length} />
              {bad ? (
                <p className="muted" style={{ color: "var(--danger)", margin: 0 }}>
                  PIN owner salah.
                </p>
              ) : null}
              <PinPad
                onDigit={(d) => {
                  setBad(false);
                  setPin((p) => {
                    if (p.length >= 6) return p;
                    const nextPin = p + d;
                    if (nextPin.length === 6) window.setTimeout(() => void confirmVoid(nextPin), 0);
                    return nextPin;
                  });
                }}
                onClear={() => {
                  setPin("");
                  setBad(false);
                }}
                onOk={() => void confirmVoid()}
              />
              <Button
                onClick={() => {
                  setVoidOpen(false);
                  setPin("");
                  setBad(false);
                }}
              >
                Batal void
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
