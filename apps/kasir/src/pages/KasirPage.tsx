import { useEffect, useMemo, useRef, useState } from "react";
import {
  PAY_METHOD_LABEL,
  calcPpn,
  formatQty,
  formatRupiahInput,
  looksLikeCompleteBarcode,
  MEMBER_REWARD_NAME,
  MEMBER_VISIT_GOAL,
  parseRupiah,
  ppnLabel,
  rp,
  type CartLine,
  type CartSnapshot,
  type PayMethod,
  type Product,
  type StoreSettings,
} from "@sklamini/shared";
import { Button, Callout, Field, H2, QtyStepper, Stat, Text } from "../ui/primitives.tsx";
import { PageShell } from "../components/PageHeader.tsx";
import {
  checkout,
  currentOpenShift,
  deleteDraft,
  findProductByBarcode,
  lastClosedShift,
  latestCompletedSale,
  listDrafts,
  listMembers,
  listProducts,
  memberPendingRewards,
  memberVisitCount,
  openCashShift,
  saveDraft,
  type Session,
} from "../lib/repo.ts";
import { missBeep, scanBeep } from "../lib/beep.ts";
import { useScanFocus } from "../lib/useScanFocus.ts";
import { printStruk } from "../lib/print.ts";
import { useToast } from "../ui/toast.tsx";

function looksLikeScanCode(raw: string) {
  const t = raw.trim();
  if (looksLikeCompleteBarcode(t)) return true;
  return t.length >= 8 && !/\s/.test(t) && /^[0-9A-Za-z-]{8,32}$/.test(t);
}

