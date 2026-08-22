import { useMemo, useState } from "react";
import { formatRupiahInput, parseRupiah, rp, type PayMethod } from "@sklamini/shared";
import { Button, Callout, Field, H2, Select, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  addCustomerPayment,
  listCustomers,
  upsertCustomer,
  type Session,
} from "../lib/repo.ts";
import { useToast } from "../ui/toast.tsx";

export function PelangganPage({
  session,
  tick,
  onChange,
}: {
  session: Session;
  tick: number;
  onChange: () => void;
}) {
  const toast = useToast();
  const rows = useMemo(() => listCustomers(true), [tick]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("tunai");
  const [payNote, setPayNote] = useState("");

  const shown = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return r.name.toLowerCase().includes(s) || r.phone.includes(s);
  });
  const piutang = rows.reduce((n, r) => n + r.debt, 0);
  const paying = payId ? rows.find((r) => r.id === payId) : null;

  function startNew() {
    setEditingId(null);
    setName("");
    setPhone("");
    setNote("");
    setActive(true);
    setOpen(true);
  }

  function startEdit(id: string) {
    const u = rows.find((r) => r.id === id);
    if (!u) return;
    setEditingId(u.id);
    setName(u.name);
    setPhone(u.phone);
    setNote(u.note);
    setActive(u.active);
    setOpen(true);
  }

  function save() {
    const res = upsertCustomer({ id: editingId ?? undefined, name, phone, note, active });
    if (!res.ok) {
      toast.show("Tidak tersimpan", "error", res.error);
      return;
    }
    setOpen(false);
    onChange();
    toast.show(editingId ? "Pelanggan diperbarui" : "Pelanggan ditambah", "ok");
  }

  function terima() {
    if (!paying) return;
    try {
      addCustomerPayment({
        customerId: paying.id,
        amount: parseRupiah(payAmt),
        method: payMethod,
        note: payNote,
        cashier: session,
      });
      toast.show("Pelunasan tersimpan", "ok", `${paying.name} · ${rp(parseRupiah(payAmt))}`);
      setPayId(null);
      setPayAmt("");
      setPayNote("");
      onChange();
    } catch (e) {
      toast.show("Gagal terima", "error", e instanceof Error ? e.message : "Coba lagi.");
    }
  }

  return (
    <PageShell page="pelanggan" title="Pelanggan" hint="Daftar pelanggan, sisa hutang, dan pelunasan.">
      <div className="grid grid-3">
        <div className="pay-total">
          <span>Pelanggan</span>
          <b>{rows.filter((r) => r.active).length}</b>
        </div>
        <div className="pay-total">
          <span>Piutang</span>
          <b className="tabular">{rp(piutang)}</b>
        </div>
      </div>
      <div className="row">
        <div className="grow">
          <Field placeholder="Cari nama atau telepon…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="primary" onClick={startNew}>
          Tambah
        </Button>
      </div>
      {shown.length === 0 ? (
        <Callout title="Belum ada pelanggan">Tambah pelanggan untuk penjualan hutang.</Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Telepon</th>
              <th className="r">Hutang</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="clickable striped" onClick={() => startEdit(r.id)}>
                <td>
                  <b>{r.name}</b>
                  {r.note ? <div className="faint">{r.note}</div> : null}
                </td>
                <td>{r.phone || "—"}</td>
                <td className="r tabular">{r.debt ? rp(r.debt) : "—"}</td>
                <td>
                  <span className={`status-pill ${r.active ? "ok" : "wait"}`}>{r.active ? "Aktif" : "Nonaktif"}</span>
                </td>
                <td>
                  {r.debt > 0 ? (
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPayId(r.id);
                        setPayAmt(formatRupiahInput(String(r.debt)));
                        setPayMethod("tunai");
                        setPayNote("");
                      }}
                    >
                      Terima
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 420 }}>
            <div className="stack">
              <div className="row">
                <H2>{editingId ? "Ubah pelanggan" : "Pelanggan baru"}</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Tutup
                </Button>
              </div>
              <label className="field-label">
                <span>Nama</span>
                <Field value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field-label">
                <span>Telepon</span>
                <Field value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="field-label">
                <span>Catatan</span>
                <Field value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <label className="field-label">
                <span>Status</span>
                <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </Select>
              </label>
              <Button variant="primary" onClick={save} disabled={!name.trim()}>
                Simpan
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {paying ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 420 }}>
            <div className="stack">
              <div className="row">
                <H2>Terima pelunasan</H2>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setPayId(null)}>
                  Tutup
                </Button>
              </div>
              <Text>
                {paying.name} · sisa {rp(paying.debt)}
              </Text>
              <label className="field-label">
                <span>Metode</span>
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PayMethod)}>
                  <option value="tunai">Tunai</option>
                  <option value="qris">QRIS</option>
                  <option value="transfer">Transfer</option>
                  <option value="kartu">Kartu</option>
                </Select>
              </label>
              <label className="field-label">
                <span>Nominal</span>
                <div className="money-field">
                  <span>Rp</span>
                  <input
                    className="field"
                    inputMode="numeric"
                    value={payAmt}
                    onChange={(e) => setPayAmt(formatRupiahInput(e.target.value))}
                  />
                </div>
              </label>
              <label className="field-label">
                <span>Catatan</span>
                <Field value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              </label>
              <Button variant="primary" onClick={terima}>
                Simpan pelunasan
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
