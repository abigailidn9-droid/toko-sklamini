import { useMemo, useState } from "react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_LABEL,
  formatDateId,
  formatRupiahInput,
  localDayFromIso,
  parseRupiah,
  rp,
  todayIso,
  type ExpenseCategory,
} from "@sklamini/shared";
import { Button, Field, H2, Select } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { addExpense, listExpenses, type Session } from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";

export function PengeluaranPage({
  session,
  tick,
  onChange,
}: {
  session: Session;
  tick: number;
  onChange: () => void;
}) {
  const rows = useMemo(() => listExpenses(), [tick]);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("pembelian");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"Semua" | ExpenseCategory>("Semua");

  const today = todayIso();
  const monthKey = today.slice(0, 7);
  const todayTotal = rows
    .filter((r) => localDayFromIso(r.createdAt) === today)
    .reduce((n, r) => n + r.amount, 0);
  const monthTotal = rows
    .filter((r) => localDayFromIso(r.createdAt).startsWith(monthKey))
    .reduce((n, r) => n + r.amount, 0);

  const shown = filter === "Semua" ? rows : rows.filter((r) => r.category === filter);
  const listTotal = shown.reduce((n, r) => n + r.amount, 0);

  function save() {
    const n = parseRupiah(amount);
    if (!n) return;
    addExpense({ category, amount: n, note: note.trim(), cashierName: session.name });
    setAmount("");
    setNote("");
    setCategory("pembelian");
    setOpen(false);
    toast.show("Pengeluaran tersimpan", "ok", "Catatan sudah masuk arus kas.");
    onChange();
  }

  return (
    <PageShell
      page="pengeluaran"
      title="Pengeluaran"
      hint="Catat biaya toko dan pembelian barang."
      className="expense-page"
      actions={
        <Button
          variant="primary"
          onClick={() => {
            setAmount("");
            setNote("");
            setCategory("pembelian");
            setOpen(true);
          }}
        >
          Catat
        </Button>
      }
    >
      <section className="expense-hero">
        <div className="expense-stats">
          <div>
            <span>Hari ini</span>
            <b className="tabular">{rp(todayTotal)}</b>
          </div>
          <div>
            <span>Bulan ini</span>
            <b className="tabular">{rp(monthTotal)}</b>
          </div>
        </div>
      </section>

      <section className="expense-list">
        <div className="expense-list-head">
          <div className="tabs">
            <button
              className={`tab ${filter === "Semua" ? "on" : ""}`}
              type="button"
              onClick={() => setFilter("Semua")}
            >
              Semua
            </button>
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`tab ${filter === c ? "on" : ""}`}
                type="button"
                onClick={() => setFilter(c)}
              >
                {EXPENSE_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="expense-list-sum">
            <span>{filter === "Semua" ? "Total" : EXPENSE_LABEL[filter]}</span>
            <b className="tabular">{rp(listTotal)}</b>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="expense-empty">
            <b>Belum ada pengeluaran</b>
            <span>Catat pembelian, listrik, sewa, gaji, atau biaya lain.</span>
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Keterangan</th>
                <th className="r">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="striped">
                  <td>
                    <div className="expense-when">
                      <b>{formatDateId(localDayFromIso(r.createdAt))}</b>
                      <span>
                        {new Date(r.createdAt).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="cat-chip" onClick={() => setFilter(r.category)}>
                      {EXPENSE_LABEL[r.category]}
                    </button>
                  </td>
                  <td>{r.note || "—"}</td>
                  <td className="r tabular">{rp(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal expense-modal">
            <div className="stack">
              <div className="row">
                <H2>Catat pengeluaran</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Tutup
                </Button>
              </div>
              <label className="field-label">
                <span>Kategori</span>
                <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="field-label">
                <span>Jumlah</span>
                <div className="money-field">
                  <span>Rp</span>
                  <input
                    className="field"
                    autoFocus
                    inputMode="numeric"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(formatRupiahInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                    }}
                  />
                </div>
              </label>
              <label className="field-label">
                <span>Keterangan</span>
                <Field
                  placeholder={
                    category === "pembelian"
                      ? "Contoh: gula 10 kg"
                      : "Contoh: token PLN, kertas struk…"
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                  }}
                />
              </label>
              <Button variant="primary" disabled={!parseRupiah(amount)} onClick={save}>
                Simpan
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
