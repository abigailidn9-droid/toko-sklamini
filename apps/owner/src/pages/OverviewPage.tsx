import { useEffect, useState } from "react";
import { formatDateTime, formatTime, rp } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { Callout, Stat } from "../ui/primitives.tsx";
import { fetchOverview, type Overview } from "../lib/api.ts";

function attStatus(inTime: string | null, outTime: string | null) {
  if (inTime && outTime) return { cls: "done", label: "Pulang" };
  if (inTime) return { cls: "work", label: "Kerja" };
  return { cls: "wait", label: "Belum" };
}

export function OverviewPage({
  onOpenSale,
  onOpenShift,
}: {
  onOpenSale: (id: string) => void;
  onOpenShift: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchOverview()
      .then((row) => {
        if (!alive) return;
        setData(row);
        setErr("");
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Gagal memuat");
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const maxBar = Math.max(1, ...(data?.daily.map((d) => d.tunai + d.non) ?? [1]));

  return (
    <PageShell
      page="ringkasan"
      title="Ringkasan toko"
      hint="Dipantau dari server. Angka mengikuti sync kasir — transaksi offline muncul setelah antrian terkirim."
      actions={
        data ? (
          <span className="live-stamp">
            <i className="live-dot" />
            Diperbarui {formatTime(data.generatedAt)}
          </span>
        ) : null
      }
    >
      {err ? <Callout title="Tidak terhubung" tone="danger">{err}</Callout> : null}
      {!data && !err ? <div className="boot-inline">Memuat pantauan…</div> : null}
      {data ? (
        <>
          <button type="button" className={`shift-hero ${data.shift ? "open" : "closed"}`} onClick={onOpenShift}>
            {data.shift ? (
              <>
                <div className="shift-hero-top">
                  <span className="status-pill work">Toko buka</span>
                  <span>
                    {data.shift.cashierName} · {formatTime(data.shift.openedAt)}
                  </span>
                </div>
                <div className="shift-hero-main">
                  <div>
                    <span>Omzet sesi</span>
                    <b className="tabular">{rp(data.shift.omzet)}</b>
                  </div>
                  <div>
                    <span>Seharusnya di laci</span>
                    <b className="tabular">{rp(data.shift.expected)}</b>
                  </div>
                  <div>
                    <span>Nota</span>
                    <b className="tabular">{data.shift.notaCount}</b>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="shift-hero-top">
                  <span className="status-pill wait">Belum buka shift</span>
                </div>
                <p>Kasir belum membuka sesi. Setelah shift dibuka dan tersinkron, statusnya muncul di sini.</p>
              </>
            )}
          </button>

          <div className="stat-grid">
            <Stat value={rp(data.today.omzet)} label="Omzet hari ini" />
            <Stat value={String(data.today.notaCount)} label="Nota" />
            <Stat value={rp(data.today.labaBersih)} label="Laba bersih" tone={data.today.labaBersih < 0 ? "danger" : "ok"} />
            <Stat value={rp(data.today.pengeluaran)} label="Pengeluaran" />
          </div>

          <div className="pay-grid">
            {[
              ["Tunai", data.today.tunai],
              ["QRIS", data.today.qris],
              ["Transfer", data.today.transfer],
              ["Kartu", data.today.kartu],
            ].map(([label, n]) => (
              <div key={label} className="pay-chip">
                <span>{label}</span>
                <b className="tabular">{rp(Number(n))}</b>
              </div>
            ))}
          </div>

          <section className="card-block">
            <h3>7 hari terakhir</h3>
            <div className="bar-chart">
              {data.daily.map((d) => (
                <div key={d.iso} className="bar-col">
                  <div className="bar-track">
                    <i style={{ height: `${((d.tunai + d.non) / maxBar) * 100}%` }} />
                  </div>
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="split-2">
            <section className="card-block">
              <h3>Absen hari ini</h3>
              {data.attendance.length === 0 ? (
                <p className="muted">Belum ada karyawan.</p>
              ) : (
                <ul className="plain-list">
                  {data.attendance.map((a) => {
                    const st = attStatus(a.inTime, a.outTime);
                    return (
                      <li key={a.id}>
                        <div>
                          <b>{a.name}</b>
                          <span>{a.jobRole}</span>
                        </div>
                        <span className={`status-pill ${st.cls}`}>{st.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="card-block">
              <h3>Stok menipis</h3>
              {data.lowStock.length === 0 ? (
                <p className="muted">Tidak ada barang ≤ 3.</p>
              ) : (
                <ul className="plain-list">
                  {data.lowStock.map((p) => (
                    <li key={p.id}>
                      <div>
                        <b>{p.name}</b>
                        <span>{p.barcode}</span>
                      </div>
                      <b className="tabular">
                        {p.stock} {p.unit}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card-block">
            <h3>Penjualan terbaru</h3>
            {data.recentSales.length === 0 ? (
              <p className="muted">Belum ada nota di server.</p>
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
                  {data.recentSales.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => onOpenSale(s.id)}>
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
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
