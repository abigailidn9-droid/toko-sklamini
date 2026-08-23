import { useMemo, useState } from "react";
import { formatDateId, formatDateTime, formatQty, localDayFromIso, roundQty, type Opname } from "@sklamini/shared";
import { Button, Callout, Field, Text } from "../ui/primitives.tsx";
import { useScanFocus } from "../lib/useScanFocus.ts";
import { PageShell } from "../components/PageHeader.tsx";
import { listOpnames, listProducts, loadSettings, saveOpname, type Session } from "../lib/repo.ts";
import { buildReportPdf, downloadPdf } from "../lib/pdf.ts";
import { useToast } from "../ui/toast.tsx";

function signed(n: number) {
  return n > 0 ? `+${formatQty(n)}` : formatQty(n);
}

function parseFisik(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundQty(n);
}

function unduhOpnamePdf(input: {
  localNo?: string;
  cashierName: string;
  createdAt: string;
  note?: string;
  rows: { name: string; unit: string; sistem: number; fisik: number | null; selisih: number | null }[];
}) {
  const settings = loadSettings();
  const when = formatDateTime(input.createdAt);
  const slug = (input.localNo ?? formatDateId(localDayFromIso(input.createdAt))).replace(/\s+/g, "-");
  const filled = input.rows.filter((r) => r.fisik != null);
  downloadPdf(
    `Opname-${slug}.pdf`,
    buildReportPdf({
      storeName: settings.storeName,
      address: settings.address,
      phone: settings.phone,
      title: "LAPORAN STOCK OPNAME",
      periode: [input.localNo, when, `Kasir ${input.cashierName}`].filter(Boolean).join(" · "),
      table: {
        columns: [
          { label: "No", width: 28, align: "center" },
          { label: "Barang", width: 220 },
          { label: "Sat", width: 36 },
          { label: "Sistem", width: 55, align: "right" },
          { label: "Fisik", width: 55, align: "right" },
          { label: "Selisih", width: 55, align: "right" },
        ],
        rows: [
          ...input.rows.map((r, i) => ({
            cells: [
              String(i + 1),
              r.name,
              r.unit,
              String(r.sistem),
              r.fisik == null ? "-" : String(r.fisik),
              r.selisih == null ? "-" : signed(r.selisih),
            ],
          })),
          {
            cells: [
              "",
              "TOTAL",
              "",
              String(input.rows.reduce((n, r) => n + r.sistem, 0)),
              filled.length ? String(filled.reduce((n, r) => n + (r.fisik ?? 0), 0)) : "-",
              filled.length ? signed(filled.reduce((n, r) => n + (r.selisih ?? 0), 0)) : "-",
            ],
            bold: true,
          },
        ],
      },
      note:
        input.note?.trim() ||
        "Selisih = fisik - sistem. Tanda - pada fisik berarti belum dihitung.",
    }),
  );
}

