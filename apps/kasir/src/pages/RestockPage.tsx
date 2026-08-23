import { useMemo, useState, Fragment } from "react";
import {
  formatDateId,
  inIsoRange,
  localDayFromIso,
  monthStartIso,
  todayIso,
  type Product,
  type StockIn,
  type StoreSettings,
} from "@sklamini/shared";
import { Button, Field, H2, QtyStepper, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  deleteRestock,
  findProductByBarcode,
  listProducts,
  listRestocks,
  saveRestock,
  type Session,
} from "../lib/repo.ts";
import { scanBeep } from "../lib/beep.ts";
import { useScanFocus } from "../lib/useScanFocus.ts";
import { useToast } from "../ui/toast.tsx";

export function RestockPage({
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
  const [tab, setTab] = useState<"baru" | "riwayat">("baru");
  return (
    <PageShell
      page="restock"
      title="Restock"
      hint="Tambah stok barang masuk. Uang belanja dicatat di Pengeluaran."
      className="restock-page"
      actions={
        <div className="tabs">
          <button className={`tab ${tab === "baru" ? "on" : ""}`} type="button" onClick={() => setTab("baru")}>
            Restock baru
          </button>
          <button className={`tab ${tab === "riwayat" ? "on" : ""}`} type="button" onClick={() => setTab("riwayat")}>
            Riwayat
          </button>
        </div>
      }
    >
      {tab === "baru" ? (
        <RestockNew session={session} settings={settings} tick={tick} onChange={onChange} />
      ) : (
        <RestockHistory tick={tick} onChange={onChange} />
      )}
    </PageShell>
  );
}

function RestockNew({
  session,
  tick,
  onChange,
}: {
  session: Session;
  settings: StoreSettings;
  tick: number;
  onChange: () => void;
}) {
  const products = useMemo(() => listProducts(), [tick]);
  const toast = useToast();
  const [scan, setScan] = useState("");
  const [lines, setLines] = useState<{ product: Product; qty: number }[]>([]);
  const [removeLine, setRemoveLine] = useState<{ id: string; name: string } | null>(null);
  const { ref: scanRef, focus: focusScan } = useScanFocus(!removeLine, {
    restoreOnWindowFocus: true,
    returnAfterClick: true,
  });

  function add(p: Product, fromScan = false) {
    setLines((prev) => {
      const hit = prev.find((l) => l.product.id === p.id);
      if (hit) return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1 }];
    });
    setScan("");
    if (fromScan) scanBeep();
    focusScan(true);
  }

  function onScanChange(v: string) {
    const hit = findProductByBarcode(v.trim());
    if (hit) {
      add(hit, true);
      return;
    }
    setScan(v);
  }

  function setQty(id: string, qty: number) {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== id)
        : prev.map((l) => (l.product.id === id ? { ...l, qty } : l)),
    );
  }

  const q = scan.trim().toLowerCase();
  const visible = products.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.category.toLowerCase().includes(q),
  );
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="stack">
      <Field
        ref={scanRef}
        placeholder="Scan barcode barang masuk…"
        value={scan}
        onChange={(e) => onScanChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const hit = findProductByBarcode(scan.trim());
            if (hit) add(hit, true);
          }
        }}
      />

      <div className="restock-sheet">
        <div className="restock-cols restock-head">
          <span>Barang</span>
          <span>Qty</span>
          <span />
        </div>
        {lines.length === 0 ? (
          <div className="restock-empty">Belum ada barang. Scan atau pilih dari katalog di bawah.</div>
        ) : (
          lines.map((l) => (
            <div key={l.product.id} className="restock-cols restock-line">
              <div className="restock-name">
                <b>{l.product.name}</b>
                <span>{l.product.barcode}</span>
              </div>
              <div className="restock-qty">
                <QtyStepper value={l.qty} onChange={(qty) => setQty(l.product.id, qty)} />
              </div>
              <Button
                variant="ghost"
                className="restock-del"
                onClick={() => setRemoveLine({ id: l.product.id, name: l.product.name })}
              >
                Hapus
              </Button>
            </div>
          ))
        )}
        <div className="restock-save">
          <div>
            <span>Total qty</span>
            <b className="tabular">{totalQty}</b>
          </div>
          <Button
            variant="primary"
            disabled={!lines.length}
            onClick={() => {
              const doc = saveRestock({ cashier: session, lines });
              setLines([]);
              toast.show(`${doc.localNo} tersimpan`, "ok", "Stok bertambah. Catat bayar supplier di Pengeluaran.");
              onChange();
              focusScan(true);
            }}
          >
            Simpan
          </Button>
        </div>
      </div>

      <p className="restock-section">Katalog</p>
      <div className="restock-grid">
        {visible.map((p) => (
          <button key={p.id} type="button" className="restock-card" onClick={() => add(p)}>
            <b>{p.name}</b>
            <span>Stok {p.stock}</span>
          </button>
        ))}
      </div>
      {removeLine ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="stack">
              <H2>Hapus barang?</H2>
              <Text tone="secondary">
                {removeLine.name} akan dihapus dari daftar restock ini. Belum tersimpan ke stok.
              </Text>
              <div className="row">
                <Button onClick={() => setRemoveLine(null)}>Batal</Button>
                <span className="grow" />
                <Button
                  variant="danger"
                  onClick={() => {
                    setLines((prev) => prev.filter((l) => l.product.id !== removeLine.id));
                    setRemoveLine(null);
                  }}
                >
                  Hapus
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PeriodMode = "hari" | "bulan" | "custom";

function restockRange(mode: PeriodMode, from: string, to: string) {
  const today = todayIso();
  if (mode === "hari") return { from: today, to: today };
  if (mode === "bulan") return { from: monthStartIso(), to: today };
  return from <= to ? { from, to } : { from: to, to: from };
}

function RestockHistory({ tick, onChange }: { tick: number; onChange: () => void }) {
  const [mode, setMode] = useState<PeriodMode>("hari");
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());
  const range = useMemo(
    () => restockRange(mode, customFrom, customTo),
    [mode, customFrom, customTo],
  );
  const catById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of listProducts(true)) map.set(p.id, p.category);
    return map;
  }, [tick]);
  const docs = useMemo(
    () => listRestocks("all").filter((d) => inIsoRange(d.createdAt, range.from, range.to)),
    [tick, range],
  );
  const groups = useMemo(() => {
    const byDay = new Map<string, StockIn[]>();
    for (const d of docs) {
      const day = localDayFromIso(d.createdAt);
      const list = byDay.get(day);
      if (list) list.push(d);
      else byDay.set(day, [d]);
    }
    return [...byDay.entries()];
  }, [docs]);
  const [open, setOpen] = useState<StockIn | null>(null);
  const [removeDoc, setRemoveDoc] = useState<StockIn | null>(null);
  const toast = useToast();
  const totalQty = docs.reduce((n, d) => n + d.items.reduce((m, it) => m + it.qty, 0), 0);

  return (
    <>
    <div className="restock-history">
      <div className="restock-history-bar">
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
        <span className="grow" />
        <div className="restock-history-sum">
          <span>Total qty</span>
          <b className="tabular">{totalQty}</b>
        </div>
      </div>
      {docs.length === 0 ? (
        <div className="restock-history-empty">
          <b>Belum ada restock</b>
          <span>Nota barang masuk pada periode ini akan muncul di sini.</span>
        </div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nota</th>
              <th>Waktu</th>
              <th>Kasir</th>
              <th>Barang</th>
              <th>Kategori</th>
              <th className="r">Qty</th>
              <th className="r">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([day, dayDocs]) => {
              const dayQty = dayDocs.reduce((n, d) => n + d.items.reduce((m, it) => m + it.qty, 0), 0);
              return (
                <Fragment key={day}>
                  <tr className="restock-day-row">
                    <td colSpan={7}>
                      <b>{formatDateId(day)}</b>
                      <span>Total qty {dayQty}</span>
                    </td>
                  </tr>
                  {dayDocs.flatMap((d) => {
                    const items = d.items.length ? d.items : [];
                    return items.map((it, i) => (
                      <tr
                        key={it.id}
                        className="clickable striped"
                        onClick={() => setOpen(d)}
                      >
                        {i === 0 ? (
                          <>
                            <td rowSpan={items.length}>
                              <b>{d.localNo}</b>
                            </td>
                            <td rowSpan={items.length}>
                              {new Date(d.createdAt).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td rowSpan={items.length}>{d.cashierName}</td>
                          </>
                        ) : null}
                        <td className="restock-item-name">{it.name}</td>
                        <td>{catById.get(it.productId) || "—"}</td>
                        <td className="r tabular">{it.qty}</td>
                        {i === 0 ? (
                          <td className="r" rowSpan={items.length}>
                            <Button
                              variant="ghost"
                              className="restock-del"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRemoveDoc(d);
                              }}
                            >
                              Hapus
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ));
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
      {open ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal detail-modal">
            <div className="stack">
              <div className="row">
                <H2>{open.localNo}</H2>
                <span className="grow" />
                <Button
                  variant="danger"
                  onClick={() => setRemoveDoc(open)}
                >
                  Hapus
                </Button>
                <Button variant="ghost" onClick={() => setOpen(null)}>
                  Tutup
                </Button>
              </div>
              <div className="sale-meta">
                <div>
                  <span>Waktu</span>
                  <b>{new Date(open.createdAt).toLocaleString("id-ID")}</b>
                </div>
                <div>
                  <span>Kasir</span>
                  <b>{open.cashierName}</b>
                </div>
                <div>
                  <span>Item</span>
                  <b>{open.items.reduce((n, it) => n + it.qty, 0)}</b>
                </div>
              </div>
              <div className="detail-items">
                {open.items.map((it) => (
                  <div key={it.id} className="detail-line">
                    <div>
                      <b>{it.name}</b>
                      <span>{catById.get(it.productId) || "—"}</span>
                    </div>
                    <strong className="tabular">{it.qty}</strong>
                  </div>
                ))}
              </div>
              <div className="pay-total">
                <span>Total qty</span>
                <b className="tabular">{open.items.reduce((n, it) => n + it.qty, 0)}</b>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {removeDoc ? (
        <div className="overlay overlay-pin" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <div className="modal" style={{ width: 400 }}>
            <div className="stack">
              <H2>Hapus restock?</H2>
              <Text tone="secondary">
                {removeDoc.localNo} akan dihapus. Stok yang sudah ditambah dari nota ini akan dikurangi kembali.
              </Text>
              <div className="row">
                <Button onClick={() => setRemoveDoc(null)}>Batal</Button>
                <span className="grow" />
                <Button
                  variant="danger"
                  onClick={() => {
                    const res = deleteRestock(removeDoc.id);
                    if (!res.ok) {
                      toast.show(res.error, "error");
                      setRemoveDoc(null);
                      return;
                    }
                    if (open?.id === removeDoc.id) setOpen(null);
                    toast.show(`${removeDoc.localNo} dihapus`, "ok", "Stok sudah dikurangi.");
                    setRemoveDoc(null);
                    onChange();
                  }}
                >
                  Hapus
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
