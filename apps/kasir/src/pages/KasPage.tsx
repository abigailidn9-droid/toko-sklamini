import { useMemo, useState } from "react";
import { formatDateTime, formatRupiahInput, formatTime, parseRupiah, rp, type StoreSettings } from "@sklamini/shared";
import { Button, Callout, Field, H2, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  closeCashShift,
  currentOpenShift,
  lastClosedShift,
  listCashShifts,
  openCashShift,
  shiftExpected,
  shiftSettlement,
  type Session,
} from "../lib/repo.ts";
import { printSettlement } from "../lib/print.ts";
import { useToast } from "../ui/toast.tsx";

export function KasPage({
  session,
  settings,
  tick,
  onChange,
}: {
  session: Session;
  settings: StoreSettings;
  tick: number;
  onChange: () => void;
}) {
  const toast = useToast();
  const open = useMemo(() => currentOpenShift(), [tick]);
  const last = useMemo(() => lastClosedShift(), [tick]);
  const history = useMemo(() => listCashShifts().filter((s) => s.status === "closed"), [tick]);
  const live = useMemo(() => (open ? shiftSettlement(open) : null), [tick, open]);
  const expected = open ? shiftExpected(open) : 0;
  const [awal, setAwal] = useState(() =>
    last?.kasHitung ? formatRupiahInput(String(last.kasHitung)) : "",
  );
  const [hitung, setHitung] = useState("");
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);

  function buka() {
    try {
      openCashShift({ cashier: session, kasAwal: parseRupiah(awal), note });
      setNote("");
      toast.show("Kasir dibuka", "ok", `Kas awal ${rp(parseRupiah(awal))}`);
      onChange();
    } catch (e) {
      toast.show("Tidak bisa buka", "error", e instanceof Error ? e.message : "Coba lagi.");
    }
  }

  function cetak(row: (typeof history)[number]) {
    printSettlement(shiftSettlement(row), settings);
  }

  function mulaiTutup() {
    setHitung(formatRupiahInput(String(expected)));
    setClosing(true);
  }

  function tutup() {
    try {
      const row = closeCashShift({ kasHitung: parseRupiah(hitung), note });
      setClosing(false);
      setHitung("");
      setNote("");
      const beda = row.selisih ?? 0;
      printSettlement(shiftSettlement(row), settings);
      toast.show(
        beda === 0 ? "Kas cocok" : beda > 0 ? "Kas lebih" : "Kas kurang",
        beda === 0 ? "ok" : "info",
        `Hitung ${rp(row.kasHitung ?? 0)} · Sistem ${rp(row.kasSistem ?? 0)} · Struk & detail dicetak`,
      );
      onChange();
    } catch (e) {
      toast.show("Tidak bisa tutup", "error", e instanceof Error ? e.message : "Coba lagi.");
    }
  }

  const hitungRp = parseRupiah(hitung);
  const selisihTutup = hitungRp - expected;

  return (
    <PageShell
      page="kas"
      title="Settlement"
      hint="Buka laci dengan kas awal. Tutup sesi dengan hitung fisik, lalu cetak rekap."
      className="settle-page"
      actions={
        open ? (
          <Button variant="primary" onClick={mulaiTutup}>
            Tutup kasir
          </Button>
        ) : null
      }
    >
      {open && live ? (
        <section className="settle-hero">
          <div className="settle-hero-top">
            <span className="status-pill work">Sesi berjalan</span>
            <span className="settle-hero-meta">
              {open.cashierName} · dibuka {formatTime(open.openedAt)}
            </span>
          </div>
          <div className="settle-hero-main">
            <div>
              <span>Seharusnya di laci</span>
              <b className="tabular">{rp(expected)}</b>
            </div>
            <div className="settle-hero-side">
              <div>
                <span>Nota</span>
                <b className="tabular">{live.notaCount}</b>
              </div>
              <div>
                <span>Omzet</span>
                <b className="tabular">{rp(live.omzet)}</b>
              </div>
            </div>
          </div>
          <div className="settle-flow">
            <FlowItem label="Kas awal" value={open.kasAwal} />
            <span className="settle-flow-op">+</span>
            <FlowItem label="Tunai masuk" value={live.tunaiMasuk} />
            <span className="settle-flow-op">−</span>
            <FlowItem label="Retur tunai" value={live.returTunai} />
            <span className="settle-flow-op">−</span>
            <FlowItem label="Pengeluaran" value={live.pengeluaran} />
          </div>
          <div className="settle-methods">
            {live.byMethod.map((m) => (
              <div key={m.method} className="settle-method">
                <span>{m.label}</span>
                <b className="tabular">{rp(m.total)}</b>
                <em>{m.count ? `${m.count} nota` : "—"}</em>
              </div>
            ))}
          </div>
          <p className="settle-note">QRIS, transfer, dan kartu tidak masuk laci. Hanya tunai yang dihitung ke kas.</p>
        </section>
      ) : (
        <section className="settle-open">
          <div>
            <H2>Buka kasir</H2>
            <Text tone="secondary">Hitung uang di laci, lalu simpan sebagai kas awal sesi ini.</Text>
          </div>
          {last?.kasHitung != null ? (
            <div className="settle-last">
              <span>Tutup terakhir</span>
              <b className="tabular">{rp(last.kasHitung)}</b>
              {last.selisih ? (
                <em className={last.selisih > 0 ? "ok" : "bad"}>selisih {rp(last.selisih)}</em>
              ) : (
                <em>pas</em>
              )}
            </div>
          ) : null}
          <label className="field-label">
            <span>Kas awal</span>
            <div className="money-field">
              <span>Rp</span>
              <input
                className="field"
                autoFocus
                inputMode="numeric"
                placeholder="0"
                value={awal}
                onChange={(e) => setAwal(formatRupiahInput(e.target.value))}
              />
            </div>
          </label>
          <Button variant="primary" onClick={buka}>
            Buka kasir
          </Button>
        </section>
      )}

      <section className="settle-history">
        <div className="settle-history-head">
          <H2>Riwayat</H2>
          <Text small tone="secondary">
            {history.length ? `${history.length} sesi tertutup` : "Belum ada sesi yang ditutup"}
          </Text>
        </div>
        {history.length === 0 ? (
          <Callout title="Belum ada riwayat">Setelah tutup kasir, rekap sesi muncul di sini.</Callout>
        ) : (
          <table className="data settle-table">
            <thead>
              <tr>
                <th>Sesi</th>
                <th>Kasir</th>
                <th className="r">Awal</th>
                <th className="r">Sistem</th>
                <th className="r">Hitung</th>
                <th className="r">Selisih</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((s) => {
                const beda = s.selisih ?? 0;
                return (
                  <tr key={s.id} className="striped">
                    <td>
                      <b>{formatDateTime(s.openedAt)}</b>
                      <div className="faint">{s.closedAt ? `sampai ${formatTime(s.closedAt)}` : "—"}</div>
                    </td>
                    <td>{s.cashierName}</td>
                    <td className="r tabular">{rp(s.kasAwal)}</td>
                    <td className="r tabular">{rp(s.kasSistem ?? 0)}</td>
                    <td className="r tabular">{rp(s.kasHitung ?? 0)}</td>
                    <td className={`r tabular settle-diff ${beda === 0 ? "zero" : beda > 0 ? "plus" : "minus"}`}>
                      {beda === 0 ? "Pas" : rp(beda)}
                    </td>
                    <td>
                      <Button variant="ghost" onClick={() => cetak(s)}>
                        Cetak
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {closing && open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <form
            className="modal settle-modal"
            onSubmit={(e) => {
              e.preventDefault();
              tutup();
            }}
          >
            <div className="row">
              <H2>Tutup kasir</H2>
              <span className="grow" />
              <Button type="button" variant="ghost" onClick={() => setClosing(false)}>
                Batal
              </Button>
            </div>
            <Text tone="secondary">Hitung uang fisik di laci. Setelah tutup, struk 58mm dan detail A4 dicetak.</Text>
            <div className="settle-close-sum">
              <div>
                <span>Kas awal</span>
                <b className="tabular">{rp(open.kasAwal)}</b>
              </div>
              <div>
                <span>Tunai masuk</span>
                <b className="tabular">{rp(live?.tunaiMasuk ?? 0)}</b>
              </div>
              <div>
                <span>Retur + keluar</span>
                <b className="tabular">{rp((live?.returTunai ?? 0) + (live?.pengeluaran ?? 0))}</b>
              </div>
              <div className="total">
                <span>Seharusnya</span>
                <b className="tabular">{rp(expected)}</b>
              </div>
            </div>
            <label className="field-label">
              <span>Uang di laci</span>
              <div className="money-field">
                <span>Rp</span>
                <input
                  className="field"
                  autoFocus
                  inputMode="numeric"
                  value={hitung}
                  onChange={(e) => setHitung(formatRupiahInput(e.target.value))}
                />
              </div>
            </label>
            <div className={`settle-close-diff ${selisihTutup === 0 ? "zero" : selisihTutup > 0 ? "plus" : "minus"}`}>
              <span>{selisihTutup === 0 ? "Cocok dengan sistem" : selisihTutup > 0 ? "Lebih dari sistem" : "Kurang dari sistem"}</span>
              <b className="tabular">{selisihTutup === 0 ? "Pas" : rp(selisihTutup)}</b>
            </div>
            <label className="field-label">
              <span>Catatan (opsional)</span>
              <Field value={note} placeholder="Setoran, selisih, dll." onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="extra-actions">
              <Button type="submit" variant="primary">
                Tutup & cetak
              </Button>
              <Button type="button" onClick={() => setClosing(false)}>
                Batal
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </PageShell>
  );
}

function FlowItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="settle-flow-item">
      <span>{label}</span>
      <b className="tabular">{rp(value)}</b>
    </div>
  );
}
