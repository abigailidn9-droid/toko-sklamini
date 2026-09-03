import { useEffect, useState } from "react";
import { formatDateTime, formatTime, rp } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { Button, Callout } from "../ui/primitives.tsx";
import { fetchShift, fetchShifts, type ShiftDetail, type ShiftListItem } from "../lib/api.ts";

export function ShiftPage() {
  const [rows, setRows] = useState<ShiftListItem[] | null>(null);
  const [detail, setDetail] = useState<ShiftDetail | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchShifts()
      .then((list) => {
        if (alive) setRows(list);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Gagal memuat");
      });
    return () => {
      alive = false;
    };
  }, []);

  const open = rows?.find((r) => r.shift.status === "open");

  return (
    <PageShell page="shift" title="Shift" hint="Buka dan tutup kasir di toko. Di sini hanya memantau sesi yang sudah tersinkron.">
      {err ? <Callout title="Tidak terhubung" tone="danger">{err}</Callout> : null}
      {open ? (
        <section className="shift-hero open">
          <div className="shift-hero-top">
            <span className="status-pill work">Sesi berjalan</span>
            <span>
              {open.shift.cashierName} · dibuka {formatTime(open.shift.openedAt)}
            </span>
          </div>
          <div className="shift-hero-main">
            <div>
              <span>Omzet</span>
              <b className="tabular">{rp(open.omzet)}</b>
            </div>
            <div>
              <span>Seharusnya di laci</span>
              <b className="tabular">{rp(open.expected)}</b>
            </div>
            <div>
              <span>Nota</span>
              <b className="tabular">{open.notaCount}</b>
            </div>
          </div>
        </section>
      ) : rows ? (
        <Callout title="Tidak ada sesi terbuka">Kasir belum buka shift, atau shift belum tersinkron ke server.</Callout>
      ) : (
        <div className="boot-inline">Memuat shift…</div>
      )}

      <section className="card-block">
        <h3>Riwayat sesi</h3>
        {!rows?.length ? (
          <p className="muted">Belum ada shift di server.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Sesi</th>
                <th>Kasir</th>
                <th className="r">Omzet</th>
                <th className="r">Sistem</th>
                <th className="r">Hitung</th>
                <th className="r">Selisih</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const beda = r.selisih ?? 0;
                return (
                  <tr key={r.shift.id} className="striped">
                    <td>
                      <b>{formatDateTime(r.shift.openedAt)}</b>
                      <div className="faint">
                        {r.shift.status === "open"
                          ? "berjalan"
                          : r.shift.closedAt
                            ? `sampai ${formatTime(r.shift.closedAt)}`
                            : "tutup"}
                      </div>
                    </td>
                    <td>{r.shift.cashierName}</td>
                    <td className="r tabular">{rp(r.omzet)}</td>
                    <td className="r tabular">{rp(r.shift.kasSistem ?? r.expected)}</td>
                    <td className="r tabular">{r.shift.kasHitung == null ? "—" : rp(r.shift.kasHitung)}</td>
                    <td className={`r tabular settle-diff ${beda === 0 ? "zero" : beda > 0 ? "plus" : "minus"}`}>
                      {r.shift.status === "open" ? "—" : beda === 0 ? "Pas" : rp(beda)}
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => void fetchShift(r.shift.id).then(setDetail)}>
                        Detail
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {detail ? (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h2 className="h2">Rekap sesi</h2>
              <span className="grow" />
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Tutup
              </Button>
            </div>
            <p className="muted">
              {detail.shift.cashierName} · {formatDateTime(detail.shift.openedAt)}
            </p>
            <div className="stat-grid compact">
              <div className="stat">
                <b className="tabular">{rp(detail.omzet)}</b>
                <span>Omzet</span>
              </div>
              <div className="stat">
                <b className="tabular">{rp(detail.expected)}</b>
                <span>Sistem</span>
              </div>
              <div className="stat">
                <b className="tabular">{detail.notaCount}</b>
                <span>Nota</span>
              </div>
            </div>
            <div className="pay-grid">
              {detail.byMethod.map((m) => (
                <div key={m.method} className="pay-chip">
                  <span>{m.label}</span>
                  <b className="tabular">{rp(m.total)}</b>
                </div>
              ))}
            </div>
            {detail.products.length ? (
              <table className="data">
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th className="r">Qty</th>
                    <th className="r">Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.products.map((p) => (
                    <tr key={p.productId}>
                      <td>{p.name}</td>
                      <td className="r tabular">{p.qty}</td>
                      <td className="r tabular">{rp(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
