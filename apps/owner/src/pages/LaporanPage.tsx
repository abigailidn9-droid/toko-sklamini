import { useEffect, useMemo, useState } from "react";
import { formatDateId, todayIso } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { PeriodBar, rangeOf, type PeriodMode } from "../components/PeriodBar.tsx";
import { Callout } from "../ui/primitives.tsx";
import { fetchReports, type ReportData } from "../lib/api.ts";

function rpAkun(n: number, asNegative = false) {
  const v = Math.round(asNegative ? -Math.abs(n) : n);
  const body = "Rp. " + Math.abs(v).toLocaleString("id-ID");
  return v < 0 ? `-${body}` : body;
}

function rpCell(n: number) {
  if (!n) return "—";
  return "Rp. " + Math.round(n).toLocaleString("id-ID");
}

export function LaporanPage() {
  const [mode, setMode] = useState<PeriodMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(() => rangeOf(mode, customFrom, customTo), [mode, customFrom, customTo]);
  const [tab, setTab] = useState<"laba" | "kas">("laba");
  const [data, setData] = useState<ReportData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchReports(range.from, range.to)
      .then((row) => {
        if (!alive) return;
        setData(row);
        setErr("");
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Gagal memuat");
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const periode =
    range.from === range.to ? formatDateId(range.from) : `${formatDateId(range.from)} – ${formatDateId(range.to)}`;

  return (
    <PageShell
      page="laporan"
      title="Laporan"
      hint="Laba rugi dan arus kas dari data server."
      actions={<PeriodBar mode={mode} from={customFrom} to={customTo} onMode={setMode} onFrom={setCustomFrom} onTo={setCustomTo} />}
    >
      {err ? <Callout title="Tidak terhubung" tone="danger">{err}</Callout> : null}
      <div className="tabs">
        <button className={`tab ${tab === "laba" ? "on" : ""}`} type="button" onClick={() => setTab("laba")}>
          Laba rugi
        </button>
        <button className={`tab ${tab === "kas" ? "on" : ""}`} type="button" onClick={() => setTab("kas")}>
          Arus kas
        </button>
      </div>
      {!data ? (
        <div className="boot-inline">Menyusun laporan…</div>
      ) : (
        <article className="report-sheet">
          <header className="report-head">
            <h1>{data.store.storeName}</h1>
            {data.store.address ? <p>{data.store.address}</p> : null}
            <h2>{tab === "laba" ? "LAPORAN LABA RUGI" : "LAPORAN ARUS KAS"}</h2>
            <p>Periode {periode}</p>
          </header>
          {tab === "laba" ? (
            <div className="lr-sheet">
              <div className="report-row section">
                <span>Pendapatan</span>
              </div>
              <div className="report-row">
                <span>Penjualan (Omset)</span>
                <b className="tabular">{rpAkun(data.rincian.penjualanKotor)}</b>
              </div>
              <div className="report-row">
                <span>Retur penjualan</span>
                <b className="tabular">{rpAkun(data.rincian.retur, true)}</b>
              </div>
              <div className="report-row total">
                <span>Pendapatan bersih</span>
                <b className="tabular">{rpAkun(data.rincian.pendapatanBersih)}</b>
              </div>
              <div className="report-row section">
                <span>Harga pokok penjualan</span>
              </div>
              <div className="report-row">
                <span>HPP (modal produk)</span>
                <b className="tabular">{rpAkun(data.rincian.hppKotor, true)}</b>
              </div>
              <div className="report-row">
                <span>HPP retur</span>
                <b className="tabular">{rpAkun(data.rincian.hppRetur)}</b>
              </div>
              <div className="report-row total">
                <span>Laba kotor</span>
                <b className="tabular">{rpAkun(data.rincian.labaKotor)}</b>
              </div>
              <div className="report-row section">
                <span>Pengeluaran operasional</span>
              </div>
              {data.rincian.beban.map((b) => (
                <div key={b.key} className="report-row">
                  <span>{b.label}</span>
                  <b className="tabular">{rpAkun(b.amount)}</b>
                </div>
              ))}
              <div className="report-row total net">
                <span>Laba bersih</span>
                <b className="tabular">{rpAkun(data.rincian.labaBersih)}</b>
              </div>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Keterangan</th>
                  <th className="r">Debit</th>
                  <th className="r">Kredit</th>
                  <th className="r">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.bukuKas.map((row, i) => (
                  <tr key={i} className={row.no == null ? "open" : undefined}>
                    <td>{row.tanggal ? formatDateId(row.tanggal) : ""}</td>
                    <td>{row.ket}</td>
                    <td className="r tabular">{row.no == null ? "—" : rpCell(row.debit)}</td>
                    <td className="r tabular">{row.no == null ? "—" : rpCell(row.kredit)}</td>
                    <td className="r tabular">{rpAkun(row.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}
    </PageShell>
  );
}