export function OpnamePage({
  session,
  tick,
  onChange,
}: {
  session: Session;
  tick: number;
  onChange: () => void;
}) {
  const toast = useToast();
  const products = useMemo(() => listProducts(), [tick]);
  const history = useMemo(() => listOpnames(), [tick]);
  const [fisik, setFisik] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"baru" | "riwayat">("baru");
  const { ref: scanRef } = useScanFocus(tab === "baru");

  const needle = q.trim().toLowerCase();
  const shown = products.filter(
    (p) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.barcode.includes(needle) ||
      p.category.toLowerCase().includes(needle),
  );

  const diffs = shown
    .map((p) => {
      const raw = fisik[p.id];
      if (raw == null || raw === "") return null;
      const n = parseFisik(raw);
      if (n == null) return null;
      const selisih = n - p.stock;
      return selisih === 0 ? null : { product: p, fisik: n, selisih };
    })
    .filter((x): x is { product: (typeof products)[number]; fisik: number; selisih: number } => Boolean(x));

  function unduhHitung() {
    if (!shown.length) {
      toast.show("Tidak ada barang", "info", "Katalog kosong atau filter tidak ketemu.");
      return;
    }
    unduhOpnamePdf({
      cashierName: session.name,
      createdAt: new Date().toISOString(),
      note,
      rows: shown.map((p) => {
        const raw = fisik[p.id];
        const fisikN = raw == null || raw === "" ? null : parseFisik(raw);
        return {
          name: p.name,
          unit: p.unit,
          sistem: p.stock,
          fisik: fisikN,
          selisih: fisikN == null ? null : fisikN - p.stock,
        };
      }),
    });
    toast.show("PDF diunduh", "ok", "Form stock opname A4.");
  }

  function unduhRiwayat(doc: Opname) {
    unduhOpnamePdf({
      localNo: doc.localNo,
      cashierName: doc.cashierName,
      createdAt: doc.createdAt,
      note: doc.note,
      rows: doc.items.map((it) => ({
        name: it.name,
        unit: it.unit,
        sistem: it.sistem,
        fisik: it.fisik,
        selisih: it.selisih,
      })),
    });
    toast.show("PDF diunduh", "ok", doc.localNo);
  }

  function simpan() {
    try {
      const doc = saveOpname({
        cashier: session,
        note,
        lines: diffs.map((d) => ({ product: d.product, fisik: d.fisik })),
      });
      setFisik({});
      setNote("");
      toast.show("Opname tersimpan", "ok", `${doc.localNo} · ${doc.items.length} barang disesuaikan`);
      onChange();
    } catch (e) {
      toast.show("Opname gagal", "error", e instanceof Error ? e.message : "Isi stok fisik yang berbeda.");
    }
  }

  return (
    <PageShell
      page="opname"
      title="Opname stok"
      hint="Isi jumlah fisik di rak. Yang berbeda dari sistem akan disesuaikan."
      actions={
        <>
          <div className="tabs">
            <button className={`tab ${tab === "baru" ? "on" : ""}`} type="button" onClick={() => setTab("baru")}>
              Hitung
            </button>
            <button className={`tab ${tab === "riwayat" ? "on" : ""}`} type="button" onClick={() => setTab("riwayat")}>
              Riwayat
            </button>
          </div>
          {tab === "baru" ? (
            <Button onClick={unduhHitung} disabled={!shown.length}>
              Unduh PDF
            </Button>
          ) : null}
        </>
      }
    >
      {tab === "baru" ? (
        <>
          <Field
            ref={scanRef}
            placeholder="Cari nama atau barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Callout title="Cara isi">
            Kosongkan kalau tidak dihitung. Isi angka fisik, termasuk 0 jika rak kosong.
          </Callout>
          <table className="data">
            <thead>
              <tr>
                <th>Barang</th>
                <th className="r">Sistem</th>
                <th className="r">Fisik</th>
                <th className="r">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const raw = fisik[p.id] ?? "";
                const n = raw === "" ? null : parseFisik(raw);
                const selisih = n == null ? null : n - p.stock;
                return (
                  <tr key={p.id} className="striped">
                    <td>
                      <b>{p.name}</b>
                      <div className="faint">{p.barcode} · {p.unit}</div>
                    </td>
                    <td className="r tabular">{formatQty(p.stock)}</td>
                    <td className="r">
                      <input
                        className="field opname-qty"
                        inputMode="decimal"
                        placeholder="—"
                        value={raw}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d.,]/g, "");
                          setFisik((prev) => ({ ...prev, [p.id]: v }));
                        }}
                      />
                    </td>
                    <td className="r tabular">
                      {selisih == null ? "—" : selisih > 0 ? `+${selisih}` : String(selisih)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label className="field-label">
            <span>Catatan</span>
            <Field value={note} placeholder="Opname rak depan, dll." onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <Button variant="primary" disabled={!diffs.length} onClick={simpan}>
              Simpan {diffs.length ? `${diffs.length} selisih` : "selisih"}
            </Button>
            <Text small tone="secondary">
              Stok sistem langsung mengikuti hasil hitung.
            </Text>
          </div>
        </>
      ) : history.length === 0 ? (
        <Callout title="Belum ada opname">Hasil hitung stok akan tampil di sini.</Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nota</th>
              <th>Waktu</th>
              <th>Kasir</th>
              <th>Barang</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((o) => (
              <tr key={o.id} className="striped">
                <td><b>{o.localNo}</b></td>
                <td>{formatDateTime(o.createdAt)}</td>
                <td>{o.cashierName}</td>
                <td>
                  {o.items.map((it) => `${it.name} ${it.sistem}→${it.fisik}`).join(", ")}
                </td>
                <td>
                  <Button variant="ghost" onClick={() => unduhRiwayat(o)}>
                    Unduh PDF
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
