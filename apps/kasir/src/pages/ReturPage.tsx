import { useEffect, useMemo, useState } from "react";
import { formatDateTime, lineRefund, rp, saleMethodLabel, todayIso, type Sale } from "@sklamini/shared";
import { Button, Callout, Field, H2, QtyStepper, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  createReturn,
  findSaleByLocalNo,
  getSale,
  listReturns,
  listSales,
  returnedQtyBySale,
  type Session,
} from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";

export function ReturPage({
  session,
  tick,
  saleId,
  onUsed,
  onChange,
}: {
  session: Session;
  tick: number;
  saleId: string | null;
  onUsed: () => void;
  onChange: () => void;
}) {
  const toast = useToast();
  const history = useMemo(() => listReturns(), [tick]);
  const todaySales = useMemo(
    () => listSales(todayIso()).filter((s) => s.status === "selesai"),
    [tick],
  );
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!saleId) return;
    const hit = getSale(saleId) || findSaleByLocalNo(saleId);
    if (hit) pick(hit);
    onUsed();
  }, [saleId]);

  const returned = sale ? returnedQtyBySale(sale.id) : { total: 0, byItem: {} as Record<string, number> };

  function pick(s: Sale) {
    setSale(s);
    setQty({});
    setNote("");
  }

  function cari() {
    const hit = findSaleByLocalNo(q);
    if (!hit) {
      toast.show("Nota tidak ketemu", "error", q.trim() || "Isi nomor nota.");
      return;
    }
    if (hit.status === "void") {
      toast.show("Nota sudah void", "info", hit.localNo);
      return;
    }
    pick(hit);
  }

  function simpan() {
    if (!sale) return;
    try {
      const doc = createReturn({
        saleId: sale.id,
        cashier: session,
        note,
        lines: Object.entries(qty).map(([saleItemId, n]) => ({ saleItemId, qty: n })),
      });
      toast.show("Retur tersimpan", "ok", `${doc.localNo} · ${rp(doc.total)}`);
      setSale(null);
      setQty({});
      setNote("");
      onChange();
    } catch (e) {
      toast.show("Retur gagal", "error", e instanceof Error ? e.message : "Coba lagi.");
    }
  }

  const refund = sale
    ? sale.items.reduce((n, it) => n + lineRefund(sale, it.sellPrice, qty[it.id] ?? 0), 0)
    : 0;

  return (
    <PageShell page="retur" title="Retur" hint="Kembalikan sebagian barang dari nota. Stok bertambah, uang tunai keluar dari laci.">
      <div className="row">
        <div className="grow">
          <Field
            placeholder="Nomor nota, contoh SKL-…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") cari();
            }}
          />
        </div>
        <Button variant="primary" onClick={cari}>
          Cari
        </Button>
      </div>
      {!sale && todaySales.length ? (
        <table className="data">
          <thead>
            <tr>
              <th>Nota hari ini</th>
              <th>Kasir</th>
              <th className="r">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {todaySales.slice(0, 12).map((s) => (
              <tr key={s.id} className="striped">
                <td><b>{s.localNo}</b></td>
                <td>{s.cashierName}</td>
                <td className="r tabular">{rp(s.total)}</td>
                <td>
                  <Button variant="ghost" onClick={() => pick(s)}>
                    Pilih
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {sale ? (
        <div className="card-block">
          <div className="row">
            <H2>{sale.localNo}</H2>
            <span className="grow" />
            <Text small tone="secondary">
              {saleMethodLabel(sale)} · {rp(sale.total)}
            </Text>
          </div>
          {sale.items.map((it) => {
            const done = returned.byItem[it.id] ?? 0;
            const sisa = it.qty - done;
            return (
              <div key={it.id} className="cart-item">
                <div className="cart-item-info">
                  <b>{it.name}</b>
                  <span>
                    {it.qty} × {rp(it.sellPrice)}
                    {done ? ` · sudah retur ${done}` : ""}
                  </span>
                </div>
                <div className="cart-item-qty">
                  {sisa <= 0 ? (
                    <Text small tone="secondary">Habis</Text>
                  ) : (
                    <QtyStepper
                      value={qty[it.id] ?? 0}
                      onChange={(n) => setQty((prev) => ({ ...prev, [it.id]: Math.min(sisa, Math.max(0, n)) }))}
                    />
                  )}
                </div>
            <div className="cart-item-sum tabular">{rp(lineRefund(sale, it.sellPrice, qty[it.id] ?? 0))}</div>
              </div>
            );
          })}
          <label className="field-label">
            <span>Catatan</span>
            <Field value={note} placeholder="Alasan retur" onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="pay-total">
            <span>Pengembalian</span>
            <b className="tabular">{rp(refund)}</b>
          </div>
          {sale.payments.some((p) => p.method === "tunai") ? (
            <Callout title="Tunai">Kembalikan uang dari laci sesuai nilai pengembalian.</Callout>
          ) : sale.payments.some((p) => p.method === "hutang") ? (
            <Callout title="Hutang">Nilai retur mengurangi sisa piutang pelanggan.</Callout>
          ) : (
            <Callout title={saleMethodLabel(sale)}>Tidak memotong kas laci. Refund lewat saluran yang sama.</Callout>
          )}
          <div className="row">
            <Button variant="primary" disabled={!refund} onClick={simpan}>
              Simpan retur
            </Button>
            <Button onClick={() => setSale(null)}>Batal</Button>
          </div>
        </div>
      ) : null}

      {history.length ? (
        <table className="data">
          <thead>
            <tr>
              <th>Retur</th>
              <th>Waktu</th>
              <th>Kasir</th>
              <th className="r">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 20).map((r) => (
              <tr key={r.id} className="striped">
                <td>
                  <b>{r.localNo}</b>
                  <div className="faint">{r.items.map((it) => `${it.name} ×${it.qty}`).join(", ")}</div>
                </td>
                <td>{formatDateTime(r.createdAt)}</td>
                <td>{r.cashierName}</td>
                <td className="r tabular">{rp(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </PageShell>
  );
}
