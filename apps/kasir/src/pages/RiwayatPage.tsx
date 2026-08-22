import { useMemo, useState } from "react";
import {
  formatDateId,
  ppnLabel,
  rp,
  saleMethodLabel,
  todayIso,
  type Sale,
} from "@sklamini/shared";
import { Button, Callout, H2, PinDots, PinPad, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { getSale, listSales, ownerPinOk, uniqueDates, voidSale } from "../lib/repo.ts";
import { printNota, printStruk } from "../lib/print.ts";
import type { StoreSettings } from "@sklamini/shared";
import { useToast } from "../ui/toast.tsx";

function statusLabel(s: Sale["status"]) {
  return s === "void" ? "Dibatalkan" : "Selesai";
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
  const dates = useMemo(() => uniqueDates("sales"), [tick]);
  const [date, setDate] = useState<string>(todayIso());
  const sales = useMemo(
    () => listSales(date === "all" || !date ? "all" : date),
    [tick, date],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const sale = openId ? getSale(openId) : null;
  const omzet = sales.filter((s) => s.status === "selesai").reduce((n, s) => n + s.total, 0);

  return (
    <PageShell
      page="riwayat"
      title="Riwayat transaksi"
      hint="Nota penjualan hari ini dan sebelumnya."
      actions={
        <select className="field" value={date} onChange={(e) => setDate(e.target.value)}>
          <option value="all">Semua tanggal</option>
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDateId(d)}
            </option>
          ))}
        </select>
      }
    >
      <div className="pay-total">
        <span>Omzet</span>
        <b className="tabular">{rp(omzet)}</b>
      </div>
      {sales.length === 0 ? (
        <Callout title="Belum ada transaksi">Penjualan hari ini akan muncul di sini.</Callout>
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
            {sales.map((s) => (
              <tr key={s.id} className="clickable striped" onClick={() => setOpenId(s.id)}>
                <td><b>{s.localNo}</b></td>
                <td>{new Date(s.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</td>
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
            <div className="sale-sum-row">
              <span>Kembali</span>
              <b className="tabular">{rp(sale.changeAmount)}</b>
            </div>
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
