import { useEffect, useMemo, useState } from "react";
import { todayIso } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { PeriodBar, rangeOf, type PeriodMode } from "../components/PeriodBar.tsx";
import { Callout, Field } from "../ui/primitives.tsx";
import { fetchStock, type StockData } from "../lib/api.ts";

function qtyCell(n: number) {
  return n ? String(n) : "—";
}

export function StockPage() {
  const [mode, setMode] = useState<PeriodMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(() => rangeOf(mode, customFrom, customTo), [mode, customFrom, customTo]);
  const [q, setQ] = useState("");
  const [data, setData] = useState<StockData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchStock(range.from, range.to)
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

  const shown = (data?.rows ?? []).filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return r.name.toLowerCase().includes(s) || r.barcode.includes(s);
  });

  return (
    <PageShell
      page="stok"
      title="Stok"
      hint="Mutasi stok di server: awal, masuk, keluar, akhir."
      actions={<PeriodBar mode={mode} from={customFrom} to={customTo} onMode={setMode} onFrom={setCustomFrom} onTo={setCustomTo} />}
    >
      {err ? <Callout title="Tidak terhubung" tone="danger">{err}</Callout> : null}
      <Field placeholder="Cari nama atau barcode" value={q} onChange={(e) => setQ(e.target.value)} />
      {!data ? (
        <div className="boot-inline">Memuat stok…</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Barang</th>
              <th>Sat</th>
              <th className="r">Awal</th>
              <th className="r">Masuk</th>
              <th className="r">Keluar</th>
              <th className="r">Akhir</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.productId} className="striped">
                <td>
                  <b>{r.name}</b>
                  <div className="faint">{r.barcode}</div>
                </td>
                <td>{r.unit}</td>
                <td className="r tabular">{qtyCell(r.awal)}</td>
                <td className="r tabular">{qtyCell(r.masuk)}</td>
                <td className="r tabular">{qtyCell(r.keluar)}</td>
                <td className="r tabular">
                  <b>{r.akhir}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
