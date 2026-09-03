import { useMemo, useState } from "react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FUNDS,
  EXPENSE_FUND_LABEL,
  EXPENSE_LABEL,
  formatDateId,
  formatRupiahInput,
  localDayFromIso,
  parseRupiah,
  rp,
  todayIso,
  type Expense,
  type ExpenseCategory,
  type ExpenseFund,
} from "@sklamini/shared";
import { Button, Field, H2, Select, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { addExpense, deleteExpense, listExpenses, updateExpense, type Session } from "../lib/repo.ts";
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
  const [editing, setEditing] = useState<Expense | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Expense | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("pembelian");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [fund, setFund] = useState<ExpenseFund>("laci");
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

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setAmount("");
    setNote("");
    setCategory("pembelian");
    setFund("laci");
  }

  function startCreate() {
    setEditing(null);
    setAmount("");
    setNote("");
    setCategory("pembelian");
    setFund("laci");
    setOpen(true);
  }

  function startEdit(row: Expense) {
    setEditing(row);
    setCategory(row.category);
    setAmount(formatRupiahInput(String(row.amount)));
    setNote(row.note);
    setFund(row.fund);
    setOpen(true);
  }

  function save() {
    const n = parseRupiah(amount);
    if (!n) return;
    if (editing) {
      const res = updateExpense({
        id: editing.id,
        category,
        amount: n,
        note: note.trim(),
        fund,
      });
      if (!res.ok) {
        toast.show(res.error, "error");
        return;
      }
      toast.show("Pengeluaran diubah", "ok", "Arus kas ikut diperbarui.");
    } else {
      addExpense({ category, amount: n, note: note.trim(), fund, cashierName: session.name });
      toast.show("Pengeluaran tersimpan", "ok", "Catatan sudah masuk arus kas.");
    }
    closeForm();
    onChange();
  }

  function remove(row: Expense) {
    const res = deleteExpense(row.id);
    if (!res.ok) {
      toast.show(res.error, "error");
      setRemoveTarget(null);
      return;
    }
    if (editing?.id === row.id) closeForm();
    setRemoveTarget(null);
    toast.show("Pengeluaran dihapus", "ok", "Catatan sudah dihapus dari arus kas.");
    onChange();
  }

  return (
    <PageShell
      page="pengeluaran"
      title="Pengeluaran"
      hint="Catat biaya toko dan pembelian barang."
      className="expense-page"
      actions={
        <Button variant="primary" onClick={startCreate}>
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
                <th>Sumber</th>
                <th className="r">Jumlah</th>
                <th />
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
                  <td>{EXPENSE_FUND_LABEL[r.fund]}</td>
                  <td className="r tabular">{rp(r.amount)}</td>
                  <td className="expense-row-actions">
                    <Button type="button" variant="ghost" className="expense-edit" onClick={() => startEdit(r)}>
                      Ubah
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="expense-del"
                      onClick={() => setRemoveTarget(r)}
                    >
                      Hapus
                    </Button>
                  </td>
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
                <H2>{editing ? "Ubah pengeluaran" : "Catat pengeluaran"}</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={closeForm}>
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
                <span>Ambil dari</span>
                <div className="pay-methods">
                  {EXPENSE_FUNDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`method-btn ${fund === id ? "on" : ""}`}
                      onClick={() => setFund(id)}
                    >
                      <b>{EXPENSE_FUND_LABEL[id]}</b>
                      <span>{id === "laci" ? "Uang tunai di laci" : "Kas toko, bukan laci"}</span>
                    </button>
                  ))}
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
              <div className="row">
                {editing ? (
                  <Button variant="danger" onClick={() => setRemoveTarget(editing)}>
                    Hapus
                  </Button>
                ) : null}
                <span className="grow" />
                <Button variant="primary" disabled={!parseRupiah(amount)} onClick={save}>
                  Simpan
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {removeTarget ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <div className="modal" style={{ width: 400 }}>
            <div className="stack">
              <H2>Hapus pengeluaran?</H2>
              <Text tone="secondary">
                {EXPENSE_LABEL[removeTarget.category]} {rp(removeTarget.amount)}
                {removeTarget.note ? ` — ${removeTarget.note}` : ""} akan dihapus dari daftar dan arus kas.
              </Text>
              <div className="row">
                <Button onClick={() => setRemoveTarget(null)}>Batal</Button>
                <span className="grow" />
                <Button variant="danger" onClick={() => remove(removeTarget)}>
                  Hapus
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
