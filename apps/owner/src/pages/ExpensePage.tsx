import { useEffect, useMemo, useState } from "react";
import { EXPENSE_LABEL, formatDateTime, rp, todayIso, type ExpenseCategory } from "@sklamini/shared";
import { PageShell } from "../components/PageHeader.tsx";
import { PeriodBar, rangeOf, type PeriodMode } from "../components/PeriodBar.tsx";
import { Callout } from "../ui/primitives.tsx";
import { fetchExpenses, type ExpenseRow } from "../lib/api.ts";

export function ExpensePage() {
  const [mode, setMode] = useState<PeriodMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(() => rangeOf(mode, customFrom, customTo), [mode, customFrom, customTo]);
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchExpenses(range.from, range.to)
      .then((list) => {
        if (alive) {
          setRows(list);
          setErr("");
        }
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "Gagal memuat");
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const total = rows?.reduce((n, r) => n + r.amount, 0) ?? 0;

  return (
    <PageShell
      page="pengeluaran"
      title="Pengeluaran"
      hint="Beban toko yang sudah tersinkron dari kasir."
      actions={
        <PeriodBar mode={mode} from={customFrom} to={customTo} onMode={setMode} onFrom={setCustomFrom} onTo={setCustomTo} />
      }
    >
      {err ? (
        <Callout title="Tidak terhubung" tone="danger">
          {err}
        </Callout>
      ) : null}
      <div className="stat">
        <b className="tabular">{rp(total)}</b>
        <span>Total periode</span>
      </div>
      {!rows ? (
        <div className="boot-inline">Memuat…</div>
      ) : rows.length === 0 ? (
        <Callout title="Tidak ada pengeluaran">Periode ini kosong.</Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Kategori</th>
              <th>Dari</th>
              <th className="r">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="striped">
                <td>
                  <b>{formatDateTime(e.createdAt)}</b>
                  <div className="faint">{e.note || e.cashierName}</div>
                </td>
                <td>{EXPENSE_LABEL[e.category as ExpenseCategory] ?? e.category}</td>
                <td>{e.fund === "toko" ? "Kas toko" : "Laci"}</td>
                <td className="r tabular">{rp(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
