import { useEffect, useMemo, useState } from "react";
import { formatDateTime, rp, todayIso } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { PeriodBar, rangeOf, type PeriodMode } from "../components/PeriodBar.tsx";
import { Callout } from "../ui/primitives.tsx";
import { fetchSale, fetchSales, type SaleRow } from "../lib/api.ts";

export function SalesPage({ openId, onOpened }: { openId?: string | null; onOpened?: () => void }) {
  const [mode, setMode] = useState<PeriodMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(() => rangeOf(mode, customFrom, customTo), [mode, customFrom, customTo]);
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<SaleRow | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchSales(range.from, range.to)
      .then((list) => {
        if (!alive) return;
        setRows(list);
        setErr("");
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Gagal memuat");
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  useEffect(() => {
    if (!openId) return;
    let alive = true;
    fetchSale(openId)
      .then((row) => {
        if (!alive) return;
        setOpen(row);
        onOpened?.();
      })
      .catch(() => onOpened?.());
    return () => {
      alive = false;
    };
    // onOpened sengaja tidak di-deps: hanya jalan saat openId baru.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const omzet = rows?.filter((s) => s.status === "selesai").reduce((n, s) => n + s.total, 0) ?? 0;

  return (
    <PageShell
      page="penjualan"
      title="Penjualan"
      hint="Nota yang sudah sampai ke server."
      actions={<PeriodBar mode={mode} from={customFrom} to={customTo} onMode={setMode} onFrom={setCustomFrom} onTo={setCustomTo} />}
    >
      {err ? <Callout title="Tidak terhubung" tone="danger">{err}</Callout> : null}
      <div className="stat-grid">
        <div className="stat">
          <b className="tabular">{rp(omzet)}</b>
          <span>Omzet periode</span>
        </div>
        <div className="stat">
          <b className="tabular">{rows?.filter((s) => s.status === "selesai").length ?? "—"}</b>
          <span>Nota</span>
        </div>
      </div>
      {!rows ? (
        <div className="boot-inline">Memuat penjualan…</div>
      ) : rows.length === 0 ? (
        <Callout title="Belum ada nota">Tidak ada penjualan di periode ini, atau kasir belum sync.</Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nota</th>
              <th>Kasir</th>
              <th>Bayar</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="clickable striped" onClick={() => setOpen(s)}>
                <td>
                  <b>{s.localNo}</b>
                  <div className="faint">{formatDateTime(s.createdAt)}</div>
                </td>
                <td>{s.cashierName}</td>
                <td>
                  {s.methodLabel}
                  {s.status === "void" ? <span className="status-pill void">Void</span> : null}
                </td>
                <td className="r tabular">{rp(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open ? (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 className="h2">{open.localNo}</h2>
              <span className="grow" />
              {open.status === "void" ? <span className="status-pill void">Void</span> : null}
              <button className="ghost" type="button" onClick={() => setOpen(null)}>
                Tutup
              </button>
            </div>
            <p className="muted">
              {open.cashierName} · {formatDateTime(open.createdAt)} · {open.methodLabel}
            </p>
            <div className="detail-items">
              {open.items.map((it) => (
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
            <div className="detail-total">
              <span>Total</span>
              <b className="tabular">{rp(open.total)}</b>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
