import { useMemo, useState } from "react";
import { formatDateTime, formatRupiahInput, parseRupiah, rp, type StoreSettings } from "@sklamini/shared";
import { Button, Callout, Field, H2, Stat, Text } from "../ui/primitives.tsx";
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

  function cetak(row: typeof history[number]) {
    printSettlement(shiftSettlement(row), settings);
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

  return (
    <PageShell page="kas" title="Settlement" hint="Isi uang modal saat buka. Saat tutup, struk dan detail penjualan dicetak.">
      {open ? (
        <>
          <div className="grid grid-3">
            <Stat value={rp(open.kasAwal)} label={`Kas awal · ${open.cashierName}`} />
            <Stat value={rp(expected)} label="Seharusnya di laci" tone="ok" />
            <Stat
              value={new Date(open.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              label="Dibuka"
            />
          </div>
          <Callout title="Sesi berjalan">
            Tunai masuk, retur tunai, void tunai, dan pengeluaran dihitung ke laci. QRIS, transfer, dan kartu tidak.
          </Callout>
          <Button variant="primary" onClick={() => { setHitung(formatRupiahInput(String(expected))); setClosing(true); }}>
            Tutup kasir
          </Button>
        </>
      ) : (
        <div className="card-block">
          <H2>Buka kasir</H2>
          <Text tone="secondary">Hitung uang di laci, lalu simpan sebagai kas awal.</Text>
          {last?.kasHitung != null ? (
            <Text small tone="secondary">
              Tutup terakhir {rp(last.kasHitung)}
              {last.selisih ? ` · selisih ${rp(last.selisih)}` : ""}.
            </Text>
          ) : null}
          <label className="field-label">
            <span>Kas awal</span>
            <div className="money-field">
              <span>Rp</span>
              <input
                className="field"
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
        </div>
      )}

      {history.length ? (
        <table className="data">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Kasir</th>
              <th className="r">Awal</th>
              <th className="r">Sistem</th>
              <th className="r">Hitung</th>
              <th className="r">Selisih</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((s) => (
              <tr key={s.id} className="striped">
                <td>{formatDateTime(s.openedAt)}</td>
                <td>{s.cashierName}</td>
                <td className="r tabular">{rp(s.kasAwal)}</td>
                <td className="r tabular">{rp(s.kasSistem ?? 0)}</td>
                <td className="r tabular">{rp(s.kasHitung ?? 0)}</td>
                <td className="r tabular">{rp(s.selisih ?? 0)}</td>
                <td>
                  <Button variant="ghost" onClick={() => cetak(s)}>
                    Cetak
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {closing && open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <form
            className="modal extra-modal"
            onSubmit={(e) => {
              e.preventDefault();
              tutup();
            }}
          >
            <H2>Tutup kasir</H2>
            <Text tone="secondary">Hitung uang fisik di laci. Setelah tutup, struk 58mm dan detail A4 dicetak.</Text>
            <div className="pay-total">
              <span>Seharusnya</span>
              <b className="tabular">{rp(expected)}</b>
            </div>
            <label className="field-label">
              <span>Uang di laci</span>
              <div className="money-field extra-money">
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
            {parseRupiah(hitung) !== expected ? (
              <Text small tone="secondary">
                Selisih {rp(parseRupiah(hitung) - expected)}
              </Text>
            ) : (
              <Text small tone="secondary">Cocok dengan sistem.</Text>
            )}
            <label className="field-label">
              <span>Catatan (opsional)</span>
              <Field value={note} placeholder="Setoran, selisih, dll." onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="extra-actions">
              <Button type="submit" variant="primary">
                Tutup
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
