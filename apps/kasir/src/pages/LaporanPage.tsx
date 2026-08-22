import { useMemo, useState } from "react";
import {
  formatDateId,
  monthStartIso,
  rp,
  todayIso,
  type StoreSettings,
} from "@sklamini/shared";
import { Button } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import { reportSummary, stockReport } from "../lib/repo.ts";
import { buildReportPdf, downloadPdf, type ReportPdfLine, type ReportPdfRow } from "../lib/pdf.ts";

function rpAkun(n: number, asNegative = false) {
  const v = Math.round(asNegative ? -Math.abs(n) : n);
  const body = "Rp. " + Math.abs(v).toLocaleString("id-ID");
  return v < 0 ? `-${body}` : body;
}

function rpCell(n: number) {
  if (!n) return "—";
  return "Rp. " + Math.round(n).toLocaleString("id-ID");
}

function qtyCell(n: number) {
  return n ? String(n) : "—";
}

type Tab = "laba" | "kas" | "stok";
type PeriodMode = "hari" | "bulan" | "custom";

function rangeOf(mode: PeriodMode, from: string, to: string) {
  const today = todayIso();
  if (mode === "hari") return { from: today, to: today };
  if (mode === "bulan") return { from: monthStartIso(), to: today };
  return from <= to ? { from, to } : { from: to, to: from };
}

export function LaporanPage({
  settings,
  tick,
}: {
  settings: StoreSettings;
  tick: number;
}) {
  const [tab, setTab] = useState<Tab>("laba");
  const [mode, setMode] = useState<PeriodMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(
    () => rangeOf(mode, customFrom, customTo),
    [mode, customFrom, customTo],
  );
  const data = useMemo(() => reportSummary(range), [tick, range]);
  const stok = useMemo(() => stockReport(range), [tick, range]);
  const r = data.rincian;
  const periode =
    range.from === range.to
      ? formatDateId(range.from)
      : `${formatDateId(range.from)} – ${formatDateId(range.to)}`;
  const title =
    tab === "laba" ? "LAPORAN LABA RUGI" : tab === "kas" ? "BUKU KAS" : "LAPORAN STOK";
  const slug =
    mode === "hari"
      ? range.from
      : mode === "bulan"
        ? range.from.slice(0, 7)
        : `${range.from}_${range.to}`;

  function unduhPdf() {
    const base = {
      storeName: settings.storeName,
      address: settings.address,
      phone: settings.phone,
      title,
      periode,
    };
    if (tab === "stok") {
      const rows: ReportPdfRow[] = [];
      let cat = "";
      stok.rows.forEach((row, i) => {
        if (row.category !== cat) {
          cat = row.category;
          rows.push({ cells: [cat.toUpperCase(), "", "", "", "", "", ""], section: true });
        }
        rows.push({
          cells: [
            String(i + 1),
            row.name,
            row.unit,
            String(row.awal),
            String(row.masuk),
            String(row.keluar),
            String(row.akhir),
          ],
        });
      });
      rows.push({
        cells: [
          "",
          "TOTAL QTY",
          "",
          String(stok.totals.awal),
          String(stok.totals.masuk),
          String(stok.totals.keluar),
          String(stok.totals.akhir),
        ],
        bold: true,
      });
      downloadPdf(
        `Laporan-Stok-${slug}.pdf`,
        buildReportPdf({
          ...base,
          table: {
            columns: [
              { label: "No", width: 28, align: "center" },
              { label: "Barang", width: 210 },
              { label: "Sat", width: 36 },
              { label: "Awal", width: 52, align: "right" },
              { label: "Masuk", width: 52, align: "right" },
              { label: "Keluar", width: 52, align: "right" },
              { label: "Akhir", width: 52, align: "right" },
            ],
            rows,
          },
          note: "Masuk = restock / retur / penyesuaian. Keluar = penjualan. Satuan berbeda, total qty hanya rekap.",
        }),
      );
      return;
    }
    if (tab === "kas") {
      downloadPdf(
        `Buku-Kas-${slug}.pdf`,
        buildReportPdf({
          ...base,
          table: {
            columns: [
              { label: "No", width: 28, align: "center" },
              { label: "Tanggal", width: 90 },
              { label: "Keterangan", width: 210 },
              { label: "Debit", width: 72, align: "right" },
              { label: "Kredit", width: 72, align: "right" },
              { label: "Saldo", width: 80, align: "right" },
            ],
            rows: data.bukuKas.map((row) => ({
              cells: [
                row.no == null ? "" : String(row.no),
                row.tanggal ? formatDateId(row.tanggal) : "",
                row.ket,
                row.no == null ? "—" : rpCell(row.debit),
                row.no == null ? "—" : rpCell(row.kredit),
                rpAkun(row.saldo),
              ],
              bold: row.no == null,
            })),
          },
          note: `QRIS ${rp(data.arusKas.qris)} · Transfer ${rp(data.arusKas.transfer)} · Kartu ${rp(data.arusKas.kartu)} · Kas laci ${rp(data.arusKas.kasLaci)}`,
        }),
      );
      return;
    }
    const lines: ReportPdfLine[] = [
      { label: "Pendapatan", kind: "section" },
      { label: "Penjualan (Omset)", value: rpAkun(r.penjualanKotor) },
      { label: "Retur penjualan", value: rpAkun(r.retur, true) },
      { label: "Pendapatan bersih", value: rpAkun(r.pendapatanBersih), kind: "total" },
      { label: "Harga pokok penjualan", kind: "section" },
      { label: "HPP (modal produk)", value: rpAkun(r.hppKotor, true) },
      { label: "HPP retur (kembali ke stok)", value: rpAkun(r.hppRetur) },
      { label: "HPP bersih", value: rpAkun(r.hppBersih, true), kind: "total" },
      { label: "Laba kotor", value: rpAkun(r.labaKotor), kind: "total" },
      { label: "Pengeluaran operasional", kind: "section" },
      ...r.beban.map((b) => ({ label: b.label, value: rpAkun(b.amount) })),
      { label: "Total pengeluaran", value: rpAkun(r.pengeluaran, true), kind: "total" },
      { label: "Laba bersih", value: rpAkun(r.labaBersih), kind: "net" },
    ];
    downloadPdf(`Laporan-Laba-Rugi-${slug}.pdf`, buildReportPdf({ ...base, lines }));
  }

  return (
    <PageShell
      page="laporan"
      title="Laporan keuangan"
      hint="Laba rugi, buku kas, dan mutasi stok."
      actions={
        <>
        <div className="tabs">
          <button className={`tab ${mode === "hari" ? "on" : ""}`} type="button" onClick={() => setMode("hari")}>
            Hari ini
          </button>
          <button className={`tab ${mode === "bulan" ? "on" : ""}`} type="button" onClick={() => setMode("bulan")}>
            Bulan ini
          </button>
          <button
            className={`tab ${mode === "custom" ? "on" : ""}`}
            type="button"
            onClick={() => {
              setCustomFrom(range.from);
              setCustomTo(range.to);
              setMode("custom");
            }}
          >
            Custom
          </button>
        </div>
        {mode === "custom" ? (
          <div className="period-range">
            <input
              className="field"
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value || todayIso())}
            />
            <span>s.d.</span>
            <input
              className="field"
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value || todayIso())}
            />
          </div>
        ) : null}
        <div className="tabs">
          <button className={`tab ${tab === "laba" ? "on" : ""}`} type="button" onClick={() => setTab("laba")}>
            Laba rugi
          </button>
          <button className={`tab ${tab === "kas" ? "on" : ""}`} type="button" onClick={() => setTab("kas")}>
            Arus kas
          </button>
          <button className={`tab ${tab === "stok" ? "on" : ""}`} type="button" onClick={() => setTab("stok")}>
            Stok
          </button>
        </div>
        <Button variant="primary" onClick={unduhPdf}>
          Unduh PDF
        </Button>
        </>
      }
    >
      <div className="report-sheet">
        <header className="report-head">
          {settings.logoDataUrl ? <img className="report-logo" src={settings.logoDataUrl} alt="" /> : null}
          <h1>{settings.storeName}</h1>
          <p>{settings.address}</p>
          <p>Telp: {settings.phone}</p>
          <h2>{title}</h2>
          <p>Periode: {periode}</p>
        </header>
        {tab === "laba" ? (
          <LabaRugiSheet r={r} />
        ) : tab === "kas" ? (
          <BukuKasSheet rows={data.bukuKas} kas={data.arusKas} />
        ) : (
          <StokSheet rows={stok.rows} totals={stok.totals} />
        )}
      </div>
    </PageShell>
  );
}