function parsePct(raw: string) {
  const n = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

type ExtraKind = "ongkir" | "diskon" | "catatan";

function CartExtraIcon({ name }: { name: ExtraKind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "ongkir") {
    return (
      <svg {...common}>
        <rect x="2.5" y="7" width="11.5" height="9.5" rx="1.2" />
        <path d="M14 10.5h3.2L20 13.4V16.5h-6" />
        <circle cx="7" cy="17.8" r="1.35" />
        <circle cx="17" cy="17.8" r="1.35" />
      </svg>
    );
  }
  if (name === "diskon") {
    return (
      <svg {...common}>
        <path d="M12.8 4.8 19.2 11.2a1.4 1.4 0 0 1 0 2L11.2 21.2a1.4 1.4 0 0 1-2 0L3.8 15.8a1.4 1.4 0 0 1 0-2L10.2 7.4a1.4 1.4 0 0 1 2 0Z" />
        <circle cx="15.2" cy="8.8" r="1.15" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 4.5h8a1 1 0 0 1 1 1V19l-5-2.1L7 19V5.5a1 1 0 0 1 1-1Z" />
      <path d="M10.2 9h3.6M10.2 12.2h2.6" />
    </svg>
  );
}

function CartExtraBtn({
  name,
  label,
  active,
  onOpen,
}: {
  name: ExtraKind;
  label: string;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`cart-extra-icon${active ? " on" : ""}`}
      title={label}
      aria-label={label}
      onClick={onOpen}
    >
      <CartExtraIcon name={name} />
      <span>{label}</span>
    </button>
  );
}

type LiveCart = {
  items: CartLine[];
  discountStr: string;
  discMode: "rp" | "pct";
  deliveryStr: string;
  note: string;
};

function liveCartKey(cashierId: string) {
  return `sklamini.live-cart.${cashierId}`;
}

function loadLiveCart(cashierId: string): LiveCart | null {
  try {
    const raw = sessionStorage.getItem(liveCartKey(cashierId));
    if (!raw) return null;
    const data = JSON.parse(raw) as LiveCart;
    if (!Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveLiveCart(cashierId: string, data: LiveCart) {
  sessionStorage.setItem(liveCartKey(cashierId), JSON.stringify(data));
}

function clearLiveCart(cashierId: string) {
  sessionStorage.removeItem(liveCartKey(cashierId));
}

export function KasirPage({
  session,
  settings,
  restore,
  onRestoreUsed,
  onPaid,
  onHeld,
  onRefresh,
  tick,
}: {
  session: Session;
  settings: StoreSettings;
  restore: CartSnapshot | null;
  onRestoreUsed: () => void;
  onPaid: (saleId: string, total: number) => void;
  onHeld: () => void;
  onRefresh: () => void;
  tick: number;
}) {
  const products = useMemo(() => listProducts(), [tick]);
  const shift = useMemo(() => currentOpenShift(), [tick]);
  const lastShift = useMemo(() => lastClosedShift(), [tick]);
  const [kasAwalStr, setKasAwalStr] = useState(() => {
    const last = lastClosedShift();
    return last?.kasHitung ? formatRupiahInput(String(last.kasHitung)) : "";
  });
  const saved = useMemo(() => loadLiveCart(session.id), [session.id]);
  const [scan, setScan] = useState("");
  const [cat, setCat] = useState("Semua");
  const [cart, setCart] = useState<CartLine[]>(() => saved?.items ?? []);
  const [discountStr, setDiscountStr] = useState(() => saved?.discountStr ?? "");
  const [discMode, setDiscMode] = useState<"rp" | "pct">(() => saved?.discMode ?? "rp");
  const [deliveryStr, setDeliveryStr] = useState(() => saved?.deliveryStr ?? "");
  const [note, setNote] = useState(() => saved?.note ?? "");
  const [extraEdit, setExtraEdit] = useState<ExtraKind | null>(null);
  const [priceEditId, setPriceEditId] = useState<string | null>(null);
  const [priceEditStr, setPriceEditStr] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("tunai");
  const [cashIn, setCashIn] = useState("100.000");
  const [memberId, setMemberId] = useState<string | null>(null);
  const toast = useToast();
  const [err, setErr] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const scanBurstRef = useRef(false);
  const scanPrevRef = useRef("");
  const scanAtRef = useRef(0);
  const lastSale = useMemo(() => latestCompletedSale(), [tick]);
  const overlayOpen = Boolean(payOpen || extraEdit || clearOpen || priceEditId || !shift);
  const { ref: scanRef, focus: focusScan } = useScanFocus(!overlayOpen, {
    restoreOnWindowFocus: true,
    returnAfterClick: true,
  });

  useEffect(() => {
    if (restore) {
      setCart(restore.items);
      setDiscountStr(restore.discount ? formatRupiahInput(String(restore.discount)) : "");
      setDiscMode("rp");
      setDeliveryStr(restore.deliveryCost ? formatRupiahInput(String(restore.deliveryCost)) : "");
      setNote(restore.note ?? "");
      onRestoreUsed();
    }
  }, [restore, onRestoreUsed]);

  useEffect(() => {
    if (!cart.length && !discountStr && !deliveryStr && !note) {
      clearLiveCart(session.id);
      return;
    }
    saveLiveCart(session.id, { items: cart, discountStr, discMode, deliveryStr, note });
  }, [cart, discountStr, discMode, deliveryStr, note, session.id]);

  const categories = ["Semua", ...Array.from(new Set(products.map((p) => p.category)))];
  const q = scan.trim().toLowerCase();
  const visible = products.filter(
    (p) =>
      (cat === "Semua" || p.category === cat) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.category.toLowerCase().includes(q)),
  );

  const subtotal = cart.reduce((n, l) => n + l.sellPrice * l.qty, 0);
  const discount =
    discMode === "pct"
      ? Math.min(subtotal, Math.round((subtotal * parsePct(discountStr)) / 100))
      : Math.min(parseRupiah(discountStr), subtotal);
  const deliveryCost = parseRupiah(deliveryStr);
  const ppn = calcPpn(subtotal, discount, settings.ppnEnabled, settings.ppnRate);
  const total = Math.max(0, subtotal - discount + ppn + deliveryCost);
  const paid = parseRupiah(cashIn);
  const change = payMethod === "tunai" ? Math.max(0, paid - total) : 0;

  function resetCart() {
    setCart([]);
    setDiscountStr("");
    setDiscMode("rp");
    setDeliveryStr("");
    setNote("");
    setExtraEdit(null);
    setPriceEditId(null);
    setMemberId(null);
  }

  function missBarcode(code: string) {
    missBeep();
    toast.show("Barcode tidak ketemu", "error", code);
    setScan("");
    scanBurstRef.current = false;
    scanPrevRef.current = "";
    focusScan(true);
  }

  function addProduct(p: Product, fromScan = false) {
    let blocked = false;
    setCart((prev) => {
      const hit = prev.find((l) => l.productId === p.id);
      const qty = hit?.qty ?? 0;
      if (p.stock <= 0 || qty + 1 > p.stock) {
        blocked = true;
        return prev;
      }
      if (hit) {
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: p.id,
          barcode: p.barcode,
          name: p.name,
          unit: p.unit,
          qty: 1,
          sellPrice: p.sellPrice,
          costPrice: p.buyPrice,
        },
      ];
    });
    setScan("");
    scanBurstRef.current = false;
    scanPrevRef.current = "";
    if (blocked) {
      missBeep();
      toast.show(p.stock <= 0 ? "Stok habis" : "Stok tidak cukup", "error", `${p.name} · sisa ${p.stock} ${p.unit}`);
      return;
    }
    if (fromScan) scanBeep();
    focusScan(true);
  }

  function onScanChange(v: string) {
    const now = Date.now();
    const prev = scanPrevRef.current;
    const dt = now - scanAtRef.current;
    scanAtRef.current = now;
    scanPrevRef.current = v;
    if (v.trim().length - prev.trim().length >= 6 || (dt < 45 && v.length > prev.length)) {
      scanBurstRef.current = true;
    }
    const hit = findProductByBarcode(v.trim());
    if (hit) {
      addProduct(hit, true);
      return;
    }
    setScan(v);
  }

  useEffect(() => {
    if (!scan.trim()) return;
    const t = window.setTimeout(() => {
      if (!scanBurstRef.current || !looksLikeScanCode(scan)) return;
      if (findProductByBarcode(scan.trim())) return;
      missBarcode(scan.trim());
    }, 140);
    return () => window.clearTimeout(t);
  }, [scan]);

  function setQty(productId: string, qty: number) {
    const p = products.find((x) => x.id === productId);
    const max = Math.max(0, p?.stock ?? 0);
    if (qty > max) {
      missBeep();
      toast.show("Stok tidak cukup", "error", p ? `${p.name} · sisa ${max} ${p.unit}` : `Sisa ${max}`);
      qty = max;
    }
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    );
    if (qty <= 0 && priceEditId === productId) setPriceEditId(null);
  }

  function commitPrice() {
    if (!priceEditId) return;
    const next = parseRupiah(priceEditStr);
    setCart((prev) => prev.map((l) => (l.productId === priceEditId ? { ...l, sellPrice: next } : l)));
    setPriceEditId(null);
  }

  function switchDiscMode(mode: "rp" | "pct") {
    if (mode === discMode) return;
    if (mode === "pct") {
      const pct = subtotal ? Math.round((discount / subtotal) * 1000) / 10 : 0;
      setDiscountStr(pct ? String(pct) : "");
    } else {
      setDiscountStr(discount ? formatRupiahInput(String(discount)) : "");
    }
    setDiscMode(mode);
  }

  function hold() {
    if (!shift) {
      toast.show("Kasir belum dibuka", "error", "Isi kas awal dulu.");
      return;
    }
    if (!cart.length) return;
    saveDraft({
      cashier: session,
      items: cart,
      discount,
      deliveryCost,
      note,
    });
    resetCart();
    toast.show("Ditahan ke Draft", "ok", "Buka menu Draft untuk melanjutkan.");
    onHeld();
  }

  function openPay() {
    if (!shift) {
      toast.show("Kasir belum dibuka", "error", "Isi kas awal dulu.");
      return;
    }
    if (!cart.length) return;
    setPayMethod("tunai");
    const current = parseRupiah(cashIn);
    setCashIn(formatRupiahInput(String(current >= total ? current : total)));
    setPayOpen(true);
  }

  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (e.key === "F12") {
        e.preventDefault();
        if (payOpen) savePay();
        else openPay();
      }
      if (e.key === "F11") {
        e.preventDefault();
        if (!payOpen) hold();
      }
      if (e.key === "Escape") {
        if (extraEdit) setExtraEdit(null);
        else setPayOpen(false);
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  function savePay() {
    try {
      const sale = checkout({
        lines: cart,
        method: payMethod,
        paid: payMethod === "tunai" ? paid : total,
        cashier: session,
        discount,
        deliveryCost,
        ppn,
        ppnRate: settings.ppnEnabled ? settings.ppnRate : 0,
        note,
        customerId: memberId,
        payments: [{ method: payMethod, amount: total }],
      });
      const visits = memberId ? memberVisitCount(memberId) : 0;
      const pending = memberId ? memberPendingRewards(memberId) : 0;
      resetCart();
      setPayOpen(false);
      setErr("");
      toast.show("Transaksi tersimpan", "ok", sale.localNo);
      if (pending > 0) {
        toast.show("Hadiah member", "ok", `${MEMBER_REWARD_NAME} · ${visits} kali belanja`);
      }
      onPaid(sale.id, sale.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal simpan";
      setErr(msg);
      toast.show("Transaksi gagal", "error", msg);
    }
  }

  return (
    <>
      <div className="kasir-layout">
        <div className="kasir-catalog">
          <div className="kasir-toolbar">
            <div className="row">
              <Field
                ref={scanRef}
                placeholder="Scan barcode atau cari nama…"
                value={scan}
                onChange={(e) => onScanChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const code = scan.trim();
                  const hit =
                    findProductByBarcode(code) ||
                    products.find((p) => p.name.toLowerCase() === code.toLowerCase());
                  if (hit) {
                    addProduct(hit, Boolean(findProductByBarcode(code)));
                    return;
                  }
                  if (looksLikeScanCode(code)) missBarcode(code);
                }}
              />
              <Button
                type="button"
                onClick={() => {
                  const q = scan.trim().toLowerCase();
                  if (!q) return;
                  const hit = products.find(
                    (p) => p.name.toLowerCase().includes(q) || p.barcode === scan.trim(),
                  );
                  if (hit) addProduct(hit);
                  else if (looksLikeScanCode(scan.trim())) missBarcode(scan.trim());
                }}
              >
                Tambah
              </Button>
            </div>
            <div className="cat-filters">
              {categories.map((c) => (
                <button
                  key={c}
                  className={`cat-filter ${cat === c ? "on" : ""}`}
                  type="button"
                  onClick={() => setCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="product-empty">
              <p>Tidak ada produk</p>
              <span>Ubah kategori atau kata pencarian</span>
            </div>
          ) : (
            <div className="product-grid">
              {visible.map((p) => {
                const stockState = p.stock <= 0 ? "out" : p.stock <= 5 ? "low" : "ok";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`product-card ${stockState}`}
                    title={p.stock <= 0 ? "Stok habis" : undefined}
                    onClick={() => addProduct(p)}
                  >
                    <b>{p.name}</b>
                    <strong className="product-price tabular">{rp(p.sellPrice)}</strong>
                    <em className="product-stock">
                      {p.stock <= 0 ? "Habis" : `${formatQty(p.stock)} ${p.unit}`}
                    </em>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <aside className="cart-panel">
          <div className="cart-head">
            <div className="cart-head-title">
              <span className="cart-head-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 5h2l1.5 10h10l2-7H7" />
                  <circle cx="9" cy="19" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <div>
                <h2 className="h2">Keranjang</h2>
                <span className="cart-head-sub">
                  {cart.length
                    ? "Siap dibayar"
                    : lastSale
                      ? `Terakhir ${lastSale.localNo}`
                      : "Belum ada barang"}
                </span>
              </div>
            </div>
            <div className="cart-head-side">
              {lastSale ? (
                <button
                  type="button"
                  className="cart-reprint"
                  onClick={() => {
                    printStruk(lastSale, settings);
                  }}
                >
                  Cetak ulang
                </button>
              ) : null}
              <span className="cart-count">
                {cart.reduce((n, l) => n + l.qty, 0)}
              </span>
            </div>
          </div>
          <div className="cart-lines">
            {cart.length === 0 ? (
              <div className="cart-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4 5h2l1.5 10h10l2-7H7" />
                  <circle cx="9" cy="19" r="1.4" fill="currentColor" stroke="none" />
                  <circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none" />
                </svg>
                <p>Belum ada barang</p>
                <span>Scan barcode atau klik produk</span>
              </div>
            ) : (
              cart.map((l) => {
                const catalog = products.find((p) => p.id === l.productId)?.sellPrice;
                const edited = catalog != null && catalog !== l.sellPrice;
                const editingPrice = priceEditId === l.productId;
                return (
                <div key={l.productId} className="cart-item">
                  <div className="cart-item-info">
                    <b>{l.name}</b>
                    {editingPrice ? (
                      <div className="cart-price-edit">
                        <span>Rp</span>
                        <input
                          className="field"
                          inputMode="numeric"
                          aria-label={`Harga ${l.name}`}
                          value={priceEditStr}
                          onChange={(e) => setPriceEditStr(formatRupiahInput(e.target.value))}
                          autoFocus
                          onBlur={commitPrice}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`cart-price-btn${edited ? " on" : ""}`}
                        title="Ubah harga"
                        onClick={() => {
                          setPriceEditId(l.productId);
                          setPriceEditStr(formatRupiahInput(String(l.sellPrice)));
                        }}
                      >
                        {rp(l.sellPrice)}
                      </button>
                    )}
                  </div>
                  <div className="cart-item-qty">
                    <QtyStepper value={l.qty} onChange={(qty) => setQty(l.productId, qty)} />
                    <button
                      type="button"
                      className="cart-item-del"
                      aria-label={`Hapus ${l.name}`}
                      onClick={() => setQty(l.productId, 0)}
                    >
                      Hapus
                    </button>
                  </div>
                  <div className="cart-item-sum tabular">{rp(l.sellPrice * l.qty)}</div>
                </div>
                );
              })
            )}
          </div>
          <div className="cart-footer">
            <div className="cart-extras" role="toolbar" aria-label="Ongkir, diskon, catatan">
              <CartExtraBtn
                name="ongkir"
                label="Ongkir"
                active={Boolean(deliveryCost)}
                onOpen={() => setExtraEdit("ongkir")}
              />
              <CartExtraBtn
                name="diskon"
                label="Diskon"
                active={Boolean(discount)}
                onOpen={() => setExtraEdit("diskon")}
              />
              <CartExtraBtn
                name="catatan"
                label="Catatan"
                active={Boolean(note.trim())}
                onOpen={() => setExtraEdit("catatan")}
              />
            </div>
            {discount || deliveryCost || settings.ppnEnabled ? (
              <div className="cart-break">
                <div>
                  <span>Subtotal</span>
                  <b className="tabular">{rp(subtotal)}</b>
                </div>
                {discount ? (
                  <div>
                    <span>{discMode === "pct" ? `Diskon ${parsePct(discountStr)}%` : "Diskon"}</span>
                    <b className="tabular">-{rp(discount)}</b>
                  </div>
                ) : null}
                {settings.ppnEnabled ? (
                  <div>
                    <span>{ppnLabel(settings.ppnRate)}</span>
                    <b className="tabular">{rp(ppn)}</b>
                  </div>
                ) : null}
                {deliveryCost ? (
                  <div>
                    <span>Ongkir</span>
                    <b className="tabular">{rp(deliveryCost)}</b>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="cart-total">
              <span>Total</span>
              <b className="tabular">{rp(total)}</b>
            </div>
            <Button variant="pay" disabled={!cart.length} onClick={openPay}>
              Bayar · F12
            </Button>
            <div className="cart-actions">
              <Button className="cart-btn" onClick={hold} disabled={!cart.length}>
                Tahan · F11
              </Button>
              <Button
                variant="danger"
                className="cart-btn"
                disabled={!cart.length}
                onClick={() => setClearOpen(true)}
              >
                Batal
              </Button>
            </div>
          </div>
        </aside>
      </div>
      {extraEdit ? (
        <ExtraFillDialog
          kind={extraEdit}
          subtotal={subtotal}
          deliveryStr={deliveryStr}
          setDeliveryStr={setDeliveryStr}
          discountStr={discountStr}
          setDiscountStr={setDiscountStr}
          discMode={discMode}
          switchDiscMode={switchDiscMode}
          note={note}
          setNote={setNote}
          onClear={() => {
            if (extraEdit === "ongkir") setDeliveryStr("");
            if (extraEdit === "diskon") setDiscountStr("");
            if (extraEdit === "catatan") setNote("");
            setExtraEdit(null);
          }}
          onClose={() => setExtraEdit(null)}
        />
      ) : null}
      {clearOpen ? (
        <div className="overlay" style={{ position: "fixed", inset: 0 }}>
          <div className="modal" style={{ width: 380 }}>
            <div className="stack">
              <H2>Batalkan keranjang?</H2>
              <Text tone="secondary">Semua barang di keranjang akan dihapus.</Text>
              <div className="cart-actions">
                <Button onClick={() => setClearOpen(false)}>Tidak</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    resetCart();
                    setClearOpen(false);
                  }}
                >
                  Ya, batal
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {payOpen ? (
        <PayDialog
          total={total}
          settings={settings}
          payMethod={payMethod}
          setPayMethod={setPayMethod}
          cashIn={cashIn}
          setCashIn={setCashIn}
          change={change}
          memberId={memberId}
          setMemberId={setMemberId}
          error={err}
          onClose={() => setPayOpen(false)}
          onPaid={savePay}
        />
      ) : null}
      {!shift ? (
        <div className="overlay extra-overlay">
          <form
            className="modal extra-modal"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                openCashShift({ cashier: session, kasAwal: parseRupiah(kasAwalStr) });
                toast.show("Kasir dibuka", "ok", `Kas awal ${rp(parseRupiah(kasAwalStr))}`);
                onRefresh();
              } catch (err) {
                toast.show("Tidak bisa buka", "error", err instanceof Error ? err.message : "Coba lagi.");
              }
            }}
          >
            <header className="extra-modal-head">
              <div>
                <h2 className="h2">Kas awal</h2>
                <p>Hitung uang di laci sebelum transaksi pertama.</p>
              </div>
            </header>
            {lastShift?.kasHitung != null ? (
              <Text small tone="secondary">
                Tutup terakhir {rp(lastShift.kasHitung)}. Bisa dipakai sebagai acuan.
              </Text>
            ) : null}
            <div className="money-field extra-money">
              <span>Rp</span>
              <input
                className="field"
                autoFocus
                inputMode="numeric"
                placeholder="0"
                value={kasAwalStr}
                onChange={(e) => setKasAwalStr(formatRupiahInput(e.target.value))}
              />
            </div>
            <Button type="submit" variant="primary">
              Buka kasir
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}

function extraMeta(kind: ExtraKind) {
  if (kind === "ongkir") return { title: "Ongkir", hint: "Biaya antar, ditambah ke total" };
  if (kind === "diskon") return { title: "Diskon", hint: "Potongan harga belanja" };
  return { title: "Catatan", hint: "Alamat antar, nama penerima, dll." };
}

function ExtraFillDialog({
  kind,
  subtotal,
  deliveryStr,
  setDeliveryStr,
  discountStr,
  setDiscountStr,
  discMode,
  switchDiscMode,
  note,
  setNote,
  onClear,
  onClose,
}: {
  kind: ExtraKind;
  subtotal: number;
  deliveryStr: string;
  setDeliveryStr: (v: string) => void;
  discountStr: string;
  setDiscountStr: (v: string) => void;
  discMode: "rp" | "pct";
  switchDiscMode: (mode: "rp" | "pct") => void;
  note: string;
  setNote: (v: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const meta = extraMeta(kind);
  const pct = parsePct(discountStr);
  const discRp =
    discMode === "pct" ? Math.min(subtotal, Math.round((subtotal * pct) / 100)) : parseRupiah(discountStr);
  return (
    <div className="overlay extra-overlay" onMouseDown={onClose}>
      <form
        className="modal extra-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <header className="extra-modal-head">
          <span className="extra-modal-ico" aria-hidden>
            <CartExtraIcon name={kind} />
          </span>
          <div>
            <h2 className="h2">{meta.title}</h2>
            <p>{meta.hint}</p>
          </div>
        </header>

        {kind === "diskon" ? (
          <div className="extra-seg" role="group" aria-label="Jenis diskon">
            <button type="button" className={discMode === "rp" ? "on" : ""} onClick={() => switchDiscMode("rp")}>
              Rupiah
            </button>
            <button type="button" className={discMode === "pct" ? "on" : ""} onClick={() => switchDiscMode("pct")}>
              Persen
            </button>
          </div>
        ) : null}

        {kind === "ongkir" ? (
          <div className="money-field extra-money">
            <span>Rp</span>
            <input
              className="field"
              autoFocus
              inputMode="numeric"
              placeholder="0"
              aria-label="Ongkir"
              value={deliveryStr}
              onChange={(e) => setDeliveryStr(formatRupiahInput(e.target.value))}
            />
          </div>
        ) : null}

        {kind === "diskon" ? (
          <>
            <div className="money-field extra-money">
              <span>{discMode === "pct" ? "%" : "Rp"}</span>
              <input
                className="field"
                autoFocus
                inputMode="decimal"
                placeholder="0"
                aria-label="Diskon"
                value={discountStr}
                onChange={(e) =>
                  setDiscountStr(
                    discMode === "pct" ? e.target.value.replace(/[^\d.,]/g, "") : formatRupiahInput(e.target.value),
                  )
                }
              />
            </div>
            {discRp ? (
              <p className="extra-preview">
                {discMode === "pct" ? `Setara ${rp(discRp)}` : `Potongan ${rp(discRp)}`}
              </p>
            ) : (
              <p className="extra-preview muted">Isi nominal atau persen potongan</p>
            )}
          </>
        ) : null}

        {kind === "catatan" ? (
          <textarea
            className="field extra-note"
            autoFocus
            rows={4}
            placeholder="Contoh: Antar ke rumah Bu Siti, belakang masjid"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}

        {kind === "ongkir" ? (
          <p className="extra-preview muted">Kosongkan jika tidak ada biaya antar</p>
        ) : null}

        <div className="extra-actions">
          <Button type="submit" variant="primary">
            Simpan
          </Button>
          <Button type="button" onClick={onClear}>
            Hapus
          </Button>
        </div>
      </form>
    </div>
  );
}

function PayDialog({
  total,
  settings,
  payMethod,
  setPayMethod,
  cashIn,
  setCashIn,
  change,
  memberId,
  setMemberId,
  error,
  onClose,
  onPaid,
}: {
  total: number;
  settings: StoreSettings;
  payMethod: PayMethod;
  setPayMethod: (m: PayMethod) => void;
  cashIn: string;
  setCashIn: (v: string) => void;
  change: number;
  memberId: string | null;
  setMemberId: (id: string | null) => void;
  error: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const methods: { id: PayMethod; hint: string }[] = [
    { id: "tunai", hint: "Cash" },
    { id: "qris", hint: "Scan QR" },
    { id: "transfer", hint: "Bank" },
    { id: "kartu", hint: "Debit / kredit" },
  ];
  const paid = parseRupiah(cashIn);
  const kurang = payMethod === "tunai" && paid < total;
  const bankLine = [settings.bankName.trim(), settings.bankAccount.trim(), settings.bankHolder.trim() ? `a.n. ${settings.bankHolder.trim()}` : ""]
    .filter(Boolean)
    .join(" ");
  const [memberQ, setMemberQ] = useState("");
  const members = listMembers();
  const selected = members.find((m) => m.id === memberId) ?? null;
  const hits = memberQ.trim()
    ? members
        .filter((m) => {
          const s = memberQ.trim().toLowerCase();
          return m.name.toLowerCase().includes(s) || m.phone.includes(s.replace(/\D/g, ""));
        })
        .slice(0, 6)
    : [];

  return (
    <div className="overlay" style={{ position: "fixed", inset: 0 }}>
      <form
        className="modal pay-modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (!kurang) onPaid();
        }}
      >
        <div className="stack">
          <div className="row">
            <H2>Pembayaran</H2>
            <span className="grow" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Tutup
            </Button>
          </div>
          <div className="pay-total">
            <span>Total yang harus dibayar</span>
            <b className="tabular">{rp(total)}</b>
          </div>
          <div className="pay-member">
            {selected ? (
              <div className="pay-member-on">
                <div>
                  <b>{selected.name}</b>
                  <span>
                    {selected.phone} · {memberVisitCount(selected.id)}/{MEMBER_VISIT_GOAL} belanja
                  </span>
                </div>
                <Button type="button" variant="ghost" onClick={() => setMemberId(null)}>
                  Hapus
                </Button>
              </div>
            ) : (
              <>
                <Field
                  placeholder="Member: nama atau telepon (opsional)"
                  value={memberQ}
                  onChange={(e) => setMemberQ(e.target.value)}
                />
                {hits.length ? (
                  <div className="pay-member-hits">
                    {hits.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMemberId(m.id);
                          setMemberQ("");
                        }}
                      >
                        <b>{m.name}</b>
                        <span>{m.phone}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="pay-methods">
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`method-btn ${payMethod === m.id ? "on" : ""}`}
                onClick={() => {
                  setPayMethod(m.id);
                  if (m.id === "tunai" && paid < total) setCashIn(formatRupiahInput(String(total)));
                }}
              >
                <b>{PAY_METHOD_LABEL[m.id]}</b>
                <span>{m.hint}</span>
              </button>
            ))}
          </div>
          {payMethod === "tunai" ? (
            <div className="stack" style={{ gap: 10 }}>
              <Text small tone="secondary">
                Uang tunai diterima
              </Text>
              <div className="money-field">
                <span>Rp</span>
                <input
                  className="field"
                  autoFocus
                  inputMode="numeric"
                  value={cashIn}
                  onChange={(e) => setCashIn(formatRupiahInput(e.target.value))}
                />
              </div>
              <div className="row wrap">
                {[String(total), "50000", "100000", "150000", "200000"]
                  .filter((n, i, arr) => arr.indexOf(n) === i)
                  .map((n) => (
                    <button
                      key={n}
                      className={`tab ${parseRupiah(cashIn) === Number(n) ? "on" : ""}`}
                      type="button"
                      onClick={() => setCashIn(formatRupiahInput(n))}
                    >
                      {rp(Number(n))}
                    </button>
                  ))}
              </div>
              <div className="pay-total">
                <span>Kembalian</span>
                <b className="tabular">{rp(change)}</b>
              </div>
            </div>
          ) : null}
          {payMethod === "qris" ? (
            <Callout title="QRIS">Tampilkan QR ke pelanggan. Setelah berhasil, Simpan.</Callout>
          ) : null}
          {payMethod === "transfer" ? (
            <Callout title="Transfer">
              {bankLine ? `${bankLine}. Konfirmasi setelah dana masuk.` : "Isi rekening di Pengaturan."}
            </Callout>
          ) : null}
          {error ? (
            <Callout title="Tidak bisa disimpan" tone="danger">
              {error}
            </Callout>
          ) : null}
          <div className="pay-actions">
            <Button type="submit" variant="primary" disabled={kurang}>
              Simpan · Enter
            </Button>
            <Button type="button" onClick={onClose}>
              Batal
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function PrintChoiceDialog({
  total,
  printed,
  onPrint,
  onDone,
}: {
  total: number;
  printed: string;
  onPrint: (kind: "58mm" | "A4" | "both") => void;
  onDone: () => void;
}) {
  return (
    <div className="overlay" style={{ position: "fixed", inset: 0 }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="stack">
          <H2>Transaksi tersimpan</H2>
          <Stat value={rp(total)} label="Total" tone="ok" />
          <Text tone="secondary">Pilih cetak struk 58mm atau nota A4.</Text>
          {printed ? (
            <Callout title="Dikirim ke printer" tone="ok">
              {printed}
            </Callout>
          ) : null}
          <Button variant="primary" onClick={() => onPrint("58mm")}>
            Cetak struk 58mm
          </Button>
          <Button onClick={() => onPrint("A4")}>Cetak nota A4</Button>
          <Button onClick={() => onPrint("both")}>Cetak keduanya</Button>
          <Button variant="ghost" onClick={onDone}>
            Selesai
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DraftPage({
  onOpen,
  tick,
}: {
  onOpen: (cart: CartSnapshot) => void;
  tick: number;
}) {
  const [bump, setBump] = useState(0);
  const shown = useMemo(() => listDrafts(), [tick, bump]);
  return (
    <PageShell
      page="draft"
      title="Draft"
      hint="Transaksi ditahan. Buka untuk lanjut bayar di kasir."
    >
      {shown.length === 0 ? (
        <Callout title="Tidak ada draft">Tekan Tahan (F11) di kasir untuk menyimpan keranjang.</Callout>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Kasir</th>
              <th>Catatan</th>
              <th>Item</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} className="striped">
                <td>
                  {new Date(d.createdAt).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td>{d.cashierName}</td>
                <td>{d.note || "—"}</td>
                <td>{d.items.reduce((n, l) => n + l.qty, 0)}</td>
                <td>
                  <div className="row">
                    <Button
                      variant="primary"
                      onClick={() => {
                        onOpen({
                          items: d.items,
                          discount: d.discount,
                          deliveryCost: d.deliveryCost,
                          note: d.note,
                        });
                      }}
                    >
                      Buka
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        deleteDraft(d.id);
                        setBump((n) => n + 1);
                      }}
                    >
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PageShell>
  );
}