function LabaRugiSheet({
  r,
}: {
  r: ReturnType<typeof reportSummary>["rincian"];
}) {
  return (
    <div className="lr-sheet">
      <div className="report-row section">
        <span>Pendapatan</span>
      </div>
      <div className="report-row">
        <span>Penjualan (Omset)</span>
        <b className="tabular">{rpAkun(r.penjualanKotor)}</b>
      </div>
      <div className="report-row">
        <span>Retur penjualan</span>
        <b className="tabular">{rpAkun(r.retur, true)}</b>
      </div>
      <div className="report-row total">
        <span>Pendapatan bersih</span>
        <b className="tabular">{rpAkun(r.pendapatanBersih)}</b>
      </div>

      <div className="report-row section">
        <span>Harga pokok penjualan</span>
      </div>
      <div className="report-row">
        <span>HPP (modal produk)</span>
        <b className="tabular">{rpAkun(r.hppKotor, true)}</b>
      </div>
      <div className="report-row">
        <span>HPP retur (kembali ke stok)</span>
        <b className="tabular">{rpAkun(r.hppRetur)}</b>
      </div>
      <div className="report-row total">
        <span>HPP bersih</span>
        <b className="tabular">{rpAkun(r.hppBersih, true)}</b>
      </div>

      <div className="report-row total">
        <span>Laba kotor</span>
        <b className="tabular">{rpAkun(r.labaKotor)}</b>
      </div>

      <div className="report-row section">
        <span>Pengeluaran operasional</span>
      </div>
      {r.beban.map((b) => (
        <div key={b.key} className="report-row">
          <span>{b.label}</span>
          <b className="tabular">{rpAkun(b.amount)}</b>
        </div>
      ))}
      <div className="report-row total">
        <span>Total pengeluaran</span>
        <b className="tabular">{rpAkun(r.pengeluaran, true)}</b>
      </div>

      <div className="report-row total net">
        <span>Laba bersih</span>
        <b className="tabular">{rpAkun(r.labaBersih)}</b>
      </div>
    </div>
  );
}

function BukuKasSheet({
  rows,
  kas,
}: {
  rows: ReturnType<typeof reportSummary>["bukuKas"];
  kas: ReturnType<typeof reportSummary>["arusKas"];
}) {
  return (
    <div>
      <table className="buku-kas">
        <thead>
          <tr>
            <th className="c">No</th>
            <th>Tanggal</th>
            <th>Keterangan</th>
            <th className="r">Debit</th>
            <th className="r">Kredit</th>
            <th className="r">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.no == null ? "open" : undefined}>
              <td className="c">{row.no ?? ""}</td>
              <td>{row.tanggal ? formatDateId(row.tanggal) : ""}</td>
              <td>{row.ket}</td>
              <td className="r tabular">{row.no == null ? "—" : rpCell(row.debit)}</td>
              <td className="r tabular">{row.no == null ? "—" : rpCell(row.kredit)}</td>
              <td className="r tabular">{rpAkun(row.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="buku-foot">
        <div>
          <span>QRIS</span>
          <b className="tabular">{rp(kas.qris)}</b>
        </div>
        <div>
          <span>Transfer</span>
          <b className="tabular">{rp(kas.transfer)}</b>
        </div>
        <div>
          <span>Kartu</span>
          <b className="tabular">{rp(kas.kartu)}</b>
        </div>
        <div>
          <span>Hutang</span>
          <b className="tabular">{rp(kas.hutang)}</b>
        </div>
        <div>
          <span>Pelunasan</span>
          <b className="tabular">{rp(kas.pelunasan)}</b>
        </div>
        <div>
          <span>Kas laci</span>
          <b className="tabular">{rp(kas.kasLaci)}</b>
        </div>
      </div>
      <p className="buku-note">
        Buku kas hanya mencatat tunai di laci. Saldo awal diambil dari kas awal shift pertama di periode.
        Retur tunai keluar dari laci. Pembelian barang dicatat di Pengeluaran. Restock hanya menambah stok.
        QRIS, transfer, dan kartu tidak masuk saldo.
      </p>
    </div>
  );
}

function StokSheet({
  rows,
  totals,
}: {
  rows: ReturnType<typeof stockReport>["rows"];
  totals: ReturnType<typeof stockReport>["totals"];
}) {
  const body: { key: string; kind: "cat" | "row"; row?: (typeof rows)[number]; cat?: string; no?: number }[] = [];
  let cat = "";
  let no = 0;
  for (const row of rows) {
    if (row.category !== cat) {
      cat = row.category;
      body.push({ key: `c-${cat}`, kind: "cat", cat });
    }
    no += 1;
    body.push({ key: row.productId, kind: "row", row, no });
  }
  return (
    <div>
      <table className="buku-kas stok-kas">
        <thead>
          <tr>
            <th className="c">No</th>
            <th>Barang</th>
            <th>Sat</th>
            <th className="r">Awal</th>
            <th className="r">Masuk</th>
            <th className="r">Keluar</th>
            <th className="r">Akhir</th>
          </tr>
        </thead>
        <tbody>
          {body.length === 0 ? (
            <tr>
              <td colSpan={7} className="stok-empty">
                Belum ada data stok.
              </td>
            </tr>
          ) : (
            body.map((item) =>
              item.kind === "cat" ? (
                <tr key={item.key} className="stok-cat">
                  <td colSpan={7}>{item.cat}</td>
                </tr>
              ) : (
                <tr key={item.key}>
                  <td className="c">{item.no}</td>
                  <td>
                    <b>{item.row!.name}</b>
                    <span className="stok-barcode">{item.row!.barcode}</span>
                  </td>
                  <td>{item.row!.unit}</td>
                  <td className="r tabular">{qtyCell(item.row!.awal)}</td>
                  <td className="r tabular">{qtyCell(item.row!.masuk)}</td>
                  <td className="r tabular">{qtyCell(item.row!.keluar)}</td>
                  <td className="r tabular">
                    <b>{item.row!.akhir}</b>
                  </td>
                </tr>
              ),
            )
          )}
        </tbody>
        {rows.length ? (
          <tfoot>
            <tr className="open">
              <td />
              <td>Total qty</td>
              <td />
              <td className="r tabular">{totals.awal}</td>
              <td className="r tabular">{totals.masuk}</td>
              <td className="r tabular">{totals.keluar}</td>
              <td className="r tabular">{totals.akhir}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <p className="buku-note">
        Masuk dari restock, retur, void, atau opname lebih. Keluar dari penjualan atau opname kurang. Stok akhir = awal + masuk − keluar.
      </p>
    </div>
  );
}
